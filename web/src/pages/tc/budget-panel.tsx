/**
 * Tab Ngân sách của Chi tiết Công trình (TC-05).
 *
 * PRD TC-05: "so sánh ngân sách được duyệt với chi phí đã phát sinh, đã cam kết và dự kiến
 * còn phải chi theo từng mã chi phí; cảnh báo sớm khi có nguy cơ vượt ngân sách".
 *
 * Bốn cột đứng cạnh nhau theo đúng thứ tự đó, vì câu hỏi của chỉ huy trưởng luôn là "còn
 * được chi bao nhiêu", không phải "đã chi bao nhiêu". Cột "Đã cam kết" không bỏ được: đơn
 * hàng đã ký mà chưa có hoá đơn vẫn là tiền chắc chắn phải trả, và bỏ nó ra thì cảnh báo
 * luôn đến sau khi đã tiêu — tức là không còn sớm.
 *
 * Dòng "lợi nhuận mục tiêu" do CSDL lọc theo quyền, không phải giao diện tự giấu (Mẫu D).
 */

import { AlertTriangle } from 'lucide-react';
import type { BudgetHealth } from '@nvg/shared';
import {
  BUDGET_HEALTH_META,
  COST_GROUP_LABELS,
  formatCurrency,
  summarizeBudget,
} from '@nvg/shared';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useSiteBudgetStatus } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';

/**
 * Mức độ an toàn của ngân sách.
 *
 * KHÔNG dùng nhãn trạng thái Lozenge: Lozenge dành riêng cho 5 nhãn trạng thái chuẩn của hồ
 * sơ (Content Guidelines 5.1), còn đây là một chỉ báo tính ra từ số tiền, không phải bước
 * của một hồ sơ. Vẫn dùng đúng bộ màu trạng thái và LUÔN kèm chữ (6.8).
 */
const HEALTH_STYLES: Record<BudgetHealth, string> = {
  trong_ngan_sach: 'text-status-completed',
  sap_vuot: 'text-status-pending',
  vuot_ngan_sach: 'text-status-overdue',
};

function HealthBadge({ health }: { health: BudgetHealth }) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${HEALTH_STYLES[health]}`}>
      {health !== 'trong_ngan_sach' && <AlertTriangle className="size-4 shrink-0" aria-hidden />}
      {BUDGET_HEALTH_META[health].label}
    </span>
  );
}

export function BudgetPanel({ siteId }: { siteId: string }) {
  const { data, isLoading, error } = useSiteBudgetStatus(siteId);

  if (isLoading) return <TableSkeleton rows={4} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;

  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState message="Chưa có ngân sách thi công cho công trình này. Ngân sách được lập từ bản dự toán đã phê duyệt ở gói thầu hoặc dự án thiết kế nguồn — không nhập lại tại công trường." />
    );
  }

  const total = summarizeBudget(
    rows.map((r) => ({
      budgetedAmount: r.budgeted_amount,
      actualAmount: r.actual_amount,
      committedAmount: r.committed_amount,
    })),
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface-sunken p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="font-medium">Toàn công trình</p>
          <HealthBadge health={total.health} />
        </div>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-fg-subtle">Ngân sách được duyệt</dt>
            <dd className="mt-0.5">{formatCurrency(total.budgeted)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Đã phát sinh</dt>
            <dd className="mt-0.5">{formatCurrency(total.actual)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Đã cam kết</dt>
            <dd className="mt-0.5">{formatCurrency(total.committed)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Còn được chi</dt>
            <dd className="mt-0.5 font-semibold">{formatCurrency(total.remaining)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-fg-subtle">
          Chi phí đã phát sinh và đã cam kết do Mua hàng, Kho và Kế toán cập nhật khi có chứng
          từ. Ở bản hiện tại các cột đó còn bằng 0 vì ba phân hệ này thuộc Giai đoạn 2.
        </p>
      </section>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full min-w-[52rem] border-collapse">
          <caption className="sr-only">
            Ngân sách so với chi phí thực tế theo từng mã chi phí
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-subtle">
              <th scope="col" className="px-3 py-2 font-medium">Mã chi phí</th>
              <th scope="col" className="px-3 py-2 font-medium">Nhóm</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Ngân sách</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Đã phát sinh</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Đã cam kết</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Còn được chi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const line = summarizeBudget([
                {
                  budgetedAmount: row.budgeted_amount,
                  actualAmount: row.actual_amount,
                  committedAmount: row.committed_amount,
                },
              ]);
              const warn = line.health !== 'trong_ngan_sach';

              return (
                <tr key={row.cost_code} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {row.name}
                  </th>
                  <td className="px-3 py-2">{COST_GROUP_LABELS[row.cost_group]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(row.budgeted_amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(row.actual_amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(row.committed_amount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {/* Cảnh báo KHÔNG chỉ bằng màu — luôn kèm chữ và biểu tượng
                        (Content Guidelines 6.8). */}
                    <span
                      className={
                        warn ? 'inline-flex items-center gap-1 text-status-overdue' : undefined
                      }
                    >
                      {warn && <AlertTriangle className="size-4 shrink-0" aria-hidden />}
                      {formatCurrency(line.remaining)}
                      {warn && (
                        <span className="sr-only">
                          {' '}
                          — {BUDGET_HEALTH_META[line.health].label}
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
