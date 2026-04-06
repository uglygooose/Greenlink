export interface DashboardActivityItem {
  id: string;
  description: string;
  source: string;
  type: string;
  amount: string;
  created_at: string;
}

export interface DashboardTeeOccupancy {
  booked_slots: number;
  total_slots: number;
  occupancy_pct: number | null;
}

export interface DashboardNotice {
  code: string;
  message: string;
}

export interface AdminDashboardSummary {
  member_count: number;
  tee_occupancy: DashboardTeeOccupancy;
  tee_warnings: DashboardNotice[];
  recent_activity: DashboardActivityItem[];
}
