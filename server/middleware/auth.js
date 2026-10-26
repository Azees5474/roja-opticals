/**
 * auth.js
 * ──────────────────────────────────────────────────────────
 * Authentication middleware validating Bearer tokens for API routes.
 *
 * Security Guarantees:
 * - Safely handles missing, malformed, invalid, and expired tokens.
 * - Catches asynchronous auth provider errors and returns standard HTTP 401
 *   without leaking internal errors, connection strings, or stack traces.
 */

const supabase = require('../lib/supabase');

module.exports = async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      return res.status(401).json({ message: 'No token provided' });
    }

    const trimmed = authHeader.trim();
    const parts = trimmed.split(/\s+/);

    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
      return res.status(401).json({ message: 'Malformed token' });
    }

    const token = parts[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    console.error('[Auth Middleware] Authentication exception:', err.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
