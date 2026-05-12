"""v1 metric stubs.

Each module here defines exactly one :class:`app.semantic.base.Metric` instance
and registers it via :func:`app.semantic.registry.register` at import time. Real
Real SQL lands in follow-up phases; v1 stubs return placeholder values that round-trip
through their declared result schemas.
"""
