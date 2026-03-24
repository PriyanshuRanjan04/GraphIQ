# GraphIQ - config.py
# Loads environment variables and exports application constants.

import os
from dotenv import load_dotenv

load_dotenv()


def _require(var_name: str) -> str:
    """Return the value of an environment variable, or raise if missing."""
    value = os.getenv(var_name)
    if not value:
        raise EnvironmentError(
            f"Missing required environment variable: {var_name}. "
            f"Please set it in your .env file."
        )
    return value


NEO4J_URI: str = _require("NEO4J_URI")
NEO4J_USERNAME: str = _require("NEO4J_USERNAME")
NEO4J_PASSWORD: str = _require("NEO4J_PASSWORD")
GROQ_API_KEY: str = _require("GROQ_API_KEY")
