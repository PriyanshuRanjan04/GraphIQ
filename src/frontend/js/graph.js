// GraphIQ - graph.js  v3.0 — Phase 5 UI Enhancement
// New in v3.0:
//  ① Smart zoom-based label visibility (hide when zoomed out, show when in)
//  ② Stronger hover dim — soft highlight connected edges, dim rest
//  ③ Strong click focus — heavy dim, zoom toward selection
//  ④ Richer tooltip — type + ID + 2 key properties
//  ⑤ Search bar — find node by ID/name, zoom+highlight+detail
//  ⑥ Focus Mode toggle — persistent background dim
//  ⑦ Reduced edge noise — 0.04 default opacity
//  ⑧ Chat → graph zoom-to-match (stronger)

// ─── Constants ────────────────────────────────────────────────────────────────
const LABEL_ZOOM_THRESHOLDS = {
  HIDE:   0.25,   // below this → no labels at all
  MEDIUM: 0.55,   // between HIDE and MEDIUM → only Customer labels
  FULL:   0.90,   // above this → all labels
};

const PRIORITY_PROPS = {
  Customer:        ['fullName','id','grouping','isBlocked'],
  SalesOrder:      ['id','totalAmount','currency','deliveryStatus','billingStatus','creationDate'],
  Delivery:        ['id','shippingPoint','goodsMovementStatus','actualGoodsMovementDate','pickingStatus','creationDate'],
  BillingDocument: ['id','totalAmount','currency','isCancelled','soldToParty','accountingDocument'],
  Payment:         ['id','amount','currency','clearingDate','customer','postingDate'],
  JournalEntry:    ['id','postingDate','amount','currency','glAccount','profitCenter'],
  Product:         ['id','productType','baseUnit','productGroup','grossWeight'],
  Plant:           ['id','name','companyCode','country','region'],
};

// 2 properties for rich tooltip per type
const TOOLTIP_PROPS = {
  Customer:        ['fullName','grouping'],
  SalesOrder:      ['totalAmount','currency'],
  Delivery:        ['shippingPoint','goodsMovementStatus'],
  BillingDocument: ['totalAmount','isCancelled'],
  Payment:         ['amount','currency'],
  JournalEntry:    ['amount','postingDate'],
  Product:         ['productType','baseUnit'],
  Plant:           ['name','companyCode'],
};

const MAX_PROPS = 6;

// ─── State ────────────────────────────────────────────────────────────────────
let cy                 = null;
let selectedNodeId     = null;
let overlayVisible     = true;
let activeLegendFilter = null;
let focusModeActive    = false;   // Focus Connections button state
let globalFocusMode    = false;   // Background dim toggle
let hoveredNodeId      = null;

// ─── Initialize Cytoscape ─────────────────────────────────────────────────────
function initCytoscape() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    style: buildCyStyle(),
    layout:  { name: 'preset' },
    minZoom: 0.03,
    maxZoom: 6,
  });

  cy.on('tap', 'node', onNodeClick);
  cy.on('tap', function(evt) {
    if (evt.target === cy) { resetAllHighlights(); closeNodeDetail(); }
  });

  // ── Hover: soft glow + edge highlight + dim rest ──────────────────────
  cy.on('mouseover', 'node', function(e) {
    const node = e.target;
    hoveredNodeId = node.id();

    // Rich tooltip
    showRichTooltip(node);

    // Hover dim: if nothing is currently focused
    if (!selectedNodeId && !focusModeActive) {
      const connected = node.neighborhood();
      cy.elements().not(node).not(connected).addClass('hover-dim');
      node.connectedEdges().addClass('hover-edge');
    }
  });
  cy.on('mousemove', 'node', function(e) {
    const t = document.getElementById('node-tooltip');
    t.style.left = (e.originalEvent.clientX + 16) + 'px';
    t.style.top  = (e.originalEvent.clientY - 10) + 'px';
  });
  cy.on('mouseout', 'node', function() {
    hoveredNodeId = null;
    document.getElementById('node-tooltip').style.display = 'none';
    if (!selectedNodeId && !focusModeActive) {
      cy.elements().removeClass('hover-dim hover-edge');
    }
  });

  // ── Zoom: smart label visibility ──────────────────────────────────────
  cy.on('zoom', function() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(cy.zoom() * 100) + '%';
    updateLabelVisibility();
  });

  return cy;
}

