"""FastAPI entry point for high-speed cached ICE2 IO-Link monitoring."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from config import AppSettings, load_settings
from converters import SupportedDataType, WordOrder, convert_register_value, registers_to_bytes
from modbus_core import (
    BackendMode,
    HEADER_WORD_COUNT,
    ICE2Backend,
    ICE2ModbusClient,
    ModbusConnectionConfig,
    PDIBlockMode,
    build_port_pdi_base0_address,
    build_port_pdi_base1_address,
    parse_pdi_header,
    validate_port,
)
from polling import PDICacheWorker
from simulator import ICE2Simulator

logger = logging.getLogger("ice2.backend.app")


class ConnectRequest(BaseModel):
    """Connection settings stored as the default local development target."""

    mode: BackendMode = Field(
        "real",
        description="Backend runtime mode: real Modbus TCP or simulator fallback",
    )
    host: str = Field(..., description="ICE2 IP address or hostname")
    port: int = Field(502, ge=1, le=65535, description="Modbus TCP port")
    slave_id: int = Field(1, ge=0, le=255, description="Modbus unit/slave ID")
    timeout: float = Field(3.0, gt=0, description="Request timeout in seconds")
    retries: int = Field(1, ge=0, description="PyModbus retry count")


class ConvertRequest(BaseModel):
    """Ad-hoc payload conversion request for quick testing from Swagger or VS Code."""

    registers: list[int] = Field(..., min_length=1, description="Raw 16-bit registers to decode")
    data_type: SupportedDataType
    word_offset: int = Field(0, ge=0, description="Starting register offset")
    word_length: int | None = Field(
        None,
        ge=1,
        description="Optional register length for binary conversion",
    )
    word_order: WordOrder = Field(
        "big",
        description="Use little for devices that publish 32-bit values in swapped register order",
    )


def _create_backend(connection: ModbusConnectionConfig) -> ICE2Backend:
    """
    Create the active ICE2 backend.

    The polling worker and API layer both call only this factory so simulator
    mode and future real hardware mode stay interchangeable.
    """
    if connection.mode == "simulator":
        return ICE2Simulator(connection)
    return ICE2ModbusClient(connection)


def _build_pdi_response(
    connection: ModbusConnectionConfig,
    port: int,
    block_mode: PDIBlockMode,
    payload_word_count: int,
    registers: list[int],
    convert_as: SupportedDataType | None = None,
    word_offset: int = 0,
    word_length: int | None = None,
    word_order: WordOrder = "big",
) -> dict[str, object]:
    """Parse a raw PDI register block into the response shape used by the API."""
    header = parse_pdi_header(registers)
    payload_words = registers[HEADER_WORD_COUNT:]
    payload_bytes = registers_to_bytes(payload_words)

    response: dict[str, object] = {
        "connection": connection.to_dict(),
        "port": port,
        "pdi_block": {
            "mode": block_mode,
            "base1_address": build_port_pdi_base1_address(port=port, block_mode=block_mode),
            "base0_address": build_port_pdi_base0_address(port=port, block_mode=block_mode),
            "header_word_count": HEADER_WORD_COUNT,
            "payload_word_count": payload_word_count,
            "total_word_count": len(registers),
        },
        "header": header,
        "payload": {
            "registers": payload_words,
            "hex": payload_bytes.hex(" ").upper(),
        },
    }

    if convert_as is not None:
        response["conversion"] = {
            "data_type": convert_as,
            "word_offset": word_offset,
            "word_length": word_length,
            "word_order": word_order,
            "value": convert_register_value(
                payload_words,
                data_type=convert_as,
                word_offset=word_offset,
                word_length=word_length,
                word_order=word_order,
            ),
        }

    return response


def _build_cached_port_snapshot(
    connection: ModbusConnectionConfig,
    port: int,
    block_mode: PDIBlockMode,
    payload_word_count: int,
    registers: list[int],
) -> dict[str, object]:
    """Polling-worker adapter for storing parsed snapshots without conversions."""
    return _build_pdi_response(
        connection=connection,
        port=port,
        block_mode=block_mode,
        payload_word_count=payload_word_count,
        registers=registers,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start and stop the shared background polling worker with the app."""
    settings = load_settings()
    app.state.settings = settings
    app.state.connection_config = None
    app.state.polling_worker = PDICacheWorker(
        backend_factory=_create_backend,
        snapshot_builder=_build_cached_port_snapshot,
        default_mode=settings.default_mode,
        poll_interval_ms=settings.poll_interval_ms,
        stale_after_ms=settings.stale_after_ms,
        reconnect_base_ms=settings.reconnect_base_ms,
        reconnect_max_ms=settings.reconnect_max_ms,
        history_retention_ms=settings.history_retention_ms,
        history_max_points=settings.history_max_points,
        payload_word_count=settings.payload_word_count,
        block_mode=settings.block_mode,
    )
    app.state.polling_worker.start()

    try:
        yield
    finally:
        app.state.polling_worker.stop()


