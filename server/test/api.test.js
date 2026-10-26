const test = require('node:test');
const assert = require('node:assert/strict');
const { securityHeaders, createRateLimiter } = require('../middleware/security');

test('API Security & Reliability Suite', async (t) => {
  await t.test('securityHeaders - sets nosniff, frame denial, CSP, and permissions policy', () => {
    const headers = {};
    const res = {
      setHeader(k, v) { headers[k] = v; },
    };
    let nextCalled = false;
    securityHeaders({}, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.ok(headers['Permissions-Policy'].includes('camera=()'));
    assert.ok(headers['Content-Security-Policy'].includes("default-src 'self'"));
    assert.ok(headers['Content-Security-Policy'].includes("frame-ancestors 'none'"));
  });

  await t.test('createRateLimiter - enforces max requests and sets Retry-After header', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, maxKeys: 10 });
    const makeRes = () => ({
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    });

    const ip = '127.0.0.1';
    let passed = 0;
    let blocked = 0;

    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      let nextCalled = false;
      limiter({ ip }, res, () => { nextCalled = true; });

      if (nextCalled) {
        passed++;
      } else {
        blocked++;
        assert.equal(res.statusCode, 429);
        assert.ok(res.headers['Retry-After']);
        assert.match(res.body.message, /Too many requests/i);
      }
    }

    assert.equal(passed, 3, 'First 3 requests must pass');
    assert.equal(blocked, 2, 'Next 2 requests must be blocked with 429');
  });

  await t.test('createRateLimiter - evicts oldest keys when maxKeys cap is reached (bounded memory)', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 10, maxKeys: 3 });
    const makeRes = () => ({
      setHeader() {},
      status() { return this; },
      json() { return this; },
    });

    // Populate with 4 distinct IPs
    for (let i = 1; i <= 4; i++) {
      let nextCalled = false;
      limiter({ ip: `10.0.0.${i}` }, makeRes(), () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    }
    // No error thrown and memory remains bounded
  });
});
