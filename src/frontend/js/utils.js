// GraphIQ - utils.js
// Shared helper functions

// ─── Node color + icon maps ───────────────────────────────────────────────────

const NODE_COLORS = {
  Customer:        '#4A90D9',
  SalesOrder:      '#7ED321',
  Delivery:        '#F5A623',
  BillingDocument: '#D0021B',
  Payment:         '#9B59B6',
  JournalEntry:    '#1ABC9C',
  Product:         '#E67E22',
  Plant:           '#95A5A6',
};

const NODE_ICONS = {
  Customer:        '👤',
  SalesOrder:      '📋',
  Delivery:        '🚚',
  BillingDocument: '🧾',
  Payment:         '💰',
  JournalEntry:    '📒',
  Product:         '📦',
  Plant:           '🏭',
};

/**
 * Get the hex color for a given node label.
 * @param {string} label
 * @returns {string} hex color
 */
function getNodeColor(label) {
  return NODE_COLORS[label] || '#6b7280';
}

/**
 * Get the emoji icon for a given node label.
 * @param {string} label
 * @returns {string} emoji
 */
function getNodeIcon(label) {
  return NODE_ICONS[label] || '◉';
}

// ─── Text formatting ──────────────────────────────────────────────────────────

/**
 * Format an ISO date string into a human-readable date.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Truncate text to a maximum length with ellipsis.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncateText(text, maxLen = 30) {
  if (!text) return '';
  const s = String(text);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/**
 * Format a numeric amount as currency.
 * @param {number|string} amount
 * @param {string} currency - e.g. "INR", "USD"
 * @returns {string}
 */
function formatCurrency(amount, currency = 'INR') {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return String(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num.toFixed(2)}`;
  }
}

// ─── Property rendering ───────────────────────────────────────────────────────

// Keys that contain date values
const DATE_KEYS = ['createdAt', 'updatedAt', 'billingDate', 'deliveryDate', 'postingDate',
                   'entryDate', 'paymentDate', 'orderDate', 'documentDate'];

// Keys that contain currency amounts
const CURRENCY_KEYS = ['netAmount', 'taxAmount', 'totalAmount', 'amount', 'amountInLocalCurrency'];

/**
 * Render a node's properties as an HTML table.
 * @param {object} properties - flat key-value pairs
 * @returns {string} HTML string
 */
function formatProperties(properties) {
  if (!properties || typeof properties !== 'object') return '<p class="no-props">No properties</p>';
  const entries = Object.entries(properties).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return '<p class="no-props">No properties</p>';

  const rows = entries.map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    let displayVal;
    if (DATE_KEYS.includes(key)) {
      displayVal = formatDate(value);
    } else if (CURRENCY_KEYS.includes(key)) {
      displayVal = formatCurrency(value);
    } else {
      displayVal = truncateText(String(value), 60);
    }
    return `<div class="prop-row"><span class="prop-key">${label}</span><span class="prop-val">${displayVal}</span></div>`;
  });

  return rows.join('');
}

// ─── Query type classifier ────────────────────────────────────────────────────

/**
 * Guess the type of a natural language query for the metadata bar.
 * @param {string} query
 * @returns {string}
 */
function classifyQuery(query) {
  const q = query.toLowerCase();
  if (q.includes('trace') || q.includes('find') || q.includes('show') || q.includes('get')) return '🔍 Search';
  if (q.includes('most') || q.includes('total') || q.includes('count') || q.includes('sum') || q.includes('average')) return '📊 Analytical';
  if (q.includes('billing') && (q.includes('order') || q.includes('delivery'))) return '🔗 Trace';
  return '💬 Query';
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

/**
 * Debounce a function.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Scroll element to bottom smoothly.
 * @param {HTMLElement} el
 */
function scrollToBottom(el) {
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
