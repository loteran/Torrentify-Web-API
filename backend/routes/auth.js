const express = require('express');
const router = express.Router();
const authManager = require('../services/authManager');

/**
 * GET /api/auth/status
 * Retourne le statut de l'authentification
 */
router.get('/status', (req, res) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.auth_token;
  const token = authHeader?.replace('Bearer ', '') || cookieToken;

  const isEnabled = authManager.isEnabled();
  let isAuthenticated = false;

  if (token) {
    const result = authManager.verifyToken(token);
    isAuthenticated = result.valid;
  }

  res.json({
    enabled: isEnabled,
    authenticated: isAuthenticated || !isEnabled
  });
});

/**
 * POST /api/auth/login
 * Connexion utilisateur
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiants requis' });
  }

  if (!authManager.verifyCredentials(username, password)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  const token = authManager.generateToken(username);

  // Définir le cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && req.secure,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 heures
  });

  res.json({
    success: true,
    message: 'Connexion réussie',
    token
  });
});

/**
 * POST /api/auth/logout
 * Déconnexion utilisateur
 */
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.auth_token;
  const token = authHeader?.replace('Bearer ', '') || cookieToken;

  if (token) {
    authManager.revokeToken(token);
  }

  res.clearCookie('auth_token');

  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

/**
 * GET /api/auth/check
 * Vérifie si le token est valide
 */
router.get('/check', (req, res) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.auth_token;
  const token = authHeader?.replace('Bearer ', '') || cookieToken;

  if (!authManager.isEnabled()) {
    return res.json({ valid: true, authRequired: false });
  }

  if (!token) {
    return res.json({ valid: false, authRequired: true });
  }

  const result = authManager.verifyToken(token);

  res.json({
    valid: result.valid,
    authRequired: true,
    user: result.user,
    error: result.error
  });
});

module.exports = router;
