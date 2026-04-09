"""ICE2 simulator backend for simulator-first local development."""

from __future__ import annotations

import math
import struct
import time
from dataclasses import dataclass

from modbus_core import (
    DEFAULT_PAYLOAD_WORD_COUNT,
    ModbusConnectionConfig,
    PDIBlockMode,
    build_pdi_header_word,
    validate_port,
)


SIM_WARNING_EVENT = 0x7001
SIM_VIBRATION_WARNING_EVENT = 0x7012
SIMULATOR_BOOT_TIME = time.monotonic()


@dataclass(slots=True)
class SimulatedPortFrame:
    """Fully assembled simulated PDI content for one IO-Link port."""

    status_byte: int
    auxiliary_input: int
    event_code: int
    payload_words: list[int]


def _words_from_bytes(raw_bytes: bytes) -> list[int]:
    """Split a big-endian byte sequence into Modbus registers."""
    if len(raw_bytes) % 2 != 0:
        raw_bytes += b"\x00"

    return [
        int.from_bytes(raw_bytes[index : index + 2], byteorder="big", signed=False)
        for index in range(0, len(raw_bytes), 2)
    ]


def _pack_uint16(value: int) -> list[int]:
    return [int(value) & 0xFFFF]


def _pack_int16(value: int) -> list[int]:
    return [struct.unpack(">H", struct.pack(">h", int(value)))[0]]


def _pack_uint32(value: int) -> list[int]:
    return _words_from_bytes(struct.pack(">I", int(value) & 0xFFFFFFFF))


def _pack_int32(value: int) -> list[int]:
    return _words_from_bytes(struct.pack(">i", int(value)))


def _pack_float32(value: float) -> list[int]:
    return _words_from_bytes(struct.pack(">f", float(value)))


def _build_status_byte(
    *,
    initialization_active: bool,
    operational: bool,
    pdi_valid: bool,
    fault: bool,
) -> int:
    """Build the status byte using the same bit layout as the real ICE2 header."""
    status = 0

    if initialization_active:
        status |= 0x01
    if operational:
        status |= 0x02
    if pdi_valid:
        status |= 0x04
    if fault:
        status |= 0x08

    return status


