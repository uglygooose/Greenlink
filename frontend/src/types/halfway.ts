import type { DashboardActivityItem } from "./admin-dashboard";
import type { OrderSummary } from "./orders";

export interface HalfwaySummary {
  orders_today_count: number;
  active_queue_count: number;
  queue_orders: OrderSummary[];
  recent_transactions: DashboardActivityItem[];
}
