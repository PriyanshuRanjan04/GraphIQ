# Session 03 — Frontend Implementation

**Date:** March 25–26, 2026
**Focus:** Graph visualization, chat interface, UI polish

---

## Objective

Build the complete frontend: interactive graph panel with Cytoscape.js,
chat panel with structured LLM responses, and a premium dark-mode UI.

---

## Stack

- **Vanilla JS** — no framework, no build step, CDN-served Cytoscape.js
- **Cytoscape.js** — graph rendering and interaction
- **CSS Custom Properties** — design token system for consistent theming
- **Google Fonts: Inter** — modern professional typography

---

## Graph Panel (`js/graph.js`)

### Layout
Used Cytoscape `cose` physics layout with high-gravity configuration to keep all nodes clustered:

```js
gravity: 250,
nodeRepulsion: () => 8192,
idealEdgeLength: () => 50,
componentSpacing: 40
```

### Post-layout Centering
Two-stage `layoutstop` callback:
1. **100ms delay** — redistributes Plant nodes in a ring around the main cluster bounding box
2. **300ms delay** — fits graph to panel + applies `+60px` X pan offset to account for left-side legend overlay

### Node Styling
Each node label gets a unique color:

| Label | Color |
|---|---|
| Customer | `#4A90D9` (blue) |
| SalesOrder | `#7ED321` (green) |
| Delivery | `#F5A623` (orange) |
| BillingDocument | `#D0021B` (red) |
| Payment | `#9B59B6` (purple) |
| JournalEntry | `#1ABC9C` (teal) |
| Product | `#E67E22` (amber) |
| Plant | `#95A5A6` (grey) |

### Interactions
- **Hover** — tooltip with node type + key properties
- **Click** — node detail panel slides in (properties + neighbor count)
- **Double-click** — resets graph view (center + fit + clear highlights)
- **Search** — live node search, flying pan-and-zoom to matched node
- **Legend filter** — click label to show/hide node type
- **Focus Mode** — dims unrelated nodes, highlights selected subgraph
- **Cytoscape png download** — exports current view

---

## Chat Panel (`js/chat.js`)

### Response Rendering Pipeline
Every LLM response goes through this pipeline before display:

```
Raw LLM text
  → removeDuplicateData()    strip table+bullet duplicates
  → removeAlternatively()    strip verbose LLM preambles
  → structureAnswer()        markdown → styled HTML
  → renderWithDropdown()     collapse 6+ bullet lists
  → styleArrows()            replace → with visual arrow
```

### Dropdown Collapse (6+ results)
If `structureAnswer()` produces more than 5 `answer-list-item` divs:
- First 5 shown immediately
- Items 6+ wrapped in `hidden-bullets` div
- `▶ Show N more results` button renders, triggers `toggleDropdown()`

### Clickable Entity IDs
Entity IDs detected in LLM responses (e.g. `C-1234`, `740584`) are wrapped in
`.chat-id-link` spans. Clicking them pans the Cytoscape graph to that node.

### Follow-up Chips
After each response, 3 contextual follow-up question chips are generated
and rendered below the answer bubble.

### Error Handling
Three distinct error messages based on HTTP status:
- `⏳` 429 rate-limit → wait message
- `🔄` 502/503/504 → backend starting up
- `⚠️` Other → connection error
All errors include a **↩ Try Again** button that auto-resends the query.

---

## UI / Design

### Design Tokens (CSS Custom Properties)
```css
--bg-base:         #0d0f1a  (darkest background)
--bg-elevated:     #13151f  (panels)
--accent:          #4A90D9  (primary blue)
--border:          rgba(255,255,255,0.07)
--font:            'Inter', sans-serif
```

### Key Components Built
- Premium hexagon logo with SVG linearGradient + feGaussianBlur glow
- Matching inline SVG favicon
- Breadcrumb navigation bar (Mapping / Order to Cash)
- Top-left graph controls overlay (search + focus mode + hide overlay)
- Collapsible node type legend with filter-by-click
- Bottom navigation bar (zoom –/% / +, reset view, download, fullscreen)
- Chat header with clear button
- Example prompt chips (hidden after first query)
- Agent status bar ("Graph Agent is awaiting instructions")
- Metadata bar (query type tag + result count + elapsed time)

---

## Deployment

- Frontend served as static files via **Vercel**
- API base URL auto-detected: `localhost:8000` locally, `https://graphiq-crvn.onrender.com` in production
- Keep-alive ping: `GET /api/health` every 10 min to prevent Render free-tier cold starts

---

## Session Outcomes

- Full interactive graph panel working (all 8 node types, all 7 relationships)
- Chat panel with structured response rendering
- Dropdown collapse for large result sets
- Clickable entity IDs with graph pan/zoom
- Full dark-mode premium UI
- Deployed and live on Vercel + Render