// ─── Cytoscape Style Definition ───────────────────────────────────────────────
function buildCyStyle() {
  return [
    // ─ Base node
    {
      selector: 'node',
      style: {
        'background-color':    'data(color)',
        'label':               'data(displayName)',
        'color':               'rgba(255,255,255,0.55)',
        'font-size':           '8px',
        'font-family':         'Inter, system-ui, sans-serif',
        'text-valign':         'bottom',
        'text-halign':         'center',
        'text-margin-y':       '4px',
        'text-outline-color':  '#13151f',
        'text-outline-width':   1.5,
        'text-max-width':      '60px',
        'text-wrap':           'ellipsis',
        'width':                20,
        'height':               20,
        'border-width':         0,
        'z-index':              1,
      }
    },
    // ─ Plant: visually demoted
    {
      selector: 'node[label="Plant"]',
      style: {
        'width':     12,
        'height':    12,
        'opacity':   0.40,
        'font-size': '7px',
        'color':     'rgba(255,255,255,0.25)',
      }
    },
    // ─ Customer: largest, most prominent
    {
      selector: 'node[label="Customer"]',
      style: {
        'width':       28,
        'height':      28,
        'font-size':   '9px',
        'font-weight': '600',
        'color':       '#dde0e8',
      }
    },
    // ─ BillingDocument — medium
    {
      selector: 'node[label="BillingDocument"]',
      style: { 'width': 24, 'height': 24 }
    },
    // ─ Edges — very quiet by default (#7: reduced noise)
    {
      selector: 'edge',
      style: {
        'width':              0.5,
        'line-color':         'rgba(255,255,255,0.04)',
        'target-arrow-color': 'rgba(255,255,255,0.06)',
        'target-arrow-shape': 'triangle',
        'arrow-scale':        0.45,
        'curve-style':        'bezier',
        'label':              '',
        'opacity':            1,
      }
    },
    // ─ Hover dim (non-neighbors when hovering)
    {
      selector: 'node.hover-dim',
      style: {
        'opacity':             0.12,
        'transition-property': 'opacity',
        'transition-duration': '0.2s',
      }
    },
    // ─ Hover edge (directly connected edges) — glow up
    {
      selector: 'edge.hover-edge',
      style: {
        'width':              1.5,
        'line-color':         'rgba(255,255,255,0.30)',
        'target-arrow-color': 'rgba(255,255,255,0.35)',
        'opacity':            1,
        'transition-property': 'width, line-color, opacity',
        'transition-duration': '0.2s',
      }
    },
    // ─ Highlighted (chat result / search result)
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
    // ─ Search result highlight (slightly different colour)
    {
      selector: 'node.search-match',
      style: {
        'border-width':        3,
        'border-color':        '#4A90D9',
        'border-opacity':      1,
        'width':               34,
        'height':              34,
        'opacity':             1,
        'z-index':             1001,
        'transition-property': 'border-width, width, height, opacity',
        'transition-duration': '0.2s',
      }
    },
    // ─ Dimmed (heavy — for click/chat/legend dim)
    {
      selector: 'node.dimmed',
      style: {
        'opacity':             0.05,
        'transition-property': 'opacity',
        'transition-duration': '0.25s',
      }
    },
    {
      selector: 'edge.dimmed',
      style: {
        'opacity':             0.02,
        'transition-property': 'opacity',
        'transition-duration': '0.25s',
      }
    },
    // ─ Focus Mode background dim (Global Focus Mode #6)
    {
      selector: 'node.bg-dim',
      style: {
        'opacity':             0.10,
        'transition-property': 'opacity',
        'transition-duration': '0.3s',
      }
    },
    // ─ Focused node (click)
    {
      selector: 'node.focused',
      style: {
        'border-width':   3,
        'border-color':   '#ffffff',
        'border-opacity':  1,
        'width':           34,
        'height':          34,
        'z-index':         1000,
      }
    },
    // ─ Neighbor in click-focus mode
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
    // ─ Faded (light dim for non-neighbors on click)
    {
      selector: 'node.faded',
      style: {
        'opacity':             0.12,
        'transition-property': 'opacity',
        'transition-duration': '0.25s',
      }
    },
    {
      selector: 'edge.faded',
      style: {
        'opacity':             0.03,
        'transition-property': 'opacity',
        'transition-duration': '0.25s',
      }
    },
    // ─ Legend filter
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
    { selector: 'node.new-node', style: { 'opacity': 0 } },
  ];
}

