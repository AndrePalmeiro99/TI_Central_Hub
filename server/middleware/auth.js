import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'ti_dashboard_secret_key_change_in_prod';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.session_token;
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
    req.user = user;
    next();
  });
};

export const requireAdmin = (req, res, next) => {
  const adminRoles = ['admin', 'administrator', 'manager'];
  if (!adminRoles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
};

export const authenticateTokenOptional = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.session_token;
  if (!token) {
    req.user = null;
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    req.user = err ? null : user;
    next();
  });
};

