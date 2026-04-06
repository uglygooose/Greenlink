export interface TargetMetricCatalogItem {
  metric_key: string;
  label: string;
  unit: string;
}

export interface TargetDomainCatalogItem {
  domain_key: string;
  domain_label: string;
  metrics: TargetMetricCatalogItem[];
}

export interface TargetMetricCatalogResponse {
  items: TargetDomainCatalogItem[];
}

export interface ClubTarget {
  id: string;
  club_id: string;
  domain_key: string;
  domain_label: string;
  metric_key: string;
  metric_label: string;
  unit: string;
  period_key: string;
  period_start: string;
  period_end: string;
  target_value: number;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClubTargetListResponse {
  items: ClubTarget[];
  total_count: number;
}

export interface ClubTargetUpsertInput {
  domain_key: string;
  metric_key: string;
  period_key: string;
  period_start: string;
  period_end: string;
  target_value: number;
}
