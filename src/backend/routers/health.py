# GraphIQ - health.py
# Health check endpoint to verify API and Neo4j connectivity.

import logging
from fastapi import APIRouter

from src.backend.models.schemas import HealthResponse
from src.backend.services.neo4j_service import get_driver

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check API health and Neo4j database connectivity."""
    neo4j_connected = False
    try:
        driver = get_driver()
        driver.verify_connectivity()
        neo4j_connected = True
    except Exception as e:
        logger.error(f"Neo4j health check failed: {e}")

    status = "healthy" if neo4j_connected else "degraded"
    return HealthResponse(status=status, neo4j_connected=neo4j_connected)
