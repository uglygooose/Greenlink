from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session, selectinload

from app.models import ProShopProduct, ProShopSale, ProShopSaleItem, RevenueTransaction
from app.services.payment_methods import normalize_pro_shop_payment_method
from app.services.revenue_integrity_service import sync_pro_shop_sale_integrity


class ProShopProductUpsertPayload(BaseModel):
    sku: str
    name: str
    category: str | None = None
    unit_price: float = 0.0
    cost_price: float | None = None
    stock_qty: int = 0
    reorder_level: int = 0
    active: bool = True


class ProShopProductUpdatePayload(BaseModel):
    sku: str | None = None
    name: str | None = None
    category: str | None = None
    unit_price: float | None = None
    cost_price: float | None = None
    stock_qty: int | None = None
    reorder_level: int | None = None
    active: bool | None = None


class ProShopStockAdjustPayload(BaseModel):
    delta: int
    reason: str | None = None


class ProShopSaleItemPayload(BaseModel):
    product_id: int
    quantity: int
    unit_price: float | None = None


class ProShopSaleCreatePayload(BaseModel):
    customer_name: str | None = None
    payment_method: str | None = "card"
    notes: str | None = None
    discount: float | None = 0.0
    tax: float | None = 0.0
    items: list[ProShopSaleItemPayload]


def serialize_pro_shop_product(product: ProShopProduct) -> dict[str, Any]:
    return {
        "id": int(product.id),
        "sku": str(product.sku or ""),
        "name": str(product.name or ""),
        "category": str(product.category or "") if product.category else None,
        "unit_price": float(product.unit_price or 0.0),
        "cost_price": float(product.cost_price) if product.cost_price is not None else None,
        "stock_qty": int(product.stock_qty or 0),
        "reorder_level": int(product.reorder_level or 0),
        "active": bool(int(product.active or 0) == 1),
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }


def serialize_pro_shop_sale(sale: ProShopSale) -> dict[str, Any]:
    return {
        "id": int(sale.id),
        "sold_at": sale.sold_at.isoformat() if sale.sold_at else None,
        "customer_name": sale.customer_name,
        "payment_method": sale.payment_method,
        "subtotal": float(sale.subtotal or 0.0),
        "discount": float(sale.discount or 0.0),
        "tax": float(sale.tax or 0.0),
        "total": float(sale.total or 0.0),
        "items": [
            {
                "id": int(item.id),
                "product_id": int(item.product_id) if item.product_id is not None else None,
                "sku": item.sku_snapshot,
                "name": item.name_snapshot,
                "category": item.category_snapshot,
                "quantity": int(item.quantity or 0),
                "unit_price": float(item.unit_price or 0.0),
                "line_total": float(item.line_total or 0.0),
            }
            for item in sorted((sale.items or []), key=lambda row: int(row.id or 0))
        ],
    }


def list_pro_shop_products_payload(
    db: Session,
    *,
    club_id: int,
    q: str | None = None,
    active_only: bool = False,
    limit: int = 250,
) -> dict[str, Any]:
    needle = (q or "").strip()
    safe_limit = max(1, min(int(limit or 250), 500))
    query = db.query(ProShopProduct).filter(ProShopProduct.club_id == int(club_id))
    if active_only:
        query = query.filter(ProShopProduct.active == 1)
    if needle:
        q_like = f"%{needle.lower()}%"
        query = query.filter(
            or_(
                func.lower(ProShopProduct.sku).like(q_like),
                func.lower(ProShopProduct.name).like(q_like),
                func.lower(func.coalesce(ProShopProduct.category, "")).like(q_like),
            )
        )

    rows = (
        query
        .order_by(ProShopProduct.active.desc(), ProShopProduct.name.asc(), ProShopProduct.id.asc())
        .limit(safe_limit)
        .all()
    )
    low_stock_count = (
        db.query(func.count(ProShopProduct.id))
        .filter(
            ProShopProduct.club_id == int(club_id),
            ProShopProduct.active == 1,
            ProShopProduct.stock_qty <= func.coalesce(ProShopProduct.reorder_level, 0),
        )
        .scalar()
        or 0
    )
    return {
        "products": [serialize_pro_shop_product(row) for row in rows],
        "low_stock_count": int(low_stock_count or 0),
    }


