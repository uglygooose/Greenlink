# Admin Dashboard - Quick Start

## Access the Dashboard

1. **Start FastAPI** (if not already running):
```bash
uvicorn app.main:app --reload
```

2. **Go to Admin URL**:
```
http://127.0.0.1:8000/frontend/admin.html
```

3. **Login** with admin credentials:
   - Email: `admin@greenlink.com`
   - Password: Your admin password

If you suddenly get a `401 Invalid credentials`:
- Check `http://127.0.0.1:8000/health` and confirm `db_source` is what you expect (e.g. `DATABASE_URL`, not a fallback DB).
- Reset the password locally: `python reset_user_password.py admin@greenlink.com`

## What You Can See

### Dashboard (📊)
- **4 big numbers**: Total bookings, players, revenue, completed rounds
- **Today's stats**: Bookings and revenue for today
- **Status breakdown**: Visual bars showing booking status distribution
- **Revenue chart**: 30-day trend line

### Bookings (📅)
- **Table** of all bookings
- **Filter** by status: Booked, Checked In, Completed, Cancelled
- **Click "View"** to see full details with round info
- **Pagination**: 10 bookings per page

### Players (👥)
- **List** of all registered players
- **Stats** for each: Total spent, number of bookings
- **Click "View"** to see player details and booking history

### Revenue (💰)
- **Daily revenue chart**: Bar chart showing revenue each day
- **Revenue by status**: Pie chart showing which statuses generate most revenue
- Last 30 days

### Tee Times (⛳)
- **All tee times** with player count and total revenue
- **When**: Date and time of tee time
- **Who**: Number of players booked

### Ledger (📋)
- **All transactions** from bookings
- **Pastel sync status**: See which transactions synced to accounting
- **Full history**: Complete audit trail

## Key Metrics to Monitor

| Metric | What It Means |
|--------|---------------|
| Total Bookings | All golf bookings ever made |
| Registered Players | Active player accounts |
| Total Revenue | Total money from all bookings |
| Today's Revenue | How much earned today |
| Completed Rounds | Finished games with scores |

## Common Questions

**Q: How do I see who made the most money?**
A: Dashboard → Scroll down → "Top Players" section

**Q: How do I check today's income?**
A: Dashboard → "Today's Performance" card → See revenue

**Q: Can I see if a booking is paid?**
A: Bookings → Click "View" → See ledger entries and Pastel sync status

**Q: How many players registered this month?**
A: Dashboard shows total players, go to Players page to see new ones

**Q: Where's the revenue broken down by player?**
A: Revenue page → "Revenue by Status" or Players → Click player name

## Navigation Tips

1. **Top Left**: Click different menu items to switch pages
2. **Click "View"**: See full details for any booking or player
3. **Close Modal**: Click X or anywhere outside the popup
4. **Filters**: Use Status dropdown to filter bookings
5. **Pagination**: Use page numbers at bottom to see more items

## Data Updates

Dashboard updates when you:
- Switch between pages
- Click filters
- Refresh the page (F5)

Data is **live** - shows current database state.

## If Something's Wrong

**Table is empty?**
- Not logged in: Go back to login
- No data: Create some bookings first via frontend

**Charts not showing?**
- Refresh page
- Check if enough data exists (need at least 1 booking)

**Getting kicked out?**
- Session expired, log in again
- Check if admin role assigned to your account

## Admin Account Setup

If you don't have admin account yet:

1. Create via database:
```sql
INSERT INTO users (name, email, password, role)
VALUES ('Admin User', 'admin@greenlink.com', 'hashed_password', 'admin');
```

2. Or register via API with special admin flag (if implemented)

## What Admins Can Do

✅ View all bookings
✅ View all players and spending
✅ See revenue and analytics
✅ Check transaction history
✅ Monitor tee times
✅ View round scores
✅ See Pastel accounting sync status

❌ Edit/delete bookings (future feature)
❌ Modify player information (future feature)
❌ Cancel bookings (future feature)
❌ Refund transactions (future feature)

## Tips for Best Use

1. **Start with Dashboard**: Get overview of business
2. **Check Bookings**: See who's playing and when
3. **Monitor Revenue**: Use charts to track income
4. **Review Players**: Identify top customers
5. **Check Ledger**: Verify all transactions synced to Pastel

## Refresh Data

Data is live but to ensure you see newest:
- Click different page and come back
- Or refresh browser (F5)

## Export Data (Coming Soon)

Currently no export, but you can:
- Take screenshots of tables
- View source data in database
- Use database tools for reports

---

**That's it!** Your admin dashboard is ready to monitor the golf club operations.
