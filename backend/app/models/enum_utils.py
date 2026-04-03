from __future__ import annotations

from enum import Enum as PythonEnum


def enum_values(enum_class: type[PythonEnum]) -> list[str]:
    return [item.value for item in enum_class]
