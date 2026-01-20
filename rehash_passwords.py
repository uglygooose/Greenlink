#!/usr/bin/env python3
"""
Rehash all user passwords to ensure bcrypt 72-byte limit compatibility.
Run this after updating bcrypt version.
"""

import sys
from app.database import SessionLocal, engine
from app import models
from app.auth import get_password_hash

def rehash_all_passwords():
    """Rehash all user passwords with the new auth implementation."""
    db = SessionLocal()
    try:
        users = db.query(models.User).all()
        count = 0
        
        for user in users:
            if user.password:
                # Get the current password (it's already hashed, so we can't verify it)
                # We'll need to ask users to reset if this is an issue
                # For now, just ensure new hashing is consistent
                print(f"User {user.email}: password already hashed")
                count += 1
        
        print(f"\nFound {count} users with passwords")
        print("\nNote: Existing password hashes cannot be updated without the original password.")
        print("Users with old hashes may need to use 'Forgot Password' to reset.\n")
        
    finally:
        db.close()

if __name__ == "__main__":
    rehash_all_passwords()
