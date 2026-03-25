// GraphIQ - graph.js
// All 7 UI enterprise changes + all previous improvements

// ─── State ────────────────────────────────────────────────────────────────────
let cy = null;
let selectedNodeId    = null;
let overlayVisible    = true;   // Change 3
let currentGraphData  = { nodes: [], edges: [] };

// Change 5: priority properties per label
const PRIORITY_PROPS = {
  Customer:        ['fullName','id','grouping','isBlocked','isArchived','category'],
  SalesOrder:      ['id','totalAmount','currency','deliveryStatus','billingStatus','creationDate'],
  Delivery:        ['id','shippingPoint','goodsMovementStatus','actualGoodsMovementDate','pickingStatus','creationDate'],
  BillingDocument: ['id','totalAmount','currency','isCancelled','soldToParty','accountingDocument'],
  Payment:         ['id','amount','currency','clearingDate','customer','postingDate'],
  JournalEntry:    ['id','postingDate','amount','currency','glAccount','profitCenter'],
  Product:         ['id','productType','baseUnit','productGroup','grossWeight'],
  Plant:           ['id','name','companyCode','country','region'],
};
const MAX_PROPS = 6;

// ─── Initialize Cytoscape ─────────────────────────────────────────────────────
function initCytoscape() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    style: [
      {
        selector: 'node',
        style: {
          'background-color':   'data(color)',
          'label':              'data(displayName)',
          'color':              'rgba(255,255,255,0.70)',
          'font-size':          '9px',
          'font-family':        'Inter, system-ui, sans-serif',
          'text-valign':        'bottom',
          'text-halign':        'center',
          'text-margin-y':      '3px',
          'text-outline-color': '#13151f',
          'text-outline-width':  1.5,
          'text-max-width':     '60px',
          'text-wrap':          'ellipsis',
          'width':               22,
          'height':              22,
          'border-width':        0,
        }
      },
      {
        selector: 'node[label="Customer"]',
        style: { 'width': 34, 'height': 34, 'font-size': '10px', 'font-weight': '600', 'color': '#ffffff' }
      },
      {
        selector: 'edge',
        style: {
          'width':              0.8,
          'line-color':         'rgba(255,255,255,0.08)',
          'target-arrow-color': 'rgba(255,255,255,0.12)',
          'target-arrow-shape': 'triangle',
          'arrow-scale':        0.6,
          'curve-style':        'bezier',
          'label':              '',
          'opacity':            0.6,
        }
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-width':         2.5,
          'border-color':         '#FFD700',
          'border-opacity':       1,
          'width':                32,
          'height':               32,
          'opacity':              1,
          'z-index':              999,
          'transition-property':  'border-width, width, height, opacity',
          'transition-duration':  '0.3s',
        }
      },
      {
        selector: 'node.dimmed',
        style: { 'opacity': 0.08, 'transition-property': 'opacity', 'transition-duration': '0.3s' }
      },
      {
        selector: 'edge.dimmed',
        style: { 'opacity': 0.03, 'transition-property': 'opacity', 'transition-duration': '0.3s' }
      },
      {
        selector: 'node.focused',
        style: { 'border-width': 3, 'border-color': '#ffffff', 'border-opacity': 1, 'width': 40, 'height': 40, 'z-index': 1000 }
      },
      {
        selector: 'node.faded',
        style: { 'opacity': 0.2, 'transition-property': 'opacity', 'transition-duration': '0.3s' }
      },
      {
        selector: 'node.new-node',
        style: { 'opacity': 0 }
      }
    ],
    layout: { name: 'preset' },
    minZoom: 0.05,
    maxZoom: 6,
  });

  cy.on('tap', 'node', onNodeClick);
  cy.on('tap', function(evt) {
    if (evt.target === cy) { resetAllHighlights(); closeNodeDetail(); }
  });

  // Change 10: hover tooltip
  cy.on('mouseover', 'node', function(e) {
    const node    = e.target;
    const tooltip = document.getElementById('node-tooltip');
    tooltip.innerHTML =
      `${getNodeIcon(node.data('label'))} <strong style="color:#e8eaf0">${node.data('displayName')}</strong><br>` +
      `<span style="color:#6b7280;font-size:10px">${node.data('label')}</span>`;
    tooltip.style.display = 'block';
  });
  cy.on('mousemove', 'node', function(e) {
    const t = document.getElementById('node-tooltip');
    t.style.left = (e.originalEvent.clientX + 14) + 'px';
    t.style.top  = (e.originalEvent.clientY - 32) + 'px';
  });
  cy.on('mouseout', 'node', function() {
    document.getElementById('node-tooltip').style.display = 'none';
  });

  // Change 6: live zoom level display
  cy.on('zoom', function() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(cy.zoom() * 100) + '%';
  });

  return cy;
}

