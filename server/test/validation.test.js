const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidId,
  isValidDate,
  validateIdParam,
  validateCustomerInput,
  validateOrderInput,
  validateBillingInput,
  validateInventoryInput,
  validateFollowupStatus,
} = require('../middleware/validation');

test('Input Validation & Sanitization Suite', async (t) => {
  await t.test('isValidId - rejects path traversal and unsafe characters', () => {
    // Valid IDs
    assert.equal(isValidId('cae928f3-c0f2-4ba1-ba51-2d99d2a86a5e'), true);
    assert.equal(isValidId('cust_12345'), true);
    assert.equal(isValidId('item-99_a'), true);

    // Path traversal attempts
    assert.equal(isValidId('../secrets'), false);
    assert.equal(isValidId('..\\windows\\system32'), false);
    assert.equal(isValidId('customers/../../etc/passwd'), false);
    assert.equal(isValidId('id\0nullbyte'), false);
    assert.equal(isValidId(''), false);
    assert.equal(isValidId('   '), false);
    assert.equal(isValidId('a'.repeat(65)), false, 'Must reject IDs over 64 chars');
  });

  await t.test('isValidDate - validates ISO date formats and rejects bogus dates', () => {
    assert.equal(isValidDate('2026-10-24'), true);
    assert.equal(isValidDate('2026-12-31T23:59:59.000Z'), true);

    assert.equal(isValidDate('not-a-date'), false);
    assert.equal(isValidDate('2026-02-31'), false, 'Non-existent calendar date');
    assert.equal(isValidDate('24/10/2026'), false, 'Must enforce standard ISO format');
    assert.equal(isValidDate(''), false);
    assert.equal(isValidDate(null), false);
  });

  await t.test('validateIdParam - returns 400 for invalid ID parameter in route', () => {
    const middleware = validateIdParam('id');
    let nextCalled = false;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };

    middleware({ params: { id: '../traversal' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    nextCalled = false;
    middleware({ params: { id: 'valid-id-123' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  await t.test('validateCustomerInput - enforces valid name, phone, email, and age', () => {
    const middleware = validateCustomerInput(false);
    const makeRes = () => ({
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    });

    // Missing phone
    let res = makeRes();
    let nextCalled = false;
    middleware({ body: { name: 'Alice' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    // Invalid phone characters
    res = makeRes();
    nextCalled = false;
    middleware({ body: { name: 'Alice', phone: 'abc-invalid' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    // Invalid age
    res = makeRes();
    nextCalled = false;
    middleware({ body: { name: 'Alice', phone: '9876543210', age: -5 } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    // Valid customer
    res = makeRes();
    nextCalled = false;
    middleware({ body: { name: 'Alice', phone: '+91 9876543210', email: 'alice@example.com', age: 28 } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  await t.test('validateBillingInput - rejects negative amounts and discount > subtotal', () => {
    const makeRes = () => ({
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    });

    // Discount greater than subtotal
    let res = makeRes();
    let nextCalled = false;
    validateBillingInput({
      body: { customer_id: 'cust-1', items: [{ name: 'Frame' }], subtotal: 1000, discount: 1500, gst: 100 }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Discount cannot exceed/i);

    // Negative GST
    res = makeRes();
    nextCalled = false;
    validateBillingInput({
      body: { customer_id: 'cust-1', items: [{ name: 'Frame' }], subtotal: 1000, discount: 100, gst: -50 }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    // Non-array items
    res = makeRes();
    nextCalled = false;
    validateBillingInput({
      body: { customer_id: 'cust-1', items: 'not-an-array', subtotal: 1000, discount: 0, gst: 0 }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    // Valid invoice
    res = makeRes();
    nextCalled = false;
    validateBillingInput({
      body: { customer_id: 'cust-1', items: [{ name: 'Frame', price: 1000 }], subtotal: 1000, discount: 100, gst: 180 }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  await t.test('validateOrderInput - rejects negative amount and invalid status enum', () => {
    const makeRes = () => ({
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    });

    let res = makeRes();
    let nextCalled = false;
    validateOrderInput({
      body: { customer_id: 'cust-1', product: 'Ray-Ban Aviator', amount: -500 }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    // Invalid status enum
    res = makeRes();
    nextCalled = false;
    validateOrderInput({
      body: { customer_id: 'cust-1', product: 'Ray-Ban Aviator', amount: 5000, status: 'ShippedViaRocket' }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    // Valid order
    res = makeRes();
    nextCalled = false;
    validateOrderInput({
      body: { customer_id: 'cust-1', product: 'Ray-Ban Aviator', amount: 5000, status: 'In Progress' }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  await t.test('validateFollowupStatus - enforces allowed followup status values', () => {
    const makeRes = () => ({
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    });

    let res = makeRes();
    let nextCalled = false;
    validateFollowupStatus({ body: { status: 'BogusStatus' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);

    res = makeRes();
    nextCalled = false;
    validateFollowupStatus({ body: { status: 'Completed' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});
