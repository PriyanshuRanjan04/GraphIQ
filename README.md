# GraphIQ 🔍

**A Graph + LLM system that unifies fragmented business data into a connected graph and lets you query it in plain English.**

---

## 🧠 What Is GraphIQ?

In real-world enterprise systems, data is spread across many entities — Orders, Deliveries, Invoices, Payments — that are related but not easily traceable in traditional tabular formats.

**GraphIQ bridges that gap by:**

- Modelling business data as an **interactive knowledge graph**
- Allowing users to explore entity relationships visually
- Enabling **natural language queries** powered by an LLM
- Translating user intent into **Cypher queries**, executing them on Neo4j, and returning grounded, data-backed answers

---

## 🎯 Key Features

| Feature | Description |
|---|---|
| 📊 **Graph Visualization** | Interactive node/edge explorer built with Cytoscape.js |
| 💬 **Natural Language Queries** | Ask questions like *"Show all incomplete orders"* |
| 🤖 **LLM Query Translation** | Groq Llama 3 70B dynamically generates Cypher from English |
| 🛡️ **Guardrails** | Rejects off-topic, irrelevant, or destructive queries |
| 🔗 **Relationship Tracing** | Follow Order → Delivery → Invoice → Payment chains |

---

## 🏗️ System Architecture

```
Frontend (Vanilla JS + Cytoscape.js)
   ↓
Backend API (FastAPI)
   ↓
Guardrail Layer  →  reject off-topic queries
   ↓
LLM Layer (Groq Llama 3 70B)  →  NL to Cypher
   ↓
Neo4j AuraDB  →  execute Cypher query
   ↓
Response Formatter (LLM)  →  human-readable answer
   ↓
Frontend (Chat response + graph highlight)
```

### Graph Data Model

**Nodes:** `Order` · `Delivery` · `Invoice` · `Payment` · `Customer` · `Product` · `Address`

**Edges:**
- `Order → Delivery`
- `Delivery → Invoice`
- `Invoice → Payment`
- `Order → Customer`
- `Order Item → Product`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS · Cytoscape.js · Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | Neo4j AuraDB |
| Query Language | Cypher |
| LLM | Groq API — Llama 3 70B |
| Data Ingestion | Python · Pandas |
| Deployment | Vercel (Frontend) · Render (Backend) |

---

## 📁 Project Structure

```
graphiq/
├── src/
│   ├── frontend/
│   │   ├── index.html
│   │   ├── style.css
│   │   └── js/
│   │       ├── graph.js        # Cytoscape graph rendering
│   │       ├── chat.js         # Chat interface logic
│   │       ├── api.js          # API calls
│   │       └── utils.js
│   ├── backend/
│   │   ├── main.py             # FastAPI entry point
│   │   ├── config.py           # Env vars
│   │   ├── routers/            # /api/graph, /api/chat, /api/health
│   │   ├── services/           # Neo4j, LLM, graph formatting, guardrails
│   │   ├── prompts/            # System & Cypher prompt templates
│   │   └── models/schemas.py   # Pydantic models
│   └── ingestion/
│       ├── ingest.py           # CSV → Neo4j loader
│       ├── preprocess.py       # Data cleaning
│       └── graph_builder.py    # Node/edge definition
├── data/
│   ├── raw/                    # Original CSVs
│   └── processed/              # Cleaned CSVs
├── sessions/                   # AI session logs
├── docs/architecture.md
├── .env.example
├── requirements.txt
└── README.md
```

---

## ⚙️ Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/GraphIQ.git
cd GraphIQ
```

### 2. Create a virtual environment & install dependencies
```bash
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment variables
```bash
cp .env.example .env
```
Fill in `.env` with your credentials:
```
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=
GROQ_API_KEY=
```

### 4. Ingest data into Neo4j
```bash
python src/ingestion/ingest.py
```

### 5. Start the backend
```bash
uvicorn src.backend.main:app --reload
```

### 6. Open the frontend
Open `src/frontend/index.html` in your browser.

---

## 🛡️ Guardrails

The system enforces strict query boundaries:

- ✅ Accepts only dataset-related questions
- ❌ Rejects general knowledge, creative writing, and irrelevant prompts
- ❌ Blocks any LLM-generated Cypher containing write/delete operations

> *"This system is designed to answer questions related to the provided dataset only."*

---

## 💬 Example Queries

```
"Which orders are incomplete?"
"Trace the flow of invoice INV-1042"
"Which products appear in the most orders?"
"Show all payments linked to customer C-204"
```

---

## 📦 Dependencies

```
fastapi
uvicorn
neo4j
groq
pandas
python-dotenv
pydantic
```

---

## 📄 License

MIT License

---

*Built as part of a technical assignment demonstrating Graph + LLM system design.*
