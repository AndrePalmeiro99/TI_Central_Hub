import { useState, useEffect, useMemo } from 'react';
import { dbApi } from '../services/dbApi';
import { fetchOnetyTasks, fetchOnetyTransbordos, fetchOnetySaidas, fetchOnetyPrTasks, classifyTask } from '../services/onetyApi';
import staticFranchiseBases from '../data/franchiseBases.json';

// Mock Data logic moved to hook for cleaner App.jsx
const getMockData = () => {
  const f = ['Unidade Alfa (Demonstração)', 'Unidade Beta (Demonstração)', 'Unidade Gamma', 'Unidade Delta', 'Unidade Epsilon'];
  const c = ['Analista de Sistemas A', 'Analista de Sistemas B', 'Supervisor de Operações', 'Consultor Técnico'];
  const s = ['ERP Principal', 'Sistema Integrado', 'Plataforma Legada'];
  const d_bases = ['Base 01', 'Base 02', 'Base 03'];
  const a_bases = ['Servidor Local', 'Cloud Server'];
  
  const rFranquia = () => f[Math.floor(Math.random() * f.length)];
  const rColab = () => c[Math.floor(Math.random() * c.length)];
  const rStatus = () => {
    const rnd = Math.random();
    if (rnd > 0.85) return 'atrasada';
    if (rnd > 0.5) return 'no_prazo';
    return 'concluida_no_prazo';
  };

  const generateMonthData = (monthsAgo) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    const vol = Math.floor(Math.random() * 50) + (monthsAgo === 0 ? 80 : 150);
    
    return Array(vol).fill(null).map((_, i) => {
      const date = new Date(d);
      date.setDate(Math.max(1, Math.floor(Math.random() * 28)));
      
      const software = s[Math.floor(Math.random() * s.length)];
      let detalhe = 'AGUARDANDO DEFINIÇÃO';
      if (software === 'Domínio') detalhe = d_bases[Math.floor(Math.random() * d_bases.length)];
      if (software === 'Alterdata') detalhe = a_bases[Math.floor(Math.random() * a_bases.length)];

      const status = rStatus();
      const creatorName = rColab();
      return {
        id: `mock-${Math.random().toString(36).substr(2, 9)}`,
        created_at: date.toISOString(),
        software_origem: software,
        detalhe_base: detalhe,
        status: status,
        colaborador: rStatus().startsWith('concluida') ? rColab() : (Math.random() > 0.5 ? rColab() : 'Pendente'),
        franquia: rFranquia(),
        contrato_aceite: true,
        dias_sla: status === 'atrasada' ? Math.floor(Math.random() * 10) + 1 : 0,
        sistema_escolhido: software,
        usuario_base: software === 'Domínio' ? d_bases[Math.floor(Math.random() * d_bases.length)] : (software === 'Alterdata' ? 'Alterdata' : 'N/A'),
        assunto: `Migração de Base ${software} - Cadastro de Franquia`,
        descricao: `Solicitação de implantação e homologação de base de dados para a franquia utilizando o sistema ${software}. Cadastro e parametrizações básicas de conformidade de SLA.`,
        empresa_codigo: `EMP-${Math.floor(Math.random() * 9000) + 1000}`,
        honorario: Math.random() > 0.3 ? 1000.00 : 1500.00,
        cadastrado_por: creatorName,
        comentarios: [
          { autor: creatorName, texto: 'Solicitação inicial aberta no Onety.', data: new Date(date.getTime() + 1000 * 60 * 10).toISOString() },
          { autor: 'Pedro (CF-TI)', texto: 'Mapeamento de banco de dados executado.', data: new Date(date.getTime() + 1000 * 60 * 30).toISOString() }
        ]
      };
    });
  };

  return [0, 1, 2, 3, 4, 5].flatMap(generateMonthData);
};

const cleanFranchiseName = (name) => {
  if (!name) return '';
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/\b(CF|CONTABILIDADE|FRANQUIA|LTDA|ME|EPP|EIRELI|UNIDADE|BASE|S\/S|S\.S\.|SEDE|ESC|CENTRO|FRANQUEADO)\b/g, '') // Remove stopwords
    .replace(/[^A-Z0-9]/g, ' ') // Remove caracteres especiais
    .trim()
    .replace(/\s+/g, ' '); // Normaliza espaços
};

