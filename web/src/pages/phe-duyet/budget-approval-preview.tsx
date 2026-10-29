/**
 * Hộp Phê duyệt (G4, 0249):
 *  - «Điều chỉnh ngân sách»: số cũ → số mới, lý do, nguyên nhân, trách nhiệm, ảnh hưởng.
 *  - «Vượt ngân sách» (đề nghị mua / chọn thầu phụ): dòng ngân sách lúc gửi — dự trù, cam kết, thực
 *    tế, giữ chỗ, còn lại, số vượt — và phần còn lại hiện tại. CSDL quyết ai đọc được.
 */

import { Link } from 'react-router-dom';
import { formatCurrency, formatDateTime } from '@nvg/shared';
import { Skeleton } from '@/components/ui/states';
import { useApprovalBudgetBrief, useBudgetAdjustment } from '@/hooks/use-site-handover';

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 tabular-nums">
      <span className="text-fg-subtle">{label}</span>
      <span className={strong ? 'font-semibold' : undefined}>{value}</span>
    </div>
  );
}

export function BudgetAdjustmentPreview({ adjustmentId }: { adjustmentId: string }) {
  const { data, isLoading } = useBudgetAdjustment(adjustmentId);
  return (
    <div className="space-y-2">
      <dt className="text-xs text-fg-subtle">Điều chỉnh ngân sách</dt>
      <dd className="space-y-1 text-sm">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !data ? (
          <p className="text-fg-subtle">Không đọc được đề nghị điều chỉnh này.</p>
        ) : (
          <>
            {data.site && (
              <p>
                <Link
                  to={`/tc/cong-trinh/${data.construction_site_id}?tab=ngan-sach`}
                  className="text-brand underline-offset-4 hover:underline"
                >
                  {data.site.code} — {data.site.name}
                </Link>
              </p>
            )}
            <Line label="Dòng" value={`${data.cost_code} — ${data.name}`} />
            <Line label="Số dự trù đang có" value={formatCurrency(data.old_amount)} />
            <Line label="Số dự trù đề nghị" value={formatCurrency(data.new_amount)} strong />
            <p>Lý do: {data.reason}</p>
            <p>Nguyên nhân: {data.cause}</p>
            <p>Trách nhiệm: {data.responsibility}</p>
            <p>Ảnh hưởng: {data.impact}</p>
          </>
        )}
      </dd>
    </div>
  );
}

export function OverBudgetPreview({ approvalId }: { approvalId: string }) {
  const { data, isLoading } = useApprovalBudgetBrief(approvalId, true);
  return (
    <div className="space-y-2">
      <dt className="text-xs text-fg-subtle">Vượt ngân sách</dt>
      <dd className="space-y-1 text-sm">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !data ? (
          <p className="text-fg-subtle">Không đọc được số ngân sách của hồ sơ này.</p>
        ) : (
          <>
            <p>
              {data.site_code} — {data.site_name} · dòng {data.cost_code}
              {data.line_name ? ` (${data.line_name})` : ''}, số lúc gửi{' '}
              {formatDateTime(data.checked_at)}
            </p>
            <Line label="Dự trù" value={formatCurrency(data.budgeted)} />
            <Line label="Đã cam kết" value={formatCurrency(data.committed)} />
            <Line label="Đã phát sinh" value={formatCurrency(data.actual)} />
            <Line label="Đề nghị gửi trước đang giữ chỗ" value={formatCurrency(data.reserved)} />
            <Line label="Còn lại" value={formatCurrency(data.remaining)} />
            <Line label="Giá trị hồ sơ" value={formatCurrency(data.amount)} />
            <Line label="Vượt" value={formatCurrency(data.overrun)} strong />
            <p className="text-fg-subtle">
              {data.tolerance_percent == null
                ? 'Pháp nhân chưa đặt dung sai — vượt bất kỳ số nào cũng phải duyệt.'
                : `Dung sai của pháp nhân: ${data.tolerance_percent} % số dự trù.`}
              {data.current_remaining != null &&
                ` Còn lại hiện tại: ${formatCurrency(data.current_remaining)}.`}
            </p>
          </>
        )}
      </dd>
    </div>
  );
}
