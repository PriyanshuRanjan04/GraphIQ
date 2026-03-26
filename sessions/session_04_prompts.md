# Session 04 — Prompt Engineering & LLM Optimization

**Date:** March 26, 2026
**Focus:** System prompt design, Cypher prompt, response format rules, guardrail tuning

---

## Objective

Design and iterate on the prompts that drive the two LLM calls:
Cypher generation and human-readable answer generation.
Ensure consistent, clean, business-appropriate output across all query types.

---

## System Prompt (`src/backend/prompts/system_prompt.txt`)

The system prompt is shared across both LLM calls. It contains:

### 1. Role Definition
```
You are GraphIQ, an intelligent business data analyst for SAP Order-to-Cash data.
You answer questions about customers, sales orders, deliveries, billing documents, payments, and journal entries.
```

### 2. Graph Schema (injected into every call)
Full listing of all 8 node labels, their key properties, and all 7 relationship types.
This grounds the LLM in the exact data model so it generates valid Cypher.

### 3. Behavioral Rules
- Never mention "Cypher query", "dataset", or "query results" in answers
- Never say "I cannot" — always attempt to answer
- Format currency: `₹17,108.25 INR`
- Format dates: `2 Apr 2025` (not ISO timestamp)

### 4. Response Format Rules (strict)
```
Rule 1: SINGLE RESULT (1 record)   → one clean sentence, no bullets
Rule 2: SMALL LIST  (2–5 records)  → bullet points only, no table, max one intro line
Rule 3: LARGE LIST  (6+ records)   → all bullets (frontend handles collapse to 5+dropdown)

STRICT BANS:
- NEVER show bullets AND a markdown table for the same data
- NEVER say "Alternatively..."
- NEVER say "the results can be presented..."
- Keep any intro to ONE line maximum
```

---

## Cypher Prompt (`src/backend/prompts/cypher_prompt.txt`)

Separate prompt used only for Cypher generation call. Contains:

- Explicit schema with exact property names (e.g. `order_value`, `customer_name`)
- Example Cypher queries for each entity type
- Instructions to return ONLY the Cypher — no explanation text
- Instruction to use `OPTIONAL MATCH` for "find records with/without X" pattern
- Instruction to `LIMIT 100` on large scans to avoid Neo4j timeout

### Example Cypher patterns baked into the prompt
```cypher
// Customer with most orders
MATCH (c:Customer)-[:PLACED]->(s:SalesOrder)
RETURN c.customer_name, count(s) AS order_count
ORDER BY order_count DESC LIMIT 1

// Orders with no billing documents
MATCH (s:SalesOrder)
WHERE NOT (s)-[:HAS_BILLING]->(:BillingDocument)
RETURN s.order_id, s.order_value, s.order_date
```

---

## Guardrail Prompt

Used to classify user queries before any LLM or Neo4j call.
Returns `{"allowed": true}` or `{"allowed": false, "reason": "..."}`.

Blocked query examples caught during testing:
- "Write me a Python script" → BLOCKED
- "What is the weather in Mumbai?" → BLOCKED
- "Tell me a joke" → BLOCKED
- "Who is the customer with ID C-100?" → ALLOWED
- "Trace order 740584" → ALLOWED

---

## Iteration Log

| Issue Observed | Prompt Fix Applied |
|---|---|
| LLM showing bullets AND a table for same data | Added explicit "NEVER show bullet list AND markdown table" rule |
| LLM starting answers with "Alternatively, the data can be shown as..." | Added "NEVER say Alternatively..." ban |
| LLM adding verbose explanation after bullet list | Added "NEVER add verbose explanation after the data" |
| LLM returning ISO dates (2025-04-02T00:00:00) | Added date formatting rule |
| LLM not using ₹ symbol | Added currency formatting rule |
| Cypher missing LIMIT causing slow queries | Added LIMIT 100 instruction to cypher_prompt |
| Small 8b model generating wrong Cypher (0 results) | Reverted Cypher model to llama-3.3-70b-versatile |

---

## Rate Limit Handling

Groq free tier: ~6,000 tokens/minute for `llama-3.3-70b-versatile`.
Each chat query consumes ~3,000 tokens (Cypher call) + ~3,000 tokens (answer call).

Mitigation:
1. Retry with exponential backoff (2s → 4s → 8s) on `RateLimitError`
2. Cypher `max_tokens` reduced to 512 (queries are short, saves quota)
3. Answer `max_tokens` kept at 2048 for full response quality
4. Frontend shows specific "rate-limited" message to user when all retries exhausted

---

## Session Outcomes

- System prompt finalized with strict response format rules
- Cypher prompt tuned with schema, examples, and LIMIT instruction
- Guardrail prompt handles off-topic classification reliably
- Rate limit retry logic implemented
- All LLM output going through frontend sanitization pipeline
