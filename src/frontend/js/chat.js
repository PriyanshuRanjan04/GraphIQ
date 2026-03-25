// GraphIQ - chat.js  v2.0 — Chat UX Enhancement
// New in v2.0:
//  ① Clickable entity IDs in chat answers → zoom + highlight + detail panel
//  ② Long result limiting → show 5 + "View all" expand toggle
//  ③ Answer visual hierarchy → bold summary line + structured body
//  ④ Follow-up suggestion chips after each answer
//  ⑤ Better empty state + placeholder

// ─── State ────────────────────────────────────────────────────────────────────
let isSending          = false;
let currentLoadingMsgEl = null;

// ─── Agent status ─────────────────────────────────────────────────────────────
function setAgentStatus(active) {
  const bar = document.getElementById('agent-status');
  if (!bar) return;
  active ? bar.classList.add('hidden') : bar.classList.remove('hidden');
}

// ─── Loading Steps ────────────────────────────────────────────────────────────
const LOADING_STEPS = [
  { delay: 0,    text: '🔍 Checking query...' },
  { delay: 600,  text: '⚙️ Generating Cypher...' },
  { delay: 1300, text: '📊 Fetching results...' },
  { delay: 2200, text: '✍️ Formatting answer...' },
];

const TRACE_KEYWORDS = ['trace','flow','path','journey','follow','track','route','chain'];

// ─── ① Clickable ID Patterns ─────────────────────────────────────────────────
// Matches billing docs (8-digit), sales orders (7-digit starting 7/4/5),
// payments (pattern with _), journal entries, delivery numbers
const ID_PATTERNS = [
  // Billing documents: 8-digit starting 9
  { regex: /\b(9\d{7})\b/g,           label: 'BillingDocument' },
  // Sales orders: 7-digit starting 4 or 5
  { regex: /\b([45]\d{6})\b/g,        label: 'SalesOrder' },
  // Payments: digits_digits pattern
  { regex: /\b(\d{7,13}_\d{1,3})\b/g, label: 'Payment' },
  // Journal entries: 10-digit starting 1-5
  { regex: /\b([1-5]\d{9})\b/g,       label: 'JournalEntry' },
  // Delivery: 10-digit starting 8
  { regex: /\b(8\d{9})\b/g,           label: 'Delivery' },
];

/**
 * Scan plain text for entity IDs and wrap them in clickable spans.
 * Returns HTML string with clickable ID badges embedded.
 */
function linkifyIds(text) {
  if (!text) return '';

  // Build a combined map: position → {id, label}
  // We process the text as HTML-escaped, inject spans with data attributes
  // Work on escaped copy so we don't double-escape
  let result = escapeHtml(text);

  // Track replacements to avoid double-wrapping (use unique placeholder)
  const replacements = [];
  let placeholderIdx = 0;

  ID_PATTERNS.forEach(({ regex, label }) => {
    result = result.replace(regex, (match, id) => {
      const placeholder = `%%ID_${placeholderIdx}%%`;
      replacements.push({
        placeholder,
        html: `<span class="chat-id-link" data-node-id="${id}" data-node-label="${label}" title="Click to locate in graph">${id}<svg width="9" height="9" viewBox="0 0 24 24" fill="none" style="margin-left:3px;vertical-align:middle;opacity:0.6"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2.5"/><path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></span>`,
      });
      placeholderIdx++;
      return placeholder;
    });
  });

  // Replace placeholders with actual HTML
  replacements.forEach(({ placeholder, html }) => {
    result = result.replace(placeholder, html);
  });

  return result;
}

// ─── ③ Answer visual hierarchy ───────────────────────────────────────────────
// Strips LLM boilerplate and upgrades plain text to structured HTML
const VERBOSE_PHRASES = [
  'This information is based on the query results',
  'which retrieved',
  'which counted the number of',
  'The results clearly show that',
  'Based on the executed Cypher query',
  'from the Order-to-Cash dataset',
  'Based on the query results',
  'The query results indicate',
  'According to the query results',
];

function cleanText(text) {
  if (!text) return '';
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/^[*-] /gm, '• ');
  text = text.replace(/\n{3,}/g, '\n\n');
  VERBOSE_PHRASES.forEach(phrase => {
    text = text.replace(new RegExp(phrase + '[^.]*\\.?', 'gi'), '');
  });
  text = text.replace(/  +/g, ' ').replace(/\. \./g, '.').trim();
  return text;
}

/**
 * Convert cleaned answer text to structured HTML.
 * Strategy:
 *   - First sentence/line → summary (slightly larger, bold)
 *   - Remainder → body (smaller, normal weight)
 *   - All IDs become clickable spans
 *   - Bullet lines → styled list items
 */
