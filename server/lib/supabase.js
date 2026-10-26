/**
 * supabase.js
 * ──────────────────────────────────────────────────────────
 * Re-exports the unified DatabaseClient from ./db
 * Preserves backward compatibility with all existing imports.
 */

const db = require('./db');

module.exports = db;
