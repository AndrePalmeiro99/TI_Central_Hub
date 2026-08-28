/**
 * util/privacyFilter.js
 * Criado pelo subagente @privacy-scout
 * Objetivo: Sanitizar e mascarar dados sensíveis para o Modo Apresentação e logs.
 */

const BLACKLIST_TERMS = [
  'senha', 'password', 'login', 'token', 'access_key', 'secret',
  'credential', 'auth', 'private'
];

/**
 * Mascara strings sensíveis (ex: CPFs, e-mails ou nomes de clientes se necessário)
 */
export const maskSensitiveInfo = (text, isPresentationMode = false) => {
  if (!text) return '';
  if (!isPresentationMode) return text;

  // Se estiver no modo apresentação, borramos o texto ou retornamos um placeholder
  return '••••••••••••';
};

/**
 * Sanitiza descrições de PR removendo termos da blacklist
 */
export const sanitizeDescription = (description) => {
  if (!description) return '';
  
  let sanitized = description;
  BLACKLIST_TERMS.forEach(term => {
    const regex = new RegExp(term + '[:=]?\\s?\\S+', 'gi');
    sanitized = sanitized.replace(regex, '[DADO REMOVIDO PARA SEGURANÇA]');
  });

  return sanitized;
};

/**
 * Valida se uma URL de PR é segura (apenas GitHub ou GitLab corporativo)
 */
export const isUrlSafe = (url) => {
  if (!url) return false;
  const safeDomains = ['github.com', 'gitlab.com', 'cfonety.com.br'];
  try {
    const domain = new URL(url).hostname;
    return safeDomains.some(safe => domain.includes(safe));
  } catch (e) {
    return false;
  }
};
