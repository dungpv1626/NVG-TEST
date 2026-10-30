/**
 * Biểu mẫu báo giá thuê / bán giàn giáo (PRD CRM-11; 5D 0209; G5 0245; gói C 0256).
 *
 * Từ 0256 báo giá thuê lập TRONG cơ hội của pháp nhân cho thuê (tab Báo giá) — khách lấy từ cơ hội,
 * Kinh doanh nhập một lần, không lập thêm báo giá chung. Trang «Báo giá thuê» của Xưởng dùng cùng biểu
 * mẫu ở chế độ chỉ xem.
 *
 * Kiểm tồn BA nhóm tách riêng (phiếu Ban Giám đốc, mảng giàn giáo bước 2): tồn chắc chắn ở kho, dự kiến
 * thu hồi TRƯỚC ngày cần (theo ngày trả dự kiến của đơn đang thuê) và đang sửa. Hai nhóm sau không bao
 * giờ cộng vào số chắc chắn — chỉ để Kinh doanh hẹn ngày giao có cơ sở.
 *
 * Đơn giá điền sẵn từ bảng giá (`sx.rental_daily_rate`); hạ thấp hơn bảng giá là giá đặc biệt, và công nợ
 * khách vượt hạn mức (`sx.customer_credit_limit`) — một trong hai thì «Gửi phê duyệt» chuyển Ban Giám đốc
 * duyệt. Máy không tự đặt giá: mã chưa có bảng giá thì người lập tự nhập.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@nvg/shared';
import { ZaloSend } from '@/components/share/zalo-send';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  RENTAL_QUOTE_STATUS_LABELS,
  useProductPrices,
  useRentalAvailability,
  useSaveRentalQuote,
  useSendRentalQuote,
  useSubmitRentalQuote,
  type AvailabilityRow,
  type RentalQuote,
  type RentalQuoteSentChannel,
} from '@/hooks/use-sx-rental';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { supabase } from '@/lib/supabase';
import { composeZaloMessage } from '@/lib/zalo-share';

/** Kênh gửi khách — cùng nhãn với báo giá CRM (0253). */
export const RENTAL_QUOTE_CHANNEL_LABELS: Readonly<Record<RentalQuoteSentChannel, string>> = {
  zalo: 'Zalo',
  email: 'Email',
  tan_tay: 'Gửi tận tay',
  khac: 'Khác',
};

/** Thông tin pháp nhân in ở đầu báo giá gửi khách. */
export interface CompanyHead {
  legal_name: string | null;
  short_name: string | null;
  address: string | null;
  phone: string | null;
  tax_code: string | null;
}

export function useCompanyHead(companyId: string | null) {
  return useQuery<CompanyHead | null, Error>({
    queryKey: ['company-head', companyId],
    enabled: Boolean(companyId),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('legal_name, short_name, address, phone, tax_code')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CompanyHead | null) ?? null;
    },
  });
}

interface LineDraft {
  quantity: string;
  kind: 'thue' | 'mua';
  unitPrice: string;
}

