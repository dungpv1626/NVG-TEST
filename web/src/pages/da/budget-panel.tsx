/**
 * Tab Ngân sách thi công của Chi tiết Gói thầu (DA-09).
 *
 * Đây là điểm bàn giao sang Giai đoạn 2: Thi công, Cung ứng và Kế toán làm việc trên đúng bộ
 * số này (TC-01, TC-05), không phải trên một file tổng giá gửi qua Zalo.
 *
 * ⚠️ Danh sách hiển thị NGẮN hay DÀI tuỳ vai trò: dòng "Lợi nhuận mục tiêu" bị RLS lọc bỏ với
 * vai trò không được xem lợi nhuận. Đó là Mẫu D, không phải lỗi tải thiếu.
 */

import { COST_GROUP_LABELS, formatCurrency, formatDateTime, type CostGroup } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { useProjectBudgets } from '@/hooks/use-bidding-projects';

export function BudgetPanel({
  projectId,
  canGenerate,
  budgetGeneratedAt,
  onGenerate,
  pending,
}: {
  projectId: string;
  canGenerate: boolean;
  budgetGeneratedAt: string | null;
  onGenerate: () => void;
  pending: boolean;
}) {
  const { data: budgets } = useProjectBudgets(projectId);

  if (!budgetGeneratedAt) {
    return (
      <EmptyState
        message="Chưa lập ngân sách thi công. Sau khi trúng thầu, chuyển bộ dự toán đã duyệt thành ngân sách theo nhóm chi phí để bàn giao cho Thi công."
        action={
          canGenerate ? (
            <Button variant="secondary" onClick={onGenerate} disabled={pending}>
              {pending ? 'Đang lập…' : 'Lập ngân sách thi công'}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const total = (budgets ?? []).reduce((sum, b) => sum + Number(b.budgeted_amount), 0);

  return (
    <div className="space-y-3">
      <p className="text-fg-subtle">
        Đã bàn giao lúc {formatDateTime(budgetGeneratedAt)}. Thi công và Cung ứng dùng đúng bộ số
        này để điều hành công trình.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-fg-subtle">
              <th className="px-4 py-2.5 font-medium">Mã chi phí</th>
              <th className="px-4 py-2.5 font-medium">Nhóm chi phí</th>
              <th className="px-4 py-2.5 text-right font-medium">Ngân sách</th>
              <th className="px-4 py-2.5 text-right font-medium">Đã cam kết</th>
              <th className="px-4 py-2.5 text-right font-medium">Đã phát sinh</th>
            </tr>
          </thead>
          <tbody>
            {(budgets ?? []).map((b) => (
              <tr key={b.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs">{b.cost_code}</td>
                <td className="px-4 py-3">{COST_GROUP_LABELS[b.cost_group as CostGroup]}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(b.budgeted_amount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-subtle">
                  {formatCurrency(b.committed_amount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-subtle">
                  {formatCurrency(b.actual_amount)}
                </td>
              </tr>
            ))}
            <tr className="bg-surface-sunken font-semibold">
              <td className="px-4 py-3" colSpan={2}>
                Tổng ngân sách
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(total)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
