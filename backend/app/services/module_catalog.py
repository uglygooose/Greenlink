from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModuleCatalogItem:
    key: str
    label: str
    description: str


MODULE_CATALOG: tuple[ModuleCatalogItem, ...] = (
    ModuleCatalogItem(
        key="communications",
        label="Communications",
        description="Club news and member-facing updates.",
    ),
    ModuleCatalogItem(
        key="finance",
        label="Finance",
        description="Club finance visibility, export setup, and cashbook workflows.",
    ),
    ModuleCatalogItem(
        key="golf",
        label="Golf",
        description="Tee-sheet operations, rules, pricing, and golf settings.",
    ),
    ModuleCatalogItem(
        key="pos",
        label="Commerce",
        description="Orders, point-of-sale, halfway house, and pro shop operations.",
    ),
)

SUPPORTED_MODULE_KEYS = {item.key for item in MODULE_CATALOG}
