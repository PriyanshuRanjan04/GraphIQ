# GraphIQ
> Context Graph System with LLM-Powered Query Interface

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS · Cytoscape.js · Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | Neo4j AuraDB |
| LLM | Groq API — Llama 3 70B |
| Deployment | Vercel (Frontend) · Render (Backend) |

## Architecture

```
Frontend (Vanilla JS + Cytoscape.js)
   ↓
Backend API (FastAPI)
   ↓
Guardrail Layer
   ↓
LLM Layer (Groq Llama 3 70B) → NL to Cypher
   ↓
Neo4j AuraDB → Execute Cypher
   ↓
Response Formatter (LLM) → Human-readable answer
   ↓
Frontend (Chat response + graph highlight)
```

## Setup Instructions

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/GraphIQ.git
cd GraphIQ

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Fill in NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, GROQ_API_KEY

# 5. Ingest data
python src/ingestion/ingest.py

# 6. Start backend
uvicorn src.backend.main:app --reload

# 7. Open frontend
# Open src/frontend/index.html in your browser
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/graph` | Fetch all nodes and edges |
| POST | `/api/chat` | Submit a natural language query |

## LLM Strategy

The LLM (Groq Llama 3 70B) receives:
1. A system prompt with the full graph schema
2. The user's natural language query

It outputs a **Cypher query** which is validated and executed against Neo4j.
The raw results are then sent back to the LLM to generate a human-readable response.

## Guardrails

- Only dataset-related queries are accepted
- LLM-generated Cypher is validated — only `MATCH`/`RETURN` allowed
- Write operations (`CREATE`, `DELETE`, `SET`, `MERGE`) are blocked
- Off-topic queries return: *"This system is designed to answer questions related to the provided dataset only."*
