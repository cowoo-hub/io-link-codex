"""Configuration helpers for selecting simulator or real-device mode."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _read_bool_env(name: str, default: bool) -> bool:
    """Parse common truthy/falsy environment variable values."""
    raw_value = os.getenv(name)

    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()

    if normalized in {"1", "true", "yes", "on"}:
        return True

    if normalized in {"0", "false", "no", "off"}:
        return False

    return default


@dataclass(slots=True)
class AppSettings:
    """
    Runtime settings for the backend.

    Simulator-first mode is the default so frontend work can start immediately.
    When a real ICE2 is available, set USE_SIMULATOR=false and the same API
    routes will use the Modbus backend instead.
    """

    use_simulator: bool = True

    @property
    def backend_mode(self) -> str:
        return "simulator" if self.use_simulator else "modbus"


def load_settings() -> AppSettings:
    """Load settings from environment variables."""
    return AppSettings(use_simulator=_read_bool_env("USE_SIMULATOR", default=True))
