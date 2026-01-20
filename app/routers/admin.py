# app/routers/admin.py
"""
Admin Dashboard API Routes
All endpoints require admin role
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from app.models import User, Booking, TeeTime, Round, LedgerEntry, UserRole, BookingStatus
from app.auth import get_current_user, get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


def verify_admin(current_user: User = Depends(get_current_user)) -> User:
    """Verify current user is admin"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/dashboard")
async def get_dashboard_stats(db: Session = Depends(get_db), admin: User = Depends(verify_admin)):
    """Get main dashboard statistics"""
    
    # Total bookings
    total_bookings = db.query(func.count(Booking.id)).scalar() or 0
    
    # Bookings by status
    booked_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.booked).scalar() or 0
    checked_in_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.checked_in).scalar() or 0
    completed_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.completed).scalar() or 0
    cancelled_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.cancelled).scalar() or 0
    
    # Total revenue
    total_revenue = db.query(func.sum(Booking.price)).scalar() or 0.0
    
    # Completed rounds
    completed_rounds = db.query(func.count(Round.id)).filter(Round.closed == 1).scalar() or 0
    
    # Registered players
    total_players = db.query(func.count(User.id)).filter(User.role == UserRole.player).scalar() or 0
    
    # Today's bookings
    today = datetime.utcnow().date()
    today_bookings = db.query(func.count(Booking.id)).filter(
        func.date(Booking.created_at) == today
    ).scalar() or 0
    
    # Today's revenue
    today_revenue = db.query(func.sum(Booking.price)).filter(
        func.date(Booking.created_at) == today
    ).scalar() or 0.0
    
    # Last 7 days revenue
    week_ago = datetime.utcnow() - timedelta(days=7)
    week_revenue = db.query(func.sum(Booking.price)).filter(
        Booking.created_at >= week_ago
    ).scalar() or 0.0
    
    return {
        "total_bookings": total_bookings,
        "total_players": total_players,
        "total_revenue": float(total_revenue),
        "today_revenue": float(today_revenue),
        "week_revenue": float(week_revenue),
        "bookings_by_status": {
            "booked": booked_count,
            "checked_in": checked_in_count,
            "completed": completed_count,
            "cancelled": cancelled_count
        },
        "completed_rounds": completed_rounds,
        "today_bookings": today_bookings
    }


@router.get("/bookings")
async def get_all_bookings(
    skip: int = 0,
    limit: int = 50,
    status: str = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all bookings with filters"""
    
    query = db.query(Booking).order_by(desc(Booking.created_at))
    
    if status:
        query = query.filter(Booking.status == status)
    
    total = query.count()
    
    bookings = query.offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "bookings": [
            {
                "id": b.id,
                "player_name": b.player_name,
                "player_email": b.player_email,
                "price": float(b.price),
                "status": b.status,
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time else None,
                "created_at": b.created_at.isoformat(),
                "has_round": bool(b.round),
                "round_completed": b.round.closed if b.round else False
            }
            for b in bookings
        ]
    }


@router.get("/bookings/{booking_id}")
async def get_booking_detail(
    booking_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get detailed booking information"""
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    round_info = None
    if booking.round:
        round_info = {
            "id": booking.round.id,
            "scores": booking.round.scores_json,
            "handicap_sa_round_id": booking.round.handicap_sa_round_id,
            "handicap_synced": bool(booking.round.handicap_synced),
            "closed": bool(booking.round.closed),
            "created_at": booking.round.created_at.isoformat()
        }
    
    ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.booking_id == booking_id).all()
    
    return {
        "id": booking.id,
        "player_name": booking.player_name,
        "player_email": booking.player_email,
        "club_card": booking.club_card,
        "handicap_number": booking.handicap_number,
        "price": float(booking.price),
        "status": booking.status,
        "tee_time": booking.tee_time.tee_time.isoformat() if booking.tee_time else None,
        "created_at": booking.created_at.isoformat(),
        "round": round_info,
        "ledger_entries": [
            {
                "id": le.id,
                "description": le.description,
                "amount": float(le.amount),
                "pastel_synced": bool(le.pastel_synced),
                "created_at": le.created_at.isoformat()
            }
            for le in ledger_entries
        ]
    }


