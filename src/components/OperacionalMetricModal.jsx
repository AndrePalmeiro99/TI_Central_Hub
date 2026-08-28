import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Search, CheckCircle, AlertTriangle, Clock, Activity, ShieldAlert } from 'lucide-react';
import { sourceColors } from './DashboardCharts';

export default function OperacionalMetricModal({ isOpen, onClose, type, data = [], dataMesAtual = [], isGuest = false }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when switching modal types or changing search term
  useEffect(() => {
    setCurrentPage(1);
    setSearchTerm('');
  }, [type, isOpen]);

  const modalConfig = useMemo(() => {
    switch (type) {
      case 'hoje':
        return {
          title: 'Entregas Hoje',
          subtitle: 'Solicitações concluídas nas últimas 24 horas',
          accentColor: 'var(--accent-green)',
          emptyText: 'Nenhuma entrega concluída hoje.',
          badgeIcon: <CheckCircle size={14} />
        };
      case 'mes':
        return {
          title: 'Eficiência Mês',
          subtitle: 'Histórico de implantações concluídas no mês vigente',
          accentColor: 'var(--accent-blue)',
          emptyText: 'Nenhuma implantação concluída neste mês.',
          badgeIcon: <Activity size={14} />
        };
      case 'fila':
        return {
          title: 'Fila Ativa',
          subtitle: 'Processos de cadastros pendentes de conclusão',
          accentColor: 'var(--accent-orange)',
          emptyText: 'Fila zerada! Parabéns, todas as PRs foram processadas.',
          badgeIcon: <Clock size={14} />
        };
      case 'sla':
        return {
          title: 'Conformidade de SLA',
          subtitle: 'Detalhes de conformidade de prazo das entregas concluídas',
          accentColor: 'var(--accent-purple)',
          emptyText: 'Nenhuma entrega realizada no período para cálculo de SLA.',
          badgeIcon: <ShieldAlert size={14} />
        };
      default:
        return {
          title: 'Detalhamento de Métrica',
          subtitle: 'Visualização de dados brutos consolidados',
          accentColor: 'var(--accent-blue)',
          emptyText: 'Nenhum registro encontrado.',
          badgeIcon: <Activity size={14} />
        };
    }
  }, [type]);

  const baseList = useMemo(() => {
    if (!data) return [];
    
    const localDate = new Date();
    const today = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;

    switch (type) {
      case 'hoje':
        return data.filter(d => {
          const completedAt = d.data_conclusao || d.created_at;
          const isCompleted = (d.status || '').startsWith('concluida');
          return isCompleted && completedAt && completedAt.startsWith(today);
        });

      case 'mes':
        return (dataMesAtual || []).filter(d => (d.status || '').startsWith('concluida'));

      case 'fila':
        return data.filter(d => !(d.status || '').startsWith('concluida'));

      case 'sla':
        // Concluídos
        return data.filter(d => (d.status || '').startsWith('concluida') && d.data_conclusao);

      default:
        return [];
    }
  }, [type, data, dataMesAtual]);

  // Apply local searching
  const filteredList = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return baseList;

    return baseList.filter(item => {
      const name = (item.empresa_nome || '').toLowerCase();
      const code = (item.empresa_codigo || '').toLowerCase();
      const cnpj = (item.cnpj || '').replace(/\D/g, '');
      const franchise = (item.franquia || '').toLowerCase();
      const system = (item.software_origem || '').toLowerCase();
      return (
        name.includes(term) ||
        code.includes(term) ||
        cnpj.includes(term) ||
        franchise.includes(term) ||
        system.includes(term)
      );
    });
  }, [baseList, searchTerm]);

  // Pagination logic
  const itemsPerPage = 8;
  const totalPages = Math.max(1, Math.ceil(filteredList.length / itemsPerPage));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(start, start + itemsPerPage);
  }, [filteredList, currentPage]);

  if (!isOpen) return null;

  // Render specific layout inside SLA modal
  const renderSlaHeaderStats = () => {
    if (type !== 'sla') return null;

    const total = baseList.length;
    const withinTerm = baseList.filter(d => d.status === 'concluida_no_prazo').length;
    const delayed = total - withinTerm;

    // TMA calculation
    const tma = total > 0
      ? (baseList.reduce((acc, curr) => {
          const days = Math.ceil(Math.abs(new Date(curr.data_conclusao) - new Date(curr.created_at)) / (1000 * 60 * 60 * 24));
          return acc + days;
        }, 0) / total).toFixed(1)
      : 0;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 800 }}>Mapeamento Total</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px' }}>{total}</div>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent-green)', fontWeight: 800 }}>Entregas no Prazo</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '4px' }}>{withinTerm}</div>
        </div>
        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent-red)', fontWeight: 800 }}>Atrasos Registrados</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-red)', marginTop: '4px' }}>{delayed}</div>
        </div>
        <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent-blue)', fontWeight: 800 }}>Prazo Médio (TMA)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-blue)', marginTop: '4px' }}>{tma} dias</div>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="glass-panel modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '900px',
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
                {modalConfig.badgeIcon} BI Operacional
              </span>
              {isGuest && (
                <span className="modal-demo-badge">
                  <AlertTriangle size={10} /> MODO DEMONSTRAÇÃO
                </span>
              )}
            </div>
            <h2 className="font-outfit" style={{ fontSize: '1.5rem', marginTop: '4px', fontWeight: '800', color: 'var(--text-main)' }}>
              {modalConfig.title}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
              {modalConfig.subtitle}
            </p>
          </div>
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

        {/* SLA Special Widget */}
        {renderSlaHeaderStats()}

        {/* Filters */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', opacity: 0.6 }} />
            <input 
              type="text" 
              placeholder="Buscar por empresa, CNPJ, franquia ou sistema..."
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
                <thead>
                  <tr>
                    <th>Empresa / Razão Social</th>
                    <th>CNPJ</th>
                    <th>ERP</th>
                    <th>Franquia</th>
                    <th>Sistema Origem</th>
                    {type === 'fila' ? <th>Status SLA</th> : <th>Data Operação</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedList.map((item) => {
                    const cleanCnpj = item.cnpj && item.cnpj !== 'N/A' 
                      ? item.cnpj.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                      : 'N/A';
                    
                    const systemColor = sourceColors[item.software_origem] || '#fff';
                    const operationDate = item.data_conclusao || item.created_at;

                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '700', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.empresa_nome}>
                          {item.empresa_nome}
                        </td>
                        <td>{cleanCnpj}</td>
                        <td>
                          <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {item.empresa_codigo || 'N/A'}
                          </span>
                        </td>
                        <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.franquia || 'Matriz'}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: systemColor, fontWeight: 'bold' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: systemColor }}></span>
                            {item.software_origem || 'Sem Base'}
                          </span>
                        </td>
                        <td>
                          {type === 'fila' ? (
                            <span style={{ 
                              color: item.status === 'atrasada' ? 'var(--accent-red)' : 'var(--accent-green)',
                              fontWeight: 'bold',
                              fontSize: '0.75rem',
                              textTransform: 'uppercase'
                            }}>
                              {item.status === 'atrasada' ? '🚨 Atrasado' : '⏳ No Prazo'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {operationDate ? new Date(operationDate).toLocaleDateString('pt-BR') : 'N/A'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
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
