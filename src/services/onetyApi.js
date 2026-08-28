const ONETY_API_KEY = import.meta.env.VITE_ONETY_API_KEY || '';

/**
 * Busca dados paginados diretamente pelo proxy do Onety (localhost ou fallback)
 */
async function fetchDirectFromOnety(endpoint, queryParams = '') {
  try {
    const q = queryParams ? `&${queryParams}` : '';
    const initRes = await fetch(`/onety-proxy/${endpoint}?limit=100&page=1${q}&t=${Date.now()}`, {
      headers: { 'x-api-key': ONETY_API_KEY }
    }).catch(() => null);
    
    if (!initRes || !initRes.ok) {
      return [];
    }
    const initData = await initRes.json().catch(() => ({}));
    const total = initData.total || (initData.tarefas ? initData.tarefas.length : 0);
    const firstList = initData.tarefas || initData.transbordos || initData.data || [];
    
    if (!initData.total || total <= 100) {
      return firstList;
    }
    
    const pagesCount = Math.ceil(total / 100);
    const promises = [];
    for (let page = 2; page <= pagesCount; page++) {
      promises.push(
        fetch(`/onety-proxy/${endpoint}?limit=100&page=${page}${q}&t=${Date.now()}`, {
          headers: { 'x-api-key': ONETY_API_KEY }
        }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
      );
    }
    const results = await Promise.all(promises);
    const restList = results.flatMap(r => r.tarefas || r.transbordos || r.data || []);
    return [...firstList, ...restList];
  } catch (err) {
    return [];
  }
}

async function fetchWithFallback(apiPath, directEndpoint, queryParams = '') {
  // Se for proxy Onety direto em dev, não chama rota inexistente da Vercel
  return fetchDirectFromOnety(directEndpoint, queryParams);
}

/**
 * Busca as tarefas da API Onety (Processo 62 - Cadastro)
 * @returns {Promise<Array>} Lista de tarefas formatadas
 */
export const fetchOnetyTasks = async () => {
  try {
    return await fetchWithFallback('/api/tarefas', 'central-tecnologia/dashboard-externo/tarefas');
  } catch (error) {
    console.error('Falha ao buscar tarefas do Onety:', error);
    return [];
  }
};

/**
 * Busca as tarefas de PR comercial (Processo 61 - Entrada)
 * @returns {Promise<Array>} Lista de tarefas de PR
 */
export const fetchOnetyPrTasks = async () => {
  try {
    return await fetchWithFallback('/api/pr-comercial', 'gestao/pr-externo/tarefas');
  } catch (error) {
    console.error('Falha ao buscar PRs do Onety:', error);
    return [];
  }
};

/**
 * Busca as tarefas de Saída/Desligamento (Processos 67/69)
 * @returns {Promise<Array>} Lista de tarefas de saída
 */
export const fetchOnetySaidas = async () => {
  try {
    return await fetchWithFallback('/api/saidas', 'gestao/saidas-externo/tarefas', 'tipo=todos');
  } catch (error) {
    console.error('Falha ao buscar saídas do Onety:', error);
    return [];
  }
};

/**
 * Busca os processos de transbordo (bases) da API Onety
 * @returns {Promise<Array>} Lista de transbordos
 */
export const fetchOnetyTransbordos = async () => {
  try {
    return await fetchWithFallback('/api/transbordos', 'central-tecnologia/dashboard-externo/transbordos');
  } catch (error) {
    console.error('Falha ao buscar transbordos do Onety:', error);
    return [];
  }
};

/**
 * Busca os detalhes completos de uma tarefa do Onety (incluindo atividades e anexos)
 * @param {string|number} taskId 
 * @returns {Promise<Object|null>}
 */
export const fetchTaskDetails = async (taskId) => {
  if (!taskId) return null;
  try {
    const res = await fetch(`/onety-proxy/gestao/pr-externo/tarefas/${taskId}?t=${Date.now()}`, {
      headers: { 'x-api-key': ONETY_API_KEY }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.error('Falha ao buscar detalhes da tarefa no Onety:', error);
  }
  return null;
};



/**
 * Converte string de data para objeto Date de forma robusta
 * @param {string} dateStr 
 * @returns {Date|null}
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  // Tenta parse direto (ISO)
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) return date;

  // Tenta formato brasileiro DD/MM/YYYY
  if (dateStr.includes('/')) {
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/');
    if (timePart) {
      const [hour, minute, second] = timePart.split(':');
      date = new Date(year, month - 1, day, hour, minute, second || 0);
    } else {
      date = new Date(year, month - 1, day);
    }
    if (!isNaN(date.getTime())) return date;
  }

  return null;
};

/**
 * Classifica uma tarefa baseada nas regras de negócio de SLA
 * @param {Object} task 
 * @returns {String} Classificação
 */
export const classifyTask = (task) => {
  const now = new Date();
  const created = parseDate(task.data_criacao);
  const deadline = parseDate(task.data_prazo);
  const finished = parseDate(task.data_conclusao);
  const rawStatus = (task.status || task.situacao || '').toUpperCase();

  // Remove acentos e normaliza para caixa alta para robustez total
  const cleanStatus = rawStatus.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Se o Onety diz que está cancelada ou reprovada, é CANCELADA
  const isCancelled = cleanStatus.startsWith('CANCEL') || cleanStatus.startsWith('REPROV');
  if (isCancelled) {
    return 'cancelada';
  }

  const normalizeText = (txt) => (txt || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Checa se subatendimento ou atividade de Cadastro de Empresa foi finalizada
  let cadastroFinishedDate = finished;

  const checkCadastroEmpresa = () => {
    // 1. Conclusão no nível superior da tarefa
    if (finished || cleanStatus.startsWith('CONCLUID') || cleanStatus.startsWith('FINALIZAD')) {
      return true;
    }

    // 2. Checa em atividades / sub-tarefas / subatendimentos
    const list = task.atividades || task.sub_tarefas || task.subtarefas || task.sub_atendimentos || task.subatendimentos || task.etapas || task.itens || [];
    if (Array.isArray(list) && list.length > 0) {
      for (const item of list) {
        const title = normalizeText(item.texto || item.nome || item.descricao || item.titulo || item.assunto || item.tipo || item.subatendimento || '');
        const isCadastro = title.includes('CADASTRO') && (title.includes('EMPRESA') || title.includes('CLIENTE') || title.includes('BASE'));
        if (isCadastro) {
          const isDone = item.concluida === true || item.concluido === true || item.finalizado === true || !!item.data_conclusao || !!item.dataConclusao || !!item.concluido_em;
          if (isDone) {
            if (!cadastroFinishedDate) {
              cadastroFinishedDate = parseDate(item.data_conclusao || item.dataConclusao || item.concluido_em);
            }
            return true;
          }
        }
      }
    }

    // 3. Checa se o próprio assunto/subatendimento da tarefa indica cadastro finalizado
    const taskTitle = normalizeText(task.assunto || task.subatendimento || task.sub_atendimento || task.servico || task.tipo || '');
    if (taskTitle.includes('CADASTRO') && (taskTitle.includes('EMPRESA') || taskTitle.includes('CLIENTE'))) {
      if (task.concluida === true || task.concluido === true || task.finalizado === true) {
        return true;
      }
    }

    return false;
  };

  const isFinalized = checkCadastroEmpresa();
  const effectiveFinished = cadastroFinishedDate || finished;
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (isFinalized) {
    // Se a data de criação for conhecida, o prazo limite de SLA é de 24h
    if (created && effectiveFinished) {
      const timeDiff = effectiveFinished.getTime() - created.getTime();
      if (timeDiff > oneDayMs) return 'concluida_com_atraso';
    } else if (deadline && effectiveFinished && effectiveFinished > deadline) {
      return 'concluida_com_atraso';
    } else if (created && !effectiveFinished) {
      const timeDiff = now.getTime() - created.getTime();
      if (timeDiff > oneDayMs) return 'concluida_com_atraso';
    }
    return 'concluida_no_prazo';
  }

  // Caso não esteja concluída, verifica se passou de 24h desde a criação
  if (created) {
    const timeDiff = now.getTime() - created.getTime();
    if (timeDiff > oneDayMs) return 'atrasada';
    return 'no_prazo';
  }

  // Fallback baseado no prazo (data_prazo) se não houver data de criação
  if (deadline) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    if (deadlineDate < today) return 'atrasada';
  }

  return 'no_prazo';
};
