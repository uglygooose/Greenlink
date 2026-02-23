# app/routers/scoring.py
from fastapi import APIRouter, Depends
from app.auth import get_db
from app import crud, schemas
from app.tenancy import get_active_club_id, require_staff_like

router = APIRouter(prefix="/scoring", tags=["scoring"])

@router.post("/submit")
def submit(
    round_in: schemas.RoundCreate,
    db=Depends(get_db),
    _=Depends(require_staff_like),
    __=Depends(get_active_club_id),
):
    r = crud.submit_scores(db, round_in.booking_id, round_in.scores_json or "")
    return {"round_id": r.id, "closed": r.closed}
