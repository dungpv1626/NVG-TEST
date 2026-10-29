/**
 * Kế hoạch tuần (T3) và báo cáo tuần / tháng của công trường (T4) — migration 0242.
 *
 * Số liệu báo cáo do CSDL dựng (`site_report_data`) từ dữ liệu đã có; giao diện chỉ hiển thị. Ô nào
 * chưa có dữ liệu thì CSDL trả `null` — hiện «Chưa đủ dữ liệu», không hiện 0 (CLAUDE.md 5.2). Báo cáo
 * KHÔNG chứa tiền.
 */

import type { SiteChangeCause, SiteChangeDisplayStatus } from './tc-site-change';

// Thứ Hai của tuần: dùng `weekStartOf` của `kt-cash-forecast` (cùng quy ước `date_trunc('week')`).

export type SiteReportKind = 'tuan' | 'thang';

export const SITE_REPORT_KIND_LABELS: Readonly<Record<SiteReportKind, string>> = {
  tuan: 'Báo cáo tuần',
  thang: 'Báo cáo tháng',
};

export type SitePlanStatus = 'dang_lam' | 'xong';

export const SITE_PLAN_STATUS_LABELS: Readonly<Record<SitePlanStatus, string>> = {
  dang_lam: 'Đang làm',
  xong: 'Xong',
};

/** Cộng `days` ngày vào `yyyy-mm-dd`. */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Ngày đầu tháng chứa `yyyy-mm-dd`. */
export function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export interface SiteReportPlanRow {
  id: string;
  week_start: string;
  name: string;
  crew: string | null;
  assignee: string | null;
  milestone: string | null;
  target_quantity: number | null;
  unit: string | null;
  /** Tổng khối lượng đã ghi trong nhật ký của kỳ; chưa ghi số nào → null. */
  done_quantity: number | null;
  days_worked: number;
  status: SitePlanStatus;
  done_date: string | null;
  carried_over: boolean;
  note: string | null;
}

export interface SiteReportData {
  kind: SiteReportKind;
  period_start: string;
  period_end: string;
  generated_at: string;
  site: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    stage: string;
    commander: string | null;
    planned_end_date: string | null;
  };
  company: {
    code: string;
    short_name: string | null;
    legal_name: string | null;
    address: string | null;
    phone: string | null;
  };
  plan: SiteReportPlanRow[];
  logs: {
    days_in_period: number;
    days_logged: number;
    entries: number;
    days: { date: string; entries: number; workforce: number | null; weather: string | null }[];
  };
  milestones: {
    total: number;
    passed_total: number;
    passed_in_period: { label: string; passed_date: string | null }[];
    pending: {
      label: string;
      status: string;
      planned_end_date: string | null;
      overdue: boolean;
    }[];
    waiting_technical: number;
  };
  requests: {
    open: number;
    overdue: number;
    items: {
      entity_type: string;
      code: string | null;
      title: string;
      holder_label: string | null;
      holder_names: string[] | null;
      needed_date: string | null;
      overdue: boolean;
      waiting_since: string | null;
    }[];
  };
  issues: {
    opened_in_period: number;
    closed_in_period: number;
    open_now: number;
    overdue_now: number;
    items: {
      code: string | null;
      work_item: string | null;
      description: string;
      assignee: string | null;
      due_date: string | null;
      overdue: boolean;
    }[];
  };
  attendance: { crew: string; days: number; workdays: number | null; max_people: number | null }[];
  changes: {
    code: string | null;
    cause: SiteChangeCause;
    description: string;
    is_emergency: boolean;
    created_date: string;
    display_status: SiteChangeDisplayStatus;
    holder_label: string | null;
    is_closed: boolean;
  }[];
  weekly_reports: {
    code: string;
    period_start: string;
    period_end: string;
    highlights: string | null;
    problems: string | null;
  }[];
}

/**
 * Tỷ lệ đã làm / mục tiêu của một đầu việc — CHỈ khi có cả hai số thật. Không có thì null (giao diện
 * hiện «Chưa đủ dữ liệu»), không đoán.
 */
export function planProgressPercent(row: {
  target_quantity: number | null;
  done_quantity: number | null;
}): number | null {
  const target = row.target_quantity == null ? null : Number(row.target_quantity);
  const done = row.done_quantity == null ? null : Number(row.done_quantity);
  if (target == null || done == null || !(target > 0)) return null;
  return Math.round((done / target) * 100);
}
