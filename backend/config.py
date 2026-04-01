"""Configuration helpers for selecting real or simulator runtime defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass

from modbus_core import BackendMode, DEFAULT_PAYLOAD_WORD_COUNT, PDIBlockMode


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


def _read_int_env(
    name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    """Parse integer environment values with safe bounds."""
    raw_value = os.getenv(name)

    if raw_value is None:
        value = default
    else:
        try:
            value = int(raw_value.strip())
        except ValueError:
            value = default

    if minimum is not None:
        value = max(minimum, value)

    if maximum is not None:
        value = min(maximum, value)

    return value


def _read_block_mode_env(name: str, default: PDIBlockMode) -> PDIBlockMode:
    """Limit block mode configuration to the supported ICE2 values."""
    raw_value = os.getenv(name)

    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()
    if normalized in {"multiple", "specific"}:
        return normalized

    return default


def _read_mode_env(name: str, default: BackendMode) -> BackendMode:
    """Parse the default backend runtime mode."""
    raw_value = os.getenv(name)

    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()
    if normalized in {"real", "simulator"}:
        return normalized

    return default


@dataclass(slots=True)
class AppSettings:
    """
    Runtime settings for the backend.

    Real-device-first mode is now the default. Simulator mode remains available
    as an explicit fallback for development and recovery work.
    """

    default_mode: BackendMode = "real"
    poll_interval_ms: int = 50
    stale_after_ms: int = 250
    reconnect_base_ms: int = 250
    reconnect_max_ms: int = 5000
    history_retention_ms: int = 120000
    history_max_points: int = 120
    payload_word_count: int = DEFAULT_PAYLOAD_WORD_COUNT
    block_mode: PDIBlockMode = "multiple"

    @property
    def backend_mode(self) -> str:
        return self.default_mode

    @property
    def use_simulator(self) -> bool:
        """Backward-compatible view for older helper code."""
        return self.default_mode == "simulator"


def load_settings() -> AppSettings:
    """Load settings from environment variables."""
    poll_interval_ms = _read_int_env(
        "PDI_POLL_INTERVAL_MS",
        default=50,
        minimum=10,
    )

    default_mode = _read_mode_env(
        "ICE2_DEFAULT_MODE",
        default="simulator" if _read_bool_env("USE_SIMULATOR", default=False) else "real",
    )

    return AppSettings(
        default_mode=default_mode,
        poll_interval_ms=poll_interval_ms,
        stale_after_ms=_read_int_env(
            "PDI_STALE_AFTER_MS",
            default=max(250, poll_interval_ms * 4),
            minimum=poll_interval_ms,
        ),
        reconnect_base_ms=_read_int_env(
            "PDI_RECONNECT_BASE_MS",
            default=max(250, poll_interval_ms * 5),
            minimum=poll_interval_ms,
        ),
        reconnect_max_ms=_read_int_env(
            "PDI_RECONNECT_MAX_MS",
            default=5000,
            minimum=max(250, poll_interval_ms * 5),
        ),
        history_retention_ms=_read_int_env(
            "PDI_HISTORY_RETENTION_MS",
            default=120000,
            minimum=max(5000, poll_interval_ms * 20),
        ),
        history_max_points=_read_int_env(
            "PDI_HISTORY_MAX_POINTS",
            default=120,
            minimum=10,
            maximum=1000,
        ),
        payload_word_count=_read_int_env(
            "PDI_PAYLOAD_WORD_COUNT",
            default=DEFAULT_PAYLOAD_WORD_COUNT,
            minimum=0,
            maximum=123,
        ),
        block_mode=_read_block_mode_env("PDI_BLOCK_MODE", default="multiple"),
    )
