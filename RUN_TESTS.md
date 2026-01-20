# How to Run and Test GreenLink

## Step 1: Update Database

First, apply the database changes:

```bash
# Connect to MySQL and run the migration
mysql -u root -p greenlink < migrate_db.sql
```

OR manually in MySQL:
```bash
mysql -u root -p
use greenlink;
source migrate_db.sql;
exit;
```

## Step 2: Start the Server

```bash
# Make sure you're in the project directory
cd /Users/mulweliramufhuhfhi/fastapi_mysql_app

# Start FastAPI server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

## Step 3: Open the Frontend

Open your browser and go to:
```
http://127.0.0.1:8000/frontend/index.html
```

## Step 4: Test the Complete Workflow

### A. Create User & Login
1. Open http://127.0.0.1:8000/frontend/index.html
2. Click "Create one" 
3. Fill in details and create user
4. Login with your credentials
5. You'll reach the Dashboard

### B. Create Tee Time & Book
1. Click "Open T-Sheet"
2. Select a date/time and click "Create"
3. Click "Bookings" on the tee time
4. Enter player details:
   - Name: John Doe
   - Email: john@test.com
   - Handicap: 12345 (important for check-in)
5. Click "Book"

**Check Server Console** - You should see:
```
[MOCK PASTEL] Syncing transaction
[MOCK PASTEL] Amount: R350.00
```

### C. Check-in Player
1. Go back to Dashboard
2. Click "Check-in"
3. In the scanner field, type: `12345` (the handicap number)
4. Click "Search Booking"
5. Click "✓ Check In" on the booking

**Check Server Console** - You should see:
```
[MOCK HANDICAP SA] Opening round for John Doe (Handicap: 12345)
[MOCK HANDICAP SA] Round ID: HSA-20251118-XXXXXXXX
```

You'll get an alert with the Handicap SA Round ID!

### D. Submit Scores
1. Go back to Dashboard
2. Click "Score Entry"
3. Enter the Booking ID (you can find it in the check-in alert or T-Sheet)
4. Click "Load Scorecard"
5. Fill in scores for all 18 holes (e.g., 4, 5, 3, etc.)
6. Watch the total calculate automatically
7. Click "✓ Submit Scorecard"

**Check Server Console** - You should see:
```
[MOCK HANDICAP SA] Submitting scores for round HSA-20251118-XXXXXXXX
[MOCK HANDICAP SA] Round closed successfully
```

## Troubleshooting

### Server won't start?
```bash
# Check if port 8000 is in use
lsof -i :8000

# Kill the process if needed
kill -9 <PID>

# Try again
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Database connection error?
Check your `.env` file:
```bash
cat .env
```

Should look like:
```
DATABASE_URL=mysql+pymysql://root:your_password@localhost/greenlink_db
SECRET_KEY=your-secret-key-here
```

### Can't find uvicorn?
```bash
# Install dependencies
pip3 install -r requirements.txt
```

## Quick Command Summary

```bash
# 1. Update database
mysql -u root -p greenlink < migrate_db.sql

# 2. Start server
uvicorn app.main:app --reload

# 3. Open browser
# http://127.0.0.1:8000/frontend/index.html
```

## What to Watch in Console

✅ Pastel sync on booking  
✅ Handicap SA round opening on check-in  
✅ Handicap SA round closing on score submission  

All mock integrations print to the server console!
