"""Helpers for converting IO-Link PDI payload registers into Python values."""

from __future__ import annotations

import struct
from typing import Literal, Sequence


SupportedDataType = Literal["uint16", "int16", "uint32", "int32", "float32", "binary"]
WordOrder = Literal["big", "little"]


def _normalize_registers(registers: Sequence[int]) -> list[int]:
    """Validate and normalize Modbus registers into unsigned 16-bit integers."""
    normalized: list[int] = []

    for register in registers:
        if not 0 <= int(register) <= 0xFFFF:
            raise ValueError(f"Register value out of range: {register}")
        normalized.append(int(register))

    return normalized


def registers_to_bytes(registers: Sequence[int], word_order: WordOrder = "big") -> bytes:
    """
    Convert 16-bit registers into bytes.

    Modbus registers are always big-endian at the byte level. The optional
    word_order flag is useful for 32-bit device values where two registers may
    be interpreted in reverse word order by the consuming device profile.
    """
    words = _normalize_registers(registers)

    if word_order == "little":
        words = list(reversed(words))

    return b"".join(word.to_bytes(2, byteorder="big", signed=False) for word in words)


def convert_register_value(
    registers: Sequence[int],
    data_type: SupportedDataType,
    word_offset: int = 0,
    word_length: int | None = None,
    word_order: WordOrder = "big",
) -> int | float | str:
    """
    Convert registers into a typed Python value.

    `word_offset` starts inside the provided register list, which makes it easy
    to decode values from the PDI payload without re-packing it by hand.
    """
    if word_offset < 0:
        raise ValueError("word_offset must be zero or greater")

    words = _normalize_registers(registers)
    selected_words = words[word_offset:]

    if not selected_words:
        raise ValueError("No registers available at the requested word_offset")

    if data_type == "binary":
        if word_length is not None:
            if word_length <= 0:
                raise ValueError("word_length must be greater than zero for binary conversion")
            selected_words = selected_words[:word_length]

        if not selected_words:
            raise ValueError("Binary conversion needs at least one register")

        return "".join(f"{byte:08b}" for byte in registers_to_bytes(selected_words, word_order=word_order))

    register_sizes = {
        "uint16": 1,
        "int16": 1,
        "uint32": 2,
        "int32": 2,
        "float32": 2,
    }

    required_words = register_sizes[data_type]

    if len(selected_words) < required_words:
        raise ValueError(
            f"{data_type} conversion needs {required_words} register(s), "
            f"but only {len(selected_words)} are available"
        )

    selected_words = selected_words[:required_words]
    raw_bytes = registers_to_bytes(selected_words, word_order=word_order)

    unpack_formats = {
        "uint16": ">H",
        "int16": ">h",
        "uint32": ">I",
        "int32": ">i",
        "float32": ">f",
    }

    return struct.unpack(unpack_formats[data_type], raw_bytes)[0]
