import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { dbApi } from '../services/dbApi';
import { Lock, Mail, ChevronRight, ShieldCheck, AlertCircle, UserCircle2, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { RateLimiter } from '../security/RateLimiter';

export default function Login({ onLoginSuccess, onShowRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (RateLimiter.isLocked(email)) {
      const remainingTime = RateLimiter.getRemainingTimeFormatted(email);
      setError(`Acesso bloqueado por excesso de tentativas. Tente novamente em ${remainingTime}.`);
      setLoading(false);
      return;
    }

    try {
      const data = await dbApi.login(email, password);
      RateLimiter.reset(email);
      // Map role into user_metadata so useDashboardData can read it correctly
      const mappedUser = {
        ...data.user,
        user_metadata: { role: data.user?.role || 'user', is_approved: true }
      };
      onLoginSuccess({ user: mappedUser, access_token: data.access_token });

    } catch (err) {
      RateLimiter.registerFailure(email);
      const record = RateLimiter.getRecord(email);
      const remainingAttempts = 5 - record.attempts;
      
      if (RateLimiter.isLocked(email)) {
        setError(`Acesso bloqueado por excesso de tentativas. Tente novamente em 15 minutos.`);
      } else {
        setError(err.message || `Erro ao realizar login. Tentativas restantes: ${remainingAttempts}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      setResetSent(true);
    } catch (err) {
      setError('Erro ao enviar solicitação de recuperação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-bg-glow"></div>
      <div className="auth-bg-glow"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="auth-card"
      >
        <div className="auth-header">
          <div className="auth-logo">V</div>
          <h2>{showForgotPassword ? 'Recuperar Senha' : 'Acesso ao Dashboard'}</h2>
          <p>{showForgotPassword ? 'Enviaremos um link para o seu e-mail' : 'TI Central Hub'}</p>
        </div>

        <AnimatePresence mode="wait">
          {showForgotPassword ? (
            <motion.div
              key="forgot"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {resetSent ? (
                <div style={{ textAlign: 'center' }}>
                  <div className="success-icon-container" style={{ background: 'rgba(16, 185, 129, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                    <CheckCircle2 size={40} color="var(--accent-green)" />
                  </div>
                  <h3>E-mail enviado!</h3>
                  <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Verifique sua caixa de entrada para redefinir sua senha.</p>
                  <button 
                    className="auth-submit" 
                    style={{ marginTop: '2rem', width: '100%' }}
                    onClick={() => { setShowForgotPassword(false); setResetSent(false); }}
                  >
                    <ArrowLeft size={18} /> Voltar para Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="auth-form">
                  <div className="auth-input-group">
                    <label><Mail size={14} /> E-mail da Conta</label>
                    <input 
                      type="email" 
                      placeholder="seu@email.com" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  {error && (
                    <div className="auth-error">
                      <AlertCircle size={14} /> {error}
                    </div>
                  )}

                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? <div className="spinner-small"></div> : <>Enviar Recuperação <Send size={18} /></>}
                  </button>

                  <button 
                    type="button" 
                    className="auth-secondary-btn" 
                    style={{ marginTop: '1rem', width: '100%', background: 'none', border: 'none' }}
                    onClick={() => setShowForgotPassword(false)}
                  >
                    <ArrowLeft size={14} /> Voltar ao início
                  </button>
                </form>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <form onSubmit={handleLogin} className="auth-form">
                <AnimatePresence>
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="auth-error"
                    >
                      <AlertCircle size={14} /> {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="auth-input-group">
                  <label><Mail size={14} /> E-mail Profissional</label>
                  <input 
                    type="email" 
                    placeholder="seu@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="auth-input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label><Lock size={14} /> Senha de Acesso</label>
                    <button 
                      type="button" 
                      className="forgot-link-btn" 
                      onClick={() => setShowForgotPassword(true)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', cursor: 'pointer' }}
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? (
                    <div className="spinner-small"></div>
                  ) : (
                    <>
                      Entrar no Sistema <ChevronRight size={18} />
                    </>
                  )}
                </button>

                <div className="auth-divider">
                  <span>OU</span>
                </div>

                <button 
                  type="button" 
                  className="auth-secondary-btn" 
                  onClick={onShowRegister}
                  style={{ width: '100%' }}
                >
                  <UserCircle2 size={18} /> Solicitar Acesso para Demonstração
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

