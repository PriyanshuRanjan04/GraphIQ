// GraphIQ - graph.js  v2.1 — Phase 5 Polish
// Changes from v2.0:
//  #1  Much higher node repulsion + longer ideal edges → open layout
//  #2  Plant node positional treatment improved (lower repulsion, gravity bias)
//  #3  "Expand Neighbors" → "Focus Connections" (local focus, no API call)
//  #4  Truly robust reset (clears classes + inline styles, re-fits)
//  #5  cy.resize() before every fit/zoom animate
//  #6  Legend, node click, chat highlight all cooperate with reset

// ─── State ────────────────────────────────────────────────────────────────────
let cy                = null;
let selectedNodeId    = null;
let overlayVisible    = true;
let activeLegendFilter = null;
let focusModeActive   = false;   // true while Focus Connections is in effect

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
    style: buildCyStyle(),
    layout: { name: 'preset' },
    minZoom: 0.03,
    maxZoom: 6,
  });

  cy.on('tap', 'node', onNodeClick);
  cy.on('tap', function(evt) {
    if (evt.target === cy) { resetAllHighlights(); closeNodeDetail(); }
  });

  // Hover tooltip
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

  cy.on('zoom', function() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(cy.zoom() * 100) + '%';
  });

  return cy;
}

// ─── Cytoscape Style Definition ──────────────────────────────────────────────
function buildCyStyle() {
  return [
    // ─ Base node
    {
      selector: 'node',
      style: {
        'background-color':    'data(color)',
        'label':               'data(displayName)',
        'color':               'rgba(255,255,255,0.60)',
        'font-size':           '8px',
        'font-family':         'Inter, system-ui, sans-serif',
        'text-valign':         'bottom',
        'text-halign':         'center',
        'text-margin-y':       '4px',
        'text-outline-color':  '#13151f',
        'text-outline-width':   1.5,
        'text-max-width':      '60px',
        'text-wrap':           'ellipsis',
        'width':                22,
        'height':               22,
        'border-width':         0,
        'z-index':              1,
      }
    },
    // ─ Plant: visually demoted — smaller, more transparent
    {
      selector: 'node[label="Plant"]',
      style: {
        'width':     13,
        'height':    13,
        'opacity':   0.45,
        'font-size': '7px',
        'color':     'rgba(255,255,255,0.28)',
      }
    },
    // ─ Customer: larger, prominent
    {
      selector: 'node[label="Customer"]',
      style: {
        'width':       30,
        'height':      30,
        'font-size':   '9px',
        'font-weight': '600',
        'color':       '#e8eaf0',
      }
    },
    // ─ BillingDocument — medium prominent
    {
      selector: 'node[label="BillingDocument"]',
      style: {
        'width':   26,
        'height':  26,
      }
    },
    // ─ Edges — very quiet, no label
    {
      selector: 'edge',
      style: {
        'width':              0.6,
        'line-color':         'rgba(255,255,255,0.06)',
        'target-arrow-color': 'rgba(255,255,255,0.08)',
        'target-arrow-shape': 'triangle',
        'arrow-scale':        0.5,
        'curve-style':        'bezier',
        'label':              '',
        'opacity':            0.5,
      }
    },
    // ─ Highlighted (chat / legend focus selected nodes)
    {
      selector: 'node.highlighted',
      style: {
        'border-width':        2.5,
        'border-color':        '#FFD700',
        'border-opacity':      1,
        'width':               30,
        'height':              30,
        'opacity':             1,
        'z-index':             999,
        'transition-property': 'border-width, width, height, opacity',
        'transition-duration': '0.25s',
      }
    },
    // ─ Dimmed (not in focus)
    {
      selector: 'node.dimmed',
      style: {
        'opacity':             0.06,
        'transition-property': 'opacity',
        'transition-duration': '0.25s',
      }
    },
    {
      selector: 'edge.dimmed',
      style: {
        'opacity':             0.03,
        'transition-property': 'opacity',
        'transition-duration': '0.25s',
      }
    },
    // ─ Focused node (selected via click)
    {
      selector: 'node.focused',
      style: {
        'border-width':   3,
        'border-color':   '#ffffff',
        'border-opacity':  1,
        'width':           36,
        'height':          36,
        'z-index':         1000,
      }
    },
    // ─ Neighbors in focus mode
    {
      selector: 'node.neighbor-focus',
      style: {
        'border-width':        2,
        'border-color':        'data(color)',
        'border-opacity':      0.9,
        'opacity':             1,
        'z-index':             50,
        'transition-property': 'border-width, opacity',
        'transition-duration': '0.2s',
      }
    },
    // ─ Faded (secondary dim on node click)
    {
      selector: 'node.faded',
      style: {
        'opacity':             0.15,
        'transition-property': 'opacity',
        'transition-duration': '0.25s',
      }
    },
    // ─ Legend filter — matching
    {
      selector: 'node.legend-match',
      style: {
        'opacity':             1,
        'border-width':        2,
        'border-color':        'data(color)',
        'border-opacity':      0.8,
        'z-index':             10,
        'transition-property': 'opacity, border-width',
        'transition-duration': '0.2s',
      }
    },
    {
      selector: 'node.legend-dim',
      style: {
        'opacity':             0.05,
        'transition-property': 'opacity',
        'transition-duration': '0.2s',
      }
    },
    // ─ New added node (for animate-in)
    { selector: 'node.new-node', style: { 'opacity': 0 } },
  ];
}

