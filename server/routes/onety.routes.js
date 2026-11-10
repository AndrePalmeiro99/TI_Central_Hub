import { Router } from 'express';
import cors from 'cors';
import {
  getOnetyBearerToken,
  ONETY_BACKEND_URL,
  ONETY_EMPRESA_ID,
  ONETY_API_KEY
} from '../services/onetyService.js';
import { authenticateTokenOptional } from '../middleware/auth.js';

export function createOnetyRouter({ pool } = {}) {
  const router = Router();

  // Cache em memória para CNPJ e detalhes de tarefas do Onety
  const taskCnpjCache = new Map();

  // Tarefas completas Processo 62
  router.get('/onety/tarefas-completas', async (req, res) => {
    try {
      const token = await getOnetyBearerToken();
      if (token) {
        const resp = await fetch(`${ONETY_BACKEND_URL}/central-tecnologia/dashboard/detalhes-processo-62?categoria=total`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Empresa-Id': ONETY_EMPRESA_ID,
            'Content-Type': 'application/json'
          }
        });
        if (resp.ok) {
          const rawTasks = await resp.json();
          if (Array.isArray(rawTasks)) {
            // 1. Coleta tarefas pendentes (que ficam no topo da fila e sempre precisam de CNPJ)
            const openTasks = rawTasks.filter(t => t.status !== 'concluída');
            // 2. Coleta as tarefas mais recentes do array
            const recentTasks = rawTasks.slice(-30);
            
            // Agrupa tarefas prioritárias sem duplicar
            const priorityTasksMap = new Map();
            openTasks.forEach(t => priorityTasksMap.set(t.id, t));
            recentTasks.forEach(t => priorityTasksMap.set(t.id, t));
            const tasksToFetch = Array.from(priorityTasksMap.values());

            await Promise.all(tasksToFetch.map(async (t) => {
              if (taskCnpjCache.has(t.id)) {
                const cached = taskCnpjCache.get(t.id);
                t.cliente_cnpj = cached.cnpj;
                t.cnpj = cached.cnpj;
                if (cached.responsavel_nome) t.responsavel_nome = cached.responsavel_nome;
                return;
              }
              try {
                const r = await fetch(`${ONETY_BACKEND_URL}/gestao/tarefas/${t.id}`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Empresa-Id': ONETY_EMPRESA_ID,
                    'Content-Type': 'application/json'
                  }
                });
                if (r.ok) {
                  const detail = await r.json();
                  const foundCnpj = detail.clienteCnpjCpf || detail.cliente?.cnpjCpf || null;
                  const foundResp = detail.responsavelNome || detail.responsavel?.nome || null;
                  taskCnpjCache.set(t.id, { cnpj: foundCnpj, responsavel_nome: foundResp });
                  t.cliente_cnpj = foundCnpj;
                  t.cnpj = foundCnpj;
                  if (foundResp) t.responsavel_nome = foundResp;

                  // Auto-grava no banco para persistir
                  if (foundCnpj) {
                    pool.query(
                      `INSERT INTO tarefa_metadata (id, cnpj, updated_at)
                       VALUES ($1, $2, NOW())
                       ON CONFLICT (id) DO UPDATE SET
                         cnpj = COALESCE(tarefa_metadata.cnpj, EXCLUDED.cnpj),
                         updated_at = NOW()`,
                      [String(t.id), String(foundCnpj).trim()]
                    ).catch(() => {});
                  }
                }
              } catch (_) {}
            }));

            const normalized = rawTasks.map(t => {
              // Extrai CNPJ direto do campo ou tenta padrão 00.000.000/0001-00 do nome
              let foundCnpj = t.cnpj || t.cliente_cnpj || null;
              if (!foundCnpj && t.cliente_nome) {
                const matchCnpj = t.cliente_nome.match(/^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
                if (matchCnpj) foundCnpj = matchCnpj[1];
              }

              return {
                id: t.id,
                assunto: t.assunto || 'CADASTRO DA EMPRESA',
                descricao: t.descricao || '',
                empresa_id: t.empresa_id || 23,
                empresa: {
                  nome: t.cliente_nome || t.empresa_nome || 'N/A',
                  cnpj: foundCnpj,
                  valor_mrr: null,
                  honorario: null
                },
                cliente: {
                  id: t.cliente_id,
                  nome: t.cliente_nome || 'N/A',
                  cnpj: foundCnpj,
                  valor_mrr: null,
                  honorario: null
                },
                franqueado: t.empresa_abriu_processo_nome || t.empresa_nome || 'Matriz',
                responsavel: t.responsavel_nome ? { nome: t.responsavel_nome } : null,
                responsavel_nome: t.responsavel_nome || null,
                data_prazo: t.data_prazo,
                data_criacao: t.criado_em,
                data_conclusao: t.data_conclusao,
                status: t.status === 'concluída' ? 'concluida_no_prazo' : (t.status || 'pendente'),
                comentarios_count: 0,
                anexos_count: 0,
                tarefa_pai_id: t.tarefa_pai_id || null,
                pr_id: t.tarefa_pai_id || null
              };
            });
            return res.json(normalized);
          }
        }
      }
      res.json([]);
    } catch (err) {
      console.error('[Onety API] Erro ao buscar tarefas completas:', err.message);
      res.json([]);
    }
  });

  // Métricas TV (Processo 62)
  const tvHandler = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    try {
      const token = await getOnetyBearerToken();
      if (!token) {
        return res.status(500).json({ error: 'Falha na autenticação com a API Onety.' });
      }

      const resp = await fetch(`${ONETY_BACKEND_URL}/central-tecnologia/dashboard/detalhes-processo-62?categoria=total`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Empresa-Id': ONETY_EMPRESA_ID,
          'Content-Type': 'application/json'
        }
      });

      if (!resp.ok) {
        return res.status(resp.status).json({ error: 'Erro ao consultar tarefas no Onety.' });
      }

      const rawTasks = await resp.json();
      if (!Array.isArray(rawTasks)) {
        return res.status(502).json({ error: 'Resposta inválida do Onety.' });
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const mes_nome = `${monthNames[currentMonth]} de ${currentYear}`;

      const validTasks = rawTasks.filter(t => {
        const s = (t.status || '').toLowerCase();
        const a = (t.assunto || '').toLowerCase();
        const d = (t.descricao || '').toLowerCase();
        const isIgnored = s.includes('cancel') || s.includes('distrato') || s.includes('reprov') ||
                          a.includes('cancel') || a.includes('distrato') || a.includes('reprov') ||
                          d.includes('cancel') || d.includes('distrato') || d.includes('reprov');
        return !isIgnored;
      });

      let total_mes = 0;
      let concluidas = 0;
      let pendentes = 0;
      let atrasadas = 0;
      const lista_atrasadas = [];

      validTasks.forEach(t => {
        const createdAt = t.criado_em ? new Date(t.criado_em) : null;
        const concludedAt = t.data_conclusao ? new Date(t.data_conclusao) : null;
        const deadline = t.data_prazo ? new Date(t.data_prazo) : null;
        const isCompleted = (t.status || '').toLowerCase() === 'concluída';

        if (createdAt && createdAt.getFullYear() === currentYear && createdAt.getMonth() === currentMonth) {
          total_mes++;
        }

        if (isCompleted) {
          if (concludedAt && concludedAt.getFullYear() === currentYear && concludedAt.getMonth() === currentMonth) {
            concluidas++;
          } else if (!concludedAt && createdAt && createdAt.getFullYear() === currentYear && createdAt.getMonth() === currentMonth) {
            concluidas++;
          }
        } else {
          const horasAbertas = createdAt ? (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60) : 0;
          const isAtrasada = horasAbertas > 24 || (deadline && now > deadline);

          if (isAtrasada) {
            atrasadas++;
            let diasAtraso = 1;
            if (deadline && now > deadline) {
              diasAtraso = Math.max(1, Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)));
            } else if (createdAt) {
              diasAtraso = Math.max(1, Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
            }

            const dataAberturaStr = createdAt
              ? createdAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
              : 'N/A';

            lista_atrasadas.push({
              id: t.id,
              empresa_nome: (t.cliente_nome || t.empresa_nome || 'EMPRESA SEM NOME').trim(),
              data_abertura: dataAberturaStr,
              responsavel: (t.responsavel_nome || 'Não atribuído').trim(),
              dias_atraso: diasAtraso
            });
          } else {
            pendentes++;
          }
        }
      });

      lista_atrasadas.sort((a, b) => b.dias_atraso - a.dias_atraso);

      return res.json({
        mes_nome,
        total_mes,
        pendentes,
        atrasadas,
        concluidas,
        lista_atrasadas
      });
    } catch (err) {
      console.error('[API TV] Erro ao gerar métricas para TV:', err.message);
      return res.status(500).json({ error: 'Erro interno ao processar métricas de TV.' });
    }
  };

  router.options('/cadastro-empresa-tv', cors());
  router.get('/cadastro-empresa-tv', tvHandler);
  router.options('/onety/cadastro-empresa-tv', cors());
  router.get('/onety/cadastro-empresa-tv', tvHandler);

  // Detalhes da tarefa + Tarefa Pai + Anexos
  router.get('/onety/tarefa-detalhes/:id', async (req, res) => {
    const taskId = req.params.id;
    try {
      const token = await getOnetyBearerToken();
      const headers = {
        'Authorization': `Bearer ${token}`,
        'X-Empresa-Id': ONETY_EMPRESA_ID,
        'Content-Type': 'application/json'
      };

      let mainTask = await fetch(`${ONETY_BACKEND_URL}/gestao/tarefas/${taskId}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);

      if (!mainTask) {
        return res.status(404).json({ error: 'Tarefa não encontrada.' });
      }

      const prId = mainTask.tarefa_pai_id || (mainTask.processo_id === 61 ? mainTask.id : null);
      let prTask = null;
      let atvsPr = [];

      if (prId && prId !== mainTask.id) {
        prTask = await fetch(`${ONETY_BACKEND_URL}/gestao/tarefas/${prId}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);

        atvsPr = await fetch(`${ONETY_BACKEND_URL}/gestao/tarefas/${prId}/atividades-com-status`, { headers })
          .then(r => r.ok ? r.json() : [])
          .catch(() => []);
      } else {
        atvsPr = await fetch(`${ONETY_BACKEND_URL}/gestao/tarefas/${taskId}/atividades-com-status`, { headers })
          .then(r => r.ok ? r.json() : [])
          .catch(() => []);
      }

      const anexosFinais = [];
      let hasContratoAnexado = false;

      if (Array.isArray(atvsPr) && atvsPr.length > 0) {
        for (const atv of atvsPr) {
          const atvId = atv.atividadeTarefaId;
          const txt = (atv.texto || atv.nome || atv.descricao || '').toUpperCase();
          const isAceiteAtv = txt.includes('ACEITE') || txt.includes('PROPOSTA') || atv.ordem === 1;

          if (atvId) {
            const files = await fetch(`${ONETY_BACKEND_URL}/gestao/tarefas/atividade/${atvId}/anexos`, { headers })
              .then(r => r.ok ? r.json() : [])
              .catch(() => []);

            if (Array.isArray(files) && files.length > 0) {
              for (const f of files) {
                const fileObj = {
                  id: f.id,
                  nome: f.nome_arquivo || f.nome || 'Documento sem nome',
                  url: `/api/onety/anexo/${f.id}/download`,
                  atividade: atv.texto || 'Atividade',
                  criado_em: f.criado_em
                };
                anexosFinais.push(fileObj);

                if (isAceiteAtv) {
                  hasContratoAnexado = true;
                }
              }
            }
          }

          if (isAceiteAtv && (atv.concluida === 1 || atv.concluida === true)) {
            hasContratoAnexado = true;
          }
        }
      }

      const finalCnpj = mainTask.clienteCnpjCpf || mainTask.cliente?.cnpjCpf || mainTask.cnpj || null;

      res.json({
        ...mainTask,
        cnpj: finalCnpj,
        cliente_cnpj: finalCnpj,
        pr_id: prId,
        pr_task: prTask,
        tem_contrato_anexado: hasContratoAnexado,
        atividades: atvsPr,
        anexos: anexosFinais
      });
    } catch (err) {
      console.error('[Onety Detalhes] Erro ao buscar detalhes e anexos:', err.message);
      res.status(500).json({ error: 'Erro ao buscar detalhes da tarefa.' });
    }
  });

  // Download de anexo
  router.get('/onety/anexo/:id/download', async (req, res) => {
    try {
      const token = await getOnetyBearerToken();
      const anexoId = req.params.id;
      const resp = await fetch(`${ONETY_BACKEND_URL}/gestao/tarefas/anexo/${anexoId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Empresa-Id': ONETY_EMPRESA_ID
        }
      });

      if (!resp.ok) {
        return res.status(resp.status).send('Anexo não encontrado.');
      }

      const contentType = resp.headers.get('content-type') || 'application/octet-stream';
      const contentDisposition = resp.headers.get('content-disposition');

      res.setHeader('Content-Type', contentType);
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
      }

      const arrayBuffer = await resp.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      console.error('[Onety Download] Erro ao baixar anexo:', err.message);
      res.status(500).send('Erro ao baixar anexo.');
    }
  });

  return router;
}

export function createOnetyProxy() {
  const router = Router();
  router.use('/', authenticateTokenOptional, async (req, res) => {
    try {
      const targetUrl = `${ONETY_BACKEND_URL}${req.url}`;
      const headers = { 'Content-Type': 'application/json' };

      // Endpoints externos exigem estritamente x-api-key
      const isExternalEndpoint = req.url.includes('-externo') || req.url.includes('/externo');

      if (isExternalEndpoint && ONETY_API_KEY) {
        headers['x-api-key'] = ONETY_API_KEY;
        headers['X-Empresa-Id'] = ONETY_EMPRESA_ID;
      } else {
        const bearerToken = await getOnetyBearerToken();
        if (bearerToken) {
          headers['Authorization'] = `Bearer ${bearerToken}`;
          headers['X-Empresa-Id'] = ONETY_EMPRESA_ID;
        } else if (ONETY_API_KEY) {
          headers['x-api-key'] = ONETY_API_KEY;
          headers['X-Empresa-Id'] = ONETY_EMPRESA_ID;
        }
      }

      const fetchOptions = {
        method: req.method,
        headers
      };
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }
      const response = await fetch(targetUrl, fetchOptions);

      if (!response.ok) {
        return res.status(200).json([]);
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(200).json([]);
    }
  });
  return router;
}

