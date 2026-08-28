import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Building2, ChevronRight, ChevronDown, Search, X, FolderOpen } from 'lucide-react';
import { sourceColors } from './DashboardCharts';

export default function MonthlyHistoryModal({ isOpen, onClose, tasks, type, onSelectTask }) {
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFranchise, setSelectedFranchise] = useState('all');

  // Compute unique available franchises and their counts in the dataset
  const availableFranchises = useMemo(() => {
    const counts = {};
    (tasks || []).forEach(t => {
      const f = t.franquia || 'Matriz';
      counts[f] = (counts[f] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [tasks]);

  // 1. Safe date parser helper
  const parseTaskDate = (dateStr) => {
    if (!dateStr) return null;
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    if (typeof dateStr === 'string' && dateStr.includes('/')) {
      const [datePart] = dateStr.split(' ');
      const [day, month, year] = datePart.split('/');
      date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  };

  // 2. Filter tasks based on selected franchise & search term
  const filteredTasks = useMemo(() => {
    let result = tasks || [];
    
    // Apply Franchise Filter
    if (selectedFranchise !== 'all') {
      result = result.filter(t => (t.franquia || 'Matriz') === selectedFranchise);
    }

    // Apply Text Search Filter
    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return result.filter(task => {
      const name = (task.empresa_nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cnpj = (task.cnpj || '').replace(/\D/g, '');
      const franchise = (task.franquia || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const system = (task.software_origem || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return name.includes(term) || cnpj.includes(term) || franchise.includes(term) || system.includes(term);
    });
  }, [tasks, searchTerm, selectedFranchise]);

  // 3. Group filtered tasks by Month and Day of creation
  const monthlyData = useMemo(() => {
    const groups = {};

    filteredTasks.forEach(task => {
      const date = parseTaskDate(task.created_at || task.data_criacao);
      if (!date) return;

      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      const day = date.getDate();

      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const dayKey = String(day).padStart(2, '0');

      if (!groups[monthKey]) {
        // Format Month name in Portuguese
        let rawMonthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
        const monthName = rawMonthName.charAt(0).toUpperCase() + rawMonthName.slice(1);
        
        groups[monthKey] = {
          key: monthKey,
          name: monthName,
          year,
          month,
          count: 0,
          days: {}
        };
      }

      if (!groups[monthKey].days[dayKey]) {
        groups[monthKey].days[dayKey] = {
          key: dayKey,
          dateLabel: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date),
          weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date),
          tasks: []
        };
      }

      groups[monthKey].count += 1;
      groups[monthKey].days[dayKey].tasks.push(task);
    });

    // Convert to sorted array (months descending, days descending, tasks descending)
    return Object.values(groups)
      .sort((a, b) => b.key.localeCompare(a.key))
      .map(month => {
        const sortedDays = Object.values(month.days)
          .sort((a, b) => b.key.localeCompare(a.key))
          .map(day => {
            const sortedTasks = day.tasks.sort((a, b) => {
              const dateA = parseTaskDate(a.created_at || a.data_criacao) || new Date(0);
              const dateB = parseTaskDate(b.created_at || b.data_criacao) || new Date(0);
              return dateB - dateA;
            });
            return { ...day, tasks: sortedTasks };
          });
        return { ...month, days: sortedDays };
      });
  }, [filteredTasks]);

  if (!isOpen) return null;

  const titleType = type === 'concluidos' ? 'Concluídos' : 'Cancelados';
  const accentColor = type === 'concluidos' ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 3000 }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="glass-panel modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '850px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          padding: '2.5rem',
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.6)'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: accentColor, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Histórico Operacional
            </span>
            <h2 className="font-outfit" style={{ fontSize: '1.6rem', marginTop: '4px', fontWeight: '800', color: '#fff' }}>
              Cadastros {titleType} por Mês
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
              Análise volumétrica baseada na data de criação de cada solicitação.
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'rgba(255,255,255,0.03)', 
              border: '1px solid rgba(255,255,255,0.08)', 
              color: '#fff', 
              fontSize: '1.2rem', 
              width: '38px', 
              height: '38px', 
              borderRadius: '10px', 
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

        {/* Search & Franchise Filters */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flexGrow: 1, minWidth: '250px' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', opacity: 0.6 }} />
            <input 
              type="text" 
              placeholder="Filtrar por empresa, CNPJ, franquia ou sistema..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '12px 16px 12px 46px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
                transition: 'var(--transition)'
              }}
              onFocus={e => e.target.style.borderColor = accentColor}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {/* Franchise Selector */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            background: 'rgba(255,255,255,0.03)', 
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '8px 16px', 
            borderRadius: '12px',
            minWidth: '220px',
            flexGrow: 0
          }}>
             <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unidade:</span>
             <select 
               value={selectedFranchise} 
               onChange={(e) => setSelectedFranchise(e.target.value)}
               style={{ 
                 background: 'transparent', 
                 border: 'none', 
                 color: selectedFranchise === 'all' ? 'var(--text-muted)' : accentColor, 
                 fontSize: '0.85rem', 
                 fontWeight: '800', 
                 outline: 'none', 
                 cursor: 'pointer',
                 width: '100%'
               }}
             >
               <option value="all" style={{ background: '#12131a', color: '#fff' }}>Todas</option>
               {availableFranchises.map(f => (
                 <option key={f.name} value={f.name} style={{ background: '#12131a', color: '#fff' }}>
                   {f.name} ({f.count})
                 </option>
               ))}
             </select>
          </div>
        </div>

        {/* Accordion Container */}
        <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {monthlyData.length > 0 ? (
            monthlyData.map(month => {
              const isMonthExpanded = expandedMonth === month.key;
              return (
                <div 
                  key={month.key} 
                  style={{ 
                    background: 'rgba(255,255,255,0.01)', 
                    border: '1px solid rgba(255,255,255,0.04)', 
                    borderRadius: '16px', 
                    overflow: 'hidden',
                    transition: 'var(--transition)' 
                  }}
                >
                  {/* Month Accordion Header */}
                  <div 
                    onClick={() => setExpandedMonth(isMonthExpanded ? null : month.key)}
                    style={{ 
                      padding: '16px 20px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: 'pointer', 
                      background: isMonthExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                      transition: 'var(--transition)' 
                    }}
                    className="hover-bright"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Calendar size={18} style={{ color: accentColor }} />
                      <strong style={{ fontSize: '1rem', color: '#fff' }}>{month.name}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '800', 
                        color: accentColor, 
                        background: `${accentColor}12`, 
                        padding: '4px 10px', 
                        borderRadius: '20px',
                        border: `1px solid ${accentColor}33`
                      }}>
                        {month.count} {month.count === 1 ? 'cadastro' : 'cadastros'}
                      </span>
                      {isMonthExpanded ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
                    </div>
                  </div>

                  {/* Days & Tasks Accordion Content */}
                  <AnimatePresence>
                    {isMonthExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ borderTop: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.15)' }}
                      >
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {month.days.map(day => (
                            <div key={day.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {/* Day Divider Label */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {day.weekday}, {day.dateLabel}
                                </span>
                                <div style={{ flexGrow: 1, height: '1px', background: 'rgba(255, 255, 255, 0.05)' }}></div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                                  {day.tasks.length} {day.tasks.length === 1 ? 'empresa' : 'empresas'}
                                </span>
                              </div>

                              {/* Task List for the Day */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                                {day.tasks.map(task => (
                                  <div
                                    key={task.id}
                                    onClick={() => {
                                      onSelectTask(task);
                                      onClose();
                                    }}
                                    style={{
                                      background: 'rgba(255,255,255,0.02)',
                                      border: '1px solid rgba(255,255,255,0.05)',
                                      borderRadius: '12px',
                                      padding: '12px 14px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '6px',
                                      transition: 'var(--transition)'
                                    }}
                                    className="hover-bright"
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }} title={task.empresa_nome}>
                                        {task.empresa_nome}
                                      </h4>
                                      <span style={{ 
                                        fontSize: '0.65rem', 
                                        fontWeight: '800', 
                                        color: sourceColors[task.software_origem] || 'var(--accent-blue)', 
                                        background: `${sourceColors[task.software_origem] || 'var(--accent-blue)'}12`,
                                        padding: '2px 6px',
                                        borderRadius: '4px'
                                      }}>
                                        {task.software_origem}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                                        {task.franquia}
                                      </span>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: '700' }}>
                                        CÓD: {task.empresa_codigo || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', opacity: 0.6 }}>
              <FolderOpen size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Nenhum cadastro encontrado para a pesquisa.</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
