/**
 * security.js
 * ──────────────────────────────────────────────────────────
 * Security headers and bounded in-memory rate limiting.
 *
 * Local-Use Limitation Documentation:
 * In single-laptop local deployments, all requests originate from 127.0.0.1 (or ::1).
 * Therefore, all local browser tabs share a single rate-limiting bucket.
 * The default max rate is set generously (300 requests per 15 min window) to accommodate
 * local administrative workflows while protecting the Node.js event loop against DoS.
 * The memory footprint is bounded with periodic cleanup and an LRU-style size cap.
 */

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-XSS-Protection', '0');

  // Content-Security-Policy for local laptop SPA and assets
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' http://127.0.0.1:* http://localhost:* https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none';"
  );
  next();
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 300, maxKeys = 2000 } = {}) {
  const hits = new Map();

  // Periodic eviction of expired windows to prevent unbounded memory growth
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of hits.entries()) {
      if (item.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60000));

  // Allow Node process to terminate without waiting on this background timer
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || '127.0.0.1';

    // Evict oldest entry if maximum tracked IPs exceeded
    if (hits.size >= maxKeys && !hits.has(key)) {
      const oldestKey = hits.keys().next().value;
      if (oldestKey) hits.delete(oldestKey);
    }

    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }

    next();
  };
}

module.exports = { securityHeaders, createRateLimiter };