// ─── Load Graph ───────────────────────────────────────────────────────────────
async function loadGraph() {
  showGraphLoading('Loading graph...');
  try {
    const data     = await fetchGraph();
    const elements = buildElements(data);
    cy.add(elements);

    // ── COSE layout: spread out, low gravity so sparse nodes aren't crushed ──
    const layout = cy.layout({
      name:              'cose',
      animate:           true,
      animationDuration: 700,

      // Per-node repulsion function:
      // • Plant nodes: lower repulsion → huddle near connected nodes
      // • All others: very high → spread the graph wide
      nodeRepulsion: function(node) {
        return node.data('label') === 'Plant' ? 200000 : 1200000;
      },

      // Per-edge ideal length: longer = more space
      idealEdgeLength: function(edge) {
        // Edges to Plant nodes can be shorter (less aggressive push)
        const src = edge.source().data('label');
        const tgt = edge.target().data('label');
        if (src === 'Plant' || tgt === 'Plant') return 80;
        return 160;
      },

      edgeElasticity:   function(edge) { return 0.30; },

      // Lower gravity = nodes spread further; gravityRange > 1 = centrally pulled
      gravity:          60,
      gravityRange:     1.8,

      numIter:          1500,
      initialTemp:      250,
      coolingFactor:    0.97,
      minTemp:          1.0,
      componentSpacing: 100,   // extra space between disconnected components
      fit:              true,
      padding:          60,
      randomize:        false,
    });

    layout.on('layoutstop', function() {
      document.getElementById('cy').style.opacity = '1';

      // Soft-dim Plant nodes with degree ≤ 1 further (isolated-looking plants)
      cy.nodes('[label="Plant"]').forEach(n => {
        if (n.degree() <= 1) n.style('opacity', 0.25);
      });

      cy.resize();
      cy.fit(null, 60);

      const zoomEl = document.getElementById('zoom-level');
      if (zoomEl) zoomEl.textContent = Math.round(cy.zoom() * 100) + '%';
    });

    layout.run();

    const statsEl = document.getElementById('header-stats');
    if (statsEl) statsEl.textContent = `${cy.nodes().length} nodes · ${cy.edges().length} edges`;

    updateCounts();
    hideGraphLoading();
    updateStatus(true);

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

// ─── Node Click → Detail Panel + light dim ───────────────────────────────────
function onNodeClick(evt) {
  const node = evt.target;
  selectedNodeId = node.id();
  focusModeActive = false;

  // Clear all existing classes
  cy.elements().removeClass('focused highlighted dimmed faded neighbor-focus legend-match legend-dim');

  // Focus selected; lightly fade non-neighbors
  node.addClass('focused');
  const neighbors = node.neighborhood();
  cy.elements().not(node).not(neighbors).addClass('faded');

  renderDetailPanel(node);
}

// ─── Node Detail Panel ────────────────────────────────────────────────────────
function renderDetailPanel(node) {
  const props = node.data('properties') || {};
  const label = node.data('label') || 'Node';
  const color = getNodeColor(label);

  document.getElementById('detail-icon').textContent = getNodeIcon(label);
  const labelEl = document.getElementById('detail-label-text');
  labelEl.textContent = label;
  labelEl.style.color = color;

  const priority = PRIORITY_PROPS[label] || [];
  const allKeys  = Object.keys(props).filter(k => props[k] !== null && props[k] !== undefined && props[k] !== '');
  const ordered  = [...priority.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !priority.includes(k))];
  const shown    = ordered.slice(0, MAX_PROPS);
  const extra    = ordered.length - shown.length;

  const DATE_AUTO   = ['creationDate','postingDate','clearingDate','actualGoodsMovementDate','billingDocumentDate'];
  const AMOUNT_AUTO = ['totalAmount','amount'];

  let html = '';
  shown.forEach(key => {
    const keyLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    let val = props[key];
    if (DATE_AUTO.includes(key))   val = formatDate(String(val));
    else if (AMOUNT_AUTO.includes(key)) val = formatCurrency(val);
    else val = truncateText(String(val), 28);
    html += `<div class="detail-prop-row">
      <span class="detail-prop-key">${keyLabel}</span>
      <span class="detail-prop-value">${val}</span>
    </div>`;
  });
  if (extra > 0) {
    html += `<div class="detail-hidden-hint">+${extra} more field${extra > 1 ? 's' : ''} hidden</div>`;
  }

  document.getElementById('detail-properties-list').innerHTML = html;
  document.getElementById('detail-connections').textContent = `Connections: ${node.connectedEdges().length}`;
  document.getElementById('node-detail-panel').classList.remove('hidden');

  // Update button text to reflect new behavior
  const focusBtn = document.getElementById('btn-expand-node');
  if (focusBtn) focusBtn.textContent = 'Focus Connections';
}

function closeNodeDetail() {
  document.getElementById('node-detail-panel').classList.add('hidden');
  selectedNodeId = null;
  focusModeActive = false;
}

// ─── Focus Connections (was "Expand Neighbors") ───────────────────────────────
// Keeps full graph visible, deeply dims non-neighbors, zooms to local subgraph.
// Clicking again → "Unfocus" → restores full graph.
function focusConnections() {
  if (!selectedNodeId || !cy) return;

  const focusBtn = document.getElementById('btn-expand-node');
  const node     = cy.getElementById(selectedNodeId);
  if (!node || node.length === 0) return;

  if (focusModeActive) {
    // Second click: restore full graph view
    focusModeActive = false;
    cy.elements().removeClass('focused highlighted dimmed faded neighbor-focus legend-match legend-dim');
    cy.elements().style({ opacity: 1 });
    applyPlantSoftDim();
    // Re-add mild focus styling
    node.addClass('focused');
    const neighbors = node.neighborhood();
    cy.elements().not(node).not(neighbors).addClass('faded');

    cy.resize();
    cy.animate({ fit: { padding: 60 }, duration: 400 });
    if (focusBtn) focusBtn.textContent = 'Focus Connections';
    return;
  }

  // First click: activate focus mode
  focusModeActive = true;

  const neighbors   = node.neighborhood();
  const neighborNodes = neighbors.nodes();
  const neighborEdges = neighbors.edges();

  // Clear existing classes
  cy.elements().removeClass('focused highlighted dimmed faded neighbor-focus legend-match legend-dim');

  // Dim everything that isn't the node or its direct neighbors
  cy.nodes().not(node).not(neighborNodes).addClass('dimmed');
  cy.edges().not(neighborEdges).addClass('dimmed');

  // Emphasize selected + neighbors
  node.addClass('focused');
  neighborNodes.addClass('neighbor-focus');
  neighborEdges.removeClass('dimmed');

  // Build collection to zoom to
  const toFit = cy.collection().union(node).union(neighborNodes);

  cy.resize();
  cy.animate({ fit: { eles: toFit, padding: 70 }, duration: 500, easing: 'ease-in-out-cubic' });

  if (focusBtn) focusBtn.textContent = 'Unfocus ↩';
}

// ─── Goal 4: Robust Reset ─────────────────────────────────────────────────────
// Removes ALL custom classes + inline styles, re-fits full graph.
function resetAllHighlights() {
  if (!cy) return;
  focusModeActive    = false;
  activeLegendFilter = null;

  // Remove all class states
  cy.elements().removeClass('highlighted dimmed focused faded neighbor-focus legend-match legend-dim new-node');

  // Clear inline style overrides (opacity etc.)
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');

  // Reset legend UI
  document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active-filter'));
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.remove('visible');

  // Re-apply Plant soft-dim (this is the designed default, not a class state)
  applyPlantSoftDim();

  // Re-fit full graph
  cy.resize();
  cy.animate({ fit: { padding: 60 }, duration: 380 });

  const zoomEl = document.getElementById('zoom-level');
  if (zoomEl) zoomEl.textContent = Math.round(cy.zoom() * 100) + '%';
}

// ─── Goal 2 & 3: Legend Toggle + Type Filter ─────────────────────────────────
function initLegend() {
  const header   = document.getElementById('legend-header');
  const body     = document.getElementById('legend-body');
  const resetBtn = document.getElementById('legend-reset-filter');

  if (header && body) {
    header.addEventListener('click', () => {
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open', !isOpen);
      header.classList.toggle('open', !isOpen);
    });
  }

  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const nodeType = item.dataset.type;
      if (activeLegendFilter === nodeType) {
        clearLegendFilter();
      } else {
        applyLegendFilter(nodeType);
      }
    });
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearLegendFilter();
    });
  }
}