// ─── Smart Label Visibility (#1) ──────────────────────────────────────────────
// Called on every zoom event. Adjusts which nodes show labels.
function updateLabelVisibility() {
  if (!cy) return;
  const z = cy.zoom();

  if (z < LABEL_ZOOM_THRESHOLDS.HIDE) {
    // Completely zoomed out — hide all labels
    cy.nodes().style({ 'label': '' });
  } else if (z < LABEL_ZOOM_THRESHOLDS.MEDIUM) {
    // Low zoom — only show Customer labels
    cy.nodes().style({ 'label': '' });
    cy.nodes('[label="Customer"]').style({ 'label': 'data(displayName)' });
  } else if (z < LABEL_ZOOM_THRESHOLDS.FULL) {
    // Medium zoom — show non-Plant, non-tiny labels
    cy.nodes('[label="Plant"]').style({ 'label': '' });
    cy.nodes().not('[label="Plant"]').style({ 'label': 'data(displayName)' });
  } else {
    // Fully zoomed in — show all labels
    cy.nodes().style({ 'label': 'data(displayName)' });
  }
}

// ─── Rich Tooltip (#5) ────────────────────────────────────────────────────────
function showRichTooltip(node) {
  const label   = node.data('label') || 'Node';
  const id      = node.data('id') || '';
  const props   = node.data('properties') || {};
  const keys    = TOOLTIP_PROPS[label] || [];
  const tooltip = document.getElementById('node-tooltip');

  const icon = getNodeIcon(label);

  // Build 1-2 property lines
  let propLines = '';
  keys.forEach(k => {
    const v = props[k];
    if (v !== undefined && v !== null && v !== '') {
      const displayKey = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      let displayVal = truncateText(String(v), 22);
      if (['totalAmount','amount'].includes(k)) displayVal = formatCurrency(v);
      propLines += `<span class="tt-prop"><span class="tt-key">${displayKey}:</span> ${escapeHtml(displayVal)}</span>`;
    }
  });

  const shortId = id.length > 18 ? id.slice(0, 18) + '…' : id;

  tooltip.innerHTML = `
    <div class="tt-header">${icon} <strong>${escapeHtml(node.data('displayName'))}</strong></div>
    <div class="tt-type">${label} · <span class="tt-id">${escapeHtml(shortId)}</span></div>
    ${propLines ? `<div class="tt-props">${propLines}</div>` : ''}
  `;
  tooltip.style.display = 'block';
}

