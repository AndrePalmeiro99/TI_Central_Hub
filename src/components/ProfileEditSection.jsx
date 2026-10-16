import React, { useState } from 'react';
import { Pencil, Key, Check, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { dbApi } from '../services/dbApi';

const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-light)',
  color: 'var(--text-main)',
  padding: '9px 12px',
  borderRadius: '8px',
  fontSize: '0.8rem',
  outline: 'none',
  boxSizing: 'border-box'
};

const btn = (variant) => ({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '9px',
  borderRadius: '8px',
  fontWeight: 'bold',
  fontSize: '0.75rem',
  cursor: 'pointer',
  transition: 'var(--transition-smooth)',
  border: '1px solid',
  ...(variant === 'primary'
    ? { background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.35)', color: 'var(--accent-blue)' }
    : { background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border-light)', color: 'var(--text-main)' })
});

export default function ProfileEditSection({ session, onSessionUpdate }) {
  const user = session?.user || {};
  const role = (user.role || user.user_metadata?.role || '').toLowerCase();
  const isManager = role === 'manager';
  const currentName = user.full_name || user.name || user.user_metadata?.full_name || '';

  const [mode, setMode] = useState(null); // null | 'name' | 'password'
  const [name, setName] = useState(currentName);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }

  const reset = () => {
    setMode(null);
    setName(currentName);
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
  };

  const saveName = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const data = await dbApi.updateProfile(name.trim());
      const newName = data.user?.full_name || name.trim();
      const updatedUser = {
        ...user,
        name: newName,
        full_name: newName,
        user_metadata: { ...(user.user_metadata || {}), full_name: newName }
      };
      localStorage.setItem('session_user', JSON.stringify(updatedUser));
      onSessionUpdate?.({ ...session, user: updatedUser });
      setMsg({ type: 'ok', text: 'Nome atualizado!' });
      setMode(null);
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (newPwd.length < 6) return setMsg({ type: 'err', text: 'A nova senha deve ter no mínimo 6 caracteres.' });
    if (newPwd !== confirmPwd) return setMsg({ type: 'err', text: 'As senhas não coincidem.' });
    setLoading(true);
    try {
      await dbApi.changePassword(currentPwd, newPwd);
      setMsg({ type: 'ok', text: 'Senha alterada com sucesso!' });
      reset();
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {mode === null && (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button id="profile-edit-name-btn" type="button" style={btn()} className="hover-bright"
            onClick={() => { setMsg(null); setName(currentName); setMode('name'); }}>
            <Pencil size={13} /> Editar
          </button>
          {isManager && (
            <button id="profile-change-password-btn" type="button" style={btn()} className="hover-bright"
              onClick={() => { setMsg(null); setMode('password'); }}>
              <Key size={13} /> Alterar Senha
            </button>
          )}
        </div>
      )}

      {mode === 'name' && (
        <form onSubmit={saveName} className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.015)' }}>
          <label style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'left' }}>Nome de Exibição</label>
          <input id="profile-name-input" style={inputStyle} value={name} maxLength={80} autoFocus
            onChange={(e) => setName(e.target.value)} required minLength={2} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={btn()} onClick={reset} disabled={loading}><X size={13} /> Cancelar</button>
            <button id="profile-name-save" type="submit" style={btn('primary')} disabled={loading}>
              <Check size={13} /> {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {mode === 'password' && isManager && (
        <form onSubmit={savePassword} className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.015)' }}>
          <label style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'left' }}>Alterar Senha</label>
          <input id="profile-current-password" type="password" placeholder="Senha atual" style={inputStyle}
            value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} required autoFocus />
          <input id="profile-new-password" type="password" placeholder="Nova senha (mín. 6)" style={inputStyle}
            value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
          <input id="profile-confirm-password" type="password" placeholder="Confirmar nova senha" style={inputStyle}
            value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={btn()} onClick={reset} disabled={loading}><X size={13} /> Cancelar</button>
            <button id="profile-password-save" type="submit" style={btn('primary')} disabled={loading}>
              <Check size={13} /> {loading ? 'Salvando...' : 'Salvar Senha'}
            </button>
          </div>
        </form>
      )}

      {msg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 600,
          color: msg.type === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)'
        }}>
          {msg.type === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {msg.text}
        </div>
      )}
    </div>
  );
}
