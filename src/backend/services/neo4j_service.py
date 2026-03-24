# GraphIQ - neo4j_service.py
# Singleton Neo4j driver with query execution and graceful error handling.

import logging
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable, AuthError

from src.backend.config import NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

logger = logging.getLogger(__name__)

_driver = None


def get_driver():
    """Return the singleton Neo4j driver instance, creating it on first call."""
    global _driver
    if _driver is None:
        try:
            _driver = GraphDatabase.driver(
                NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD)
            )
            _driver.verify_connectivity()
            logger.info("Neo4j driver created and connectivity verified.")
        except AuthError as e:
            logger.error(f"Neo4j authentication failed: {e}")
            raise
        except ServiceUnavailable as e:
            logger.error(f"Neo4j service unavailable: {e}")
            raise
        except Exception as e:
            logger.error(f"Failed to create Neo4j driver: {e}")
            raise
    return _driver


def run_query(cypher: str, params: dict | None = None) -> list[dict]:
    """Execute a Cypher query and return results as a list of dictionaries.

    Args:
        cypher: The Cypher query string.
        params: Optional dictionary of query parameters.

    Returns:
        A list of dictionaries, one per result row.
    """
    if params is None:
        params = {}
    driver = get_driver()
    try:
        with driver.session() as session:
            result = session.run(cypher, params)
            return [record.data() for record in result]
    except Exception as e:
        logger.error(f"Neo4j query error: {e}\nCypher: {cypher}\nParams: {params}")
        raise


def close_driver():
    """Close the Neo4j driver and release resources."""
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None
        logger.info("Neo4j driver closed.")
