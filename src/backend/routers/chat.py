# GraphIQ - chat.py
# Chat endpoint implementing the full query pipeline:
# guardrail → cypher generation → cypher validation → neo4j execution → answer generation.

import logging
from fastapi import APIRouter, HTTPException

from src.backend.models.schemas import ChatRequest, ChatResponse
from src.backend.services.guardrails import check_query_allowed, validate_cypher
from src.backend.services.llm_service import generate_cypher, generate_answer
from src.backend.services.neo4j_service import run_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a natural-language question through the full GraphIQ pipeline.

    Pipeline Steps:
        1. Guardrail check — classify query as ALLOWED or BLOCKED.
        2. Cypher generation — use LLM to generate a Cypher query.
        3. Cypher validation — ensure no write operations.
        4. Neo4j execution — run the Cypher query.
        5. Answer generation — produce a human-readable answer.
    """
    user_query = request.query.strip()
    logger.info(f"Chat request: {user_query}")

    # Step 1: Guardrail check
    guard_result = check_query_allowed(user_query)
    if not guard_result["allowed"]:
        logger.info(f"Query blocked by guardrail: {user_query}")
        return ChatResponse(
            answer=guard_result["reason"],
            cypher="",
            raw_results=[],
            allowed=False,
        )

    # Step 2: Generate Cypher
    try:
        cypher = generate_cypher(user_query)
        logger.info(f"Generated Cypher: {cypher}")
    except Exception as e:
        logger.error(f"Cypher generation failed: {e}")
        err_str = str(e)
        if "rate limit" in err_str.lower() or "429" in err_str:
            user_msg = (
                "The AI service is temporarily rate-limited due to high usage. "
                "Please wait 30 seconds and try again."
            )
        else:
            user_msg = (
                "The AI query engine encountered an error. "
                "Please try rephrasing your question."
            )
        return ChatResponse(answer=user_msg, cypher="", raw_results=[], allowed=True)

    # Step 3: Validate Cypher
    validation = validate_cypher(cypher)
    if not validation["valid"]:
        logger.warning(f"Cypher validation failed: {validation['reason']}")
        return ChatResponse(
            answer=f"Generated query was rejected for safety: {validation['reason']}",
            cypher=cypher,
            raw_results=[],
            allowed=True,
        )

    # Step 4: Execute against Neo4j
    try:
        results = run_query(cypher)
        logger.info(f"Neo4j returned {len(results)} rows")
    except Exception as e:
        logger.error(f"Neo4j execution failed: {e}")
        return ChatResponse(
            answer=f"The generated query could not be executed. Please try rephrasing your question.\n\nError: {e}",
            cypher=cypher,
            raw_results=[],
            allowed=True,
        )

    # Step 5: Generate human-readable answer
    try:
        answer = generate_answer(user_query, cypher, results)
    except Exception as e:
        logger.error(f"Answer generation failed: {e}")
        # Still return raw results even if answer generation fails
        answer = f"Query executed successfully with {len(results)} results, but answer generation failed: {e}"

    return ChatResponse(
        answer=answer,
        cypher=cypher,
        raw_results=results,
        allowed=True,
    )
