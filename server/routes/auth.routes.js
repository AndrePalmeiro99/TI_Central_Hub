import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';

export function createAuthRouter({ pool, smtpTransporter, memoryStore, PORT }) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Muitas solicitações de redefinição. Tente novamente em 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    try {
      const userRes = await pool.query('SELECT * FROM user_profiles WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        return res.status(400).json({ error: 'Credenciais inválidas.' });
      }

      const user = userRes.rows[0];
      const validPassword = user.password_hash
        ? await bcrypt.compare(password, user.password_hash)
        : false;

      if (!validPassword) {
        return res.status(400).json({ error: 'Credenciais inválidas.' });
      }

      const effectiveRole = (!user.role || user.role === 'user') ? 'collaborator' : user.role;

      const token = jwt.sign(
        { id: user.id, email: user.email, role: effectiveRole },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name || user.email,
          role: effectiveRole,
          is_approved: true
        },
        access_token: token
      });
    } catch (err) {
      console.error('Erro no login:', err);
      res.status(500).json({ error: 'Erro interno ao processar login.' });
    }
  });

  router.post('/register', loginLimiter, async (req, res) => {
    const { email, password, name } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });

    try {
      const existing = await pool.query('SELECT id, full_name, email FROM user_profiles WHERE email = $1', [email]);
      let user;

      if (existing.rows.length > 0) {
        user = existing.rows[0];
        const updatedRole = (!user.role || user.role === 'user') ? 'collaborator' : user.role;
        await pool.query(
          'UPDATE user_profiles SET role = $1, is_approved = TRUE, full_name = COALESCE($2, full_name) WHERE id = $3',
          [updatedRole, name ? name.trim() : null, user.id]
        );
        user.role = updatedRole;
        if (name) user.full_name = name.trim();
      } else {
        const userId = randomUUID();
        const insertRes = await pool.query(
          `INSERT INTO user_profiles (id, email, full_name, role, is_approved)
           VALUES ($1, $2, $3, 'collaborator', TRUE) RETURNING id, email, full_name, role, is_approved`,
          [userId, email.trim().toLowerCase(), name ? name.trim() : email.split('@')[0]]
        );
        user = insertRes.rows[0];
      }

      if (password) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await pool.query('UPDATE user_profiles SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);
      }

      const resetToken = jwt.sign(
        { id: user.id, email: user.email, type: 'reset' },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      const host = req.get('origin') || req.get('referer') || `http://localhost:${PORT}`;
      const cleanHost = host.replace(/\/$/, '');
      const setupLink = `${cleanHost}/?reset_token=${resetToken}`;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER || '"TI Central Hub" <no-reply@cfcontabilidade.com>',
        to: user.email,
        subject: 'Ativação de Acesso - Definir Senha | TI Central Hub',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="background: #10b981; width: 48px; height: 48px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; color: #fff;">V</div>
              <h2 style="color: #fff; margin: 12px 0 4px;">Bem-vindo ao TI Central Hub!</h2>
              <p style="color: #94a3b8; font-size: 13px; margin: 0;">Plataforma de Gestão Operacional & BI Executivo</p>
            </div>
            <p style="color: #cbd5e1; font-size: 15px;">Olá, <strong>${user.full_name || 'Colaborador'}</strong>!</p>
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
              Seu acesso à plataforma TI Central Hub foi criado. Para concluir o cadastro e definir sua senha de acesso, clique no botão abaixo:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${setupLink}" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                Definir Minha Senha
              </a>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
              Este link é seguro e expira em <strong>2 horas</strong>. Caso o botão não funcione, cole o link abaixo no navegador:<br>
              <a href="${setupLink}" style="color: #10b981; word-break: break-all;">${setupLink}</a>
            </p>
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0;">
            <p style="color: #475569; font-size: 11px; text-align: center; margin: 0;">
              CF Contabilidade — Central de Tecnologia & Inovação<br>
              Se você não solicitou este acesso, ignore esta mensagem com segurança.
            </p>
          </div>
        `
      };

      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          await smtpTransporter.sendMail(mailOptions);
        } catch (mailErr) {
          console.error('[SMTP] Erro ao enviar email de ativação:', mailErr.message);
        }
      }

      res.status(201).json({
        message: 'Acesso criado com sucesso! Um e-mail com as instruções para definir a senha foi enviado.',
        user: { id: user.id, email: user.email, name: user.full_name, role: user.role, is_approved: true }
      });
    } catch (err) {
      console.error('Erro no registro de colaborador:', err);
      res.status(500).json({ error: 'Erro ao cadastrar colaborador.' });
    }
  });

  router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });

    try {
      const userRes = await pool.query('SELECT id, email, full_name FROM user_profiles WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        return res.json({ message: 'Se o e-mail estiver cadastrado, um link de recuperação será enviado.' });
      }

      const user = userRes.rows[0];
      const resetToken = jwt.sign(
        { id: user.id, email: user.email, type: 'reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const host = req.get('origin') || req.get('referer') || `http://localhost:${PORT}`;
      const cleanHost = host.replace(/\/$/, '');
      const resetLink = `${cleanHost}/?reset_token=${resetToken}`;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER || '"TI Central Hub" <no-reply@cfcontabilidade.com>',
        to: user.email,
        subject: 'Recuperação de Senha — TI Central Hub',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="background: #10b981; width: 48px; height: 48px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; color: #fff;">V</div>
              <h2 style="color: #fff; margin: 12px 0 4px;">Recuperação de Acesso</h2>
              <p style="color: #94a3b8; font-size: 13px; margin: 0;">TI Central Hub</p>
            </div>
            <p style="color: #cbd5e1; font-size: 15px;">Olá, <strong>${user.full_name || 'Colaborador'}</strong>!</p>
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
              Recebemos uma solicitação para redefinir a senha da sua conta. Se foi você, clique no botão abaixo para cadastrar uma nova senha:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                Redefinir Minha Senha
              </a>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
              Este link expira em <strong>1 hora</strong>. Caso o botão não funcione, cole o link abaixo no navegador:<br>
              <a href="${resetLink}" style="color: #10b981; word-break: break-all;">${resetLink}</a>
            </p>
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0;">
            <p style="color: #475569; font-size: 11px; text-align: center; margin: 0;">
              Se você não solicitou a redefinição de senha, ignore este e-mail com segurança. Sua senha atual permanecerá inalterada.
            </p>
          </div>
        `
      };

      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[SMTP] Credenciais não configuradas. Link de recuperação para teste:', resetLink);
        return res.json({ message: 'Se o e-mail estiver cadastrado, um link de recuperação será enviado.' });
      }

      await smtpTransporter.sendMail(mailOptions);
      res.json({ message: 'Se o e-mail estiver cadastrado, um link de recuperação será enviado.' });
    } catch (err) {
      console.error('Erro na solicitação de recuperação de senha:', err);
      res.status(500).json({ error: 'Erro ao processar recuperação de senha.' });
    }
  });

  router.post('/reset-password', async (req, res) => {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    try {
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (jwtErr) {
        return res.status(400).json({ error: 'Link de redefinição inválido ou expirado. Solicite um novo link.' });
      }

      if (decoded.type !== 'reset') {
        return res.status(400).json({ error: 'Token inválido para esta operação.' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      const updateRes = await pool.query(
        `UPDATE user_profiles 
         SET password_hash = $1, is_approved = TRUE, updated_at = NOW() 
         WHERE id = $2 RETURNING id, email, full_name, role`,
        [hashedPassword, decoded.id]
      );

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      res.json({ success: true, message: 'Senha atualizada com sucesso! Você já pode fazer login com a nova senha.' });
    } catch (err) {
      console.error('Erro ao redefinir senha:', err);
      res.status(500).json({ error: 'Erro interno ao redefinir senha.' });
    }
  });

  router.put('/profile', authenticateToken, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 80 caracteres.' });
    }
    try {
      const r = await pool.query(
        'UPDATE user_profiles SET full_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, role',
        [name, req.user.id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
      res.json({ user: { ...r.rows[0], name: r.rows[0].full_name } });
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err);
      res.status(500).json({ error: 'Erro ao atualizar perfil.' });
    }
  });

  router.post('/change-password', authenticateToken, async (req, res) => {
    if (req.user?.role !== 'manager') {
      return res.status(403).json({ error: 'Apenas gerentes podem alterar a senha por aqui.' });
    }
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password || String(new_password).length < 6) {
      return res.status(400).json({ error: 'Informe a senha atual e uma nova senha com no mínimo 6 caracteres.' });
    }
    try {
      const r = await pool.query('SELECT password_hash, role FROM user_profiles WHERE id = $1', [req.user.id]);
      const u = r.rows[0];
      if (!u || u.role !== 'manager') return res.status(403).json({ error: 'Acesso negado.' });
      const ok = u.password_hash ? await bcrypt.compare(current_password, u.password_hash) : false;
      if (!ok) return res.status(400).json({ error: 'Senha atual incorreta.' });
      const hashed = await bcrypt.hash(new_password, await bcrypt.genSalt(10));
      await pool.query('UPDATE user_profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashed, req.user.id]);
      res.json({ success: true, message: 'Senha alterada com sucesso!' });
    } catch (err) {
      console.error('Erro ao trocar senha:', err);
      res.status(500).json({ error: 'Erro ao alterar senha.' });
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('session_token');
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  });

  return router;
}