// ─── Load Graph ───────────────────────────────────────────────────────────────
async function loadGraph() {
  // Staged messages — each advances while backend wakes up
  const stages = [
    { msg: '🔌 Connecting to graph engine...', delay: 0    },
    { msg: '⏳ Waking up backend...', delay: 3000  },
    { msg: '📡 Fetching graph data...', delay: 8000  },
    { msg: '🔄 Still loading, please wait...', delay: 18000 },
    { msg: '⏳ Almost there...', delay: 30000 },
  ];
  let stageTimers = [];
  stages.forEach(s => {
    const t = setTimeout(() => showGraphLoading(s.msg), s.delay);
    stageTimers.push(t);
  });
  showGraphLoading(stages[0].msg);

  try {
    const data     = await fetchGraph();
    stageTimers.forEach(t => clearTimeout(t));   // cancel pending stage messages
    showGraphLoading('🧩 Building graph...');
    const elements = buildElements(data);
    cy.add(elements);

    const layoutConfig = {
      name: 'cose',
      animate: true,
      animationDuration: 800,
      animationEasing: 'ease-in-out',

      // Force all nodes together
      nodeRepulsion: function(node) {
        return 8192;
      },
      nodeOverlap: 4,
      idealEdgeLength: function(edge) {
        return 50;
      },
      edgeElasticity: function(edge) {
        return 100;
      },
      nestingFactor: 5,
      gravity: 250,
      gravityRange: 3.8,
      gravityCompound: 1.0,
      gravityRangeCompound: 1.5,

      numIter: 2500,
      initialTemp: 1000,
      coolingFactor: 0.99,
      minTemp: 1.0,

      // Pull disconnected nodes in
      componentSpacing: 40,

      fit: true,
      padding: 40,
      randomize: false
    };
    const layout = cy.layout(layoutConfig);

    layout.on('layoutstop', function() {
      showGraphLoading('✨ Rendering...');
      setTimeout(() => {
        const overlay = document.getElementById('graph-loading');
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; overlay.style.opacity = '1'; overlay.style.transition = ''; }, 500);
      }, 400);
      document.getElementById('cy').style.opacity = '1';
      applyPlantSoftDim();
      cy.resize();

      // Initial label visibility based on starting zoom
      updateLabelVisibility();

      const zoomEl = document.getElementById('zoom-level');
      if (zoomEl) zoomEl.textContent = Math.round(cy.zoom() * 100) + '%';

      // Populate ctrl-stats
      updateGraphStats(cy.nodes().length, cy.edges().length);

      // Stage 1 (100ms): reposition Plant nodes in an even ring around main cluster
      setTimeout(() => {
        const plantNodes = cy.nodes().filter(n => n.data('label') === 'Plant');
        const mainNodes  = cy.nodes().filter(n => n.data('label') !== 'Plant');

        if (mainNodes.length > 0 && plantNodes.length > 0) {
          const bb      = mainNodes.boundingBox();
          const centerX = (bb.x1 + bb.x2) / 2;
          const centerY = (bb.y1 + bb.y2) / 2;
          const radius  = Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1) / 2 + 80;
          const total   = plantNodes.length;

          plantNodes.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / total;
            node.position({
              x: centerX + radius * Math.cos(angle),
              y: centerY + radius * Math.sin(angle),
            });
          });
        }

        // Stage 2 (300ms): fit everything and nudge pan right
        setTimeout(() => {
          cy.fit(undefined, 80);
          cy.center();
          const pan = cy.pan();
          cy.pan({ x: pan.x + 60, y: pan.y });
          if (zoomEl) zoomEl.textContent = Math.round(cy.zoom() * 100) + '%';
        }, 200);

      }, 100);
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

// ─── Node Click → Detail + Strong Focus (#2) ─────────────────────────────────
function onNodeClick(evt) {
  const node = evt.target;
  selectedNodeId = node.id();
  focusModeActive = false;
  globalFocusMode = false;

  // Clear all existing states
  cy.elements().removeClass(
    'focused highlighted dimmed faded neighbor-focus legend-match legend-dim hover-dim hover-edge bg-dim search-match'
  );

  // Strong focus: dim non-neighbors heavily
  node.addClass('focused');
  const neighbors = node.neighborhood();
  const neighborNodes = neighbors.nodes();

  cy.nodes().not(node).not(neighborNodes).addClass('faded');
  cy.edges().not(node.connectedEdges()).addClass('faded');
  neighborNodes.addClass('neighbor-focus');

  // Zoom slightly toward selected node (not too aggressive)
  const pos = node.position();
  cy.animate({
    zoom:   Math.max(cy.zoom() * 1.15, 0.5),
    center: { eles: node },
  }, { duration: 300, easing: 'ease-out-cubic' });

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
    if (DATE_AUTO.includes(key))         val = formatDate(String(val));
    else if (AMOUNT_AUTO.includes(key))  val = formatCurrency(val);
    else                                 val = truncateText(String(val), 28);
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

  const focusBtn = document.getElementById('btn-expand-node');
  if (focusBtn) focusBtn.textContent = 'Focus Connections';
}

function closeNodeDetail() {
  document.getElementById('node-detail-panel').classList.add('hidden');
  selectedNodeId = null;
  focusModeActive = false;
}