function applyLegendFilter(nodeType) {
  if (!cy) return;
  activeLegendFilter = nodeType;
  focusModeActive    = false;

  cy.elements().removeClass('highlighted dimmed focused faded neighbor-focus legend-match legend-dim');
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');

  const matching = cy.nodes().filter(n => n.data('label') === nodeType);
  const nonMatch = cy.nodes().filter(n => n.data('label') !== nodeType);

  nonMatch.addClass('legend-dim');
  cy.edges().addClass('dimmed');
  matching.addClass('legend-match');
  matching.connectedEdges().removeClass('dimmed');

  document.querySelectorAll('.legend-item').forEach(el => {
    el.classList.toggle('active-filter', el.dataset.type === nodeType);
  });
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.add('visible');

  if (matching.length > 0) {
    cy.resize();
    cy.animate({ fit: { eles: matching, padding: 70 }, duration: 480, easing: 'ease-in-out-cubic' });
  }
}

function clearLegendFilter() {
  activeLegendFilter = null;

  cy.elements().removeClass('legend-match legend-dim dimmed highlighted focused faded neighbor-focus');
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');

  document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active-filter'));
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.remove('visible');

  applyPlantSoftDim();

  cy.resize();
  cy.animate({ fit: { padding: 60 }, duration: 380 });
}

