# GraphIQ - graph.py
# Graph visualization endpoints for full graph export and node exploration.

import logging
from fastapi import APIRouter, HTTPException

from src.backend.models.schemas import GraphResponse
from src.backend.services.graph_service import get_full_graph, get_node_with_neighbors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/graph", tags=["Graph"])


@router.get("", response_model=GraphResponse)
async def get_graph():
    """Return the full graph in Cytoscape.js-compatible JSON format."""
    try:
        graph = get_full_graph()
        return GraphResponse(nodes=graph["nodes"], edges=graph["edges"])
    except Exception as e:
        logger.error(f"Graph export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export graph: {e}")


@router.get("/node/{node_id}", response_model=GraphResponse)
async def get_node(node_id: str):
    """Return a single node and all of its direct neighbors.

    Args:
        node_id: The id property of the node to expand (e.g., '740506').
    """
    try:
        subgraph = get_node_with_neighbors(node_id)
        if not subgraph["nodes"]:
            raise HTTPException(status_code=404, detail=f"Node with id '{node_id}' not found.")
        return GraphResponse(nodes=subgraph["nodes"], edges=subgraph["edges"])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Node fetch failed for '{node_id}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch node: {e}")
