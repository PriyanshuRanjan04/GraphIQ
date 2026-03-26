# Session 01 — Project Planning & Architecture Design

**Date:** March 23, 2026
**Focus:** Problem scoping, technology selection, architecture design

---

## Objective

Design a Context Graph Intelligence system for SAP Order-to-Cash (O2C) data.
The system should allow business users to explore the O2C process using natural language
and visualize the relationships between entities as a graph.

---

## Problem Statement

SAP Order-to-Cash processes involve multiple interdependent entities:
Customers → Sales Orders → Deliveries → Billing Documents → Payments → Journal Entries.

Traditional BI reporting tools present this as tables, making it hard to:
- Trace a transaction end-to-end
- Identify gaps (e.g. orders with no billing)
- Explore relationships interactively

**Goal:** Replace flat table queries with a natural-language graph interface.

---

## Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Graph Database | Neo4j AuraDB | Native graph traversal, Cypher query language, free cloud tier |
| LLM Provider | Groq (Llama 3 70B) | Fastest inference, generous free tier for prototyping |
| Backend | FastAPI (Python) | Async, lightweight, auto-generated OpenAPI docs |
| Frontend | Vanilla JS + Cytoscape.js | No build tool needed, Cytoscape is the gold standard for graph visualization |
| Deployment | Vercel (frontend) + Render (backend) | Free tier, CD from GitHub |

---

## Graph Schema Design

```
(:Customer)-[:PLACED]->(:SalesOrder)
(:SalesOrder)-[:HAS_DELIVERY]->(:Delivery)
(:SalesOrder)-[:HAS_BILLING]->(:BillingDocument)
(:BillingDocument)-[:HAS_PAYMENT]->(:Payment)
(:Payment)-[:HAS_JOURNAL]->(:JournalEntry)
(:SalesOrder)-[:CONTAINS]->(:Product)
(:SalesOrder)-[:SHIPS_FROM]->(:Plant)
```

Total entity types: **8 node labels**, **7 relationship types**

---

## Data Source

Raw SAP NDJSON export files covering:
- `customers.json` — Customer master data
- `sales_orders.json` — Sales order headers
- `deliveries.json` — Delivery records (linked via shipping data)
- `billing_documents.json` — Billing/invoice records
- `payments.json` — Payment clearing records
- `journal_entries.json` — FI journal postings
- `products.json` — Material master
- `plants.json` — Shipping plant data

---

## LLM Pipeline Design

```
User NL Question
     ↓
[Guardrail] — block off-topic queries
     ↓
[LLM: Cypher Generation] — system prompt with schema + user query
     ↓
[Cypher Validator] — block write ops (CREATE/DELETE/SET/MERGE)
     ↓
[Neo4j Execution] — run MATCH query
     ↓
[LLM: Answer Generation] — raw results → human-readable sentence/bullets
     ↓
[Frontend] — chat bubble + graph highlight
```

---

## Session Outcomes

- Full graph schema agreed upon
- Tech stack finalized
- Data ingestion pipeline scope defined
- LLM two-call pipeline (Cypher gen + Answer gen) designed
- Project directory structure created