// ─── Chat Highlight — smooth focus zoom ──────────────────────────────────────
function highlightNodesFromChat(rawResults) {
  if (!cy || !rawResults || rawResults.length === 0) return;

  const allValues = [];
  rawResults.forEach(result => {
    if (typeof result === 'object' && result !== null) {
      Object.values(result).forEach(val => {
        if (val !== null && val !== undefined) allValues.push(String(val));
      });
    }
  });

  const matchedNodes = cy.nodes().filter(node => {
    const nodeId = node.data('id');
    const props  = node.data('properties') || {};
    return allValues.some(val =>
      nodeId === val ||
      nodeId.includes(val) ||
      Object.values(props).some(p => String(p) === val)
    );
  });

  // No matches → leave graph stable
  if (matchedNodes.length === 0) return;

  // Reset cleanly first
  cy.elements().removeClass('highlighted dimmed focused faded neighbor-focus legend-match legend-dim');
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');
  applyPlantSoftDim();

  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  matchedNodes.forEach(node => {
    node.removeClass('dimmed').addClass('highlighted');
    node.connectedEdges().removeClass('dimmed');
  });

  cy.resize();
  cy.animate({ fit: { eles: matchedNodes, padding: 80 }, duration: 600, easing: 'ease-in-out-cubic' });
}

// ─── Path Highlight (trace queries) ──────────────────────────────────────────
function highlightPath(rawResults) {
  if (!cy) return;

  const allValues = [];
  rawResults.forEach(result => {
    if (typeof result === 'object' && result !== null) {
      Object.values(result).forEach(val => {
        if (val !== null && val !== undefined) allValues.push(String(val));
      });
    }
  });

  const matchedNodes = cy.nodes().filter(node => {
    const nodeId = node.data('id');
    const props  = node.data('properties') || {};
    return allValues.some(val =>
      nodeId === val || nodeId.includes(val) ||
      Object.values(props).some(p => String(p) === val)
    );
  });

  if (matchedNodes.length < 2) { highlightNodesFromChat(rawResults); return; }

  let pathCollection = cy.collection();
  for (let i = 0; i < matchedNodes.length - 1; i++) {
    try {
      const dj   = cy.elements().dijkstra({ root: matchedNodes[i], directed: true });
      const path = dj.pathTo(matchedNodes[i + 1]);
      if (path && path.length > 0) pathCollection = pathCollection.union(path);
    } catch (e) { /* no path between pair */ }
  }

  cy.elements().removeClass('highlighted dimmed focused faded neighbor-focus legend-match legend-dim');
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');
  applyPlantSoftDim();

  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  const toHighlight = pathCollection.length > 0 ? pathCollection : matchedNodes;
  toHighlight.removeClass('dimmed');
  toHighlight.nodes().addClass('highlighted');

  cy.resize();
  cy.animate({ fit: { eles: toHighlight, padding: 60 }, duration: 600, easing: 'ease-in-out-cubic' });
}

