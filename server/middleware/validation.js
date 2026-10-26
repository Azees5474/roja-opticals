/**
 * validation.js
 * ──────────────────────────────────────────────────────────
 * Request validation middleware for Roja Opticals API.
 * Rejects invalid, malformed, out-of-range, or unsafe input consistently.
 */

const ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const PHONE_REGEX = /^\+?[0-9][0-9\s()-]{6,19}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?)?$/;

function isValidId(val) {
  return typeof val === 'string' && ID_REGEX.test(val.trim());
}

function isValidDate(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!DATE_REGEX.test(trimmed)) return false;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return false;

  // Verify no calendar rollover occurred (e.g. Feb 31 becoming March 3)
  return date.getUTCFullYear() === y && (date.getUTCMonth() + 1) === m && date.getUTCDate() === d;
}

function validateIdParam(paramName = 'id') {
  return (req, res, next) => {
    const val = req.params[paramName];
    if (!val || !isValidId(val)) {
      return res.status(400).json({ message: `Invalid ${paramName} parameter.` });
    }
    next();
  };
}

function validateCustomerInput(isUpdate = false) {
  return (req, res, next) => {
    const { name, phone, email, age, next_visit_date, whatsapp_reminders } = req.body;

    if (!isUpdate || name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 120) {
        return res.status(400).json({ message: 'Customer name is required and must be between 1 and 120 characters.' });
      }
    }

    if (!isUpdate || phone !== undefined) {
      if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
        return res.status(400).json({ message: 'A valid customer phone number is required (7 to 20 digits).' });
      }
    }

    if (email !== undefined && email !== null && email !== '') {
      if (typeof email !== 'string' || email.length > 254 || !EMAIL_REGEX.test(email.trim())) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
      }
    }

    if (age !== undefined && age !== null && age !== '') {
      const numAge = Number(age);
      if (!Number.isInteger(numAge) || numAge < 0 || numAge > 130) {
        return res.status(400).json({ message: 'Age must be an integer between 0 and 130.' });
      }
    }

    if (next_visit_date !== undefined && next_visit_date !== null && next_visit_date !== '') {
      if (!isValidDate(next_visit_date)) {
        return res.status(400).json({ message: 'next_visit_date must be a valid date in YYYY-MM-DD format.' });
      }
    }

    if (whatsapp_reminders !== undefined && typeof whatsapp_reminders !== 'boolean') {
      return res.status(400).json({ message: 'whatsapp_reminders must be a boolean.' });
    }

    next();
  };
}

function validateOrderInput(req, res, next) {
  const { customer_id, product, amount, status = 'Pending' } = req.body;
  const allowedStatuses = ['Pending', 'In Progress', 'Ready', 'Delivered', 'Cancelled'];

  if (!customer_id || !isValidId(customer_id)) {
    return res.status(400).json({ message: 'A valid customer_id is required.' });
  }

  if (typeof product !== 'string' || product.trim().length === 0 || product.trim().length > 200) {
    return res.status(400).json({ message: 'Product description must be between 1 and 200 characters.' });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 10000000) {
    return res.status(400).json({ message: 'Amount must be a positive number up to 10,000,000.' });
  }

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ message: `Status must be one of: ${allowedStatuses.join(', ')}` });
  }

  next();
}

function validateOrderStatus(req, res, next) {
  const { status } = req.body;
  const allowedStatuses = ['Pending', 'In Progress', 'Ready', 'Delivered', 'Cancelled'];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ message: `Status must be one of: ${allowedStatuses.join(', ')}` });
  }
  next();
}

function validateBillingInput(req, res, next) {
  const { customer_id, items, subtotal, discount = 0, gst = 0 } = req.body;

  if (!customer_id || !isValidId(customer_id)) {
    return res.status(400).json({ message: 'A valid customer_id is required.' });
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return res.status(400).json({ message: 'Invoice items must be a non-empty array with at most 100 items.' });
  }

  const values = [subtotal, discount, gst].map(Number);
  if (!values.every(Number.isFinite) || values.some(v => v < 0 || v > 10000000)) {
    return res.status(400).json({ message: 'Subtotal, discount, and GST must be non-negative monetary amounts.' });
  }

  if (values[0] < values[1]) {
    return res.status(400).json({ message: 'Discount cannot exceed subtotal amount.' });
  }

  next();
}

