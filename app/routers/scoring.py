# app/routers/scoring.py
from fastapi import APIRouter, Depends
from app.auth import get_db, get_current_user
from app import crud, schemas

router = APIRouter(prefix="/scoring", tags=["scoring"])

@router.post("/submit")
def submit(round_in: schemas.RoundCreate, db = Depends(get_db), _=Depends(get_current_user)):
    r = crud.submit_scores(db, round_in.booking_id, round_in.scores_json or "")
    return {"round_id": r.id, "closed": r.closed}
