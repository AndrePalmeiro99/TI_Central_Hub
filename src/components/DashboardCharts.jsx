import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import { Clock, ShieldAlert, User, Star, TrendingUp, Award, List } from 'lucide-react';
import { motion } from 'framer-motion';

export const sourceColors = {
  'Domínio Base 1': '#3b82f6',
  'Domínio Base 2': '#60a5fa',
  'Domínio Base 3': '#93c5fd',
  'Alterdata Nuvem': '#8b5cf6',
  'Alterdata Próprio': '#a78bfa',
  'Sem Base': '#64748b',
  'Domínio': '#3b82f6',
  'Alterdata': '#8b5cf6'
};

export function MetricCard({ title, value, subtitle, accentColor = '#3b82f6', sparklineData = null, isSelected = false, onClick, glowClass = '' }) {
  const isClickable = !!onClick;
  return (
    <div 
      className={`metric-card ${isSelected ? 'selected' : ''} ${isClickable ? `interactive ${glowClass}` : ''}`} 
      style={{ 
        borderTop: `6px solid ${accentColor}`,
        cursor: isClickable ? 'pointer' : 'default'
      }}
      onClick={onClick}
    >
      <h3 className="metric-title">{title}</h3>
      <div className="metric-value">{value}</div>
      {subtitle && <div className="metric-subtitle" style={{ color: accentColor }}>{subtitle}</div>}
      {sparklineData && sparklineData.length > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60px', opacity: 0.15, zIndex: 1, pointerEvents: 'none' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line type="monotone" dataKey="value" stroke={accentColor} strokeWidth={3} dot={false} isAnimationActive={true} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function SourceBreakdown({ data, franchiseBasesMap = {}, allTasks = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFranchise, setSelectedFranchise] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [viewType, setViewType] = useState('graph'); // 'graph' or 'total'

  // Group all mapped franchises in database by system and count their total historic clients
  const groupedTotalFranchises = useMemo(() => {
    const groups = {
      'Domínio': { count: 0, items: [] },
      'Alterdata': { count: 0, items: [] },
      'Sem Base': { count: 0, items: [] }
    };
    
    Object.entries(franchiseBasesMap).forEach(([franchiseName, baseAssigned]) => {
      let system = 'Sem Base';
      if (baseAssigned && baseAssigned.includes('Domínio')) system = 'Domínio';
      else if (baseAssigned && baseAssigned.includes('Alterdata')) system = 'Alterdata';
      
      groups[system].count += 1;
      
      // Calculate how many total clients/companies this franchise has in allTasks
      const franchiseTasks = allTasks.filter(t => (t.franquia || 'Matriz').toUpperCase() === franchiseName.toUpperCase());
      
      groups[system].items.push({
        id: franchiseName,
        franquia: franchiseName,
        detalhe_base: baseAssigned,
        clientCount: franchiseTasks.length
      });
    });
    
    // Sort items by clientCount descending so most active franchises are at the top
    Object.keys(groups).forEach(key => {
      groups[key].items.sort((a, b) => b.clientCount - a.clientCount);
    });
    
    return groups;
  }, [franchiseBasesMap, allTasks]);

  if (!data) return null;

  const pieData = useMemo(() => {
    return [
      { name: 'Domínio', value: groupedTotalFranchises['Domínio']?.count || 0, color: '#3b82f6' },
      { name: 'Alterdata', value: groupedTotalFranchises['Alterdata']?.count || 0, color: '#8b5cf6' },
      { name: 'Sem Base', value: groupedTotalFranchises['Sem Base']?.count || 0, color: '#64748b' }
    ].filter(d => d.value > 0);
  }, [groupedTotalFranchises]);

  const activeGroupedData = groupedTotalFranchises;
  const totalCount = Object.keys(franchiseBasesMap).length;

  const availableFranchises = [...new Set(allTasks.map(d => d.franquia).filter(Boolean))];
  
  const filteredFranchises = searchTerm 
    ? availableFranchises.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5)
    : [];

  return (
    <div className="breakdown-list" style={{ position: 'relative' }}>
      
      {/* View Type Toggle Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700' }}>Visualizar por:</span>
        <div className="tab-group" style={{ margin: 0, padding: '2px', background: 'rgba(0,0,0,0.2)' }}>
          <button 
            className={`tab-btn ${viewType === 'graph' ? 'active' : ''}`} 
            onClick={() => { setViewType('graph'); setActiveCategory(null); }}
            style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px' }}
          >
            Gráfico
          </button>
          <button 
            className={`tab-btn ${viewType === 'total' ? 'active' : ''}`} 
            onClick={() => { setViewType('total'); setActiveCategory(null); }}
            style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px' }}
          >
            Total de Franquias
          </button>
        </div>
      </div>

      {/* Franchise Search Box */}
      <div style={{ marginBottom: '1.2rem', position: 'relative' }}>
        <input 
          type="text" 
          placeholder="Buscar franquia para ver a base..." 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setSelectedFranchise(null);
          }}
          style={{ 
            width: '100%', 
            padding: '10px 14px', 
            borderRadius: '8px', 
            background: 'rgba(255,255,255,0.05)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            color: '#fff',
            fontSize: '0.85rem'
          }}
        />
        
        {/* Search Results Dropdown */}
        {searchTerm && filteredFranchises.length > 0 && !selectedFranchise && (
          <div style={{ 
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            right: 0, 
            background: '#17191e', 
            border: '1px solid var(--border-light)', 
            borderRadius: '8px', 
            marginTop: '4px', 
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}>
            {filteredFranchises.map(f => (
              <div 
                key={f}
                onClick={() => {
                  setSearchTerm('');
                  setSelectedFranchise(f);
                }}
                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                {f}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Franchise Popup/Card */}
      {selectedFranchise && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ 
            background: 'rgba(59, 130, 246, 0.1)', 
            border: '1px solid var(--accent-blue)', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '1.2rem',
            position: 'relative'
          }}
        >
          <button 
            onClick={() => setSelectedFranchise(null)}
            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          >×</button>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800 }}>Franquia Selecionada</div>
          <div style={{ fontWeight: 700, margin: '4px 0' }}>{selectedFranchise}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--accent-blue)' }}>
            Base Vinculada: <strong>{(() => {
              const fUpper = selectedFranchise.toUpperCase();
              if (franchiseBasesMap[fUpper]) return franchiseBasesMap[fUpper];
              const genericBasesBlacklist = ['CONTABILIDADE', 'FRANQUIA', 'SEDE', 'ESC', 'LTDA', 'CENTRO'];
              for (const [key, val] of Object.entries(franchiseBasesMap)) {
                if (key.length > 3) {
                  if (genericBasesBlacklist.includes(key)) {
                    continue;
                  }
                  if (fUpper.includes(key) || key.includes(fUpper)) return val;
                }
              }
              return 'Sem Base';
            })()}</strong>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Total de Clientes no Histórico: <strong style={{ color: 'var(--accent-green)' }}>
              {allTasks.filter(t => (t.franquia || 'Matriz').toUpperCase() === selectedFranchise.toUpperCase()).length}
            </strong>
          </div>
        </motion.div>
      )}

      {viewType === 'graph' ? (
        <div style={{ width: '100%', height: '180px', marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={65}
                paddingAngle={4}
                dataKey="value"
                isAnimationActive={true}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.8rem' }}
                formatter={(value) => [`${value} Franquias`, 'Total']}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                formatter={(value) => <span style={{ color: 'var(--text-main)', fontSize: '0.72rem', fontWeight: 'bold' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        Object.entries(activeGroupedData).sort((a,b) => b[1].count - a[1].count).map(([source, group]) => {
          const percentage = totalCount > 0 ? ((group.count / totalCount) * 100).toFixed(1) : 0;
          const barColor = sourceColors[source] || '#64748b'; 
          return (
            <div 
              key={source} 
              className="breakdown-item" 
              style={{ marginBottom: '1.2rem', cursor: 'pointer' }}
              onClick={() => setActiveCategory(activeCategory === source ? null : source)}
            >
              <div className="breakdown-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: barColor }}></span>
                  {source}
                </div>
                <div style={{ fontWeight: 800 }}>{group.count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({percentage}%)</span></div>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', marginTop: '8px' }}>
                <div style={{ height: '100%', width: `${percentage}%`, backgroundColor: barColor, transition: 'width 1s' }}></div>
              </div>
            </div>
          );
        })
      )}

      {/* Detail Panel for Active Category */}
      {activeCategory && activeGroupedData[activeCategory] && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{ 
            background: 'rgba(0,0,0,0.2)', 
            border: '1px solid rgba(255,255,255,0.05)', 
            borderRadius: '8px', 
            padding: '1rem',
            marginTop: '1rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: sourceColors[activeCategory] || '#fff' }}>
              Detalhes ({viewType === 'month' ? 'Migrações' : 'Franquias'}): {activeCategory}
            </h4>
            <button onClick={() => setActiveCategory(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Fechar</button>
          </div>
          
          <div style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '5px' }}>
            {activeGroupedData[activeCategory].items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600 }}>{item.franquia}</span>
                <span style={{ color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>{activeCategory === 'Domínio' && item.detalhe_base ? `Base ${item.detalhe_base}` : item.detalhe_base}</span>
                  {viewType === 'total' && (
                    <strong style={{ color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                      {item.clientCount} {item.clientCount === 1 ? 'cliente' : 'clientes'}
                    </strong>
                  )}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function MonthlyTrendChart({ data }) {
  const [timeRange, setTimeRange] = useState('Semestral');

  const parseDate = (dateStr) => {
    if (!dateStr) return new Date();
    const normalized = dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr;
    return new Date(normalized);
  };

  const monthlyData = useMemo(() => {
    if (!data) return [];
    
    const now = new Date();
    let filteredData = data.filter(d => {
      const date = parseDate(d.created_at);
      if (timeRange === 'Mensal') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      if (timeRange === 'Trimestral') {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        return date >= threeMonthsAgo;
      }
      if (timeRange === 'Semestral') {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        return date >= sixMonthsAgo;
      }
      if (timeRange === 'Anual') return date.getFullYear() === now.getFullYear();
      return true;
    });

    const acc = {};
    
    filteredData.forEach(curr => {
      const date = parseDate(curr.created_at);
      let key = '';
      let name = '';
      
      if (timeRange === 'Mensal') {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        key = `${date.getFullYear()}-${month}-${day}`;
        name = `${day}/${month}`;
      } else {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        key = `${date.getFullYear()}-${month}`;
        const shortName = date.toLocaleDateString('pt-BR', { month: 'short' });
        name = shortName.replace('.', '');
        if (name) {
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }
      }
      
      if (!acc[key]) acc[key] = { name, key, Total: 0, Entregas: 0, Atrasados: 0, ConcluidasNoPrazo: 0 };
      
      acc[key].Total += 1;
      
      if ((curr.status || '').startsWith('concluida')) {
        acc[key].Entregas += 1;
        if (curr.status === 'concluida_no_prazo') {
          acc[key].ConcluidasNoPrazo += 1;
        }
      } else if (curr.status === 'atrasada') {
        acc[key].Atrasados += 1;
      }
    });
    
    return Object.values(acc).map(item => {
      const total = item.Entregas;
      const sla = total > 0 ? Math.round((item.ConcluidasNoPrazo / total) * 100) : 100;
      return { ...item, SLA: sla };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }, [data, timeRange]);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h3 className="font-outfit" style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={18} color="var(--accent-blue)" /> {timeRange === 'Mensal' ? 'Tendência Diária & Eficiência SLA' : 'Tendência Mensal & Eficiência SLA'}
        </h3>
        
        {/* Months selection buttons */}
        <div style={{ display: 'flex', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          {['Mensal', 'Trimestral', 'Semestral', 'Anual'].map(r => (
            <button 
              key={r}
              onClick={() => setTimeRange(r)}
              style={{
                background: timeRange === r ? 'var(--accent-blue)' : 'transparent',
                border: 'none',
                color: timeRange === r ? '#fff' : 'var(--text-muted)',
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {r}
            </button>
          ))}
        </div>
        
        <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-purple)' }}></span> Total Cadastros
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)' }}></span> Concluídas
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-red)' }}></span> Atrasadas
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)' }}></span> Compliance SLA %
          </span>
        </div>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-purple)" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="var(--accent-purple)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorEnt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorSla" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" stroke="var(--accent-green)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
            <Tooltip 
              contentStyle={{ background: 'var(--bg-glass)', border: '1px solid var(--border-light)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
              itemStyle={{ color: 'var(--text-main)' }}
            />
            <Area yAxisId="left" type="monotone" dataKey="Total" stroke="var(--accent-purple)" fillOpacity={1} fill="url(#colorTotal)" strokeWidth={3} name="Total Cadastros" />
            <Area yAxisId="left" type="monotone" dataKey="Entregas" stroke="var(--accent-blue)" fillOpacity={1} fill="url(#colorEnt)" strokeWidth={3} name="Concluídas" />
            <Area yAxisId="left" type="monotone" dataKey="Atrasados" stroke="var(--accent-red)" fill="transparent" strokeWidth={2} strokeDasharray="5 5" name="Atrasadas" />
            <Area yAxisId="right" type="monotone" dataKey="SLA" stroke="var(--accent-green)" fillOpacity={1} fill="url(#colorSla)" strokeWidth={2.5} name="Compliance SLA (%)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ColaboradoresDashboard({ data }) {
  const [selectedColab, setSelectedColab] = useState('Todos');
  const [timeRange, setTimeRange] = useState('Mensal');
  const [showHelp, setShowHelp] = useState(false);

  const parseDate = (dateStr) => {
    if (!dateStr) return new Date();
    const normalized = dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr;
    return new Date(normalized);
  };

  const stats = useMemo(() => {
    if (!data) return [];
    
    // Time Range Filtering Logic
    const now = new Date();
    const filteredData = data.filter(d => {
      const date = parseDate(d.created_at);
      if (timeRange === 'Semanal') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        return date >= sevenDaysAgo;
      }
      if (timeRange === 'Mensal') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      if (timeRange === 'Trimestral') {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        return date >= threeMonthsAgo;
      }
      if (timeRange === 'Semestral') {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        return date >= sixMonthsAgo;
      }
      if (timeRange === 'Anual') return date.getFullYear() === now.getFullYear();
      return true;
    });

    // Calculate days count in selected period dynamically
    let daysCount = 30; // default/fallback
    if (timeRange === 'Semanal') {
      daysCount = 7;
    } else if (timeRange === 'Mensal') {
      daysCount = now.getDate(); // elapsed days in current month
    } else if (timeRange === 'Trimestral') {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      daysCount = Math.max(1, Math.round((now - threeMonthsAgo) / (1000 * 60 * 60 * 24)));
    } else if (timeRange === 'Semestral') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      daysCount = Math.max(1, Math.round((now - sixMonthsAgo) / (1000 * 60 * 60 * 24)));
    } else if (timeRange === 'Anual') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      daysCount = Math.max(1, Math.round((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1);
    } else {
      const dates = data.map(d => parseDate(d.created_at).getTime());
      if (dates.length > 0) {
        const minDate = Math.min(...dates);
        daysCount = Math.max(1, Math.round((now.getTime() - minDate) / (1000 * 60 * 60 * 24)));
      }
    }

    const defaultColabs = ['Pedro (CF-TI)', 'André (CF-TI)', 'Gabriel (CF-TI)'];
    const activeColabs = filteredData.filter(d => d.colaborador && d.colaborador !== 'Pendente' && d.colaborador.trim() !== '').map(d => d.colaborador);
    const colabs = [...new Set([...activeColabs, ...defaultColabs])];
    return colabs.map(c => {
      const cData = filteredData.filter(d => d.colaborador === c);
      const total = cData.length;
      const concluidas = cData.filter(d => (d.status || '').startsWith('concluida')).length;
      const sla = concluidas > 0 ? Math.round((cData.filter(d => d.status === 'concluida_no_prazo').length / concluidas) * 100) : 100;
      
      const movingAverage = (total / daysCount).toFixed(1);
      const estimatedHours = ((total * 25) / (daysCount * 60)).toFixed(2);

      return { 
        name: c, 
        total, 
        concluidas, 
        sla, 
        pending: total - concluidas,
        movingAverage,
        estimatedHours
      };
    }).sort((a, b) => b.concluidas - a.concluidas);
  }, [data, timeRange]);

  const chartData = useMemo(() => {
    if (!data) return [];
    
    const now = new Date();
    let filtered = data;
    
    filtered = filtered.filter(d => {
      const date = parseDate(d.created_at);
      if (timeRange === 'Semanal') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        return date >= sevenDaysAgo;
      }
      if (timeRange === 'Mensal') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      if (timeRange === 'Trimestral') {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        return date >= threeMonthsAgo;
      }
      if (timeRange === 'Semestral') {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        return date >= sixMonthsAgo;
      }
      if (timeRange === 'Anual') return date.getFullYear() === now.getFullYear();
      return true;
    });

    if (selectedColab !== 'Todos') {
      filtered = filtered.filter(d => d.colaborador === selectedColab);
    } else {
      filtered = filtered.filter(d => d.colaborador !== 'Pendente');
    }

    const acc = {};
    
    filtered.forEach(d => {
      const date = parseDate(d.created_at);
      let key = '';
      let name = '';
      
      if (timeRange === 'Semanal' || timeRange === 'Mensal') {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        key = `${date.getFullYear()}-${month}-${day}`;
        name = `${day}/${month}`;
      } else {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        key = `${date.getFullYear()}-${month}`;
        const shortName = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        name = shortName.replace('.', '').replace(' de ', '/');
        if (name) {
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }
      }
      
      if (!acc[key]) {
        acc[key] = { key, name, Entregas: 0, ConcluidasNoPrazo: 0, Total: 0 };
      }
      
      acc[key].Total += 1;
      if ((d.status || '').startsWith('concluida')) {
        acc[key].Entregas += 1;
        if (d.status === 'concluida_no_prazo') {
          acc[key].ConcluidasNoPrazo += 1;
        }
      }
    });

    const result = Object.values(acc).sort((a, b) => a.key.localeCompare(b.key));

    return result.map(item => {
      const sla = item.Entregas > 0 
        ? Math.round((item.ConcluidasNoPrazo / item.Entregas) * 100) 
        : 100;
      return {
        ...item,
        SLA: sla
      };
    });
  }, [data, selectedColab, timeRange]);

  const ranking = stats.slice(0, 5);

  return (
    <div className="colab-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 className="font-outfit" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Ranking de Performance TI
          <button 
            onClick={() => setShowHelp(!showHelp)}
            style={{
              background: showHelp ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '0.75rem',
              color: 'var(--accent-blue)',
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
              outline: 'none'
            }}
            className="hover-bright animate-all"
          >
            ❓ Entender Métricas & Cargos
          </button>
        </h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tab-group" style={{ transform: 'scale(0.9)', margin: 0 }}>
            {['Semanal', 'Mensal', 'Trimestral', 'Semestral', 'Anual'].map(r => (
              <button key={r} className={`tab-btn ${timeRange === r ? 'active' : ''}`} onClick={() => setTimeRange(r)}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      {showHelp && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel" 
          style={{ padding: '1.8rem', marginBottom: '2.5rem', borderLeft: '6px solid var(--accent-blue)', background: 'rgba(59, 130, 246, 0.03)', borderRadius: '16px' }}
        >
          <h3 className="font-outfit" style={{ fontSize: '1.2rem', marginBottom: '1.2rem', color: '#fff', fontWeight: '800' }}>Guia de Métricas & Governança da Equipe</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            <div>
              <h4 style={{ color: 'var(--accent-blue)', fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📊 Métricas Operacionais (SLA & Capacidade)
              </h4>
              <ul style={{ paddingLeft: '1.2rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li><strong>Prazo de SLA:</strong> O prazo limite acordado para o cadastro de novas empresas e parametrização de acessos é de **24 horas úteis** a partir da abertura no Onety.</li>
                <li><strong>Compliance SLA (%):</strong> Percentual de entregas realizadas rigorosamente dentro do prazo limite estipulado pelo SLA.</li>
                <li><strong>Média Diária:</strong> Quantidade média de tarefas processadas e concluídas por dia útil no período selecionado no filtro.</li>
                <li><strong>Tempo Est./Dia:</strong> Estimativa de tempo diário gasto com parametrizações, baseada em um padrão de **25 minutos por tarefa**.</li>
              </ul>
            </div>
            <div>
              <h4 style={{ color: 'var(--accent-purple)', fontWeight: 'bold', marginBottom: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                👑 Hierarquia de Acessos & Cargos (Roles)
              </h4>
              <ul style={{ paddingLeft: '1.2rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li><strong>👑 Gerente (Manager):</strong> Acesso total administrativo e operacional aos 3 painéis (Felipe). Pode promover ou rebaixar membros, inclusive Administradores.</li>
                <li><strong>🛡️ Administrador (Administrator):</strong> Permissões plenas de edição de tarefas, logs e mapeamento de bases contábeis. Não possui privilégio para alterar o cargo do Gerente.</li>
                <li><strong>👥 Colaborador (Collaborator):</strong> Acesso operacional a tarefas e saídas. Por privacidade, visualiza apenas a própria linha na tabela de controle de Squad.</li>
                <li><strong>👁️ Visitante (Guest):</strong> Perfil de visualização restrita para demonstração rápida de telas utilizando dados simulados/mockados de teste.</li>
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {/* Gráfico de Tendência da Equipe */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <h3 className="font-outfit" style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} color="var(--accent-blue)" /> Tendência Temporal & Eficiência SLA - {selectedColab === 'Todos' ? 'Equipe Consolidada' : selectedColab}
          </h3>
          
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)' }}></span> Entregas Concluídas
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)' }}></span> Compliance SLA %
            </span>
          </div>
        </div>

        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorEntregasColab" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSlaColab" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} label={{ value: 'Entregas', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 10 } }} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--accent-green)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" label={{ value: 'SLA %', angle: 90, position: 'insideRight', style: { fill: 'var(--accent-green)', fontSize: 10 } }} />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-glass)', border: '1px solid var(--border-light)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                itemStyle={{ color: 'var(--text-main)' }}
              />
              <Legend verticalAlign="top" height={36} />
              <Area yAxisId="left" type="monotone" dataKey="Entregas" stroke="var(--accent-blue)" fillOpacity={1} fill="url(#colorEntregasColab)" strokeWidth={3} name="Entregas Concluídas" />
              <Area yAxisId="right" type="monotone" dataKey="SLA" stroke="var(--accent-green)" fillOpacity={1} fill="url(#colorSlaColab)" strokeWidth={2.5} name="Compliance SLA (%)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Ranking */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(255,255,255,0.02)', overflow: 'visible' }}>
        <div style={{ display: 'flex', gap: '2rem', overflowX: 'auto', paddingBottom: '1rem' }}>
          {ranking.map((c, i) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: '220px' }}>
              <div style={{ position: 'relative', flexShrink: 0, padding: '10px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.4rem', border: '3px solid var(--border-light)', boxShadow: '0 8px 20px rgba(0,0,0,0.3)' }}>{c.name[0]}</div>
                <div style={{ position: 'absolute', top: 0, right: 0, background: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : '#cd7f32', width: '28px', height: '28px', borderRadius: '50%', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: '900', boxShadow: '0 4px 15px rgba(0,0,0,0.6)', zIndex: 10, border: '3px solid var(--bg-dark)' }}>{i + 1}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: '700' }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: '600' }}>{c.concluidas} entregas</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="colab-grid">
        {/* Left List */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 className="font-outfit" style={{ fontSize: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <List size={18} /> Colaboradores
          </h3>
          <div className="scroll-list" style={{ maxHeight: '500px' }}>
            <div 
              className={`colab-list-item ${selectedColab === 'Todos' ? 'active' : ''}`}
              onClick={() => setSelectedColab('Todos')}
              style={{ padding: '12px', borderRadius: '12px', cursor: 'pointer', marginBottom: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-main)' }}></div> Ver Todos
            </div>
            {stats.map(c => (
              <div 
                key={c.name} 
                className={`colab-list-item ${selectedColab === c.name ? 'active' : ''}`}
                onClick={() => setSelectedColab(c.name)}
                style={{ padding: '12px', borderRadius: '12px', cursor: 'pointer', marginBottom: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)' }}></div> {c.name}
              </div>
            ))}
          </div>
        </div>

        {/* Right Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', alignContent: 'start' }}>
          {(selectedColab === 'Todos' ? stats : stats.filter(s => s.name === selectedColab)).map(c => (
            <div key={c.name} className="glass-panel" style={{ padding: '1.5rem', borderLeft: '6px solid var(--accent-blue)', transition: 'var(--transition)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>{c.name}</div>
                <Award size={20} color="var(--accent-purple)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.02))', padding: '12px', borderRadius: '12px' }}>
                  <div className="colab-stat-label">Concluídas</div>
                  <div className="colab-stat-value" style={{ fontSize: '1.4rem', color: 'var(--text-main)' }}>{c.concluidas}</div>
                </div>
                <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.02))', padding: '12px', borderRadius: '12px' }}>
                  <div className="colab-stat-label">Taxa SLA</div>
                  <div className="colab-stat-value" style={{ fontSize: '1.4rem', color: c.sla > 90 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{c.sla}%</div>
                </div>
                <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.02))', padding: '12px', borderRadius: '12px' }}>
                  <div className="colab-stat-label">Pendentes</div>
                  <div className="colab-stat-value" style={{ fontSize: '1.4rem', color: 'var(--accent-orange)' }}>{c.pending}</div>
                </div>
                <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.02))', padding: '12px', borderRadius: '12px' }}>
                  <div className="colab-stat-label">Total PRs</div>
                  <div className="colab-stat-value" style={{ fontSize: '1.4rem', color: 'var(--text-main)' }}>{c.total}</div>
                </div>
                <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.02))', padding: '12px', borderRadius: '12px', borderLeft: '3px solid var(--accent-blue)' }}>
                  <div className="colab-stat-label">
                    {timeRange === 'Semanal' ? 'Média Diária (7d)' : timeRange === 'Mensal' ? 'Média Diária (Mês)' : timeRange === 'Trimestral' ? 'Média Diária (90d)' : timeRange === 'Semestral' ? 'Média Diária (180d)' : 'Média Diária (Ano)'}
                  </div>
                  <div className="colab-stat-value" style={{ fontSize: '1.25rem', color: 'var(--accent-blue)', fontWeight: '800' }}>{c.movingAverage} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>/dia</span></div>
                </div>
                <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.02))', padding: '12px', borderRadius: '12px', borderLeft: '3px solid var(--accent-purple)' }}>
                  <div className="colab-stat-label">Tempo Est./Dia</div>
                  <div className="colab-stat-value" style={{ fontSize: '1.25rem', color: 'var(--accent-purple)', fontWeight: '800' }}>{c.estimatedHours} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>h/dia</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FranchiseBreakdown({ data }) {
  const counts = useMemo(() => {
    if (!data) return [];
    const acc = data.reduce((acc, curr) => {
      acc[curr.franquia] = (acc[curr.franquia] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(acc).sort((a,b) => b[1] - a[1]).slice(0, 10);
  }, [data]);

  return (
    <div className="breakdown-list">
      {counts.map(([franquia, count]) => (
        <div key={franquia} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <span style={{ fontSize: '0.85rem' }}>{franquia}</span>
          <span style={{ fontWeight: '800', color: 'var(--accent-blue)' }}>{count}</span>
        </div>
      ))}
    </div>
  );
}
