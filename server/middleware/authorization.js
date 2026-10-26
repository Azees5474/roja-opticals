/**
 * authorization.js
 * ──────────────────────────────────────────────────────────
 * Role-based access control (RBAC) middleware for Roja Opticals.
 *
 * Security Guarantees:
 * - Only server-controlled role claims (app_metadata.role or verified server claims)
 *   are trusted.
 * - user_metadata is NEVER trusted for authorization because users can mutate it.
 * - Strict separation between owner-only administrative actions and staff duties.
 */

const STAFF_ROLES = new Set(['owner', 'staff']);

function getRole(user) {
  if (!user || typeof user !== 'object') return '';
  // Authoritative role: ONLY trust app_metadata.role or top-level server role.
  // Never trust user_metadata for authorization.
  const appRole = user.app_metadata && typeof user.app_metadata.role === 'string'
    ? user.app_metadata.role
    : '';
  const directRole = typeof user.role === 'string' && !['authenticated', 'anon'].includes(user.role)
    ? user.role
    : '';

  return (appRole || directRole).trim().toLowerCase();
}

function requireStaff(req, res, next) {
  const role = getRole(req.user);
  if (!STAFF_ROLES.has(role)) {
    return res.status(403).json({ message: 'This account is not authorised to access the shop.' });
  }
  req.userRole = role;
  next();
}

function requireOwner(req, res, next) {
  const role = req.userRole || getRole(req.user);
  if (role !== 'owner') {
    return res.status(403).json({ message: 'Owner access is required for this action.' });
  }
  req.userRole = 'owner';
  next();
}

module.exports = {
  getRole,
  requireStaff,
  requireOwner,
  STAFF_ROLES,
};
