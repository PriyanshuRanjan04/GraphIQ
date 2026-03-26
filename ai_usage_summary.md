# AI Coding Session Summary — GraphIQ

**Project:** GraphIQ — Order-to-Cash Graph Intelligence  
**Candidate:** Priyanshu Ranjan  
**Submission Date:** March 2026

---

## Claude / Antigravity Usage

**Tool:** Antigravity — powered by **Claude Sonnet 3.5**  
**Interface:** Antigravity AI coding assistant (VS Code integrated)  
**Usage period:** March 23–26, 2026 (entire project lifecycle)

---

### 1. How I Used It

Antigravity (Claude Sonnet 3.5) was my **primary development tool** across all layers of the project — used in a pair-programming style where I described requirements and iterated on the output.

- Used for **architecture design** before writing any code (graph schema, LLM pipeline design, tech stack selection)
- Used to **generate full files** from scratch — backend routers, ingestion scripts, frontend JS modules, Cypher queries, system prompts
- Used to **read and explain errors** from Render logs and Neo4j warnings, then apply targeted fixes
- Used to **review and rewrite** README, session logs, and documentation

Claude's context retention across a long conversation allowed me to reference earlier decisions and build on them without repeating background.

---

### 2. Prompting Workflow

I followed a consistent pattern throughout:

1. **Give context** — describe what already exists and what I want to add  
2. **State exact requirements** — e.g., endpoint name, input/output format, edge cases  
3. **Ask for a full implementation** — not just snippets  
4. **Test it** — run locally or on Render, observe actual output  
5. **Feed back the result** — paste errors or describe unexpected behavior  
6. **Get a targeted fix** — not a full rewrite, just the corrected part

**Example prompts used:**
- *"Create a FastAPI POST /api/chat endpoint with a 5-step pipeline: guardrail → Cypher generation → Cypher validation → Neo4j execution → answer generation. Use Groq Llama 3 70B."*
- *"Write a preprocess.py that reads SAP NDJSON exports and normalizes them into Python dicts. Handle missing fields with None."*
- *"My LLM sometimes returns BLOCKED: with extra text. Fix the guardrail parser to not break on this."*
- *"Migrate all id() Cypher calls to elementId() — here are the Render logs showing the deprecation warning."*

---

### 3. Debugging & Iteration

Claude was especially useful as a **debugging partner** — I'd paste error output or describe wrong behavior and get precise root-cause analysis.

| Problem Encountered | How Claude Helped |
|---|---|
| Nodes created in Neo4j but no relationships | Identified that `deliveries.json` used `SalesOrderNumber` not `order_id` — fixed field mapping in `graph_builder.py` |
| Groq API returning 429 RateLimitError | Suggested exponential backoff: `2s → 4s → 8s` with max 3 retries, implemented in `llm_service.py` |
| LLM generating Cypher with wrong property names | Added an explicit property reference table to `system_prompt.txt` |
| Guardrail regex breaking on verbose LLM output | Refactored to `strip().startswith("ALLOWED")` instead of exact match |
| Neo4j `id()` deprecation warnings flooding Render logs | Identified all 6 affected query locations and migrated to `elementId()` |
| Git merge conflict in README | Explained the conflict markers, resolved by keeping the correct upstream URL |

Each issue was resolved in **1–2 dialogue turns** on average.

---

### 4. Key Improvements Claude Suggested

- **Two-call LLM pipeline** — Instead of one LLM call, Claude recommended separating Cypher generation (temp 0) and answer generation (temp 0.3), which improved both accuracy and response quality
- **Cypher write-op validator** — Suggested adding a regex-based guard blocking `CREATE`, `DELETE`, `SET`, `MERGE`, `DROP` before execution, not just relying on the guardrail prompt
- **Keep-alive ping** — Suggested a 10-minute frontend ping to `/api/health` to prevent Render from cold-starting the backend mid-session
- **`elementId()` migration** — Proactively identified that `id()` was deprecated and would break in future Neo4j versions, not just a warning
- **Response format rules in system prompt** — Suggested encoding exact format rules (1 result = sentence, 2–5 = bullets, 6+ = truncated list) directly in the system prompt to make LLM output consistent

---

### 5. Outcome

Using Antigravity (Claude Sonnet 3.5) across the full project:

- **Reduced development time significantly** — full backend pipeline was functional within 1 session (~4 hours) instead of days
- **Higher code quality** — generated code included error handling, logging, and edge case guards that I would have added later in review
- **Faster debugging** — production issues identified from log output alone, no guesswork
- **Better architecture** — the two-call LLM pipeline and Cypher validator were AI-suggested improvements, not in my original plan
- **Complete documentation** — README, session logs, architecture doc, and this summary were all drafted with AI assistance and then reviewed/edited by me

The AI acted as a senior engineer I could consult at any point — not to replace my decisions, but to accelerate execution and catch issues I might have spent hours tracking down manually.
