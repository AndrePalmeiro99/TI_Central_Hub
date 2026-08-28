import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, DollarSign, Users, Award, ShieldAlert, AlertTriangle, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sourceColors } from './DashboardCharts';

export default function RoyaltiesMetricModal({ 
  isOpen, 
  onClose, 
  type, 
  data = [], 
  aggregatedData = [], 
  detailedClients = [], 
  metrics = {}, 
  selectedMonth,
  isGuest = false 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeSubTab, setActiveSubTab] = useState('entradas'); // For 'evolucao' card: 'entradas' | 'saidas'

  // Reset page and search when type changes
  useEffect(() => {
    setCurrentPage(1);
    setSearchTerm('');
  }, [type, isOpen]);

  const modalConfig = useMemo(() => {
    switch (type) {
      case 'franquias':
        return {
          title: 'Franquias Ativas',
          subtitle: 'Relação de unidades franqueadas com movimentações de implantação',
          accentColor: 'var(--accent-blue)',
          emptyText: 'Nenhuma franquia ativa no período selecionado.',
          badgeIcon: <Award size={14} />
        };
      case 'clientes':
        return {
          title: 'Total de Clientes',
          subtitle: 'Listagem detalhada de todos os clientes migrados mapeados',
          accentColor: 'var(--accent-purple)',
          emptyText: 'Nenhum cliente mapeado no período selecionado.',
          badgeIcon: <Users size={14} />
        };
      case 'royalties':
        return {
          title: 'Detalhamento de Royalties',
          subtitle: 'Faturamento consolidado, fixos contratuais e variáveis calculados',
          accentColor: 'var(--accent-green)',
          emptyText: 'Sem informações de faturamento no período.',
          badgeIcon: <DollarSign size={14} />
        };
      case 'evolucao':
        return {
          title: 'Evolução Contratual do Mês',
          subtitle: 'Entradas de novos contratos e saídas por cancelamento ou inativação',
          accentColor: 'var(--accent-orange)',
          emptyText: 'Sem evolução contratual registrada neste mês.',
          badgeIcon: <ArrowUpRight size={14} />
        };
      default:
        return {
          title: 'Detalhamento de Faturamento',
          subtitle: 'Visualização de dados consolidados',
          accentColor: 'var(--accent-blue)',
          emptyText: 'Sem registros encontrados.',
          badgeIcon: <DollarSign size={14} />
        };
    }
  }, [type]);

  const baseList = useMemo(() => {
    if (!aggregatedData || !detailedClients) return [];

    switch (type) {
      case 'franquias':
        // Active franchises in period
        return aggregatedData.filter(item => item.clientCount > 0);

      case 'clientes':
        // All clients in period
        return detailedClients;

      case 'royalties':
        // All franchise billing items
        return aggregatedData;

      case 'evolucao':
        // Filter tasks created or concluded/cancelled in this selected month
        if (!selectedMonth) return [];
        const [yearStr, monthStr] = selectedMonth.split('-');
        const qYear = parseInt(yearStr, 10);
        const qMonth = parseInt(monthStr, 10) - 1; // 0-indexed

        if (activeSubTab === 'entradas') {
          // Entradas: criadas neste mês
          return data.filter(t => {
            const date = t.created_at ? new Date(t.created_at) : null;
            return date && !isNaN(date.getTime()) && date.getFullYear() === qYear && date.getMonth() === qMonth;
          });
        } else {
          // Saídas: canceladas ou com contrato_aceite = false
          return data.filter(t => {
            const rawStatus = (t.status || '').toUpperCase();
            const isCanceled = rawStatus.startsWith('CANCEL') || rawStatus.startsWith('REPROV') || t.contrato_aceite === false;
            if (!isCanceled) return false;

            const dateStr = t.data_conclusao || t.created_at;
            const date = dateStr ? new Date(dateStr) : null;
            return date && !isNaN(date.getTime()) && date.getFullYear() === qYear && date.getMonth() === qMonth;
          });
        }

      default:
        return [];
    }
  }, [type, aggregatedData, detailedClients, activeSubTab, data, selectedMonth]);

  // Apply search filtering
  const filteredList = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return baseList;

    return baseList.filter(item => {
      if (type === 'franquias') {
        return (
          (item.franchise || '').toLowerCase().includes(term) ||
          (item.base || '').toLowerCase().includes(term) ||
          (item.system || '').toLowerCase().includes(term)
        );
      } else if (type === 'clientes' || type === 'evolucao') {
        const name = (item.empresa_nome || '').toLowerCase();
        const cnpj = (item.cnpj || '').replace(/\D/g, '');
        const erp = (item.empresa_codigo || '').toLowerCase();
        const franchise = (item.franchiseName || item.franquia || '').toLowerCase();
        const system = (item.system || item.software_origem || '').toLowerCase();
        return (
          name.includes(term) ||
          cnpj.includes(term) ||
          erp.includes(term) ||
          franchise.includes(term) ||
          system.includes(term)
        );
      } else if (type === 'royalties') {
        return (
          (item.franchise || '').toLowerCase().includes(term) ||
          (item.system || '').toLowerCase().includes(term) ||
          (item.appliedRule || '').toLowerCase().includes(term)
        );
      }
      return false;
    });
  }, [baseList, searchTerm, type]);

  // Pagination logic
  const itemsPerPage = 8;
  const totalPages = Math.max(1, Math.ceil(filteredList.length / itemsPerPage));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(start, start + itemsPerPage);
  }, [filteredList, currentPage]);

  // Excel export specifically for what's visible in this modal
  const handleExportModalToExcel = () => {
    let rows = [];
    let sheetName = "Export";

    if (type === 'franquias') {
      sheetName = "Franquias Ativas";
      rows = filteredList.map(item => ({
        'Franquia': item.franchise,
        'Base Vinculada': item.base,
        'Sistema Contábil': item.system,
        'Clientes Ativos no Mês': item.clientCount,
        'Faturamento Estimado (R$)': item.royaltyValue
      }));
    } else if (type === 'clientes') {
      sheetName = "Clientes Faturamento";
      rows = filteredList.map(item => ({
        'Cliente / Razão Social': item.empresa_nome,
        'CNPJ': item.cnpj,
        'Código ERP': item.empresa_codigo,
        'Franquia Vinculada': item.franchiseName || item.franquia || 'Matriz',
        'Sistema de Origem': item.system || item.software_origem,
        'Honorário Mensal (R$)': item.honorario,
        'Alíquota de Royalties (%)': item.percentage,
        'Royalties Devidos (R$)': item.calcRoyalty
      }));
    } else if (type === 'royalties') {
      sheetName = "Royalties Resumo";
      rows = filteredList.map(item => ({
        'Franquia': item.franchise,
        'Base': item.base,
        'Sistema Contábil': item.system,
        'Total de Clientes': item.clientCount,
        'Royalties Fixo Contratual': item.fixedRoyalty,
        'Royalties Variável': item.variableRoyalty,
        'Regra de Faturamento Aplicada': item.appliedRule,
        'Royalties Totais Devidos (R$)': item.royaltyValue
      }));
    } else if (type === 'evolucao') {
      sheetName = activeSubTab === 'entradas' ? "Entradas do Mês" : "Saídas do Mês";
      rows = filteredList.map(item => ({
        'Empresa': item.empresa_nome,
        'CNPJ': item.cnpj,
        'Código ERP': item.empresa_codigo,
        'Franquia': item.franquia || 'Matriz',
        'Sistema': item.software_origem,
        'Data Cadastro/Inativação': item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'N/A',
        'Honorário Base (R$)': item.honorario || 1000.00
      }));
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `BI_Royalties_${sheetName.replace(/ /g, '_')}_${selectedMonth}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="glass-panel modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '950px',
          width: '95%',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          padding: '2rem',
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.65rem', color: modalConfig.accentColor, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {modalConfig.badgeIcon} BI Royalties
              </span>
              {isGuest && (
                <span className="modal-demo-badge">
                  <AlertTriangle size={10} /> MODO DEMONSTRAÇÃO
                </span>
              )}
            </div>
            <h2 className="font-outfit" style={{ fontSize: '1.5rem', marginTop: '4px', fontWeight: '800', color: 'var(--text-main)' }}>
              {modalConfig.title} ({selectedMonth})
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
              {modalConfig.subtitle}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={handleExportModalToExcel}
              className="tab-btn btn-excel"
              style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-green)', padding: '6px 12px', fontSize: '0.75rem', height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Exporta estes registros atuais filtrados para o Excel"
            >
              <Download size={14} /> Exportar Modal
            </button>
            <button 
              onClick={onClose} 
              style={{ 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                color: 'var(--text-main)', 
                width: '36px', 
                height: '36px', 
                borderRadius: '8px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                cursor: 'pointer', 
                transition: 'var(--transition)' 
              }} 
              className="hover-bright"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Dynamic Royalties Breakdown Card */}
        {type === 'royalties' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 800 }}>Total Royalties Faturamento</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent-green)' }}>
                {metrics.totalRoyalties?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 800 }}>Fatia de Royalties Fixos</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent-blue)' }}>
                {aggregatedData.reduce((acc, curr) => acc + (curr.fixedRoyalty || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 800 }}>Fatia de Royalties Variáveis</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent-purple)' }}>
                {aggregatedData.reduce((acc, curr) => acc + (curr.variableRoyalty || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>
          </div>
        )}

        {/* Evolução Contratual (Month Subtabs) */}
        {type === 'evolucao' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div className="tab-group" style={{ margin: 0, padding: '4px' }}>
              <button 
                className={`tab-btn ${activeSubTab === 'entradas' ? 'active' : ''}`}
                onClick={() => { setActiveSubTab('entradas'); setCurrentPage(1); }}
                style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowUpRight size={14} /> Entradas (+{metrics.entriesCount})
              </button>
              <button 
                className={`tab-btn ${activeSubTab === 'saidas' ? 'active' : ''}`}
                onClick={() => { setActiveSubTab('saidas'); setCurrentPage(1); }}
                style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowDownRight size={14} color="var(--accent-red)" /> Saídas (-{metrics.exitsCount})
              </button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '6px 14px', fontSize: '0.85rem' }}>
              Saldo Contratual Estimado: <strong style={{ color: metrics.saldoBrl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {metrics.saldoBrl >= 0 ? '+' : ''}{metrics.saldoBrl?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', opacity: 0.6 }} />
            <input 
              type="text" 
              placeholder={type === 'franquias' ? "Buscar por franquia, base ou sistema..." : "Buscar por empresa, CNPJ, franquia, ERP..."}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                padding: '10px 14px 10px 42px',
                color: 'var(--text-main)',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'var(--transition)'
              }}
              onFocus={e => e.target.style.borderColor = modalConfig.accentColor}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>
        </div>

        {/* Table Content */}
        <div style={{ flexGrow: 1, overflowY: 'auto' }}>
          {filteredList.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {modalConfig.emptyText}
            </div>
          ) : (
            <div className="modal-table-container">
              <table className="modal-table">
                {type === 'franquias' && (
                  <>
                    <thead>
                      <tr>
                        <th>Franquia</th>
                        <th>Base Vinculada</th>
                        <th>Sistema Contábil</th>
                        <th>Clientes Ativos (Período)</th>
                        <th>Estimativa Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '700' }}>{item.franchise}</td>
                          <td>{item.base}</td>
                          <td>
                            <span style={{ color: sourceColors[item.system] || '#fff', fontWeight: 'bold' }}>
                              {item.system}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{item.clientCount}</td>
                          <td style={{ color: 'var(--accent-green)', fontWeight: '700' }}>
                            {item.royaltyValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {type === 'clientes' && (
                  <>
                    <thead>
                      <tr>
                        <th>Razão Social / Cliente</th>
                        <th>CNPJ</th>
                        <th>ERP</th>
                        <th>Franquia Vinculada</th>
                        <th>Sistema</th>
                        <th>Honorário (Base)</th>
                        <th>Alíquota</th>
                        <th>Royalties Gerados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '700', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.empresa_nome}</td>
                          <td>{item.cnpj ? item.cnpj.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : 'N/A'}</td>
                          <td><span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px' }}>{item.empresa_codigo || 'N/A'}</span></td>
                          <td>{item.franchiseName}</td>
                          <td style={{ color: sourceColors[item.system] || '#fff', fontWeight: 'bold' }}>{item.system}</td>
                          <td>{item.honorario?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>{item.percentage}%</td>
                          <td style={{ color: 'var(--accent-green)', fontWeight: '700' }}>
                            {item.calcRoyalty?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {type === 'royalties' && (
                  <>
                    <thead>
                      <tr>
                        <th>Franquia</th>
                        <th>Base</th>
                        <th>Sistema</th>
                        <th>Clientes</th>
                        <th>Royalties Fixo</th>
                        <th>Royalties Variável</th>
                        <th>Regra Aplicada</th>
                        <th>Total Devido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '700' }}>{item.franchise}</td>
                          <td>{item.base}</td>
                          <td style={{ color: sourceColors[item.system] || '#fff', fontWeight: 'bold' }}>{item.system}</td>
                          <td style={{ fontWeight: '700', textAlign: 'center' }}>{item.clientCount}</td>
                          <td>{item.fixedRoyalty?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>{item.variableRoyalty?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>{item.appliedRule}</td>
                          <td style={{ color: 'var(--accent-green)', fontWeight: '800' }}>
                            {item.royaltyValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {type === 'evolucao' && (
                  <>
                    <thead>
                      <tr>
                        <th>Empresa / Razão Social</th>
                        <th>CNPJ</th>
                        <th>ERP</th>
                        <th>Franquia</th>
                        <th>Sistema</th>
                        <th>Data Ocorrência</th>
                        <th>Honorário Estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.map((item, idx) => {
                        const dateLabel = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'N/A';
                        const feeVal = item.honorario !== undefined ? item.honorario : 1000.00;
                        return (
                          <tr key={idx}>
                            <td style={{ fontWeight: '700' }}>{item.empresa_nome}</td>
                            <td>{item.cnpj ? item.cnpj.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : 'N/A'}</td>
                            <td><span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px' }}>{item.empresa_codigo || 'N/A'}</span></td>
                            <td>{item.franquia || 'Matriz'}</td>
                            <td style={{ color: sourceColors[item.software_origem] || '#fff', fontWeight: 'bold' }}>{item.software_origem || 'Sem Base'}</td>
                            <td>{dateLabel}</td>
                            <td>{feeVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Footer Pagination */}
        {filteredList.length > itemsPerPage && (
          <div className="modal-pagination">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Mostrando <strong>{paginatedList.length}</strong> de <strong>{filteredList.length}</strong> registros
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button 
                className="pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Anterior
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 8px' }}>
                Página <strong>{currentPage}</strong> de {totalPages}
              </span>
              <button 
                className="pagination-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
