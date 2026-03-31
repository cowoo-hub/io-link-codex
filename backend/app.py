"""FastAPI entry point for a Phase 1 ICE2 IO-Link Master backend."""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from config import load_settings
from converters import SupportedDataType, WordOrder, convert_register_value, registers_to_bytes
from modbus_core import (
    DEFAULT_PAYLOAD_WORD_COUNT,
    HEADER_WORD_COUNT,
    ICE2Backend,
    ICE2ModbusClient,
    ModbusConnectionConfig,
    ModbusReadError,
    PDIBlockMode,
    build_port_pdi_base0_address,
    build_port_pdi_base1_address,
    parse_pdi_header,
)
from simulator import ICE2Simulator


class ConnectRequest(BaseModel):
    """Connection settings stored as the default local development target."""

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


app = FastAPI(
    title="ICE2 IO-Link Master Backend",
    version="0.2.0",
    description=(
        "Phase 1 FastAPI backend for reading ICE2 IO-Link PDI data. "
        "The project supports simulator-first local development now and keeps the same API "
        "ready for real Modbus TCP hardware later, plus future ISDU, MQTT, AI diagnostics, "
        "and industrial UI layers."
    ),
)

app.state.settings = load_settings()
# The active target is still stored in memory for simple local development.
app.state.connection_config = None


def _get_saved_connection() -> ModbusConnectionConfig:
    config = app.state.connection_config
    if config is None:
        raise HTTPException(
            status_code=400,
            detail="No ICE2 target is configured. Call POST /connect first.",
        )
    return config


def _create_backend(connection: ModbusConnectionConfig) -> ICE2Backend:
    """
    Create the active ICE2 backend.

    The FastAPI routes call only this factory, which keeps simulator and real
    device switching small and predictable.
    """
    if app.state.settings.use_simulator:
        return ICE2Simulator(connection)
    return ICE2ModbusClient(connection)


def _build_pdi_response(
    connection: ModbusConnectionConfig,
    port: int,
    block_mode: PDIBlockMode,
    payload_word_count: int,
    registers: list[int],
    convert_as: SupportedDataType | None,
    word_offset: int,
    word_length: int | None,
    word_order: WordOrder,
) -> dict[str, object]:
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


@app.get("/")
def root() -> dict[str, object]:
    """Small landing response so local development starts with a friendly summary."""
    return {
        "service": "ICE2 IO-Link Master Backend",
        "phase": "Phase 1",
        "backend_mode": app.state.settings.backend_mode,
        "use_simulator": app.state.settings.use_simulator,
        "docs": "/docs",
        "features_ready_now": [
            "Connect to ICE2 over simulator or Modbus TCP",
            "Read PDI by port",
            "Parse PDI header",
            "Convert common payload value types",
        ],
        "future_ready_for": [
            "ISDU services",
            "MQTT publishing",
            "AI diagnostics",
            "Industrial UI",
        ],
    }


@app.get("/health")
def health() -> dict[str, str]:
    """Basic health endpoint for local checks and future container probes."""
    return {
        "status": "ok",
        "phase": "1",
        "backend_mode": app.state.settings.backend_mode,
    }


@app.get("/connection")
def get_connection() -> dict[str, object]:
    """Return the currently saved local development target."""
    config = app.state.connection_config
    return {
        "configured": config is not None,
        "connection": None if config is None else config.to_dict(),
    }


@app.post("/connect")
def connect_to_ice2(request: ConnectRequest) -> dict[str, object]:
    """
    Validate connectivity and store the default ICE2 target.

    Each request creates a fresh backend instance. That keeps the API layer
    stateless enough for local development now and simple to extend later.
    """
    connection = ModbusConnectionConfig(**request.model_dump())

    try:
        with _create_backend(connection):
            pass
    except ConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unexpected connect failure: {exc}") from exc

    app.state.connection_config = connection

    return {
        "connected": True,
        "message": (
            "Simulator session is ready and the target was saved for subsequent reads."
            if app.state.settings.use_simulator
            else "Connection test succeeded and target was saved for subsequent reads."
        ),
        "connection": connection.to_dict(),
    }


@app.get("/ports/{port}/pdi")
def read_port_pdi(
    port: int,
    payload_word_count: int = Query(
        DEFAULT_PAYLOAD_WORD_COUNT,
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
    """Read a port PDI block, parse the header, and optionally decode a value."""
    connection = _get_saved_connection()

    try:
        with _create_backend(connection) as client:
            registers = client.read_port_pdi(
                port=port,
                payload_word_count=payload_word_count,
                block_mode=block_mode,
            )

        return _build_pdi_response(
            connection=connection,
            port=port,
            block_mode=block_mode,
            payload_word_count=payload_word_count,
            registers=registers,
            convert_as=convert_as,
            word_offset=word_offset,
            word_length=word_length,
            word_order=word_order,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (ConnectionError, ModbusReadError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unexpected read failure: {exc}") from exc


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
