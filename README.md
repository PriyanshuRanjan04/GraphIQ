# GraphIQ — Order-to-Cash Graph Intelligence

> Natural-language querying and interactive graph visualization for SAP Order-to-Cash data, powered by Neo4j, Groq LLM, and Cytoscape.js.

🔗 **Live Demo:** [https://graphiq-two.vercel.app](https://graphiq-two.vercel.app)

---

## What It Does

GraphIQ lets business users explore SAP Order-to-Cash data through a conversational interface.
Instead of writing SQL or Cypher, you type plain English:

- *"Which customer placed the most orders?"*
- *"Find all sales orders with no billing documents"*
- *"Trace billing document 91150187 end to end"*

The system translates your question into a Neo4j Cypher query, executes it, and returns a clean,
structured answer — while simultaneously highlighting the relevant nodes on the graph.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Vercel (Static Frontend)               │
│  Vanilla JS + Cytoscape.js + CSS                        │
│                                                         │
│  ┌──────────────┐     ┌───────────────────────────┐    │
│  │  Graph Panel │     │       Chat Panel           │    │
│  │  Cytoscape.js│◄────│  NL Input → Response       │    │
│  │  8 node types│     │  Structured answer display  │    │
│  └──────────────┘     └───────────────────────────┘    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS REST
┌────────────────────────▼────────────────────────────────┐
│                  Render (FastAPI Backend)                │
│                                                         │
│  POST /api/chat pipeline:                               │
│  [Guardrail] → [Cypher Gen LLM] → [Cypher Validator]   │
│             → [Neo4j Execution] → [Answer Gen LLM]     │
│                                                         │
│  GET /api/graph  — full graph for visualization         │
│  GET /api/health — connectivity check                   │
└────────────────────────┬────────────────────────────────┘
                         │
           ┌─────────────┴──────────────┐
           │                            │
┌──────────▼──────────┐   ┌────────────▼────────────┐
│   Neo4j AuraDB      │   │   Groq API (Llama 3 70B) │
│   8 node labels     │   │   Cypher generation       │
│   7 relationship    │   │   Answer generation       │
│   types             │   │   Rate-limit retry logic  │
└─────────────────────┘   └─────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, Cytoscape.js, CSS Custom Properties |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Graph Database | Neo4j AuraDB (cloud) |
| LLM | Groq API — `llama-3.3-70b-versatile` |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Graph Schema

```
(:Customer)-[:PLACED]->(:SalesOrder)
(:SalesOrder)-[:HAS_DELIVERY]->(:Delivery)
(:SalesOrder)-[:HAS_BILLING]->(:BillingDocument)
(:BillingDocument)-[:HAS_PAYMENT]->(:Payment)
(:Payment)-[:HAS_JOURNAL]->(:JournalEntry)
(:SalesOrder)-[:CONTAINS]->(:Product)
(:SalesOrder)-[:SHIPS_FROM]->(:Plant)
```

**8 node labels** · **7 relationship types** · SAP O2C process end-to-end

---

## LLM Strategy

GraphIQ uses a **two-call LLM pipeline** per query:

### Call 1: Cypher Generation
- **Model:** `llama-3.3-70b-versatile` via Groq
- **Input:** System prompt (graph schema + rules) + Cypher prompt + user question
- **Output:** A validated Cypher `MATCH` query
- **Temperature:** `0` (deterministic)

### Call 2: Answer Generation
- **Model:** `llama-3.3-70b-versatile` via Groq
- **Input:** System prompt + user question + raw Neo4j results
- **Output:** Formatted human-readable answer (sentence / bullets / dropdown)
- **Temperature:** `0.3` (natural phrasing)

### Response Format Rules (enforced in system prompt)
| Result count | Format |
|---|---|
| 1 result | Single clean sentence |
| 2–5 results | Bullet points only, no table |
| 6+ results | All bullets — frontend collapses to first 5 + expandable dropdown |

### Rate Limit Handling
- Exponential backoff retry: 2s → 4s → 8s on `RateLimitError`
- Frontend keep-alive ping every 10 min to prevent Render cold starts

---

## Guardrails

| Guard | Implementation |
|---|---|
| Off-topic blocking | LLM classifies query as ALLOWED/BLOCKED before any processing |
| Write operation prevention | Regex validator blocks Cypher with `CREATE`, `DELETE`, `SET`, `MERGE`, `DROP`, `DETACH` |
| Safe fallback | Blocked queries return a polite decline message, not an error |

---

## Project Structure

```
GraphIQ/
├── src/
│   ├── backend/
│   │   ├── main.py              FastAPI app + CORS + lifecycle
│   │   ├── config.py            Environment variable loading
│   │   ├── routers/
│   │   │   ├── health.py        GET /api/health
│   │   │   ├── graph.py         GET /api/graph, /api/graph/node/{id}
│   │   │   └── chat.py          POST /api/chat (full pipeline)
│   │   ├── services/
│   │   │   ├── neo4j_service.py Neo4j driver + query runner
│   │   │   ├── llm_service.py   Groq two-call pipeline + retry logic
│   │   │   └── guardrails.py    Query classifier + Cypher validator
│   │   ├── models/
│   │   │   └── schemas.py       Pydantic request/response models
│   │   └── prompts/
│   │       ├── system_prompt.txt Shared system prompt (schema + format rules)
│   │       └── cypher_prompt.txt Cypher generation-specific instructions
│   ├── ingestion/
│   │   ├── preprocess.py        Raw NDJSON → normalized Python dicts
│   │   ├── graph_builder.py     Neo4j MERGE loader (batched, idempotent)
│   │   ├── ingest.py            Orchestrator (preprocess → build → validate)
│   │   └── validate.py          Post-load verification report
│   └── frontend/
│       ├── index.html           Single-page app shell
│       ├── style.css            Full dark-mode UI (CSS custom properties)
│       └── js/
│           ├── api.js           REST calls + keep-alive ping
│           ├── graph.js         Cytoscape init, layout, interactions
│           ├── chat.js          Chat pipeline, response rendering, dropdowns
│           └── utils.js         Shared helpers
├── sessions/
│   ├── session_01_planning.md   Architecture + tech decisions
│   ├── session_02_backend.md    Backend + data ingestion implementation
│   ├── session_03_frontend.md   Frontend + UI implementation
│   └── session_04_prompts.md    Prompt engineering + LLM optimization
├── docs/
│   └── architecture.md          Detailed architecture document
├── requirements.txt
├── render.yaml                  Render deployment config
└── vercel.json                  Vercel deployment config
```

---

## Setup Instructions

### Prerequisites
- Python 3.11+
- Neo4j AuraDB instance (free tier works)
- Groq API key ([console.groq.com](https://console.groq.com))

### 1. Clone the Repository
```bash
git clone https://github.com/PriyanshuRanjan04/GraphIQ.git
cd GraphIQ
```

### 2. Create Virtual Environment
```bash
python -m venv venv
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Create a `.env` file in the project root:
```env
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
GROQ_API_KEY=your-groq-api-key
```

### 5. Ingest Data into Neo4j
```bash
python -m src.ingestion.ingest
```

### 6. Start the Backend
```bash
uvicorn src.backend.main:app --reload --port 8000
```

### 7. Open the Frontend
Open `src/frontend/index.html` in your browser, or serve it with:
```bash
python -m http.server 3000 --directory src/frontend
```

### 8. Verify Health
```
GET http://localhost:8000/api/health
→ { "status": "healthy", "neo4j_connected": true }
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend + Neo4j health check |
| `GET` | `/api/graph` | All nodes + edges (Cytoscape.js format) |
| `GET` | `/api/graph/node/{id}` | Single node + immediate neighbors |
| `POST` | `/api/chat` | Natural language query → structured answer |

### POST `/api/chat`
**Request:**
```json
{ "query": "Which customer placed the most orders?" }
```
**Response:**
```json
{
  "answer": "The customer with the most orders is Melton Group with 47 orders.",
  "cypher": "MATCH (c:Customer)-[:PLACED]->(s:SalesOrder) RETURN c.customer_name, count(s) AS orders ORDER BY orders DESC LIMIT 1",
  "raw_results": [{ "c.customer_name": "Melton Group", "orders": 47 }],
  "allowed": true
}
```

---

## Sessions

See the `/sessions` folder for detailed notes from each development session:

| Session | Topic |
|---|---|
| `session_01_planning.md` | Architecture design, tech decisions, graph schema |
| `session_02_backend.md` | FastAPI, Neo4j, ingestion pipeline, LLM service |
| `session_03_frontend.md` | Cytoscape.js, chat UI, response rendering pipeline |
| `session_04_prompts.md` | Prompt engineering, guardrails, LLM optimization |