function structureAnswer(rawText) {
  const clean = cleanText(rawText);
  if (!clean) return '';

  const lines = clean.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return '';

  // Separate summary (non-bullet first line) from body
  const firstLine = lines[0];
  const bodyLines  = lines.slice(1);

  const isBullet = l => l.startsWith('• ') || l.startsWith('- ');

  let html = '';

  // ── Summary block ──
  html += `<div class="answer-summary">${linkifyIds(firstLine)}</div>`;

  // ── Body block ──
  if (bodyLines.length > 0) {
    // Check if body is a bullet list
    const bulletLines = bodyLines.filter(isBullet);
    const textLines   = bodyLines.filter(l => !isBullet(l));

    if (bulletLines.length > 0) {
      html += buildBulletList(bulletLines);
    }
    if (textLines.length > 0) {
      const bodyText = textLines.join('\n');
      html += `<div class="answer-body">${linkifyIds(bodyText).replace(/\n/g, '<br>')}</div>`;
    }
  }

  return html;
}

// ─── ② Bullet list with result limiting ──────────────────────────────────────
const RESULT_LIMIT = 5;

function buildBulletList(lines) {
  if (lines.length === 0) return '';

  const total   = lines.length;
  const limited = total > RESULT_LIMIT;
  const shown   = limited ? lines.slice(0, RESULT_LIMIT) : lines;
  const hidden  = limited ? lines.slice(RESULT_LIMIT)    : [];

  const uid = `list-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

  let html = `<div class="answer-list">`;

  // Shown items
  shown.forEach(line => {
    const text = line.replace(/^[•\-] /, '');
    html += `<div class="answer-list-item">${linkifyIds(text)}</div>`;
  });

  if (limited) {
    // Hidden items (collapsed by default)
    html += `<div class="answer-list-overflow hidden" id="overflow-${uid}">`;
    hidden.forEach(line => {
      const text = line.replace(/^[•\-] /, '');
      html += `<div class="answer-list-item">${linkifyIds(text)}</div>`;
    });
    html += `</div>`;

    // Summary + toggle
    html += `
      <div class="list-expand-row">
        <span class="list-count-label">Showing ${RESULT_LIMIT} of ${total} results</span>
        <button class="btn-expand-list" data-target="overflow-${uid}" data-total="${total}">
          View all ${total} ↓
        </button>
      </div>`;
  }

  html += `</div>`;
  return html;
}

// ─── ④ Follow-up suggestion chips ────────────────────────────────────────────
/**
 * Generate 2-3 contextual follow-up suggestions based on query and results.
 * Rule-based only — no LLM call.
 */
function getFollowUps(query, rawResults) {
  const q = query.toLowerCase();
  const suggestions = [];

  if (q.includes('customer') && !q.includes('order')) {
    suggestions.push('How many orders did this customer place?');
    suggestions.push('Show billing documents for this customer');
  } else if (q.includes('billing') || q.includes('billing document')) {
    suggestions.push('What is the payment status for this document?');
    suggestions.push('Show related deliveries');
    suggestions.push('Trace the full order-to-cash flow');
  } else if (q.includes('order') || q.includes('sales order')) {
    suggestions.push('Show billing documents for these orders');
    suggestions.push('Which deliveries are linked?');
    suggestions.push('Find orders with no billing');
  } else if (q.includes('delivery') || q.includes('deliveries')) {
    suggestions.push('Show billing documents for these deliveries');
    suggestions.push('Which orders are associated?');
  } else if (q.includes('payment')) {
    suggestions.push('Show the billing document for this payment');
    suggestions.push('Which customer made this payment?');
  } else if (q.includes('trace') || q.includes('flow')) {
    suggestions.push('Show incomplete flows');
    suggestions.push('Find all customers on this order');
    suggestions.push('Show related journal entries');
  } else if (q.includes('most') || q.includes('top') || q.includes('count')) {
    suggestions.push('Show details for the top result');
    suggestions.push('Filter by blocked customers only');
    suggestions.push('Show all customers in the dataset');
  } else {
    // Generic fallbacks
    suggestions.push('Which customer placed the most orders?');
    suggestions.push('Show billing documents with high value');
    suggestions.push('Find deliveries with no payment');
  }

  return suggestions.slice(0, 3);
}

function buildFollowUpChips(query, rawResults) {
  const followUps = getFollowUps(query, rawResults);
  if (!followUps.length) return '';

  const chips = followUps
    .map(text => `<button class="followup-chip" data-query="${escapeAttr(text)}">${escapeHtml(text)}</button>`)
    .join('');

  return `<div class="followup-row"><span class="followup-label">Continue exploring</span><div class="followup-chips">${chips}</div></div>`;
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Initialize ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  const clearBtn = document.getElementById('btn-clear-chat');

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  clearBtn.addEventListener('click', clearChat);

  // Static example chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => { input.value = chip.dataset.query; handleSend(); });
  });

  // Delegated: dynamic expand-list buttons and follow-up chips and clickable IDs
  const msgContainer = document.getElementById('chat-messages');
  msgContainer.addEventListener('click', e => {
    // Expand/collapse list
    const expandBtn = e.target.closest('.btn-expand-list');
    if (expandBtn) { handleListExpand(expandBtn); return; }

    // Follow-up chip
    const followupChip = e.target.closest('.followup-chip');
    if (followupChip) {
      const q = followupChip.dataset.query;
      if (q) { document.getElementById('chat-input').value = q; handleSend(); }
      return;
    }

    // Clickable entity ID
    const idLink = e.target.closest('.chat-id-link');
    if (idLink) { handleIdClick(idLink); return; }
  });
});

// ─── ① ID click handler ───────────────────────────────────────────────────────
function handleIdClick(el) {
  const nodeId    = el.dataset.nodeId;
  const nodeLabel = el.dataset.nodeLabel;
  if (!nodeId || typeof cy === 'undefined' || !cy) return;

  // Try to find matching node — ID match first, then property match
  let matched = cy.getElementById(nodeId);

  if (!matched || matched.length === 0) {
    // Search by ID substring or property
    matched = cy.nodes().filter(n => {
      const id    = n.data('id') || '';
      const props = n.data('properties') || {};
      return id === nodeId || id.includes(nodeId) ||
        Object.values(props).some(v => String(v) === nodeId);
    });
  }

  if (!matched || matched.length === 0) {
    console.warn('[GraphIQ] ID not found in graph:', nodeId);
    return;
  }

  const target = matched.length > 1 ? matched[0] : matched;

  // Clear existing highlights
  if (typeof resetAllHighlights === 'function') resetAllHighlights();

  // Highlight and focus
  cy.elements().not(target).not(target.neighborhood()).addClass('faded');
  target.addClass('search-match');
  target.neighborhood().nodes().addClass('neighbor-focus');

  cy.resize();
  cy.animate({ fit: { eles: target, padding: 90 }, duration: 500, easing: 'ease-in-out-cubic' });

  // Open detail panel
  if (typeof renderDetailPanel === 'function') {
    window.selectedNodeId = target.id();
    renderDetailPanel(target);
  }
}

// ─── ② List expand/collapse ───────────────────────────────────────────────────
function handleListExpand(btn) {
  const targetId = btn.dataset.target;
  const total    = parseInt(btn.dataset.total, 10);
  const overflow = document.getElementById(targetId);
  if (!overflow) return;

  const isHidden = overflow.classList.contains('hidden');
  if (isHidden) {
    overflow.classList.remove('hidden');
    btn.textContent = 'Show less ↑';
  } else {
    overflow.classList.add('hidden');
    btn.textContent = `View all ${total} ↓`;
  }
}

// ─── Send Message ─────────────────────────────────────────────────────────────
async function handleSend() {
  if (isSending) return;
  const input = document.getElementById('chat-input');
  const query = input.value.trim();
  if (!query) return;

  isSending = true;
  input.value = '';
  setInputState(false);
  setAgentStatus(true);

  const chips = document.getElementById('example-chips');
  if (chips) chips.style.display = 'none';

  appendUserMessage(query);

  const startTime = Date.now();
  currentLoadingMsgEl = appendLoadingMessage();

  const stepTimers = LOADING_STEPS.map(step =>
    setTimeout(() => {
      if (currentLoadingMsgEl) updateLoadingText(currentLoadingMsgEl, step.text);
    }, step.delay)
  );

  let response = null;
  let errorMsg  = null;

  try {
    response = await sendChat(query);
  } catch (err) {
    console.error('[GraphIQ] sendChat error:', err);
    errorMsg = 'Unable to process request. Please check the backend is running at port 8000.';
  }

  stepTimers.forEach(t => clearTimeout(t));
  const elapsed = Date.now() - startTime;

  if (currentLoadingMsgEl) { currentLoadingMsgEl.remove(); currentLoadingMsgEl = null; }

  if (errorMsg) {
    appendErrorMessage(errorMsg);
    isSending = false; setInputState(true); setAgentStatus(false);
    scrollToBottom(document.getElementById('chat-messages'));
    return;
  }

  // Empty result handling
  if (response.allowed !== false && (!response.raw_results || response.raw_results.length === 0)) {
    appendBotResponse({
      ...response,
      answer: 'No results found for this query. Try rephrasing or ask about a specific order, customer, or document.',
    }, query, elapsed);
    updateMetadata(query, { ...response, raw_results: [] }, elapsed);
    if (typeof resetAllHighlights === 'function') resetAllHighlights();
    isSending = false; setInputState(true); setAgentStatus(false);
    scrollToBottom(document.getElementById('chat-messages'));
    return;
  }

  appendBotResponse(response, query, elapsed);

  // Graph highlighting
  if (response && response.raw_results && Array.isArray(response.raw_results) && response.raw_results.length > 0) {
    const isTrace = TRACE_KEYWORDS.some(kw => query.toLowerCase().includes(kw));
    if (isTrace && typeof highlightPath === 'function') {
      highlightPath(response.raw_results);
    } else if (typeof highlightNodesFromChat === 'function') {
      highlightNodesFromChat(response.raw_results);
    }
  }

  updateMetadata(query, response, elapsed);
  isSending = false; setInputState(true); setAgentStatus(false);
  scrollToBottom(document.getElementById('chat-messages'));
}

// ─── Message Renderers ────────────────────────────────────────────────────────
function appendUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg user-msg';
  el.innerHTML = `
    <div class="msg-bubble user-bubble">${escapeHtml(text)}</div>
    <div class="msg-icon">👤</div>
  `;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom(document.getElementById('chat-messages'));
}

function appendLoadingMessage() {
  const el = document.createElement('div');
  el.className = 'msg bot-msg loading-msg';
  el.innerHTML = `
    <div class="msg-icon">🤖</div>
    <div class="msg-bubble loading-bubble">
      <span class="loading-step-text">🔍 Checking query...</span>
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom(document.getElementById('chat-messages'));
  return el;
}

