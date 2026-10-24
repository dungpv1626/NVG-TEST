/**
 * Bảng so giá đặt cạnh nhau — Đợt 4, 4B (PRD MH-04).
 *
 * Mỗi nhà cung cấp một cột; phần trên là các tiêu chí (tổng chi phí, giao, vận chuyển, hoá đơn VAT,
 * được nợ, bảo hành, ghi chú, tệp báo giá), phần dưới là đơn giá TỪNG mặt hàng cạnh GIÁ LẦN MUA
 * TRƯỚC. Dùng chung cho tab Báo giá của đề nghị mua và Hộp thư Phê duyệt — người duyệt đọc đúng
 * bảng Mua hàng dùng để chọn.
 *
 * Chỉ báo giá ĐỦ mặt hàng mới được xếp hạng: báo giá thiếu dòng có tổng nhỏ hơn mà không rẻ hơn.
 * Không có dòng «nên chọn» — người chọn, máy chỉ đặt cạnh nhau (PRD 2.3).
 */

import { useState } from 'react';
import { Check, FileText } from 'lucide-react';
import {
  QUOTATION_STATUS_LABELS,
  SUPPLIER_CLASS_LABELS,
  formatCurrency,
  formatDate,
  formatNumber,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import {
  quotationFileUrl,
  type BoardQuotation,
  type QuotationBoard,
} from '@/hooks/use-purchase-pool';

const EM_DASH = '—';

function vatLabel(v: boolean | null): string {
  if (v === true) return 'Có';
  if (v === false) return 'Không';
  return 'Chưa hỏi';
}

export function QuotationBoardTable({
  board,
  canChoose = false,
  choosing = false,
  onChoose,
}: {
  board: QuotationBoard;
  canChoose?: boolean;
  choosing?: boolean;
  onChoose?: (quotation: BoardQuotation) => void;
}) {
  const quotes = board.quotations;
  const [fileError, setFileError] = useState<string | null>(null);

  async function openFile(path: string) {
    setFileError(null);
    try {
      window.open(await quotationFileUrl(path), '_blank', 'noopener');
    } catch {
      setFileError('Không mở được tệp báo giá. Thử lại sau, hoặc nhờ Mua hàng gửi lại tệp.');
    }
  }

  const chosen = (q: BoardQuotation) => (q.status === 'duoc_chon' ? 'bg-brand-subtle/60' : '');
  const pending = (q: BoardQuotation) => q.status === 'cho_bao_gia';

  const criteria: {
    label: string;
    render: (q: BoardQuotation) => React.ReactNode;
    strong?: boolean;
  }[] = [
    {
      label: 'Tổng chi phí',
      strong: true,
      render: (q) =>
        pending(q) ? (
          'Chưa có giá'
        ) : (
          <>
            {formatCurrency(q.landed_total)}
            {q.missing_items > 0 ? (
              <span className="block text-xs font-normal text-status-overdue">
                Thiếu giá {q.missing_items} mặt hàng — chưa so được
              </span>
            ) : q.cost_rank === 1 ? (
              <span className="block text-xs font-normal text-fg-subtle">
                Tổng chi phí thấp nhất
              </span>
            ) : null}
          </>
        ),
    },
    {
      label: 'Chênh lệch so với thấp nhất',
      render: (q) =>
        q.cost_rank == null || q.cost_rank === 1
          ? EM_DASH
          : `+${formatCurrency(q.cost_gap_vs_lowest ?? 0)}`,
    },
    {
      label: 'Tiền hàng',
      render: (q) => (pending(q) ? EM_DASH : formatCurrency(q.goods_subtotal)),
    },
    {
      label: 'Thuế',
      render: (q) =>
        pending(q)
          ? EM_DASH
          : `${formatCurrency(q.tax_amount)} (${formatNumber(q.tax_rate_bp / 100)}%)`,
    },
    {
      label: 'Hao hụt',
      render: (q) => (q.wastage_rate_bp > 0 ? formatCurrency(q.wastage_amount) : EM_DASH),
    },
    { label: 'Vận chuyển', render: (q) => formatCurrency(q.shipping_fee) },
    {
      label: 'Thời hạn giao',
      render: (q) => (q.delivery_days != null ? `${q.delivery_days} ngày` : EM_DASH),
    },
    { label: 'Hoá đơn VAT', render: (q) => vatLabel(q.has_vat_invoice) },
    {
      label: 'Được nợ',
      render: (q) => (q.payment_term_days != null ? `${q.payment_term_days} ngày` : EM_DASH),
    },
    {
      label: 'Bảo hành',
      render: (q) => (q.warranty_months != null ? `${q.warranty_months} tháng` : EM_DASH),
    },
    {
      label: 'Hiệu lực đến',
      render: (q) => (q.valid_until ? formatDate(q.valid_until) : EM_DASH),
    },
    {
      label: 'Ghi chú',
      render: (q) => (
        <span className="block max-w-56 whitespace-normal text-left">{q.notes ?? EM_DASH}</span>
      ),
    },
    {
      label: 'Tệp báo giá',
      render: (q) =>
        q.document_path ? (
          <Button variant="link" size="sm" onClick={() => void openFile(q.document_path!)}>
            <FileText className="size-4" aria-hidden />
            Mở tệp
          </Button>
        ) : (
          'Chưa có'
        ),
    },
  ];

  return (
    <div className="space-y-2">
      {fileError && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {fileError}
        </p>
      )}
      <div className="overflow-x-auto rounded-card bg-surface">
        <table
          className="w-full border-collapse text-left"
          style={{ minWidth: `${14 + quotes.length * 12}rem` }}
        >
          <caption className="sr-only">
            Bảng so giá nhà cung cấp: tiêu chí và đơn giá từng mặt hàng, kèm giá lần mua trước
          </caption>
          <thead>
            <tr className="border-b border-border align-top">
              <th scope="col" className="w-56 px-4 py-3 text-xs font-medium text-fg-subtle">
                Tiêu chí
              </th>
              <th
                scope="col"
                className="w-40 px-4 py-3 text-right text-xs font-medium text-fg-subtle"
              >
                Lần mua trước
              </th>
              {quotes.map((q) => (
                <th
                  key={q.quotation_id}
                  scope="col"
                  className={`px-4 py-3 text-right font-normal ${chosen(q)}`}
                >
                  <span className="block font-semibold">{q.supplier_name}</span>
                  <span className="block text-xs text-fg-subtle">
                    {SUPPLIER_CLASS_LABELS[q.supplier_class]}
                    {q.quoted_date ? ` · Báo giá ${formatDate(q.quoted_date)}` : ''}
                  </span>
                  <span className="mt-1 block text-sm">
                    {q.status === 'duoc_chon' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-status-completed">
                        <Check className="size-4 shrink-0" aria-hidden />
                        {QUOTATION_STATUS_LABELS.duoc_chon}
                      </span>
                    ) : (
                      <span className="text-fg-subtle">{QUOTATION_STATUS_LABELS[q.status]}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr
                key={c.label}
                className={`border-b border-border ${c.strong ? 'bg-surface-sunken' : ''}`}
              >
                <th scope="row" className="px-4 py-2 font-normal text-fg-subtle">
                  {c.label}
                </th>
                <td className="px-4 py-2" />
                {quotes.map((q) => (
                  <td
                    key={q.quotation_id}
                    className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${
                      c.strong ? 'font-semibold' : ''
                    } ${chosen(q)}`}
                  >
                    {c.render(q)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-b border-border bg-surface-sunken">
              <th
                scope="rowgroup"
                colSpan={2 + quotes.length}
                className="px-4 py-2 text-xs font-semibold text-fg-subtle"
              >
                Đơn giá từng mặt hàng (đồng / đơn vị)
              </th>
            </tr>
            {board.lines.map((line) => {
              const prices = quotes
                .map((q) => line.prices[q.quotation_id])
                .filter((p): p is number => p != null)
                .map(Number);
              const lowest = prices.length > 1 ? Math.min(...prices) : null;
              return (
                <tr key={line.request_item_id} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-2 font-normal">
                    {line.name}
                    {line.specification ? ` — ${line.specification}` : ''}
                    <span className="block text-xs text-fg-subtle">
                      {formatNumber(Number(line.quantity))} {line.unit}
                      {line.item_code ? ` · ${line.item_code}` : ''}
                    </span>
                  </th>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg-subtle">
                    {line.last_purchase ? (
                      <>
                        {formatCurrency(line.last_purchase.unit_price)}
                        <span className="block text-xs">
                          {line.last_purchase.supplier_name}
                          {line.last_purchase.order_date
                            ? ` · ${formatDate(line.last_purchase.order_date)}`
                            : ''}
                        </span>
                      </>
                    ) : (
                      'Chưa mua lần nào'
                    )}
                  </td>
                  {quotes.map((q) => {
                    const p = line.prices[q.quotation_id];
                    return (
                      <td
                        key={q.quotation_id}
                        className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${chosen(q)}`}
                      >
                        {p == null ? (
                          <span className="text-fg-subtle">Không báo</span>
                        ) : (
                          <>
                            {formatCurrency(p)}
                            {lowest != null && Number(p) === lowest && (
                              <span className="block text-xs text-fg-subtle">
                                Đơn giá thấp nhất
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {canChoose && onChoose && (
              <tr>
                <th scope="row" className="px-4 py-3 font-normal text-fg-subtle">
                  <span className="sr-only">Thao tác</span>
                </th>
                <td />
                {quotes.map((q) => (
                  <td key={q.quotation_id} className="px-4 py-3 text-right">
                    {q.status !== 'cho_bao_gia' && q.missing_items === 0 && (
                      <Button disabled={choosing} onClick={() => onChoose(q)}>
                        Chọn nhà cung cấp này
                      </Button>
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {quotes
        .filter((q) => q.status === 'duoc_chon' && q.selection_reason)
        .map((q) => (
          <p
            key={q.quotation_id}
            className="rounded-card bg-surface-sunken px-4 py-3"
          >
            <span className="font-medium">Căn cứ chọn {q.supplier_name}: </span>
            {q.selection_reason}
          </p>
        ))}
    </div>
  );
}
