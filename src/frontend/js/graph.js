// GraphIQ - graph.js
// Phase 5: Polish & Interaction Fixes
// - Collapsible legend (Goal 2)
// - Legend click-to-filter by node type (Goal 3)
// - Better COSE layout for Plant nodes (Goal 1)
// - Robust reset (Goal 4)
// - Clean edge visuals (Goal 5)
// - Polished node detail (Goal 6)
// - Chat highlight with zoom (Goal 7)

// ─── State ────────────────────────────────────────────────────────────────────
let cy             = null;
let selectedNodeId = null;
let overlayVisible = true;
let activeLegendFilter = null;   // Goal 3: currently active node-type filter

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
      // Base node: smaller, no border, quiet labels
      {
        selector: 'node',
        style: {
          'background-color':   'data(color)',
          'label':              'data(displayName)',
          'color':              'rgba(255,255,255,0.65)',
          'font-size':          '8px',
          'font-family':        'Inter, system-ui, sans-serif',
          'text-valign':        'bottom',
          'text-halign':        'center',
          'text-margin-y':      '3px',
          'text-outline-color': '#13151f',
          'text-outline-width':  1.5,
          'text-max-width':     '55px',
          'text-wrap':          'ellipsis',
          'width':               20,
          'height':              20,
          'border-width':        0,
          'z-index':             1,
        }
      },
      // Goal 1: Plant nodes — softer, smaller, less visually dominant
      {
        selector: 'node[label="Plant"]',
        style: {
          'width':    14,
          'height':   14,
          'opacity':  0.55,
          'font-size':'7px',
          'color':    'rgba(255,255,255,0.35)',
        }
      },
      // Customer nodes — larger, brighter
      {
        selector: 'node[label="Customer"]',
        style: {
          'width':       32,
          'height':      32,
          'font-size':   '10px',
          'font-weight': '600',
          'color':       '#ffffff',
        }
      },
      // Edges — very quiet by default (Goal 5)
      {
        selector: 'edge',
        style: {
          'width':              0.7,
          'line-color':         'rgba(255,255,255,0.07)',
          'target-arrow-color': 'rgba(255,255,255,0.10)',
          'target-arrow-shape': 'triangle',
          'arrow-scale':        0.55,
          'curve-style':        'bezier',
          'label':              '',          // hide labels always
          'opacity':            0.55,
        }
      },
      // ── Highlighted (chat / legend focus) ─────────────────────────────────
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
      // Dimmed — heavily faded for non-matching nodes
      {
        selector: 'node.dimmed',
        style: {
          'opacity':               0.07,
          'transition-property':   'opacity',
          'transition-duration':   '0.25s',
        }
      },
      {
        selector: 'edge.dimmed',
        style: {
          'opacity':               0.03,
          'transition-property':   'opacity',
          'transition-duration':   '0.25s',
        }
      },
      // Focused (node click) — white border, biggest size
      {
        selector: 'node.focused',
        style: {
          'border-width':  3,
          'border-color':  '#ffffff',
          'border-opacity': 1,
          'width':         38,
          'height':        38,
          'z-index':       1000,
        }
      },
      {
        selector: 'node.faded',
        style: {
          'opacity':             0.18,
          'transition-property': 'opacity',
          'transition-duration': '0.25s',
        }
      },
      // Legend filter — matching type emphasized
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
          'opacity':               0.06,
          'transition-property':   'opacity',
          'transition-duration':   '0.2s',
        }
      },
      { selector: 'node.new-node', style: { 'opacity': 0 } },
    ],
    layout: { name: 'preset' },
    minZoom: 0.04,
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

  // Zoom level display
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
    const elements = buildElements(data);
    cy.add(elements);

    // Goal 1: tuned COSE layout — reduces extreme side placement for low-degree nodes
    cy.layout({
      name:              'cose',
      animate:           true,
      animationDuration: 600,
      // Higher repulsion keeps nodes from bunching
      nodeRepulsion:     (node) => {
        // Plant nodes get lower repulsion → stay closer to neighbors, not pushed to edges
        return node.data('label') === 'Plant' ? 150000 : 450000;
      },
      idealEdgeLength:   (edge) => 90,
      edgeElasticity:    (edge) => 0.35,
      gravity:            100,
      gravityRange:       1.4,    // pulls low-degree nodes toward center of mass
      numIter:            1200,
      initialTemp:        220,
      coolingFactor:      0.97,
      minTemp:            1.0,
      componentSpacing:   60,
      fit:                true,
      padding:            55,
      randomize:          false,
    }).run();

    cy.ready(function() {
      setTimeout(() => {
        document.getElementById('cy').style.opacity = '1';
        // Soft-dim Plant nodes with degree ≤ 1 even further (Goal 1)
        cy.nodes('[label="Plant"]').forEach(n => {
          if (n.degree() <= 1) n.style('opacity', 0.3);
        });
      }, 150);
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

// ─── Node Click → Detail Panel ────────────────────────────────────────────────
function onNodeClick(evt) {
  const node = evt.target;
  selectedNodeId = node.id();

  // Clear legend filter visual if active — click takes precedence
  cy.elements().removeClass('legend-match legend-dim');

  // Focus mode
  cy.elements().removeClass('focused highlighted dimmed faded');
  node.addClass('focused');
  const neighbors = node.neighborhood();
  neighbors.nodes().addClass('highlighted');
  cy.elements().not(node).not(neighbors).addClass('faded');

  renderDetailPanel(node);
}

function renderDetailPanel(node) {
  const props = node.data('properties') || {};
  const label = node.data('label') || 'Node';
  const color = getNodeColor(label);

  document.getElementById('detail-icon').textContent = getNodeIcon(label);
  const labelEl = document.getElementById('detail-label-text');
  labelEl.textContent = label;
  labelEl.style.color = color;

  // Priority-ordered properties, max 6
  const priority = PRIORITY_PROPS[label] || [];
  const allKeys  = Object.keys(props).filter(k => props[k] !== null && props[k] !== undefined && props[k] !== '');
  const ordered  = [...priority.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !priority.includes(k))];
  const shown    = ordered.slice(0, MAX_PROPS);
  const extra    = ordered.length - shown.length;

  let html = '';
  shown.forEach(key => {
    const keyLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    let val = props[key];
    // Auto-format dates and amounts
    if (['creationDate','postingDate','clearingDate','actualGoodsMovementDate','billingDocumentDate'].includes(key)) {
      val = formatDate(String(val));
    } else if (['totalAmount','amount'].includes(key)) {
      val = formatCurrency(val);
    } else {
      val = truncateText(String(val), 28);
    }
    html += `<div class="detail-prop-row">
      <span class="detail-prop-key">${keyLabel}</span>
      <span class="detail-prop-value">${val}</span>
    </div>`;
  });
  if (extra > 0) {
    html += `<div class="detail-hidden-hint">Additional fields hidden for readability</div>`;
  }

  document.getElementById('detail-properties-list').innerHTML = html;
  document.getElementById('detail-connections').textContent = `Connections: ${node.connectedEdges().length}`;
  document.getElementById('node-detail-panel').classList.remove('hidden');
}

function closeNodeDetail() {
  document.getElementById('node-detail-panel').classList.add('hidden');
  selectedNodeId = null;
}

// ─── Goal 2 & 3: Legend Toggle + Filter ──────────────────────────────────────
function initLegend() {
  const header     = document.getElementById('legend-header');
  const body       = document.getElementById('legend-body');
  const chevron    = document.getElementById('legend-chevron');
  const resetBtn   = document.getElementById('legend-reset-filter');

  // Toggle open/close
  header.addEventListener('click', () => {
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    header.classList.toggle('open', !isOpen);
  });

  // Filter by node type on item click
  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation(); // don't close legend
      const nodeType = item.dataset.type;
      if (activeLegendFilter === nodeType) {
        // Clicking same type again → clear filter
        clearLegendFilter();
      } else {
        applyLegendFilter(nodeType);
      }
    });
  });

  // Reset shortcut
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

  // Clear any chat/click highlights first
  cy.elements().removeClass('highlighted dimmed focused faded legend-match legend-dim');

  const matching  = cy.nodes().filter(n => n.data('label') === nodeType);
  const nonMatch  = cy.nodes().filter(n => n.data('label') !== nodeType);

  // Dim non-matching
  nonMatch.addClass('legend-dim');
  cy.edges().addClass('dimmed');

  // Highlight matching + their edges
  matching.addClass('legend-match');
  matching.connectedEdges().removeClass('dimmed');

  // Update legend UI
  document.querySelectorAll('.legend-item').forEach(el => {
    el.classList.toggle('active-filter', el.dataset.type === nodeType);
  });
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.add('visible');

  // Zoom to matching set if any found
  if (matching.length > 0) {
    cy.animate({ fit: { eles: matching, padding: 70 }, duration: 500, easing: 'ease-in-out-cubic' });
  }
}