@router.get("/players")
async def get_all_players(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all registered players"""
    
    players = db.query(User).filter(User.role == UserRole.player).order_by(desc(User.id)).offset(skip).limit(limit).all()
    total = db.query(func.count(User.id)).filter(User.role == UserRole.player).scalar()
    
    return {
        "total": total,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "email": p.email,
                "handicap_number": p.handicap_number,
                "greenlink_id": p.greenlink_id,
                "bookings_count": db.query(func.count(Booking.id)).filter(
                    Booking.player_email == p.email
                ).scalar() or 0
            }
            for p in players
        ]
    }


@router.get("/players/{player_id}")
async def get_player_detail(
    player_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get detailed player information with booking history"""
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    bookings = db.query(Booking).filter(Booking.player_email == player.email).order_by(desc(Booking.created_at)).all()
    
    total_spent = db.query(func.sum(Booking.price)).filter(Booking.player_email == player.email).scalar() or 0.0
    completed_rounds = db.query(func.count(Round.id)).join(Booking).filter(
        Booking.player_email == player.email,
        Round.closed == 1
    ).scalar() or 0
    
    return {
        "id": player.id,
        "name": player.name,
        "email": player.email,
        "handicap_number": player.handicap_number,
        "greenlink_id": player.greenlink_id,
        "total_spent": float(total_spent),
        "bookings_count": len(bookings),
        "completed_rounds": completed_rounds,
        "recent_bookings": [
            {
                "id": b.id,
                "price": float(b.price),
                "status": b.status,
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time else None,
                "created_at": b.created_at.isoformat()
            }
            for b in bookings[:10]
        ]
    }


@router.get("/revenue")
async def get_revenue_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get revenue analytics for last N days"""
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Daily revenue
    daily_revenue = db.query(
        func.date(Booking.created_at).label("date"),
        func.sum(Booking.price).label("amount"),
        func.count(Booking.id).label("bookings")
    ).filter(
        Booking.created_at >= start_date
    ).group_by(
        func.date(Booking.created_at)
    ).order_by(
        func.date(Booking.created_at)
    ).all()
    
    # Revenue by booking status
    status_revenue = db.query(
        Booking.status,
        func.sum(Booking.price).label("amount"),
        func.count(Booking.id).label("count")
    ).filter(
        Booking.created_at >= start_date
    ).group_by(
        Booking.status
    ).all()
    
    return {
        "period_days": days,
        "daily_revenue": [
            {
                "date": str(dr[0]),
                "amount": float(dr[1]) if dr[1] else 0.0,
                "bookings": dr[2]
            }
            for dr in daily_revenue
        ],
        "revenue_by_status": [
            {
                "status": sr[0],
                "amount": float(sr[1]) if sr[1] else 0.0,
                "count": sr[2]
            }
            for sr in status_revenue
        ]
    }


@router.get("/tee-times")
async def get_tee_times(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all tee times with booking info"""
    
    tee_times = db.query(TeeTime).order_by(desc(TeeTime.tee_time)).offset(skip).limit(limit).all()
    total = db.query(func.count(TeeTime.id)).scalar()
    
    return {
        "total": total,
        "tee_times": [
            {
                "id": tt.id,
                "tee_time": tt.tee_time.isoformat(),
                "hole": tt.hole,
                "bookings": [
                    {
                        "id": b.id,
                        "player_name": b.player_name,
                        "status": b.status,
                        "price": float(b.price)
                    }
                    for b in tt.bookings
                ],
                "total_bookings": len(tt.bookings),
                "total_revenue": sum(b.price for b in tt.bookings)
            }
            for tt in tee_times
        ]
    }


@router.get("/ledger")
async def get_ledger_entries(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all ledger entries (transaction history)"""
    
    entries = db.query(LedgerEntry).order_by(desc(LedgerEntry.created_at)).offset(skip).limit(limit).all()
    total = db.query(func.count(LedgerEntry.id)).scalar()
    
    total_amount = db.query(func.sum(LedgerEntry.amount)).scalar() or 0.0
    
    return {
        "total": total,
        "total_amount": float(total_amount),
        "ledger_entries": [
            {
                "id": le.id,
                "booking_id": le.booking_id,
                "description": le.description,
                "amount": float(le.amount),
                "pastel_synced": bool(le.pastel_synced),
                "pastel_transaction_id": le.pastel_transaction_id,
                "created_at": le.created_at.isoformat()
            }
            for le in entries
        ]
    }


@router.get("/summary")
async def get_admin_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get comprehensive summary for admin"""
    
    # Basic stats
    total_players = db.query(func.count(User.id)).filter(User.role == UserRole.player).scalar() or 0
    total_bookings = db.query(func.count(Booking.id)).scalar() or 0
    total_revenue = db.query(func.sum(Booking.price)).scalar() or 0.0
    completed_rounds = db.query(func.count(Round.id)).filter(Round.closed == 1).scalar() or 0
    
    # This month
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_bookings = db.query(func.count(Booking.id)).filter(Booking.created_at >= month_start).scalar() or 0
    month_revenue = db.query(func.sum(Booking.price)).filter(Booking.created_at >= month_start).scalar() or 0.0
    
    # Top players by spending
    top_players = db.query(
        User.name,
        User.email,
        func.count(Booking.id).label("bookings"),
        func.sum(Booking.price).label("total_spent")
    ).join(
        Booking, User.email == Booking.player_email
    ).group_by(
        User.email
    ).order_by(
        desc("total_spent")
    ).limit(10).all()
    
    # Recent bookings
    recent_bookings = db.query(Booking).order_by(desc(Booking.created_at)).limit(10).all()
    
    return {
        "total_players": total_players,
        "total_bookings": total_bookings,
        "total_revenue": float(total_revenue),
        "completed_rounds": completed_rounds,
        "this_month": {
            "bookings": month_bookings,
            "revenue": float(month_revenue)
        },
        "top_players": [
            {
                "name": tp[0],
                "email": tp[1],
                "bookings": tp[2],
                "total_spent": float(tp[3]) if tp[3] else 0.0
            }
            for tp in top_players
        ],
        "recent_bookings": [
            {
                "id": b.id,
                "player_name": b.player_name,
                "player_email": b.player_email,
                "price": float(b.price),
                "status": b.status,
                "created_at": b.created_at.isoformat()
            }
            for b in recent_bookings
        ]
    }
