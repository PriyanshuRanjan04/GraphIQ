# GraphIQ - llm_service.py
# LLM integration via Groq API for Cypher generation and natural-language answers.
#
# Model strategy (split for best quality + reliability on Groq free tier):
#   Cypher generation  → llama3-8b-8192        (fast, high rate limit, structured task)
#   Answer generation  → llama-3.3-70b-versatile (quality user-facing responses)
#
# Rate limit handling:
#   Retries up to 3 times with exponential backoff on 429 / rate limit errors.

import logging
import re
import time
from pathlib import Path
from groq import Groq, RateLimitError

from src.backend.config import GROQ_API_KEY

logger = logging.getLogger(__name__)

_PROMPTS_DIR  = Path(__file__).resolve().parent.parent / "prompts"
_SYSTEM_PROMPT = (_PROMPTS_DIR / "system_prompt.txt").read_text(encoding="utf-8")
_CYPHER_PROMPT = (_PROMPTS_DIR / "cypher_prompt.txt").read_text(encoding="utf-8")

_client = Groq(api_key=GROQ_API_KEY)

# Models
_MODEL_CYPHER = "llama-3.3-70b-versatile"  # accurate Cypher generation requires the full model
_MODEL_ANSWER = "llama-3.3-70b-versatile"  # premium quality for user-facing answers


_CYPHER_BLOCK_RE = re.compile(r"```(?:cypher)?\s*\n?(.*?)```", re.DOTALL | re.IGNORECASE)

# ─── Retry helper ─────────────────────────────────────────────────────────────
def _call_with_retry(model: str, messages: list, temperature: float, max_tokens: int,
                     max_retries: int = 3, base_delay: float = 2.0) -> str:
    """Call Groq and retry up to max_retries times on rate-limit (429) errors."""
    for attempt in range(max_retries):
        try:
            response = _client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content.strip()
        except RateLimitError as e:
            wait = base_delay * (2 ** attempt)  # 2s, 4s, 8s
            logger.warning(f"Rate limit hit (attempt {attempt + 1}/{max_retries}). "
                           f"Retrying in {wait:.0f}s… Error: {e}")
            if attempt < max_retries - 1:
                time.sleep(wait)
            else:
                raise RuntimeError(
                    "Groq rate limit reached after multiple retries. "
                    "Please wait a moment and try again."
                ) from e
        except Exception as e:
            logger.error(f"LLM call failed on attempt {attempt + 1}: {e}")
            raise RuntimeError(f"LLM call failed: {e}") from e

    raise RuntimeError("LLM call failed after all retries.")


# ─── Cypher Generation ────────────────────────────────────────────────────────
def generate_cypher(user_query: str) -> str:
    """Generate a Cypher query for the given user question.

    Uses a smaller, faster model (llama3-8b-8192) — Cypher is a deterministic
    structured task that doesn't require the large model's reasoning ability.
    """
    prompt = f"{_CYPHER_PROMPT}\n\nQuestion: {user_query}"

    raw = _call_with_retry(
        model=_MODEL_CYPHER,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        temperature=0,
        max_tokens=512,
    )

    logger.info(f"LLM Cypher response (model={_MODEL_CYPHER}):\n{raw}")

    # Extract from ```cypher ... ``` block if present
    match = _CYPHER_BLOCK_RE.search(raw)
    if match:
        return match.group(1).strip()

    # Fallback: return as-is if it looks like Cypher
    if raw.upper().startswith(("MATCH", "OPTIONAL")):
        return raw.strip()

    logger.warning("Could not extract Cypher from LLM response — returning raw.")
    return raw.strip()


# ─── Answer Generation ────────────────────────────────────────────────────────
def generate_answer(user_query: str, cypher: str, results: list) -> str:
    """Generate a human-readable answer from the Neo4j query results.

    Uses the large model (llama-3.3-70b-versatile) for premium quality
    user-facing responses.
    """
    display_results = results[:100]
    results_text = str(display_results) if display_results else "No results found."

    prompt = (
        f"User Question: {user_query}\n\n"
        f"Cypher Query Executed:\n{cypher}\n\n"
        f"Query Results:\n{results_text}\n\n"
        f"Based on these results, provide a clear, concise, and well-formatted answer "
        f"to the user's question. Follow the RESPONSE FORMAT RULES strictly. "
        f"If no results were returned, let the user know politely."
    )

    raw = _call_with_retry(
        model=_MODEL_ANSWER,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.3,
        max_tokens=2048,
    )

    logger.info(f"LLM answer generated (model={_MODEL_ANSWER}), length={len(raw)}")
    return raw