function clearLegendFilter() {
  activeLegendFilter = null;
  cy.elements().removeClass('legend-match legend-dim dimmed');
  cy.elements().style({ opacity: 1 });
  document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active-filter'));
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.remove('visible');
  // Restore plant soft-dim
  cy.nodes('[label="Plant"]').forEach(n => {
    if (n.degree() <= 1) n.style('opacity', 0.3);
  });
}

// ─── Goal 4: Robust reset ─────────────────────────────────────────────────────
function resetAllHighlights() {
  if (!cy) return;
  cy.elements().removeClass('highlighted dimmed focused faded legend-match legend-dim new-node');
  cy.elements().style({ opacity: 1 });
  // Re-apply plant soft-dim
  cy.nodes('[label="Plant"]').forEach(n => {
    if (n.degree() <= 1) n.style('opacity', 0.3);
  });
  // Also clear any active legend filter indicator (but keep legend open)
  if (activeLegendFilter) clearLegendFilter();
}

// ─── Highlight from Chat (Goal 7: + smooth zoom) ─────────────────────────────
function highlightNodesFromChat(rawResults) {
  if (!cy || !rawResults || rawResults.length === 0) return;
  resetAllHighlights();

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

  if (matchedNodes.length === 0) return; // leave graph as-is

  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  matchedNodes.forEach(node => {
    node.removeClass('dimmed').addClass('highlighted');
    node.connectedEdges().removeClass('dimmed');
  });

  // Goal 7: smooth zoom to results
  cy.animate({ fit: { eles: matchedNodes, padding: 80 }, duration: 600, easing: 'ease-in-out-cubic' });
}