app = FastAPI(
    title="ICE2 IO-Link Master Backend",
    version="0.3.0",
    lifespan=lifespan,
    description=(
        "High-speed cached FastAPI backend for ICE2 IO-Link PDI monitoring. "
        "The backend now polls simulator or Modbus TCP data in the background, "
        "stores the latest parsed state in memory, and serves both single-port "
        "and all-port views from cache for responsive industrial UI updates."
    ),
)


def _get_settings() -> AppSettings:
    return app.state.settings


def _get_runtime_mode() -> BackendMode:
    connection = app.state.connection_config
    if connection is not None:
        return connection.mode
    return _get_settings().default_mode


def _get_saved_connection() -> ModbusConnectionConfig:
    config = app.state.connection_config
    if config is None:
        raise HTTPException(
            status_code=400,
            detail="No ICE2 target is configured. Call POST /connect first.",
        )
    return config


def _get_cached_port_or_raise(port: int) -> dict[str, object]:
    validate_port(port)
    cached_snapshot = app.state.polling_worker.get_port_snapshot(port)

    if cached_snapshot is not None:
        return cached_snapshot

    _get_saved_connection()
    raise HTTPException(
        status_code=503,
        detail="Cached PDI data is not ready yet. Wait for the background poller to complete its first cycle.",
    )


def _validate_cache_shape(
    payload_word_count: int,
    block_mode: PDIBlockMode,
) -> None:
    settings = _get_settings()

    if payload_word_count != settings.payload_word_count:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cached polling is configured for "
                f"payload_word_count={settings.payload_word_count}. "
                "Adjust PDI_PAYLOAD_WORD_COUNT and restart the backend to change it."
            ),
        )

    if block_mode != settings.block_mode:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cached polling is configured for block_mode='{settings.block_mode}'. "
                "Adjust PDI_BLOCK_MODE and restart the backend to change it."
            ),
        )


@app.get("/")
def root() -> dict[str, object]:
    """Small landing response so local development starts with a friendly summary."""
    settings = _get_settings()
    polling = app.state.polling_worker.get_status()

    return {
        "service": "ICE2 IO-Link Master Backend",
        "phase": "2",
        "backend_mode": _get_runtime_mode(),
        "default_mode": settings.default_mode,
        "use_simulator": settings.use_simulator,
        "polling": polling.to_dict(),
        "docs": "/docs",
        "features_ready_now": [
            "Background PDI polling cache",
            "Bulk cached all-port PDI reads",
            "Bulk cached all-port history reads",
            "Single-port cached PDI access",
            "Header parsing and value conversion",
        ],
        "future_ready_for": [
            "ISDU services",
            "MQTT publishing",
            "AI diagnostics",
            "Industrial UI",
        ],
    }


@app.get("/health")
def health() -> dict[str, object]:
    """Basic health endpoint for local checks and future container probes."""
    settings = _get_settings()
    polling = app.state.polling_worker.get_status()

    return {
        "status": "ok",
        "phase": "2",
        "backend_mode": _get_runtime_mode(),
        "default_mode": settings.default_mode,
        "poll_interval_ms": settings.poll_interval_ms,
        "stale_after_ms": settings.stale_after_ms,
        "reconnect_base_ms": settings.reconnect_base_ms,
        "reconnect_max_ms": settings.reconnect_max_ms,
        "history_retention_ms": settings.history_retention_ms,
        "history_max_points": settings.history_max_points,
        "cache_running": polling.running,
        "cache_updated_at": polling.updated_at,
        "last_successful_poll_at": polling.last_successful_poll_at,
        "cache_is_stale": polling.is_stale,
        "communication_state": polling.communication_state,
        "last_error": polling.last_error,
    }


@app.get("/connection")
def get_connection() -> dict[str, object]:
    """Return the currently saved local development target."""
    config = app.state.connection_config
    polling = app.state.polling_worker.get_status()
    return {
        "configured": config is not None,
        "connection": None if config is None else config.to_dict(),
        "polling": polling.to_dict(),
    }


@app.post("/connect")
def connect_to_ice2(request: ConnectRequest) -> dict[str, object]:
    """
    Validate connectivity and store the default ICE2 target.

    The background poller takes over once the target is saved, which separates
    fast device reads from slower UI refreshes.
    """
    connection = ModbusConnectionConfig(**request.model_dump())
    logger.info(
        "Received connect request: mode=%s host=%s port=%s slave_id=%s timeout=%s retries=%s",
        connection.mode,
        connection.host,
        connection.port,
        connection.slave_id,
        connection.timeout,
        connection.retries,
    )

    try:
        with _create_backend(connection):
            pass
    except ConnectionError as exc:
        logger.warning(
            "Connect failed for mode=%s host=%s port=%s: %s",
            connection.mode,
            connection.host,
            connection.port,
            exc,
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "Unexpected connect failure for mode=%s host=%s",
            connection.mode,
            connection.host,
        )
        raise HTTPException(status_code=500, detail=f"Unexpected connect failure: {exc}") from exc

    app.state.connection_config = connection
    app.state.polling_worker.update_connection(connection)
    logger.info(
        "Connect succeeded: mode=%s host=%s port=%s slave_id=%s",
        connection.mode,
        connection.host,
        connection.port,
        connection.slave_id,
    )

    return {
        "connected": True,
        "message": (
            "Simulator session is ready and the high-speed polling cache is warming up."
            if connection.mode == "simulator"
            else "Connection test succeeded and the high-speed polling cache is warming up."
        ),
        "connection": connection.to_dict(),
    }


