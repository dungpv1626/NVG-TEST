/**
 * Hợp đồng cho thuê: giá trị ký và tiền thuê thực tế đến nay (gói C, 0256, câu 15).
 *
 * Giá trị ký giữ nguyên; thực tế = tiền thuê + bồi thường của các biên bản thu hồi ĐÃ KÝ của mọi đơn thuê
 * thuộc hợp đồng (kể cả đơn mở do điều chuyển). Quyết toán chỉ khi mọi đơn thuê đã tất toán — CSDL chặn
 * (`contracts_rental_settlement_gate`); lúc quyết toán máy ghi «Giá trị quyết toán» cạnh giá trị ký.
 * Hàm `contract_rental_actuals` chỉ trả cho người đọc được hợp đồng.
 */

import { formatCurrency, formatPercent } from '@nvg/shared';
import { useContractRentalActuals } from '@/hooks/use-sx-rental';

export function ContractRentalActualsCard({ contractId }: { contractId: string }) {
  const { data } = useContractRentalActuals(contractId);
  if (!data) return null;

  const signed = data.signedValue;
  const diff = signed !== null ? data.actualTotal - signed : null;
  const diffPercent = signed && signed > 0 && diff !== null ? (diff * 100) / signed : null;
  const over =
    diffPercent !== null &&
    data.overrunPercentLimit !== null &&
    diffPercent > data.overrunPercentLimit;

  return (
    <section aria-label="Tiền thuê thực tế" className="space-y-3 rounded-card bg-surface p-4">
      <h3 className="font-semibold">Giá trị ký và tiền thuê thực tế</h3>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-fg-subtle">Giá trị ký</dt>
          <dd className="font-medium">
            {signed !== null ? formatCurrency(signed) : 'Chưa đủ dữ liệu'}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-fg-subtle">Tiền thuê thực tế đến nay</dt>
          <dd className="font-medium">
            {data.agreements === 0 ? 'Chưa đủ dữ liệu' : formatCurrency(data.actualTotal)}
          </dd>
          {data.agreements > 0 && (
            <dd className="text-sm text-fg-subtle">
              Thuê {formatCurrency(data.actualRent)} · bồi thường{' '}
              {formatCurrency(data.actualCompensation)}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-sm text-fg-subtle">Chênh lệch so với giá trị ký</dt>
          <dd className={over ? 'font-medium text-status-overdue' : 'font-medium'}>
            {diff === null || data.agreements === 0
              ? 'Chưa đủ dữ liệu'
              : `${diff > 0 ? '+' : ''}${formatCurrency(diff)}${
                  diffPercent !== null
                    ? ` (${diff > 0 ? '+' : ''}${formatPercent(diffPercent)})`
                    : ''
                }`}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-fg-subtle">
        Tính từ biên bản thu hồi đã ký hai bên của {data.agreements} đơn thuê
        {data.depositOffset > 0 ? `; cọc đã cấn trừ ${formatCurrency(data.depositOffset)}` : ''}.
      </p>
      {over && (
        <p role="status" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          Thực tế vượt giá trị ký hơn {formatPercent(data.overrunPercentLimit!)} — lập phụ lục điều
          chỉnh giá trị hợp đồng ở tab Phát sinh.
        </p>
      )}
      {data.settledValue !== null ? (
        <p className="text-sm">
          Giá trị quyết toán: <strong>{formatCurrency(data.settledValue)}</strong>
        </p>
      ) : data.openAgreements > 0 ? (
        <p className="text-sm">
          Còn {data.openAgreements} đơn thuê chưa tất toán ({data.openCodes}) — Kế toán tất toán hết
          mới quyết toán được hợp đồng.
        </p>
      ) : null}
    </section>
  );
}
