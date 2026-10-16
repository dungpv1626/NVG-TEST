/**
 * Nhãn ngắn + biểu tượng cho mảng cảnh báo và chỉ số hoạt động — dùng chung cho Tổng quan điều
 * hành và khung từng công ty, để cùng một mảng không mang hai tên ở hai nơi.
 */

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  FileText,
  Handshake,
  HardHat,
  IdCard,
  Layers,
  MapPinOff,
  PenTool,
  Stamp,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

type Icon = LucideIcon;

/** Nhãn NGẮN + biểu tượng cho từng mảng — tên đầy đủ nằm ở chú thích khi rê chuột. */
export const AREA: Record<string, { short: string; icon: Icon }> = {
  approvals_stale: { short: 'Phê duyệt', icon: Stamp },
  payments_stuck: { short: 'Đề nghị chi', icon: Wallet },
  receivables_overdue: { short: 'Phải thu', icon: ArrowDownLeft },
  payables_overdue: { short: 'Phải trả', icon: ArrowUpRight },
  contracts_overdue: { short: 'Hợp đồng', icon: FileText },
  sites_late: { short: 'Tiến độ', icon: Clock },
  sites_over_budget: { short: 'Ngân sách', icon: TrendingUp },
  rentals_overdue: { short: 'Giàn giáo', icon: Layers },
  hr_documents: { short: 'Giấy tờ NS', icon: IdCard },
  survey_waived: { short: 'Bỏ khảo sát', icon: MapPinOff },
};

/** Biểu tượng cho chỉ số hoạt động của từng công ty. */
export const PULSE: Record<string, { short: string; icon: Icon }> = {
  opportunities_open: { short: 'Cơ hội', icon: Handshake },
  contracts_active: { short: 'Hợp đồng', icon: FileText },
  contracts_pending: { short: 'HĐ chờ ký', icon: Stamp },
  sites_active: { short: 'Công trình', icon: HardHat },
  sites_warranty: { short: 'Bảo hành', icon: Check },
  designs_active: { short: 'Thiết kế', icon: PenTool },
  designs_waiting_customer: { short: 'Chờ khách', icon: Clock },
  rentals_active: { short: 'Cho thuê', icon: Layers },
  production_running: { short: 'Sản xuất', icon: HardHat },
};
