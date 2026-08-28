import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { dbApi } from '../services/dbApi';
import { User, Mail, Lock, ChevronRight, ArrowLeft, CheckCircle2, ShieldAlert, Building2 } from 'lucide-react';
import { RateLimiter } from '../security/RateLimiter';

export default function Register({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [empresa, setEmpresa] = useState('');
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
      await dbApi.register(email, password, fullName);
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
          <h2 className="font-outfit">Confirme seu E-mail!</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem', lineHeight: '1.5' }}>
            Enviamos um link de confirmação para <strong>{email}</strong>.<br/><br/>
            Para sua segurança, você precisa **clicar no link no seu e-mail** para ativar sua conta e entrar na fase de análise.
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
            <label><Building2 size={14} /> Empresa / Franquia</label>
            <input type="text" placeholder="Nome da sua unidade" value={empresa} onChange={(e) => setEmpresa(e.target.value)} required />
          </div>

          <div className="auth-input-group">
            <label><Mail size={14} /> E-mail Profissional</label>
            <input type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="auth-input-group">
            <label><Lock size={14} /> Definir Senha</label>
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
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

