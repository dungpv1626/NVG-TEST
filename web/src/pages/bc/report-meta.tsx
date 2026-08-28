/**
 * Metadata dùng chung cho các báo cáo BC (BC-06: "hiển thị kèm ngày cập nhật gần nhất và mức độ
 * hoàn thiện của dữ liệu — để Ban Giám đốc biết số liệu đã đầy đủ hay còn thiếu").
 *
 * Không có `report_snapshots` (CỐ Ý CHƯA làm, xem BUILD_PLAN 3G) — báo cáo đọc trực tiếp CSDL
 * mỗi lần mở trang, nên "ngày cập nhật gần nhất" chính là thời điểm truy vấn vừa chạy xong
 * (`dataUpdatedAt` của TanStack Query), không cần cột riêng nào để lưu.
 */

import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDateTime } from '@nvg/shared';

/** `dataUpdatedAt` = 0 khi chưa có lần fetch thành công nào — không hiện gì trong lúc đó. */
export function ReportFreshness({ dataUpdatedAt }: { dataUpdatedAt: number }) {
  if (!dataUpdatedAt) return null;
  return (
    <p className="mb-3 text-xs text-fg-subtle">Dữ liệu tính đến {formatDateTime(dataUpdatedAt)}.</p>
  );
}

/** Nói thẳng phần SỐ LIỆU BÁO CÁO NÀY chưa đo được — cùng nguyên tắc `DataCompletenessNote` của Dashboard. */
export function ReportIncompleteNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-md border border-border bg-surface-sunken px-3 py-2.5">
      <Info className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <p className="text-xs leading-relaxed text-fg-subtle">{children}</p>
    </div>
  );
}
