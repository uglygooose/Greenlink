#!/usr/bin/env python3
"""
Populate sample tee times for today
"""
from datetime import datetime, timedelta
from app.database import SessionLocal
from app import models

db = SessionLocal()

# Get today's date
today = datetime.now().date()

# Create tee times starting at 9:10 AM with 8-minute intervals
start_hour = 9
start_minute = 10
times_to_create = 12

try:
    for i in range(times_to_create):
        # Calculate time
        minutes = start_minute + (i * 8)
        hours = start_hour + (minutes // 60)
        minutes = minutes % 60
        
        tee_time = datetime.combine(
            today,
            datetime.min.time().replace(hour=hours, minute=minutes)
        )
        
        # Check if already exists
        existing = db.query(models.TeeTime).filter(
            models.TeeTime.tee_time == tee_time
        ).first()
        
        if not existing:
            tt = models.TeeTime(tee_time=tee_time)
            db.add(tt)
            print(f"Added: {tee_time.strftime('%I:%M %p')}")
        else:
            print(f"Already exists: {tee_time.strftime('%I:%M %p')}")
    
    db.commit()
    print("\n✓ Tee times populated successfully")
    
except Exception as e:
    print(f"✗ Error: {e}")
    db.rollback()
finally:
    db.close()
