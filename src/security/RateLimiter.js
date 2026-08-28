/**
 * RateLimiter.js
 * Sistema de Defesa de Brute-Force Client-Side (Fortaleza Digital)
 * 
 * Protege os endpoints de autenticação e solicitação de acesso limitando as tentativas
 * por usuário/dispositivo e persistindo o estado de forma resiliente no localStorage.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutos em milissegundos

const MAX_REGISTRATIONS = 10;
const REGISTRATION_LOCKOUT_TIME = 24 * 60 * 60 * 1000; // 24 horas em milissegundos

export const RateLimiter = {
  /**
   * Obtém o estado atual de tentativas para um determinado e-mail
   * @param {string} email 
   * @returns {Object}
   */
  getRecord(email) {
    try {
      const data = localStorage.getItem(`rate_limit_${email.toLowerCase()}`);
      if (!data) return { attempts: 0, lockoutUntil: 0 };
      return JSON.parse(data);
    } catch (e) {
      console.error("Erro ao ler registro do rate limiter:", e);
      return { attempts: 0, lockoutUntil: 0 };
    }
  },

  /**
   * Salva o estado de tentativas para um e-mail
   * @param {string} email 
   * @param {Object} record 
   */
  saveRecord(email, record) {
    try {
      localStorage.setItem(`rate_limit_${email.toLowerCase()}`, JSON.stringify(record));
    } catch (e) {
      console.error("Erro ao salvar registro no rate limiter:", e);
    }
  },

  /**
   * Verifica se o e-mail está bloqueado por excesso de tentativas
   * @param {string} email 
   * @returns {boolean}
   */
  isLocked(email) {
    const record = this.getRecord(email);
    const now = Date.now();
    
    if (record.lockoutUntil && record.lockoutUntil > now) {
      return true;
    }
    
    // Se o tempo de lockout já passou, resetar o lockout
    if (record.lockoutUntil && record.lockoutUntil <= now) {
      this.reset(email);
    }
    
    return false;
  },

  /**
   * Registra uma tentativa falha de acesso. Se atingir o limite, bloqueia.
   * @param {string} email 
   * @returns {Object} Novo registro com status atualizado
   */
  registerFailure(email) {
    const record = this.getRecord(email);
    const now = Date.now();
    
    record.attempts += 1;
    
    if (record.attempts >= MAX_ATTEMPTS) {
      record.lockoutUntil = now + LOCKOUT_TIME;
      console.warn(`[SEGURANÇA] Usuário ${email} bloqueado por excesso de tentativas de login falhas.`);
    }
    
    this.saveRecord(email, record);
    return record;
  },

  /**
   * Reseta as tentativas após login com sucesso ou fim do tempo de bloqueio
   * @param {string} email 
   */
  reset(email) {
    this.saveRecord(email, { attempts: 0, lockoutUntil: 0 });
  },

  /**
   * Obtém o tempo restante de bloqueio em formato amigável (minutos:segundos)
   * @param {string} email 
   * @returns {string}
   */
  getRemainingTimeFormatted(email) {
    const record = this.getRecord(email);
    const now = Date.now();
    const diff = record.lockoutUntil - now;
    
    if (diff <= 0) return "0s";
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    return minutes > 0 
      ? `${minutes} min e ${seconds} seg` 
      : `${seconds} segundos`;
  },

  /**
   * Obtém o estado de registros efetuados nas últimas 24 horas no mesmo dispositivo
   * @returns {Object}
   */
  getRegisterRecord() {
    try {
      const data = localStorage.getItem('rate_limit_registrations');
      if (!data) return { count: 0, firstRegistration: 0 };
      return JSON.parse(data);
    } catch (e) {
      console.error("Erro ao ler registro de rate limiter de registro:", e);
      return { count: 0, firstRegistration: 0 };
    }
  },

  /**
   * Salva o estado de registros
   * @param {Object} record 
   */
  saveRegisterRecord(record) {
    try {
      localStorage.setItem('rate_limit_registrations', JSON.stringify(record));
    } catch (e) {
      console.error("Erro ao salvar registro de rate limiter de registro:", e);
    }
  },

  /**
   * Verifica se o registro de novas contas está temporariamente bloqueado
   * @returns {boolean}
   */
  isRegisterLocked() {
    const record = this.getRegisterRecord();
    const now = Date.now();
    
    if (record.firstRegistration && now - record.firstRegistration > REGISTRATION_LOCKOUT_TIME) {
      this.resetRegister();
      return false;
    }
    
    return record.count >= MAX_REGISTRATIONS;
  },

  /**
   * Registra uma tentativa de cadastro de usuário
   */
  registerRegistrationAttempt() {
    const record = this.getRegisterRecord();
    const now = Date.now();
    
    if (!record.firstRegistration || now - record.firstRegistration > REGISTRATION_LOCKOUT_TIME) {
      record.firstRegistration = now;
      record.count = 1;
    } else {
      record.count += 1;
    }
    
    this.saveRegisterRecord(record);
    return record;
  },

  /**
   * Reseta o histórico de registros
   */
  resetRegister() {
    this.saveRegisterRecord({ count: 0, firstRegistration: 0 });
  },

  /**
   * Retorna o tempo restante de bloqueio de registro formatado
   * @returns {string}
   */
  getRegisterRemainingTimeFormatted() {
    const record = this.getRegisterRecord();
    const now = Date.now();
    const diff = (record.firstRegistration + REGISTRATION_LOCKOUT_TIME) - now;
    
    if (diff <= 0) return "0s";
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours}h e ${minutes} min`;
    }
    return `${minutes} minutos`;
  }
};