// ─── Path Highlight ───────────────────────────────────────────────────────────
function highlightPath(rawResults) {
  if (!cy) return;
  resetAllHighlights();

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
    } catch (e) { /* no path */ }
  }

  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  const toHighlight = pathCollection.length > 0 ? pathCollection : matchedNodes;
  toHighlight.removeClass('dimmed');
  toHighlight.nodes().addClass('highlighted');
  cy.animate({ fit: { eles: toHighlight, padding: 60 }, duration: 600, easing: 'ease-in-out-cubic' });
}

// ─── Expand Node (preset layout near parent) ──────────────────────────────────
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
            x: parentPos.x + (Math.random() * 130 - 65),
            y: parentPos.y + (Math.random() * 130 - 65),
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

// ─── Graph Controls ────────────────────────────────────────────────────────────
function initGraphControls() {
  // Fit — reliable with padding + cy.resize() first (Goal 4)
  document.getElementById('btn-fit').addEventListener('click', () => {
    cy.resize();
    cy.animate({ fit: { padding: 55 }, duration: 400 });
  });

  // Full reset — clears all state (Goal 4)
  document.getElementById('btn-reset').addEventListener('click', async () => {
    resetAllHighlights();
    clearLegendFilter();
    closeNodeDetail();
    cy.elements().remove();
    document.getElementById('cy').style.opacity = '0';
    await loadGraph();
  });

  // Zoom (Goal 4)
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 1.3, center: { eles: cy.elements() } }, { duration: 220 });
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 0.75, center: { eles: cy.elements() } }, { duration: 220 });
  });

  // Pan
  document.getElementById('btn-nav-prev').addEventListener('click', () => { cy.panBy({ x: 130, y: 0 }); });
  document.getElementById('btn-nav-next').addEventListener('click', () => { cy.panBy({ x: -130, y: 0 }); });

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

  // Node detail close
  document.getElementById('node-detail-close').addEventListener('click', () => {
    resetAllHighlights(); closeNodeDetail();
  });
  document.getElementById('btn-expand-node').addEventListener('click', expandSelectedNode);

  // Minimize / Expand (Goal 4: calls cy.resize() after transition)
  document.getElementById('btn-minimize').addEventListener('click', function() {
    const gp   = document.getElementById('graph-panel');
    const cp   = document.getElementById('chat-panel');
    const span = this.querySelector('span');
    const isMin = gp.classList.contains('minimized');
    if (isMin) {
      gp.classList.remove('minimized');
      cp.classList.remove('expanded');
      if (span) span.textContent = 'Minimize';
      setTimeout(() => { cy.resize(); cy.fit(); }, 340);
    } else {
      gp.classList.add('minimized');
      cp.classList.add('expanded');
      if (span) span.textContent = 'Expand';
    }
  });

  // Overlay toggle (Goal 5)
  document.getElementById('btn-overlay').addEventListener('click', function() {
    overlayVisible = !overlayVisible;
    const span = this.querySelector('span');
    cy.edges().style({ 'opacity': overlayVisible ? 0.55 : 0.03, 'label': '' });
    if (span) span.textContent = overlayVisible ? 'Hide Overlay' : 'Show Overlay';
  });
}

// ─── Utility: counts, loading, status ────────────────────────────────────────
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
  initLegend();   // Goal 2 & 3
  await loadGraph();
});
