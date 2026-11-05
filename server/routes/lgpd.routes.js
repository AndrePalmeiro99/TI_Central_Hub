import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth.js';

export function createLgpdRouter({ pool }) {
  const router = Router();

  router.get('/meus-dados', authenticateToken, async (req, res) => {
    try {
      const userRes = await pool.query(
        'SELECT id, email, full_name, role, is_approved, updated_at FROM user_profiles WHERE id = $1',
        [req.user.id]
      );
      const audits = await pool.query(
        'SELECT id, tarefa_id, empresa, old_value, new_value, created_at FROM audit_log WHERE changed_by = $1 ORDER BY id DESC LIMIT 200',
        [req.user.email]
      );

      res.json({
        titular: userRes.rows[0] || null,
        trilha_atividades: audits.rows || [],
        gerado_em: new Date().toISOString(),
        aviso_legal: 'Exportação em conformidade com o Artigo 18 da Lei Geral de Proteção de Dados (LGPD).'
      });
    } catch (err) {
      console.error('[LGPD] Erro ao exportar dados do titular:', err);
      res.status(500).json({ error: 'Erro ao coletar dados para exportação.' });
    }
  });

  router.post('/anonimizar', authenticateToken, async (req, res) => {
    try {
      const anonName = `Anonimizado_${randomUUID().substring(0, 8)}`;
      const anonEmail = `anonimo_${randomUUID().substring(0, 8)}@privacidade.local`;

      await pool.query(
        `UPDATE user_profiles 
         SET full_name = $1, email = $2, password_hash = NULL, is_approved = FALSE, updated_at = NOW() 
         WHERE id = $3`,
        [anonName, anonEmail, req.user.id]
      );

      try {
        await pool.query(
          `INSERT INTO audit_log (tarefa_id, empresa, changed_by, old_value, new_value)
           VALUES ($1, $2, $3, $4, $5)`,
          ['LGPD', 'SISTEMA', 'DPO/LGPD', req.user.email, 'CONTA_ANONIMIZADA']
        );
      } catch (_) {}

      res.clearCookie('session_token');
      res.json({
        success: true,
        message: 'Dados anonimizados com sucesso em conformidade com o Art. 18 da LGPD.'
      });
    } catch (err) {
      console.error('[LGPD] Erro ao anonimizar conta:', err);
      res.status(500).json({ error: 'Erro ao processar solicitação de anonimização.' });
    }
  });

  return router;
}

