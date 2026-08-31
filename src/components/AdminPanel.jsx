import React, { useState, useEffect } from 'react';
import { dbApi } from '../services/dbApi';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { 
  Users, UserPlus, UserMinus, ShieldCheck, Mail, ShieldAlert, 
  CheckCircle2, XCircle, Database, Plus, Trash2, Search, Building2, User, Download 
} from 'lucide-react';

export default function AdminPanel({ session }) {
  const getApiUrl = (path) => {
    // App unificado (Dockerfile): frontend e backend no mesmo domínio.
    // Usar sempre URLs relativas — sem CORS, sem VITE_API_URL.
    return path;
  };

  const fetchFromApi = async (path, options = {}) => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const token = session?.access_token || hashParams.get('session_token') || localStorage.getItem('session_token');

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

  const [activeSubTab, setActiveSubTab] = useState('squad'); // 'squad' | 'bases'
  
  // Current user details (Manager)
  const [currentUser, setCurrentUser] = useState(null);

  // Squad State
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [squadError, setSquadError] = useState(null);

  // Bases Mappings State
  const [bases, setBases] = useState([]);
  const [loadingBases, setLoadingBases] = useState(false);
  const [basesError, setBasesError] = useState(null);
  const [searchBase, setSearchBase] = useState('');
  
  // Form State
  const [newFranchise, setNewFranchise] = useState('');
  const [newBase, setNewBase] = useState('Domínio Base 1');
  const [formLoading, setFormLoading] = useState(false);

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editingBase, setEditingBase] = useState('');
  const [editingFranchiseName, setEditingFranchiseName] = useState('');

  // Access control profile checks
  const loggedInUserProfile = React.useMemo(() => {
    if (!users) return null;
    const currentId = currentUser?.id || session?.user?.id;
    const currentEmail = currentUser?.email || session?.user?.email;
    return users.find(u => u.id === currentId || u.email?.toLowerCase() === currentEmail?.toLowerCase());
  }, [currentUser, session, users]);

  const loggedInUserRole = loggedInUserProfile?.role || 'guest';
  const loggedInUserEmail = (currentUser?.email || session?.user?.email || '').toLowerCase();
  const isLocalManager = loggedInUserRole === 'manager' || loggedInUserEmail === 'ti@cfcontabilidade.com';
  
  const isLocalAdminEmail = loggedInUserEmail === 'pedro@cfcontabilidade.com' ||
                            loggedInUserEmail === 'pedro.freitas@cffranquias.com.br' ||
                            loggedInUserEmail === 'andre@cfcontabilidade.com' ||
                            loggedInUserEmail === 'andre.palmeiro@cffranquias.com.br' ||
                            loggedInUserEmail === 'gabriel@cfcontabilidade.com' ||
                            loggedInUserEmail === 'gabriel.rozzato@cffranquias.com.br';
                            
  const isLocalAdmin = loggedInUserRole === 'administrator' || loggedInUserRole === 'admin' || isLocalAdminEmail;
  const isLocalCollaborator = loggedInUserRole === 'collaborator';

  const visibleUsers = React.useMemo(() => {
    if (!users) return [];
    if (isLocalManager || isLocalAdmin) return users;
    return users.filter(u => u.id === currentUser?.id || u.email?.toLowerCase() === loggedInUserEmail);
  }, [users, isLocalManager, isLocalAdmin, currentUser, loggedInUserEmail]);

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Tem certeza que deseja excluir permanentemente este usuário da base de dados?")) return;
    setActionLoading(userId);
    try {
      await fetchFromApi(`/api/admin/ti/users?id=${userId}`, { method: 'DELETE' });
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      alert("Erro ao excluir usuário: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setSquadError(null);
    try {
      const data = await fetchFromApi('/api/admin/ti/users');
      setUsers(data || []);
    } catch (err) {
      setSquadError("Gerenciamento de membros via PostgreSQL.");
    }
    setLoadingUsers(false);
  };

  const fetchBases = async () => {
    setLoadingBases(true);
    setBasesError(null);
    try {
      const data = await fetchFromApi('/api/admin/ti/bases');
      setBases(data || []);
    } catch (err) {
      try {
        const royalties = await dbApi.getFranchiseRoyalties();
        setBases(royalties || []);
      } catch (e) {
        setBasesError("Bases carregadas via mapeamento estático.");
      }
    }
    setLoadingBases(false);
  };

  useEffect(() => {
    fetchUsers();
    fetchBases();
    
    if (session?.user) {
      setCurrentUser(session.user);
    }
  }, [session]);

  const handleUpdateRole = async (userId, newRole, approved) => {
    setActionLoading(userId);
    try {
      await fetchFromApi('/api/admin/ti/users/role', {
        method: 'POST',
        body: JSON.stringify({
          target_user_id: userId,
          new_role: newRole,
          new_approved: approved
        })
      });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole, is_approved: approved } : u));
    } catch (err) {
      alert("Erro ao atualizar papel do usuário: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddBase = async (e) => {
    e.preventDefault();
    if (!newFranchise.trim()) return;

    setFormLoading(true);
    try {
      const formattedName = newFranchise.trim().toUpperCase();
      
      if (bases.some(b => b.franchise_name === formattedName)) {
        alert("Esta franquia já possui um mapeamento de base cadastrado!");
        setFormLoading(false);
        return;
      }

      const created = await fetchFromApi('/api/admin/ti/bases', {
        method: 'POST',
        body: JSON.stringify({
          franchise_name: formattedName,
          base_assigned: newBase
        })
      });
      setBases(prev => [...prev, created].sort((a,b) => a.franchise_name.localeCompare(b.franchise_name)));
      setNewFranchise('');
    } catch (err) {
      alert("Erro ao cadastrar empresa/base: " + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteBase = async (id, franchiseName) => {
    if (!confirm(`Deseja realmente excluir o mapeamento da franquia "${franchiseName}"?`)) return;

    try {
      await fetchFromApi(`/api/admin/ti/bases?id=${id}`, {
        method: 'DELETE'
      });
      setBases(bases.filter(b => b.id !== id));
    } catch (err) {
      alert("Erro ao excluir mapeamento: " + err.message);
    }
  };

  const handleSaveEdit = async (id) => {
    try {
      const formattedName = editingFranchiseName.trim().toUpperCase();
      if (!formattedName) {
        alert("O nome da franquia não pode ser vazio!");
        return;
      }

      await fetchFromApi('/api/admin/ti/bases', {
        method: 'POST',
        body: JSON.stringify({
          franchise_name: formattedName,
          base_assigned: editingBase
        })
      });
      setBases(bases.map(b => b.id === id ? { ...b, franchise_name: formattedName, base_assigned: editingBase } : b));
      setEditingId(null);
    } catch (err) {
      alert("Erro ao atualizar mapeamento: " + err.message);
    }
  };

  const [visibleCountBases, setVisibleCountBases] = useState(10);

  useEffect(() => {
    setVisibleCountBases(10);
  }, [searchBase]);

  const filteredBases = (bases || []).filter(b => 
    (b.franchise_name || '').toLowerCase().includes(searchBase.toLowerCase()) ||
    (b.base_assigned || '').toLowerCase().includes(searchBase.toLowerCase())
  );

  const exportBasesToExcel = () => {
    const formattedRows = filteredBases.map(base => ({
      'Franquia / Empresa': base.franchise_name,
      'Base Assinalada': base.base_assigned,
      'Cadastrado Por': base.created_by || 'Sistema'
    }));

    const ws = XLSX.utils.json_to_sheet(formattedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapeamento de Bases");

    ws['!cols'] = [
      { wch: 35 }, // Franquia / Empresa
      { wch: 25 }, // Base Assinalada
      { wch: 25 }  // Cadastrado Por
    ];

    XLSX.writeFile(wb, `Mapeamento_Bases_Franquias_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '_')}.xlsx`);
  };

  return (
    <div className="admin-panel" style={{ width: '100%' }}>
      {/* Sub tabs navigation - Elegant pill capsule selector */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
        <div style={{ 
          display: 'inline-flex', 
          background: 'rgba(0, 0, 0, 0.35)', 
          border: '1px solid rgba(255, 255, 255, 0.05)', 
          padding: '5px', 
          borderRadius: '16px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
        }}>
          <button 
            onClick={() => setActiveSubTab('squad')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              padding: '10px 24px',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: activeSubTab === 'squad' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: activeSubTab === 'squad' ? 'var(--accent-blue)' : 'var(--text-muted)',
              border: activeSubTab === 'squad' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid transparent',
              boxShadow: activeSubTab === 'squad' ? 'inset 0 1px 1px rgba(255,255,255,0.05)' : 'none'
            }}
          >
            <Users size={15} style={{ opacity: activeSubTab === 'squad' ? 1 : 0.6 }} /> 
            <span>Gestão de Squad</span>
          </button>
          
          <button 
            onClick={() => setActiveSubTab('bases')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              padding: '10px 24px',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: activeSubTab === 'bases' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: activeSubTab === 'bases' ? 'var(--accent-blue)' : 'var(--text-muted)',
              border: activeSubTab === 'bases' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid transparent',
              boxShadow: activeSubTab === 'bases' ? 'inset 0 1px 1px rgba(255,255,255,0.05)' : 'none'
            }}
          >
            <Database size={15} style={{ opacity: activeSubTab === 'bases' ? 1 : 0.6 }} /> 
            <span>Mapeamento de Bases</span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'squad' ? (
          <motion.div
            key="squad"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h2 className="font-outfit" style={{ fontSize: '1.5rem', fontWeight: '700' }}>Gestão de Acessos & Squad</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>Aprove novos usuários e defina quem pode ver dados reais.</p>
              </div>
              <div className="badge-blue" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '800', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)' }}>
                {(visibleUsers || []).length} USUÁRIOS REGISTRADOS
              </div>
            </div>
 
            {squadError ? (
              <div style={{ padding: '2rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h3 style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldAlert size={20} /> Falha na Sincronização da Squad
                </h3>
                <p style={{ marginTop: '1rem', color: 'var(--text-main)', fontSize: '0.95rem' }}>{squadError}</p>
                <button className="tab-btn" onClick={() => { setSquadError(null); fetchUsers(); }} style={{ background: 'var(--accent-red)', color: '#fff', marginTop: '1rem' }}>Tentar Novamente</button>
              </div>
            ) : loadingUsers ? (
              <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
                Carregando squad...
              </div>
            ) : (
              <div className="scroll-list" style={{ maxHeight: '60vh', background: 'rgba(0,0,0,0.15)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.02)', padding: '0.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>
                      <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Usuário</th>
                      <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Cargo Atual</th>
                      <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Status</th>
                      <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700', textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(visibleUsers || []).map((user) => (
                      <tr 
                        key={user.id}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                        className="table-row-hover"
                      >
                        <td style={{ padding: '1.2rem 1rem' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{user.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <Mail size={12} color="rgba(255,255,255,0.3)" /> {user.email}
                          </div>
                        </td>
                        <td style={{ padding: '1.2rem 1rem' }}>
                          {(() => {
                            const isUserAdmin = ['pedro@cfcontabilidade.com', 'pedro.freitas@cffranquias.com.br', 'andre@cfcontabilidade.com', 'andre.palmeiro@cffranquias.com.br', 'gabriel@cfcontabilidade.com', 'gabriel.rozzato@cffranquias.com.br'].includes(user.email?.toLowerCase()) || user.role === 'administrator' || user.role === 'admin';
                            const displayRole = user.role === 'manager' ? 'MANAGER' : (isUserAdmin ? 'ADMINISTRATOR' : user.role);
                            const badgeClass = user.role === 'manager' ? 'badge-blue' : (isUserAdmin ? 'badge-teal' : user.role === 'collaborator' ? 'badge-green' : user.role === 'ghost' ? 'badge-red' : 'badge-orange');
                            return (
                              <span className={`task-badge ${badgeClass}`} style={{ fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                                {displayRole === 'ghost' ? 'GHOST (MOCK)' : (displayRole || '').toUpperCase()}
                              </span>
                            );
                          })()}
                         </td>
                         <td style={{ padding: '1.2rem 1rem' }}>
                           {user.is_approved ? (
                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                               <CheckCircle2 size={14} /> APROVADO
                             </div>
                           ) : (
                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-orange)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                               <ShieldAlert size={14} /> PENDENTE
                             </div>
                           )}
                         </td>
                         <td style={{ padding: '1.2rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              {(() => {
                                const isTargetManager = user.role === 'manager' || user.email?.toLowerCase() === 'ti@cfcontabilidade.com';
                                const isTargetAdmin = user.role === 'administrator' || user.role === 'admin' ||
                                  ['pedro@cfcontabilidade.com', 'pedro.freitas@cffranquias.com.br', 'andre@cfcontabilidade.com', 'andre.palmeiro@cffranquias.com.br', 'gabriel@cfcontabilidade.com', 'gabriel.rozzato@cffranquias.com.br'].includes(user.email?.toLowerCase());

                                // Ninguém pode editar o Gerente Felipe (nem o próprio gerente por esta UI)
                                if (isTargetManager) return <span style={{ fontSize: '0.75rem', color: 'var(--text-disabled)', fontStyle: 'italic' }}>Protegido (Gerente)</span>;

                                // ADM comum não pode mexer em outros ADMs
                                if (isTargetAdmin && !isLocalManager) {
                                  return <span style={{ fontSize: '0.75rem', color: 'var(--text-disabled)', fontStyle: 'italic' }}>Sem Permissão</span>;
                                }

                                return (
                                  <>
                                    {!user.is_approved ? (
                                      <button 
                                        className="tab-btn" 
                                        style={{ background: 'var(--accent-green)', color: '#fff', fontSize: '0.7rem', padding: '6px 14px', borderRadius: '8px' }}
                                        onClick={() => handleUpdateRole(user.id, 'guest', true)}
                                        disabled={actionLoading === user.id}
                                      >
                                        {actionLoading === user.id ? '...' : 'Aprovar'}
                                      </button>
                                    ) : (
                                      <>
                                        {/* Gerentes e ADMs podem alterar cargos */}
                                        {(isLocalManager || isLocalAdmin) && (
                                          <>
                                            {(user.role === 'guest' || user.role === 'ghost') ? (
                                              <button 
                                                className="tab-btn" 
                                                style={{ background: 'var(--accent-blue)', color: '#fff', fontSize: '0.7rem', padding: '6px 14px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                onClick={() => handleUpdateRole(user.id, 'collaborator', true)}
                                                disabled={actionLoading === user.id}
                                              >
                                                <UserPlus size={12} /> Tornar Colaborador
                                              </button>
                                            ) : (
                                              <button 
                                                className="tab-btn" 
                                                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.7rem', padding: '6px 14px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                onClick={() => handleUpdateRole(user.id, 'guest', true)}
                                                disabled={actionLoading === user.id}
                                              >
                                                <UserMinus size={12} /> Rebaixar
                                              </button>
                                            )}

                                            {/* Apenas Gerente pode promover alguém a Administrador */}
                                            {isLocalManager && user.role !== 'administrator' && user.role !== 'admin' && (
                                              <button 
                                                className="tab-btn" 
                                                style={{ background: 'var(--accent-teal)', color: '#fff', fontSize: '0.7rem', padding: '6px 14px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                onClick={() => handleUpdateRole(user.id, 'administrator', true)}
                                                disabled={actionLoading === user.id}
                                              >
                                                <ShieldCheck size={12} /> Tornar ADM
                                              </button>
                                            )}
                                          </>
                                        )}
                                        
                                        <button 
                                          className="tab-btn" 
                                          style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.15)', fontSize: '0.7rem', padding: '6px 14px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                          onClick={() => handleUpdateRole(user.id, user.role, false)}
                                          disabled={actionLoading === user.id}
                                        >
                                          <XCircle size={12} /> Revogar
                                        </button>
                                      </>
                                    )}

                                    {/* Apenas Gerentes ou ADMs (para não-ADMs) podem deletar perfis */}
                                    {(isLocalManager || (isLocalAdmin && !isTargetAdmin)) && (
                                      <button 
                                        className="tab-btn" 
                                        style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.7rem', padding: '6px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Excluir Usuário permanentemente"
                                        onClick={() => handleDeleteUser(user.id)}
                                        disabled={actionLoading === user.id}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                         </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="bases"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <div>
              
              {/* Elegant Header - Perfectly matching Squad Tab */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                  <h2 className="font-outfit" style={{ fontSize: '1.5rem', fontWeight: '700' }}>Mapeamento de Bases de Franquias</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>Associe e gerencie os vínculos de banco de dados para cada franquia cadastrada.</p>
                </div>
                <div className="badge-blue" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '800', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)' }}>
                  {filteredBases.length} MAPEAMENTOS
                </div>
              </div>

              {/* Horizontal, compact Form for adding new mappings */}
              <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '16px', marginBottom: '2rem', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.01)' }}>
                <form onSubmit={handleAddBase} style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  
                  <div style={{ flex: '2 1 300px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nome da Franquia / Empresa</label>
                    <input 
                      type="text" 
                      placeholder="Ex: BANGU, CF BERIGO" 
                      value={newFranchise} 
                      onChange={e => setNewFranchise(e.target.value)} 
                      required 
                      style={{ 
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)', 
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        transition: 'all 0.3s',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                      }}
                      className="glowing-input"
                    />
                  </div>

                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Base de Dados Vinculada</label>
                    <select 
                      value={newBase} 
                      onChange={e => setNewBase(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '11px 14px', 
                        borderRadius: '10px', 
                        background: 'rgba(0,0,0,0.3)', 
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        transition: 'all 0.3s',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                      }}
                      className="glowing-input"
                    >
                      <option value="Domínio Base 1">Domínio Base 1</option>
                      <option value="Domínio Base 2">Domínio Base 2</option>
                      <option value="Domínio Base 3">Domínio Base 3</option>
                      <option value="Alterdata Base">Alterdata Base</option>
                      <option value="Alterdata Próprio">Alterdata Próprio</option>
                    </select>
                  </div>

                  <button 
                    type="submit" 
                    className="auth-submit" 
                    disabled={formLoading} 
                    style={{ 
                      flex: '0 0 auto', 
                      padding: '11px 24px', 
                      borderRadius: '10px', 
                      fontWeight: '700', 
                      fontSize: '0.85rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      height: '42px',
                      marginTop: 'auto'
                    }}
                  >
                    {formLoading ? 'Salvando...' : <><Plus size={16} /> Adicionar Vínculo</>}
                  </button>

                </form>
              </div>
              {/* List Section - Full Width */}
              <div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '1.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)' }} />
                    <input 
                      type="text" 
                      placeholder="Buscar por franquia ou base..." 
                      value={searchBase}
                      onChange={e => setSearchBase(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '12px 14px 12px 42px', 
                        borderRadius: '10px', 
                        background: 'rgba(0,0,0,0.25)', 
                        border: '1px solid rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '0.85rem',
                        transition: 'all 0.3s'
                      }}
                      className="glowing-input"
                    />
                  </div>
                  
                  {/* Excel Export Button */}
                  <button 
                    type="button"
                    onClick={exportBasesToExcel} 
                    className="tab-btn btn-excel" 
                    style={{ margin: 0, height: '38px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-blue)', color: '#fff', border: '1px solid rgba(59, 130, 246, 0.2)' }}
                    title="Exportar todos os mapeamentos filtrados para Excel"
                  >
                    <Download size={14} /> EXCEL
                  </button>

                  {/* Total Mapeamentos Badge */}
                  <div className="badge-blue" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: '800', padding: '8px 16px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', height: '38px' }}>
                    <span style={{ opacity: 0.6 }}>TOTAL:</span>
                    <span>{filteredBases.length} {filteredBases.length === 1 ? 'Mapeamento' : 'Mapeamentos'}</span>
                  </div>

                  {/* Registros Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '8px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', height: '38px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '900' }}>REGISTROS:</span>
                    <select 
                      value={visibleCountBases} 
                      onChange={(e) => setVisibleCountBases(Number(e.target.value))}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', fontSize: '0.9rem', fontWeight: '800', outline: 'none', cursor: 'pointer' }}
                    >
                      <option value={10}>10</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={500}>500+</option>
                    </select>
                  </div>
                </div>

                {basesError ? (
                  <div style={{ padding: '2rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <h3 style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <ShieldAlert size={20} /> Falha ao Buscar Mapeamento
                    </h3>
                    <p style={{ marginTop: '0.5rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>{basesError}</p>
                    <button className="tab-btn" onClick={() => { setBasesError(null); fetchBases(); }} style={{ background: 'var(--accent-red)', color: '#fff', marginTop: '1rem' }}>Tentar Novamente</button>
                  </div>
                ) : loadingBases ? (
                  <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
                    Buscando base de franquias...
                  </div>
                ) : (
                  <>
                    <div className="scroll-list" style={{ maxHeight: '60vh', overflowY: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.02)', padding: '0.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>
                          <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Franquia / Empresa</th>
                          <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Base Assinalada</th>
                          <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Cadastrado Por</th>
                          <th style={{ padding: '1.2rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700', textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBases.slice(0, visibleCountBases).map((base) => {
                          const isEditing = base.id === editingId;
                          return (
                            <tr 
                              key={base.id}
                              style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                              className="table-row-hover"
                            >
                              <td style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                {isEditing ? (
                                  <input 
                                    type="text" 
                                    value={editingFranchiseName} 
                                    onChange={e => setEditingFranchiseName(e.target.value)}
                                    style={{ background: '#17191e', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontSize: '0.8rem', width: '180px', outline: 'none' }}
                                    required
                                  />
                                ) : (
                                  base.franchise_name
                                )}
                              </td>
                              <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                                {isEditing ? (
                                  <select 
                                    value={editingBase} 
                                    onChange={e => setEditingBase(e.target.value)}
                                    style={{ 
                                      padding: '6px 10px', 
                                      borderRadius: '8px', 
                                      background: '#17191e', 
                                      border: '1px solid rgba(255,255,255,0.15)', 
                                      color: '#fff',
                                      fontSize: '0.8rem',
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    <option value="Domínio Base 1">Domínio Base 1</option>
                                    <option value="Domínio Base 2">Domínio Base 2</option>
                                    <option value="Domínio Base 3">Domínio Base 3</option>
                                    <option value="Alterdata Base">Alterdata Base</option>
                                    <option value="Alterdata Próprio">Alterdata Próprio</option>
                                  </select>
                                ) : (
                                  <span className={`task-badge ${base.base_assigned.includes('1') ? 'badge-blue' : base.base_assigned.includes('2') ? 'badge-green' : base.base_assigned.includes('3') ? 'badge-orange' : 'badge-purple'}`} style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                    {base.base_assigned.toUpperCase()}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <User size={12} color="rgba(255,255,255,0.25)" />
                                  <span>{base.created_by || 'Sistema'}</span>
                                </div>
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                  {isEditing ? (
                                    <>
                                      <button 
                                        className="tab-btn" 
                                        style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
                                        onClick={() => handleSaveEdit(base.id)}
                                      >
                                        Salvar
                                      </button>
                                      <button 
                                        className="tab-btn" 
                                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
                                        onClick={() => setEditingId(null)}
                                      >
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        className="tab-btn" 
                                        style={{ background: 'rgba(59, 130, 246, 0.08)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.15)', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
                                        onClick={() => {
                                          setEditingId(base.id);
                                          setEditingBase(base.base_assigned);
                                          setEditingFranchiseName(base.franchise_name);
                                        }}
                                      >
                                        Editar
                                      </button>
                                      <button 
                                        className="tab-btn" 
                                        style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.15)', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
                                        onClick={() => handleDeleteBase(base.id, base.franchise_name)}
                                      >
                                        <Trash2 size={12} /> Excluir
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredBases.length === 0 && (
                          <tr>
                            <td colSpan="4" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nenhum mapeamento de franquia encontrado.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredBases.length > visibleCountBases && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2.5rem' }}>
                      <button 
                        type="button"
                        className="tab-btn" 
                        onClick={() => setVisibleCountBases(prev => prev + 15)} 
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
                        Carregar Mais Mapeamentos
                      </button>
                    </div>
                  )}
                  </>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
