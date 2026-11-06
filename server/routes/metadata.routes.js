import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

export function createMetadataRouter({ pool, memoryStore }) {
  const router = Router();

  // Tarefa Metadata
  router.get('/tarefa-metadata', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM tarefa_metadata');
      res.json(result.rows);
    } catch (err) {
      res.json(Object.values(memoryStore.tarefa_metadata));
    }
  });

  router.post('/tarefa-metadata', authenticateToken, async (req, res) => {
    const {
      id,
      empresa_codigo,
      cnpj,
      observacoes,
      contrato_aceite,
      franquia_override,
      sistema_override,
      detalhe_base_override,
      honorario,
      is_backoffice,
      is_cancelled,
      colaborador_override,
      status_override
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO tarefa_metadata (
          id, empresa_codigo, cnpj, observacoes, contrato_aceite, franquia_override,
          sistema_override, detalhe_base_override, honorario, is_backoffice, is_cancelled,
          colaborador_override, status_override, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (id) DO UPDATE SET
          empresa_codigo = COALESCE(EXCLUDED.empresa_codigo, tarefa_metadata.empresa_codigo),
          cnpj = COALESCE(EXCLUDED.cnpj, tarefa_metadata.cnpj),
          observacoes = COALESCE(EXCLUDED.observacoes, tarefa_metadata.observacoes),
          contrato_aceite = COALESCE(EXCLUDED.contrato_aceite, tarefa_metadata.contrato_aceite),
          franquia_override = COALESCE(EXCLUDED.franquia_override, tarefa_metadata.franquia_override),
          sistema_override = COALESCE(EXCLUDED.sistema_override, tarefa_metadata.sistema_override),
          detalhe_base_override = COALESCE(EXCLUDED.detalhe_base_override, tarefa_metadata.detalhe_base_override),
          honorario = COALESCE(EXCLUDED.honorario, tarefa_metadata.honorario),
          is_backoffice = COALESCE(EXCLUDED.is_backoffice, tarefa_metadata.is_backoffice),
          is_cancelled = COALESCE(EXCLUDED.is_cancelled, tarefa_metadata.is_cancelled),
          colaborador_override = COALESCE(EXCLUDED.colaborador_override, tarefa_metadata.colaborador_override),
          status_override = COALESCE(EXCLUDED.status_override, tarefa_metadata.status_override),
          updated_at = NOW()
        RETURNING *`,
        [
          id,
          empresa_codigo,
          cnpj,
          observacoes,
          contrato_aceite,
          franquia_override,
          sistema_override,
          detalhe_base_override,
          honorario,
          is_backoffice,
          is_cancelled,
          colaborador_override,
          status_override
        ]
      );
      res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('[DB Error /api/tarefa-metadata POST]:', err.message);
      memoryStore.tarefa_metadata[id] = {
        id,
        empresa_codigo,
        cnpj,
        observacoes,
        contrato_aceite,
        franquia_override,
        sistema_override,
        detalhe_base_override,
        honorario,
        is_backoffice,
        is_cancelled,
        colaborador_override,
        status_override,
        updated_at: new Date().toISOString()
      };
      res.status(200).json(memoryStore.tarefa_metadata[id]);
    }
  });

  // Franchise Royalties
  router.get('/franchise-royalties', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM franchise_royalties_config');
      res.json(result.rows);
    } catch (err) {
      res.json(memoryStore.franchise_royalties_config || []);
    }
  });

  router.post('/franchise-royalties', authenticateToken, async (req, res) => {
    const { franchise_name, base_assigned } = req.body;
    const created_by = req.user?.email || 'sistema';

    try {
      const result = await pool.query(
        `INSERT INTO franchise_royalties_config (franchise_name, base_assigned, created_by, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (franchise_name) DO UPDATE SET
           base_assigned = EXCLUDED.base_assigned,
           created_by = EXCLUDED.created_by
         RETURNING *`,
        [franchise_name, base_assigned, created_by]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.warn('Erro ao salvar no postgres franchise-royalties, salvando em memória:', err.message);
      const existingIdx = memoryStore.franchise_royalties_config.findIndex(f => f.franchise_name === franchise_name);
      const item = { id: Date.now(), franchise_name, base_assigned, created_by, created_at: new Date().toISOString() };
      if (existingIdx >= 0) {
        memoryStore.franchise_royalties_config[existingIdx] = item;
      } else {
        memoryStore.franchise_royalties_config.push(item);
      }
      res.json(item);
    }
  });

  router.post('/admin/ti/royalties', authenticateToken, requireAdmin, async (req, res) => {
    const { configs } = req.body;
    if (!Array.isArray(configs)) {
      return res.status(400).json({ error: 'Formato inválido. Esperado array "configs".' });
    }

    const created_by = req.user?.email || 'admin';
    const results = [];

    try {
      for (const item of configs) {
        if (!item.franchise_name) continue;
        const resDb = await pool.query(
          `INSERT INTO franchise_royalties_config (franchise_name, base_assigned, created_by, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (franchise_name) DO UPDATE SET
             base_assigned = EXCLUDED.base_assigned,
             created_by = EXCLUDED.created_by
           RETURNING *`,
          [item.franchise_name, item.base_assigned || null, created_by]
        );
        results.push(resDb.rows[0]);
      }
      res.json({ success: true, count: results.length, data: results });
    } catch (err) {
      console.error('Erro ao atualizar base de royalties no banco:', err);
      configs.forEach(item => {
        if (!item.franchise_name) return;
        const idx = memoryStore.franchise_royalties_config.findIndex(f => f.franchise_name === item.franchise_name);
        const memItem = {
          id: Date.now(),
          franchise_name: item.franchise_name,
          base_assigned: item.base_assigned || null,
          created_by,
          created_at: new Date().toISOString()
        };
        if (idx >= 0) memoryStore.franchise_royalties_config[idx] = memItem;
        else memoryStore.franchise_royalties_config.push(memItem);
        results.push(memItem);
      });
      res.json({ success: true, count: results.length, data: results, fallback: true });
    }
  });

  return router;
}

