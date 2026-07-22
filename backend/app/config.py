"""PRAHARI — settings: env keys, paths, YAML config loaders."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = BACKEND_DIR / "config"
DATA_DIR = BACKEND_DIR / "data"
REPLAY_DIR = DATA_DIR / "replay"
AUDIT_LOG = DATA_DIR / "audit_log.jsonl"

load_dotenv(BACKEND_DIR / ".env")


class Settings:
    """API keys are optional — every feed degrades gracefully without one (NFR4)."""

    def __init__(self) -> None:
        self.aisstream_key: str = os.getenv("AISSTREAM_API_KEY", "")
        self.eia_key: str = os.getenv("EIA_API_KEY", "")
        self.anthropic_key: str = os.getenv("ANTHROPIC_API_KEY", "")
        self.gdelt_enabled: bool = os.getenv("GDELT_ENABLED", "1") == "1"
        self.record_signals: bool = os.getenv("RECORD_SIGNALS", "1") == "1"
        self.replay_file: str = os.getenv("REPLAY_FILE", "")   # play a recorded window

    @property
    def ais_live(self) -> bool:
        return bool(self.aisstream_key)

    @property
    def eia_live(self) -> bool:
        return bool(self.eia_key)

    @property
    def llm_available(self) -> bool:
        return bool(self.anthropic_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def seed_data() -> dict:
    with open(CONFIG_DIR / "seed_data.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache
def model_config() -> dict:
    with open(CONFIG_DIR / "weights.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


MODEL_VERSION = "prahari-mvp-0.1"