export function useDashboardData(session, autoRefreshEnabled = true) {
  const getApiUrl = (path) => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    let apiHost = hashParams.get('api_url');
    
    if (!apiHost && typeof document !== 'undefined' && document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.origin.includes('vercel.app') || refUrl.origin.includes('localhost') || refUrl.origin.includes('127.0.0.1')) {
          apiHost = refUrl.origin;
        }
      } catch (e) {}
    }
    
    if (!apiHost) {
      apiHost = import.meta.env.VITE_API_URL || '';
    }

    if (apiHost.includes('vercel.com') && !apiHost.includes('vercel.app')) {
      apiHost = '';
    }
    
    const cleanHost = apiHost.replace(/\/$/, '');
    return `${cleanHost}${path}`;
  };

  const fetchFromApi = async (path, options = {}) => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const token = session?.access_token || hashParams.get('session_token') || localStorage.getItem('session_token');
    
    if (token && localStorage.getItem('session_token') !== token) {
      localStorage.setItem('session_token', token);
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(getApiUrl(path), {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  };

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [metadataMap, setMetadataMap] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [franchiseBasesMap, setFranchiseBasesMap] = useState({});
  const [franchiseRoyaltiesMap, setFranchiseRoyaltiesMap] = useState({});
  const [rescisoes, setRescisoes] = useState([]);
  const [prTasks, setPrTasks] = useState([]);

  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.user_metadata?.role || 'guest';
  
  const isManager = userEmail === 'ti@cfcontabilidade.com' || userRole === 'manager';
  
  const isAdmin = userRole === 'administrator' || userRole === 'admin' ||
                  userEmail === 'pedro@cfcontabilidade.com' ||
                  userEmail === 'pedro.freitas@cffranquias.com.br' ||
                  userEmail === 'andre@cfcontabilidade.com' ||
                  userEmail === 'andre.palmeiro@cffranquias.com.br' ||
                  userEmail === 'gabriel@cfcontabilidade.com' ||
                  userEmail === 'gabriel.rozzato@cffranquias.com.br';

  const isCollaborator = userRole === 'collaborator';
  const isApprovedGuest = userRole === 'guest';
  
  // Fortaleza Digital: Qualquer um que não seja explicitamente Manager, Admin, Collaborator ou Guest Aprovado vê apenas Mocks
  const isActuallyGuest = !isManager && !isAdmin && !isCollaborator && !isApprovedGuest;

  const isIntegrated = useMemo(() => {
    if (!supabase) return true;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const token = session?.access_token || hashParams.get('session_token') || localStorage.getItem('session_token');
    const hasHashToken = hashParams.has('session_token') || hashParams.has('access_token');
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (hasHashToken || isIframe) {
      return true;
    }
    if (session?.user && !hasHashToken) {
      return false;
    }
    return true;
  }, [session]);

  const saveTarefaMetadata = async (taskId, metadataPatch, logEntry) => {
    try {
      if (isIntegrated) {
        await fetchFromApi('/api/admin/ti/metadata', {
          method: 'POST',
          body: JSON.stringify({
            id: taskId,
            ...metadataPatch
          })
        });

        if (logEntry) {
          await fetchFromApi('/api/admin/ti/logs', {
            method: 'POST',
            body: JSON.stringify({
              tarefa_id: taskId,
              empresa: logEntry.empresa,
              changed_by: logEntry.changed_by,
              old_value: logEntry.old_value,
              new_value: logEntry.new_value
            })
          });
        }
      } else {
        await dbApi.saveTarefaMetadata({
          id: taskId,
          ...metadataPatch
        });

        if (logEntry) {
          await dbApi.saveAuditLog({
            tarefa_id: taskId,
            empresa: logEntry.empresa,
            changed_by: logEntry.changed_by,
            old_value: logEntry.old_value,
            new_value: logEntry.new_value
          });
        }
      }
      return true;
    } catch (err) {
      console.error("Erro ao salvar metadados:", err);
      return false;
    }
  };

  async function fetchAuditLogs(limit = 50) {
    setLoadingLogs(true);
    try {
      const logs = await dbApi.getAuditLogs(limit);
      if (logs && Array.isArray(logs)) {
        setAuditLogs(logs);
      }
    } catch (e) {
      console.error("Falha ao buscar logs de auditoria via API:", e);
      if (supabase) {
        try {
          const { data: sbLogs, error } = await supabase
            .from('audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
          if (!error && sbLogs) {
            setAuditLogs(sbLogs);
          }
        } catch (sbErr) {
          console.error("Falha no fallback de logs para Supabase:", sbErr);
        }
      }
    }
    setLoadingLogs(false);
  }

  async function toggleContratoAceite(taskId) {
    const task = data.find(t => t.id === taskId);
    const isPending = !task?.status?.startsWith('concluida');
    
    const currentMeta = metadataMap[taskId] || {};
    const currentStatus = currentMeta.contrato_aceite === true 
      ? true 
      : (currentMeta.contrato_aceite === false ? false : !isPending);

    const nextStatus = !currentStatus;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    const success = await saveTarefaMetadata(taskId, {
      contrato_aceite: nextStatus
    }, {
      empresa: task?.empresa_nome || 'N/A',
      changed_by: userName,
      old_value: currentStatus ? 'Com Contrato' : 'Sem Contrato',
      new_value: nextStatus ? 'Com Contrato' : 'Sem Contrato'
    });

    if (success) {
      setMetadataMap(prev => ({
        ...prev,
        [taskId]: { 
          ...prev[taskId], 
          contrato_aceite: nextStatus 
        }
      }));
      fetchAuditLogs();
      return true;
    }
    return false;
  }

  async function updateEmpresaCodigo(taskId, newCodigo) {
    const task = data.find(t => t.id === taskId);
    const currentMeta = metadataMap[taskId] || {};
    const isPending = !task?.status?.startsWith('concluida');
    const defaultContrato = !isPending;
    const currentContrato = currentMeta.contrato_aceite !== undefined
      ? currentMeta.contrato_aceite
      : defaultContrato;

    const currentCodigo = currentMeta.empresa_codigo || task?.empresa_codigo || 'N/A';
    const nextCodigo = newCodigo ? newCodigo.trim() : 'N/A';
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    const success = await saveTarefaMetadata(taskId, {
      empresa_codigo: nextCodigo === 'N/A' ? null : nextCodigo
    }, {
      empresa: task?.empresa_nome || 'N/A',
      changed_by: userName,
      old_value: `CÓD: ${currentCodigo}`,
      new_value: `CÓD: ${nextCodigo}`
    });

    if (success) {
      setMetadataMap(prev => ({
        ...prev,
        [taskId]: { 
          ...prev[taskId], 
          contrato_aceite: currentContrato,
          empresa_codigo: nextCodigo === 'N/A' ? null : nextCodigo 
        }
      }));

      setData(prevData => prevData.map(t => t.id === taskId ? { ...t, empresa_codigo: nextCodigo } : t));
      fetchAuditLogs();
      return true;
    }
    return false;
  }

  async function updateObservacoes(taskId, text) {
    const task = data.find(t => t.id === taskId);
    const currentMeta = metadataMap[taskId] || {};
    const currentObs = currentMeta.observacoes || '';
    const nextObs = text ? text.trim() : '';
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    const success = await saveTarefaMetadata(taskId, {
      observacoes: nextObs === '' ? null : nextObs
    }, {
      empresa: task?.empresa_nome || 'N/A',
      changed_by: userName,
      old_value: currentObs ? `Obs: ${currentObs.substring(0, 30)}${currentObs.length > 30 ? '...' : ''}` : 'Sem Observações',
      new_value: nextObs ? `Obs: ${nextObs.substring(0, 30)}${nextObs.length > 30 ? '...' : ''}` : 'Sem Observações'
    });

    if (success) {
      setMetadataMap(prev => ({
        ...prev,
        [taskId]: { 
          ...prev[taskId], 
          observacoes: nextObs === '' ? null : nextObs 
        }
      }));

      setData(prevData => prevData.map(t => t.id === taskId ? { ...t, observacoes: nextObs } : t));
      fetchAuditLogs();
      return true;
    }
    return false;
  }

  async function updateTaskOverrides(taskId, overrides) {
    const task = data.find(t => t.id === taskId);
    const currentMeta = metadataMap[taskId] || {};
    const isPending = !task?.status?.startsWith('concluida');
    const defaultContrato = !isPending;
    const currentContrato = currentMeta.contrato_aceite !== undefined
      ? currentMeta.contrato_aceite
      : defaultContrato;

    const nextFranquia = overrides.franquia !== undefined ? overrides.franquia.trim() : (currentMeta.franquia_override || null);
    const nextSistema = overrides.sistema !== undefined ? overrides.sistema.trim() : (currentMeta.sistema_override || null);
    const nextDetalheBase = overrides.detalheBase !== undefined ? overrides.detalheBase.trim() : (currentMeta.detalhe_base_override || null);

    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    let logMsg = '';
    if (overrides.franquia !== undefined) {
      logMsg += `Franquia: ${currentMeta.franquia_override || 'Original'} -> ${nextFranquia || 'Original'}; `;
    }
    if (overrides.sistema !== undefined || overrides.detalheBase !== undefined) {
      logMsg += `Sistema/Base: ${currentMeta.sistema_override || 'Original'} (${currentMeta.detalhe_base_override || 'Original'}) -> ${nextSistema || 'Original'} (${nextDetalheBase || 'Original'})`;
    }

    const success = await saveTarefaMetadata(taskId, {
      franquia_override: nextFranquia === '' ? null : nextFranquia,
      sistema_override: nextSistema === '' ? null : nextSistema,
      detalhe_base_override: nextDetalheBase === '' ? null : nextDetalheBase
    }, {
      empresa: task?.empresa_nome || 'N/A',
      changed_by: userName,
      old_value: 'Alteração de Vínculos',
      new_value: logMsg || 'Dados de Overrides Atualizados'
    });

    if (success) {
      setMetadataMap(prev => ({
        ...prev,
        [taskId]: { 
          ...prev[taskId], 
          contrato_aceite: currentContrato,
          franquia_override: nextFranquia === '' ? null : nextFranquia,
          sistema_override: nextSistema === '' ? null : nextSistema,
          detalhe_base_override: nextDetalheBase === '' ? null : nextDetalheBase
        }
      }));

      setData(prevData => prevData.map(t => {
        if (t.id === taskId) {
          return { 
            ...t, 
            franquia: nextFranquia || t.transbordo?.franquia || t.franquia || 'Matriz',
            software_origem: nextSistema || t.software_origem,
            detalhe_base: (nextDetalheBase !== null && nextDetalheBase !== undefined) ? nextDetalheBase : t.detalhe_base
          };
        }
        return t;
      }));

      fetchAuditLogs();
      return true;
    }
    return false;
  }

  async function updateClienteHonorario(taskId, valor) {
    const task = data.find(t => t.id === taskId);
    const currentMeta = metadataMap[taskId] || {};
    const isPending = !task?.status?.startsWith('concluida');
    const defaultContrato = !isPending;
    const currentContrato = currentMeta.contrato_aceite !== undefined
      ? currentMeta.contrato_aceite
      : defaultContrato;

    const oldHonorario = currentMeta.honorario !== undefined && currentMeta.honorario !== null ? currentMeta.honorario : 1000.00;
    const nextHonorario = valor !== null && valor !== undefined ? parseFloat(valor) : 1000.00;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    const success = await saveTarefaMetadata(taskId, {
      honorario: nextHonorario
    }, {
      empresa: task?.empresa_nome || 'N/A',
      changed_by: userName,
      old_value: `Honorário Cliente: R$ ${oldHonorario.toFixed(2).replace('.', ',')}`,
      new_value: `Honorário Cliente: R$ ${nextHonorario.toFixed(2).replace('.', ',')}`
    });

    if (success) {
      setMetadataMap(prev => ({
        ...prev,
        [taskId]: { 
          ...prev[taskId], 
          contrato_aceite: currentContrato,
          honorario: nextHonorario 
        }
      }));

      setData(prevData => prevData.map(t => t.id === taskId ? { ...t, honorario: nextHonorario } : t));
      fetchAuditLogs();
      return true;
    }
    return false;
  }

  async function toggleTaskBackoffice(taskId) {
    const task = data.find(t => t.id === taskId);
    const currentMeta = metadataMap[taskId] || {};
    const currentVal = currentMeta.is_backoffice === true;
    const nextVal = !currentVal;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    const success = await saveTarefaMetadata(taskId, {
      is_backoffice: nextVal
    }, {
      empresa: task?.empresa_nome || 'N/A',
      changed_by: userName,
      old_value: currentVal ? 'Backoffice: Sim' : 'Backoffice: Não',
      new_value: nextVal ? 'Backoffice: Sim' : 'Backoffice: Não'
    });

    if (success) {
      setMetadataMap(prev => ({
        ...prev,
        [taskId]: { 
          ...prev[taskId], 
          is_backoffice: nextVal 
        }
      }));

      setData(prevData => prevData.map(t => t.id === taskId ? { ...t, is_backoffice: nextVal } : t));
      fetchAuditLogs();
      return true;
    }
    return false;
  }

  async function toggleTaskCancelled(taskId) {
    const task = data.find(t => t.id === taskId);
    const currentMeta = metadataMap[taskId] || {};
    const currentVal = currentMeta.is_cancelled === true;
    const nextVal = !currentVal;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    const success = await saveTarefaMetadata(taskId, {
      is_cancelled: nextVal
    }, {
      empresa: task?.empresa_nome || 'N/A',
      changed_by: userName,
      old_value: currentVal ? 'Cancelado: Sim' : 'Cancelado: Não',
      new_value: nextVal ? 'Cancelado: Sim' : 'Cancelado: Não'
    });

    if (success) {
      setMetadataMap(prev => ({
        ...prev,
        [taskId]: { 
          ...prev[taskId], 
          is_cancelled: nextVal 
        }
      }));

      setData(prevData => prevData.map(t => t.id === taskId ? { ...t, is_cancelled: nextVal } : t));
      fetchAuditLogs();
      return true;
    }
    return false;
  }

  async function updateFranchiseRoyaltyConfig(franchiseName, fixedRoyalty, percentage) {
    const franchiseUpper = franchiseName.toUpperCase();
    const oldConfig = franchiseRoyaltiesMap[franchiseUpper] || { fixedRoyalty: 530.00, variablePercentage: 12.00 };
    const nextFixed = fixedRoyalty !== undefined && fixedRoyalty !== null ? parseFloat(fixedRoyalty) : 530.00;
    const nextPercent = percentage !== undefined && percentage !== null ? parseFloat(percentage) : 12.00;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const userEmailFromHash = hashParams.get('email');
    const userName = isManager ? 'Gerente (TI)' : (userEmailFromHash || userEmail || 'Sistema');

    try {
      if (isIntegrated) {
        await fetchFromApi('/api/admin/ti/royalties', {
          method: 'POST',
          body: JSON.stringify({
            franchise_name: franchiseUpper,
            fixed_royalty: nextFixed,
            variable_percentage: nextPercent
          })
        });

        await fetchFromApi('/api/admin/ti/logs', {
          method: 'POST',
          body: JSON.stringify({
            tarefa_id: 'FRANCHISE_CONFIG',
            empresa: `Config: ${franchiseName}`,
            changed_by: userName,
            old_value: `Fixo: R$ ${oldConfig.fixedRoyalty.toFixed(2).replace('.', ',')}, Perc: ${oldConfig.variablePercentage}%`,
            new_value: `Fixo: R$ ${nextFixed.toFixed(2).replace('.', ',')}, Perc: ${nextPercent}%`
          })
        });
      } else if (supabase) {
        const { error } = await supabase
          .from('franchise_royalties_config')
          .upsert({
            franchise_name: franchiseUpper,
            fixed_royalty: nextFixed,
            variable_percentage: nextPercent,
            updated_at: new Date().toISOString()
          });
        if (error) throw error;

        const { error: logError } = await supabase
          .from('audit_log')
          .insert({
            tarefa_id: 'FRANCHISE_CONFIG',
            empresa: `Config: ${franchiseName}`,
            changed_by: userName,
            old_value: `Fixo: R$ ${oldConfig.fixedRoyalty.toFixed(2).replace('.', ',')}, Perc: ${oldConfig.variablePercentage}%`,
            new_value: `Fixo: R$ ${nextFixed.toFixed(2).replace('.', ',')}, Perc: ${nextPercent}%`
          });
        if (logError) throw logError;
      }

      setFranchiseRoyaltiesMap(prev => ({
        ...prev,
        [franchiseUpper]: {
          fixedRoyalty: nextFixed,
          variablePercentage: nextPercent
        }
      }));

      fetchAuditLogs();
      return true;
    } catch (err) {
      console.error("Falha ao atualizar configuração contratual da franquia:", err);
      return false;
    }
  }

  // Toggle checklist status for a sector in exit flows
  const toggleRescisaoSetorStatus = async (rescisao, setor) => {
    if (!supabase) return false;
    
    const updatedRescisao = JSON.parse(JSON.stringify(rescisao));
    const currentStatus = updatedRescisao.setores[setor].concluido;
    updatedRescisao.setores[setor].concluido = !currentStatus;
    
    // Recalculate TI dependency
    const dpEnvolvido = updatedRescisao.setores.dp.envolvido;
    const dpConcluido = updatedRescisao.setores.dp.concluido;
    const fiscalEnvolvido = updatedRescisao.setores.fiscal.envolvido;
    const fiscalConcluido = updatedRescisao.setores.fiscal.concluido;
    const contabilEnvolvido = updatedRescisao.setores.contabil.envolvido;
    const contabilConcluido = updatedRescisao.setores.contabil.concluido;
    
    const allOthersDone = (!dpEnvolvido || dpConcluido) &&
                          (!fiscalEnvolvido || fiscalConcluido) &&
                          (!contabilEnvolvido || contabilConcluido);
    
    if (!allOthersDone) {
      updatedRescisao.setores.ti.concluido = false;
    }
    
    const payload = {
      tipo: 'rescisao',
      cliente_nome: updatedRescisao.cliente_nome,
      cnpj: updatedRescisao.cnpj,
      competencia_saida: updatedRescisao.competencia_saida,
      motivo: updatedRescisao.motivo,
      setores: updatedRescisao.setores,
      finalizado: updatedRescisao.setores.ti.concluido,
      data_conclusao: updatedRescisao.setores.ti.concluido ? new Date().toISOString() : null
    };
    
    try {
      const { error } = await supabase
        .from('tarefa_metadata')
        .upsert({
          id: rescisao.id,
          observacoes: JSON.stringify(payload),
          updated_at: new Date().toISOString()
        });
        
      if (error) throw error;
      setRescisoes(prev => prev.map(r => r.id === rescisao.id ? { ...r, ...payload } : r));
      return true;
    } catch (err) {
      console.error('Erro ao atualizar status do setor:', err);
      return false;
    }
  };

  // Toggle TI/System Deletion status in exit flows
  const toggleRescisaoTIStatus = async (rescisao) => {
    if (!supabase) return false;
    
    const dpEnvolvido = rescisao.setores.dp.envolvido;
    const dpConcluido = rescisao.setores.dp.concluido;
    const fiscalEnvolvido = rescisao.setores.fiscal.envolvido;
    const fiscalConcluido = rescisao.setores.fiscal.concluido;
    const contabilEnvolvido = rescisao.setores.contabil.envolvido;
    const contabilConcluido = rescisao.setores.contabil.concluido;
    
    const allOthersDone = (!dpEnvolvido || dpConcluido) &&
                          (!fiscalEnvolvido || fiscalConcluido) &&
                          (!contabilEnvolvido || contabilConcluido);
                          
    if (!allOthersDone) {
      return false;
    }
    
    const nextTIStatus = !rescisao.setores.ti.concluido;
    const updatedRescisao = JSON.parse(JSON.stringify(rescisao));
    updatedRescisao.setores.ti.concluido = nextTIStatus;
    
    const payload = {
      tipo: 'rescisao',
      cliente_nome: updatedRescisao.cliente_nome,
      cnpj: updatedRescisao.cnpj,
      competencia_saida: updatedRescisao.competencia_saida,
      motivo: updatedRescisao.motivo,
      setores: updatedRescisao.setores,
      finalizado: nextTIStatus,
      data_conclusao: nextTIStatus ? new Date().toISOString() : null
    };
    
    try {
      const { error } = await supabase
        .from('tarefa_metadata')
        .upsert({
          id: rescisao.id,
          observacoes: JSON.stringify(payload),
          updated_at: new Date().toISOString()
        });
        
      if (error) throw error;
      setRescisoes(prev => prev.map(r => r.id === rescisao.id ? { ...r, ...payload } : r));
      return true;
    } catch (err) {
      console.error('Erro ao atualizar status do TI:', err);
      return false;
    }
  };

  // Delete Rescisao entry in exit flows
  const deleteRescisaoEntry = async (id) => {
    if (!supabase) return false;
    
    try {
      const { error } = await supabase
        .from('tarefa_metadata')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      setRescisoes(prev => prev.filter(r => r.id !== id));
      return true;
    } catch (err) {
      console.error('Erro ao deletar rescisão:', err);
      return false;
    }
  };

  // Create Rescisao entry in Supabase
  const createRescisaoEntry = async (rescisaoData) => {
    if (!supabase) return false;
    const cleanCnpj = rescisaoData.cnpj.replace(/\D/g, '');
    const id = `saida-${cleanCnpj}`;
    
    const payload = {
      tipo: 'rescisao',
      cliente_nome: rescisaoData.cliente_nome,
      cnpj: rescisaoData.cnpj,
      competencia_saida: rescisaoData.competencia_saida,
      motivo: rescisaoData.motivo,
      setores: {
        dp: { envolvido: rescisaoData.dp, concluido: false },
        fiscal: { envolvido: rescisaoData.fiscal, concluido: false },
        contabil: { envolvido: rescisaoData.contabil, concluido: false },
        ti: { envolvido: true, concluido: false }
      }
    };
    
    try {
      const { error } = await supabase
        .from('tarefa_metadata')
        .upsert({
          id,
          observacoes: JSON.stringify(payload),
          updated_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      // Log audit
      await supabase.from('audit_log').insert({
        tarefa_id: id,
        empresa: rescisaoData.cliente_nome,
        changed_by: isManager ? 'Gerente (TI)' : (userEmail || 'Sistema'),
        old_value: 'Registro de Saída Criado',
        new_value: JSON.stringify(payload)
      });
      
      await refreshData();
      return true;
    } catch (err) {
      console.error('Erro ao cadastrar rescisão:', err);
      return false;
    }
  };

  const refreshData = useMemo(() => async () => {
    // Fortaleza Digital: Isolamento total para convidados (Visitantes)
    if (isActuallyGuest) {
      setData(getMockData());
      setUsingMock(true);
      setLoading(false);
      return;
    }

    let onetyData = [];
    let transbordosData = [];
    let saidasData = [];

    try {
      onetyData = await fetchOnetyTasks();
    } catch (err) {
      console.error("Falha ao buscar tarefas do Onety:", err);
    }

    try {
      transbordosData = await fetchOnetyTransbordos();
    } catch (err) {
      console.error("Falha ao buscar transbordos do Onety:", err);
    }

    try {
      saidasData = await fetchOnetySaidas();
    } catch (err) {
      console.error("Falha ao buscar saídas do Onety:", err);
    }

    let prsData = [];
    try {
      prsData = await fetchOnetyPrTasks();
    } catch (err) {
      console.error("Falha ao buscar PRs do Onety:", err);
    }

    try {

      let metaMap = {};
      let fBasesMap = {};
      
      if (supabase) {
        try {
          const { data: supabaseData, error } = await supabase.from('tarefa_metadata').select('*');
          if (!error && supabaseData) {
            metaMap = supabaseData.reduce((acc, row) => {
               acc[row.id] = row;
               return acc;
            }, {});
          }
        } catch (e) { console.error("Falha ao buscar metadados do Supabase:", e); }
        
        try {
          const { data: basesData, error: basesError } = await supabase.from('franchise_bases').select('franchise_name, base_assigned');
          if (basesData) {
            fBasesMap = basesData.reduce((acc, row) => {
               acc[row.franchise_name.toUpperCase()] = row.base_assigned;
               return acc;
            }, {});
          }
        } catch (e) { console.error("Falha ao buscar bases de franquias do Supabase:", e); }
      }

      if (!fBasesMap || Object.keys(fBasesMap).length === 0) {
        console.warn("Supabase retornou bases vazias. Usando fallback estatico local.");
        fBasesMap = Object.entries(staticFranchiseBases).reduce((acc, [franchise, base]) => {
          acc[franchise.toUpperCase()] = base;
          return acc;
        }, {});
      }

      setMetadataMap(metaMap);
      setFranchiseBasesMap(fBasesMap);

      let fRoyaltiesMap = {};
      if (supabase) {
        try {
          const { data: royaltiesData, error: royaltiesError } = await supabase.from('franchise_royalties_config').select('*');
          if (royaltiesData) {
            fRoyaltiesMap = royaltiesData.reduce((acc, row) => {
               acc[row.franchise_name.toUpperCase()] = {
                 fixedRoyalty: parseFloat(row.fixed_royalty) || 530.00,
                 variablePercentage: parseFloat(row.variable_percentage) || 12.00
               };
               return acc;
            }, {});
          }
        } catch (e) { console.error("Falha ao buscar configurações de royalties do Supabase:", e); }
      }
      setFranchiseRoyaltiesMap(fRoyaltiesMap);

      const transbordoMap = (transbordosData || []).reduce((acc, t) => {
        if (t.cnpj) acc[t.cnpj] = t;
        return acc;
      }, {});

      if (onetyData) {
        const normalized = onetyData.map(t => {
          const status = classifyTask(t);
          const taskCnpj = t.empresa?.cnpj || t.empresa?.identificador;
          const transInfo = transbordoMap[taskCnpj] || {};

          const franquiaUpper = (t.franqueado || 'Matriz').toUpperCase();
          
          let mappedBase = fBasesMap[franquiaUpper];
          let matchedKey = mappedBase ? franquiaUpper : null;
          
          if (!mappedBase) {
             const cleanFranquia = cleanFranchiseName(franquiaUpper);
             const mapKeys = Object.keys(fBasesMap);
             
             // 1. Tentar correspondência exata dos nomes limpos
             for (const key of mapKeys) {
                const cleanKey = cleanFranchiseName(key);
                if (cleanKey && cleanKey === cleanFranquia) {
                  mappedBase = fBasesMap[key];
                  matchedKey = key;
                  break;
                }
             }
             
             // 2. Se ainda não achou, tenta correspondência parcial (substring)
             if (!mappedBase) {
                for (const key of mapKeys) {
                  const cleanKey = cleanFranchiseName(key);
                  if (cleanKey && cleanFranquia && (cleanFranquia.includes(cleanKey) || cleanKey.includes(cleanFranquia))) {
                    mappedBase = fBasesMap[key];
                    matchedKey = key;
                    break;
                  }
                }
             }
          }

          let sw = transInfo.sistema_escolhido || 'Sem Base';
          let det = transInfo.usuario || t.assunto;

          // Se existir mapeamento explícito no banco, priorizar ele!
          if (mappedBase) {
             if (mappedBase.includes('Domínio')) {
                sw = 'Domínio';
                det = mappedBase.replace('Domínio Base ', '');
             } else if (mappedBase.includes('Alterdata')) {
                sw = 'Alterdata';
                det = mappedBase.replace('Alterdata ', '');
                if (det === 'Base') det = 'Próprio';
             }
          } else {
             // Fallback antigo
             if (sw.includes('Domínio') || sw.includes('Dominio')) sw = 'Domínio';
             else if (sw.includes('Alterdata')) sw = 'Alterdata';
             else sw = 'Sem Base';

             const detUpper = (det || '').toUpperCase();
             if (sw === 'Domínio') {
                det = detUpper.includes('BASE 2') ? '2' : (detUpper.includes('BASE 3') ? '3' : '1');
             } else if (sw === 'Alterdata') {
                det = detUpper.includes('SERVIDOR') ? 'Servidor' : 'Próprio';
             }
          }

          let resp = t.responsavel?.nome || 'Pedro (CF-TI)';
          if (resp.toLowerCase().includes('gerente')) resp = 'Pedro (CF-TI)';

          const metaRow = metaMap[t.id] || {};
          const manualEmpresaCodigo = metaRow.empresa_codigo;
          const manualObservacoes = metaRow.observacoes;
          const manualFranquia = metaRow.franquia_override;
          const manualSistema = metaRow.sistema_override;
          const manualDetalheBase = metaRow.detalhe_base_override;
          const manualHonorario = metaRow.honorario;
          const isGloby = t.empresa?.id === 44 || t.empresa?.id === '44' ||
                           t.empresaId === 44 || t.empresaId === '44' ||
                           t.empresa_id === 44 || t.empresa_id === '44';
          const isCfRj = (t.franqueado || '').toUpperCase().includes('CF RJ') ||
                         (t.empresa?.nome || '').toUpperCase().includes('CF RJ');

          const isPending = !status?.startsWith('concluida');
          const cleanName = (name) => (name || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(CF|CONTABILIDADE|FRANQUIA|LTDA|ME|EPP|EIRELI|UNIDADE|BASE|S\/S|S\.S\.|SEDE|ESC|CENTRO|FRANQUEADO)\b/g, '').replace(/[^A-Z0-9]/g, ' ').trim().replace(/\s+/g, ' ');
          const currentCleanName = cleanName(t.empresa?.nome);

          const matchedPrs = (prsData || []).filter(pr => {
            const prCnpj = (pr.cliente?.cnpj || pr.empresa?.cnpj || pr.cnpj || '').replace(/\D/g, '');
            const taskCnpjClean = (taskCnpj || '').replace(/\D/g, '');
            
            // 1. Prioridade Máxima: CNPJ completo de 14 dígitos (diferencia Matriz 0001 de Filiais 0002, 0003...)
            if (prCnpj && taskCnpjClean && prCnpj.length >= 14 && taskCnpjClean.length >= 14) {
              return prCnpj === taskCnpjClean;
            }

            // 2. Fallback por nome exato limpo
            const prCleanName = cleanName(pr.cliente?.nome || pr.empresa?.nome || pr.nome || '');
            if (prCleanName && currentCleanName && prCleanName === currentCleanName) return true;

            // 3. Fallback secundário por radical de 8 dígitos apenas se CNPJ tiver menos de 14 dígitos (e coincidir nome)
            if (prCnpj && taskCnpjClean && (prCnpj.length < 14 || taskCnpjClean.length < 14)) {
              const prRadical = prCnpj.substring(0, 8);
              const taskRadical = taskCnpjClean.substring(0, 8);
              if (prRadical === taskRadical && prCleanName && currentCleanName && (prCleanName.includes(currentCleanName) || currentCleanName.includes(prCleanName))) {
                return true;
              }
            }

            return false;
          });

          const isBackoffice = metaRow.is_backoffice === true || isGloby || isCfRj;
          const isCancelled = metaRow.is_cancelled === true || status === 'cancelada';

          // Sort PRs (highest ID / newest first)
          matchedPrs.sort((a, b) => (b.id || 0) - (a.id || 0));

          const hasAnyPrConcluded = matchedPrs.some(pr => {
            const raw = (pr.status || pr.situacao || '').toLowerCase();
            return !!pr.data_conclusao || 
                   !!pr.dataConclusao || 
                   !!pr.data_fim || 
                   !!pr.data_finalizacao || 
                   pr.concluida === true || 
                   pr.concluido === true || 
                   pr.finalizado === true || 
                   raw.startsWith('concluid') || 
                   raw.startsWith('finalizad');
          });

          const formattedMatchedPrs = matchedPrs.map(pr => {
            const prClassification = classifyTask(pr);
            const rawStatus = (pr.status || pr.situacao || '').toLowerCase();

            // Checa flags diretas
            const directDone = !!pr.data_conclusao || 
                               !!pr.dataConclusao || 
                               !!pr.data_fim || 
                               !!pr.data_finalizacao || 
                               !!pr.data_encerramento || 
                               pr.concluida === true || 
                               pr.concluido === true || 
                               pr.finalizada === true || 
                               pr.finalizado === true || 
                               rawStatus.startsWith('concluid') || 
                               rawStatus.startsWith('finalizad') || 
                               rawStatus.startsWith('resolvid') || 
                               prClassification.startsWith('concluida');

            // Checa atividades do PR
            let activitiesDone = false;
            const list = pr.atividades || pr.sub_tarefas || pr.subtarefas || pr.sub_atendimentos || pr.subatendimentos || pr.etapas || pr.itens || [];
            if (Array.isArray(list) && list.length > 0) {
              const allDone = list.every(a => a.concluida === true || a.concluido === true || a.finalizado === true || !!a.data_conclusao || !!a.dataConclusao || !!a.concluido_em);
              const cadastroDone = list.some(a => {
                const txt = (a.texto || a.nome || a.descricao || a.titulo || a.assunto || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return (txt.includes('CADASTRO') || txt.includes('ENTRADA') || txt.includes('ACEITE') || txt.includes('BACKOFFICE')) && 
                       (a.concluida === true || a.concluido === true || a.finalizado === true || !!a.data_conclusao || !!a.dataConclusao || !!a.concluido_em);
              });
              if (allDone || cadastroDone) {
                activitiesDone = true;
              }
            }

            // Se o PR foi concluído, ou se outro PR da mesma empresa foi finalizado, ou se o cadastro já está concluído/backoffice
            const isConcluido = directDone || activitiesDone || hasAnyPrConcluded || isBackoffice || !isPending;

            const isAtrasada = rawStatus === 'atrasada' || prClassification === 'concluida_com_atraso' || prClassification === 'atrasada';
            
            let statusLabel = 'Em andamento';
            if (isConcluido) {
              statusLabel = 'Concluído';
            } else if (isAtrasada) {
              statusLabel = 'Atrasada';
            } else if (pr.status || pr.situacao) {
              statusLabel = pr.status || pr.situacao;
            }

            return {
              id: pr.id,
              assunto: pr.assunto || 'Entrada Comercial',
              status: statusLabel,
              is_concluido: isConcluido,
              is_atrasada: isAtrasada,
              data_criacao: pr.data_criacao || pr.created_at || null,
              data_conclusao: pr.data_conclusao || pr.dataConclusao || null,
              responsavel: pr.responsavel?.nome || null,
              url: `https://cfonety.com.br/gestao/tarefas/${pr.id}/atividades`
            };
          });

          const matchedPr = matchedPrs[0] || null;
          if (matchedPr) {
            console.debug(`[PR Match] ${t.empresa?.nome} -> ${matchedPrs.length} PR(s) encontrados (Principal: PR#${matchedPr.id})`);
          }

          // Reconhecimento automático de CONCLUÍDO ou CONTRATO GERADO no PR
          const isPrConcluido = matchedPr && (
            !!matchedPr.data_conclusao || 
            !!matchedPr.dataConclusao ||
            (matchedPr.status || '').toLowerCase().startsWith('concluid') ||
            (matchedPr.situacao || '').toLowerCase().startsWith('concluid') ||
            hasAnyPrConcluded ||
            isBackoffice
          );

          const isPrContratoGerado = matchedPr && (
            (matchedPr.anexos_count && matchedPr.anexos_count > 0) ||
            (Array.isArray(matchedPr.anexos) && matchedPr.anexos.length > 0) ||
            (Array.isArray(matchedPr.atividades) && matchedPr.atividades.some(a => (
              (a.anexos_count && a.anexos_count > 0) || 
              (Array.isArray(a.anexos) && a.anexos.length > 0) || 
              a.concluida === true || 
              a.concluido === true
            )))
          );
          const checkAceiteAtividade = (taskObj) => {
            if (!taskObj) return false;
            // Verifica os trâmites de ACEITE e DOCUMENTOS
            const atividades = taskObj.atividades || taskObj.sub_tarefas || taskObj.itens || [];
            if (!Array.isArray(atividades) || atividades.length === 0) {
              return (taskObj.anexos_count && taskObj.anexos_count > 0) || false;
            }

            const atv1 = atividades.find(atv => {
              const nome = (atv.texto || atv.nome || atv.titulo || atv.descricao || atv.assunto || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              return nome.includes('ACEITE') || nome.includes('PROPOSTA') || atv.ordem === 1 || atv.numero === 1;
            }) || atividades[0];

            if (!atv1) return false;

            const hasAnexo = (atv1.anexos_count && atv1.anexos_count > 0) ||
                             (Array.isArray(atv1.anexos) && atv1.anexos.length > 0) ||
                             (atv1.total_anexos && atv1.total_anexos > 0) ||
                             (atv1.has_anexo === true);

            const isConcluido = atv1.concluido === true ||
                                atv1.concluida === true ||
                                atv1.finalizado === true ||
                                !!atv1.data_conclusao ||
                                !!atv1.concluido_em ||
                                !!atv1.hora_conclusao;

            return hasAnexo || isConcluido;
          };

          const textMatches = (str) => {
            if (!str) return false;
            const s = str.toLowerCase();
            return s.includes('contrato') || 
                   s.includes('aceite') || 
                   s.includes('clicksign') || 
                   s.includes('assinado') || 
                   s.includes('docusign') ||
                   s.includes('assina') || 
                   s.includes('.pdf') || 
                   s.includes('documento');
          };
          
          let hasAutoContratoText = textMatches(t.assunto) || textMatches(t.descricao);
          const legacyComments = t.comentarios || t.historico || [];
          if (Array.isArray(legacyComments)) {
            hasAutoContratoText = hasAutoContratoText || legacyComments.some(c => textMatches(c.texto || c.mensagem || c.observacao || ''));
          }
          if (matchedPr) {
            hasAutoContratoText = hasAutoContratoText || textMatches(matchedPr.assunto) || textMatches(matchedPr.descricao);
            const prComments = matchedPr.comentarios || matchedPr.historico || [];
            if (Array.isArray(prComments)) {
              hasAutoContratoText = hasAutoContratoText || prComments.some(c => textMatches(c.texto || c.mensagem || c.observacao || ''));
            }
          }

          const hasAutoContrato = isPrContratoGerado || isPrConcluido || checkAceiteAtividade(matchedPr) || checkAceiteAtividade(t) || hasAutoContratoText;
          
          const rawContrato = metaRow.contrato_aceite !== undefined
            ? metaRow.contrato_aceite === true
            : (hasAutoContrato ? true : !isPending);

          const parsedComments = t.comentarios || t.historico || [];
          return {
            id: t.id,
            pr_id: matchedPr?.id || null,
            pr_url: matchedPr?.id ? `https://cfonety.com.br/gestao/tarefas/${matchedPr.id}/atividades` : `https://cfonety.com.br/gestao/tarefas/${t.id}/atividades`,
            pr_assunto: matchedPr?.assunto || null,
            matched_prs: formattedMatchedPrs,
            created_at: t.data_criacao,
            data_prazo: t.data_prazo,
            data_conclusao: t.data_conclusao,
            status: status,
            software_origem: manualSistema || sw,
            detalhe_base: (manualDetalheBase !== undefined && manualDetalheBase !== null) ? manualDetalheBase : det,
            colaborador: resp,
            franquia: manualFranquia || matchedKey || t.franqueado || 'Matriz',
            empresa_nome: t.empresa?.nome || 'N/A',
            cnpj: taskCnpj || 'N/A',
            contrato_aceite: rawContrato,
            dias_sla: 0,
            transbordo: transInfo,
            assunto: t.assunto || 'N/A',
            descricao: t.descricao || t.assunto || 'Sem descrição adicional.',
            empresa_codigo: manualEmpresaCodigo || t.empresa?.codigo || t.empresa?.id || t.empresa?.identificador || 'N/A',
            observacoes: manualObservacoes || '',
            honorario: (manualHonorario !== undefined && manualHonorario !== null)
              ? parseFloat(manualHonorario)
              : (t.cliente?.valor_mrr !== undefined && t.cliente?.valor_mrr !== null
                 ? parseFloat(t.cliente.valor_mrr)
                 : (t.cliente?.honorario !== undefined && t.cliente?.honorario !== null
                    ? parseFloat(t.cliente.honorario)
                    : (t.empresa?.valor_mrr !== undefined && t.empresa?.valor_mrr !== null
                       ? parseFloat(t.empresa.valor_mrr)
                       : (t.empresa?.honorario !== undefined && t.empresa?.honorario !== null
                          ? parseFloat(t.empresa.honorario)
                          : (t.honorario !== undefined ? parseFloat(t.honorario) : 0.00))))),
            is_backoffice: isBackoffice,
            is_cancelled: isCancelled,
            cadastrado_por: t.criador?.nome || t.solicitante?.nome || t.usuario_abertura?.nome || t.empresa?.criador || 'Onety',
            comentarios: Array.isArray(parsedComments) ? parsedComments.map(c => ({
              autor: c.autor || c.usuario || c.criado_por || 'Onety',
              texto: c.texto || c.descricao || c.comentario || '',
              data: c.data || c.created_at || new Date().toISOString()
            })) : []
          };
        });

        setData(normalized);
        setUsingMock(false);
        setHasError(false);
        setLastUpdated(new Date());

        // Parse rescisoes from metaMap
        const parsedRescisoes = Object.entries(metaMap)
          .filter(([key, row]) => {
            if (!key.startsWith('saida-')) return false;
            try {
              const obj = JSON.parse(row.observacoes);
              return obj && obj.tipo === 'rescisao';
            } catch (e) {
              return false;
            }
          })
          .map(([key, row]) => {
            const obj = JSON.parse(row.observacoes);
            return {
              id: key,
              ...obj,
              updated_at: row.updated_at
            };
          });

        const formattedSaidasOnety = (saidasData || []).map(s => {
          const taskCnpj = s.cliente?.cnpj || s.cliente?.identificador || s.empresa?.cnpj || s.empresa?.identificador || 'N/A';
          const cleanCnpj = taskCnpj.replace(/\D/g, '');
          const localMeta = metaMap[String(s.id)] || metaMap[`saida-${cleanCnpj}`] || {};
          
          const dateObj = new Date(s.data_prazo || s.data_criacao || Date.now());
          const compStr = !isNaN(dateObj.getTime())
            ? `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`
            : 'N/A';

          let parsedSectors = {
            dp: { envolvido: true, concluido: false },
            fiscal: { envolvido: true, concluido: false },
            contabil: { envolvido: true, concluido: false },
            ti: { envolvido: true, concluido: s.status === 'concluida' }
          };

          if (localMeta.observacoes) {
            try {
              const obj = JSON.parse(localMeta.observacoes);
              if (obj && obj.tipo === 'rescisao' && obj.setores) {
                parsedSectors = obj.setores;
              }
            } catch (e) {}
          }

          const finalizadoVal = localMeta.observacoes ? (() => {
            try {
              return JSON.parse(localMeta.observacoes).finalizado || s.status === 'concluida';
            } catch(e) { return s.status === 'concluida'; }
          })() : s.status === 'concluida';

          const compFinal = localMeta.observacoes ? (() => {
            try {
              return JSON.parse(localMeta.observacoes).competencia_saida || compStr;
            } catch(e) { return compStr; }
          })() : compStr;

          return {
            id: String(s.id),
            cliente_id: s.cliente?.id || '',
            cliente_nome: s.cliente?.nome || s.assunto || 'Cliente Sem Nome',
            responsavel: s.responsavel?.nome || 'Pedro (CF-TI)',
            data_desligamento: s.data_prazo || s.data_criacao || new Date().toISOString(),
            status: s.status === 'concluida' ? 'concluido' : 'em_andamento',
            observacoes: s.assunto || '',
            sistemas: [s.processo?.nome || 'Desativação de Acesso'],
            updated_at: s.data_conclusao || s.data_criacao,
            cnpj: taskCnpj,
            competencia_saida: compFinal,
            setores: parsedSectors,
            finalizado: finalizadoVal
          };
        });

        setRescisoes([...parsedRescisoes, ...formattedSaidasOnety]);
        setPrTasks(prsData);
      } else if (!onetyData) {
        if (isActuallyGuest) {
          setData(getMockData());
          setUsingMock(true);
        } else {
          setData([]);
          setUsingMock(false);
        }
        setHasError(true);
        setRescisoes([]);
        setPrTasks([]);
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      if (isActuallyGuest) {
        setData(getMockData());
        setUsingMock(true);
      } else {
        setData([]);
        setUsingMock(false);
      }
      setHasError(true);
      setRescisoes([]);
      setPrTasks([]);
    } finally {
      setLoading(false);
    }
  }, [isActuallyGuest]);

  useEffect(() => {
    refreshData();
    fetchAuditLogs(50);
    if (!autoRefreshEnabled) return;
    
    const pollInterval = setInterval(() => {
      refreshData();
      fetchAuditLogs(50);
    }, 60000);
    return () => clearInterval(pollInterval);
  }, [refreshData, autoRefreshEnabled]);

  const dataMesAtual = useMemo(() => {
    const now = new Date();
    return data.filter(d => {
      const date = new Date(d.created_at);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
  }, [data]);

  async function fetchLogsByTask(taskId) {
    try {
      const logs = await fetchFromApi(`/api/admin/ti/logs?tarefa_id=${taskId}`);
      return logs || [];
    } catch (err) {
      console.error("Falha ao buscar logs da tarefa:", err);
      return [];
    }
  }

  return {
    data,
    loading,
    usingMock,
    lastUpdated,
    metadataMap,
    setMetadataMap,
    auditLogs,
    loadingLogs,
    fetchAuditLogs,
    toggleContratoAceite,
    updateEmpresaCodigo,
    updateObservacoes,
    updateTaskOverrides,
    dataMesAtual,
    hasError,
    refreshData,
    franchiseBasesMap,
    franchiseRoyaltiesMap,
    updateClienteHonorario,
    updateFranchiseRoyaltyConfig,
    fetchLogsByTask,
    toggleTaskBackoffice,
    toggleTaskCancelled,
    rescisoes,
    toggleRescisaoSetorStatus,
    toggleRescisaoTIStatus,
    deleteRescisaoEntry,
    createRescisaoEntry,
    prTasks
  };
}
