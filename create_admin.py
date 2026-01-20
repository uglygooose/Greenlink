#!/usr/bin/env python3
"""
Create admin user in database with proper bcrypt hash
"""
from passlib.context import CryptContext
import mysql.connector

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Configuration
ADMIN_EMAIL = "admin@greenlink.com"
ADMIN_NAME = "Admin"
ADMIN_PASSWORD = "Admin123!@#"  # Change this!

# Generate bcrypt hash
hashed_password = pwd_context.hash(ADMIN_PASSWORD)

print("=" * 60)
print("Creating Admin User")
print("=" * 60)
print(f"Email: {ADMIN_EMAIL}")
print(f"Name: {ADMIN_NAME}")
print(f"Password: {ADMIN_PASSWORD}")
print(f"Hashed: {hashed_password}")
print()

# Connect to MySQL
try:
    conn = mysql.connector.connect(
        host="localhost",
        user="root",
        password="",  # Change if you have MySQL password
        database="greenlink_db"
    )
    
    cursor = conn.cursor()
    
    # Delete existing admin if any
    cursor.execute("DELETE FROM users WHERE email = %s", (ADMIN_EMAIL,))
    
    # Insert new admin
    cursor.execute(
        "INSERT INTO users (name, email, password, role) VALUES (%s, %s, %s, %s)",
        (ADMIN_NAME, ADMIN_EMAIL, hashed_password, "admin")
    )
    
    conn.commit()
    
    print("✓ Admin user created successfully!")
    print()
    print("Login with:")
    print(f"  Email: {ADMIN_EMAIL}")
    print(f"  Password: {ADMIN_PASSWORD}")
    
except Exception as e:
    print(f"✗ Error: {e}")
    print()
    print("If MySQL connection fails, use this SQL directly:")
    print(f'DELETE FROM users WHERE email = "{ADMIN_EMAIL}";')
    print(f'INSERT INTO users (name, email, password, role) VALUES ("{ADMIN_NAME}", "{ADMIN_EMAIL}", "{hashed_password}", "admin");')
finally:
    if 'cursor' in locals():
        cursor.close()
    if 'conn' in locals():
        conn.close()