const selectClass = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function rentalDays(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

export function printRentalQuote(q: RentalQuote, company: CompanyHead | null | undefined) {
  const days =
    q.needed_date && q.expected_end_date ? rentalDays(q.needed_date, q.expected_end_date) : 0;
  const rows = q.items
    .map((l) => {
      const amount =
        l.kind === 'thue' ? l.unit_price * l.quantity * days : l.unit_price * l.quantity;
      return `<tr><td>${escapeHtml(l.material?.code ?? '')}</td><td>${escapeHtml(
        l.material?.name ?? '',
      )}</td><td>${l.kind === 'thue' ? 'Thuê' : 'Mua'}</td><td class="num">${formatNumber(
        l.quantity,
      )} ${escapeHtml(l.material?.unit ?? '')}</td><td class="num">${escapeHtml(
        formatCurrency(l.unit_price),
      )}${l.kind === 'thue' ? ' / ngày' : ''}</td><td class="num">${escapeHtml(
        formatCurrency(Math.round(amount)),
      )}</td></tr>`;
    })
    .join('');
  // Báo giá GỬI KHÁCH: tiêu đề pháp nhân cho thuê, không phải «Nhà Việt Group»; bản chưa duyệt in rõ
  // «Bản nháp» thay vì ghi trạng thái nội bộ (chạy thử NVS 30/10/2026).
  const approved = q.status === 'da_duyet';
  const letterhead = company
    ? `<div class="letterhead"><div><strong>${escapeHtml(
        company.legal_name ?? company.short_name ?? '',
      )}</strong>${escapeHtml(company.address ?? '')}${
        company.phone ? `<br/>Điện thoại: ${escapeHtml(company.phone)}` : ''
      }${company.tax_code ? `<br/>Mã số thuế: ${escapeHtml(company.tax_code)}` : ''}</div>
      <div style="text-align:right">Số: ${escapeHtml(q.code)}${
        approved ? '' : '<br/><strong>Bản nháp — chưa duyệt, không gửi khách</strong>'
      }</div></div>`
    : '';
  openPrintReport(
    `Báo giá giàn giáo ${q.code}`,
    `<dl>
      <div><dt>Khách hàng</dt><dd>${escapeHtml(q.customer?.name ?? '—')}</dd></div>
      <div><dt>Ngày cần hàng</dt><dd>${q.needed_date ? formatDate(q.needed_date) : '—'}</dd></div>
      <div><dt>Ngày dự kiến trả</dt><dd>${q.expected_end_date ? formatDate(q.expected_end_date) : '—'}</dd></div>
      <div><dt>Số ngày thuê</dt><dd>${days || '—'}</dd></div>
      <div><dt>Tiền đặt cọc</dt><dd>${escapeHtml(formatCurrency(q.deposit_amount))}</dd></div>
    </dl>
    <table><thead><tr><th>Mã</th><th>Tên</th><th>Hình thức</th><th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody></table>
    ${q.estimated_total !== null ? `<p><strong>Tổng giá trị: ${escapeHtml(formatCurrency(q.estimated_total))}</strong></p>` : ''}
    ${q.delivery_note ? `<p>Vận chuyển, bốc xếp: ${escapeHtml(q.delivery_note)}</p>` : ''}
    <p class="muted">Chưa gồm bồi thường thiếu – hỏng khi thu hồi; tính theo bảng giá bồi thường tại thời điểm thu hồi.</p>`,
    letterhead,
  );
}

export interface RentalQuoteEditorProps {
  companyId: string;
  /** Báo giá đang mở; `null` = lập mới (chỉ khi `canEdit`). */
  quote: RentalQuote | null;
  /** Cơ hội của báo giá mới (0256) — khách do CSDL lấy từ cơ hội. */
  opportunityId: string | null;
  /** Khách của cơ hội — dùng cho báo giá mới và số Zalo. */
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  /** Người chịu trách nhiệm cơ hội / quản lý (khớp `rls_rental_quote_row_writable`). */
  canEdit: boolean;
  /** Lý do chưa lập được (cơ hội chưa sang Báo giá…) — hiện thay cho các nút. */
  blockedNotice?: string | null;
  onSaved?: (id: string) => void;
}

export function RentalQuoteEditor({
  companyId,
  quote,
  opportunityId,
  customerId,
  customerName,
  customerPhone,
  canEdit,
  blockedNotice = null,
  onSaved,
}: RentalQuoteEditorProps) {
  const [neededDate, setNeededDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deposit, setDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Record<string, LineDraft>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [channel, setChannel] = useState<RentalQuoteSentChannel | ''>('');

  const { data: stock, isLoading, error } = useRentalAvailability(companyId, neededDate || null);
  const { data: rates } = useProductPrices('sx.rental_daily_rate');
  const { data: companyHead } = useCompanyHead(companyId);
  const save = useSaveRentalQuote();
  const submit = useSubmitRentalQuote();
  const send = useSendRentalQuote();

  // Nạp báo giá đang mở vào biểu mẫu (đổi báo giá thì nạp lại).
  useEffect(() => {
    setMessage(null);
    setChannel('');
    if (!quote) {
      setNeededDate('');
      setEndDate('');
      setDeliveryNote('');
      setDeposit('');
      setNotes('');
      setLines({});
      return;
    }
    setNeededDate(quote.needed_date ?? '');
    setEndDate(quote.expected_end_date ?? '');
    setDeliveryNote(quote.delivery_note ?? '');
    setDeposit(quote.deposit_amount ? String(quote.deposit_amount) : '');
    setNotes(quote.notes ?? '');
    setLines(
      Object.fromEntries(
        quote.items.map((i) => [
          i.material_id,
          { quantity: String(i.quantity), kind: i.kind, unitPrice: String(i.unit_price) },
        ]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nạp khi đổi báo giá
  }, [quote?.id]);

  const locked =
    !canEdit ||
    blockedNotice !== null ||
    (quote !== null && !['nhap', 'tu_choi'].includes(quote.status));
  const days = rentalDays(neededDate, endDate);

  function line(id: string): LineDraft {
    return lines[id] ?? { quantity: '', kind: 'thue', unitPrice: '' };
  }
  function setLine(id: string, patch: Partial<LineDraft>) {
    setLines((prev) => ({ ...prev, [id]: { ...line(id), ...patch } }));
  }
  function priceOf(s: AvailabilityRow, l: LineDraft): number {
    if (l.unitPrice) return Number(l.unitPrice);
    return l.kind === 'thue' ? (rates?.[s.material_id] ?? 0) : 0;
  }

  const chosen = useMemo(
    () =>
      (stock ?? [])
        .map((s) => ({ s, l: line(s.material_id) }))
        .filter(({ l }) => Number(l.quantity) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `line` đọc từ `lines`
    [stock, lines],
  );
  const total = chosen.reduce((t, { s, l }) => {
    const p = priceOf(s, l);
    return t + (l.kind === 'thue' ? p * Number(l.quantity) * days : p * Number(l.quantity));
  }, 0);
  const special = chosen.some(
    ({ s, l }) =>
      l.kind === 'thue' &&
      rates?.[s.material_id] !== undefined &&
      priceOf(s, l) < rates[s.material_id]!,
  );

  const blockedReason =
    chosen.length === 0
      ? 'Nhập số lượng ít nhất một mã.'
      : chosen.some(({ l }) => l.kind === 'thue') && days === 0
        ? 'Nhập ngày cần hàng và ngày dự kiến trả.'
        : chosen.some(({ s, l }) => priceOf(s, l) <= 0)
          ? 'Mỗi dòng cần đơn giá — mã chưa có bảng giá thì nhập tay.'
          : null;

  async function persist(): Promise<string | null> {
    if (blockedReason) return null;
    const id = await save.mutateAsync({
      id: quote?.id ?? null,
      companyId,
      customerId,
      opportunityId,
      neededDate: neededDate || null,
      expectedEndDate: endDate || null,
      deliveryNote: deliveryNote.trim() || null,
      depositAmount: Number(deposit || 0),
      notes: notes.trim() || null,
      lines: chosen.map(({ s, l }) => ({
        material_id: s.material_id,
        kind: l.kind,
        quantity: Number(l.quantity),
        unit_price: priceOf(s, l),
      })),
    });
    onSaved?.(id);
    return id;
  }

  async function onSave() {
    setMessage(null);
    try {
      if (await persist()) setMessage({ ok: true, text: 'Đã lưu nháp báo giá.' });
    } catch (e) {
      setMessage({ ok: false, text: toUserMessage(e, 'edit') });
    }
  }

  async function onSubmit() {
    setMessage(null);
    try {
      const id = await persist();
      if (!id) return;
      const result = await submit.mutateAsync(id);
      setMessage({
        ok: true,
        text:
          result === 'da_duyet'
            ? 'Báo giá theo bảng giá, công nợ trong hạn mức — đã duyệt, gửi khách được.'
            : 'Báo giá có giá đặc biệt hoặc công nợ vượt hạn mức — đã gửi Ban Giám đốc phê duyệt.',
      });
    } catch (e) {
      setMessage({ ok: false, text: toUserMessage(e, 'edit') });
    }
  }

  async function onSent() {
    if (!quote || !channel) return;
    setMessage(null);
    try {
      await send.mutateAsync({ quoteId: quote.id, channel });
      setMessage({ ok: true, text: 'Đã ghi báo giá đã gửi khách.' });
    } catch (e) {
      setMessage({ ok: false, text: toUserMessage(e, 'edit') });
    }
  }

  if (isLoading) return <TableSkeleton />;
  if (error) return <ErrorState message={toUserMessage(error, 'view')} />;

  const canMarkSent =
    canEdit && quote !== null && quote.status === 'da_duyet' && quote.sent_to_customer_at === null;

  return (
    <div className="space-y-4">
      {quote && (
        <p className="text-sm text-fg-subtle">
          Báo giá {quote.code} — {RENTAL_QUOTE_STATUS_LABELS[quote.status]}
          {quote.decision_note ? `: ${quote.decision_note}` : ''}
          {quote.sent_to_customer_at
            ? ` · Đã gửi khách ${formatDateTime(quote.sent_to_customer_at)}${
                quote.sent_channel ? ` qua ${RENTAL_QUOTE_CHANNEL_LABELS[quote.sent_channel]}` : ''
              }`
            : ''}
          .
        </p>
      )}
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={
            message.ok
              ? 'rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed'
              : 'rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue'
          }
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Khách hàng" hint="Theo cơ hội — sửa khách ở hồ sơ cơ hội.">
          <Input value={quote?.customer?.name ?? customerName ?? '—'} disabled readOnly />
        </Field>
        <Field label="Ngày cần hàng" hint="Dùng để tính hàng dự kiến thu hồi kịp.">
          <DateInput value={neededDate} onChange={setNeededDate} disabled={locked} />
        </Field>
        <Field label="Ngày dự kiến trả">
          <DateInput
            value={endDate}
            onChange={setEndDate}
            disabled={locked}
            min={neededDate || undefined}
          />
        </Field>
        <Field label="Vận chuyển, bốc xếp">
          <Input
            value={deliveryNote}
            disabled={locked}
            onChange={(e) => setDeliveryNote(e.target.value)}
            placeholder="Ai chịu, tới đâu"
          />
        </Field>
        <Field label="Tiền đặt cọc (đồng)">
          <MoneyInput value={deposit} onChange={setDeposit} disabled={locked} />
        </Field>
        <Field label="Ghi chú">
          <Input value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <ul className="divide-y divide-border rounded-card bg-surface">
        {(stock ?? [])
          .filter((s) => !locked || Number(line(s.material_id).quantity) > 0)
          .map((s) => {
            const l = line(s.material_id);
            const rate = rates?.[s.material_id];
            const qty = Number(l.quantity || 0);
            const price = priceOf(s, l);
            const isSpecial = l.kind === 'thue' && rate !== undefined && qty > 0 && price < rate;
            return (
              <li key={s.material_id} className="grid gap-3 p-3 lg:grid-cols-[1fr_7rem_7rem_9rem]">
                <div className="space-y-1">
                  <p className="font-medium">
                    {s.code} — {s.name}
                  </p>
                  <p className="text-sm">
                    Tồn chắc chắn: <strong>{formatNumber(s.available)}</strong> {s.unit ?? ''}
                    {qty > s.available && (
                      <span className="ml-2 font-medium text-status-overdue">
                        Thiếu {formatNumber(qty - s.available)} so với tồn chắc chắn
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-fg-subtle">
                    {neededDate
                      ? s.returning > 0
                        ? `Dự kiến thu hồi trước ${formatDate(neededDate)}: ${formatNumber(s.returning)} (${s.returningList
                            .map(
                              (r) =>
                                `${r.code} trả ${formatDate(r.date)}: ${formatNumber(r.quantity)}`,
                            )
                            .join('; ')}) — chưa chắc chắn`
                        : `Không có đơn nào dự kiến trả trước ${formatDate(neededDate)}`
                      : 'Nhập ngày cần hàng để xem hàng dự kiến thu hồi'}
                    {' · '}Đang sửa: {formatNumber(s.underRepair)}
                  </p>
                  <p className="text-sm text-fg-subtle">
                    Bảng giá thuê:{' '}
                    {rate === undefined ? 'Chưa cấu hình' : `${formatCurrency(rate)} / ngày`}
                  </p>
                </div>
                <Field label="Số lượng">
                  <Input
                    value={l.quantity}
                    inputMode="decimal"
                    disabled={locked}
                    onChange={(e) =>
                      setLine(s.material_id, { quantity: e.target.value.replace(/[^\d.]/g, '') })
                    }
                  />
                </Field>
                <Field label="Hình thức">
                  <select
                    value={l.kind}
                    disabled={locked}
                    onChange={(e) =>
                      setLine(s.material_id, { kind: e.target.value as 'thue' | 'mua' })
                    }
                    className={selectClass}
                  >
                    <option value="thue">Thuê</option>
                    <option value="mua">Mua</option>
                  </select>
                </Field>
                <Field label={l.kind === 'thue' ? 'Đơn giá / ngày' : 'Đơn giá bán'}>
                  <MoneyInput
                    value={
                      l.unitPrice || (l.kind === 'thue' && rate !== undefined ? String(rate) : '')
                    }
                    disabled={locked}
                    onChange={(v) => setLine(s.material_id, { unitPrice: v })}
                  />
                  {isSpecial && (
                    <span className="mt-1 block text-sm text-status-pending">
                      Giá đặc biệt — cần Ban Giám đốc duyệt
                    </span>
                  )}
                </Field>
              </li>
            );
          })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-sunken p-3">
        <div>
          <p className="font-medium">
            Giá trị báo giá:{' '}
            {quote && locked && quote.estimated_total !== null ? (
              formatCurrency(quote.estimated_total)
            ) : blockedReason ? (
              <span className="text-fg-subtle">Chưa đủ dữ liệu</span>
            ) : (
              formatCurrency(Math.round(total))
            )}
          </p>
          {special && !locked && (
            <p className="text-sm text-status-pending">
              Có dòng thấp hơn bảng giá — gửi đi sẽ chờ Ban Giám đốc duyệt.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {quote && (
              <Button variant="secondary" onClick={() => printRentalQuote(quote, companyHead)}>
                <Printer className="size-4" aria-hidden />
                {quote.status === 'da_duyet' ? 'In báo giá' : 'In bản nháp'}
              </Button>
            )}
            {quote?.status === 'da_duyet' && (
              <ZaloSend
                canSend={canEdit}
                showHistory={false}
                entityType="rental_quotes"
                entityId={quote.id}
                phone={customerPhone}
                message={composeZaloMessage({
                  recipientName: quote.customer?.name ?? null,
                  companyName: companyHead?.short_name ?? null,
                  subject: `báo giá thuê giàn giáo ${quote.code}`,
                  details:
                    quote.estimated_total !== null
                      ? `Tổng giá trị: ${formatCurrency(quote.estimated_total)}${
                          quote.needed_date && quote.expected_end_date
                            ? ` (thuê từ ${formatDate(quote.needed_date)} đến ${formatDate(quote.expected_end_date)})`
                            : ''
                        }.`
                      : null,
                })}
              />
            )}
            {canMarkSent && (
              <>
                <select
                  aria-label="Kênh gửi khách"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as RentalQuoteSentChannel | '')}
                  className="h-11 rounded-field border border-border-strong bg-surface px-3"
                >
                  <option value="">Chọn kênh đã gửi</option>
                  {(Object.keys(RENTAL_QUOTE_CHANNEL_LABELS) as RentalQuoteSentChannel[]).map(
                    (ch) => (
                      <option key={ch} value={ch}>
                        {RENTAL_QUOTE_CHANNEL_LABELS[ch]}
                      </option>
                    ),
                  )}
                </select>
                <Button
                  variant="secondary"
                  disabled={!channel || send.isPending}
                  onClick={() => void onSent()}
                >
                  Ghi đã gửi khách
                </Button>
              </>
            )}
            {!locked && (
              <>
                <Button
                  variant="secondary"
                  disabled={blockedReason !== null || save.isPending}
                  onClick={() => void onSave()}
                >
                  Lưu nháp
                </Button>
                <Button
                  variant="primary"
                  disabled={blockedReason !== null || save.isPending || submit.isPending}
                  onClick={() => void onSubmit()}
                >
                  Gửi phê duyệt
                </Button>
              </>
            )}
          </div>
          {!locked && blockedReason && <p className="text-sm text-fg-subtle">{blockedReason}</p>}
          {canMarkSent && !channel && (
            <p className="text-sm text-fg-subtle">
              Gửi khách xong thì chọn kênh và ghi lại — cơ hội tự sang Đàm phán.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
