import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Search, DollarSign, Users, Award, Eye, EyeOff, AlertCircle, Edit, Settings, ChevronRight } from 'lucide-react';
import RoyaltiesMetricModal from './RoyaltiesMetricModal';

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/');
    if (timePart) {
      const [hour, minute] = timePart.split(':');
      return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10));
    }
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }
  return new Date(dateStr);
};

export default function RoyaltiesDashboard({ 
  data = [], 
  franchiseBasesMap = {}, 
  franchiseRoyaltiesMap = {}, 
  updateFranchiseRoyaltyConfig,
  onSelectTask,
  isManager = false,
  isGuest = false,
  onOpenHistoryModal
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterType, setFilterType] = useState('MENSAL'); // MENSAL or ANUAL
  const [defaultFixedRoyalty, setDefaultFixedRoyalty] = useState('530.00');
  const [defaultVariablePercentage, setDefaultVariablePercentage] = useState('12.00');
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFranchiseFilter, setSelectedFranchiseFilter] = useState('TODAS');
  const [viewMode, setViewMode] = useState('CONSOLIDADO'); // CONSOLIDADO or DETALHADO
  const [sortConfig, setSortConfig] = useState({ key: 'clientCount', direction: 'desc' });
  const [detailedSortConfig, setDetailedSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [expandedFranchise, setExpandedFranchise] = useState(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [visibleCountDetailed, setVisibleCountDetailed] = useState(15);
  const [activeRoyaltiesModal, setActiveRoyaltiesModal] = useState(null);

  // States for Franchise Config Edit Modal
  const [editingFranchise, setEditingFranchise] = useState(null);
  const [editingFixedVal, setEditingFixedVal] = useState('');
  const [editingPercentageVal, setEditingPercentageVal] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // States for Export Consolidado Popup Modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedExportFranchises, setSelectedExportFranchises] = useState({});
  const [searchExportFranchise, setSearchExportFranchise] = useState('');
  const [exportModalType, setExportModalType] = useState('CONSOLIDADO'); // 'CONSOLIDADO' or 'DETALHADO'
  const [exportMonthFilter, setExportMonthFilter] = useState('ALL'); // 'ALL' or specific month (e.g., '2026-06')

  // Generate dynamic list of months from January of current selectedMonth's year up to selectedMonth
  const exportMonthsList = useMemo(() => {
    if (!selectedMonth) return [];
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const maxMonth = parseInt(monthStr, 10); // 1-12
    
    const months = [];
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    for (let m = 1; m <= maxMonth; m++) {
      months.push({
        value: `${year}-${String(m).padStart(2, '0')}`,
        label: `${monthNames[m - 1]} de ${year}`
      });
    }
    return months;
  }, [selectedMonth]);

  // Sync edits when modal opens
  useEffect(() => {
    if (editingFranchise) {
      const config = franchiseRoyaltiesMap[editingFranchise.toUpperCase()] || {};
      setEditingFixedVal(config.fixedRoyalty !== undefined ? config.fixedRoyalty.toString() : defaultFixedRoyalty);
      setEditingPercentageVal(config.variablePercentage !== undefined ? config.variablePercentage.toString() : defaultVariablePercentage);
    }
  }, [editingFranchise, franchiseRoyaltiesMap, defaultFixedRoyalty, defaultVariablePercentage]);

  // Reset pagination on search or filter change
  useEffect(() => {
    setVisibleCount(15);
    setVisibleCountDetailed(15);
  }, [searchTerm, selectedMonth, filterType, onlyCompleted, selectedFranchiseFilter, viewMode]);

  // Compile unique list of franchises from mapping database and active task logs
  const allFranchises = useMemo(() => {
    const mapKeys = Object.keys(franchiseBasesMap); // uppercase
    const taskFranchises = data.map(d => (d.franquia || 'Matriz').toUpperCase());
    const union = new Set([...mapKeys, ...taskFranchises]);
    
    // Ignore invalid/lixo keys and placeholder patterns
    const list = Array.from(union).filter(name => {
      if (!name) return false;
      const clean = name.trim().toUpperCase();
      if (clean.length <= 2) return false; // ignore single letters or short placeholders like 'CF', 'A A'
      if (/^([A-Z0-9\-\.\/])\s\1$/.test(clean)) return false; // ignore 'A A', '0 0', '- -', '. .' etc.
      if (/^[^A-Z0-9]+$/.test(clean)) return false; // ignore strings with only symbols/spaces
      
      const blacklist = ['SEM EMPRESAS', 'RELAÇÃO DE GRUPOS DE EMPRESAS', 'SEM BASE REGISTRADA', 'FRANQUIA EXEMPLO', 'OUTRA FRANQUIA', 'MAIS UMA'];
      if (blacklist.includes(clean)) return false;
      return true;
    });

    return list.sort();
  }, [franchiseBasesMap, data]);

  // Aggregate clients and royalty calculations in selected period
  const aggregatedData = useMemo(() => {
    if (!selectedMonth) return [];
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed

    const defFixed = parseFloat(defaultFixedRoyalty) || 0;
    const defPercent = parseFloat(defaultVariablePercentage) || 0;

    return allFranchises.map(franchiseName => {
      // Find all tasks matching this franchise
      const franchiseTasks = data.filter(d => (d.franquia || 'Matriz').toUpperCase() === franchiseName);

      // Filter tasks falling into the period range
      const periodTasks = franchiseTasks.filter(d => {
        const createdDate = parseDate(d.created_at);
        if (!createdDate || isNaN(createdDate.getTime())) return false;

        // Status compliance filter
        if (onlyCompleted && !d.status.startsWith('concluida')) return false;

        const createdYear = createdDate.getFullYear();
        const createdMonth = createdDate.getMonth();

        if (filterType === 'MENSAL') {
          return createdYear === year && createdMonth === month;
        } else {
          // ANUAL: from Jan of that year up to query month
          return createdYear === year && createdMonth <= month;
        }
      });

      // Find system mapped in table
      const baseAssigned = franchiseBasesMap[franchiseName] || 'Sem Base';
      let system = 'Sem Base';
      if (baseAssigned.includes('Domínio')) system = 'Domínio';
      else if (baseAssigned.includes('Alterdata')) system = 'Alterdata';

      const clientCount = periodTasks.length;
      
      // Load configuration overrides for this franchise
      const config = franchiseRoyaltiesMap[franchiseName] || {};
      const fixedRoyalty = config.fixedRoyalty !== undefined ? config.fixedRoyalty : defFixed;
      const variablePercentage = config.variablePercentage !== undefined ? config.variablePercentage : defPercent;

      // Calculate variable royalties: Sum of 12% (or percentage) of each client's honorario
      const variableRoyalty = periodTasks.reduce((acc, t) => {
        const honorario = t.honorario !== undefined ? t.honorario : 0.00;
        return acc + (honorario * (variablePercentage / 100));
      }, 0);

      // Rule Selection: Max(Fixed, Variable)
      let royaltyValue = 0;
      let appliedRule = 'N/A';
      if (clientCount > 0) {
        if (variableRoyalty > fixedRoyalty) {
          royaltyValue = variableRoyalty;
          appliedRule = 'VARIÁVEL';
        } else {
          royaltyValue = fixedRoyalty;
          appliedRule = 'FIXO';
        }
      }

      return {
        franchise: franchiseName,
        base: baseAssigned,
        system,
        clientCount,
        fixedRoyalty,
        variablePercentage,
        variableRoyalty,
        royaltyValue,
        appliedRule,
        tasks: periodTasks
      };
    });
  }, [allFranchises, data, franchiseBasesMap, franchiseRoyaltiesMap, selectedMonth, filterType, onlyCompleted, defaultFixedRoyalty, defaultVariablePercentage]);

  // Extract list of all individual clients in selected period
  const detailedClients = useMemo(() => {
    const clientsList = [];
    aggregatedData.forEach(item => {
      // Filter by franchise if selected
      if (selectedFranchiseFilter !== 'TODAS' && item.franchise !== selectedFranchiseFilter) {
        return;
      }
      item.tasks.forEach(task => {
        const honorario = task.honorario !== undefined ? task.honorario : 1000.00;
        const calcRoyalty = honorario * (item.variablePercentage / 100);

        clientsList.push({
          ...task,
          franchiseName: item.franchise,
          base: item.base,
          system: item.system,
          honorario,
          percentage: item.variablePercentage,
          calcRoyalty
        });
      });
    });
    return clientsList;
  }, [aggregatedData, selectedFranchiseFilter]);

  // Filters for Consolidated View
  const searchedConsolidated = useMemo(() => {
    return aggregatedData.filter(item => {
      const cleanSearch = searchTerm.toLowerCase();
      
      // Respect selected franchise filter in consolidated view too
      if (selectedFranchiseFilter !== 'TODAS' && item.franchise !== selectedFranchiseFilter) {
        return false;
      }

      return (
        item.franchise.toLowerCase().includes(cleanSearch) ||
        item.base.toLowerCase().includes(cleanSearch) ||
        item.system.toLowerCase().includes(cleanSearch)
      );
    });
  }, [aggregatedData, searchTerm, selectedFranchiseFilter]);

  // Filters for Detailed View
  const searchedDetailed = useMemo(() => {
    return detailedClients.filter(item => {
      const cleanSearch = searchTerm.toLowerCase();
      const cleanCnpj = item.cnpj ? item.cnpj.replace(/\D/g, '') : '';
      const numericSearch = searchTerm.replace(/\D/g, '');

      const empresaNome = item.empresa_nome || item.empresa?.nome || 'N/A';
      const cnpjVal = item.cnpj || 'N/A';
      const franchiseNameVal = item.franchiseName || 'Matriz';
      const systemVal = item.system || 'Sem Base';
      const baseVal = item.base || 'Sem Base';

      return (
        empresaNome.toLowerCase().includes(cleanSearch) ||
        cnpjVal.toLowerCase().includes(cleanSearch) ||
        (numericSearch && cleanCnpj.includes(numericSearch)) ||
        franchiseNameVal.toLowerCase().includes(cleanSearch) ||
        systemVal.toLowerCase().includes(cleanSearch) ||
        baseVal.toLowerCase().includes(cleanSearch)
      );
    });
  }, [detailedClients, searchTerm]);

  // Sort Consolidated
  const sortedConsolidated = useMemo(() => {
    const sorted = [...searchedConsolidated];
    if (sortConfig.key) {
      sorted.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (typeof valA === 'string') {
          return sortConfig.direction === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        }
        
        return sortConfig.direction === 'asc' 
          ? valA - valB 
          : valB - valA;
      });
    }
    return sorted;
  }, [searchedConsolidated, sortConfig]);

  // Sort Detailed Clients
  const sortedDetailed = useMemo(() => {
    const sorted = [...searchedDetailed];
    if (detailedSortConfig.key) {
      sorted.sort((a, b) => {
        let valA = a[detailedSortConfig.key];
        let valB = b[detailedSortConfig.key];

        if (typeof valA === 'string') {
          return detailedSortConfig.direction === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        }
        if (detailedSortConfig.key === 'created_at') {
          return detailedSortConfig.direction === 'asc'
            ? parseDate(valA) - parseDate(valB)
            : parseDate(valB) - parseDate(valA);
        }
        
        return detailedSortConfig.direction === 'asc' 
          ? valA - valB 
          : valB - valA;
      });
    }
    return sorted;
  }, [searchedDetailed, detailedSortConfig]);

  // Top Metrics Calculation
  const metrics = useMemo(() => {
    const activeFranchises = aggregatedData.filter(item => item.clientCount > 0).length;
    const totalClients = aggregatedData.reduce((acc, curr) => acc + curr.clientCount, 0);
    const totalRoyalties = aggregatedData.reduce((acc, curr) => acc + curr.royaltyValue, 0);

    let entriesCount = 0;
    let exitsCount = 0;
    let entriesBrl = 0;
    let exitsBrl = 0;

    if (selectedMonth) {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const qYear = parseInt(yearStr, 10);
      const qMonth = parseInt(monthStr, 10) - 1;

      // Entradas: criadas neste mês
      data.forEach(t => {
        const createdDate = parseDate(t.created_at);
        if (createdDate && !isNaN(createdDate.getTime())) {
          if (createdDate.getFullYear() === qYear && createdDate.getMonth() === qMonth) {
            entriesCount += 1;
            const honorario = t.honorario !== undefined ? t.honorario : 1000.00;
            // Assumimos taxa padrão de 12% para impacto financeiro de evolução
            entriesBrl += honorario * 0.12;
          }
        }

        // Saídas: canceladas ou inativas neste mês
        const rawStatus = (t.status || '').toUpperCase();
        const isCanceledInOnety = rawStatus.startsWith('CANCEL') || rawStatus.startsWith('REPROV');
        
        // Se contrato foi inativado
        const isMetadataInactive = t.contrato_aceite === false;

        if (isCanceledInOnety || isMetadataInactive) {
          const exitDateStr = t.data_conclusao || t.created_at;
          const exitDate = parseDate(exitDateStr);
          if (exitDate && !isNaN(exitDate.getTime())) {
            if (exitDate.getFullYear() === qYear && exitDate.getMonth() === qMonth) {
              exitsCount += 1;
              const honorario = t.honorario !== undefined ? t.honorario : 1000.00;
              exitsBrl += honorario * 0.12;
            }
          }
        }
      });
    }

    const saldoBrl = entriesBrl - exitsBrl;

    return { 
      activeFranchises, 
      totalClients, 
      totalRoyalties, 
      entriesCount, 
      exitsCount, 
      saldoBrl 
    };
  }, [aggregatedData, data, selectedMonth]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const requestDetailedSort = (key) => {
    let direction = 'asc';
    if (detailedSortConfig.key === key && detailedSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setDetailedSortConfig({ key, direction });
  };

  // Save changes from franchise configuration modal
  const handleSaveFranchiseConfig = async () => {
    if (!editingFranchise) return;
    const fixed = parseFloat(editingFixedVal);
    const percent = parseFloat(editingPercentageVal);
    if (isNaN(fixed) || fixed < 0 || isNaN(percent) || percent < 0) {
      alert('Por favor, insira valores numéricos válidos.');
      return;
    }

    setIsSavingConfig(true);
    const success = await updateFranchiseRoyaltyConfig(editingFranchise, fixed, percent);
    setIsSavingConfig(false);

    if (success) {
      setEditingFranchise(null);
    } else {
      alert('Erro ao salvar parametrização da franquia.');
    }
  };

  // Open Export Consolidado Modal
  const handleExportConsolidado = () => {
    setExportModalType('CONSOLIDADO');
    const initialMap = {};
    sortedConsolidated.forEach(item => {
      initialMap[item.franchise] = true;
    });
    setSelectedExportFranchises(initialMap);
    setSearchExportFranchise('');
    setIsExportModalOpen(true);
  };

  const handleToggleAllExport = (checkAll) => {
    const nextMap = {};
    sortedConsolidated.forEach(item => {
      nextMap[item.franchise] = checkAll;
    });
    setSelectedExportFranchises(nextMap);
  };

  const handleConfirmExportConsolidado = () => {
    const selectedRows = sortedConsolidated.filter(item => selectedExportFranchises[item.franchise]);
    if (selectedRows.length === 0) {
      alert('Por favor, selecione ao menos uma franquia para exportação.');
      return;
    }

    const formattedRows = selectedRows.map(item => ({
      'Franquia': item.franchise,
      'Base Cadastrada': item.base,
      'Sistema': item.system,
      'Quantidade Clientes (Período)': item.clientCount,
      'Royalties Fixo Contrato (R$)': item.fixedRoyalty,
      'Royalties Variável Calculado (R$)': item.variableRoyalty,
      'Regra Aplicada': item.appliedRule,
      'Total Royalties Devido (R$)': item.royaltyValue
    }));

    const ws = XLSX.utils.json_to_sheet(formattedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumo Royalties");

    ws['!cols'] = [
      { wch: 35 }, // Franquia
      { wch: 22 }, // Base
      { wch: 15 }, // Sistema
      { wch: 28 }, // Clientes
      { wch: 24 }, // Fixo
      { wch: 28 }, // Variavel
      { wch: 18 }, // Regra
      { wch: 24 }  // Total devido
    ];

    const filePeriod = filterType === 'MENSAL' ? selectedMonth : `${selectedMonth.split('-')[0]}_Acumulado`;
    XLSX.writeFile(wb, `Relatorio_Royalties_Consolidado_${filterType}_${filePeriod}.xlsx`);
    setIsExportModalOpen(false);
  };

  // Open Export Detalhado Modal
  const handleExportDetalhado = () => {
    setExportModalType('DETALHADO');
    setExportMonthFilter(selectedMonth); // Default is current dashboard selected month
    const initialMap = {};
    sortedConsolidated.forEach(item => {
      initialMap[item.franchise] = true;
    });
    setSelectedExportFranchises(initialMap);
    setSearchExportFranchise('');
    setIsExportModalOpen(true);
  };

  // Confirm Export Detalhado
  const handleConfirmExportDetalhado = () => {
    const selectedFranchisesList = Object.keys(selectedExportFranchises).filter(k => selectedExportFranchises[k]);
    if (selectedFranchisesList.length === 0) {
      alert('Por favor, selecione ao menos uma franquia para exportação.');
      return;
    }

    const [yearStr, monthStr] = selectedMonth.split('-');
    const currentYear = parseInt(yearStr, 10);
    const currentMonthIndex = parseInt(monthStr, 10) - 1; // 0-indexed

    const defFixed = parseFloat(defaultFixedRoyalty) || 0;
    const defPercent = parseFloat(defaultVariablePercentage) || 0;

    const exportClientsList = [];

    selectedFranchisesList.forEach(franchiseName => {
      // Find all tasks matching this franchise
      const franchiseTasks = data.filter(d => (d.franquia || 'Matriz').toUpperCase() === franchiseName.toUpperCase());

      // Filter tasks falling into the period range
      const periodTasks = franchiseTasks.filter(d => {
        const createdDate = parseDate(d.created_at);
        if (!createdDate || isNaN(createdDate.getTime())) return false;

        // Status compliance filter
        if (onlyCompleted && !d.status.startsWith('concluida')) return false;

        const createdYear = createdDate.getFullYear();
        const createdMonth = createdDate.getMonth(); // 0-indexed

        if (exportMonthFilter === 'ALL') {
          // From January of this year to the current selected month
          return createdYear === currentYear && createdMonth <= currentMonthIndex;
        } else {
          // Specific selected month (e.g. '2026-06')
          const [expYearStr, expMonthStr] = exportMonthFilter.split('-');
          const expYear = parseInt(expYearStr, 10);
          const expMonth = parseInt(expMonthStr, 10) - 1;
          return createdYear === expYear && createdMonth === expMonth;
        }
      });

      // Find system mapped in table
      const baseAssigned = franchiseBasesMap[franchiseName] || 'Sem Base';
      let system = 'Sem Base';
      if (baseAssigned.includes('Domínio')) system = 'Domínio';
      else if (baseAssigned.includes('Alterdata')) system = 'Alterdata';

      // Load configuration overrides for this franchise
      const config = franchiseRoyaltiesMap[franchiseName] || {};
      const variablePercentage = config.variablePercentage !== undefined ? config.variablePercentage : defPercent;

      periodTasks.forEach(task => {
        const honorario = task.honorario !== undefined ? task.honorario : 1000.00;
        const calcRoyalty = honorario * (variablePercentage / 100);

        exportClientsList.push({
          ...task,
          franchiseName,
          base: baseAssigned,
          system,
          honorario,
          percentage: variablePercentage,
          calcRoyalty
        });
      });
    });

    // Sort by creation date descending
    const sortedExport = [...exportClientsList].sort((a, b) => {
      return parseDate(b.created_at) - parseDate(a.created_at);
    });

    const formattedRows = sortedExport.map(item => ({
      'Razão Social / Cliente': item.empresa_nome,
      'CNPJ': item.cnpj,
      'Código ERP': item.empresa_codigo,
      'Franquia Vinculada': item.franchiseName,
      'Sistema Origem': item.system,
      'Base de Dados': item.base,
      'Data de Cadastro': parseDate(item.created_at)?.toLocaleDateString('pt-BR'),
      'Valor do Honorário (R$)': item.honorario,
      'Alíquota de Royalties (%)': item.percentage,
      'Royalties Gerado (R$)': item.calcRoyalty
    }));

    const ws = XLSX.utils.json_to_sheet(formattedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalhes Clientes");

    ws['!cols'] = [
      { wch: 35 }, // Empresa
      { wch: 20 }, // CNPJ
      { wch: 15 }, // Codigo ERP
      { wch: 28 }, // Franquia
      { wch: 18 }, // Sistema
      { wch: 18 }, // Base
      { wch: 18 }, // Data
      { wch: 22 }, // Honorario
      { wch: 22 }, // Aliquota
      { wch: 22 }  // Royalties
    ];

    const filePeriod = exportMonthFilter === 'ALL' ? `${yearStr}_Jan_ate_${monthStr}` : exportMonthFilter;
    const franchiseLabel = selectedFranchisesList.length === allFranchises.length
      ? 'Todas_Franquias'
      : selectedFranchisesList.length === 1
        ? selectedFranchisesList[0].replace(/ /g, '_')
        : 'Franquias_Selecionadas';

    XLSX.writeFile(wb, `Relatorio_Royalties_Detalhado_${franchiseLabel}_${filePeriod}.xlsx`);
    setIsExportModalOpen(false);
  };

  const handleConfirmExport = () => {
    if (exportModalType === 'CONSOLIDADO') {
      handleConfirmExportConsolidado();
    } else {
      handleConfirmExportDetalhado();
    }
  };

  const handleExportFranchiseDetailed = (item) => {
    const formattedRows = item.tasks.map(task => {
      const honorario = task.honorario !== undefined ? task.honorario : 1000.00;
      const calcRoyalty = honorario * (item.variablePercentage / 100);

      return {
        'Razão Social / Cliente': task.empresa_nome,
        'CNPJ': task.cnpj,
        'Código ERP': task.empresa_codigo,
        'Franquia Vinculada': item.franchise,
        'Sistema Origem': item.system,
        'Base de Dados': item.base,
        'Data de Cadastro': parseDate(task.created_at)?.toLocaleDateString('pt-BR'),
        'Valor do Honorário (R$)': honorario,
        'Alíquota de Royalties (%)': item.variablePercentage,
        'Royalties Gerado (R$)': calcRoyalty
      };
    });

    const ws = XLSX.utils.json_to_sheet(formattedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");

    ws['!cols'] = [
      { wch: 35 }, // Empresa
      { wch: 20 }, // CNPJ
      { wch: 15 }, // Codigo ERP
      { wch: 28 }, // Franquia
      { wch: 18 }, // Sistema
      { wch: 18 }, // Base
      { wch: 18 }, // Data
      { wch: 22 }, // Honorario
      { wch: 22 }, // Aliquota
      { wch: 22 }  // Royalties
    ];

    const filePeriod = filterType === 'MENSAL' ? selectedMonth : `${selectedMonth.split('-')[0]}_Acumulado`;
    const franchiseLabel = item.franchise.replace(/ /g, '_');
    XLSX.writeFile(wb, `Relatorio_Royalties_Detalhado_${franchiseLabel}_${filterType}_${filePeriod}.xlsx`);
  };

  const handleExportMapeamentoGeral = () => {
    const formattedRows = allFranchises.map(franchiseName => {
      const baseAssigned = franchiseBasesMap[franchiseName] || 'Sem Base';
      let system = 'Sem Base';
      if (baseAssigned.includes('Domínio')) system = 'Domínio';
      else if (baseAssigned.includes('Alterdata')) system = 'Alterdata';

      const franchiseTasks = data.filter(d => (d.franquia || 'Matriz').toUpperCase() === franchiseName.toUpperCase());
      
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1;
      const periodTasks = franchiseTasks.filter(d => {
        const createdDate = parseDate(d.created_at);
        if (!createdDate || isNaN(createdDate.getTime())) return false;
        const createdYear = createdDate.getFullYear();
        const createdMonth = createdDate.getMonth();
        return createdYear === year && createdMonth === month;
      });

      return {
        'Franquia': franchiseName,
        'Base Vinculada': baseAssigned,
        'Sistema Contábil': system,
        'Total de Clientes (Histórico)': franchiseTasks.length,
        'Clientes Ativos no Mês': periodTasks.length
      };
    });

    const ws = XLSX.utils.json_to_sheet(formattedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapeamento Geral");

    ws['!cols'] = [
      { wch: 35 }, // Franquia
      { wch: 22 }, // Base Vinculada
      { wch: 20 }, // Sistema Contábil
      { wch: 26 }, // Total Histórico
      { wch: 24 }  // Ativos no Mês
    ];

    XLSX.writeFile(wb, `Planilha_Prioridade_Mapeamento_Geral_${selectedMonth}.xlsx`);
  };

  const systemColors = {
    'Domínio': '#3b82f6',
    'Alterdata': '#8b5cf6',
    'Sem Base': '#64748b'
  };

  return (
    <div className="royalties-container" style={{ display: 'grid', gap: '2rem' }}>
      
      {/* 1. Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <h2 className="font-outfit" style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <DollarSign size={28} color="var(--accent-green)" /> Gestão de Faturamento & Royalties
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Visualização e conciliação de faturamento e royalties por franquias e clientes migrados.</p>
        </div>

        {/* Dropdown Double Excel Export */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="tab-btn btn-excel" 
            onClick={handleExportConsolidado}
            style={{ background: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.2)', color: '#fff' }}
            title="Exporta o faturamento resumido de cada franquia"
          >
            <Download size={16} /> EXPORTAR CONSOLIDADO
          </button>
          
          <button 
            className="tab-btn btn-excel" 
            onClick={handleExportDetalhado}
            style={{ background: 'var(--accent-green)', borderColor: 'rgba(16, 185, 129, 0.2)', color: '#fff' }}
            title="Exporta a relação individual de clientes com honorários e alíquotas"
          >
            <Download size={16} /> EXPORTAR CLIENTES DETALHADO
          </button>

          <button 
            className="tab-btn btn-excel" 
            onClick={handleExportMapeamentoGeral}
            style={{ background: 'var(--accent-purple)', borderColor: 'rgba(139, 92, 246, 0.2)', color: '#fff' }}
            title="Exporta a planilha de prioridade geral comparando franquias e sistemas contábeis"
          >
            <Download size={16} /> EXPORTAR MAPEAMENTO GERAL
          </button>
        </div>
      </div>

      {/* 2. Consolidated Metrics */}
      <div className="metric-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1.5rem' }}>
        <div 
          className="metric-card interactive glow-blue" 
          style={{ borderTop: '6px solid var(--accent-blue)', position: 'relative', cursor: 'pointer' }}
          onClick={() => setActiveRoyaltiesModal('franquias')}
        >
          <h3 className="metric-title">Franquias Ativas</h3>
          <div className="metric-value" title={String(metrics.activeFranchises)}>{metrics.activeFranchises}</div>
          <div className="metric-subtitle" style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Award size={14} /> Unidades com movimento
          </div>
        </div>

        <div 
          className="metric-card interactive glow-purple" 
          style={{ borderTop: '6px solid var(--accent-purple)', position: 'relative', cursor: 'pointer' }}
          onClick={() => setActiveRoyaltiesModal('clientes')}
        >
          <h3 className="metric-title">Total de Clientes</h3>
          <div className="metric-value" title={String(metrics.totalClients)}>{metrics.totalClients}</div>
          <div className="metric-subtitle" style={{ color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Users size={14} /> Contratos vigentes mapeados
          </div>
        </div>

        <div 
          className="metric-card interactive glow-green" 
          style={{ borderTop: '6px solid var(--accent-green)', position: 'relative', cursor: 'pointer' }}
          onClick={() => setActiveRoyaltiesModal('royalties')}
        >
          <h3 className="metric-title">Royalties Totais</h3>
          <div className="metric-value" title={metrics.totalRoyalties.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}>
            {metrics.totalRoyalties.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <div className="metric-subtitle" style={{ color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <DollarSign size={14} /> Faturamento consolidado
          </div>
        </div>

        <div 
          className="metric-card interactive glow-orange" 
          style={{ borderTop: '6px solid var(--accent-orange)', position: 'relative', cursor: 'pointer' }}
          onClick={() => setActiveRoyaltiesModal('evolucao')}
        >
          <h3 className="metric-title">Evolução Contratual (Mês)</h3>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '2.2rem', color: 'var(--accent-green)', fontWeight: '800' }}>+{metrics.entriesCount}</span>
            <span style={{ fontSize: '1.4rem', color: 'var(--text-muted)' }}>/</span>
            <span style={{ fontSize: '2.2rem', color: 'var(--accent-red)', fontWeight: '800' }}>-{metrics.exitsCount}</span>
          </div>
          <div className="metric-subtitle" style={{ color: metrics.saldoBrl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
            {metrics.saldoBrl >= 0 ? '+' : ''}{metrics.saldoBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de saldo
          </div>
        </div>
      </div>

      {/* 3. Filter Controls Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          
          {/* Month reference & monthly/annual filter */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mês de Referência</label>
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '8px', 
                  padding: '8px 12px', 
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tipo de Apuração</label>
              <div className="tab-group" style={{ background: 'rgba(255,255,255,0.03)', padding: '4px' }}>
                <button 
                  className={`tab-btn ${filterType === 'MENSAL' ? 'active' : ''}`} 
                  onClick={() => setFilterType('MENSAL')}
                  style={{ fontSize: '0.75rem', padding: '6px 14px' }}
                >
                  MENSAL
                </button>
                <button 
                  className={`tab-btn ${filterType === 'ANUAL' ? 'active' : ''}`} 
                  onClick={() => setFilterType('ANUAL')}
                  style={{ fontSize: '0.75rem', padding: '6px 14px' }}
                >
                  ANUAL (ACUMULADO)
                </button>
              </div>
            </div>

            {/* Franchise filter dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Franquia</label>
              <select
                value={selectedFranchiseFilter}
                onChange={(e) => setSelectedFranchiseFilter(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '8px', 
                  padding: '8px 12px', 
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  cursor: 'pointer',
                  minWidth: '180px'
                }}
              >
                {['TODAS', ...allFranchises].map(fran => (
                  <option key={fran} value={fran} style={{ background: '#17191e', color: '#fff' }}>
                    {fran}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fallback settings */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fixo Padrão (R$)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>R$</span>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  value={defaultFixedRoyalty}
                  onChange={(e) => setDefaultFixedRoyalty(e.target.value)}
                  style={{ 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '8px', 
                    padding: '8px 12px 8px 32px', 
                    color: '#fff',
                    fontSize: '0.9rem',
                    width: '100px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Alíquota Padrão (%)</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={defaultVariablePercentage}
                  onChange={(e) => setDefaultVariablePercentage(e.target.value)}
                  style={{ 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '8px', 
                    padding: '8px 12px 18px 12px', 
                    color: '#fff',
                    fontSize: '0.9rem',
                    width: '70px',
                    height: '34px',
                    outline: 'none'
                  }}
                />
                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>%</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <input 
                type="checkbox" 
                id="onlyCompleted" 
                checked={onlyCompleted}
                onChange={(e) => setOnlyCompleted(e.target.checked)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="onlyCompleted" style={{ fontSize: '0.85rem', color: 'var(--text-main)', cursor: 'pointer', userSelect: 'none' }}>
                Apenas entregas concluídas
              </label>
            </div>
          </div>

        </div>
      </div>

      {/* 4. Table view with Search and Details */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        
        {/* Tab Selection: Consolidado (Franquias) vs Detalhado (Clientes) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1rem' }}>
          <div className="tab-group" style={{ padding: '4px', background: 'rgba(255,255,255,0.02)' }}>
            <button 
              className={`tab-btn ${viewMode === 'CONSOLIDADO' ? 'active' : ''}`}
              onClick={() => setViewMode('CONSOLIDADO')}
              style={{ padding: '8px 24px', fontSize: '0.85rem' }}
            >
              VISÃO CONSOLIDADA (FRANQUIAS)
            </button>
            <button 
              className={`tab-btn ${viewMode === 'DETALHADO' ? 'active' : ''}`}
              onClick={() => setViewMode('DETALHADO')}
              style={{ padding: '8px 24px', fontSize: '0.85rem' }}
            >
              VISÃO DETALHADA (CLIENTES)
            </button>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {viewMode === 'CONSOLIDADO' ? (
              <span>Exibindo <strong>{sortedConsolidated.length}</strong> de <strong>{aggregatedData.length}</strong> franquias cadastradas.</span>
            ) : (
              <span>Exibindo <strong>{sortedDetailed.length}</strong> de <strong>{detailedClients.length}</strong> clientes migrados.</span>
            )}
          </div>
        </div>

        {/* Search Row */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', opacity: 0.7 }} />
            <input 
              type="text" 
              placeholder={viewMode === 'CONSOLIDADO' ? "Buscar franquia, base ou sistema..." : "Buscar cliente, CNPJ, franquia, sistema..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                borderRadius: '8px', 
                padding: '10px 14px 10px 42px', 
                color: '#fff', 
                fontSize: '0.85rem', 
                width: '100%', 
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* VIEW 1: CONSOLIDATED BY FRANCHISE */}
        {viewMode === 'CONSOLIDADO' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestSort('franchise')}>
                    Franquia {sortConfig.key === 'franchise' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestSort('base')}>
                    Base {sortConfig.key === 'base' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestSort('system')}>
                    Sistema {sortConfig.key === 'system' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'right' }} onClick={() => requestSort('clientCount')}>
                    Clientes {sortConfig.key === 'clientCount' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'right' }} onClick={() => requestSort('fixedRoyalty')}>
                    Fixo (R$) {sortConfig.key === 'fixedRoyalty' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'right' }} onClick={() => requestSort('variableRoyalty')}>
                    Variável (R$) {sortConfig.key === 'variableRoyalty' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort('appliedRule')}>
                    Regra {sortConfig.key === 'appliedRule' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'right' }} onClick={() => requestSort('royaltyValue')}>
                    Total Devido {sortConfig.key === 'royaltyValue' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedConsolidated.slice(0, visibleCount).map((item, idx) => {
                  const isExpanded = expandedFranchise === item.franchise;
                  const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)';
                  
                  return (
                    <React.Fragment key={item.franchise}>
                      {/* Main Row */}
                      <tr 
                        style={{ 
                          background: rowBg, 
                          borderBottom: '1px solid rgba(255,255,255,0.03)', 
                          fontSize: '0.85rem',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = rowBg}
                      >
                        <td style={{ padding: '14px 16px', fontWeight: '700', color: '#fff' }}>{item.franchise}</td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{item.base}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: '800', 
                            color: systemColors[item.system] || '#fff', 
                            background: `${systemColors[item.system]}15`, 
                            border: `1px solid ${systemColors[item.system]}30`,
                            padding: '2px 8px', 
                            borderRadius: '6px'
                          }}>
                            {item.system.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: '800', textAlign: 'right', color: item.clientCount > 0 ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
                          {item.clientCount}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {item.fixedRoyalty.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {item.variableRoyalty.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {item.clientCount > 0 ? (
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: '900',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: item.appliedRule === 'VARIÁVEL' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                              color: item.appliedRule === 'VARIÁVEL' ? 'var(--accent-purple)' : 'var(--accent-blue)',
                              border: `1px solid ${item.appliedRule === 'VARIÁVEL' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`
                            }}>
                              {item.appliedRule}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: '900', textAlign: 'right', color: item.clientCount > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                          {item.royaltyValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <button 
                              onClick={() => setExpandedFranchise(isExpanded ? null : item.franchise)}
                              disabled={item.clientCount === 0}
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                color: item.clientCount > 0 ? 'var(--accent-blue)' : 'var(--text-muted)', 
                                cursor: item.clientCount > 0 ? 'pointer' : 'default',
                                opacity: item.clientCount > 0 ? 1 : 0.3,
                                padding: '4px'
                              }}
                              title={item.clientCount > 0 ? 'Ver empresas cadastradas no período' : 'Sem movimentação no período'}
                            >
                              {isExpanded ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>

                            {!isGuest && (
                              <button
                                onClick={() => setEditingFranchise(item.franchise)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  transition: 'color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-blue)'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                title="Editar parametrização do contrato fixo/variável"
                              >
                                <Settings size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Clients Details Row */}
                      <AnimatePresence initial={false}>
                        {isExpanded && item.clientCount > 0 && (
                          <tr>
                            <td colSpan={9} style={{ padding: 0, border: 'none' }}>
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ 
                                  background: 'rgba(59, 130, 246, 0.03)', 
                                  borderLeft: '4px solid var(--accent-blue)',
                                  padding: '1.2rem 2.5rem',
                                  margin: '8px 16px',
                                  borderRadius: '8px',
                                  overflow: 'hidden'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--accent-blue)', textTransform: 'uppercase' }}>
                                    Relação de Clientes Migrados ({item.clientCount})
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExportFranchiseDetailed(item);
                                    }}
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      border: '1px solid rgba(59, 130, 246, 0.2)',
                                      borderRadius: '6px',
                                      color: 'var(--accent-blue)',
                                      padding: '4px 10px',
                                      fontSize: '0.7rem',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      transition: 'all 0.2s',
                                      borderColor: 'rgba(59, 130, 246, 0.2)'
                                    }}
                                    className="hover-bright"
                                    title={`Exportar planilha detalhada de ${item.franchise}`}
                                  >
                                    <Download size={12} /> EXPORTAR CLIENTES
                                  </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1rem' }}>
                                  {item.tasks.map((task) => {
                                    const honorario = task.honorario !== undefined ? task.honorario : 1000.00;
                                    const calcRoyalty = honorario * (item.variablePercentage / 100);

                                    return (
                                      <div 
                                        key={task.id} 
                                        onClick={() => onSelectTask && onSelectTask(task)}
                                        style={{ 
                                          background: 'rgba(255,255,255,0.02)', 
                                          padding: '12px 16px', 
                                          borderRadius: '8px', 
                                          border: '1px solid rgba(255,255,255,0.04)',
                                          fontSize: '0.78rem',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                          position: 'relative'
                                        }}
                                        className="hover-bright"
                                        title="Clique para ver detalhes do PR / editar honorário"
                                      >
                                        <div style={{ fontWeight: '700', color: '#fff', marginBottom: '4px', paddingRight: '15px' }}>{task.empresa_nome}</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                          <span>CNPJ: {task.cnpj}</span>
                                          <span style={{ color: 'var(--accent-blue)' }}>Cód: {task.empresa_codigo}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '4px', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>
                                          <span>Honorário: R$ {honorario.toFixed(2).replace('.', ',')}</span>
                                          <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>Royalty: R$ {calcRoyalty.toFixed(2).replace('.', ',')}</span>
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: '6px' }}>
                                          Cadastrado em: {parseDate(task.created_at)?.toLocaleDateString('pt-BR')}
                                        </div>
                                        <ChevronRight size={14} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.15)' }} />
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}

                {sortedConsolidated.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <AlertCircle size={28} />
                        <span>Nenhuma franquia encontrada com os filtros selecionados.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW 2: DETAILED BY CLIENT */}
        {viewMode === 'DETALHADO' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestDetailedSort('empresa_nome')}>
                    Cliente/Empresa {detailedSortConfig.key === 'empresa_nome' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestDetailedSort('cnpj')}>
                    CNPJ {detailedSortConfig.key === 'cnpj' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestDetailedSort('empresa_codigo')}>
                    Código ERP {detailedSortConfig.key === 'empresa_codigo' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestDetailedSort('franchiseName')}>
                    Franquia {detailedSortConfig.key === 'franchiseName' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestDetailedSort('system')}>
                    Sistema {detailedSortConfig.key === 'system' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => requestDetailedSort('created_at')}>
                    Data Cadastro {detailedSortConfig.key === 'created_at' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'right' }} onClick={() => requestDetailedSort('honorario')}>
                    Honorário (R$) {detailedSortConfig.key === 'honorario' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ padding: '12px 16px', cursor: 'pointer', textAlign: 'right' }} onClick={() => requestDetailedSort('calcRoyalty')}>
                    Royalty Gerado {detailedSortConfig.key === 'calcRoyalty' && (detailedSortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDetailed.slice(0, visibleCountDetailed).map((item, idx) => {
                  const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)';
                  
                  return (
                    <tr 
                      key={item.id}
                      onClick={() => onSelectTask && onSelectTask(item)}
                      style={{ 
                        background: rowBg, 
                        borderBottom: '1px solid rgba(255,255,255,0.03)', 
                        fontSize: '0.85rem',
                        transition: 'background 0.2s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = rowBg}
                      title="Clique para abrir detalhes do PR / editar honorário"
                    >
                      <td style={{ padding: '14px 16px', fontWeight: '700', color: '#fff' }}>{item.empresa_nome}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{item.cnpj}</td>
                      <td style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--accent-blue)' }}>{item.empresa_codigo}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{item.franchiseName}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: '800', 
                          color: systemColors[item.system] || '#fff', 
                          background: `${systemColors[item.system]}15`, 
                          border: `1px solid ${systemColors[item.system]}30`,
                          padding: '2px 8px', 
                          borderRadius: '6px'
                        }}>
                          {item.system.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                        {parseDate(item.created_at)?.toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: '700', textAlign: 'right', color: '#fff' }}>
                        {item.honorario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: '800', textAlign: 'right', color: 'var(--accent-green)' }}>
                        {item.calcRoyalty.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  );
                })}

                {sortedDetailed.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <AlertCircle size={28} />
                        <span>Nenhum cliente migrado encontrado com os filtros selecionados.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More Button */}
        {viewMode === 'CONSOLIDADO' && sortedConsolidated.length > visibleCount && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
            <button 
              className="tab-btn" 
              onClick={() => setVisibleCount(prev => prev + 15)}
              style={{ 
                padding: '12px 40px', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color: '#fff',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.borderColor = 'var(--accent-blue)'; }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.03)'; e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              Carregar Mais Franquias
            </button>
          </div>
        )}

        {viewMode === 'DETALHADO' && sortedDetailed.length > visibleCountDetailed && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
            <button 
              className="tab-btn" 
              onClick={() => setVisibleCountDetailed(prev => prev + 15)}
              style={{ 
                padding: '12px 40px', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color: '#fff',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.borderColor = 'var(--accent-blue)'; }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.03)'; e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              Carregar Mais Clientes
            </button>
          </div>
        )}

      </div>

      {/* 5. FRANCHISE CONFIGURATION MODAL (Manager/Collaborator only) */}
      <AnimatePresence>
        {editingFranchise && (
          <div className="modal-overlay" onClick={() => setEditingFranchise(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-panel modal-content"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '480px', padding: '2.5rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 className="font-outfit" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={20} color="var(--accent-blue)" /> Parametrizar Royalties
                </h2>
                <button onClick={() => setEditingFranchise(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Franquia</label>
                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', marginTop: '4px' }}>{editingFranchise}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Royalties Fixos (Contrato)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0"
                      value={editingFixedVal} 
                      onChange={(e) => setEditingFixedVal(e.target.value)}
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: '8px', 
                        padding: '10px 12px 10px 32px', 
                        color: '#fff', 
                        fontSize: '0.9rem',
                        width: '100%',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Alíquota Variável (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0"
                      value={editingPercentageVal} 
                      onChange={(e) => setEditingPercentageVal(e.target.value)}
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: '8px', 
                        padding: '10px 12px', 
                        color: '#fff', 
                        fontSize: '0.9rem',
                        width: '100%',
                        outline: 'none'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>%</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setEditingFranchise(null)}
                  style={{ 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveFranchiseConfig}
                  disabled={isSavingConfig}
                  style={{ 
                    background: 'var(--accent-blue)', 
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    color: '#fff',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    opacity: isSavingConfig ? 0.7 : 1
                  }}
                >
                  {isSavingConfig ? 'Salvando...' : 'Salvar Parâmetros'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isExportModalOpen && (
          <div className="modal-overlay" onClick={() => setIsExportModalOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-panel modal-content"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '540px', padding: '2.5rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 className="font-outfit" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Download size={20} color="var(--accent-blue)" /> {exportModalType === 'CONSOLIDADO' ? 'Filtrar Exportação Consolidada' : 'Filtrar Exportação Detalhada'}
                </h2>
                <button onClick={() => setIsExportModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>
              
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.5rem' }}>
                {exportModalType === 'CONSOLIDADO' 
                  ? 'Selecione quais franquias incluir no relatório consolidado XLSX. Por padrão todas estão marcadas.' 
                  : 'Selecione quais franquias incluir no relatório detalhado de clientes XLSX. Por padrão todas estão marcadas.'
                }
              </p>

              {exportModalType === 'DETALHADO' && (
                <div style={{ 
                  background: 'rgba(59, 130, 246, 0.04)', 
                  border: '1px solid rgba(59, 130, 246, 0.15)', 
                  borderRadius: '12px', 
                  padding: '16px', 
                  marginBottom: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left'
                }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Período para Exportação de Clientes
                  </label>
                  <select
                    value={exportMonthFilter}
                    onChange={(e) => setExportMonthFilter(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.3)', 
                      border: '1px solid rgba(255,255,255,0.1)', 
                      borderRadius: '8px', 
                      padding: '10px 12px', 
                      color: '#fff',
                      fontSize: '0.85rem',
                      outline: 'none',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    <option value="ALL" style={{ background: '#17191e', color: '#fff' }}>Todos os meses (Desde Janeiro)</option>
                    {exportMonthsList.map(m => (
                      <option key={m.value} value={m.value} style={{ background: '#17191e', color: '#fff' }}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '1.2rem' }}>
                <input 
                  type="text"
                  placeholder="Buscar franquia na lista..."
                  value={searchExportFranchise}
                  onChange={(e) => setSearchExportFranchise(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#fff',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '1.2rem' }}>
                <button 
                  onClick={() => handleToggleAllExport(true)}
                  style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', fontSize: '0.7rem', fontWeight: 'bold', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Selecionar Todas
                </button>
                <button 
                  onClick={() => handleToggleAllExport(false)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 'bold', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Desmarcar Todas
                </button>
              </div>

              <div style={{ 
                maxHeight: '220px', 
                overflowY: 'auto', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '8px', 
                padding: '10px',
                border: '1px solid rgba(255,255,255,0.03)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '2rem'
              }}>
                {sortedConsolidated
                  .filter(item => item.franchise.toLowerCase().includes(searchExportFranchise.toLowerCase()))
                  .map(item => (
                    <label 
                      key={item.franchise} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        fontSize: '0.8rem', 
                        color: '#fff',
                        cursor: 'pointer',
                        userSelect: 'none',
                        padding: '4px'
                      }}
                    >
                      <input 
                        type="checkbox"
                        checked={!!selectedExportFranchises[item.franchise]}
                        onChange={(e) => setSelectedExportFranchises(prev => ({ ...prev, [item.franchise]: e.target.checked }))}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={item.franchise}>
                        {item.franchise}
                      </span>
                    </label>
                  ))
                }
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  style={{ 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmExport}
                  style={{ 
                    background: 'var(--accent-blue)', 
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    color: '#fff',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Confirmar Exportação
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Royalties Metric Details Modal */}
      <AnimatePresence>
        {activeRoyaltiesModal && (
          <RoyaltiesMetricModal
            isOpen={!!activeRoyaltiesModal}
            onClose={() => setActiveRoyaltiesModal(null)}
            type={activeRoyaltiesModal}
            data={data}
            aggregatedData={sortedConsolidated}
            detailedClients={detailedClients}
            metrics={metrics}
            selectedMonth={selectedMonth}
            isGuest={isGuest}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