// ─── Graph Controls ────────────────────────────────────────────────────────────
function initGraphControls() {
  // Fit — resize first to avoid stale container dimensions
  document.getElementById('btn-fit').addEventListener('click', () => {
    cy.resize();
    cy.animate({ fit: { padding: 60 }, duration: 380 });
  });

  // Reset — full state clear + reload
  document.getElementById('btn-reset').addEventListener('click', async () => {
    closeNodeDetail();
    cy.elements().remove();
    document.getElementById('cy').style.opacity = '0';
    await loadGraph();
  });

  // Zoom in/out — centered on current viewport center
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    cy.resize();
    cy.animate({ zoom: cy.zoom() * 1.3 }, { duration: 200 });
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    cy.resize();
    cy.animate({ zoom: cy.zoom() * 0.75 }, { duration: 200 });
  });

  // Pan arrows
  document.getElementById('btn-nav-prev').addEventListener('click', () => { cy.panBy({ x: 140, y: 0 }); });
  document.getElementById('btn-nav-next').addEventListener('click', () => { cy.panBy({ x: -140, y: 0 }); });

  // Export PNG
  document.getElementById('btn-download').addEventListener('click', function() {
    const png  = cy.png({ scale: 2 });
    const link = document.createElement('a');
    link.href = png; link.download = 'graphiq-export.png'; link.click();
  });

  // Fullscreen
  document.getElementById('btn-fullscreen').addEventListener('click', function() {
    const gp = document.getElementById('graph-panel');
    if (!document.fullscreenElement) {
      gp.requestFullscreen && gp.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    setTimeout(() => { cy.resize(); cy.fit(null, 60); }, 150);
  });

  // Node detail close
  document.getElementById('node-detail-close').addEventListener('click', () => {
    resetAllHighlights();
    closeNodeDetail();
  });

  // Focus Connections button (was "Expand Neighbors")
  document.getElementById('btn-expand-node').addEventListener('click', focusConnections);

  // Minimize / Expand
  document.getElementById('btn-minimize').addEventListener('click', function() {
    const gp    = document.getElementById('graph-panel');
    const cp    = document.getElementById('chat-panel');
    const span  = this.querySelector('span');
    const isMin = gp.classList.contains('minimized');
    if (isMin) {
      gp.classList.remove('minimized');
      cp.classList.remove('expanded');
      if (span) span.textContent = 'Minimize';
      // Wait for CSS transition then resize + fit
      setTimeout(() => { cy.resize(); cy.animate({ fit: { padding: 60 } }, { duration: 350 }); }, 340);
    } else {
      gp.classList.add('minimized');
      cp.classList.add('expanded');
      if (span) span.textContent = 'Expand';
    }
  });

  // Overlay toggle
  document.getElementById('btn-overlay').addEventListener('click', function() {
    overlayVisible = !overlayVisible;
    const span = this.querySelector('span');
    cy.edges().style({ 'opacity': overlayVisible ? 0.5 : 0.02, 'label': '' });
    if (span) span.textContent = overlayVisible ? 'Hide Overlay' : 'Show Overlay';
  });
}

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** Re-apply the designed plant soft opacity (not a class — intentional default). */
function applyPlantSoftDim() {
  if (!cy) return;
  cy.nodes('[label="Plant"]').forEach(n => {
    // Isolated plants (degree ≤ 1) are barely visible by design
    n.style('opacity', n.degree() <= 1 ? 0.25 : 0.45);
  });
}

function updateCounts() {
  const nb = document.getElementById('nodes-count-badge');
  const eb = document.getElementById('edges-count-badge');
  if (nb) nb.textContent = `${cy.nodes().length} nodes`;
  if (eb) eb.textContent = `${cy.edges().length} edges`;
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
  const el = document.getElementById('graph-loading');
  const sp = el.querySelector('.graph-spinner');
  if (sp) sp.style.display = 'none';
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
  initLegend();
  await loadGraph();
});