class ICE2Simulator:
    """
    Generate ICE2-style PDI blocks with healthy, changing, warning, and fault states.

    The class intentionally mirrors the real Modbus backend method signatures so
    the FastAPI layer and future frontend can switch backends without code changes.
    """

    def __init__(self, config: ModbusConnectionConfig) -> None:
        self.config = config

    def __enter__(self) -> "ICE2Simulator":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, exc_tb) -> None:
        self.close()

    def connect(self) -> bool:
        """Simulator mode always connects successfully."""
        return True

    def close(self) -> None:
        """No persistent resources are held in simulator mode."""

    def read_port_pdi(
        self,
        port: int,
        payload_word_count: int = DEFAULT_PAYLOAD_WORD_COUNT,
        block_mode: PDIBlockMode = "multiple",
    ) -> list[int]:
        """
        Return a realistic ICE2-style PDI block for one port.

        `block_mode` is accepted to keep parity with the real backend even though
        the simulator uses the same generated data for both address styles.
        """
        del block_mode

        validate_port(port)

        if payload_word_count < 0:
            raise ValueError("payload_word_count must be zero or greater")

        frame = self._generate_port_frame(port)
        payload_words = (frame.payload_words + [0] * payload_word_count)[:payload_word_count]
        header_word = build_pdi_header_word(frame.status_byte, frame.auxiliary_input)

        return [header_word, frame.event_code & 0xFFFF, *payload_words]

    def read_all_port_pdi(
        self,
        ports: list[int],
        payload_word_count: int = DEFAULT_PAYLOAD_WORD_COUNT,
        block_mode: PDIBlockMode = "multiple",
    ) -> dict[int, list[int]]:
        """Generate multiple simulated PDI blocks in one call."""
        return {
            port: self.read_port_pdi(
                port=port,
                payload_word_count=payload_word_count,
                block_mode=block_mode,
            )
            for port in ports
        }

    def _elapsed_seconds(self) -> float:
        """Elapsed monotonic time since the simulator module booted."""
        return time.monotonic() - SIMULATOR_BOOT_TIME

    def _generate_port_frame(self, port: int) -> SimulatedPortFrame:
        """Dispatch to the profile that best represents the requested port."""
        elapsed = self._elapsed_seconds()

        if port == 1:
            return self._profile_stable_temperature(elapsed)
        if port == 2:
            return self._profile_changing_flow(elapsed)
        if port == 3:
            return self._profile_counter(elapsed)
        if port == 4:
            return self._profile_binary_activity(elapsed)
        if port == 5:
            return self._profile_warning_case(elapsed)
        if port == 6:
            return self._profile_distance_monitor(elapsed)
        if port == 7:
            return self._profile_power_monitor(elapsed)
        return self._profile_vibration_watch(elapsed)

    def _profile_stable_temperature(self, elapsed: float) -> SimulatedPortFrame:
        del elapsed

        temperature_c = 24.75
        payload = (
            _pack_float32(temperature_c)
            + _pack_int16(int(temperature_c * 10))
            + _pack_uint16(100)
            + _pack_uint16(1)
            + _pack_uint16(0x1001)
        )

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=False,
            ),
            auxiliary_input=0x00,
            event_code=0x0000,
            payload_words=payload,
        )

    def _profile_changing_flow(self, elapsed: float) -> SimulatedPortFrame:
        flow_l_min = 12.5 + (1.8 * math.sin(elapsed / 4.0))
        flow_totalizer = 8200 + int(elapsed * 11)
        aux_active = int(math.sin(elapsed / 8.0) > 0.7)
        payload = (
            _pack_float32(flow_l_min)
            + _pack_uint32(flow_totalizer)
            + _pack_uint16(67)
            + _pack_uint16(2)
            + _pack_uint16(0x2002)
        )

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=False,
            ),
            auxiliary_input=aux_active,
            event_code=0x0000,
            payload_words=payload,
        )

    def _profile_counter(self, elapsed: float) -> SimulatedPortFrame:
        pulse_count = 120_000 + int(elapsed * 45)
        rpm = 850 + int(35 * math.sin(elapsed / 3.0))
        payload = (
            _pack_uint32(pulse_count)
            + _pack_uint16(rpm)
            + _pack_uint16(pulse_count % 65535)
            + _pack_uint16(3)
            + _pack_uint16(0x3003)
        )

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=False,
            ),
            auxiliary_input=0x00,
            event_code=0x0000,
            payload_words=payload,
        )

    def _profile_binary_activity(self, elapsed: float) -> SimulatedPortFrame:
        step = int(elapsed * 2.0) % 16
        primary_pattern = 1 << step
        secondary_pattern = 0xAAAA if step % 2 == 0 else 0x5555
        payload = [
            primary_pattern & 0xFFFF,
            secondary_pattern,
            ((primary_pattern << 1) | (primary_pattern >> 15)) & 0xFFFF,
            0x00F0,
            0x0F0F,
            0xF00F,
        ]

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=False,
            ),
            auxiliary_input=1 if step in {4, 5, 6} else 0,
            event_code=0x0000,
            payload_words=payload,
        )

    def _profile_warning_case(self, elapsed: float) -> SimulatedPortFrame:
        product_temp_c = 78.0 + (2.5 * math.sin(elapsed / 3.5))
        payload = (
            _pack_float32(product_temp_c)
            + _pack_uint16(92)
            + _pack_uint16(1)
            + _pack_uint16(5)
            + _pack_uint16(0x5005)
        )

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=True,
            ),
            auxiliary_input=0x01,
            event_code=SIM_WARNING_EVENT,
            payload_words=payload,
        )

    def _profile_distance_monitor(self, elapsed: float) -> SimulatedPortFrame:
        distance_mm = 420 + int(34 * math.sin(elapsed / 2.6))
        signal_quality = 94 + int(3 * math.cos(elapsed / 5.8))
        payload = (
            _pack_uint16(distance_mm)
            + _pack_uint16(signal_quality)
            + _pack_uint16(6)
            + _pack_uint16(0x6006)
            + _pack_uint16(0x0001)
        )

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=False,
            ),
            auxiliary_input=0x00,
            event_code=0x0000,
            payload_words=payload,
        )

    def _profile_power_monitor(self, elapsed: float) -> SimulatedPortFrame:
        voltage_v = 230.2 + (0.05 * math.sin(elapsed / 12.0))
        current_a = 1.12 + (0.02 * math.cos(elapsed / 7.0))
        payload = (
            _pack_float32(voltage_v)
            + _pack_float32(current_a)
            + _pack_uint16(998)
            + _pack_uint16(7)
            + _pack_uint16(0x7007)
        )

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=False,
            ),
            auxiliary_input=0x00,
            event_code=0x0000,
            payload_words=payload,
        )

    def _profile_vibration_watch(self, elapsed: float) -> SimulatedPortFrame:
        vibration = int(1450 * math.sin(elapsed * 1.8))
        warning_active = abs(vibration) > 1200
        payload = (
            _pack_int32(vibration)
            + _pack_uint16(abs(vibration))
            + _pack_int16(int(vibration / 10))
            + _pack_uint16(8)
            + _pack_uint16(0x8008)
        )

        return SimulatedPortFrame(
            status_byte=_build_status_byte(
                initialization_active=True,
                operational=True,
                pdi_valid=True,
                fault=warning_active,
            ),
            auxiliary_input=0x01 if warning_active else 0x00,
            event_code=SIM_VIBRATION_WARNING_EVENT if warning_active else 0x0000,
            payload_words=payload,
        )
