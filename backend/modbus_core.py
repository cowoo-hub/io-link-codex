"""Low-level Modbus TCP access and ICE2 PDI parsing."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal, Protocol, Sequence

from pymodbus.client import ModbusTcpClient


PDIBlockMode = Literal["multiple", "specific"]

PORT_COUNT = 8
HEADER_WORD_COUNT = 2
DEFAULT_PAYLOAD_WORD_COUNT = 16  # 32 bytes of payload, matching the default PDI size from the manual.


@dataclass(slots=True)
class ModbusConnectionConfig:
    """Connection settings for a single ICE2 target."""

    host: str
    port: int = 502
    slave_id: int = 1
    timeout: float = 3.0
    retries: int = 1

    def to_dict(self) -> dict[str, str | int | float]:
        return asdict(self)


class ModbusReadError(RuntimeError):
    """Raised when the Modbus server responds with an error or short payload."""


class ICE2Backend(Protocol):
    """
    Shared backend interface for real hardware and simulator implementations.

    The interface is intentionally small so later ISDU, MQTT publishing,
    polling/caching, and AI diagnostics features can extend it cleanly.
    """

    config: ModbusConnectionConfig

    def __enter__(self) -> "ICE2Backend":
        """Open or prepare the backend for use."""

    def __exit__(self, exc_type, exc, exc_tb) -> None:
        """Release backend resources."""

    def connect(self) -> bool:
        """Open a connection or prepare a simulation session."""

    def close(self) -> None:
        """Close a connection or clean up the session."""

    def read_port_pdi(
        self,
        port: int,
        payload_word_count: int = DEFAULT_PAYLOAD_WORD_COUNT,
        block_mode: PDIBlockMode = "multiple",
    ) -> list[int]:
        """Read a single ICE2 port PDI block."""


def validate_port(port: int) -> int:
    """ICE2 models expose 8 IO-Link ports."""
    if not 1 <= port <= PORT_COUNT:
        raise ValueError(f"Port must be between 1 and {PORT_COUNT}")
    return port


def build_port_pdi_base1_address(port: int, block_mode: PDIBlockMode = "multiple") -> int:
    """
    Build the manual-style base-1 Modbus address for a port PDI block.

    Pepperl+Fuchs lists Modbus addresses in base-1. PyModbus expects base-0,
    so callers should subtract one before submitting the request.
    """
    validated_port = validate_port(port)
    if block_mode not in {"multiple", "specific"}:
        raise ValueError("block_mode must be 'multiple' or 'specific'")

    return (validated_port * 1000) + (1 if block_mode == "specific" else 0)


def build_port_pdi_base0_address(port: int, block_mode: PDIBlockMode = "multiple") -> int:
    """Return the PyModbus-friendly base-0 address for a port PDI block."""
    return build_port_pdi_base1_address(port=port, block_mode=block_mode) - 1


def build_pdi_header_word(port_status: int, auxiliary_input: int) -> int:
    """Compose the 16-bit PDI header word from status and auxiliary bytes."""
    return ((port_status & 0xFF) << 8) | (auxiliary_input & 0xFF)


def parse_port_status(status_byte: int) -> dict[str, object]:
    """
    Decode the ICE2 port status byte from the PDI header.

    Bit meanings follow the Pepperl+Fuchs IO-Link Master Modbus/TCP user guide:
    init active, operational, PDI valid, and fault.
    """
    operational = bool(status_byte & 0x02)
    fault = bool(status_byte & 0x08)

    if fault and operational:
        fault_severity = "minor"
    elif fault and not operational:
        fault_severity = "major"
    else:
        fault_severity = None

    return {
        "raw": status_byte,
        "hex": f"0x{status_byte:02X}",
        "initialization_active": bool(status_byte & 0x01),
        "operational": operational,
        "pdi_valid": bool(status_byte & 0x04),
        "fault": fault,
        "fault_severity": fault_severity,
        "reserved_bits": (status_byte >> 4) & 0x0F,
    }


def parse_pdi_header(registers: Sequence[int]) -> dict[str, object]:
    """Parse the fixed two-word PDI header from a Modbus register list."""
    if len(registers) < HEADER_WORD_COUNT:
        raise ValueError("At least two registers are required to parse the PDI header")

    header_word = int(registers[0]) & 0xFFFF
    event_code = int(registers[1]) & 0xFFFF

    port_status = (header_word >> 8) & 0xFF
    auxiliary_input = header_word & 0xFF

    return {
        "port_status": parse_port_status(port_status),
        "auxiliary_input": {
            "raw": auxiliary_input,
            "hex": f"0x{auxiliary_input:02X}",
            "active": bool(auxiliary_input & 0x01),
            "reserved_bits": auxiliary_input >> 1,
        },
        "event_code": {
            "raw": event_code,
            "hex": f"0x{event_code:04X}",
            "active": event_code != 0,
        },
    }


class ICE2ModbusClient:
    """
    Thin wrapper around PyModbus for ICE2-focused reads.

    This class implements the shared backend interface so the API layer can
    switch between real hardware and simulator mode without route changes.
    """

    def __init__(self, config: ModbusConnectionConfig) -> None:
        self.config = config
        self._client = ModbusTcpClient(
            host=config.host,
            port=config.port,
            timeout=config.timeout,
            retries=config.retries,
        )

    def __enter__(self) -> "ICE2ModbusClient":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, exc_tb) -> None:
        self.close()

    def connect(self) -> bool:
        """Open a TCP session to the configured ICE2 target."""
        connected = self._client.connect()

        if not connected and not getattr(self._client, "connected", False):
            raise ConnectionError(
                f"Could not connect to ICE2 at {self.config.host}:{self.config.port}"
            )

        return True

    def close(self) -> None:
        """Close the underlying socket cleanly."""
        self._client.close()

    def read_holding_registers(self, address: int, count: int) -> list[int]:
        """Read holding registers and normalize the result."""
        if count <= 0:
            raise ValueError("count must be greater than zero")

        response = self._client.read_holding_registers(
            address=address,
            count=count,
            slave=self.config.slave_id,
        )

        if hasattr(response, "isError") and response.isError():
            raise ModbusReadError(f"Modbus device returned an error: {response}")

        registers = [int(word) & 0xFFFF for word in getattr(response, "registers", [])]

        if len(registers) != count:
            raise ModbusReadError(
                f"Expected {count} register(s) but received {len(registers)}"
            )

        return registers

    def read_port_pdi(
        self,
        port: int,
        payload_word_count: int = DEFAULT_PAYLOAD_WORD_COUNT,
        block_mode: PDIBlockMode = "multiple",
    ) -> list[int]:
        """Read the two-word PDI header plus the requested payload words for one port."""
        if payload_word_count < 0:
            raise ValueError("payload_word_count must be zero or greater")

        base0_address = build_port_pdi_base0_address(port=port, block_mode=block_mode)
        total_words = HEADER_WORD_COUNT + payload_word_count
        return self.read_holding_registers(address=base0_address, count=total_words)
