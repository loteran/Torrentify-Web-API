const crypto = require('crypto');

// Secret pour les tokens (généré une fois au démarrage)
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 heures

// Store des tokens valides (en mémoire)
const validTokens = new Map();

// Référence au configManager (injectée après pour éviter dépendance circulaire)
let configManager = null;

class AuthManager {
  constructor() {
    this._enabled = null; // Cache
  }

  /**
   * Injecte le configManager (appelé au démarrage)
   */
  setConfigManager(cm) {
    configManager = cm;
  }

  /**
   * Récupère la configuration d'auth
   */
  getAuthConfig() {
    if (configManager) {
      return configManager.getAuthConfig();
    }
    // Fallback sur variables d'environnement
    return {
      enabled: process.env.AUTH_ENABLED === 'true',
      username: process.env.AUTH_USERNAME || 'admin',
      passwordHash: process.env.AUTH_PASSWORD ?
        crypto.createHash('sha256').update(process.env.AUTH_PASSWORD).digest('hex') : ''
    };
  }

  /**
   * Vérifie si l'authentification est activée
   */
  isEnabled() {
    return this.getAuthConfig().enabled;
  }

  /**
   * Génère un token JWT simple
   */
  generateToken(username) {
    const payload = {
      user: username,
      exp: Date.now() + TOKEN_EXPIRY,
      jti: crypto.randomBytes(16).toString('hex')
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(payloadBase64)
      .digest('base64url');

    const token = `${payloadBase64}.${signature}`;

    // Stocker le token
    validTokens.set(payload.jti, {
      exp: payload.exp,
      user: payload.user
    });

    // Nettoyer les tokens expirés
    this.cleanExpiredTokens();

    return token;
  }

  /**
   * Vérifie un token
   */
  verifyToken(token) {
    if (!token) return { valid: false, error: 'Token manquant' };

    try {
      const [payloadBase64, signature] = token.split('.');

      // Vérifier la signature
      const expectedSignature = crypto
        .createHmac('sha256', AUTH_SECRET)
        .update(payloadBase64)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Signature invalide' };
      }

      // Décoder le payload
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

      // Vérifier l'expiration
      if (Date.now() > payload.exp) {
        validTokens.delete(payload.jti);
        return { valid: false, error: 'Token expiré' };
      }

      // Vérifier que le token est dans le store
      if (!validTokens.has(payload.jti)) {
        return { valid: false, error: 'Token révoqué' };
      }

      return { valid: true, user: payload.user };
    } catch (error) {
      return { valid: false, error: 'Token invalide' };
    }
  }

  /**
   * Vérifie les identifiants
   */
  verifyCredentials(username, password) {
    const authConfig = this.getAuthConfig();

    if (username !== authConfig.username) {
      return false;
    }

    // Vérifier le mot de passe hashé
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    return passwordHash === authConfig.passwordHash;
  }

  /**
   * Révoque un token
   */
  revokeToken(token) {
    try {
      const [payloadBase64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
      validTokens.delete(payload.jti);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Révoque tous les tokens
   */
  revokeAllTokens() {
    validTokens.clear();
  }

  /**
   * Nettoie les tokens expirés
   */
  cleanExpiredTokens() {
    const now = Date.now();
    for (const [jti, data] of validTokens.entries()) {
      if (now > data.exp) {
        validTokens.delete(jti);
      }
    }
  }

  /**
   * Middleware Express pour protéger les routes
   */
  middleware() {
    return (req, res, next) => {
      // Si l'auth n'est pas activée, passer
      if (!this.isEnabled()) {
        return next();
      }

      // Routes publiques (login, check auth status)
      const publicRoutes = ['/api/auth/login', '/api/auth/status'];
      if (publicRoutes.some(route => req.path.startsWith(route))) {
        return next();
      }

      // Récupérer le token
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.auth_token;
      const token = authHeader?.replace('Bearer ', '') || cookieToken;

      // Vérifier le token
      const result = this.verifyToken(token);

      if (!result.valid) {
        // Pour les requêtes API, retourner 401
        if (req.path.startsWith('/api/')) {
          return res.status(401).json({ error: 'Non autorisé', message: result.error });
        }
        // Pour les autres requêtes, laisser passer (le frontend gérera)
        return next();
      }

      // Ajouter l'utilisateur à la requête
      req.user = result.user;
      next();
    };
  }
}

module.exports = new AuthManager();
