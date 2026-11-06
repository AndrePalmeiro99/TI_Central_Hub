import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

export function createAdminRouter({ pool, memoryStore }) {
  const router = Router();

  // Audit Logs
  router.get('/audit-logs', authenticateToken, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { tarefa_id } = req.query;
    try {
      let result;
      if (tarefa_id) {
        result = await pool.query('SELECT * FROM audit_log WHERE tarefa_id = $1 ORDER BY id DESC', [tarefa_id]);
      } else {
        result = await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [limit]);
      }
      res.json(result.rows);
    } catch (err) {
      if (tarefa_id) {
        res.json(memoryStore.audit_log.filter(l => String(l.tarefa_id) === String(tarefa_id)));
      } else {
        res.json(memoryStore.audit_log.slice(-limit));
      }
    }
  });

  router.post('/audit-logs', authenticateToken, async (req, res) => {
    const { tarefa_id, empresa, old_value, new_value } = req.body;
    const changed_by = req.user?.email || 'sistema';

    try {
      const result = await pool.query(
        `INSERT INTO audit_log (tarefa_id, empresa, changed_by, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tarefa_id, empresa, changed_by, old_value, new_value]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      const newEntry = {
        id: Date.now(),
        tarefa_id,
        empresa,
        changed_by,
        old_value,
        new_value,
        created_at: new Date().toISOString()
      };
      memoryStore.audit_log.unshift(newEntry);
      res.status(201).json(newEntry);
    }
  });

  // Team performance
  router.get('/team-performance', authenticateToken, async (req, res) => {
    const sinceRaw = req.query.since ? new Date(req.query.since) : new Date(0);
    const since = isNaN(sinceRaw.getTime()) ? new Date(0) : sinceRaw;

    try {
      const query = `
        WITH pontos_por_email AS (
          SELECT
            LOWER(TRIM(changed_by)) AS email_norm,
            COUNT(*)::int AS pontos
          FROM audit_log
          WHERE
            changed_by IS NOT NULL
            AND TRIM(changed_by) != ''
            AND LOWER(TRIM(changed_by)) != 'sistema'
            AND (old_value IS NULL OR TRIM(old_value) = '' OR TRIM(old_value) = 'N/A')
            AND new_value IS NOT NULL
            AND TRIM(new_value) != ''
            AND TRIM(new_value) != 'N/A'
            AND created_at >= $1
          GROUP BY LOWER(TRIM(changed_by))
        )
        SELECT
          p.pontos,
          COALESCE(u.full_name, split_part(p.email_norm, '@', 1)) AS colaborador,
          COALESCE(u.email, p.email_norm) AS email
        FROM pontos_por_email p
        LEFT JOIN user_profiles u
          ON LOWER(TRIM(u.email)) = p.email_norm
        ORDER BY p.pontos DESC, colaborador ASC;
      `;
      const result = await pool.query(query, [since]);
      res.json(result.rows);
    } catch (err) {
      console.error('Erro ao calcular performance da equipe:', err);
      res.json([]);
    }
  });

  // TI Logs
  router.get('/admin/ti/logs', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200');
      res.json(result.rows);
    } catch (err) {
      res.json(memoryStore.audit_log.slice(-200));
    }
  });

  // Users Management
  router.get('/admin/ti/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, email, full_name, role, is_approved, updated_at FROM user_profiles ORDER BY updated_at DESC'
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar usuários.' });
    }
  });

  router.post('/admin/ti/users', authenticateToken, requireAdmin, async (req, res) => {
    const { email, password, full_name, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanRole = ['administrator', 'manager', 'collaborator', 'guest', 'ghost'].includes(role) ? role : 'collaborator';
    const cleanName = full_name ? String(full_name).trim() : cleanEmail.split('@')[0];

    try {
      const existing = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [cleanEmail]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'E-mail já cadastrado.' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const result = await pool.query(
        `INSERT INTO user_profiles (id, email, password_hash, full_name, role, is_approved, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
         RETURNING id, email, full_name, role, is_approved, updated_at`,
        [crypto.randomUUID(), cleanEmail, hashedPassword, cleanName, cleanRole]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Erro ao criar usuário:', err);
      res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
    }
  });

  router.delete('/admin/ti/users', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID obrigatório.' });
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
    }
    try {
      const target = await pool.query('SELECT role, email FROM user_profiles WHERE id = $1', [id]);
      if (target.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (target.rows[0].role === 'administrator') {
        const admins = await pool.query("SELECT COUNT(*)::int AS total FROM user_profiles WHERE role = 'administrator'");
        if (admins.rows[0].total <= 1) {
          return res.status(400).json({ error: 'Não é possível excluir o único administrador do sistema.' });
        }
      }
      await pool.query('DELETE FROM user_profiles WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Erro ao deletar usuário:', err);
      res.status(500).json({ error: 'Erro ao deletar usuário.' });
    }
  });

  router.put('/admin/ti/users', authenticateToken, requireAdmin, async (req, res) => {
    const { id, full_name, email, role, is_approved, password } = req.body;
    if (!id) return res.status(400).json({ error: 'ID obrigatório.' });

    try {
      const target = await pool.query('SELECT role, email FROM user_profiles WHERE id = $1', [id]);
      if (target.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

      if (id === req.user.id && role && role !== 'administrator') {
        return res.status(400).json({ error: 'Você não pode rebaixar seu próprio papel de administrador.' });
      }

      if (target.rows[0].role === 'administrator' && role && role !== 'administrator') {
        const admins = await pool.query("SELECT COUNT(*)::int AS total FROM user_profiles WHERE role = 'administrator'");
        if (admins.rows[0].total <= 1) {
          return res.status(400).json({ error: 'Deve haver pelo menos um administrador no sistema.' });
        }
      }

      if (email) {
        const cleanEmail = String(email).trim().toLowerCase();
        const existing = await pool.query('SELECT id FROM user_profiles WHERE email = $1 AND id != $2', [cleanEmail, id]);
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'E-mail já está em uso por outro usuário.' });
        }
      }

      let query = `UPDATE user_profiles SET updated_at = NOW()`;
      const values = [];
      let idx = 1;

      if (full_name !== undefined) {
        query += `, full_name = $${idx++}`;
        values.push(String(full_name).trim());
      }
      if (email !== undefined) {
        query += `, email = $${idx++}`;
        values.push(String(email).trim().toLowerCase());
      }
      if (role !== undefined) {
        const cleanRole = ['administrator', 'manager', 'collaborator', 'guest', 'ghost'].includes(role) ? role : 'collaborator';
        query += `, role = $${idx++}`;
        values.push(cleanRole);
      }
      if (is_approved !== undefined) {
        query += `, is_approved = $${idx++}`;
        values.push(Boolean(is_approved));
      }
      if (password && String(password).trim().length >= 6) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password.trim(), salt);
        query += `, password_hash = $${idx++}`;
        values.push(hashedPassword);
      }

      query += ` WHERE id = $${idx} RETURNING id, email, full_name, role, is_approved, updated_at`;
      values.push(id);

      const result = await pool.query(query, values);
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Erro ao editar usuário:', err);
      res.status(500).json({ error: 'Erro ao editar usuário.' });
    }
  });

  router.post('/admin/ti/users/role', authenticateToken, requireAdmin, async (req, res) => {
    const { target_user_id, new_role, is_approved } = req.body;
    if (!target_user_id) return res.status(400).json({ error: 'ID do usuário obrigatório.' });

    const validRoles = ['administrator', 'manager', 'collaborator', 'guest', 'ghost'];
    if (new_role && !validRoles.includes(new_role)) {
      return res.status(400).json({ error: `Papel inválido. Permitidos: ${validRoles.join(', ')}` });
    }

    try {
      const target = await pool.query('SELECT role, email FROM user_profiles WHERE id = $1', [target_user_id]);
      if (target.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

      if (target_user_id === req.user.id && new_role && new_role !== 'administrator') {
        return res.status(400).json({ error: 'Você não pode rebaixar seu próprio papel de administrador.' });
      }

      if (target.rows[0].role === 'administrator' && new_role && new_role !== 'administrator') {
        const admins = await pool.query("SELECT COUNT(*)::int AS total FROM user_profiles WHERE role = 'administrator'");
        if (admins.rows[0].total <= 1) {
          return res.status(400).json({ error: 'Deve haver pelo menos um administrador no sistema.' });
        }
      }

      const result = await pool.query(
        'UPDATE user_profiles SET role = $1, is_approved = $2, updated_at = NOW() WHERE id = $3 RETURNING id, email, full_name, role, is_approved',
        [new_role || target.rows[0].role, is_approved !== undefined ? is_approved : true, target_user_id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Erro ao alterar role do usuário:', err);
      res.status(500).json({ error: 'Erro interno ao atualizar usuário.' });
    }
  });

  // Bases Management
  // Mapeamento franquia -> base persistido em franchise_royalties_config (base_assigned)
  router.get('/admin/ti/bases', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, franchise_name, base_assigned, updated_at FROM franchise_royalties_config ORDER BY franchise_name ASC'
      );
      res.json(result.rows);
    } catch (err) {
      console.warn('Erro ao buscar mapeamento de bases:', err.message);
      res.json([]);
    }
  });

  router.post('/admin/ti/bases', authenticateToken, requireAdmin, async (req, res) => {
    const franchise_name = (req.body?.franchise_name || '').trim().toUpperCase();
    const base_assigned = req.body?.base_assigned || null;
    if (!franchise_name) return res.status(400).json({ error: 'franchise_name obrigatório.' });
    try {
      const result = await pool.query(
        `INSERT INTO franchise_royalties_config (franchise_name, base_assigned, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (franchise_name) DO UPDATE SET
           base_assigned = EXCLUDED.base_assigned,
           updated_at = NOW()
         RETURNING id, franchise_name, base_assigned, updated_at`,
        [franchise_name, base_assigned]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/admin/ti/bases', authenticateToken, requireAdmin, async (req, res) => {
    const id = req.query?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: 'id obrigatório.' });
    try {
      // Não remove a linha (preserva dados de royalties); apenas desvincula a base
      await pool.query(
        `UPDATE franchise_royalties_config SET base_assigned = 'Sem Base', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

