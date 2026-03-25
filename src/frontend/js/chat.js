// GraphIQ - chat.js
// Chat interface — redesign pass (Change 11: response formatting)
// + all previous improvements intact

// ─── State ────────────────────────────────────────────────────────────────────
let isSending = false;
let currentLoadingMsgEl = null;

// ─── Loading Steps ────────────────────────────────────────────────────────────
const LOADING_STEPS = [
  { delay: 0,    text: '🔍 Checking query...' },
  { delay: 600,  text: '⚙️ Generating Cypher...' },
  { delay: 1300, text: '📊 Fetching results...' },
  { delay: 2200, text: '✍️ Formatting answer...' },
];

// Improvement 7: keywords → path highlighting
const TRACE_KEYWORDS = ['trace','flow','path','journey','follow','track','route','chain'];

// ─── Change 11: LLM response cleanup ────────────────────────────────────────
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

function formatBotResponse(text) {
  if (!text) return '';
  // Convert markdown bold to plain text
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  // Convert markdown bullets to unicode bullets
  text = text.replace(/^\* /gm, '• ');
  // Collapse 3+ newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // Strip verbose LLM boilerplate phrases
  VERBOSE_PHRASES.forEach(phrase => {
    text = text.replace(new RegExp(phrase + '[^.]*\\.?', 'gi'), '');
  });
  // Collapse multiple spaces, trim
  text = text.replace(/  +/g, ' ');
  text = text.replace(/\. \./g, '.');
  text = text.trim();
  return text;
}

// ─── Initialize ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const input    = document.getElementById('chat-input');
  const sendBtn  = document.getElementById('btn-send');
  const clearBtn = document.getElementById('btn-clear-chat');

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  clearBtn.addEventListener('click', clearChat);

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.query;
      handleSend();
    });
  });
});

// ─── Send Message ─────────────────────────────────────────────────────────────
async function handleSend() {
  if (isSending) return;
  const input = document.getElementById('chat-input');
  const query = input.value.trim();
  if (!query) return;

  isSending = true;
  input.value = '';
  setInputState(false);

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

  // Improvement 5: proper error handling
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
    isSending = false;
    setInputState(true);
    scrollToBottom(document.getElementById('chat-messages'));
    return;
  }

  // Improvement 4: empty result handling
  if (response.allowed !== false &&
      (!response.raw_results || response.raw_results.length === 0)) {
    appendBotResponse({
      ...response,
      answer: 'No results found for this query. Try rephrasing or ask about a specific order, customer, or document.',
    }, query, elapsed);
    updateMetadata(query, { ...response, raw_results: [] }, elapsed);
    if (typeof resetAllHighlights === 'function') resetAllHighlights();
    isSending = false;
    setInputState(true);
    scrollToBottom(document.getElementById('chat-messages'));
    return;
  }

  appendBotResponse(response, query, elapsed);

  // Improvement 7: trace vs node highlight routing
  if (response && response.raw_results && Array.isArray(response.raw_results) && response.raw_results.length > 0) {
    const isTrace = TRACE_KEYWORDS.some(kw => query.toLowerCase().includes(kw));
    if (isTrace && typeof highlightPath === 'function') {
      highlightPath(response.raw_results);
    } else if (typeof highlightNodesFromChat === 'function') {
      highlightNodesFromChat(response.raw_results);
    }
  }

  updateMetadata(query, response, elapsed);
  isSending = false;
  setInputState(true);
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
  const el = document.createElement('div');
  el.className = 'msg bot-msg';

  const allowed = data.allowed !== false;
  let content   = '';

  if (!allowed) {
    // Improvement 8: enhanced guardrail — CSS ::before adds icon
    content += `
      <div class="guardrail-warning">
        This system answers questions about the Order-to-Cash dataset only.
        Please ask about customers, orders, deliveries, billing documents, or payments.
      </div>`;
  } else {
    // Change 11: clean up LLM response before rendering
    const rawAnswer = data.answer || 'No answer returned.';
    const cleanAnswer = formatBotResponse(rawAnswer);
    const answer = escapeHtml(cleanAnswer).replace(/\n/g, '<br>');
    content += `<div class="answer-text">${answer}</div>`;

    if (data.raw_results && data.raw_results.length > 0) {
      content += `<div class="result-count">↳ ${data.raw_results.length} result${data.raw_results.length !== 1 ? 's' : ''}</div>`;
    }
  }

  el.innerHTML = `
    <div class="msg-icon">🤖</div>
    <div class="msg-bubble bot-bubble">${content}</div>
  `;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom(document.getElementById('chat-messages'));
}

// Improvement 5: styled error message
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
  const bar   = document.getElementById('query-metadata');
  bar.classList.remove('hidden');
  document.getElementById('meta-type').textContent  = classifyQuery(query);
  const count = (response.raw_results || []).length;
  document.getElementById('meta-nodes').textContent = `${count} result${count !== 1 ? 's' : ''}`;
  document.getElementById('meta-time').textContent  = `${(elapsed / 1000).toFixed(1)}s`;
}

// ─── Clear Chat ───────────────────────────────────────────────────────────────
function clearChat() {
  document.getElementById('chat-messages').innerHTML = `
    <div class="msg bot-msg">
      <div class="msg-icon">🤖</div>
      <div class="msg-bubble bot-bubble">
        <p>Chat cleared. Ask me anything about the <strong>Order-to-Cash</strong> process.</p>
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