function validateInventoryInput(req, res, next) {
  const { name, sku, stock, price, reorder, brand, category } = req.body;

  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 160) {
    return res.status(400).json({ message: 'Item name is required and must be between 1 and 160 characters.' });
  }

  if (typeof sku !== 'string' || sku.trim().length === 0 || sku.trim().length > 64 || !/^[a-zA-Z0-9_-]+$/.test(sku.trim())) {
    return res.status(400).json({ message: 'SKU is required and must contain alphanumeric characters, hyphens, or underscores (up to 64 chars).' });
  }

  const numStock = Number(stock);
  const numPrice = Number(price);
  const numReorder = Number(reorder);

  if (!Number.isInteger(numStock) || numStock < 0 || numStock > 1000000) {
    return res.status(400).json({ message: 'Stock must be a non-negative integer.' });
  }

  if (!Number.isFinite(numPrice) || numPrice < 0 || numPrice > 1000000) {
    return res.status(400).json({ message: 'Price must be a non-negative amount.' });
  }

  if (!Number.isInteger(numReorder) || numReorder < 0 || numReorder > 1000000) {
    return res.status(400).json({ message: 'Reorder level must be a non-negative integer.' });
  }

  if (brand && (typeof brand !== 'string' || brand.length > 100)) {
    return res.status(400).json({ message: 'Brand must be at most 100 characters.' });
  }

  if (category && (typeof category !== 'string' || category.length > 100)) {
    return res.status(400).json({ message: 'Category must be at most 100 characters.' });
  }

  next();
}

function validateInventoryStock(req, res, next) {
  const { stock } = req.body;
  const numStock = Number(stock);
  if (stock == null || !Number.isInteger(numStock) || numStock < 0 || numStock > 1000000) {
    return res.status(400).json({ message: 'Stock must be a non-negative whole number.' });
  }
  next();
}

function validatePrescriptionInput(req, res, next) {
  const { customer_id, date, doctor } = req.body;

  if (!customer_id || !isValidId(customer_id)) {
    return res.status(400).json({ message: 'A valid customer_id is required.' });
  }

  if (date && !isValidDate(date)) {
    return res.status(400).json({ message: 'Prescription date must be a valid date format (YYYY-MM-DD).' });
  }

  if (doctor && (typeof doctor !== 'string' || doctor.trim().length > 120)) {
    return res.status(400).json({ message: 'Doctor name must be at most 120 characters.' });
  }

  next();
}

function validateFollowupInput(req, res, next) {
  const { customer_id, type, title, priority = 'Medium', due_date } = req.body;
  const allowedPriorities = ['Low', 'Medium', 'High'];

  if (!customer_id || !isValidId(customer_id)) {
    return res.status(400).json({ message: 'A valid customer_id is required.' });
  }

  if (typeof type !== 'string' || type.trim().length === 0 || type.trim().length > 64) {
    return res.status(400).json({ message: 'Follow-up type is required (up to 64 characters).' });
  }

  if (title && (typeof title !== 'string' || title.trim().length > 160)) {
    return res.status(400).json({ message: 'Title must be at most 160 characters.' });
  }

  if (priority && !allowedPriorities.includes(priority)) {
    return res.status(400).json({ message: `Priority must be one of: ${allowedPriorities.join(', ')}` });
  }

  if (due_date && !isValidDate(due_date)) {
    return res.status(400).json({ message: 'due_date must be a valid date format (YYYY-MM-DD).' });
  }

  next();
}

function validateFollowupStatus(req, res, next) {
  const { status } = req.body;
  const valid = ['Pending', 'Due', 'Completed', 'Skipped', 'Cancelled'];
  if (!status || !valid.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${valid.join(', ')}` });
  }
  next();
}

function validateWhatsAppUrlInput(req, res, next) {
  const { phone, message_type, customer_name } = req.body;

  if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
    return res.status(400).json({ message: 'A valid phone number is required.' });
  }

  if (!customer_name || typeof customer_name !== 'string' || customer_name.trim().length > 120) {
    return res.status(400).json({ message: 'Customer name is required (up to 120 chars).' });
  }

  if (!message_type || typeof message_type !== 'string' || message_type.trim().length > 64) {
    return res.status(400).json({ message: 'Valid message_type is required.' });
  }

  next();
}

module.exports = {
  isValidId,
  isValidDate,
  validateIdParam,
  validateCustomerInput,
  validateOrderInput,
  validateOrderStatus,
  validateBillingInput,
  validateInventoryInput,
  validateInventoryStock,
  validatePrescriptionInput,
  validateFollowupInput,
  validateFollowupStatus,
  validateWhatsAppUrlInput,
};
