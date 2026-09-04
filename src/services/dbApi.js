/**
 * Cliente de API nativo conectado ao PostgreSQL local via Express API
 */

const API_BASE = '';

function getAuthHeaders() {
  const token = localStorage.getItem('session_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export const dbApi = {
  // 1. Auth
  async login(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao realizar login');
    if (data.access_token) {
      localStorage.setItem('session_token', data.access_token);
    }
    return data;
  },

  async register(email, password, name) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao registrar usuário');
    if (data.access_token) {
      localStorage.setItem('session_token', data.access_token);
    }
    return data;
  },

  async forgotPassword(email) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao solicitar redefinição de senha');
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Tempo limite esgotado ao tentar enviar o e-mail. Verifique o servidor.');
      }
      throw err;
    }
  },

  async resetPassword(token, new_password) {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha');
    return data;
  },

  signOut() {
    localStorage.removeItem('session_token');
  },

  // 2. Audit Logs
  async getAuditLogs(limit = 50) {
    const res = await fetch(`${API_BASE}/api/audit-logs?limit=${limit}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar logs de auditoria');
    return res.json();
  },

  async saveAuditLog(logEntry) {
    const res = await fetch(`${API_BASE}/api/audit-logs`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(logEntry)
    });
    if (!res.ok) throw new Error('Erro ao registrar auditoria');
    return res.json();
  },

  // 3. Tarefa Metadata
  async getTarefaMetadata() {
    const res = await fetch(`${API_BASE}/api/tarefa-metadata`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar metadados');
    return res.json();
  },

  async saveTarefaMetadata(metadata) {
    const res = await fetch(`${API_BASE}/api/tarefa-metadata`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(metadata)
    });
    if (!res.ok) throw new Error('Erro ao salvar metadados');
    return res.json();
  },

  // 4. Franchise Royalties
  async getFranchiseRoyalties() {
    const res = await fetch(`${API_BASE}/api/franchise-royalties`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar franquias');
    return res.json();
  }
};
