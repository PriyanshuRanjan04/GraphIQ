// GraphIQ - graph.js
// Cytoscape.js graph visualization, interaction, expand, and path highlighting

// ─── State ────────────────────────────────────────────────────────────────────
let cy = null;
let selectedNodeId = null;
let currentGraphData = { nodes: [], edges: [] };

// ─── Initialize Cytoscape ─────────────────────────────────────────────────────
function initCytoscape() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'label': 'data(displayName)',
          'color': '#ffffff',
          'font-size': '9px',
          'font-family': 'Inter, system-ui, sans-serif',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 4,
          'text-outline-color': '#0f1117',
          'text-outline-width': 2,
          'width': 28,
          'height': 28,
          'border-width': 2,
          'border-color': 'data(color)',
          'border-opacity': 0.5,
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1.2,
          'line-color': '#2d3147',
          'target-arrow-color': '#4A90D9',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-size': '7px',
          'color': '#6b7280',
          'font-family': 'Inter, system-ui, sans-serif',
          'text-rotation': 'autorotate',
          'text-margin-y': -6,
          'text-outline-color': '#0f1117',
          'text-outline-width': 1.5,
        }
      },
      // Improvement 6: smooth transition on highlighted nodes
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 4,
          'border-color': '#FFD700',
          'border-opacity': 1,
          'background-color': 'data(color)',
          'width': 45,
          'height': 45,
          'transition-property': 'border-width, width, height',
          'transition-duration': '0.3s',
        }
      },
      // Improvement 6: smooth dim transition
      {
        selector: 'node.dimmed',
        style: {
          'opacity': 0.15,
          'transition-property': 'opacity',
          'transition-duration': '0.3s',
        }
      },
      {
        selector: 'edge.dimmed',
        style: {
          'opacity': 0.05,
          'transition-property': 'opacity',
          'transition-duration': '0.3s',
        }
      },
      {
        selector: 'node.focused',
        style: {
          'border-width': 4,
          'border-color': '#ffffff',
          'border-opacity': 1,
          'width': 44,
          'height': 44,
          'z-index': 999,
        }
      },
      {
        selector: 'node.faded',
        style: {
          'opacity': 0.25,
          'transition-property': 'opacity',
          'transition-duration': '0.3s',
        }
      },
      {
        selector: 'node.new-node',
        style: { 'opacity': 0 }
      }
    ],
    // Default layout (overridden in loadGraph)
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 5,
  });

  cy.on('tap', 'node', onNodeClick);
  cy.on('tap', function(evt) {
    if (evt.target === cy) {
      resetAllHighlights();
      closeNodeDetail();
    }
  });

  return cy;
}

// ─── Load Full Graph ──────────────────────────────────────────────────────────
async function loadGraph() {
  showGraphLoading('Loading graph data...');
  try {
    const data = await fetchGraph();
    currentGraphData = data;

    const elements = buildElements(data);
    cy.add(elements);

    // Improvement 3: exact cose settings for initial load
    cy.layout({
      name: 'cose',
      animate: true,
      animationDuration: 500,
      nodeRepulsion: 400000,
      idealEdgeLength: 100,
      gravity: 80,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0,
      fit: true,
      padding: 40,
    }).run();

    updateCounts();
    hideGraphLoading();
    updateStatus(true);
  } catch (err) {
    console.error('[GraphIQ] loadGraph error:', err);
    hideGraphLoading();
    showGraphError('Failed to load graph. Is the backend running at port 8000?');
    updateStatus(false);
  }
}

// ─── Build Cytoscape Elements ─────────────────────────────────────────────────
function buildElements(data) {
  const nodes = (data.nodes || []).map(n => ({
    group: 'nodes',
    data: {
      id: n.data.id,
      label: n.data.label,
      displayName: truncateText(n.data.displayName || n.data.id, 18),
      color: n.data.color || getNodeColor(n.data.label),
      properties: n.data.properties || {},
    }
  }));

  const edges = (data.edges || []).map(e => ({
    group: 'edges',
    data: {
      id: e.data.id || `${e.data.source}-${e.data.target}-${e.data.label}`,
      source: e.data.source,
      target: e.data.target,
      label: e.data.label || '',
    }
  }));

  return [...nodes, ...edges];
}

// ─── Node Click → Detail Panel ────────────────────────────────────────────────
function onNodeClick(evt) {
  const node = evt.target;
  selectedNodeId = node.id();

  // Focus mode: highlight clicked + neighbors, fade rest
  cy.elements().removeClass('focused highlighted dimmed faded');
  node.addClass('focused');
  const neighbors = node.neighborhood();
  neighbors.nodes().addClass('highlighted');
  cy.elements().not(node).not(neighbors).addClass('faded');
  neighbors.edges().style({ 'opacity': 1 });

  // Populate detail panel
  const props = node.data('properties') || {};
  const label = node.data('label') || 'Node';
  const icon  = getNodeIcon(label);
  const color = getNodeColor(label);

  document.getElementById('node-detail-title').innerHTML =
    `<span style="color:${color}">${icon} ${label}</span>`;
  document.getElementById('node-detail-body').innerHTML = formatProperties(props);

  const panel = document.getElementById('node-detail-panel');
  panel.classList.remove('hidden');
  panel.classList.add('slide-up');
}