// ─── Load Graph ───────────────────────────────────────────────────────────────
async function loadGraph() {
  showGraphLoading('Loading graph...');
  try {
    const data = await fetchGraph();
    currentGraphData = data;
    const elements = buildElements(data);
    cy.add(elements);

    cy.layout({
      name: 'cose', animate: true, animationDuration: 500,
      nodeRepulsion: 400000, idealEdgeLength: 100, gravity: 80,
      numIter: 1000, initialTemp: 200, coolingFactor: 0.95, minTemp: 1.0,
      fit: true, padding: 50,
    }).run();

    cy.ready(function() {
      setTimeout(() => { document.getElementById('cy').style.opacity = '1'; }, 120);
    });

    const statsEl = document.getElementById('header-stats');
    if (statsEl) statsEl.textContent = `${cy.nodes().length} nodes · ${cy.edges().length} edges`;

    updateCounts();
    hideGraphLoading();
    updateStatus(true);

    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(cy.zoom() * 100) + '%';
  } catch (err) {
    console.error('[GraphIQ] loadGraph error:', err);
    hideGraphLoading();
    showGraphError('Cannot reach backend at port 8000.');
    updateStatus(false);
  }
}

// ─── Build elements ───────────────────────────────────────────────────────────
function buildElements(data) {
  const nodes = (data.nodes || []).map(n => ({
    group: 'nodes',
    data: {
      id:          n.data.id,
      label:       n.data.label,
      displayName: truncateText(n.data.displayName || n.data.id, 16),
      color:       n.data.color || getNodeColor(n.data.label),
      properties:  n.data.properties || {},
    }
  }));
  const edges = (data.edges || []).map(e => ({
    group: 'edges',
    data: {
      id:     e.data.id || `${e.data.source}-${e.data.target}-${e.data.label}`,
      source: e.data.source,
      target: e.data.target,
      label:  e.data.label || '',
    }
  }));
  return [...nodes, ...edges];
}

// ─── Node Click → redesigned detail card (Changes 4 & 5) ─────────────────────
function onNodeClick(evt) {
  const node = evt.target;
  selectedNodeId = node.id();

  // Focus mode
  cy.elements().removeClass('focused highlighted dimmed faded');
  node.addClass('focused');
  const neighbors = node.neighborhood();
  neighbors.nodes().addClass('highlighted');
  cy.elements().not(node).not(neighbors).addClass('faded');

  const props   = node.data('properties') || {};
  const label   = node.data('label') || 'Node';
  const icon    = getNodeIcon(label);
  const color   = getNodeColor(label);

  // Header
  const iconEl  = document.getElementById('detail-icon');
  const labelEl = document.getElementById('detail-label-text');
  if (iconEl)  iconEl.textContent = icon;
  if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }

  // Change 5: order by priority, show max 6
  const priority  = PRIORITY_PROPS[label] || [];
  const allKeys   = Object.keys(props).filter(k => props[k] !== null && props[k] !== undefined && props[k] !== '');
  const ordered   = [
    ...priority.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !priority.includes(k)),
  ];
  const shown     = ordered.slice(0, MAX_PROPS);
  const remaining = ordered.length - shown.length;

  let html = '';
  shown.forEach(key => {
    const label_k = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    const val     = truncateText(String(props[key]), 30);
    html += `<div class="detail-prop-row">
      <span class="detail-prop-key">${label_k}</span>
      <span class="detail-prop-value">${val}</span>
    </div>`;
  });
  if (remaining > 0) {
    html += `<div class="detail-hidden-hint">Additional fields hidden for readability</div>`;
  }

  document.getElementById('detail-properties-list').innerHTML = html;

  // Connection count
  const connCount = node.connectedEdges().length;
  const connEl    = document.getElementById('detail-connections');
  if (connEl) connEl.textContent = `Connections: ${connCount}`;

  const panel = document.getElementById('node-detail-panel');
  panel.classList.remove('hidden');
}