function updateLoadingText(el, text) {
  const stepEl = el.querySelector('.loading-step-text');
  if (stepEl) {
    stepEl.style.opacity = '0';
    setTimeout(() => { stepEl.textContent = text; stepEl.style.opacity = '1'; }, 150);
  }
}

function appendBotResponse(data, query, elapsed) {
  const el      = document.createElement('div');
  el.className  = 'msg bot-msg';
  const allowed = data.allowed !== false;
  let content   = '';

  if (!allowed) {
    content = `<div class="guardrail-warning">
      This system answers questions about the Order-to-Cash dataset only.
      Please ask about customers, orders, deliveries, billing documents, or payments.
    </div>`;
  } else {
    // ③ Visual hierarchy — structure the answer
    content += structureAnswer(data.answer || 'No answer returned.');

    // Result count badge
    if (data.raw_results && data.raw_results.length > 0) {
      content += `<div class="result-count">↳ ${data.raw_results.length} result${data.raw_results.length !== 1 ? 's' : ''}</div>`;
    }

    // ④ Follow-up chips
    content += buildFollowUpChips(query, data.raw_results || []);
  }

  el.innerHTML = `
    <div class="msg-icon">🤖</div>
    <div class="msg-bubble bot-bubble">${content}</div>
  `;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom(document.getElementById('chat-messages'));
}