def create_pro_shop_product_payload(
    db: Session,
    *,
    club_id: int,
    payload: ProShopProductUpsertPayload,
) -> dict[str, Any]:
    sku = (payload.sku or "").strip()
    name = (payload.name or "").strip()
    if not sku:
        raise HTTPException(status_code=400, detail="sku is required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    unit_price = float(payload.unit_price or 0.0)
    cost_price = payload.cost_price
    stock_qty = int(payload.stock_qty or 0)
    reorder_level = int(payload.reorder_level or 0)
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")
    if cost_price is not None and float(cost_price) < 0:
        raise HTTPException(status_code=400, detail="cost_price must be >= 0")
    if stock_qty < 0:
        raise HTTPException(status_code=400, detail="stock_qty must be >= 0")
    if reorder_level < 0:
        raise HTTPException(status_code=400, detail="reorder_level must be >= 0")

    exists = (
        db.query(ProShopProduct.id)
        .filter(ProShopProduct.club_id == int(club_id), func.lower(ProShopProduct.sku) == sku.lower())
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail=f"Product with sku '{sku}' already exists")

    now = datetime.utcnow()
    row = ProShopProduct(
        club_id=int(club_id),
        sku=sku,
        name=name,
        category=(payload.category or "").strip() or None,
        unit_price=unit_price,
        cost_price=(float(cost_price) if cost_price is not None else None),
        stock_qty=stock_qty,
        reorder_level=reorder_level,
        active=1 if payload.active else 0,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "product": serialize_pro_shop_product(row)}


def update_pro_shop_product_payload(
    db: Session,
    *,
    club_id: int,
    product_id: int,
    payload: ProShopProductUpdatePayload,
) -> dict[str, Any]:
    row = db.query(ProShopProduct).filter(
        ProShopProduct.club_id == int(club_id),
        ProShopProduct.id == int(product_id),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.sku is not None:
        sku = (payload.sku or "").strip()
        if not sku:
            raise HTTPException(status_code=400, detail="sku cannot be empty")
        dup = (
            db.query(ProShopProduct.id)
            .filter(
                ProShopProduct.club_id == int(club_id),
                func.lower(ProShopProduct.sku) == sku.lower(),
                ProShopProduct.id != row.id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail=f"Product with sku '{sku}' already exists")
        row.sku = sku

    if payload.name is not None:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = name

    if payload.category is not None:
        row.category = (payload.category or "").strip() or None

    if payload.unit_price is not None:
        unit_price = float(payload.unit_price)
        if unit_price < 0:
            raise HTTPException(status_code=400, detail="unit_price must be >= 0")
        row.unit_price = unit_price

    if payload.cost_price is not None:
        cost_price = float(payload.cost_price)
        if cost_price < 0:
            raise HTTPException(status_code=400, detail="cost_price must be >= 0")
        row.cost_price = cost_price

    if payload.stock_qty is not None:
        stock_qty = int(payload.stock_qty)
        if stock_qty < 0:
            raise HTTPException(status_code=400, detail="stock_qty must be >= 0")
        row.stock_qty = stock_qty

    if payload.reorder_level is not None:
        reorder_level = int(payload.reorder_level)
        if reorder_level < 0:
            raise HTTPException(status_code=400, detail="reorder_level must be >= 0")
        row.reorder_level = reorder_level

    if payload.active is not None:
        row.active = 1 if payload.active else 0

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {"status": "success", "product": serialize_pro_shop_product(row)}


def adjust_pro_shop_stock_payload(
    db: Session,
    *,
    club_id: int,
    product_id: int,
    payload: ProShopStockAdjustPayload,
) -> dict[str, Any]:
    row = db.query(ProShopProduct).filter(
        ProShopProduct.club_id == int(club_id),
        ProShopProduct.id == int(product_id),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    delta = int(payload.delta or 0)
    if delta == 0:
        raise HTTPException(status_code=400, detail="delta must be non-zero")

    next_qty = int(row.stock_qty or 0) + delta
    if next_qty < 0:
        raise HTTPException(status_code=409, detail="Stock cannot be negative")

    row.stock_qty = next_qty
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {
        "status": "success",
        "reason": (payload.reason or "").strip() or None,
        "product": serialize_pro_shop_product(row),
    }


def list_pro_shop_sales_payload(
    db: Session,
    *,
    club_id: int,
    limit: int = 25,
    days: int = 30,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit or 25), 200))
    safe_days = max(1, min(int(days or 30), 365))
    start_dt = datetime.utcnow() - timedelta(days=safe_days)
    today = datetime.utcnow().date()

    rows = (
        db.query(ProShopSale)
        .options(selectinload(ProShopSale.items))
        .filter(ProShopSale.club_id == int(club_id), ProShopSale.sold_at >= start_dt)
        .order_by(desc(ProShopSale.sold_at), desc(ProShopSale.id))
        .limit(safe_limit)
        .all()
    )
    period_total = (
        db.query(func.sum(ProShopSale.total))
        .filter(ProShopSale.club_id == int(club_id), ProShopSale.sold_at >= start_dt)
        .scalar()
        or 0.0
    )
    period_transactions = (
        db.query(func.count(ProShopSale.id))
        .filter(ProShopSale.club_id == int(club_id), ProShopSale.sold_at >= start_dt)
        .scalar()
        or 0
    )
    today_total = (
        db.query(func.sum(ProShopSale.total))
        .filter(ProShopSale.club_id == int(club_id), func.date(ProShopSale.sold_at) == today)
        .scalar()
        or 0.0
    )
    today_transactions = (
        db.query(func.count(ProShopSale.id))
        .filter(ProShopSale.club_id == int(club_id), func.date(ProShopSale.sold_at) == today)
        .scalar()
        or 0
    )
    return {
        "sales": [serialize_pro_shop_sale(row) for row in rows],
        "summary": {
            "today_total": float(today_total or 0.0),
            "today_transactions": int(today_transactions or 0),
            "period_total": float(period_total or 0.0),
            "period_transactions": int(period_transactions or 0),
            "period_days": int(safe_days),
        },
    }


def create_pro_shop_sale_payload(
    db: Session,
    *,
    club_id: int,
    staff_user_id: int,
    payload: ProShopSaleCreatePayload,
    audit_event: Callable[..., None] | None = None,
    invalidate_cache: Callable[[int], None] | None = None,
    audit_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    items = payload.items or []
    if not items:
        raise HTTPException(status_code=400, detail="At least one sale item is required")

    discount = max(0.0, float(payload.discount or 0.0))
    tax = max(0.0, float(payload.tax or 0.0))
    payment_method = normalize_pro_shop_payment_method(payload.payment_method)
    sold_at = datetime.utcnow()

    try:
        line_items: list[dict[str, Any]] = []
        for raw_item in items:
            product = (
                db.query(ProShopProduct)
                .filter(ProShopProduct.club_id == int(club_id), ProShopProduct.id == int(raw_item.product_id))
                .first()
            )
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {raw_item.product_id} not found")

            quantity = int(raw_item.quantity or 0)
            if quantity <= 0:
                raise HTTPException(status_code=400, detail="quantity must be >= 1")

            stock_qty = int(product.stock_qty or 0)
            if stock_qty < quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for '{product.name}' (available {stock_qty}, requested {quantity})",
                )

            unit_price = float(raw_item.unit_price) if raw_item.unit_price is not None else float(product.unit_price or 0.0)
            if unit_price < 0:
                raise HTTPException(status_code=400, detail="unit_price must be >= 0")

            line_total = round(unit_price * float(quantity), 2)
            line_items.append(
                {
                    "product": product,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "line_total": line_total,
                }
            )

        subtotal = round(sum(float(item["line_total"]) for item in line_items), 2)
        total = round(subtotal - discount + tax, 2)
        if total < 0:
            raise HTTPException(status_code=400, detail="Total cannot be negative")

        sale = ProShopSale(
            club_id=int(club_id),
            sold_by_user_id=int(staff_user_id),
            customer_name=(payload.customer_name or "").strip() or None,
            notes=(payload.notes or "").strip() or None,
            payment_method=payment_method,
            subtotal=subtotal,
            discount=discount,
            tax=tax,
            total=total,
            sold_at=sold_at,
            created_at=sold_at,
        )
        db.add(sale)
        db.flush()

        for line in line_items:
            product = line["product"]
            quantity = int(line["quantity"])
            unit_price = float(line["unit_price"])
            line_total = float(line["line_total"])

            db.add(
                ProShopSaleItem(
                    club_id=int(club_id),
                    sale_id=int(sale.id),
                    product_id=int(product.id),
                    sku_snapshot=str(product.sku or ""),
                    name_snapshot=str(product.name or ""),
                    category_snapshot=str(product.category or "") if product.category else None,
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                    created_at=sold_at,
                )
            )
            product.stock_qty = int(product.stock_qty or 0) - quantity
            product.updated_at = sold_at

        db.add(
            RevenueTransaction(
                club_id=int(club_id),
                source="pro_shop",
                transaction_date=sold_at.date(),
                external_id=f"proshop-sale-{int(sale.id)}",
                description=f"Pro shop sale #{int(sale.id)}",
                category=payment_method,
                amount=total,
                created_at=sold_at,
            )
        )
        sync_pro_shop_sale_integrity(
            db,
            sale,
            source_system="pro_shop_sale_create",
            source_ref=f"pro_shop_sale:{int(getattr(sale, 'id', 0) or 0)}",
        )

        if audit_event is not None:
            audit_event(
                action="pro_shop.sale_created",
                entity_type="pro_shop_sale",
                entity_id=int(sale.id),
                payload={
                    "sale_id": int(sale.id),
                    "club_id": int(club_id),
                    "item_count": len(line_items),
                    "payment_method": payment_method,
                    "subtotal": float(subtotal),
                    "discount": float(discount),
                    "tax": float(tax),
                    "total": float(total),
                },
                **(audit_context or {}),
            )
        db.commit()
        if invalidate_cache is not None:
            invalidate_cache(int(club_id))
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    saved = (
        db.query(ProShopSale)
        .options(selectinload(ProShopSale.items))
        .filter(ProShopSale.club_id == int(club_id), ProShopSale.id == int(sale.id))
        .first()
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Sale created but could not be reloaded")
    return {"status": "success", "sale": serialize_pro_shop_sale(saved)}