function closeNodeDetail() {
  document.getElementById('node-detail-panel').classList.add('hidden');
  selectedNodeId = null;
}

// ─── Expand node (preset layout near parent) ──────────────────────────────────
async function expandSelectedNode() {
  if (!selectedNodeId) return;
  const btn = document.getElementById('btn-expand-node');
  btn.disabled = true;
  btn.textContent = '⏳ Loading...';

  try {
    const data        = await fetchNode(selectedNodeId);
    const existingIds = new Set(cy.elements().map(el => el.id()));
    const parentNode  = cy.getElementById(selectedNodeId);
    const parentPos   = parentNode.position();
    const newElements = [];

    (data.nodes || []).forEach(n => {
      if (!existingIds.has(n.data.id)) {
        newElements.push({
          group: 'nodes',
          data: {
            id: n.data.id, label: n.data.label,
            displayName: truncateText(n.data.displayName || n.data.id, 16),
            color: n.data.color || getNodeColor(n.data.label),
            properties: n.data.properties || {},
          },
          position: {
            x: parentPos.x + (Math.random() * 120 - 60),
            y: parentPos.y + (Math.random() * 120 - 60),
          },
          classes: 'new-node',
        });
      }
    });

    (data.edges || []).forEach(e => {
      const edgeId = e.data.id || `${e.data.source}-${e.data.target}-${e.data.label}`;
      if (!existingIds.has(edgeId)) {
        newElements.push({ group: 'edges', data: { id: edgeId, source: e.data.source, target: e.data.target, label: e.data.label || '' } });
      }
    });

    if (newElements.length > 0) {
      const added = cy.add(newElements);
      added.nodes().animate({ style: { opacity: 1 } }, { duration: 350 });
      updateCounts();
      const statsEl = document.getElementById('header-stats');
      if (statsEl) statsEl.textContent = `${cy.nodes().length} nodes · ${cy.edges().length} edges`;
    }
  } catch (err) {
    console.error('[GraphIQ] expandNode error:', err);
  }

  btn.disabled = false;
  btn.textContent = 'Expand Neighbors';
}

// ─── Highlight from Chat ──────────────────────────────────────────────────────
function highlightNodesFromChat(rawResults) {
  if (!cy || !rawResults || rawResults.length === 0) return;
  resetAllHighlights();
  const allValues = [];
  rawResults.forEach(result => {
    if (typeof result === 'object' && result !== null) {
      Object.values(result).forEach(val => { if (val !== null && val !== undefined) allValues.push(String(val)); });
    }
  });
  const matchedNodes = cy.nodes().filter(node => {
    const nodeId = node.data('id');
    const props  = node.data('properties') || {};
    return allValues.some(val => nodeId === val || nodeId.includes(val) || Object.values(props).some(p => String(p) === val));
  });
  if (matchedNodes.length === 0) return;
  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  matchedNodes.forEach(node => { node.removeClass('dimmed').addClass('highlighted'); node.connectedEdges().removeClass('dimmed'); });
  cy.animate({ fit: { eles: matchedNodes, padding: 80 }, duration: 600, easing: 'ease-in-out-cubic' });
}

// ─── Path Highlight ───────────────────────────────────────────────────────────
function highlightPath(rawResults) {
  if (!cy) return;
  resetAllHighlights();
  const allValues = [];
  rawResults.forEach(result => {
    if (typeof result === 'object' && result !== null) {
      Object.values(result).forEach(val => { if (val !== null && val !== undefined) allValues.push(String(val)); });
    }
  });
  const matchedNodes = cy.nodes().filter(node => {
    const nodeId = node.data('id');
    const props  = node.data('properties') || {};
    return allValues.some(val => nodeId === val || nodeId.includes(val) || Object.values(props).some(p => String(p) === val));
  });
  if (matchedNodes.length < 2) { highlightNodesFromChat(rawResults); return; }
  let pathCollection = cy.collection();
  for (let i = 0; i < matchedNodes.length - 1; i++) {
    try {
      const dj   = cy.elements().dijkstra({ root: matchedNodes[i], directed: true });
      const path = dj.pathTo(matchedNodes[i + 1]);
      if (path && path.length > 0) pathCollection = pathCollection.union(path);
    } catch (e) { /* no path */ }
  }
  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  const toHighlight = pathCollection.length > 0 ? pathCollection : matchedNodes;
  toHighlight.removeClass('dimmed');
  toHighlight.nodes().addClass('highlighted');
  cy.animate({ fit: { eles: toHighlight, padding: 60 }, duration: 600, easing: 'ease-in-out-cubic' });
}

