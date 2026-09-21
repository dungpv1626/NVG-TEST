/**
 * Nhật ký thao tác và truy cập dữ liệu nhạy cảm (NEN-07).
 *
 * PRD NEN-07: "Ghi nhật ký truy cập và thao tác (ai xem, ai sửa, khi nào) đối với dữ liệu
 * nhạy cảm: giá vốn, lợi nhuận, lương, nội dung thương thảo, dữ liệu thuế/ngân hàng."
 *
 * ## Màn hình chỉ đọc, không có ngoại lệ
 *
 * `audit_logs` và `sensitive_access_logs` không ai ghi được từ trình duyệt — đường ghi duy
 * nhất là hàm `SECURITY DEFINER` và trigger. Không có nút sửa, không có nút xóa: nhật ký
 * sửa được thì không còn là nhật ký.
 *
 * ## ⚠️ `audit_logs` hiện KHÔNG có nguồn ghi nào
 *
 * Đo trên CSDL thật ngày 20/09/2026: `sensitive_access_logs` có 2.434 dòng, `audit_logs` có **0**,
 * và không một hàm nào trong `pg_proc` chứa lệnh ghi vào bảng đó. Chú thích ở migration `0049`
 * nói `adjust_timesheet` ghi vào đây — đối chiếu lại thì không đúng.
 *
 * Bảng vẫn có ích khi được nối: nó là chỗ duy nhất trả lời NEN-03 "lịch sử xử lý đầy đủ" theo
 * chiều NGANG, xuyên mọi loại hồ sơ. Hiện lịch sử nằm rải ở bảng lịch sử riêng của từng loại
 * (giai đoạn cơ hội, phiên bản tài liệu, bước phê duyệt), nên tra "hôm qua ai sửa gì" phải mở
 * từng hồ sơ. Nối cái gì vào đây là quyết định nghiệp vụ — ghi ra để Haan quyết, không tự làm.
 *
 * Trạng thái rỗng vì vậy phải nói đúng sự thật, đừng để người đọc chờ dữ liệu sẽ không bao giờ tới.
 *
 * ## Một chỗ cố ý KHÔNG ghi log
 *
 * Chỉ huy trưởng xem ngân sách công trình mình phụ trách KHÔNG sinh dòng
 * `sensitive_access_logs` (migration `0069`), để bảng không phình vì một thao tác lặp lại
 * hằng ngày. NEN-07 đọc theo chữ là "mọi lượt xem", nên đây là chỗ đang chờ Haan xác nhận —
 * ghi ra đây để người đọc nhật ký không tưởng là mất dấu vết.
 */

import { useState } from 'react';
import { formatDateTime } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuditLogs, useSensitiveAccessLogs } from '@/hooks/use-admin';
import { NenNav } from './nen-nav';

/**
 * Nhãn thao tác. Gộp cả `audit_logs.action` lẫn `sensitive_access_logs.action` vì hai bảng
 * dùng chung phần lớn giá trị; hai bảng có thêm `view`/`edit` riêng.
 *
 * Giá trị lạ hiện NGUYÊN VĂN chứ không đoán: một mã chưa có nhãn phải nhìn ra ngay để đi
 * thêm nhãn, chứ không lặng lẽ hiện thành một chữ gần đúng.
 */
const ACTION_LABELS: Record<string, string> = {
  insert: 'Tạo mới',
  update: 'Chỉnh sửa',
  delete: 'Xóa',
  approve: 'Phê duyệt',
  reject: 'Từ chối',
  view: 'Xem',
  edit: 'Sửa',
};

/** Nhóm dữ liệu nhạy cảm — bốn nhóm của hàm `rls_sees_sensitive`. */
const KIND_LABELS: Record<string, string> = {
  cost: 'Giá vốn',
  profit: 'Lợi nhuận',
  salary: 'Lương',
  personal: 'Hồ sơ cá nhân',
};

/**
 * Nhãn loại đối tượng, khoá theo TÊN BẢNG.
 *
 * Cố ý tách khỏi `ENTITY_TYPE_LABELS` của Top Bar: bảng đó khoá theo tên số ÍT do hàm
 * `global_search` sinh ra (`construction_site`), còn nhật ký ghi thẳng tên bảng số nhiều
 * (`construction_sites`). Gộp hai bộ khoá khác nhau vào một bảng tra là cách chắc chắn để
 * một bên im lặng không tra được.
 */
