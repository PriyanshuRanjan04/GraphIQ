// GraphIQ - utils.js
// Shared helper functions — phase 5 additions included

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

/** Get hex color for a node label. */
function getNodeColor(label) {
  return NODE_COLORS[label] || '#6b7280';
}

/** Get emoji icon for a node label. */
function getNodeIcon(label) {
  return NODE_ICONS[label] || '◉';
}

// ─── Text formatting ──────────────────────────────────────────────────────────

/** Format ISO date string → human readable. */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return String(dateStr); }
}

/** Truncate text with ellipsis. */
function truncateText(text, maxLen = 30) {
  if (!text) return '';
  const s = String(text);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/** Format numeric amount as INR currency. */
function formatCurrency(amount, currency = 'INR') {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return String(amount);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(num);
  } catch { return `${num.toFixed(2)}`; }
}

// ─── Property rendering ───────────────────────────────────────────────────────
const DATE_KEYS     = ['createdAt','updatedAt','billingDate','deliveryDate','postingDate',
                       'entryDate','paymentDate','orderDate','documentDate','creationDate',
                       'actualGoodsMovementDate','billingDocumentDate','clearingDate'];
const CURRENCY_KEYS = ['netAmount','taxAmount','totalAmount','amount','amountInLocalCurrency'];

/**
 * Render a node's properties as detail-prop rows.
 * @param {object} properties
 * @returns {string} HTML string
 */
function formatProperties(properties) {
  if (!properties || typeof properties !== 'object') return '<p class="no-props">No properties</p>';
  const entries = Object.entries(properties).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return '<p class="no-props">No properties</p>';

  return entries.map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    let displayVal;
    if (DATE_KEYS.includes(key))     displayVal = formatDate(value);
    else if (CURRENCY_KEYS.includes(key)) displayVal = formatCurrency(value);
    else displayVal = truncateText(String(value), 60);
    return `<div class="detail-prop-row">
      <span class="detail-prop-key">${label}</span>
      <span class="detail-prop-value">${displayVal}</span>
    </div>`;
  }).join('');
}

// ─── Phase 5: New utility helpers ─────────────────────────────────────────────

/**
 * Get the degree (number of connected edges) of a Cytoscape node safely.
 * @param {object} node - Cytoscape node
 * @returns {number}
 */
function getNodeDegree(node) {
  try { return node.connectedEdges().length; } catch { return 0; }
}

/**
 * Get the display label for a node type (same in our case, but allows remapping).
 * @param {string} type - node label
 * @returns {string}
 */
function getLegendLabel(type) {
  const MAP = {
    BillingDocument: 'Billing Doc',
    JournalEntry:    'Journal',
    SalesOrder:      'Sales Order',
  };
  return MAP[type] || type;
}

/**
 * Reset all legend item active-filter classes.
 * Used externally when resetting graph state.
 */
function resetLegendUI() {
  document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active-filter'));
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.remove('visible');
}

/**
 * Format a connection count for the detail panel footer.
 * @param {number} count
 * @returns {string}
 */
function formatConnectionCount(count) {
  return `Connections: ${count}`;
}

// ─── Query classifier ─────────────────────────────────────────────────────────
function classifyQuery(query) {
  const q = query.toLowerCase();
  if (q.includes('trace') || q.includes('find') || q.includes('show') || q.includes('get')) return '🔍 Search';
  if (q.includes('most') || q.includes('total') || q.includes('count') || q.includes('sum') || q.includes('average')) return '📊 Analytical';
  if (q.includes('billing') && (q.includes('order') || q.includes('delivery'))) return '🔗 Trace';
  return '💬 Query';
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function scrollToBottom(el) {
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}
