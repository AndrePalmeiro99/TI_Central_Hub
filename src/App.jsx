import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './services/supabase';
import { MetricCard, SourceBreakdown, MonthlyTrendChart, ColaboradoresDashboard, FranchiseBreakdown, sourceColors } from './components/DashboardCharts';
import Login from './components/Login';
import Register from './components/Register';
import { setupSessionTimeout } from './security/AuthManager';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Download, Users, ShieldAlert, Clock, Eye, EyeOff, ExternalLink, Copy, CheckCircle2, LogOut, Mail, User, Sun, Moon, Shield, Key, Send, Trash2, Zap, MessageSquare } from 'lucide-react';
import { useDashboardData } from './hooks/useDashboardData';
import { fetchTaskDetails } from './services/onetyApi';
import AdminPanel from './components/AdminPanel';
import MonthlyHistoryModal from './components/MonthlyHistoryModal';
import OperacionalMetricModal from './components/OperacionalMetricModal';

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [activeTab, setActiveTab] = useState('geral');
  const [hideNav, setHideNav] = useState(false);
  const [queueFilter, setQueueFilter] = useState('pendentes');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [visibleCountLogs, setVisibleCountLogs] = useState(10);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [copyToast, setCopyToast] = useState(null);
  const [actionToast, setActionToast] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyModalType, setHistoryModalType] = useState('concluidos');
  const [activeOperacionalModal, setActiveOperacionalModal] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPrPopover, setShowPrPopover] = useState(false);

  // Robust Date Parser for Sorting
  const parseDate = (dateStr) => {
    if (!dateStr) return new Date(0);
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr !== 'string') {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date(0) : d;
    }
    if (dateStr.includes('/')) {
      const [datePart, timePart] = dateStr.split(' ');
      const [day, month, year] = datePart.split('/');
      if (timePart) {
        const [hour, minute] = timePart.split(':');
        return new Date(year, month - 1, day, hour, minute);
      }
      return new Date(year, month - 1, day);
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  // Authentication State Management
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const hashToken = hashParams.get('session_token') || hashParams.get('access_token');
    const hashEmail = hashParams.get('email');
    const hashRole = hashParams.get('role');
    const hashTab = hashParams.get('tab');
    const hideNavParam = hashParams.get('hide_nav');

    if (hashToken) {
      const customSession = {
        access_token: hashToken,
        email: hashEmail || 'usuario@onith.com.br',
        role: hashRole || 'collaborator',
        user: {
          email: hashEmail || 'usuario@onith.com.br',
          role: hashRole || 'collaborator',
          user_metadata: {
            role: hashRole || 'collaborator'
          }
        }
      };
      setSession(customSession);
      setAuthLoading(false);
      
      if (hashTab) {
        setActiveTab(hashTab);
      }
      if (hideNavParam === 'true') {
        setHideNav(true);
      }
      return;
    }

    // Fallback to Supabase Auth for standalone/development usage
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setAuthLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => {
        if (subscription) subscription.unsubscribe();
      };
    } else {
      setAuthLoading(false);
    }
  }, []);

  // Dashboard Data Hook
  const { 
    data: dashboardData, 
    loading, 
    usingMock, 
    metadataMap, 
    auditLogs, 
    loadingLogs,
    fetchAuditLogs,
    toggleContratoAceite,
    updateEmpresaCodigo,
    updateObservacoes,
    updateTaskOverrides,
    dataMesAtual,
    franchiseBasesMap,
    franchiseRoyaltiesMap,
    updateClienteHonorario,
    updateFranchiseRoyaltyConfig,
    fetchLogsByTask,
    toggleTaskBackoffice,
    toggleTaskCancelled,
    refreshData,
    lastUpdated,
    rescisoes,
    toggleRescisaoSetorStatus,
    toggleRescisaoTIStatus,
    deleteRescisaoEntry,
    createRescisaoEntry,
    prTasks
  } = useDashboardData(session, autoRefresh);

  const [taskLogs, setTaskLogs] = useState([]);
  const [loadingTaskLogs, setLoadingTaskLogs] = useState(false);
  const [taskDetailsOnety, setTaskDetailsOnety] = useState(null);
  const [loadingTaskDetailsOnety, setLoadingTaskDetailsOnety] = useState(false);
  // detectedContrato: null = não verificado ainda, true/false = resultado da API
  const [detectedContrato, setDetectedContrato] = useState(null);
  // contratoMap: armazena status de contrato verificado por tarefa para atualizar os cards em tempo real
  const [contratoMap, setContratoMap] = useState({});
  // backofficeMap: armazena status de backoffice verificado por tarefa (Concluído, Contrato Gerado, ou Trâmite Backoffice)
  const [backofficeMap, setBackofficeMap] = useState({});
  const [batchSyncPaused, setBatchSyncPaused] = useState(false);

  const selectedTaskId = selectedTask?.id ?? null;
  const selectedTaskPrId = selectedTask?.pr_id ?? null;

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskLogs([]);
      setDetectedContrato(null);
      setTaskDetailsOnety(null);
      return;
    }

    setLoadingTaskLogs(true);
    fetchLogsByTask(selectedTaskId)
      .then(logs => {
        setTaskLogs(logs);
        setLoadingTaskLogs(false);
      })
      .catch(err => {
        console.error("Erro ao carregar logs da tarefa:", err);
        setLoadingTaskLogs(false);
      });

    setDetectedContrato(null);
    setTaskDetailsOnety(null);
    setLoadingTaskDetailsOnety(true);
    const prIdToFetch = selectedTaskPrId || selectedTaskId;
    fetchTaskDetails(prIdToFetch)
      .then(data => {
        if (data) {
          setTaskDetailsOnety(data);
          const atvs = data.atividades || [];
          const atv1 = atvs.find(a => {
            const txt = (a.texto || a.nome || a.descricao || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return txt.includes('ACEITE') || txt.includes('PROPOSTA') || a.ordem === 1;
          }) || atvs[0];
          const hasAnexoOrDone = atv1 && (
            (Array.isArray(atv1.anexos) && atv1.anexos.length > 0) ||
            (atv1.anexos_count && atv1.anexos_count > 0) ||
            atv1.concluida === true ||
            atv1.concluido === true ||
            !!atv1.dataConclusao ||
            !!atv1.data_conclusao
          );
          const isDone = hasAnexoOrDone === true ? true : false;
          setDetectedContrato(isDone);
          // Atualiza também o mapa do card imediatamente
          setContratoMap(prev => ({ ...prev, [selectedTaskId]: isDone }));

          // Detecção de Backoffice estrita (Apenas se a atividade de comunicação de Backoffice foi concluída)
          const isBackofficeActivity = atvs.some(a => {
            const txt = (a.texto || a.nome || a.descricao || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return txt.includes('BACKOFFICE') && (a.concluida === true || a.concluido === true || !!a.dataConclusao || !!a.data_conclusao);
          });
          if (isBackofficeActivity) {
            setBackofficeMap(prev => ({ ...prev, [selectedTaskId]: true }));
            setSelectedTask(prev => prev && prev.id === selectedTaskId ? { ...prev, is_backoffice: true } : prev);
          }
        } else {
          setDetectedContrato(false);
          setContratoMap(prev => ({ ...prev, [selectedTaskId]: false }));
        }
        setLoadingTaskDetailsOnety(false);
      })
      .catch(err => {
        console.error("Erro ao buscar detalhes da tarefa:", err);
        setLoadingTaskDetailsOnety(false);
      });
  }, [selectedTaskId, selectedTaskPrId]);

  // ─── BATCH SYNC: Varre tarefas pendentes em background para atualizar os cards ───
  useEffect(() => {
    if (!dashboardData || dashboardData.length === 0 || batchSyncPaused) return;

    const runBatchSync = async () => {
      const pending = dashboardData.filter(t => t.status === 'no_prazo' || t.status === 'atrasada');
      if (pending.length === 0) return;

      const BATCH = 5;
      const updates = {};
      const backofficeUpdates = {};

      for (let i = 0; i < pending.length; i += BATCH) {
        const lote = pending.slice(i, i + BATCH);
        await Promise.all(
          lote.map(async (task) => {
            const idToFetch = task.pr_id || task.id;
            try {
              const data = await fetchTaskDetails(idToFetch);
              if (!data) return;
              const atvs = data.atividades || [];
              let isAceiteDone = false;
              for (const atv of atvs) {
                const txt = (atv.texto || atv.nome || atv.descricao || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const isAceiteAtv = txt.includes('ACEITE') || txt.includes('PROPOSTA') || atv.ordem === 1;
                if (isAceiteAtv) {
                  const hasFiles = (Array.isArray(atv.anexos) && atv.anexos.length > 0) || (atv.anexos_count && atv.anexos_count > 0);
                  const isDone = atv.concluida === true || atv.concluido === true || !!atv.dataConclusao || !!atv.data_conclusao;
                  if (hasFiles || isDone) {
                    isAceiteDone = true;
                    break;
                  }
                }
              }
              updates[task.id] = isAceiteDone;

              // Detecção estrita de Backoffice (somente se a atividade foi concluída)
              const isBackofficeActivity = atvs.some(a => {
                const txt = (a.texto || a.nome || a.descricao || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return txt.includes('BACKOFFICE') && (a.concluida === true || a.concluido === true || !!a.dataConclusao || !!a.data_conclusao);
              });
              if (isBackofficeActivity) {
                backofficeUpdates[task.id] = true;
              }
            } catch (err) {
              if (err?.status === 429 || (err?.message || '').includes('429')) {
                setBatchSyncPaused(true);
              }
            }
          })
        );

        if (batchSyncPaused) break;
        if (i + BATCH < pending.length) {
          await new Promise(r => setTimeout(r, 600));
        }
      }

      if (Object.keys(updates).length > 0) {
        setContratoMap(prev => ({ ...prev, ...updates }));
      }
      if (Object.keys(backofficeUpdates).length > 0) {
        setBackofficeMap(prev => ({ ...prev, ...backofficeUpdates }));
      }
    };

    const tId = setTimeout(runBatchSync, 1500);
    const interval = setInterval(runBatchSync, 5 * 60 * 1000);

    return () => {
      clearTimeout(tId);
      clearInterval(interval);
    };
  }, [dashboardData, batchSyncPaused]);


  // Compute duplicate CNPJs dynamically
  const duplicateCnpjs = useMemo(() => {
    const counts = {};
    if (Array.isArray(dashboardData)) {
      dashboardData.forEach(t => {
        if (t.cnpj && t.cnpj !== 'N/A') {
          const cleanCnpj = t.cnpj.replace(/\D/g, '');
          if (cleanCnpj) {
            counts[cleanCnpj] = (counts[cleanCnpj] || 0) + 1;
          }
        }
      });
    }
    const duplicates = new Set();
    Object.keys(counts).forEach(cnpj => {
      if (counts[cnpj] > 1) {
        duplicates.add(cnpj);
      }
    });
    return duplicates;
  }, [dashboardData]);

  useEffect(() => {
    fetchAuditLogs(visibleCountLogs);
  }, [visibleCountLogs]);

  const handleToggleContrato = async (taskId) => {
    const success = await toggleContratoAceite(taskId);
    if (success) {
      setActionToast('Contrato alterado com sucesso!');
      setTimeout(() => setActionToast(null), 3000);
    } else {
      setActionToast('Erro ao atualizar contrato.');
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const handleToggleBackoffice = async (taskId) => {
    const success = await toggleTaskBackoffice(taskId);
    if (success) {
      setActionToast('Status de Backoffice atualizado!');
      setSelectedTask(prev => prev && prev.id === taskId ? { ...prev, is_backoffice: !prev.is_backoffice } : prev);
      setTimeout(() => setActionToast(null), 3000);
    } else {
      setActionToast('Erro ao atualizar Backoffice.');
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const handleToggleCancelled = async (taskId) => {
    const success = await toggleTaskCancelled(taskId);
    if (success) {
      setActionToast('Status de cancelamento atualizado!');
      setSelectedTask(prev => prev && prev.id === taskId ? { ...prev, is_cancelled: !prev.is_cancelled } : prev);
      setTimeout(() => setActionToast(null), 3000);
    } else {
      setActionToast('Erro ao atualizar cancelamento.');
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const [isEditingCodigo, setIsEditingCodigo] = useState(false);
  const [editCodigoVal, setEditCodigoVal] = useState('');

  const [isEditingFranquia, setIsEditingFranquia] = useState(false);
  const [editFranquiaVal, setEditFranquiaVal] = useState('');

  const [isEditingSistema, setIsEditingSistema] = useState(false);
  const [editSistemaVal, setEditSistemaVal] = useState('');
  const [editDetalheBaseVal, setEditDetalheBaseVal] = useState('');

  const [isEditingHonorario, setIsEditingHonorario] = useState(false);
  const [editHonorarioVal, setEditHonorarioVal] = useState('');

  // Sync edit values whenever modal opens or database metadata updates
  useEffect(() => {
    if (selectedTask) {
      const currentCodigo = metadataMap[selectedTask.id]?.empresa_codigo || selectedTask.empresa_codigo || 'N/A';
      const currentFranquia = metadataMap[selectedTask.id]?.franquia_override || selectedTask.franquia || 'Matriz';
      const currentSistema = metadataMap[selectedTask.id]?.sistema_override || selectedTask.software_origem || 'Sem Base';
      const currentDetalheBase = metadataMap[selectedTask.id]?.detalhe_base_override || selectedTask.detalhe_base || '';
      const currentHonorario = metadataMap[selectedTask.id]?.honorario !== undefined && metadataMap[selectedTask.id]?.honorario !== null
        ? metadataMap[selectedTask.id].honorario
        : selectedTask.honorario || 1000.00;

      setEditCodigoVal(currentCodigo);
      setEditFranquiaVal(currentFranquia);
      setEditSistemaVal(currentSistema);
      setEditDetalheBaseVal(currentDetalheBase);
      setEditHonorarioVal(currentHonorario.toString());

      setIsEditingCodigo(false);
      setIsEditingFranquia(false);
      setIsEditingSistema(false);
      setIsEditingHonorario(false);
    }
  }, [selectedTask, metadataMap]);

  const handleUpdateCodigo = async (taskId, newCodigo) => {
    const success = await updateEmpresaCodigo(taskId, newCodigo);
    if (success) {
      setActionToast('Código da empresa atualizado!');
      setSelectedTask(prev => prev ? { ...prev, empresa_codigo: newCodigo.trim() || 'N/A' } : null);
      setIsEditingCodigo(false);
      setTimeout(() => setActionToast(null), 3000);
    } else {
      setActionToast('Erro ao atualizar código.');
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const handleUpdateHonorario = async (taskId, newHonorario) => {
    const val = parseFloat(newHonorario);
    if (isNaN(val) || val < 0) {
      setActionToast('Erro: Valor de honorário inválido.');
      setTimeout(() => setActionToast(null), 3000);
      return;
    }
    const success = await updateClienteHonorario(taskId, val);
    if (success) {
      setActionToast('Honorário do cliente atualizado!');
      setSelectedTask(prev => prev ? { ...prev, honorario: val } : null);
      setIsEditingHonorario(false);
      setTimeout(() => setActionToast(null), 3000);
    } else {
      setActionToast('Erro ao atualizar honorário.');
      setTimeout(() => setActionToast(null), 3000);
    }
  };


  const handleUpdateFranquia = async (taskId, newFranquia) => {
    const success = await updateTaskOverrides(taskId, { franquia: newFranquia });
    if (success) {
      setActionToast('Franquia vinculada com sucesso!');
      setSelectedTask(prev => prev ? { ...prev, franquia: newFranquia.trim() || 'Matriz' } : null);
      setIsEditingFranquia(false);
      setTimeout(() => setActionToast(null), 3000);
    } else {
      setActionToast('Erro ao vincular franquia.');
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const handleUpdateSistemaBase = async (taskId, newSistema, newDetalheBase) => {
    const success = await updateTaskOverrides(taskId, { sistema: newSistema, detalheBase: newDetalheBase });
    if (success) {
      setActionToast('Sistema contábil retificado!');
      setSelectedTask(prev => prev ? { ...prev, software_origem: newSistema, detalhe_base: newDetalheBase } : null);
      setIsEditingSistema(false);
      setTimeout(() => setActionToast(null), 3000);
    } else {
      setActionToast('Erro ao retificar sistema contábil.');
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const [newNoteText, setNewNoteText] = useState('');

  const getInternalNotesList = (rawObs) => {
    if (!rawObs) return [];
    try {
      const parsed = JSON.parse(rawObs);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    if (typeof rawObs === 'string' && rawObs.trim()) {
      return [{
        id: 1,
        autor: 'Registro',
        data_formatada: '',
        texto: rawObs.trim()
      }];
    }
    return [];
  };

  const handleAddQuickNote = async (text) => {
    if (!selectedTask) return;
    const currentObs = metadataMap[selectedTask.id]?.observacoes || selectedTask.observacoes || '';
    const currentList = getInternalNotesList(currentObs);
    const now = new Date();
    const user = isManager ? 'Gerente (TI)' : (userEmail ? userEmail.split('@')[0] : 'Pedro (TI)');
    const newEntry = {
      id: Date.now(),
      autor: user,
      data: now.toISOString(),
      data_formatada: now.toLocaleString('pt-BR'),
      texto: text
    };
    const updatedList = [...currentList, newEntry];
    const payload = JSON.stringify(updatedList);
    const success = await updateObservacoes(selectedTask.id, payload);
    if (success) {
      setActionToast('Strike / Anotação registrada!');
      setTimeout(() => setActionToast(null), 2500);
    }
  };

  const handleAddCustomNote = async () => {
    if (!selectedTask || !newNoteText.trim()) return;
    const currentObs = metadataMap[selectedTask.id]?.observacoes || selectedTask.observacoes || '';
    const currentList = getInternalNotesList(currentObs);
    const now = new Date();
    const user = isManager ? 'Gerente (TI)' : (userEmail ? userEmail.split('@')[0] : 'Pedro (TI)');
    const newEntry = {
      id: Date.now(),
      autor: user,
      data: now.toISOString(),
      data_formatada: now.toLocaleString('pt-BR'),
      texto: newNoteText.trim()
    };
    const updatedList = [...currentList, newEntry];
    const payload = JSON.stringify(updatedList);
    const success = await updateObservacoes(selectedTask.id, payload);
    if (success) {
      setNewNoteText('');
      setActionToast('Anotação interna salva!');
      setTimeout(() => setActionToast(null), 2500);
    }
  };

  const handleDeleteNote = async (indexToDelete) => {
    if (!selectedTask) return;
    const currentObs = metadataMap[selectedTask.id]?.observacoes || selectedTask.observacoes || '';
    const currentList = getInternalNotesList(currentObs);
    const updatedList = currentList.filter((_, idx) => idx !== indexToDelete);
    const payload = updatedList.length > 0 ? JSON.stringify(updatedList) : '';
    await updateObservacoes(selectedTask.id, payload);
  };

  const userEmail = session?.user?.email?.toLowerCase() || '';
  const isAdminEmail = userEmail === 'pedro@cfcontabilidade.com' || 
                       userEmail === 'pedro.freitas@cffranquias.com.br' ||
                       userEmail === 'andre@cfcontabilidade.com' || 
                       userEmail === 'andre.palmeiro@cffranquias.com.br' ||
                       userEmail === 'gabriel@cfcontabilidade.com' ||
                       userEmail === 'gabriel.rozzato@cffranquias.com.br';

  const userRole = session?.user?.user_metadata?.role || 'guest';
  // Felipe (TI) é o Gerente Supremo pelo e-mail ou pela role
  const isManager = userEmail === 'ti@cfcontabilidade.com' || userRole === 'manager';
  const isAdmin = isAdminEmail || userRole === 'administrator' || userRole === 'admin';
  const isGuest = userRole === 'guest';
  const isAuthorized = isManager || isAdmin || userRole === 'collaborator';

  // Security redirect for non-admin/non-manager users
  useEffect(() => {
    if (session && !isManager && !isAdmin) {
      if (activeTab === 'colaboradores' || activeTab === 'historico') {
        setActiveTab('geral');
      }
    }
  }, [activeTab, session, isManager, isAdmin]);

  // Session Timeout
  useEffect(() => {
    if (session) {
      const cleanupTimeout = setupSessionTimeout(() => {
        setSession(null);
      });
      return cleanupTimeout;
    }
  }, [session]);

  // Filtering Logic (The "Functional" Core)
  const filteredQueue = useMemo(() => {
    if (!dashboardData) return [];

    // Normalização sem acentos e minúscula para pesquisa robusta (UX Premium)
    const normalizeStr = (str) => {
      if (!str) return '';
      return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    const cleanSearch = normalizeStr(searchTerm);
    const numericSearch = searchTerm.replace(/\D/g, ''); // Mantém apenas números para busca de CNPJ

    return dashboardData
      .filter(d => {
        if (searchTerm) {
          const cleanEmpresa = normalizeStr(d.empresa_nome);
          const cleanSoftware = normalizeStr(d.software_origem);
          const cleanFranquia = normalizeStr(d.franquia);
          const cleanCnpj = d.cnpj ? d.cnpj.replace(/\D/g, '') : '';

          const matchesSearch = 
            cleanEmpresa.includes(cleanSearch) || 
            cleanSoftware.includes(cleanSearch) || 
            cleanFranquia.includes(cleanSearch) ||
            (numericSearch && cleanCnpj.includes(numericSearch)) ||
            d.cnpj?.toLowerCase().includes(cleanSearch);

          if (!matchesSearch) return false;
        }

        const status = d.status || '';
        const isPending = !status.startsWith('concluida');
        const isCancelled = d.is_cancelled === true;
        const isBackoffice = backofficeMap[d.id] !== undefined ? backofficeMap[d.id] : d.is_backoffice === true;

        if (isCancelled) {
          if (queueFilter !== 'cancelados' && queueFilter !== 'geral') {
            return false;
          }
        } else {
          if (queueFilter === 'cancelados') {
            return false;
          }
        }

        switch (queueFilter) {
          case 'atrasados': return isPending && status === 'atrasada';
          case 'pendentes': return isPending && status !== 'atrasada';
          case 'concluidos': return !isPending;
          case 'backoffice': return isBackoffice;
          case 'cancelados': return isCancelled;
          case 'geral': return true;
          default: return true;
        }
      })
      .sort((a, b) => {
        const statusA = a.status || '';
        const statusB = b.status || '';
        const isPendingA = !statusA.startsWith('concluida');
        const isPendingB = !statusB.startsWith('concluida');

        if (queueFilter === 'atrasados') {
          return parseDate(a.data_prazo) - parseDate(b.data_prazo);
        }
        if (queueFilter === 'pendentes') {
          return parseDate(b.created_at) - parseDate(a.created_at);
        }
        if (queueFilter === 'concluidos') {
          return parseDate(b.data_conclusao || b.created_at) - parseDate(a.data_conclusao || a.created_at);
        }
        if (queueFilter === 'geral' || queueFilter === 'backoffice' || queueFilter === 'cancelados') {
          if (isPendingA && !isPendingB) return -1;
          if (!isPendingA && isPendingB) return 1;
          return parseDate(b.created_at) - parseDate(a.created_at);
        }
        return parseDate(b.created_at) - parseDate(a.created_at);
      });
  }, [dashboardData, searchTerm, queueFilter, metadataMap]);

  // Filters for History Modal (full history from January to today)
  const concludedTasks = useMemo(() => {
    if (!dashboardData) return [];
    return dashboardData.filter(d => {
      const isPending = !(d.status || '').startsWith('concluida');
      return !isPending && d.is_cancelled !== true;
    });
  }, [dashboardData]);

  const cancelledTasks = useMemo(() => {
    if (!dashboardData) return [];
    return dashboardData.filter(d => d.is_cancelled === true);
  }, [dashboardData]);

  // Metrics Calculation
  const metrics = useMemo(() => {
    if (!dashboardData) return { cHoje: 0, cMes: 0, fAtiva: 0, tma: 0, sla: 100, sEscudo: 0 };
    const localDate = new Date();
    const today = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    const cHoje = dashboardData.filter(d => {
      const completedAt = d.data_conclusao || d.created_at;
      const isCompleted = (d.status || '').startsWith('concluida');
      return isCompleted && completedAt && completedAt.startsWith(today);
    }).length;
    const cMes = dataMesAtual?.filter(d => d.status.startsWith('concluida')).length || 0;
    const fAtiva = dashboardData.filter(d => !d.status.startsWith('concluida')).length;
    const cTotal = dashboardData.filter(d => d.status.startsWith('concluida') && d.data_conclusao);
    const tma = cTotal.length > 0 
      ? (cTotal.reduce((acc, curr) => acc + Math.ceil(Math.abs(new Date(curr.data_conclusao) - new Date(curr.created_at)) / (1000 * 60 * 60 * 24)), 0) / cTotal.length).toFixed(1)
      : 0;
    const sla = cTotal.length > 0 ? Math.round((cTotal.filter(d => d.status === 'concluida_no_prazo').length / cTotal.length) * 100) : 100;
    const sEscudo = dashboardData.filter(d => d.status === 'atrasada' && metadataMap[d.id]?.contrato_aceite === false).length;

    return { cHoje, cMes, fAtiva, tma, sla, sEscudo };
  }, [dashboardData, dataMesAtual, metadataMap]);

  const exportToExcel = () => {
    const formattedRows = filteredQueue.map(t => {
      let contratoLabel = 'Sem Contrato';
      if (t.contrato_aceite === true) {
        contratoLabel = 'Com Contrato';
      } else if (t.contrato_aceite === 'manual') {
        contratoLabel = 'Isento (Manual)';
      } else if (t.contrato_aceite === 'isento') {
        contratoLabel = 'Isento';
      }

      return {
        'ID Tarefa': t.id,
        'Cliente': t.empresa_nome || 'N/A',
        'CNPJ': t.cnpj || 'N/A',
        'Unidade / Franquia': t.franquia || 'Matriz',
        'Sistema Contábil': t.software_origem || 'Sem Base',
        'Status (SLA)': t.status.replace(/_/g, ' ').toUpperCase(),
        'Contrato Aceite': contratoLabel,
        'Data de Abertura': t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : 'N/A',
        'Prazo Limite': t.data_prazo ? new Date(t.data_prazo).toLocaleDateString('pt-BR') : 'N/A'
      };
    });

    const ws = XLSX.utils.json_to_sheet(formattedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fila Central TI");
    XLSX.writeFile(wb, `Fila_PRs_TI_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '_')}.xlsx`);
  };

  if (authLoading || loading) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="skeleton-box" style={{ height: '4px', width: '300px', borderRadius: '2px' }}></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sincronizando BI Operacional...</p>
      </div>
    );
  }

  if (!session) {
    if (showRegister) return <Register onBackToLogin={() => setShowRegister(false)} />;
    return <Login onLoginSuccess={setSession} onShowRegister={() => setShowRegister(true)} />;
  }

  // Verificação de Aprovação (Fortaleza Digital) - Só entra se for Gerente ou aprovado explicitamente
  const isApproved = isManager || session.user?.user_metadata?.is_approved === true || session.role === 'collaborator' || session.role === 'manager';
  if (!isApproved) {
    return (
      <div className="auth-container">
        <div className="auth-bg-glow"></div>
        <div className="auth-bg-glow"></div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="auth-card" 
          style={{ textAlign: 'center' }}
        >
          <div className="success-icon-container" style={{ background: 'rgba(245, 158, 11, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <Clock size={40} color="var(--accent-orange)" className="pulse" />
          </div>
          <h2 className="font-outfit">Acesso em Análise</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '1.5rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
            Olá, <strong>{session?.user?.user_metadata?.full_name?.split(' ')[0] || session?.email?.split('@')[0] || 'Usuário'}</strong>!<br/><br/>
            Sua conta foi criada com sucesso, mas o seu acesso ainda está sendo processado pela nossa equipe de TI.<br/><br/>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
              Tente atualizar a página em alguns instantes ou entre em contato com o administrador.
            </span>
          </p>
          <button className="auth-submit" style={{ marginTop: '2.5rem', width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={() => { localStorage.removeItem('session_token'); if (supabase) { supabase.auth.signOut(); } else { window.location.reload(); } }}>
            <LogOut size={18} /> Sair da Conta
          </button>
        </motion.div>
        <div className="auth-footer-tag">
          Desenvolvido por <span>•</span> Pedro Luis
        </div>
      </div>
    );
  }

  const renderModalContent = () => {
    if (!selectedTask) return null;
    const cleanAssunto = (selectedTask.assunto || '').trim().toLowerCase();
    const cleanDescricao = (selectedTask.descricao || '').trim().toLowerCase();
    const isDescIdentical = cleanAssunto === cleanDescricao || !selectedTask.descricao || selectedTask.descricao.trim().length < 20;

    const isFranchise = selectedTask.empresa_nome?.toUpperCase().includes('CF CONTABILIDADE') || selectedTask.assunto?.toUpperCase().includes('CADASTRO DA FRANQUIA');
    const isBackoffice = backofficeMap[selectedTask.id] !== undefined ? backofficeMap[selectedTask.id] : selectedTask.is_backoffice === true;
    const needsContrato = !isBackoffice && !isFranchise;
    const isPending = !(selectedTask.status || '').startsWith('concluida');
    // Detecção direta e instantânea a partir dos anexos carregados da API
    const isAceiteFromDetails = (() => {
      if (!taskDetailsOnety) return null;
      if (Array.isArray(taskDetailsOnety.atividades)) {
        for (const atv of taskDetailsOnety.atividades) {
          const txt = (atv.texto || atv.nome || atv.descricao || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const isAceiteAtv = txt.includes('ACEITE') || txt.includes('PROPOSTA') || atv.ordem === 1;
          if (isAceiteAtv) {
            const hasAnexo = (Array.isArray(atv.anexos) && atv.anexos.length > 0) || (atv.anexos_count && atv.anexos_count > 0);
            const isDone = atv.concluida === true || atv.concluido === true || !!atv.dataConclusao || !!atv.data_conclusao;
            if (hasAnexo || isDone) return true;
          }
        }
        return false;
      }
      return null;
    })();

    // Se detectou anexo no trâmite de Aceite direto da API, prioridade máxima: COM CONTRATO
    const rawContrato = isAceiteFromDetails !== null
      ? isAceiteFromDetails
      : (metadataMap[selectedTask.id]?.contrato_aceite !== undefined
          ? metadataMap[selectedTask.id].contrato_aceite === true
          : (contratoMap[selectedTask.id] !== undefined
              ? contratoMap[selectedTask.id]
              : (detectedContrato !== null ? detectedContrato : (selectedTask.contrato_aceite !== undefined ? selectedTask.contrato_aceite : !isPending))));
    const hasContrato = !needsContrato || rawContrato;

    return (
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* Impedimento de Contrato Alert (Red Block Banner) */}
        {needsContrato && !rawContrato && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.15)', 
            border: '2px solid var(--accent-red)', 
            borderRadius: '16px', 
            padding: '16px 20px', 
            color: '#fff', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '6px',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '900', color: 'var(--accent-red)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>
              <span>🚨 IMPEDIMENTO DE CADASTRO DETECTADO</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: '1.5' }}>
              Esta empresa é de um cliente regular e **requer a assinatura do contrato de aceite** antes que o cadastro possa ser efetuado. Por favor, regularize a assinatura no Onety e atualize o status para prosseguir.
            </p>
          </div>
        )}

        {/* Isenção de Contrato Info Banner */}
        {!needsContrato && (
          <div style={{ 
            background: 'rgba(59, 130, 246, 0.1)', 
            border: '1px dashed rgba(59, 130, 246, 0.3)', 
            borderRadius: '16px', 
            padding: '12px 20px', 
            color: '#fff', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px'
          }}>
            <span style={{ fontSize: '1.2rem' }}>🛡️</span>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>
              Esta empresa está **isenta de contrato de aceite** por ser classificada como {isBackoffice ? <strong>Backoffice</strong> : <strong>Cadastro da Franquia</strong>}. Cadastro liberado.
            </div>
          </div>
        )}

        {/* Premium Header */}
        <div className="premium-modal-header">
          <div className="premium-modal-title-row">
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fila Crítica • Detalhes da Tarefa</span>
              <h2 className="font-outfit" style={{ fontSize: '1.6rem', marginTop: '4px', fontWeight: '800' }}>{selectedTask.empresa_nome}</h2>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', position: 'relative' }}>
              {selectedTask.matched_prs && selectedTask.matched_prs.length > 1 ? (
                <div style={{ position: 'relative' }}>
                  <button 
                    onClick={() => setShowPrPopover(!showPrPopover)}
                    style={{ 
                      color: 'var(--accent-blue)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '6px',
                      background: showPrPopover ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.08)', 
                      border: '1px solid rgba(59, 130, 246, 0.25)', 
                      padding: '0 10px',
                      height: '38px', 
                      borderRadius: '10px', 
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: '700'
                    }} 
                    className="hover-bright" 
                    title={`${selectedTask.matched_prs.length} PRs comerciais encontrados. Clique para escolher.`}
                  >
                    <ExternalLink size={15} />
                    <span>{selectedTask.matched_prs.length} PRs</span>
                  </button>

                  {/* Popover Dropdown com a lista de todos os PRs */}
                  {showPrPopover && (
                    <div 
                      className="glass-panel"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: '320px',
                        background: 'rgba(15, 23, 42, 0.96)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '12px',
                        boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(16px)',
                        padding: '12px',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          PRs Comerciais ({selectedTask.matched_prs.length})
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Escolha qual abrir:</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto', paddingRight: '2px' }}>
                        {selectedTask.matched_prs.map((pr, idx) => (
                          <a
                            key={pr.id || idx}
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.06)',
                              textDecoration: 'none',
                              color: '#fff',
                              transition: 'all 0.15s'
                            }}
                            className="hover-bright"
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', fontSize: '0.8rem', color: 'var(--accent-blue)' }}>
                                PR #{pr.id}
                              </span>
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: pr.is_concluido ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                color: pr.is_concluido ? 'var(--accent-green)' : 'var(--accent-orange)',
                                border: `1px solid ${pr.is_concluido ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`
                              }}>
                                {pr.status}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {pr.assunto}
                            </div>
                            {pr.responsavel && (
                              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                                Resp: {pr.responsavel}
                              </div>
                            )}
                          </a>
                        ))}
                      </div>

                      <a
                        href={`https://cfonety.com.br/gestao/tarefas/${selectedTask.id}/atividades`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          marginTop: '4px',
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(255,255,255,0.08)',
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                        className="hover-bright"
                      >
                        <span>Tarefa Cadastro #{selectedTask.id}</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <a 
                  href={selectedTask.pr_url || (selectedTask.pr_id ? `https://cfonety.com.br/gestao/tarefas/${selectedTask.pr_id}/atividades` : `https://cfonety.com.br/gestao/tarefas/${selectedTask.id}/atividades`)} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', width: '38px', height: '38px', borderRadius: '10px', transition: 'all 0.2s' }} 
                  className="hover-bright" 
                  title={selectedTask.pr_id ? `Abrir PR Comercial #${selectedTask.pr_id} (Entrada de Cliente)` : "Abrir tarefa no Onety"}
                >
                  <ExternalLink size={18} />
                </a>
              )}
              <button onClick={() => { setSelectedTask(null); setShowPrPopover(false); }} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '1.2rem', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }} className="hover-bright">×</button>
            </div>
          </div>

          <div className="premium-chips-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
            {/* CNPJ Chip */}
            <div 
              className="premium-chip"
              onClick={() => {
                navigator.clipboard.writeText(selectedTask.cnpj);
                setCopyToast('modal');
                setTimeout(() => setCopyToast(null), 2000);
              }}
              style={{ cursor: 'pointer' }}
              title="Clique para copiar o CNPJ"
            >
              <span>CNPJ:</span>
              <strong>{selectedTask.cnpj}</strong>
              {copyToast === 'modal' ? <CheckCircle2 size={12} color="var(--accent-green)" /> : <Copy size={12} color="var(--accent-blue)" />}
            </div>

            {/* CÓD Chip */}
            {isEditingCodigo ? (
              <div className="premium-chip no-hover" style={{ padding: '4px 8px' }}>
                <span>CÓD:</span>
                <input 
                  type="text" 
                  value={editCodigoVal} 
                  onChange={(e) => setEditCodigoVal(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: '700', outline: 'none', width: '60px' }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateCodigo(selectedTask.id, editCodigoVal);
                    if (e.key === 'Escape') {
                      setIsEditingCodigo(false);
                      setEditCodigoVal(metadataMap[selectedTask.id]?.empresa_codigo || selectedTask.empresa_codigo || 'N/A');
                    }
                  }}
                />
                <button 
                  onClick={() => handleUpdateCodigo(selectedTask.id, editCodigoVal)}
                  style={{ background: 'var(--accent-green)', border: 'none', color: '#fff', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}
                >
                  OK
                </button>
                <button 
                  onClick={() => {
                    setIsEditingCodigo(false);
                    setEditCodigoVal(metadataMap[selectedTask.id]?.empresa_codigo || selectedTask.empresa_codigo || 'N/A');
                  }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                >
                  X
                </button>
              </div>
            ) : (
              <div 
                className="premium-chip"
                onClick={() => !isGuest && setIsEditingCodigo(true)}
                style={{ cursor: isGuest ? 'default' : 'pointer' }}
                title={isGuest ? '' : 'Clique para alterar o código'}
              >
                <span>CÓD:</span>
                <strong style={{ color: 'var(--accent-blue)' }}>{metadataMap[selectedTask.id]?.empresa_codigo || selectedTask.empresa_codigo || 'N/A'}</strong>
                {!isGuest && <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontWeight: 'normal' }}>(Editar)</span>}
              </div>
            )}

            {/* Honorário Chip */}
            {isEditingHonorario ? (
              <div className="premium-chip no-hover" style={{ padding: '4px 8px' }}>
                <span>R$:</span>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  value={editHonorarioVal} 
                  onChange={(e) => setEditHonorarioVal(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: '700', outline: 'none', width: '70px' }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateHonorario(selectedTask.id, editHonorarioVal);
                    if (e.key === 'Escape') {
                      setIsEditingHonorario(false);
                      setEditHonorarioVal((metadataMap[selectedTask.id]?.honorario !== undefined && metadataMap[selectedTask.id]?.honorario !== null ? metadataMap[selectedTask.id].honorario : selectedTask.honorario || 1000.00).toString());
                    }
                  }}
                />
                <button 
                  onClick={() => handleUpdateHonorario(selectedTask.id, editHonorarioVal)}
                  style={{ background: 'var(--accent-green)', border: 'none', color: '#fff', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}
                >
                  OK
                </button>
                <button 
                  onClick={() => {
                    setIsEditingHonorario(false);
                    setEditHonorarioVal((metadataMap[selectedTask.id]?.honorario !== undefined && metadataMap[selectedTask.id]?.honorario !== null ? metadataMap[selectedTask.id].honorario : selectedTask.honorario || 1000.00).toString());
                  }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                >
                  X
                </button>
              </div>
            ) : (
              <div 
                className="premium-chip"
                onClick={() => !isGuest && setIsEditingHonorario(true)}
                style={{ cursor: isGuest ? 'default' : 'pointer' }}
                title={isGuest ? '' : 'Clique para alterar o valor'}
              >
                <span>HONORÁRIO:</span>
                <strong style={{ color: 'var(--accent-green)' }}>
                  {(metadataMap[selectedTask.id]?.honorario !== undefined && metadataMap[selectedTask.id]?.honorario !== null ? metadataMap[selectedTask.id].honorario : selectedTask.honorario || 1000.00).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
                {!isGuest && <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontWeight: 'normal' }}>(Editar)</span>}
              </div>
            )}

            {/* Abertura Chip */}
            <div className="premium-chip no-hover">
              <span>Abertura por:</span>
              <strong>{selectedTask.cadastrado_por || 'Onety'}</strong>
            </div>

            {/* Contrato Status Button Chip */}
            {needsContrato ? (
              <div 
                className="premium-chip hover-bright"
                onClick={() => !isGuest && handleToggleContrato(selectedTask.id)}
                style={{ 
                  cursor: isGuest ? 'default' : 'pointer',
                  border: `1px solid ${rawContrato === false ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  background: rawContrato === false ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  boxShadow: rawContrato === false ? '0 0 12px rgba(239, 68, 68, 0.15)' : '0 0 12px rgba(16, 185, 129, 0.15)',
                  padding: '6px 14px',
                  borderRadius: '10px'
                }}
                title={isGuest ? '' : 'Clique para alternar o status do contrato'}
              >
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: rawContrato === false ? 'var(--accent-red)' : 'var(--accent-green)',
                  boxShadow: `0 0 8px ${rawContrato === false ? 'var(--accent-red)' : 'var(--accent-green)'}`
                }}></span>
                <strong style={{ color: rawContrato === false ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: '800' }}>
                  {rawContrato === false ? 'SEM CONTRATO' : 'COM CONTRATO'}
                </strong>
              </div>
            ) : (
              <div 
                className="premium-chip no-hover"
                style={{ 
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: 'var(--text-muted)',
                  padding: '6px 14px',
                  borderRadius: '10px'
                }}
                title="Isento de contrato de aceite por ser Backoffice ou Franquia."
              >
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: 'var(--text-muted)',
                  boxShadow: 'none'
                }}></span>
                <strong style={{ fontWeight: '800' }}>ISENTO DE CONTRATO</strong>
              </div>
            )}

            {/* Backoffice Status Toggle Chip */}
            <div 
              className="premium-chip hover-bright"
              onClick={() => !isGuest && handleToggleBackoffice(selectedTask.id)}
              style={{ 
                cursor: isGuest ? 'default' : 'pointer',
                border: `1px solid ${isBackoffice ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.12)'}`,
                background: isBackoffice ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                boxShadow: isBackoffice ? '0 0 12px rgba(139, 92, 246, 0.25)' : 'none',
                padding: '6px 14px',
                borderRadius: '10px'
              }}
              title={isGuest ? '' : 'Clique para alternar o status de Backoffice'}
            >
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: isBackoffice ? 'var(--accent-purple)' : 'var(--text-muted)',
                boxShadow: isBackoffice ? '0 0 8px var(--accent-purple)' : 'none'
              }}></span>
              <strong style={{ color: isBackoffice ? '#a78bfa' : 'var(--text-muted)', fontWeight: '800' }}>
                {isBackoffice ? '⚙️ BACKOFFICE' : 'NÃO BACKOFFICE'}
              </strong>
            </div>


          </div>
        </div>

        {/* CNPJ / PR Duplicates Alert */}
        {(duplicateCnpjs.has(selectedTask.cnpj?.replace(/\D/g, '')) || (selectedTask.matched_prs && selectedTask.matched_prs.length > 1)) && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid rgba(239, 68, 68, 0.25)', 
            borderRadius: '12px', 
            padding: '12px 16px', 
            color: '#fff', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', color: 'var(--accent-red)', fontSize: '0.85rem' }}>
              <span>⚠️ ALERTA: MÚLTIPLOS PRs / CADASTROS DETECTADOS</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              {selectedTask.matched_prs && selectedTask.matched_prs.length > 1 
                ? `Foram encontrados ${selectedTask.matched_prs.length} PRs vinculados a esta empresa/CNPJ. Verifique qual é o correto:`
                : 'Este CNPJ possui outro cadastro registrado no sistema. Valide com o time para evitar duplicidades de processo.'}
            </p>
            {selectedTask.matched_prs && selectedTask.matched_prs.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                {selectedTask.matched_prs.map((pr, idx) => (
                  <a
                    key={pr.id || idx}
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: pr.is_concluido ? 'var(--accent-green)' : 'var(--accent-blue)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.15s'
                    }}
                    className="hover-bright"
                  >
                    <span>PR #{pr.id} ({pr.status})</span>
                    <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Assunto da Tarefa */}
        <div className="premium-section-box">
          <div className="premium-section-title">Assunto da Tarefa</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>
            {selectedTask.assunto || 'N/A'}
          </div>
        </div>

        {/* Franquia & Sistema/Base */}
        <div className="responsive-grid-2" style={{ gap: '1.5rem' }}>
          <div className="premium-section-box" style={{ marginBottom: 0 }}>
            <div className="premium-section-title">Franquia</div>
            {isEditingFranquia ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={editFranquiaVal} 
                  onChange={(e) => setEditFranquiaVal(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', width: '100%', outline: 'none' }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateFranquia(selectedTask.id, editFranquiaVal);
                    if (e.key === 'Escape') {
                      setIsEditingFranquia(false);
                      setEditFranquiaVal(metadataMap[selectedTask.id]?.franquia_override || selectedTask.franquia || 'Matriz');
                    }
                  }}
                />
                <button 
                  onClick={() => handleUpdateFranquia(selectedTask.id, editFranquiaVal)}
                  style={{ background: 'var(--accent-green)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                >
                  Salvar
                </button>
                <button 
                  onClick={() => {
                    setIsEditingFranquia(false);
                    setEditFranquiaVal(metadataMap[selectedTask.id]?.franquia_override || selectedTask.franquia || 'Matriz');
                  }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  X
                </button>
              </div>
            ) : (
              <div 
                onClick={() => !isGuest && setIsEditingFranquia(true)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  fontWeight: '600', 
                  cursor: isGuest ? 'default' : 'pointer',
                  padding: '4px 8px',
                  marginLeft: '-8px',
                  borderRadius: '6px',
                  border: '1px solid transparent',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { if (!isGuest) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; } }}
                onMouseLeave={(e) => { if (!isGuest) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; } }}
              >
                <span>{metadataMap[selectedTask.id]?.franquia_override || selectedTask.franquia || 'Matriz'}</span>
                {!isGuest && <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontWeight: 'normal' }}>(Vincular)</span>}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', marginTop: '6px', fontWeight: '800' }}>
              Esta franquia possui {dashboardData.filter(t => (t.franquia || 'Matriz').toUpperCase() === (metadataMap[selectedTask.id]?.franquia_override || selectedTask.franquia || 'Matriz').toUpperCase()).length} PRs no total
            </div>
          </div>

          <div className="premium-section-box" style={{ marginBottom: 0 }}>
            <div className="premium-section-title">Sistema / Base</div>
            {isEditingSistema ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select 
                  value={editSistemaVal} 
                  onChange={(e) => {
                    setEditSistemaVal(e.target.value);
                    if (e.target.value === 'Domínio') setEditDetalheBaseVal('1');
                    else if (e.target.value === 'Alterdata') setEditDetalheBaseVal('Próprio');
                    else setEditDetalheBaseVal('Sem Base');
                  }}
                  style={{ background: '#17191e', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
                >
                  <option value="Domínio">Domínio</option>
                  <option value="Alterdata">Alterdata</option>
                  <option value="Sem Base">Sem Base</option>
                  <option value="Do Zero">Do Zero</option>
                </select>

                {editSistemaVal === 'Domínio' && (
                  <select 
                    value={editDetalheBaseVal}
                    onChange={(e) => setEditDetalheBaseVal(e.target.value)}
                    style={{ background: '#17191e', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="1">Base 1</option>
                    <option value="2">Base 2</option>
                    <option value="3">Base 3</option>
                    <option value="Sem Base">Sem Base</option>
                  </select>
                )}

                {editSistemaVal === 'Alterdata' && (
                  <select 
                    value={editDetalheBaseVal}
                    onChange={(e) => setEditDetalheBaseVal(e.target.value)}
                    style={{ background: '#17191e', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="Próprio">Alterdata Próprio</option>
                    <option value="Servidor">Alterdata Servidor</option>
                  </select>
                )}

                <button 
                  onClick={() => handleUpdateSistemaBase(selectedTask.id, editSistemaVal, editDetalheBaseVal)}
                  style={{ background: 'var(--accent-green)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                >
                  Salvar
                </button>
                <button 
                  onClick={() => {
                    setIsEditingSistema(false);
                    setEditSistemaVal(metadataMap[selectedTask.id]?.sistema_override || selectedTask.software_origem || 'Sem Base');
                    setEditDetalheBaseVal(metadataMap[selectedTask.id]?.detalhe_base_override || selectedTask.detalhe_base || '');
                  }}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  X
                </button>
              </div>
            ) : (
              <div 
                onClick={() => !isGuest && setIsEditingSistema(true)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  fontWeight: '600', 
                  color: sourceColors[metadataMap[selectedTask.id]?.sistema_override || selectedTask.software_origem] || '#fff',
                  cursor: isGuest ? 'default' : 'pointer',
                  padding: '4px 8px',
                  marginLeft: '-8px',
                  borderRadius: '6px',
                  border: '1px solid transparent',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { if (!isGuest) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; } }}
                onMouseLeave={(e) => { if (!isGuest) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; } }}
              >
                <span>
                  {metadataMap[selectedTask.id]?.sistema_override || selectedTask.software_origem} 
                  {(metadataMap[selectedTask.id]?.detalhe_base_override || selectedTask.detalhe_base) && ` (${metadataMap[selectedTask.id]?.detalhe_base_override || selectedTask.detalhe_base})`}
                </span>
                {!isGuest && <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontWeight: 'normal' }}>(Retificar)</span>}
              </div>
            )}
          </div>
        </div>

        {/* Anexos (Onety) */}
        <div className="premium-section-box">
          <div className="premium-section-title">📎 Anexos e Documentos de Aceite (Onety)</div>
          <div style={{ 
            background: 'rgba(0,0,0,0.15)', 
            border: '1px solid rgba(255,255,255,0.05)', 
            borderRadius: '12px', 
            padding: '1.25rem'
          }}>
            {loadingTaskDetailsOnety ? (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                Carregando documentos anexados...
              </div>
            ) : (() => {
              const modalAnexos = [];
              if (taskDetailsOnety && Array.isArray(taskDetailsOnety.anexos)) {
                for (const a of taskDetailsOnety.anexos) {
                  modalAnexos.push({
                    id: a.id,
                    nome: a.nome || a.nomeArquivo || 'Documento sem nome',
                    url: a.downloadUrl ? `https://back.cfonety.com.br${a.downloadUrl}` : (a.url || `https://back.cfonety.com.br/gestao/anexo/download/${a.id}`),
                    atividade: null
                  });
                }
              }
              if (taskDetailsOnety && Array.isArray(taskDetailsOnety.atividades)) {
                for (const atv of taskDetailsOnety.atividades) {
                  if (Array.isArray(atv.anexos)) {
                    for (const a of atv.anexos) {
                      modalAnexos.push({
                        id: a.id,
                        nome: a.nomeArquivo || a.nome || 'Documento sem nome',
                        url: a.downloadUrl ? `https://back.cfonety.com.br${a.downloadUrl}` : (a.url || `https://back.cfonety.com.br/gestao/anexo/download/${a.id}`),
                        atividade: atv.texto || atv.nome || 'Trâmite'
                      });
                    }
                  }
                }
              }

              if (modalAnexos.length > 0) {
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                    {modalAnexos.map((a, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: '600' }}>{a.nome}</span>
                          {a.atividade && <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', opacity: 0.9 }}>{a.atividade}</span>}
                        </div>
                        <a 
                          href={a.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ 
                            padding: '6px 12px', 
                            background: 'rgba(59, 130, 246, 0.15)', 
                            color: 'var(--accent-blue)', 
                            border: '1px solid rgba(59, 130, 246, 0.3)', 
                            borderRadius: '6px', 
                            fontSize: '0.75rem', 
                            fontWeight: '700',
                            textDecoration: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          ⬇ Baixar
                        </a>
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Nenhum arquivo anexado a esta tarefa.
                </div>
              );
            })()}
          </div>
        </div>

        {/* Anotações Internas & Controle de Strikes / Acompanhamento */}
        <div className="premium-section-box" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: 0 }}>
          <div className="premium-section-title">
            📝 Anotações Internas & Acompanhamento de Franqueados
          </div>

          {/* Quick Action Chips / Strikes */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '2px' }}>
              Atalhos de Strike & Acompanhamento:
            </span>
            <button
              type="button"
              onClick={() => handleAddQuickNote('⚡ Strike 1 - Contatado franqueado sem retorno')}
              style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(234, 179, 8, 0.12)',
                color: 'var(--accent-orange)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              className="hover-bright"
            >
              ⚡ Strike 1 (Sem retorno)
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickNote('⚡ Strike 2 - Cobrança pendente / Sem resposta')}
              style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(249, 115, 22, 0.12)',
                color: '#f97316',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              className="hover-bright"
            >
              ⚡ Strike 2 (2º Aviso)
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickNote('🚨 Strike 3 - Notificação final / Alerta de cancelamento')}
              style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--accent-red)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              className="hover-bright"
            >
              🚨 Strike 3 (Crítico)
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickNote('⏳ Em análise - Necessário mais tempo para validação técnica')}
              style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--accent-blue)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              className="hover-bright"
            >
              ⏳ Mais tempo de análise
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickNote('📞 Franqueado contatado via WhatsApp / E-mail')}
              style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--accent-green)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              className="hover-bright"
            >
              📞 Contatado Franqueado
            </button>
          </div>

          {/* Form to add custom comment / note */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Escreva uma anotação interna (ex: motivo de espera, histórico com franqueado)..."
              rows={2}
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '10px 12px',
                color: '#fff',
                fontSize: '0.85rem',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleAddCustomNote();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddCustomNote}
              disabled={!newNoteText.trim()}
              style={{
                background: newNoteText.trim() ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                color: newNoteText.trim() ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '10px',
                padding: '0 16px',
                fontWeight: '700',
                fontSize: '0.8rem',
                cursor: newNoteText.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                alignSelf: 'stretch',
                transition: 'all 0.2s'
              }}
              className={newNoteText.trim() ? 'hover-bright' : ''}
            >
              <Send size={14} />
              <span>Salvar</span>
            </button>
          </div>

          {/* Internal Notes Feed / List */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '12px',
            maxHeight: '260px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {getInternalNotesList(metadataMap[selectedTask.id]?.observacoes || selectedTask.observacoes).length > 0 ? (
              getInternalNotesList(metadataMap[selectedTask.id]?.observacoes || selectedTask.observacoes).map((note, idx) => {
                const isStrike1 = (note.texto || '').includes('Strike 1');
                const isStrike2 = (note.texto || '').includes('Strike 2');
                const isStrike3 = (note.texto || '').includes('Strike 3');
                const isAnalise = (note.texto || '').includes('Em análise');
                
                return (
                  <div
                    key={note.id || idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      padding: '8px 12px',
                      background: isStrike3 
                        ? 'rgba(239, 68, 68, 0.08)' 
                        : isStrike2 
                          ? 'rgba(249, 115, 22, 0.08)' 
                          : isStrike1 
                            ? 'rgba(234, 179, 8, 0.08)' 
                            : isAnalise
                              ? 'rgba(59, 130, 246, 0.08)'
                              : 'rgba(255, 255, 255, 0.02)',
                      borderRadius: '8px',
                      border: `1px solid ${
                        isStrike3 
                          ? 'rgba(239, 68, 68, 0.25)' 
                          : isStrike2 
                            ? 'rgba(249, 115, 22, 0.25)' 
                            : isStrike1 
                              ? 'rgba(234, 179, 8, 0.25)' 
                              : isAnalise
                                ? 'rgba(59, 130, 246, 0.25)'
                                : 'rgba(255, 255, 255, 0.04)'
                      }`
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>
                          {note.autor || 'TI'}
                        </strong>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {note.data_formatada || (note.data ? new Date(note.data).toLocaleString('pt-BR') : '')}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#fff', margin: 0, lineHeight: '1.4', wordBreak: 'break-word' }}>
                        {note.texto}
                      </p>
                    </div>
                    {!isGuest && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          opacity: 0.6,
                          transition: 'opacity 0.2s',
                          marginLeft: '8px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent-red)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        title="Remover anotação"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', opacity: 0.7, textAlign: 'center', padding: '1rem' }}>
                Nenhuma anotação interna registrada para este cadastro. Use os atalhos ou campo acima para registrar strikes e observações.
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {!hideNav && (
        <header className="main-header">
          <div className="logo-section">
            <div className="logo-v">V</div>
            <div className="font-outfit">
              <h1 style={{ fontSize: '1.2rem', lineHeight: 1, color: 'var(--text-main)' }}>TI Central Hub</h1>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Gestão Operacional, SLA & Analytics</span>
            </div>
          </div>
  
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            {/* TV Office Auto-Refresh Toggle Switch */}
            <div 
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                background: 'var(--bg-glass)', 
                border: '1px solid var(--border-light)', 
                padding: '6px 14px', 
                borderRadius: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: autoRefresh ? '0 0 16px rgba(34, 197, 94, 0.12)' : 'none',
                backdropFilter: 'blur(10px)'
              }}
              title="Modo Office TV (Auto-refresh de 60 segundos)"
              className="hover-bright"
            >
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: autoRefresh ? '#22c55e' : '#64748b',
                boxShadow: autoRefresh ? '0 0 8px #22c55e, 0 0 15px #22c55e' : 'none',
                display: 'inline-block',
                animation: autoRefresh ? 'pulse 2s infinite' : 'none'
              }}></span>
              <span style={{ fontSize: '0.7rem', fontWeight: '800', letterSpacing: '0.5px', color: autoRefresh ? '#22c55e' : 'var(--text-muted)' }}>
                {autoRefresh ? 'MODO TV ATIVO' : 'MODO TV INATIVO'}
              </span>
            </div>
  
            {/* Live Sync Indicator LED Badge */}
            <div 
              className="live-sync-indicator" 
              onClick={async () => {
                if (isRefreshing) return;
                setIsRefreshing(true);
                await refreshData();
                setIsRefreshing(false);
              }}
              title="Sincronização em tempo real. Clique para forçar atualização agora."
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                background: 'var(--bg-glass)', 
                border: '1px solid var(--border-light)', 
                padding: '6px 14px', 
                borderRadius: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <span className="sync-dot" style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isRefreshing ? 'var(--accent-blue)' : 'var(--accent-green)',
                boxShadow: isRefreshing ? '0 0 8px var(--accent-blue), 0 0 15px var(--accent-blue)' : '0 0 8px var(--accent-green), 0 0 15px var(--accent-green)',
                display: 'inline-block',
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
              }}></span>
              <span style={{ fontSize: '0.7rem', fontWeight: '800', letterSpacing: '0.5px', color: isRefreshing ? 'var(--accent-blue)' : 'var(--accent-green)' }}>
                {isRefreshing ? 'SINCRONIZANDO...' : `SYNC: ${lastUpdated instanceof Date ? lastUpdated.toLocaleTimeString('pt-BR') : '--:--:--'}`}
              </span>
            </div>
  
            {/* Theme Toggle Button */}
            <div 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'var(--bg-glass)', 
                border: '1px solid var(--border-light)', 
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                backdropFilter: 'blur(10px)',
                boxShadow: 'var(--shadow-premium)'
              }}
              title={theme === 'dark' ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro'}
              className="hover-bright"
            >
              {theme === 'dark' ? (
                <Sun size={18} color="var(--accent-orange)" />
              ) : (
                <Moon size={18} color="var(--accent-blue)" />
              )}
            </div>
  
            <div className="tab-group">
              <button className={`tab-btn ${activeTab === 'geral' ? 'active' : ''}`} onClick={() => setActiveTab('geral')}>Operacional</button>
              {(isManager || isAdmin) && <button className={`tab-btn ${activeTab === 'colaboradores' ? 'active' : ''}`} onClick={() => setActiveTab('colaboradores')}>Equipe</button>}
              {(isManager || isAdmin) && <button className={`tab-btn ${activeTab === 'historico' ? 'active' : ''}`} onClick={() => setActiveTab('historico')}>Histórico</button>}
              {isAuthorized && <button className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>Gestão</button>}
              {isAuthorized && <button className={`tab-btn ${activeTab === 'saidas' ? 'active' : ''}`} onClick={() => setActiveTab('saidas')} style={activeTab === 'saidas' ? { background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' } : {}}>
                Saídas {(() => {
                  if (!rescisoes) return null;
                  const seen = new Set();
                  const uniqueCount = rescisoes.filter(r => {
                    const key = `${r.cnpj || ''}-${r.cliente_nome || ''}`.toUpperCase().replace(/\D/g, '');
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return !r.finalizado;
                  }).length;
                  return uniqueCount > 0 ? (
                    <span style={{ background: 'var(--accent-red)', color: '#fff', borderRadius: '50%', padding: '1px 6px', fontSize: '0.65rem', fontWeight: '800', marginLeft: '4px' }}>
                      {uniqueCount}
                    </span>
                  ) : null;
                })()}
              </button>}
            </div>
  
            <div className="profile-menu" onClick={() => setShowProfileModal(true)} style={{ cursor: 'pointer' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>{session?.user?.user_metadata?.full_name || session?.email || 'Usuário TI'}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {isManager ? 'Gerente' : (isGuest ? 'Visitante' : 'Colaborador')}
                </div>
              </div>
              <User size={20} color="var(--accent-blue)" />
            </div>
          </div>
        </header>
      )}

      <main className="dashboard-main">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
            {activeTab === 'geral' ? (
              <>
                {/* 1. Top Metrics */}
                <div className="metric-row">
                  <MetricCard 
                    title="Entregas Hoje" 
                    value={metrics.cHoje} 
                    subtitle="Concluídas nas últimas 24h" 
                    accentColor="var(--accent-green)" 
                    onClick={() => setActiveOperacionalModal('hoje')}
                    glowClass="glow-green"
                  />
                  <MetricCard 
                    title="Eficiência Mês" 
                    value={metrics.cMes} 
                    subtitle="Total processado no mês" 
                    accentColor="var(--accent-blue)" 
                    onClick={() => setActiveOperacionalModal('mes')}
                    glowClass="glow-blue"
                  />
                  <MetricCard 
                    title="Fila Ativa" 
                    value={metrics.fAtiva} 
                    subtitle="Pendentes de cadastro" 
                    accentColor="var(--accent-orange)" 
                    onClick={() => setActiveOperacionalModal('fila')}
                    glowClass="glow-orange"
                  />
                  <MetricCard 
                    title="Taxa de SLA" 
                    value={`${metrics.sla}%`} 
                    subtitle="Conformidade de prazo" 
                    accentColor={metrics.sla > 90 ? "var(--accent-green)" : "var(--accent-red)"} 
                    onClick={() => setActiveOperacionalModal('sla')}
                    glowClass={metrics.sla > 90 ? "glow-green" : "glow-red"}
                  />
                </div>

                {/* 2. Operational Charts */}
                <div className="content-grid">
                  <div className="glass-panel breakdown-card">
                    <MonthlyTrendChart data={dashboardData} />
                  </div>
                  <div className="glass-panel breakdown-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h3 className="font-outfit">Distribuição por Sistema</h3>
                    </div>
                    <div className="scroll-list">
                      <SourceBreakdown data={dataMesAtual} franchiseBasesMap={franchiseBasesMap} allTasks={dashboardData} />
                    </div>
                  </div>
                </div>

                {/* 3. The Critical Queue (The Heart of the System) */}
                <div className="glass-panel" style={{ padding: '2.5rem' }}>
                  {/* High Visibility Search Row */}
                  {/* Refined Premium Search Row */}
                  <div style={{ marginBottom: '2.5rem', background: 'var(--bg-glass-subtle, rgba(255,255,255,0.03))', padding: '1rem', borderRadius: '16px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-premium)' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <Search size={22} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-blue)', pointerEvents: 'none', opacity: 0.7 }} />
                      <input 
                        type="text" 
                        placeholder="Pesquisar por empresa, cnpj ou franquia..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                        style={{ 
                          background: 'var(--bg-input, rgba(255,255,255,0.05))', 
                          border: '1px solid var(--border-input, rgba(255,255,255,0.1))', 
                          borderRadius: '12px', 
                          padding: '14px 20px 14px 56px', 
                          color: 'var(--text-main)', 
                          width: '100%', 
                          fontSize: '1.1rem', 
                          fontWeight: '600',
                          outline: 'none',
                          transition: 'all 0.3s ease',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                        }}
                        onFocus={(e) => { e.target.style.background = 'var(--bg-input-focus, rgba(255,255,255,0.1))'; e.target.style.borderColor = 'var(--accent-blue)'; }}
                        onBlur={(e) => { e.target.style.background = 'var(--bg-input, rgba(255,255,255,0.05))'; e.target.style.borderColor = 'var(--border-input, rgba(255,255,255,0.1))'; }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '2rem' }}>
                    <div>
                      <h2 className="font-outfit" style={{ fontSize: '1.8rem' }}>Fila Crítica & Controle de SLA</h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Monitoramento em tempo real de PRs e conformidade contratual.</p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="tab-btn btn-excel" onClick={exportToExcel} style={{ margin: 0, height: '38px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }} title="Exportar PRs atuais da fila em planilha Excel">
                        <Download size={14} /> EXCEL
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-glass-subtle, rgba(255,255,255,0.03))', padding: '8px 16px', borderRadius: '12px', height: '38px' }}>
                         <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '900' }}>TOTAL:</span>
                         <span style={{ fontSize: '0.9rem', color: 'var(--accent-blue)', fontWeight: '800' }}>{filteredQueue.length} {filteredQueue.length === 1 ? 'PR' : 'PRs'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-glass-subtle, rgba(255,255,255,0.03))', padding: '8px 16px', borderRadius: '12px' }}>
                         <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '900' }}>REGISTROS:</span>
                         <select 
                           value={visibleCount} 
                           onChange={(e) => setVisibleCount(Number(e.target.value))}
                           style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', fontSize: '0.9rem', fontWeight: '800', outline: 'none', cursor: 'pointer' }}
                         >
                           <option value={10}>10</option>
                           <option value={50}>50</option>
                           <option value={100}>100</option>
                           <option value={500}>500+</option>
                         </select>
                      </div>
                      <div className="tab-group" style={{ background: 'var(--bg-glass-subtle, rgba(255,255,255,0.03))', padding: '6px' }}>
                        <button className={`tab-btn ${queueFilter === 'pendentes' ? 'active' : ''}`} onClick={() => setQueueFilter('pendentes')} style={{ fontSize: '0.75rem', padding: '10px 20px' }}>⏳ PENDENTES</button>
                        <button className={`tab-btn ${queueFilter === 'atrasados' ? 'active' : ''}`} onClick={() => setQueueFilter('atrasados')} style={{ fontSize: '0.75rem', padding: '10px 20px' }}>⚠️ ATRASADOS</button>
                        <button className={`tab-btn ${queueFilter === 'backoffice' ? 'active' : ''}`} onClick={() => setQueueFilter('backoffice')} style={{ fontSize: '0.75rem', padding: '10px 20px' }}>⚙️ BACKOFFICE</button>
                        <button className={`tab-btn ${queueFilter === 'concluidos' ? 'active' : ''}`} onClick={() => setQueueFilter('concluidos')} style={{ fontSize: '0.75rem', padding: '10px 20px' }}>✔️ CONCLUÍDOS</button>
                        <button className={`tab-btn ${queueFilter === 'cancelados' ? 'active' : ''}`} onClick={() => setQueueFilter('cancelados')} style={{ fontSize: '0.75rem', padding: '10px 20px' }}>❌ CANCELADOS</button>
                        <button className={`tab-btn ${queueFilter === 'geral' ? 'active' : ''}`} onClick={() => setQueueFilter('geral')} style={{ fontSize: '0.75rem', padding: '10px 20px' }}>📦 GERAL</button>
                      </div>
                    </div>
                  </div>

                  <div className="task-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(350px, 100%), 1fr))', gap: '1.5rem' }}>
                    {filteredQueue.slice(0, visibleCount).map((d, i) => {
                      const status = d.status || '';
                      const isPending = !status.startsWith('concluida');
                      const isFranchise = d.empresa_nome?.toUpperCase().includes('CF CONTABILIDADE') || d.assunto?.toUpperCase().includes('CADASTRO DA FRANQUIA');
                      const isBackoffice = backofficeMap[d.id] !== undefined ? backofficeMap[d.id] : d.is_backoffice === true;
                      const needsContrato = !isBackoffice && !isFranchise;
                      
                      const cleanName = (name) => (name || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(CF|CONTABILIDADE|FRANQUIA|LTDA|ME|EPP|EIRELI|UNIDADE|BASE|S\/S|S\.S\.|SEDE|ESC|CENTRO|FRANQUEADO)\b/g, '').replace(/[^A-Z0-9]/g, ' ').trim().replace(/\s+/g, ' ');
                      const currentCleanName = cleanName(d.empresa_nome);
                      
                      const matchedPr = prTasks?.find(pr => {
                        const prCnpj = (pr.cliente?.cnpj || pr.empresa?.cnpj || pr.cnpj || '').replace(/\D/g, '');
                        const taskCnpjClean = (d.cnpj || '').replace(/\D/g, '');
                        
                        // 1. Prioridade Máxima: CNPJ completo de 14 dígitos (diferencia Matriz 0001 de Filiais 0002, 0003...)
                        if (prCnpj && taskCnpjClean && prCnpj.length >= 14 && taskCnpjClean.length >= 14) {
                          return prCnpj === taskCnpjClean;
                        }

                        // 2. Fallback por nome exato limpo
                        const prCleanName = cleanName(pr.cliente?.nome || pr.empresa?.nome || pr.nome || '');
                        if (prCleanName && currentCleanName && prCleanName === currentCleanName) return true;

                        // 3. Fallback secundário por radical de 8 dígitos apenas se CNPJ estiver incompleto
                        if (prCnpj && taskCnpjClean && (prCnpj.length < 14 || taskCnpjClean.length < 14)) {
                          const prRadical = prCnpj.substring(0, 8);
                          const taskRadical = taskCnpjClean.substring(0, 8);
                          if (prRadical === taskRadical && prCleanName && currentCleanName && (prCleanName.includes(currentCleanName) || currentCleanName.includes(prCleanName))) {
                            return true;
                          }
                        }
                        return false;
                      });

                      const getTaskTotalAnexos = (task) => {
                        if (!task) return 0;
                        let total = task.anexos_count || (Array.isArray(task.anexos) ? task.anexos.length : 0);
                        if (Array.isArray(task.atividades)) {
                          for (const atv of task.atividades) {
                            total += atv.anexos_count || (Array.isArray(atv.anexos) ? atv.anexos.length : 0);
                          }
                        }
                        return total;
                      };

                      const hasAutoContrato = getTaskTotalAnexos(matchedPr) > 0 || getTaskTotalAnexos(d) > 0;
                      
                      const rawContrato = contratoMap[d.id] !== undefined 
                        ? contratoMap[d.id] 
                        : (metadataMap[d.id]?.contrato_aceite !== undefined
                            ? metadataMap[d.id].contrato_aceite === true 
                            : (d.contrato_aceite !== undefined ? d.contrato_aceite : (hasAutoContrato ? true : !isPending)));
                      const hasContrato = !needsContrato || rawContrato;
                      const isCancelled = d.is_cancelled === true;
                      const delay = Math.max(1, Math.floor((new Date() - new Date(d.created_at || d.data_prazo || new Date())) / (1000 * 60 * 60 * 24)));
                      
                      return (
                        <motion.div 
                          key={d.id || i}
                          layout
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`task-item ${d.status === 'atrasada' && !isCancelled ? 'pulse' : ''}`}
                          onClick={() => setSelectedTask(d)}
                          style={{ position: 'relative', overflow: 'hidden' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                              <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '4px', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{d.empresa_nome}</h4>
                              <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: '600', marginBottom: '8px', opacity: 0.9 }}>{d.franquia}</div>
                              <div style={{ display: 'flex', gap: '8px 12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div 
                                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-glass-subtle, rgba(255,255,255,0.03))', padding: '2px 8px', borderRadius: '6px' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(d.cnpj);
                                    setCopyToast(d.id);
                                    setTimeout(() => setCopyToast(null), 2000);
                                  }}
                                >
                                  {copyToast === d.id ? <CheckCircle2 size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                                  <span>{d.cnpj}</span>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: sourceColors[d.software_origem] || 'var(--accent-blue)', fontWeight: '700' }}>{d.software_origem.toUpperCase()}</span>
                                <span style={{ 
                                  fontSize: '0.72rem', 
                                  fontWeight: '800', 
                                  color: (metadataMap[d.id]?.empresa_codigo || d.empresa_codigo) && (metadataMap[d.id]?.empresa_codigo || d.empresa_codigo) !== 'N/A' ? 'var(--accent-blue)' : 'var(--accent-orange)', 
                                  background: (metadataMap[d.id]?.empresa_codigo || d.empresa_codigo) && (metadataMap[d.id]?.empresa_codigo || d.empresa_codigo) !== 'N/A' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(245, 158, 11, 0.08)', 
                                  padding: '2px 8px', 
                                  borderRadius: '6px',
                                  border: `1px solid ${(metadataMap[d.id]?.empresa_codigo || d.empresa_codigo) && (metadataMap[d.id]?.empresa_codigo || d.empresa_codigo) !== 'N/A' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                                  letterSpacing: '0.5px'
                                }}>
                                  CÓD: {metadataMap[d.id]?.empresa_codigo || d.empresa_codigo || 'N/A'}
                                </span>
                              </div>
                              {duplicateCnpjs.has(d.cnpj?.replace(/\D/g, '')) && (
                                <div style={{ marginTop: '8px' }}>
                                  <span style={{ 
                                    fontSize: '0.68rem', 
                                    fontWeight: '800', 
                                    color: 'var(--accent-red)', 
                                    background: 'rgba(239, 68, 68, 0.12)', 
                                    padding: '2px 8px', 
                                    borderRadius: '6px',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    letterSpacing: '0.5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    ⚠️ PR DUPLICADO
                                  </span>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                              <span className={`task-badge ${(d.status || '').startsWith('concluida') ? 'badge-green' : d.status === 'atrasada' ? 'badge-red' : 'badge-orange'}`}>
                                {(d.status || '').replace(/_/g, ' ').toUpperCase()} {d.status === 'atrasada' && `(${delay}D)`}
                              </span>
                              {isCancelled && (
                                <span className="task-badge badge-red" style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)' }}>
                                  ❌ CANCELADO
                                </span>
                              )}
                              {isBackoffice && (
                                <span className="task-badge badge-purple" style={{ background: 'rgba(139, 92, 246, 0.2)', border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)' }}>
                                  ⚙️ BACKOFFICE
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                              <User size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.colaborador}>{d.colaborador}</span>
                            </div>
                            {needsContrato ? (
                              <motion.div 
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => { 
                                  e.preventDefault();
                                  e.stopPropagation(); 
                                  handleToggleContrato(d.id); 
                                }}
                                style={{ 
                                  display: 'flex', alignItems: 'center', 
                                  background: rawContrato ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  padding: '8px 16px', borderRadius: '30px', 
                                  border: `2px solid ${rawContrato ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                                  cursor: 'pointer',
                                  zIndex: 100,
                                  position: 'relative',
                                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                                  flexShrink: 0
                                }}
                              >
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: rawContrato ? 'var(--accent-green)' : 'var(--accent-red)', marginRight: '8px', flexShrink: 0 }}></div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: '900', color: rawContrato ? 'var(--accent-green)' : 'var(--accent-red)', pointerEvents: 'none', lineHeight: 1.1 }}>
                                    {rawContrato ? 'COM CONTRATO' : 'SEM CONTRATO'}
                                  </span>
                                  {rawContrato && (
                                    <span style={{ fontSize: '0.58rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none', textTransform: 'uppercase', marginTop: '2px', letterSpacing: '0.5px' }}>
                                      {metadataMap[d.id]?.contrato_aceite !== undefined
                                        ? '✍️ Manual'
                                        : (hasAutoContrato ? '🤖 Via Anexo' : '✓ Via Conclusão')}
                                    </span>
                                  )}
                                </div>
                              </motion.div>
                            ) : (
                              <div 
                                style={{ 
                                  display: 'flex', alignItems: 'center', gap: '8px', 
                                  background: 'var(--bg-glass-subtle, rgba(255,255,255,0.04))',
                                  padding: '8px 16px', borderRadius: '30px', 
                                  border: '1px solid var(--border-light)',
                                  color: 'var(--text-muted)',
                                  fontSize: '0.75rem',
                                  fontWeight: '800',
                                  flexShrink: 0
                                }}
                                title="Empresa isenta de contrato de aceite por ser Backoffice ou Franquia."
                              >
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }}></div>
                                <span>ISENTO DE CONTRATO</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {filteredQueue.length > visibleCount && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
                      <button className="tab-btn" onClick={() => setVisibleCount(prev => prev + 12)} style={{ padding: '12px 40px', background: 'var(--accent-blue)', color: '#fff' }}>Carregar Mais PRs</button>
                    </div>
                  )}
                </div>
              </>
            ) : activeTab === 'colaboradores' ? (
              <div className="glass-panel" style={{ padding: '2.5rem' }}>
                <ColaboradoresDashboard data={dashboardData} todayDateStr={new Date().toISOString().split('T')[0]} />
              </div>
            ) : activeTab === 'historico' ? (
              <div className="glass-panel" style={{ padding: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                   <div>
                     <h2 className="font-outfit">Audit Log (Histórico de Segurança)</h2>
                     <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Rastreabilidade de todas as alterações manuais no dashboard.</p>
                   </div>
                   
                   <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '8px 16px', borderRadius: '12px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '900' }}>ALTERAÇÕES:</span>
                        <select 
                          value={visibleCountLogs} 
                          onChange={(e) => setVisibleCountLogs(Number(e.target.value))}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-orange)', fontSize: '0.9rem', fontWeight: '800', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value={10}>10</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={500}>500+</option>
                        </select>
                     </div>
                     <ShieldAlert size={24} color="var(--accent-orange)" />
                   </div>
                </div>

                <div className="scroll-list" style={{ maxHeight: '550px', overflowY: 'auto', paddingRight: '10px' }}>
                  {loadingLogs && auditLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>Sincronizando Logs...</div>
                  ) : auditLogs?.map(log => (
                    <motion.div 
                      key={log.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      style={{ padding: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontWeight: '600', marginBottom: '4px', fontSize: '0.95rem' }}>{log.empresa || 'N/A'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <strong>{log.changed_by || 'Usuário'}</strong> alterou para <span style={{ color: log.new_value === 'Com Contrato' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 'bold' }}>{(log.new_value || '').toUpperCase()}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                        <div>{log.created_at ? new Date(log.created_at).toLocaleDateString() : ''}</div>
                        <div style={{ opacity: 0.5 }}>{log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}</div>
                      </div>
                    </motion.div>
                  ))}
                  
                  {auditLogs.length >= visibleCountLogs && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', paddingBottom: '1rem' }}>
                       <button 
                         className="tab-btn" 
                         onClick={() => setVisibleCountLogs(prev => prev + 20)}
                         style={{ padding: '10px 30px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-orange)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
                       >
                         {loadingLogs ? 'Carregando...' : 'Carregar mais logs'}
                       </button>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'saidas' ? (
              (() => {
                const seen = new Set();
                const uniqueRescisoes = (rescisoes || []).filter(r => {
                  const key = `${r.cnpj || ''}-${r.cliente_nome || ''}`.toUpperCase().replace(/\D/g, '');
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });

                return (
                  <div className="glass-panel" style={{ padding: '2.5rem' }}>
                    <div style={{ marginBottom: '2rem' }}>
                      <h2 className="font-outfit" style={{ marginBottom: '0.5rem' }}>Fluxo de Saída de Clientes</h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Acompanhamento de rescisões. Quando todos os setores (DP, Fiscal, Contábil) concluírem, a inativação pelo TI é liberada.
                      </p>
                    </div>

                    {(!uniqueRescisoes || uniqueRescisoes.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <p style={{ fontSize: '1.1rem' }}>Nenhuma rescisão registrada.</p>
                        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Os registros de saída são criados pelo Backoffice Hub.</p>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cliente</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CNPJ</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Competência</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>DP</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fiscal</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Contábil</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>TI (Sistemas)</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uniqueRescisoes.map((r) => {
                              const setores = r.setores || {};
                              const dpOk = !setores.dp?.envolvido || setores.dp?.concluido;
                              const fiscalOk = !setores.fiscal?.envolvido || setores.fiscal?.concluido;
                              const contabilOk = !setores.contabil?.envolvido || setores.contabil?.concluido;
                              const allSetoresOk = dpOk && fiscalOk && contabilOk;
                              const tiConcluido = setores.ti?.concluido || false;
                              const isFinalizado = r.finalizado || tiConcluido;

                              const renderSetorBadge = (setor, label) => {
                                if (!setores[setor]?.envolvido) return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>N/A</span>;
                                return (
                                  <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '0.7rem',
                                    fontWeight: '700',
                                    background: setores[setor]?.concluido ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                    color: setores[setor]?.concluido ? 'var(--accent-green)' : 'var(--accent-orange)',
                                    border: `1px solid ${setores[setor]?.concluido ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {setores[setor]?.concluido ? '✓ Concluído' : '⏳ Pendente'}
                                  </span>
                                );
                              };

                              return (
                                <tr key={r.id} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                  <td 
                                    style={{ padding: '12px 16px', cursor: 'pointer' }}
                                    onClick={() => {
                                      const matchedTask = dashboardData.find(d => d.cnpj && d.cnpj.replace(/\D/g, '') === (r.cnpj || '').replace(/\D/g, ''));
                                      if (matchedTask) {
                                        setSelectedTask(matchedTask);
                                      } else {
                                        setSelectedTask({
                                          id: r.id,
                                          empresa_nome: r.cliente_nome,
                                          cnpj: r.cnpj || 'N/A',
                                          franquia: 'Matriz',
                                          software_origem: 'Rescisão',
                                          status: 'rescisao',
                                          created_at: r.created_at || new Date().toISOString(),
                                          descricao: `Processo de rescisão e desligamento de cliente. Motivo: ${r.motivo || 'Não especificado'}. Competência de saída: ${r.competencia_saida || 'N/A'}.`,
                                          colaborador: 'Backoffice / TI',
                                          is_cancelled: false,
                                          contrato_aceite: true
                                        });
                                      }
                                    }}
                                  >
                                    <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }} className="hover-bright">
                                      <span>{r.cliente_nome || 'N/A'}</span>
                                      <span style={{ fontSize: '0.65rem', opacity: 0.5, fontWeight: 'normal' }}>(Detalhes)</span>
                                    </div>
                                    {r.motivo && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{r.motivo}</div>}
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.cnpj || 'N/A'}</td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{r.competencia_saida || 'N/A'}</td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>{renderSetorBadge('dp', 'DP')}</td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>{renderSetorBadge('fiscal', 'Fiscal')}</td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>{renderSetorBadge('contabil', 'Contábil')}</td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                    {allSetoresOk ? (
                                      <button
                                        onClick={() => toggleRescisaoTIStatus(r)}
                                        style={{
                                          padding: '6px 14px',
                                          borderRadius: '6px',
                                          fontSize: '0.7rem',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          border: tiConcluido ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
                                          background: tiConcluido ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                          color: tiConcluido ? 'var(--accent-green)' : 'var(--accent-blue)',
                                          transition: 'all 0.2s'
                                        }}
                                      >
                                        {tiConcluido ? '✓ Inativado' : '⚡ Inativar Sistemas'}
                                      </button>
                                    ) : (
                                       <span style={{ 
                                         padding: '5px 12px', 
                                         borderRadius: '6px', 
                                         fontSize: '0.7rem', 
                                         fontWeight: '700', 
                                         background: 'rgba(255,255,255,0.03)', 
                                         color: 'rgba(255,255,255,0.4)', 
                                         border: '1px solid rgba(255,255,255,0.06)',
                                         whiteSpace: 'nowrap',
                                         display: 'inline-flex',
                                         alignItems: 'center',
                                         gap: '6px',
                                         justifyContent: 'center'
                                       }}>
                                         <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>🔒</span> Aguardando Setores
                                       </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                    <span style={{
                                      padding: '4px 12px',
                                      borderRadius: '20px',
                                      fontSize: '0.7rem',
                                      fontWeight: '700',
                                      background: isFinalizado ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                      color: isFinalizado ? 'var(--accent-green)' : 'var(--accent-red)',
                                      border: `1px solid ${isFinalizado ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {isFinalizado ? '✓ Finalizado' : '⚠ Em Andamento'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="glass-panel" style={{ padding: '2.5rem' }}>
                <AdminPanel session={session} />
              </div>
            )}
          </motion.div>
      </main>

      {/* Task Detail Modal */}
      <AnimatePresence>
        {selectedTask && (
          <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-panel modal-content"
              onClick={e => e.stopPropagation()}
            >
              {renderModalContent()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Monthly History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <MonthlyHistoryModal
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            tasks={historyModalType === 'concluidos' ? concludedTasks : cancelledTasks}
            type={historyModalType}
            onSelectTask={setSelectedTask}
          />
        )}
      </AnimatePresence>

      {/* Operacional Metric Details Modal */}
      <AnimatePresence>
        {activeOperacionalModal && (
          <OperacionalMetricModal
            isOpen={!!activeOperacionalModal}
            onClose={() => setActiveOperacionalModal(null)}
            type={activeOperacionalModal}
            data={dashboardData}
            dataMesAtual={dataMesAtual}
            isGuest={isGuest}
          />
        )}
      </AnimatePresence>

      {/* User Profile Details Modal */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)} style={{ zIndex: 9999 }}>
          <div 
            className="glass-panel modal-content" 
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '90%',
              padding: '2.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.75rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Top Close Button */}
            <button 
              onClick={() => setShowProfileModal(false)} 
              style={{ 
                position: 'absolute', 
                top: '1.25rem', 
                right: '1.25rem', 
                background: 'none', 
                border: 'none', 
                color: 'var(--text-muted)', 
                fontSize: '1.5rem', 
                cursor: 'pointer' 
              }}
            >
              ×
            </button>

            {/* Header User Badge block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <div 
                style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '50%', 
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '1.8rem',
                  fontWeight: '800',
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
                }}
              >
                {(session?.user?.user_metadata?.full_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 className="font-outfit" style={{ fontSize: '1.35rem', color: 'var(--text-main)', fontWeight: '900', margin: 0 }}>
                  {session?.user?.user_metadata?.full_name || 'Usuário TI'}
                </h3>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                  Membro do HUB de TI
                </span>
              </div>
            </div>

            {/* Info Cards Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.015)' }}>
                <Mail size={16} color="var(--accent-blue)" />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Endereço de E-mail</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: '600' }}>{session?.user?.email || session?.email}</span>
                </div>
              </div>

              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.015)' }}>
                <Shield size={16} color="var(--accent-green)" />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Função & Permissão</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span className={`status-badge ${isManager ? 'badge-orange' : (isGuest ? 'badge-teal' : 'badge-green')}`} style={{ fontSize: '0.62rem', padding: '2px 8px' }}>
                      {isManager ? 'Administrador' : (isGuest ? 'Visitante' : 'Colaborador')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.015)' }}>
                <CheckCircle2 size={16} color="var(--accent-green)" />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Status da Conta</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--accent-green)', fontWeight: '800' }}>ATIVO & AUTORIZADO</span>
                </div>
              </div>
            </div>

            {/* Actions Block */}
            <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem', marginTop: '4px' }}>
              <button 
                onClick={() => setShowProfileModal(false)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-main)',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)'
                }}
                className="hover-bright"
              >
                Voltar ao Painel
              </button>
              <button 
                onClick={() => {
                  setShowProfileModal(false);
                  localStorage.removeItem('session_token');
                  if (supabase) { supabase.auth.signOut(); } else { window.location.reload(); }
                }}
                style={{
                  flex: 1,
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  color: 'var(--accent-red)',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                className="hover-bright"
              >
                <LogOut size={14} /> Finalizar Sessão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Action Toast */}
      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20, x: 20 }}
            style={{ 
              position: 'fixed', 
              top: '20px', 
              right: '20px', 
              background: actionToast.includes('Erro') ? 'var(--accent-red)' : 'var(--accent-green)', 
              color: '#fff', 
              padding: '16px 24px', 
              borderRadius: '12px', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)', 
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontWeight: '700',
              fontFamily: 'Outfit, sans-serif'
            }}
          >
            {actionToast.includes('Erro') ? <ShieldAlert size={20} /> : <CheckCircle2 size={20} />}
            {actionToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
