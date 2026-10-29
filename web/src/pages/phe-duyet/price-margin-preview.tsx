/**
 * Doanh thu · giá vốn · lợi nhuận · điều kiện thanh toán · rủi ro của một báo giá / dự toán trong hộp duyệt
 * (0244, gói G1 — Tổng Giám đốc: «duyệt giá phải thể hiện doanh thu, chi phí, lợi nhuận, dòng tiền và rủi ro»).
 *
 * Số giá vốn / lợi nhuận do CSDL quyết ai thấy (`price_margin_brief`, Mẫu D, có nhật ký). Người duyệt không
 * xem được giá vốn (Kinh doanh có hạn mức báo giá) thấy câu nói rõ, không thấy số `0`.
 */

import {
  EMPTY_STATES,
  formatCurrency,
  formatNumber,
  marginWarning,
  QUOTE_PAYMENT_NOTE_DEFAULT,
} from '@nvg/shared';
import { usePriceMarginBrief, type PriceMarginBrief } from '@/hooks/use-quote-costs';

const toNum = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export function PriceMarginPreview({
  entityType,
  entityId,
}: {
  entityType: 'quotes' | 'estimates';
  entityId: string;
}) {
  const { data, isLoading, error } = usePriceMarginBrief(entityType, entityId);
  if (isLoading) return <div className="h-24 animate-pulse rounded-sm bg-surface-sunken" />;
  if (error || !data) {
    return (
      <p className="text-fg-subtle">
        Không tải được giá vốn và lợi nhuận của hồ sơ. Mở hồ sơ đầy đủ để xem.
      </p>
    );
  }
  return <PriceMarginFigures brief={data} />;
}

/** Khối số — dùng cả ở hộp duyệt lẫn tab Báo giá (khối «Giá vốn»). */
export function PriceMarginFigures({ brief }: { brief: PriceMarginBrief }) {
  const margin = toNum(brief.margin_percent);
  const min = toNum(brief.min_margin);
  const warning = marginWarning({
    seesCost: brief.sees_cost,
    marginPercent: margin,
    minMargin: min,
    costComplete: brief.cost_complete,
    routedToCeo: brief.routed_to_ceo,
    needsCeo: brief.needs_ceo,
  });
  const below = brief.sees_cost && brief.needs_ceo === true;

  return (
    <div className="space-y-3">
      {warning && (
        <p
          role="alert"
          className="rounded-sm border border-status-overdue bg-status-overdue-bg px-3 py-2 font-medium"
        >
          {warning}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure
          label="Doanh thu (trước thuế)"
          value={brief.revenue !== null ? formatCurrency(brief.revenue) : '—'}
          strong
        />
        {brief.sees_cost ? (
          <>
            <Figure
              label={brief.cost_source === 'du_toan' ? 'Giá vốn (theo dự toán)' : 'Giá vốn'}
              value={
                brief.cost_complete && brief.cost !== null
                  ? formatCurrency(brief.cost)
                  : 'Chưa đủ dữ liệu'
              }
            />
            <Figure
              label="Lợi nhuận"
              value={brief.profit !== null ? formatCurrency(brief.profit) : 'Chưa đủ dữ liệu'}
              strong
            />
            <Figure
              label="Tỷ lệ lợi nhuận"
              value={margin !== null ? `${formatNumber(margin, 2)}%` : 'Chưa đủ dữ liệu'}
              strong
              danger={below}
            />
            <Figure
              label="Mức tối thiểu của pháp nhân"
              value={min !== null ? `${formatNumber(min, 2)}%` : 'Chưa đặt — không áp'}
            />
          </>
        ) : (
          <div className="sm:col-span-2">
            <dt className="text-xs text-fg-subtle">Giá vốn và lợi nhuận</dt>
            <dd>Chỉ Ban Giám đốc, Tài chính và Dự toán xem được.</dd>
          </div>
        )}
      </dl>
      {brief.sees_cost && !brief.cost_complete && (
        <p className="text-xs text-fg-subtle">
          {EMPTY_STATES.notEnoughData}
          {brief.entity_type === 'quotes' &&
            ' Giá vốn nhập ở tab Báo giá của cơ hội, khối «Giá vốn và lợi nhuận».'}
        </p>
      )}

      {brief.entity_type === 'quotes' && (
        <div className="rounded-sm bg-surface-sunken px-3 py-2">
          <div className="text-xs text-fg-subtle">
            Điều kiện thanh toán{brief.payment_terms ? '' : ' (câu mặc định của văn bản báo giá)'}
          </div>
          <p className="mt-0.5 whitespace-pre-line">
            {brief.payment_terms ?? QUOTE_PAYMENT_NOTE_DEFAULT}
          </p>
        </div>
      )}
      <div className="rounded-sm bg-surface-sunken px-3 py-2">
        <div className="text-xs text-fg-subtle">Rủi ro người gửi nêu</div>
        <p className="mt-0.5 whitespace-pre-line">
          {brief.risk_note ?? 'Người gửi không ghi rủi ro.'}
        </p>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd
        className={[
          'tabular-nums',
          strong ? 'font-semibold' : '',
          danger ? 'text-status-overdue' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
