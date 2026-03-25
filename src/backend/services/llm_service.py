# GraphIQ - llm_service.py
# LLM integration via Groq API for Cypher generation and natural-language answers.

import logging
import re
from pathlib import Path
from groq import Groq

from src.backend.config import GROQ_API_KEY

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_SYSTEM_PROMPT = (_PROMPTS_DIR / "system_prompt.txt").read_text(encoding="utf-8")
_CYPHER_PROMPT = (_PROMPTS_DIR / "cypher_prompt.txt").read_text(encoding="utf-8")

_client = Groq(api_key=GROQ_API_KEY)

_CYPHER_BLOCK_RE = re.compile(r"```(?:cypher)?\s*\n?(.*?)```", re.DOTALL | re.IGNORECASE)


def generate_cypher(user_query: str) -> str:
    """Generate a Cypher query for the given user question using the LLM.

    Args:
        user_query: The natural-language question from the user.

    Returns:
        A clean Cypher query string ready for execution.
    """
    prompt = f"{_CYPHER_PROMPT}\n\nQuestion: {user_query}"

    try:
        response = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=1024,
        )
        raw = response.choices[0].message.content.strip()
        logger.info(f"LLM raw Cypher response:\n{raw}")

        # Extract Cypher from code block if present
        match = _CYPHER_BLOCK_RE.search(raw)
        if match:
            return match.group(1).strip()

        # Fallback: return entire response if it looks like Cypher
        if raw.upper().startswith("MATCH") or raw.upper().startswith("OPTIONAL"):
            return raw.strip()

        logger.warning("Could not extract Cypher from LLM response.")
        return raw.strip()

    except Exception as e:
        logger.error(f"Cypher generation failed: {e}")
        raise RuntimeError(f"Failed to generate Cypher query: {e}")


def generate_answer(user_query: str, cypher: str, results: list) -> str:
    """Generate a human-readable answer from the query results using the LLM.

    Args:
        user_query: The original user question.
        cypher: The Cypher query that was executed.
        results: The list of result dictionaries from Neo4j.

    Returns:
        A natural-language answer string.
    """
    # Truncate results to avoid exceeding token limits
    display_results = results[:100]
    results_text = str(display_results) if display_results else "No results found."

    prompt = (
        f"User Question: {user_query}\n\n"
        f"Cypher Query Executed:\n{cypher}\n\n"
        f"Query Results:\n{results_text}\n\n"
        f"Based on these results, provide a clear, concise, and well-formatted answer "
        f"to the user's question. Use tables or bullet points where appropriate. "
        f"If no results were returned, let the user know politely."
    )

    try:
        response = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"Answer generation failed: {e}")
        raise RuntimeError(f"Failed to generate answer: {e}")
