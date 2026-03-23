# GraphIQ — Architecture Documentation

## System Overview

GraphIQ translates SAP business data into an interactive Neo4j knowledge graph,
allowing users to query relationships in plain English via an LLM-powered chat interface.

## High-Level Flow

```
User Query (Natural Language)
   ↓
Guardrail Check (off-topic? → reject)
   ↓
LLM (Groq Llama 3 70B) → Cypher Query
   ↓
Cypher Safety Validation (no WRITE ops)
   ↓
Neo4j AuraDB → Query Results
   ↓
LLM → Human-Readable Response
   ↓
Frontend → Chat answer + Graph highlight
```

## Graph Data Model

### Node Labels
- Order
- Delivery
- Invoice
- Payment
- Customer
- Product
- Address

### Relationship Types
- (Order)-[:HAS_DELIVERY]->(Delivery)
- (Delivery)-[:HAS_INVOICE]->(Invoice)
- (Invoice)-[:HAS_PAYMENT]->(Payment)
- (Order)-[:PLACED_BY]->(Customer)
- (Order)-[:CONTAINS]->(Product)

## Component Responsibilities

| Component | File | Role |
|---|---|---|
| Neo4j Service | `neo4j_service.py` | DB connection + Cypher execution |
| LLM Service | `llm_service.py` | Prompt building + Groq API calls |
| Guardrails | `guardrails.py` | Off-topic detection + Cypher safety |
| Graph Service | `graph_service.py` | Format DB results as Cytoscape JSON |
| Chat Router | `routers/chat.py` | /api/chat endpoint |
| Graph Router | `routers/graph.py` | /api/graph endpoint |