// ─── Focus Connections ────────────────────────────────────────────────────────
function focusConnections() {
  if (!selectedNodeId || !cy) return;
  const node = cy.getElementById(selectedNodeId);
  if (!node || node.length === 0) return;
  const focusBtn = document.getElementById('btn-expand-node');

  if (focusModeActive) {
    focusModeActive = false;
    cy.elements().removeClass('focused highlighted dimmed faded neighbor-focus hover-dim hover-edge bg-dim search-match');
    cy.nodes().removeStyle('opacity');
    cy.edges().removeStyle('opacity');
    applyPlantSoftDim();
    node.addClass('focused');
    node.neighborhood().nodes().addClass('neighbor-focus');
    cy.elements().not(node).not(node.neighborhood()).addClass('faded');
    cy.resize();
    cy.animate({ fit: { padding: 60 }, duration: 400 });
    if (focusBtn) focusBtn.textContent = 'Focus Connections';
    return;
  }

  focusModeActive = true;
  const neighbors     = node.neighborhood();
  const neighborNodes = neighbors.nodes();
  const neighborEdges = neighbors.edges();

  cy.elements().removeClass('focused highlighted dimmed faded neighbor-focus hover-dim hover-edge bg-dim search-match');
  cy.nodes().not(node).not(neighborNodes).addClass('dimmed');
  cy.edges().not(neighborEdges).addClass('dimmed');
  node.addClass('focused');
  neighborNodes.addClass('neighbor-focus');
  neighborEdges.removeClass('dimmed');

  const toFit = cy.collection().union(node).union(neighborNodes);
  cy.resize();
  cy.animate({ fit: { eles: toFit, padding: 70 }, duration: 500, easing: 'ease-in-out-cubic' });
  if (focusBtn) focusBtn.textContent = 'Unfocus ↩';
}

// ─── Global Focus Mode Toggle (#6) ────────────────────────────────────────────
function toggleGlobalFocusMode() {
  globalFocusMode = !globalFocusMode;
  const btn = document.getElementById('btn-focus-mode');

  if (globalFocusMode) {
    // Dim all nodes slightly; edges nearly invisible
    cy.nodes().not('[label="Customer"]').addClass('bg-dim');
    cy.edges().style({ 'line-color': 'rgba(255,255,255,0.02)', 'opacity': 0.5 });
    if (btn) { btn.textContent = '◉ Focus Mode'; btn.classList.add('active'); }
  } else {
    cy.nodes().removeClass('bg-dim');
    cy.nodes().removeStyle('opacity');
    cy.edges().removeStyle('line-color');
    cy.edges().removeStyle('opacity');
    applyPlantSoftDim();
    if (btn) { btn.textContent = '○ Focus Mode'; btn.classList.remove('active'); }
  }
}

// ─── Search (#4) ──────────────────────────────────────────────────────────────
function initSearch() {
  const input   = document.getElementById('graph-search-input');
  const clearBtn = document.getElementById('graph-search-clear');
  if (!input) return;

  input.addEventListener('input', debounce(onSearchInput, 280));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') onSearchInput();
    if (e.key === 'Escape') clearSearch();
  });
  if (clearBtn) clearBtn.addEventListener('click', clearSearch);
}

function onSearchInput() {
  const input = document.getElementById('graph-search-input');
  const term  = (input ? input.value : '').trim().toLowerCase();
  const clearBtn = document.getElementById('graph-search-clear');

  if (clearBtn) clearBtn.style.display = term ? 'flex' : 'none';

  if (!term || !cy) { clearSearch(); return; }

  const matched = cy.nodes().filter(node => {
    const id          = (node.data('id') || '').toLowerCase();
    const displayName = (node.data('displayName') || '').toLowerCase();
    const props       = node.data('properties') || {};
    const fullName    = String(props.fullName || '').toLowerCase();
    const name        = String(props.name || '').toLowerCase();
    return id.includes(term) || displayName.includes(term) || fullName.includes(term) || name.includes(term);
  });

  // Clear all states first
  cy.elements().removeClass(
    'focused highlighted dimmed faded neighbor-focus legend-match legend-dim hover-dim hover-edge bg-dim search-match'
  );
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');
  applyPlantSoftDim();

  if (matched.length === 0) return;

  // Dim everything, highlight matches
  cy.nodes().addClass('dimmed');
  cy.edges().addClass('dimmed');
  matched.forEach(n => {
    n.removeClass('dimmed').addClass('search-match');
    n.connectedEdges().removeClass('dimmed');
  });

  // Zoom to results
  cy.resize();
  cy.animate({ fit: { eles: matched, padding: 80 }, duration: 450, easing: 'ease-in-out-cubic' });

  // If exactly 1 match → also open detail panel
  if (matched.length === 1) {
    selectedNodeId = matched[0].id();
    renderDetailPanel(matched[0]);
  }
}