@app.post("/disconnect")
def disconnect_target() -> dict[str, object]:
    """Clear the saved target and stop background polling for intentional disconnects."""
    previous_connection = app.state.connection_config

    app.state.connection_config = None
    app.state.polling_worker.update_connection(None)

    if previous_connection is None:
        logger.info("Disconnect requested with no active target configured")
        return {
            "disconnected": True,
            "message": "No active target was configured. The polling worker remains idle.",
            "connection": None,
        }

    logger.info(
        "Disconnect succeeded: mode=%s host=%s port=%s slave_id=%s",
        previous_connection.mode,
        previous_connection.host,
        previous_connection.port,
        previous_connection.slave_id,
    )
    return {
        "disconnected": True,
        "message": "The active ICE2 target was cleared and the background polling worker has been idled.",
        "connection": previous_connection.to_dict(),
    }


@app.get("/ports/all/pdi")
def read_all_ports_pdi() -> dict[str, object]:
    """Return the latest cached PDI snapshot for all ports."""
    return app.state.polling_worker.get_all_ports_snapshot()


@app.get("/ports/all/history")
def read_all_ports_history(
    window_ms: int | None = Query(
        None,
        ge=1000,
        description="Optional rolling history window in milliseconds",
    ),
    max_points: int | None = Query(
        None,
        ge=10,
        le=1000,
        description="Optional cap for returned samples per port",
    ),
) -> dict[str, object]:
    """Return cached rolling history for all ports."""
    return app.state.polling_worker.get_all_ports_history(
        window_ms=window_ms,
        max_points=max_points,
    )


@app.get("/ports/{port}/pdi")
def read_port_pdi(
    port: int,
    payload_word_count: int = Query(
        16,
        ge=0,
        le=123,
        description="Number of payload registers to read after the fixed two-word header",
    ),
    block_mode: Literal["multiple", "specific"] = Query(
        "multiple",
        description="ICE2 Modbus PDI block address flavor",
    ),
    convert_as: SupportedDataType | None = Query(
        None,
        description="Optional payload conversion type",
    ),
    word_offset: int = Query(0, ge=0, description="Payload register offset for conversion"),
    word_length: int | None = Query(
        None,
        ge=1,
        description="Optional register length for binary conversion",
    ),
    word_order: WordOrder = Query(
        "big",
        description="Register order for 32-bit or binary payload conversion",
    ),
) -> dict[str, object]:
    """
    Return the cached port PDI block, parse the header, and optionally decode a value.

    This route now serves from the in-memory polling cache instead of triggering
    a fresh device read on each request.
    """
    _validate_cache_shape(payload_word_count=payload_word_count, block_mode=block_mode)
    cached_snapshot = _get_cached_port_or_raise(port)

    if convert_as is None:
        return cached_snapshot

    try:
        payload_words = cached_snapshot["payload"]["registers"]
        if not isinstance(payload_words, list):
            raise ValueError("Cached payload registers are unavailable")

        cached_snapshot["conversion"] = {
            "data_type": convert_as,
            "word_offset": word_offset,
            "word_length": word_length,
            "word_order": word_order,
            "value": convert_register_value(
                payload_words,
                data_type=convert_as,
                word_offset=word_offset,
                word_length=word_length,
                word_order=word_order,
            ),
        }
        return cached_snapshot
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/ports/{port}/history")
def read_port_history(
    port: int,
    window_ms: int | None = Query(
        None,
        ge=1000,
        description="Optional rolling history window in milliseconds",
    ),
    max_points: int | None = Query(
        None,
        ge=10,
        le=1000,
        description="Optional cap for returned samples",
    ),
) -> dict[str, object]:
    """Return cached rolling history for one port."""
    validate_port(port)
    return app.state.polling_worker.get_port_history(
        port=port,
        window_ms=window_ms,
        max_points=max_points,
    )


@app.post("/convert")
def convert_registers(request: ConvertRequest) -> dict[str, object]:
    """Convert raw registers into one of the supported value types."""
    try:
        value = convert_register_value(
            request.registers,
            data_type=request.data_type,
            word_offset=request.word_offset,
            word_length=request.word_length,
            word_order=request.word_order,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "data_type": request.data_type,
        "word_offset": request.word_offset,
        "word_length": request.word_length,
        "word_order": request.word_order,
        "registers": request.registers,
        "hex": registers_to_bytes(request.registers).hex(" ").upper(),
        "value": value,
    }
