// GraphIQ - api.js
// All API calls to the FastAPI backend

const API_BASE =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://graphiq-crvn.onrender.com';

/**
 * Fetch the full graph (all nodes + edges in Cytoscape.js format)
 * @returns {Promise<{nodes: Array, edges: Array}>}
 */
async function fetchGraph() {
  const res = await fetch(`${API_BASE}/api/graph`);
  if (!res.ok) throw new Error(`Graph fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Send a natural language query to the chat endpoint
 * @param {string} query - user's question
 * @returns {Promise<{answer: string, cypher: string, raw_results: Array, allowed: boolean}>}
 */
async function sendChat(query) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    // Try to read the server's error detail for a more precise message
    let detail = `Chat request failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch (_) { /* ignore parse errors */ }
    throw new Error(detail);
  }
  return res.json();
}

/**
 * Fetch a single node and its direct neighbors
 * @param {string} nodeId - Cytoscape node ID (e.g. "Customer_1234")
 * @returns {Promise<{nodes: Array, edges: Array}>}
 */
async function fetchNode(nodeId) {
  const encoded = encodeURIComponent(nodeId);
  const res = await fetch(`${API_BASE}/api/graph/node/${encoded}`);
  if (!res.ok) throw new Error(`Node fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Check backend + Neo4j health
 * @returns {Promise<{status: string, neo4j_connected: boolean}>}
 */
async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

// ─── Keep-alive ping ──────────────────────────────────────────────────────────
// Render free tier sleeps after ~15 min of inactivity.
// Ping health every 10 min to keep the instance warm.
(function startKeepAlive() {
  const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
  const ping = () => fetch(`${API_BASE}/api/health`).catch(() => {});
  ping(); // immediate ping on page load
  setInterval(ping, PING_INTERVAL);
})();

