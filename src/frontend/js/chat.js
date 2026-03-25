// GraphIQ - chat.js
// Chat interface: send messages, show loading, render responses, connect to graph

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

// Improvement 7: keywords that trigger path highlighting instead of node highlighting
const TRACE_KEYWORDS = ['trace', 'flow', 'path', 'journey', 'follow', 'track', 'route', 'chain'];

// ─── Initialize ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  const clearBtn = document.getElementById('btn-clear-chat');

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  clearBtn.addEventListener('click', clearChat);

  // Example chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.query;
      input.value = q;
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

  // Hide example chips after first send
  const chips = document.getElementById('example-chips');
  if (chips) chips.style.display = 'none';

  appendUserMessage(query);

  const startTime = Date.now();
  currentLoadingMsgEl = appendLoadingMessage();

  // Progress through loading step labels
  const stepTimers = LOADING_STEPS.map(step =>
    setTimeout(() => {
      if (currentLoadingMsgEl) updateLoadingText(currentLoadingMsgEl, step.text);
    }, step.delay)
  );

  let response = null;
  let errorMsg  = null;

  // Improvement 5: proper try/catch with friendly error in chat
  try {
    response = await sendChat(query);
  } catch (err) {
    console.error('[GraphIQ] sendChat error:', err);
    errorMsg = `Unable to process request. Please check that the backend is running at port 8000.`;
  }

  stepTimers.forEach(t => clearTimeout(t));
  const elapsed = Date.now() - startTime;

  if (currentLoadingMsgEl) {
    currentLoadingMsgEl.remove();
    currentLoadingMsgEl = null;
  }

  if (errorMsg) {
    // Improvement 5: styled error message with re-enable
    appendErrorMessage(errorMsg);
    isSending = false;
    setInputState(true);
    scrollToBottom(document.getElementById('chat-messages'));
    return;
  }

  // Improvement 4: handle empty results gracefully
  if (response.allowed !== false &&
      (!response.raw_results || response.raw_results.length === 0)) {
    appendBotResponse({
      ...response,
      answer: 'No results found for this query. Try rephrasing or ask about a specific order, customer, or document.',
    }, query, elapsed);
    updateMetadata(query, { ...response, raw_results: [] }, elapsed);

    // Reset graph highlights on empty result
    if (typeof resetAllHighlights === 'function') resetAllHighlights();

    isSending = false;
    setInputState(true);
    scrollToBottom(document.getElementById('chat-messages'));
    return;
  }

  appendBotResponse(response, query, elapsed);

  // Improvement 7: route to path or node highlighting based on query keywords
  if (response && response.raw_results && Array.isArray(response.raw_results) && response.raw_results.length > 0) {
    const isTrace = TRACE_KEYWORDS.some(kw => query.toLowerCase().includes(kw));
    if (isTrace && typeof highlightPath === 'function') {
      highlightPath(response.raw_results);
    } else if (typeof highlightNodesFromChat === 'function') {
      // Improvement 2: pass raw_results directly (graph.js handles matching)
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
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
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
    setTimeout(() => {
      stepEl.textContent = text;
      stepEl.style.opacity = '1';
    }, 150);
  }
}

function appendBotResponse(data, query, elapsed) {
  const el = document.createElement('div');
  el.className = 'msg bot-msg';

  const allowed = data.allowed !== false;
  let content = '';

  if (!allowed) {
    // Improvement 8: enhanced guardrail warning — no icon inside HTML since CSS ::before adds it
    content += `
      <div class="guardrail-warning">
        This system is designed to answer questions related to the Order-to-Cash dataset only.
        Please ask about customers, orders, deliveries, billing documents, or payments.
      </div>
    `;
  } else {
    // Answer text
    const answer = escapeHtml(data.answer || 'No answer returned.').replace(/\n/g, '<br>');
    content += `<div class="answer-text">${answer}</div>`;

    // Result count (Improvement 1: no Cypher block)
    if (data.raw_results && data.raw_results.length > 0) {
      content += `<div class="result-count">↳ ${data.raw_results.length} result${data.raw_results.length !== 1 ? 's' : ''} from Neo4j</div>`;
    }
  }

  el.innerHTML = `
    <div class="msg-icon">🤖</div>
    <div class="msg-bubble bot-bubble">${content}</div>
  `;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom(document.getElementById('chat-messages'));
}

// Improvement 5: error message with distinct styling
function appendErrorMessage(msg) {
  const el = document.createElement('div');
  el.className = 'msg bot-msg';
  el.innerHTML = `
    <div class="msg-icon">🤖</div>
    <div class="msg-bubble error-bubble">
      <span class="error-icon">⚠️</span> ${escapeHtml(msg)}
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

// ─── Clear Chat ───────────────────────────────────────────────────────────────
function clearChat() {
  const msgs = document.getElementById('chat-messages');
  msgs.innerHTML = `
    <div class="msg bot-msg">
      <div class="msg-icon">🤖</div>
      <div class="msg-bubble">
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
  btn.style.opacity = enabled ? '1' : '0.5';
  if (enabled) input.focus();
}
