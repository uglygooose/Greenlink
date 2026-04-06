export interface MemberBreakdown {
  total: number;
  admin_count: number;
  staff_count: number;
  member_count: number;
  admin_pct: number;
  staff_pct: number;
  member_pct: number;
  no_account_count: number;
  new_member_count: number;
}

export interface OrderStatusCount {
  status: string;
  count: number;
  pct: number;
}

export interface OrderStatusBreakdown {
  total: number;
  collected_count: number;
  by_status: OrderStatusCount[];
}

export interface ReportsSummary {
  member_breakdown: MemberBreakdown;
  order_status_breakdown: OrderStatusBreakdown;
  course_count: number;
}
