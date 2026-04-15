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

export interface DashboardTargetContext {
  domain_key: string;
  domain_label: string;
  metric_key: string;
  metric_label: string;
  period_key: string;
  period_start: string;
  period_end: string;
  target_value: number;
  unit: string;
}

export interface AdminDashboardSummary {
  member_count: number;
  tee_occupancy: DashboardTeeOccupancy;
  tee_warnings: DashboardNotice[];
  recent_activity: DashboardActivityItem[];
  active_targets: DashboardTargetContext[];
  unpaid_bookings_today: number;
  no_show_risk_count: number;
  arrivals_due_count: number;
  close_day_ready: boolean;
}