const ENTITY_LABELS: Record<string, string> = {
  estimates: 'Dự toán',
  employees: 'Nhân sự',
  construction_sites: 'Công trình',
  purchase_requests: 'Đề nghị mua',
  quotation_items: 'Dòng báo giá nhà cung cấp',
  profit_loss_report: 'Báo cáo lãi/lỗ',
  inventory_items: 'Tồn kho',
  unit_prices: 'Đơn giá & định mức',
  contracts: 'Hợp đồng',
  payment_requests: 'Đề nghị thanh toán',
  project_budgets: 'Ngân sách công trình',
  quotes: 'Báo giá',
};

const TABS = ['thao-tac', 'nhay-cam'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  'thao-tac': 'Thao tác dữ liệu',
  'nhay-cam': 'Truy cập dữ liệu nhạy cảm',
};

export function AuditLogPage() {
  const [tab, setTab] = useState<Tab>('thao-tac');
  const audit = useAuditLogs();
  const sensitive = useSensitiveAccessLogs();

  const active = tab === 'thao-tac' ? audit : sensitive;

  return (
    <>
      <NenNav />
      <PageHeader
        title="Nhật ký"
        description="Ai làm gì, ai xem dữ liệu nhạy cảm, khi nào. Chỉ đọc — không sửa, không xóa được từ giao diện."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Nhật ký' }]}
      />

      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={setTab}
        getLabel={(t) => TAB_LABELS[t]}
      />

      <div className="mt-4">
        {active.isLoading && <TableSkeleton columns={4} />}
        {active.error && (
          <ErrorState message={toUserMessage(active.error)} onRetry={() => void active.refetch()} />
        )}

        {tab === 'thao-tac' && !audit.isLoading && !audit.error && (
          <>
            {(audit.data ?? []).length === 0 ? (
              <EmptyState message="Chưa có thao tác nào được ghi nhận. Hiện chưa có nghiệp vụ nào ghi vào bảng này — lịch sử sửa đổi đang nằm ở bảng lịch sử riêng của từng loại hồ sơ, xem tab Lịch sử trên màn hình Chi tiết." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
                <table className="w-full min-w-[680px] border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-fg-subtle">
                      <th className="p-3 font-medium">Thời điểm</th>
                      <th className="p-3 font-medium">Người thực hiện</th>
                      <th className="p-3 font-medium">Thao tác</th>
                      <th className="p-3 font-medium">Đối tượng</th>
                      <th className="p-3 font-medium">Nguyên nhân</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(audit.data ?? []).map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-b-0">
                        <td className="p-3 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                        <td className="p-3">{l.actor?.full_name ?? 'Hệ thống'}</td>
                        <td className="p-3">{ACTION_LABELS[l.action] ?? l.action}</td>
                        <td className="p-3">{ENTITY_LABELS[l.entity_type] ?? l.entity_type}</td>
                        <td className="p-3">{l.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'nhay-cam' && !sensitive.isLoading && !sensitive.error && (
          <>
            {(sensitive.data ?? []).length === 0 ? (
              <EmptyState message="Chưa có lượt truy cập dữ liệu nhạy cảm nào được ghi nhận." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-fg-subtle">
                      <th className="p-3 font-medium">Thời điểm</th>
                      <th className="p-3 font-medium">Người truy cập</th>
                      <th className="p-3 font-medium">Nhóm dữ liệu</th>
                      <th className="p-3 font-medium">Đối tượng</th>
                      <th className="p-3 font-medium">Hành vi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sensitive.data ?? []).map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-b-0">
                        <td className="p-3 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                        <td className="p-3">{l.actor?.full_name ?? 'Hệ thống'}</td>
                        <td className="p-3">{KIND_LABELS[l.sensitive_kind] ?? l.sensitive_kind}</td>
                        <td className="p-3">{ENTITY_LABELS[l.entity_type] ?? l.entity_type}</td>
                        <td className="p-3">{ACTION_LABELS[l.action] ?? l.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-3 text-fg-subtle">
        Hiển thị 200 dòng gần nhất. Chỉ huy trưởng xem ngân sách công trình mình phụ trách cố ý
        không sinh dòng nhật ký truy cập, để bảng không phình vì thao tác lặp lại hằng ngày.
      </p>
    </>
  );
}
