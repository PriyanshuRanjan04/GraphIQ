// GraphIQ - graph.js
// Cytoscape visualization — premium redesign (Changes 9, 10, 12)
// + all previous improvements (2, 3, 6, 7)

// ─── State ────────────────────────────────────────────────────────────────────
let cy = null;
let selectedNodeId = null;
let currentGraphData = { nodes: [], edges: [] };

const TRACE_KEYWORDS_GRAPH = ['trace','flow','path','journey','follow','track','route','chain'];

// ─── Initialize Cytoscape (Change 9: updated node/edge styles) ────────────────
function initCytoscape() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    style: [
      // Change 9: smaller, cleaner nodes — no border by default
      {
        selector: 'node',
        style: {
          'background-color':  'data(color)',
          'label':             'data(displayName)',
          'color':             'rgba(255,255,255,0.70)',
          'font-size':         '9px',
          'font-family':       'Inter, system-ui, sans-serif',
          'text-valign':       'bottom',
          'text-halign':       'center',
          'text-margin-y':     '3px',
          'text-outline-color':'#13151f',
          'text-outline-width': 1.5,
          'text-max-width':    '60px',
          'text-wrap':         'ellipsis',
          'width':             22,
          'height':            22,
          'border-width':      0,
        }
      },
      // Change 9: Customer nodes slightly bigger + brighter label
      {
        selector: 'node[label="Customer"]',
        style: {
          'width':       34,
          'height':      34,
          'font-size':   '10px',
          'font-weight': '600',
          'color':       '#ffffff',
        }
      },
      // Change 9: much quieter edges — no labels
      {
        selector: 'edge',
        style: {
          'width':               0.8,
          'line-color':          'rgba(255,255,255,0.08)',
          'target-arrow-color':  'rgba(255,255,255,0.12)',
          'target-arrow-shape':  'triangle',
          'arrow-scale':         0.6,
          'curve-style':         'bezier',
          'label':               '',
          'opacity':             0.6,
        }
      },
      // Change 9 + Imp 6: highlighted — stronger gold border + smooth transition
      {
        selector: 'node.highlighted',
        style: {
          'border-width':  2.5,
          'border-color':  '#FFD700',
          'border-opacity': 1,
          'width':         32,
          'height':        32,
          'opacity':       1,
          'z-index':       999,
          'transition-property':  'border-width, width, height, opacity',
          'transition-duration':  '0.3s',
        }
      },
      // Change 9: more aggressive dimming
      {
        selector: 'node.dimmed',
        style: {
          'opacity':               0.08,
          'transition-property':   'opacity',
          'transition-duration':   '0.3s',
        }
      },
      {
        selector: 'edge.dimmed',
        style: {
          'opacity':               0.03,
          'transition-property':   'opacity',
          'transition-duration':   '0.3s',
        }
      },
      // Change 9: focused node — white border, larger
      {
        selector: 'node.focused',
        style: {
          'border-width':  3,
          'border-color':  '#ffffff',
          'border-opacity': 1,
          'width':         40,
          'height':        40,
          'z-index':       1000,
        }
      },
      {
        selector: 'node.faded',
        style: {
          'opacity':             0.2,
          'transition-property': 'opacity',
          'transition-duration': '0.3s',
        }
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
    if (evt.target === cy) {
      resetAllHighlights();
      closeNodeDetail();
    }
  });

  // Change 10: hover tooltip
  cy.on('mouseover', 'node', function(e) {
    const node    = e.target;
    const tooltip = document.getElementById('node-tooltip');
    const label   = node.data('label');
    const name    = node.data('displayName');
    const icon    = getNodeIcon(label);
    tooltip.innerHTML =
      `${icon} <strong style="color:#e8eaf0">${name}</strong><br>` +
      `<span style="color:#6b7280;font-size:10px">${label}</span>`;
    tooltip.style.display = 'block';
  });

  cy.on('mousemove', 'node', function(e) {
    const tooltip = document.getElementById('node-tooltip');
    tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
    tooltip.style.top  = (e.originalEvent.clientY - 32) + 'px';
  });

  cy.on('mouseout', 'node', function() {
    document.getElementById('node-tooltip').style.display = 'none';
  });

  return cy;
}

