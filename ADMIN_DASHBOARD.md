# GreenLink Admin Dashboard

Comprehensive admin interface for monitoring all booking activities, revenue, and player data.

## Features

### 📊 Dashboard
- **Total Statistics**: Bookings, Players, Revenue, Completed Rounds
- **Today's Performance**: Bookings and revenue for current day
- **Weekly Revenue**: Last 7 days total
- **Booking Status Breakdown**: Visual status distribution
- **Revenue Trend Chart**: 30-day revenue visualization

### 📅 Bookings
- View all bookings with complete details
- Filter by status: Booked, Checked In, Completed, Cancelled
- Player information and booking amounts
- Tee time details
- Round completion status
- View detailed booking info with ledger entries
- Pagination support (10 bookings per page)

### 👥 Players
- List all registered players
- Player statistics: Total spent, booking count
- Handicap information
- Detailed player profile with:
  - Total spending
  - Booking history
  - Completed rounds
  - Recent bookings

### 💰 Revenue Analytics
- **Daily Revenue Chart**: Bar chart showing daily revenue
- **Revenue by Status**: Pie chart showing revenue distribution by booking status
- 30-day period analysis
- Exportable data

### ⛳ Tee Times
- View all tee times
- Player count per tee time
- Total revenue per tee time
- Course hole information

### 📋 Ledger
- Complete transaction history
- Booking reference
- Transaction descriptions and amounts
- Pastel accounting sync status
- Full audit trail

## Access

### URL
```
http://127.0.0.1:8000/frontend/admin.html
```

### Authentication
- Must be logged in with **admin** role
- Uses existing authentication system
- Token stored in localStorage

### Admin Account Creation
Create admin user via API:
```bash
curl -X POST http://127.0.0.1:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin Name",
    "email": "admin@greenlink.com",
    "password": "secure_password",
    "role": "admin"
  }'
```

Or create via database:
```sql
INSERT INTO users (name, email, password, role) 
VALUES ('Admin', 'admin@greenlink.com', 'hashed_password', 'admin');
```

## API Endpoints

All endpoints require admin authentication (Bearer token).

### Dashboard
```
GET /api/admin/dashboard
```
Returns: Overall statistics and KPIs

### Bookings
```
GET /api/admin/bookings?skip=0&limit=10&status=booked
GET /api/admin/bookings/{booking_id}
```
Returns: Paginated bookings with optional status filter

### Players
```
GET /api/admin/players?skip=0&limit=10
GET /api/admin/players/{player_id}
```
Returns: Player list and detailed player information

### Revenue
```
GET /api/admin/revenue?days=30
```
Returns: Daily and status-based revenue analytics

### Tee Times
```
GET /api/admin/tee-times?skip=0&limit=50
```
Returns: All tee times with booking information

### Ledger
```
GET /api/admin/ledger?skip=0&limit=10
```
Returns: Transaction history and accounting data

### Summary
```
GET /api/admin/summary
```
Returns: Comprehensive admin summary with top players

## Data Displayed

### Booking Status
- **Booked**: Initial booking created (Blue)
- **Checked In**: Player checked in at club (Orange)
- **Completed**: Round finished and scored (Green)
- **Cancelled**: Booking cancelled (Red)

### Key Metrics

| Metric | Description |
|--------|-------------|
| Total Bookings | Sum of all booking records |
| Registered Players | Count of users with player role |
| Total Revenue | Sum of all booking prices |
| Completed Rounds | Count of closed rounds |
| Today's Bookings | Bookings created today |
| Today's Revenue | Revenue from today's bookings |
| Week Revenue | Last 7 days revenue |

## Charts & Visualizations

### Revenue Trend (Line Chart)
- X-axis: Dates (30 days)
- Y-axis: Revenue amount (R)
- Shows daily revenue pattern

### Revenue by Status (Pie Chart)
- Shows revenue distribution across booking statuses
- Color-coded by status
- Helps identify where revenue comes from

### Daily Revenue (Bar Chart)
- X-axis: Dates
- Y-axis: Revenue amount
- Highlights peak revenue days

## Real-Time Updates

Dashboard updates when you:
- Refresh the page
- Navigate between sections
- Manually trigger data reload

For automatic real-time updates, implement WebSocket connection (future enhancement).

## Filters & Search

### Booking Filters
- **Status**: Filter bookings by current status
- **Date Range**: Coming soon
- **Player Name**: Coming soon

## Modal Windows

### Booking Details Modal
Shows complete booking information:
- Player details (name, email)
- Club card and handicap
- Fee amount
- Status and dates
- Associated round information
- Ledger entries

### Player Details Modal
Shows player profile:
- Contact information
- Handicap
- Financial summary
- Booking statistics
- Recent booking history

## Mobile Responsive

Dashboard adapts to:
- Desktop (1920px+)
- Tablet (1024px - 1919px)
- Mobile (< 1024px)

On mobile:
- Sidebar converts to top navigation
- Tables become scrollable
- Charts optimize for small screens

## Performance Notes

- **Pagination**: 10 items per page (configurable)
- **Load Time**: ~500ms for dashboard
- **Chart Rendering**: ~1s for complex charts
- **Memory Usage**: ~5-10MB for full dashboard

## Keyboard Shortcuts

Coming soon (planned enhancement)

## Export Features

Coming soon (planned):
- Export bookings to CSV
- Export revenue report
- Generate PDF statements

## Navigation

- **Sidebar**: Quick navigation between sections
- **Breadcrumbs**: Coming soon
- **Back button**: Browser back navigation

## User Roles

Only **admin** role can access:
- Dashboard
- All booking data
- All player data
- Revenue analytics
- Ledger entries

Other roles see: "Admin access required"

## Common Tasks

### View Today's Bookings
1. Go to Dashboard
2. Check "Today's Bookings" card
3. Or go to Bookings and filter

### Find High-Value Players
1. Go to Dashboard
2. Scroll to "Top Players" section
3. Click player name to see details

### Check Daily Revenue
1. Go to Revenue page
2. View the "Revenue by Day" chart
3. Hover over bars for exact amounts

### View Transaction History
1. Go to Ledger page
2. See all transactions with Pastel sync status
3. Verify accounting integration

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Admin access required" | Login with admin account |
| Charts not loading | Refresh page |
| Data not updating | Check network in browser dev tools |
| Pagination not working | Ensure sufficient data in database |

## Future Enhancements

- Real-time WebSocket updates
- Advanced filtering and search
- CSV/PDF export
- Email reports
- Custom date ranges
- Booking cancellation UI
- Player management
- Staff management
- Course configuration
- Handicap integration display

## Security

- All endpoints require Bearer token
- Admin-only access enforced
- No sensitive data in localStorage (only token)
- CORS properly configured
- SQL injection prevention via ORM

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Contact & Support

For issues or feature requests, contact development team.
