import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { dbApi } from '../services/dbApi';
import { User, Mail, ChevronRight, ArrowLeft, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import { RateLimiter } from '../security/RateLimiter';

export default function Register({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (RateLimiter.isRegisterLocked()) {
      const remainingTime = RateLimiter.getRegisterRemainingTimeFormatted();
      setError(`Solicitação de acesso bloqueada por segurança. Limite de 2 solicitações a cada 24 horas excedido. Tente novamente em ${remainingTime}.`);
      setLoading(false);
      return;
    }

    try {
      RateLimiter.registerRegistrationAttempt();
      await dbApi.register(email, null, fullName);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Erro ao solicitar acesso. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-bg-glow"></div>
        <div className="auth-bg-glow"></div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="auth-card"
          style={{ textAlign: 'center' }}
        >
          <div className="success-icon-container" style={{ background: 'rgba(16, 185, 129, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <CheckCircle2 size={40} color="var(--accent-green)" />
          </div>
          <h2 className="font-outfit">Verifique seu E-mail!</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem', lineHeight: '1.6', fontSize: '0.9rem' }}>
            Enviamos um e-mail para <strong style={{ color: '#fff' }}>{email}</strong> com um botão seguro para você <strong>definir sua senha de acesso</strong> e concluir o login.
          </p>
          <button className="auth-submit" style={{ marginTop: '2.5rem', width: '100%' }} onClick={onBackToLogin}>
            <ArrowLeft size={18} /> Voltar para Login
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-bg-glow"></div>
      <div className="auth-bg-glow"></div>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="auth-card"
      >
        <div className="auth-header">
          <div className="auth-logo">V</div>
          <h2 className="font-outfit">Solicitar Acesso</h2>
          <p>Junte-se ao BI Executivo da CF Tecnologia</p>
        </div>

        <form onSubmit={handleRegister} className="auth-form">
          <div className="auth-input-group">
            <label><User size={14} /> Nome Completo</label>
            <input type="text" placeholder="Seu nome" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>

          <div className="auth-input-group">
            <label><Mail size={14} /> E-mail Profissional</label>
            <input type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '10px 12px', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '1rem' }}>
            <Sparkles size={16} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
              Não é necessário senha agora. Enviaremos um link exclusivo no seu e-mail para cadastrar sua senha.
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <ShieldAlert size={14} /> {error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <div className="spinner-small"></div> : <>Enviar Solicitação <ChevronRight size={18} /></>}
          </button>

          <button type="button" className="auth-secondary-btn" onClick={onBackToLogin} style={{ width: '100%', background: 'none', border: 'none' }}>
            <ArrowLeft size={14} /> Já tenho conta
          </button>
        </form>
      </motion.div>
    </div>
  );
}