// ─── Load Full Graph (Change 12: fade-in + header stats) ─────────────────────
async function loadGraph() {
  showGraphLoading('Loading graph...');
  try {
    const data = await fetchGraph();
    currentGraphData = data;

    const elements = buildElements(data);
    cy.add(elements);

    // Improvement 3: precise cose layout settings
    cy.layout({
      name:             'cose',
      animate:          true,
      animationDuration: 500,
      nodeRepulsion:    400000,
      idealEdgeLength:  100,
      gravity:          80,
      numIter:          1000,
      initialTemp:      200,
      coolingFactor:    0.95,
      minTemp:          1.0,
      fit:              true,
      padding:          50,
    }).run();

    // Change 12: fade in canvas after layout
    cy.ready(function() {
      setTimeout(() => {
        document.getElementById('cy').style.opacity = '1';
      }, 120);
    });

    // Change 4: populate header stats
    const nodeCount = cy.nodes().length;
    const edgeCount = cy.edges().length;
    const statsEl   = document.getElementById('header-stats');
    if (statsEl) statsEl.textContent = `${nodeCount} nodes · ${edgeCount} edges`;

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

// ─── Node click → inspector panel (Change 7 structure) ───────────────────────
function onNodeClick(evt) {
  const node = evt.target;
  selectedNodeId = node.id();

  // Focus mode
  cy.elements().removeClass('focused highlighted dimmed faded');
  node.addClass('focused');
  const neighbors = node.neighborhood();
  neighbors.nodes().addClass('highlighted');
  cy.elements().not(node).not(neighbors).addClass('faded');

  // Populate inspector (Change 7 new element IDs)
  const props = node.data('properties') || {};
  const label = node.data('label') || 'Node';
  const icon  = getNodeIcon(label);
  const color = getNodeColor(label);
  const rawId = node.id();
  const shortId = rawId.length > 16 ? '#' + rawId.slice(-10) : '#' + rawId;

  const iconEl  = document.getElementById('node-detail-icon');
  const labelEl = document.getElementById('node-detail-label');
  const idEl    = document.getElementById('node-detail-id');
  if (iconEl)  iconEl.textContent  = icon;
  if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }
  if (idEl)    idEl.textContent    = shortId;

  document.getElementById('node-detail-body').innerHTML = formatProperties(props);

  const panel = document.getElementById('node-detail-panel');
  panel.classList.remove('hidden');
}

function closeNodeDetail() {
  document.getElementById('node-detail-panel').classList.add('hidden');
  selectedNodeId = null;
}

// ─── Expand Node (Improvement 3: preset layout near parent) ──────────────────
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
            id:          n.data.id,
            label:       n.data.label,
            displayName: truncateText(n.data.displayName || n.data.id, 16),
            color:       n.data.color || getNodeColor(n.data.label),
            properties:  n.data.properties || {},
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

      // Update header stats too
      const statsEl = document.getElementById('header-stats');
      if (statsEl) statsEl.textContent = `${cy.nodes().length} nodes · ${cy.edges().length} edges`;
    }
  } catch (err) {
    console.error('[GraphIQ] expandNode error:', err);
  }

  btn.disabled = false;
  btn.textContent = '◈ Expand Neighbors';
}

// ─── Highlight from Chat (Improvement 2: property-value matching) ─────────────
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

  if (matchedNodes.length === 0) return;

  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  matchedNodes.forEach(node => {
    node.removeClass('dimmed').addClass('highlighted');
    node.connectedEdges().removeClass('dimmed');
  });

  cy.animate({ fit: { eles: matchedNodes, padding: 80 }, duration: 600, easing: 'ease-in-out-cubic' });
}

// ─── Path Highlight (Improvement 7) ──────────────────────────────────────────
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
      const dijkstra = cy.elements().dijkstra({ root: matchedNodes[i], directed: true });
      const path     = dijkstra.pathTo(matchedNodes[i + 1]);
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

// ─── Graph Controls ───────────────────────────────────────────────────────────
function initGraphControls() {
  document.getElementById('btn-fit').addEventListener('click', () => {
    cy.animate({ fit: { padding: 50 }, duration: 400 });
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    resetAllHighlights();
    closeNodeDetail();
    cy.elements().remove();
    document.getElementById('cy').style.opacity = '0';
    await loadGraph();
  });

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 1.3, center: { eles: cy.elements() } }, { duration: 220 });
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 0.75, center: { eles: cy.elements() } }, { duration: 220 });
  });

  document.getElementById('node-detail-close').addEventListener('click', () => {
    resetAllHighlights(); closeNodeDetail();
  });

  document.getElementById('btn-expand-node').addEventListener('click', expandSelectedNode);
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
  const el  = document.getElementById('graph-loading');
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