function clearSearch() {
  const input    = document.getElementById('graph-search-input');
  const clearBtn = document.getElementById('graph-search-clear');
  if (input)    input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';

  cy.elements().removeClass('search-match dimmed');
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');
  applyPlantSoftDim();
  cy.resize();
  cy.animate({ fit: { padding: 60 }, duration: 380 });
}

// ─── Reset (robust) ───────────────────────────────────────────────────────────
function resetAllHighlights() {
  if (!cy) return;
  focusModeActive = false;
  globalFocusMode = false;
  activeLegendFilter = null;

  cy.elements().removeClass(
    'highlighted dimmed focused faded neighbor-focus legend-match legend-dim hover-dim hover-edge bg-dim new-node search-match'
  );
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');

  // Reset legend UI
  document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active-filter'));
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.remove('visible');

  // Reset search
  const searchInput = document.getElementById('graph-search-input');
  const clearBtn    = document.getElementById('graph-search-clear');
  if (searchInput) searchInput.value = '';
  if (clearBtn)    clearBtn.style.display = 'none';

  // Reset focus mode button
  const focusModeBtn = document.getElementById('btn-focus-mode');
  if (focusModeBtn) { focusModeBtn.textContent = '○ Focus Mode'; focusModeBtn.classList.remove('active'); }

  applyPlantSoftDim();
  cy.resize();
  cy.animate({ fit: { padding: 60 }, duration: 380 });

  const zoomEl = document.getElementById('zoom-level');
  if (zoomEl) zoomEl.textContent = Math.round(cy.zoom() * 100) + '%';
}

// ─── Legend (#2 & #3) ─────────────────────────────────────────────────────────
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
      if (activeLegendFilter === nodeType) { clearLegendFilter(); }
      else { applyLegendFilter(nodeType); }
    });
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => { e.stopPropagation(); clearLegendFilter(); });
  }
}

function applyLegendFilter(nodeType) {
  if (!cy) return;
  activeLegendFilter = nodeType;
  focusModeActive    = false;
  globalFocusMode    = false;

  cy.elements().removeClass(
    'highlighted dimmed focused faded neighbor-focus legend-match legend-dim hover-dim hover-edge bg-dim search-match'
  );
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
  cy.elements().removeClass('legend-match legend-dim dimmed highlighted focused faded neighbor-focus hover-dim hover-edge bg-dim search-match');
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');
  document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active-filter'));
  const resetBtn = document.getElementById('legend-reset-filter');
  if (resetBtn) resetBtn.classList.remove('visible');
  applyPlantSoftDim();
  cy.resize();
  cy.animate({ fit: { padding: 60 }, duration: 380 });
}

// ─── Chat Highlight (#3 — stronger) ──────────────────────────────────────────
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
      nodeId === val || nodeId.includes(val) ||
      Object.values(props).some(p => String(p) === val)
    );
  });

  if (matchedNodes.length === 0) return; // leave graph stable

  cy.elements().removeClass(
    'highlighted dimmed focused faded neighbor-focus legend-match legend-dim hover-dim hover-edge bg-dim search-match'
  );
  cy.nodes().removeStyle('opacity');
  cy.edges().removeStyle('opacity');
  applyPlantSoftDim();

  // Heavy dim on non-matches
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
    } catch (e) { /* no path */ }
  }

  cy.elements().removeClass(
    'highlighted dimmed focused faded neighbor-focus legend-match legend-dim hover-dim hover-edge bg-dim search-match'
  );
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

