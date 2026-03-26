# Session 02 — Backend Implementation

**Date:** March 23–24, 2026
**Focus:** FastAPI backend, Neo4j integration, data ingestion pipeline, LLM service

---

## Objective

Build the complete backend: data ingestion pipeline, Neo4j graph loader,
FastAPI REST API, guardrail layer, and LLM service using Groq.

---

## Data Ingestion Pipeline (`src/ingestion/`)

### preprocess.py
Reads raw NDJSON files and normalizes them into clean Python dicts.

Key decisions:
- Used `VBELN` as the Sales Order ID primary key
- Linked Deliveries via `shipping_data.VBELN` field (not direct reference)
- Linked Billing Documents via `billing_data.VBELN` chained through Sales Order
- Currency amounts normalized to float (strip string formatting)
- Dates converted from SAP timestamp format `YYYYMMDD`

### graph_builder.py
Loads processed data into Neo4j using `MERGE` (idempotent — safe to re-run).

Batching strategy: 500 records per transaction to avoid Neo4j memory limits.

Relationship construction order (dependency-safe):
1. Customers → SalesOrders
2. SalesOrders → Products, Plants
3. SalesOrders → Deliveries (via shipping junction)
4. SalesOrders → BillingDocuments (via billing junction)
5. BillingDocuments → Payments
6. Payments → JournalEntries

### Key Bug Fixed (Session)
Initial data load created nodes but **zero relationships**.
Root cause: delivery/billing linkage fields were nested under sub-objects in the raw NDJSON.
Fix: updated `preprocess.py` to extract `record['shipping_data']['VBELN']` and `record['billing_data']['VBELN']` correctly.

---

## FastAPI Backend (`src/backend/`)

### Endpoints

| Method | Route | Handler |
|---|---|---|
| GET | `/api/health` | Returns status + Neo4j connectivity |
| GET | `/api/graph` | Returns all nodes + edges in Cytoscape.js format |
| GET | `/api/graph/node/{id}` | Returns node + immediate neighbors |
| POST | `/api/chat` | Full NL → Cypher → Neo4j → Answer pipeline |

### Neo4j Service (`neo4j_service.py`)
- Singleton driver pattern (`_driver` module-level)
- `run_query(cypher)` executes read-only queries and returns list of dicts
- Driver closed gracefully on app shutdown via FastAPI `lifespan`

### CORS Configuration
```python
allow_origins=["*"]  # Required: Vercel frontend on different domain
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]
```

---

## LLM Service (`services/llm_service.py`)

Two-call pipeline using Groq:

**Call 1 — Cypher Generation:**
- Model: `llama-3.3-70b-versatile`
- System prompt: full graph schema + strict Cypher-only instructions
- Temperature: `0` (deterministic output)
- Max tokens: `512` (Cypher queries are short)
- Extracts code block from ` ```cypher ``` ` if present

**Call 2 — Answer Generation:**
- Model: `llama-3.3-70b-versatile`
- System prompt: response format rules (sentence/bullets/dropdown)
- Temperature: `0.3` (slight variation for natural phrasing)
- Max tokens: `2048`

**Retry Logic:**
Exponential backoff on `RateLimitError` (2s → 4s → 8s, max 3 attempts).

---

## Guardrail Layer (`services/guardrails.py`)

Two-stage protection:

1. **Query classification** — LLM classifies user query as ALLOWED or BLOCKED
   - Blocked: off-topic questions (weather, coding help, personal queries)
   - Allowed: any question about customers, orders, deliveries, billing, payments

2. **Cypher validation** — regex + keyword check before execution
   - Blocks: `CREATE`, `DELETE`, `SET`, `MERGE`, `DROP`, `DETACH`
   - Only `MATCH` / `OPTIONAL MATCH` / `RETURN` operations allowed

---

## Session Outcomes

- Full ingestion pipeline built and verified (8 node types, 7 relationship types loaded)
- All 4 FastAPI endpoints working locally
- LLM two-call pipeline operational
- Guardrails blocking off-topic and write-operation queries
- Neo4j AuraDB populated with SAP O2C dataset