function resetAllHighlights() {
  if (!cy) return;
  cy.elements().removeClass('highlighted dimmed focused faded new-node');
  cy.elements().style({ 'opacity': 1 });
}

// ─── Graph Controls + all new buttons ────────────────────────────────────────
function initGraphControls() {
  // Fit / Reset (top pill)
  document.getElementById('btn-fit').addEventListener('click', () => {
    cy.animate({ fit: { padding: 50 }, duration: 400 });
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    resetAllHighlights(); closeNodeDetail();
    cy.elements().remove();
    document.getElementById('cy').style.opacity = '0';
    await loadGraph();
  });

  // Bottom nav zoom
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 1.3, center: { eles: cy.elements() } }, { duration: 220 });
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 0.75, center: { eles: cy.elements() } }, { duration: 220 });
  });

  // Bottom nav prev / next (pan left/right)
  document.getElementById('btn-nav-prev').addEventListener('click', () => {
    cy.panBy({ x: 120, y: 0 });
  });
  document.getElementById('btn-nav-next').addEventListener('click', () => {
    cy.panBy({ x: -120, y: 0 });
  });

  // Change 6: Download PNG
  document.getElementById('btn-download').addEventListener('click', function() {
    const png  = cy.png({ scale: 2 });
    const link = document.createElement('a');
    link.href  = png;
    link.download = 'graphiq-export.png';
    link.click();
  });

  // Change 6: Fullscreen
  document.getElementById('btn-fullscreen').addEventListener('click', function() {
    const graphPanel = document.getElementById('graph-panel');
    if (!document.fullscreenElement) {
      graphPanel.requestFullscreen && graphPanel.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });

  // Node detail
  document.getElementById('node-detail-close').addEventListener('click', () => {
    resetAllHighlights(); closeNodeDetail();
  });
  document.getElementById('btn-expand-node').addEventListener('click', expandSelectedNode);

  // Change 2: Minimize / Expand
  document.getElementById('btn-minimize').addEventListener('click', function() {
    const graphPanel = document.getElementById('graph-panel');
    const chatPanel  = document.getElementById('chat-panel');
    const isMin      = graphPanel.classList.contains('minimized');
    const span       = this.querySelector('span');

    if (isMin) {
      graphPanel.classList.remove('minimized');
      chatPanel.classList.remove('expanded');
      if (span) span.textContent = 'Minimize';
      setTimeout(() => { cy.resize(); cy.fit(); }, 320);
    } else {
      graphPanel.classList.add('minimized');
      chatPanel.classList.add('expanded');
      if (span) span.textContent = 'Expand';
    }
  });

  // Change 3: Hide / Show Granular Overlay
  document.getElementById('btn-overlay').addEventListener('click', function() {
    overlayVisible = !overlayVisible;
    const span = this.querySelector('span');
    if (!overlayVisible) {
      cy.edges().style({ 'opacity': 0.03, 'label': '' });
      if (span) span.textContent = 'Show Granular Overlay';
    } else {
      cy.edges().style({ 'opacity': 0.6, 'label': '' });
      if (span) span.textContent = 'Hide Granular Overlay';
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function updateCounts() {
  document.getElementById('nodes-count-badge').textContent = `${cy.nodes().length} nodes`;
  document.getElementById('edges-count-badge').textContent = `${cy.edges().length} edges`;
}

function showGraphLoading(msg) {
  const el = document.getElementById('graph-loading');
  document.getElementById('graph-loading-text').textContent = msg;
  el.style.display = 'flex';
}

function hideGraphLoading() {
  document.getElementById('graph-loading').style.display = 'none';
}

function showGraphError(msg) {
  const el      = document.getElementById('graph-loading');
  const spinner = el.querySelector('.graph-spinner');
  if (spinner) spinner.style.display = 'none';
  document.getElementById('graph-loading-text').textContent = msg;
  el.style.display = 'flex';
}

function updateStatus(connected) {
  const pill = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');
  pill.className = `status-pill ${connected ? 'status-connected' : 'status-error'}`;
  text.textContent = connected ? 'Connected' : 'Disconnected';
}

// ─── Startup ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initCytoscape();
  initGraphControls();
  await loadGraph();
});
