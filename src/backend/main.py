# GraphIQ - main.py
# FastAPI application entry point with CORS, routers, and lifecycle management.

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.backend.routers import health, graph, chat
from src.backend.services.neo4j_service import close_driver

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def ping_neo4j():
    """Ping Neo4j every 23 hours to prevent free-tier pause."""
    try:
        from src.backend.services.neo4j_service import run_query
        run_query("RETURN 1 AS ping")
        logger.info("Neo4j keep-alive ping successful")
    except Exception as e:
        logger.warning(f"Neo4j keep-alive ping failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: startup and shutdown tasks."""
    logger.info("GraphIQ API starting up...")
    scheduler.add_job(ping_neo4j, "interval", hours=23, id="neo4j_keepalive")
    scheduler.start()
    logger.info("Keep-alive scheduler started (interval: 23h)")
    yield
    logger.info("GraphIQ API shutting down — closing Neo4j driver...")
    scheduler.shutdown()
    close_driver()


app = FastAPI(
    title="GraphIQ API",
    description="Intelligent Order-to-Cash graph analysis API powered by Neo4j and Groq LLM.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(graph.router)
app.include_router(chat.router)


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint confirming the API is running."""
    return {"message": "GraphIQ API is running"}