function appendErrorMessage(msg) {
  const el = document.createElement('div');
  el.className = 'msg bot-msg';
  el.innerHTML = `
    <div class="msg-icon">🤖</div>
    <div class="msg-bubble error-bubble">
      <span class="error-icon">⚠️</span>${escapeHtml(msg)}
    </div>
  `;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom(document.getElementById('chat-messages'));
}

// ─── Metadata Bar ─────────────────────────────────────────────────────────────
function updateMetadata(query, response, elapsed) {
  if (!response || response.allowed === false) {
    document.getElementById('query-metadata').classList.add('hidden');
    return;
  }
  const bar = document.getElementById('query-metadata');
  bar.classList.remove('hidden');
  document.getElementById('meta-type').textContent  = classifyQuery(query);
  const count = (response.raw_results || []).length;
  document.getElementById('meta-nodes').textContent = `${count} result${count !== 1 ? 's' : ''}`;
  document.getElementById('meta-time').textContent  = `${(elapsed / 1000).toFixed(1)}s`;
}

// ─── Clear Chat (⑤ better empty state) ───────────────────────────────────────
function clearChat() {
  document.getElementById('chat-messages').innerHTML = `
    <div class="msg bot-msg">
      <div class="msg-icon">🤖</div>
      <div class="msg-bubble bot-bubble">
        <div class="answer-summary">Ready to analyze the Order-to-Cash graph.</div>
        <div class="answer-body" style="margin-top:4px;color:rgba(255,255,255,0.45)">
          Start with a document ID or business query.
        </div>
      </div>
    </div>
  `;
  document.getElementById('query-metadata').classList.add('hidden');
  document.getElementById('example-chips').style.display = 'flex';
  if (typeof resetAllHighlights === 'function') resetAllHighlights();
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function setInputState(enabled) {
  const input = document.getElementById('chat-input');
  const btn   = document.getElementById('btn-send');
  input.disabled = !enabled;
  btn.disabled   = !enabled;
  btn.style.opacity = enabled ? '1' : '0.4';
  if (enabled) input.focus();
}
