/**
 * Khối «Giá vốn» của một phiên bản báo giá (0244, gói G1).
 *
 * Chỉ hiện với vai trò xem được giá vốn (`rls_sees_sensitive('cost')` — Ban Giám đốc, Tài chính, Dự toán,
 * Thiết kế, Mua hàng; KSNB chỉ xem). Kinh doanh — người lập báo giá — không thấy khối này: Kinh doanh gửi
 * phê duyệt, người có quyền nhập giá vốn ở đây (kể cả khi báo giá đang chờ duyệt), người duyệt thấy lợi
 * nhuận trong hộp duyệt.
 *
 * Gấp lại mặc định: mỗi lượt mở là một dòng nhật ký truy cập dữ liệu nhạy cảm (NEN-07), không nạp sẵn.
 */

import { useState } from 'react';
import { formatCurrency, formatQuantity, lineAmount, parseQuantity } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import { FIELD_BOX } from '@/components/ui/field-box';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  usePriceMarginBrief,
  useQuoteCostEstimateOptions,
  useQuoteCostLines,
  useSaveQuoteCosts,
} from '@/hooks/use-quote-costs';
import { useQuoteItems, type QuoteRecord } from '@/hooks/use-quotes';
import { useAuth } from '@/lib/auth';
import { PriceMarginFigures } from '../phe-duyet/price-margin-preview';

export function QuoteCostPanel({ quote }: { quote: QuoteRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-sm border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium"
      >
        <span>Giá vốn và lợi nhuận</span>
        <span className="text-xs font-normal text-fg-subtle">
          {open ? 'Thu gọn' : 'Chỉ vai trò được xem giá vốn thấy khối này'}
        </span>
      </button>
      {open && <QuoteCostBody quote={quote} />}
    </div>
  );
}

function QuoteCostBody({ quote }: { quote: QuoteRecord }) {
  const { profile } = useAuth();
  // Kiểm soát nội bộ chỉ xem (0168, `auth_is_read_only`) — CSDL cũng chặn, ở đây chỉ để không hiện ô nhập.
  const isReadOnly = (profile?.assignments ?? []).every((a) => a.roleCode === 'KSNB');
  const editable =
    !isReadOnly &&
    quote.is_current_version &&
    quote.sent_to_customer_at === null &&
    (quote.status === 'draft' || quote.status === 'pending_approval');

  const brief = usePriceMarginBrief('quotes', quote.id);
  const { data: items = [] } = useQuoteItems(quote.id);
  const lines = useQuoteCostLines(quote.id, true);
  const options = useQuoteCostEstimateOptions(quote.id, editable);
  const save = useSaveQuoteCosts();

  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [estimateId, setEstimateId] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const savedCost = new Map((lines.data ?? []).map((l) => [l.quote_item_id, l.unit_cost]));
  const costOf = (id: string): string => {
    if (draft && id in draft) return draft[id]!;
    const v = savedCost.get(id);
    return v === null || v === undefined ? '' : String(v);
  };
  const usingEstimate =
    estimateId === undefined ? brief.data?.cost_source === 'du_toan' : estimateId !== null;
  const chosenEstimate =
    estimateId === undefined
      ? null // chưa chọn lại: CSDL đang giữ dự toán nào thì `brief` đã tính theo dự toán ấy
      : estimateId;

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({
        quoteId: quote.id,
        estimateId: usingEstimate
          ? (chosenEstimate ?? options.data?.[0]?.estimate_id ?? null)
          : null,
        items: usingEstimate
          ? []
          : items.map((i) => ({ quoteItemId: i.id, unitCost: costOf(i.id) || null })),
      });
      setDraft(null);
      setEstimateId(undefined);
      setSaved(true);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  if (lines.error) {
    return (
      <p className="border-t border-border px-3 py-2 text-fg-subtle">
        Không tải được giá vốn. {toUserMessage(lines.error)}
      </p>
    );
  }

  const estimateOptions = options.data ?? [];

  return (
    <div className="space-y-3 border-t border-border px-3 py-3">
      {brief.data && <PriceMarginFigures brief={brief.data} />}

      {editable && estimateOptions.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs text-fg-subtle">Nguồn giá vốn</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`cost-src-${quote.id}`}
              checked={!usingEstimate}
              onChange={() => setEstimateId(null)}
            />
            Nhập đơn giá vốn từng hạng mục
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input
              type="radio"
              name={`cost-src-${quote.id}`}
              checked={usingEstimate}
              onChange={() => setEstimateId(estimateOptions[0]!.estimate_id)}
            />
            Lấy từ dự toán đã duyệt
            {usingEstimate && (
              <select
                className={FIELD_BOX + ' w-auto'}
                value={chosenEstimate ?? estimateOptions[0]!.estimate_id}
                onChange={(e) => setEstimateId(e.target.value)}
              >
                {estimateOptions.map((o) => (
                  <option key={o.estimate_id} value={o.estimate_id}>
                    {o.code} (phiên bản {o.version}) · {o.source_label} ·{' '}
                    {o.total_cost !== null ? formatCurrency(o.total_cost) : 'chưa có giá vốn'}
                  </option>
                ))}
              </select>
            )}
          </label>
        </fieldset>
      )}

      {!usingEstimate && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-surface-sunken text-left text-xs text-fg-subtle">
              <tr>
                <th className="px-3 py-1.5 font-medium">Hạng mục</th>
                <th className="px-3 py-1.5 text-right font-medium">Khối lượng</th>
                <th className="px-3 py-1.5 text-right font-medium">Đơn giá bán</th>
                <th className="px-3 py-1.5 text-right font-medium">Đơn giá vốn</th>
                <th className="px-3 py-1.5 text-right font-medium">Thành tiền vốn</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const raw = costOf(i.id);
                const qty = parseQuantity(i.quantity);
                const amount = raw !== '' && qty !== null ? lineAmount(qty, raw) : null;
                return (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-3 py-1.5">{i.description}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatQuantity(i.quantity)} {i.unit ?? ''}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCurrency(i.unit_price)}
                    </td>
                    <td className="w-44 px-3 py-1.5">
                      {editable ? (
                        <MoneyInput
                          value={raw}
                          aria-label={`Đơn giá vốn — ${i.description}`}
                          onChange={(v) => {
                            setDraft((d) => ({ ...(d ?? {}), [i.id]: v }));
                            setSaved(false);
                          }}
                          placeholder="Chưa nhập"
                        />
                      ) : (
                        <span className="block text-right tabular-nums">
                          {raw !== '' ? formatCurrency(raw) : 'Chưa nhập'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {amount !== null ? formatCurrency(amount) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? 'Đang lưu…' : 'Lưu giá vốn'}
          </Button>
          {saved && <span className="text-fg-subtle">Đã lưu giá vốn.</span>}
          {quote.status === 'pending_approval' && (
            <span className="text-xs text-fg-subtle">
              Báo giá đang chờ duyệt: lưu xong, hệ thống tính lại người duyệt theo mức lợi nhuận tối
              thiểu.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
