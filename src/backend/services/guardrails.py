# GraphIQ - guardrails.py
# Query classification and Cypher validation to enforce safety boundaries.

import logging
import re
from groq import Groq
from pathlib import Path

from src.backend.config import GROQ_API_KEY

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_GUARDRAIL_PROMPT = (_PROMPTS_DIR / "guardrail_prompt.txt").read_text(encoding="utf-8")

_FORBIDDEN_KEYWORDS = re.compile(
    r"\b(CREATE|DELETE|DETACH|SET|MERGE|DROP|REMOVE|CALL)\b", re.IGNORECASE
)

_client = Groq(api_key=GROQ_API_KEY)


def check_query_allowed(query: str) -> dict:
    """Classify a user query as ALLOWED or BLOCKED using the LLM guardrail.

    Args:
        query: The raw user question.

    Returns:
        {"allowed": bool, "reason": str}
    """
    try:
        response = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _GUARDRAIL_PROMPT},
                {"role": "user", "content": f'Query: "{query}"\nClassification:'},
            ],
            temperature=0,
            max_tokens=10,
        )
        classification = response.choices[0].message.content.strip().upper()
        allowed = "ALLOWED" in classification

        if allowed:
            return {"allowed": True, "reason": "Query is related to the Order-to-Cash dataset."}
        else:
            return {
                "allowed": False,
                "reason": "This system is designed to answer questions related to the Order-to-Cash dataset only.",
            }
    except Exception as e:
        logger.error(f"Guardrail check failed: {e}")
        # Fail-open: allow the query through if guardrail service is down
        return {"allowed": True, "reason": f"Guardrail check unavailable: {e}"}


def validate_cypher(cypher: str) -> dict:
    """Validate that a Cypher query contains no forbidden write operations.

    Args:
        cypher: The Cypher query string to validate.

    Returns:
        {"valid": bool, "reason": str}
    """
    if not cypher or not cypher.strip():
        return {"valid": False, "reason": "Empty Cypher query."}

    match = _FORBIDDEN_KEYWORDS.search(cypher)
    if match:
        keyword = match.group(0).upper()
        return {
            "valid": False,
            "reason": f"Cypher query contains forbidden keyword: {keyword}. Only read operations are allowed.",
        }

    return {"valid": True, "reason": "Cypher query is safe to execute."}
