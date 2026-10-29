/**
 * Hợp đồng cho thuê giàn giáo đã ký → các đơn thuê đã lập từ nó (G5, migration 0245; C1).
 *
 * Đơn thuê do Xưởng NVS lập ở «Cho thuê giàn giáo» → «Lập từ hợp đồng cho thuê đã ký» — khách, ngày,
 * dòng hàng và giá lấy sẵn, không nhập lại. Thẻ này chỉ hiện với người đọc được đơn thuê (RLS), và chỉ
 * mời lập đơn khi người xem có quyền sửa phân hệ Sản xuất – Cho thuê.
 */

import { Link } from 'react-router-dom';
import { formatDate } from '@nvg/shared';
import { useContractRentalAgreements } from '@/hooks/use-sx-rental';
import { useCan } from '@/lib/auth';

const STATUS: Record<string, string> = {
  dang_thue: 'Đang thuê',
  da_thu_hoi: 'Đã thu hồi',
  huy: 'Đã huỷ',
};

export function ContractRentalsCard({ contractId }: { contractId: string }) {
  const canView = useCan('SX', 'view');
  const canEdit = useCan('SX', 'edit');
  const { data } = useContractRentalAgreements(contractId, canView);
  if (!canView) return null;
  return (
    <section aria-label="Đơn thuê theo hợp đồng" className="space-y-2 rounded-card bg-surface p-4">
      <h3 className="font-semibold">Đơn thuê giàn giáo theo hợp đồng</h3>
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-fg-subtle">
          Chưa lập đơn thuê nào từ hợp đồng này.
          {canEdit && (
            <>
              {' '}
              <Link to="/sx/tai-san-cho-thue" className="text-brand">
                Lập đơn thuê từ hợp đồng
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {(data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <Link to={`/sx/tai-san-cho-thue/${a.id}`} className="font-medium text-brand">
                {a.code}
              </Link>
              <span className="text-fg-subtle">
                Từ {formatDate(a.start_date)} · {STATUS[a.status] ?? a.status}
                {a.is_internal ? ' · nội bộ' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