// ─── Graph Controls ───────────────────────────────────────────────────────────
function updateZoomDisplay() {
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = Math.round(cy.zoom() * 100) + '%';
}

function updateGraphStats(nodeCount, edgeCount) {
  const el = document.getElementById('ctrl-stats');
  if (el) el.textContent = `${nodeCount} nodes · ${edgeCount} edges`;
}



function initGraphControls() {
  // Wire cy zoom event → display update
  if (cy) cy.on('zoom', updateZoomDisplay);

  // ─ Single Reset View button (bottom nav — the ONLY reset control) ─
  // Resets zoom + fit + clears all highlights + closes detail panel
  const doResetView = () => {
    cy.elements().removeClass(
      'highlighted dimmed focused faded neighbor-focus legend-match legend-dim hover-dim hover-edge bg-dim search-match'
    );
    cy.nodes().removeStyle('opacity');
    cy.edges().removeStyle('opacity');
    applyPlantSoftDim();
    cy.fit(undefined, 50);
    updateZoomDisplay();
    const panel = document.getElementById('node-detail-panel');
    if (panel) panel.classList.add('hidden');
    selectedNodeId  = null;
    focusModeActive = false;
    globalFocusMode = false;
    // Reset search
    const si = document.getElementById('graph-search-input');
    const sc = document.getElementById('graph-search-clear');
    if (si) si.value = '';
    if (sc) sc.style.display = 'none';
    // Reset legend
    document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active-filter'));
    const legReset = document.getElementById('legend-reset-filter');
    if (legReset) legReset.classList.remove('visible');
    activeLegendFilter = null;
  };

  document.getElementById('btn-fit-screen').addEventListener('click', doResetView);

  // ── Double-click on empty canvas → Reset View ──
  cy.on('dblclick', function(evt) {
    if (evt.target === cy) doResetView();
  });

  // ─ Bottom nav zoom ─
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    cy.zoom({ level: cy.zoom() * 0.8, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    updateZoomDisplay();
  });
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    updateZoomDisplay();
  });
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    cy.zoom(1); cy.center(); updateZoomDisplay();
  });

  document.getElementById('btn-download').addEventListener('click', () => {
    const png = cy.png({ scale: 2, bg: '#0d0f1a' });
    const a = document.createElement('a'); a.href = png; a.download = 'graphiq-export.png'; a.click();
  });

  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    const gp = document.getElementById('graph-panel');
    if (!document.fullscreenElement) {
      gp.requestFullscreen && gp.requestFullscreen().then(() => setTimeout(() => { cy.resize(); cy.fit(undefined, 40); }, 200));
    } else {
      document.exitFullscreen && document.exitFullscreen().then(() => setTimeout(() => { cy.resize(); cy.fit(undefined, 40); }, 200));
    }
  });
  document.addEventListener('fullscreenchange', () => setTimeout(() => { cy.resize(); cy.fit(null, 60); }, 150));

  // ─ Detail panel ─
  document.getElementById('node-detail-close').addEventListener('click', () => { resetAllHighlights(); closeNodeDetail(); });
  document.getElementById('btn-expand-node').addEventListener('click', focusConnections);


  // ─ Overlay toggle ─
  document.getElementById('btn-overlay').addEventListener('click', function() {
    overlayVisible = !overlayVisible;
    const span = this.querySelector('span');
    cy.edges().style({ 'line-color': overlayVisible ? 'rgba(255,255,255,0.04)' : 'transparent', 'opacity': overlayVisible ? 1 : 0 });
    if (span) span.textContent = overlayVisible ? 'Hide Overlay' : 'Show Overlay';
  });

  // ─ Focus Mode ─
  const focusModeBtn = document.getElementById('btn-focus-mode');
  if (focusModeBtn) focusModeBtn.addEventListener('click', toggleGlobalFocusMode);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function applyPlantSoftDim() {
  if (!cy) return;
  cy.nodes('[label="Plant"]').forEach(n => {
    n.style('opacity', n.degree() <= 1 ? 0.22 : 0.40);
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
  initSearch();
  await loadGraph();
});
