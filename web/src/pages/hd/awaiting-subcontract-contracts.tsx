/**
 * «Tổ đội đã duyệt chọn — chờ hợp đồng khoán» trên danh sách Hợp đồng (G2, 0246).
 *
 * Thi công không xem phân hệ Hợp đồng, nên người soạn hợp đồng (Dự án – Đấu thầu / Kinh doanh) nhận
 * việc ở đây: mỗi tổ đội đã được duyệt chọn mà chưa có hợp đồng khoán là một dòng, «Soạn hợp đồng
 * khoán» lập hợp đồng loại khoán tổ đội / thầu phụ rồi mở trang soạn từ mẫu như mọi hợp đồng khác.
 * Chỉ người được tạo hợp đồng mới thấy khối này (CSDL trả rỗng cho vai trò khác).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  PRICING_METHOD_LABELS,
  useCreateSubcontractContract,
  useSubcontractorsAwaitingContract,
} from '@/hooks/use-subcontracts';
import { useCan } from '@/lib/auth';

export function AwaitingSubcontractContracts() {
  const canCreate = useCan('HD', 'create');
  const { data } = useSubcontractorsAwaitingContract(canCreate);
  const create = useCreateSubcontractContract();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const rows = data ?? [];
  if (!canCreate || rows.length === 0) return null;

  return (
    <section
      aria-label="Tổ đội chờ hợp đồng khoán"
      className="mb-4 rounded-card bg-surface p-4"
      id="thau-phu"
    >
      <h2 className="mb-2 font-semibold">
        Tổ đội đã duyệt chọn — chờ hợp đồng khoán ({rows.length})
      </h2>
      {error && (
        <p role="alert" className="mb-2 text-status-overdue">
          {error}
        </p>
      )}
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.subcontractor_id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.name} — {r.scope_of_work}
              </p>
              <p className="text-fg-subtle">
                {r.site_code} · {PRICING_METHOD_LABELS[r.pricing_method]} ·{' '}
                {r.contract_value != null ? formatCurrency(r.contract_value) : 'Chưa có giá trị'}
                {r.approved_at && ` · duyệt ${formatDate(r.approved_at)}`}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={create.isPending}
              onClick={() => {
                setError(null);
                create
                  .mutateAsync({ subcontractorId: r.subcontractor_id })
                  .then((id) => navigate(`/hd/hop-dong/${id}`))
                  .catch((err: unknown) => setError(toUserMessage(err, 'create')));
              }}
            >
              Soạn hợp đồng khoán
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