function closeNodeDetail() {
  const panel = document.getElementById('node-detail-panel');
  panel.classList.add('hidden');
  panel.classList.remove('slide-up');
  selectedNodeId = null;
}

// ─── Expand Node (Improvement 3: preset layout, no full re-run) ───────────────
async function expandSelectedNode() {
  if (!selectedNodeId) return;
  const btn = document.getElementById('btn-expand-node');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳ Loading...</span>';

  try {
    const data = await fetchNode(selectedNodeId);
    const existingIds = new Set(cy.elements().map(el => el.id()));
    const newElements = [];

    // Get parent position to place new nodes nearby
    const parentNode = cy.getElementById(selectedNodeId);
    const parentPos  = parentNode.position();

    (data.nodes || []).forEach(n => {
      if (!existingIds.has(n.data.id)) {
        newElements.push({
          group: 'nodes',
          data: {
            id: n.data.id,
            label: n.data.label,
            displayName: truncateText(n.data.displayName || n.data.id, 18),
            color: n.data.color || getNodeColor(n.data.label),
            properties: n.data.properties || {},
          },
          // Preset position near parent
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
        newElements.push({
          group: 'edges',
          data: {
            id: edgeId,
            source: e.data.source,
            target: e.data.target,
            label: e.data.label || '',
          }
        });
      }
    });

    if (newElements.length > 0) {
      const added = cy.add(newElements);
      // Animate new nodes fading in — no full layout re-run
      added.nodes().animate({ style: { opacity: 1 } }, { duration: 400 });
      updateCounts();
    }
  } catch (err) {
    console.error('[GraphIQ] expandNode error:', err);
  }

  btn.disabled = false;
  btn.innerHTML = '<span>🔗 Expand Neighbors</span>';
}

// ─── Highlight Nodes from Chat (Improvement 2: property-value matching) ───────
function highlightNodesFromChat(rawResults) {
  if (!cy || !rawResults || rawResults.length === 0) return;
  resetAllHighlights();

  // Collect all string/number values from every result row
  const allValues = [];
  rawResults.forEach(result => {
    if (typeof result === 'object' && result !== null) {
      Object.values(result).forEach(val => {
        if (val !== null && val !== undefined) {
          allValues.push(String(val));
        }
      });
    }
  });

  // Match against node IDs AND node property values
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

  // Dim all, then highlight matches
  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');

  matchedNodes.forEach(node => {
    node.removeClass('dimmed');
    node.addClass('highlighted');
    node.connectedEdges().removeClass('dimmed');
  });

  // Smooth zoom to matched nodes
  cy.animate({
    fit: { eles: matchedNodes, padding: 80 },
    duration: 600,
    easing: 'ease-in-out-cubic',
  });
}

// ─── Multi-hop Path Highlighting (Improvement 7) ──────────────────────────────
function highlightPath(rawResults) {
  if (!cy) return;
  resetAllHighlights();

  // Collect all values to find matching nodes
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

  if (matchedNodes.length < 2) {
    // Fall back to plain highlight if not enough nodes for a path
    highlightNodesFromChat(rawResults);
    return;
  }

  // Find shortest paths between consecutive matched nodes via Dijkstra
  let pathCollection = cy.collection();
  for (let i = 0; i < matchedNodes.length - 1; i++) {
    try {
      const dijkstra = cy.elements().dijkstra({
        root: matchedNodes[i],
        directed: true,
      });
      const path = dijkstra.pathTo(matchedNodes[i + 1]);
      if (path && path.length > 0) {
        pathCollection = pathCollection.union(path);
      }
    } catch (e) {
      // No path found; skip quietly
    }
  }

  // Dim everything, highlight full path
  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');

  if (pathCollection.length > 0) {
    pathCollection.removeClass('dimmed');
    pathCollection.nodes().addClass('highlighted');
  } else {
    // Fallback if Dijkstra produced nothing
    matchedNodes.forEach(n => { n.removeClass('dimmed'); n.addClass('highlighted'); });
  }

  const highlightedEles = pathCollection.length > 0 ? pathCollection : matchedNodes;
  cy.animate({
    fit: { eles: highlightedEles, padding: 60 },
    duration: 600,
    easing: 'ease-in-out-cubic',
  });
}

function resetAllHighlights() {
  if (!cy) return;
  cy.elements().removeClass('highlighted dimmed focused faded new-node');
  cy.elements().style({ 'opacity': 1 });
}

// ─── Graph Controls ───────────────────────────────────────────────────────────
function initGraphControls() {
  document.getElementById('btn-fit').addEventListener('click', () => {
    cy.animate({ fit: { padding: 40 }, duration: 400 });
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    resetAllHighlights();
    closeNodeDetail();
    cy.elements().remove();
    await loadGraph();
  });

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 1.3, center: { eles: cy.elements() } }, { duration: 250 });
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    cy.animate({ zoom: cy.zoom() * 0.75, center: { eles: cy.elements() } }, { duration: 250 });
  });

  document.getElementById('node-detail-close').addEventListener('click', () => {
    resetAllHighlights();
    closeNodeDetail();
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
  const el = document.getElementById('graph-loading');
  el.style.display = 'flex';
  document.getElementById('graph-loading-text').textContent = msg;
  el.querySelector('.graph-spinner').style.display = 'none';
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
