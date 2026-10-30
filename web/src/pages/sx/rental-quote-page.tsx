/**
 * Báo giá thuê / bán giàn giáo (PRD CRM-11; 5D 0209; G5 0245) — mẫu bố cục Biểu mẫu, danh sách báo
 * giá đã lưu bên dưới.
 *
 * Kiểm tồn BA nhóm tách riêng (phiếu Ban Giám đốc, mảng giàn giáo bước 2): tồn chắc chắn ở kho,
 * dự kiến thu hồi TRƯỚC ngày cần (theo ngày trả dự kiến của đơn đang thuê) và đang sửa. Hai nhóm sau
 * không bao giờ cộng vào số chắc chắn — chỉ để Kinh doanh hẹn ngày giao có cơ sở.
 *
 * Đơn giá điền sẵn từ bảng giá (`sx.rental_daily_rate`); hạ thấp hơn bảng giá là giá đặc biệt, và
 * công nợ khách vượt hạn mức (`sx.customer_credit_limit`) — một trong hai thì «Gửi báo giá» chuyển
 * Ban Giám đốc duyệt (bước 3). Máy không tự đặt giá: mã chưa có bảng giá thì người lập tự nhập.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { formatCurrency, formatDate, formatNumber } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { ZaloSend } from '@/components/share/zalo-send';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useEntityList } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  RENTAL_QUOTE_STATUS_LABELS,
  useProductPrices,
  useRentalAvailability,
  useRentalQuotes,
  useSaveRentalQuote,
  useSubmitRentalQuote,
  type AvailabilityRow,
  type RentalQuote,
} from '@/hooks/use-sx-rental';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { supabase } from '@/lib/supabase';
import { composeZaloMessage } from '@/lib/zalo-share';
import { SxNav } from './sx-nav';

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  phone: string | null;
}

/** Thông tin pháp nhân in ở đầu báo giá gửi khách. */
interface CompanyHead {
  legal_name: string | null;
  short_name: string | null;
  address: string | null;
  phone: string | null;
  tax_code: string | null;
}

function useCompanyHead(companyId: string | null) {
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

function rentalDays(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

function printQuote(q: RentalQuote, company: CompanyHead | null | undefined) {
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

export function RentalQuotePage() {
  const scope = useCompanyScope();
  const canEdit = useCan('SX', 'edit');
  const companyId = scope.isAggregate ? null : scope.companyId;
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('bao-gia');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [neededDate, setNeededDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deposit, setDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Record<string, LineDraft>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: stock, isLoading, error } = useRentalAvailability(companyId, neededDate || null);
  const { data: rates } = useProductPrices('sx.rental_daily_rate');
  const { data: quotes } = useRentalQuotes(companyId);
  const { data: customers } = useEntityList<CustomerOption>({
    table: 'customers',
    select: 'id, code, name, phone',
    scopedByCompany: false,
    orderBy: { column: 'name', ascending: true },
  });
  const { data: companyHead } = useCompanyHead(companyId);
  const save = useSaveRentalQuote();
  const submit = useSubmitRentalQuote();

  function loadQuote(q: RentalQuote) {
    setEditingId(q.id);
    setCustomerId(q.customer_id);
    setNeededDate(q.needed_date ?? '');
    setEndDate(q.expected_end_date ?? '');
    setDeliveryNote(q.delivery_note ?? '');
    setDeposit(q.deposit_amount ? String(q.deposit_amount) : '');
    setNotes(q.notes ?? '');
    setLines(
      Object.fromEntries(
        q.items.map((i) => [
          i.material_id,
          { quantity: String(i.quantity), kind: i.kind, unitPrice: String(i.unit_price) },
        ]),
      ),
    );
    setMessage(null);
  }

  function reset() {
    setEditingId(null);
    setCustomerId('');
    setNeededDate('');
    setEndDate('');
    setDeliveryNote('');
    setDeposit('');
    setNotes('');
    setLines({});
    setMessage(null);
    if (openId) setSearchParams({}, { replace: true });
  }

  // Mở từ thông báo / hộp duyệt: `?bao-gia=<id>`.
  useEffect(() => {
    if (!openId || !quotes) return;
    const q = quotes.find((x) => x.id === openId);
    if (q && q.id !== editingId) loadQuote(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nạp khi đổi id trên đường dẫn
  }, [openId, quotes]);

  const editing = quotes?.find((q) => q.id === editingId) ?? null;
  const locked = !canEdit || (editing !== null && !['nhap', 'tu_choi'].includes(editing.status));
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

  const blockedReason = !customerId
    ? 'Chọn khách hàng.'
    : chosen.length === 0
      ? 'Nhập số lượng ít nhất một mã.'
      : chosen.some(({ l }) => l.kind === 'thue') && days === 0
        ? 'Nhập ngày cần hàng và ngày dự kiến trả.'
        : chosen.some(({ s, l }) => priceOf(s, l) <= 0)
          ? 'Mỗi dòng cần đơn giá — mã chưa có bảng giá thì nhập tay.'
          : null;

  async function persist(): Promise<string | null> {
    if (!companyId || blockedReason) return null;
    return save.mutateAsync({
      id: editingId,
      companyId,
      customerId,
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
  }

  async function onSave() {
    setMessage(null);
    try {
      const id = await persist();
      if (id) {
        setEditingId(id);
        setMessage({ ok: true, text: 'Đã lưu nháp báo giá.' });
      }
    } catch (e) {
      setMessage({ ok: false, text: toUserMessage(e, 'edit') });
    }
  }

  async function onSubmit() {
    setMessage(null);
    try {
      const id = await persist();
      if (!id) return;
      setEditingId(id);
      const result = await submit.mutateAsync(id);
      setMessage({
        ok: true,
        text:
          result === 'da_duyet'
            ? 'Báo giá theo bảng giá, công nợ trong hạn mức — đã duyệt, in gửi khách được.'
            : 'Báo giá có giá đặc biệt hoặc công nợ vượt hạn mức — đã gửi Ban Giám đốc phê duyệt.',
      });
    } catch (e) {
      setMessage({ ok: false, text: toUserMessage(e, 'edit') });
    }
  }

  return (
    <>
      <PageHeader
        title="Báo giá thuê"
        description="Kiểm tồn ba nhóm, lưu báo giá theo khách; giá đặc biệt hoặc vượt hạn mức công nợ thì Ban Giám đốc duyệt."
        breadcrumbs={[{ label: 'Sản xuất – Cho thuê' }, { label: 'Báo giá thuê' }]}
      />
      <SxNav />
      {companyId === null ? (
        <EmptyState message="Chọn pháp nhân cho thuê (Nhà Việt Steel) ở bộ chọn góc trên bên trái." />
      ) : isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} />
      ) : (
        <div className="space-y-4">
          {editing && (
            <p className="text-sm text-fg-subtle">
              Đang mở báo giá {editing.code} — {RENTAL_QUOTE_STATUS_LABELS[editing.status]}
              {editing.decision_note ? `: ${editing.decision_note}` : ''}.
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
            <Field label="Khách hàng" required>
              <select
                value={customerId}
                disabled={locked || editing !== null}
                onChange={(e) => setCustomerId(e.target.value)}
                className={selectClass}
              >
                <option value="">Chọn khách hàng</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
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
            {(stock ?? []).map((s) => {
              const l = line(s.material_id);
              const rate = rates?.[s.material_id];
              const qty = Number(l.quantity || 0);
              const price = priceOf(s, l);
              const isSpecial = l.kind === 'thue' && rate !== undefined && qty > 0 && price < rate;
              return (
                <li
                  key={s.material_id}
                  className="grid gap-3 p-3 lg:grid-cols-[1fr_7rem_7rem_9rem]"
                >
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
                {blockedReason ? (
                  <span className="text-fg-subtle">Chưa đủ dữ liệu</span>
                ) : (
                  formatCurrency(Math.round(total))
                )}
              </p>
              {special && (
                <p className="text-sm text-status-pending">
                  Có dòng thấp hơn bảng giá — gửi đi sẽ chờ Ban Giám đốc duyệt.
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap gap-2">
                {(editing || editingId) && (
                  <Button variant="subtle" onClick={reset}>
                    Báo giá mới
                  </Button>
                )}
                {editing && (
                  <Button variant="secondary" onClick={() => printQuote(editing, companyHead)}>
                    <Printer className="size-4" aria-hidden />
                    {editing.status === 'da_duyet' ? 'In báo giá' : 'In bản nháp'}
                  </Button>
                )}
                {editing?.status === 'da_duyet' && (
                  <ZaloSend
                    canSend={canEdit}
                    showHistory={false}
                    entityType="rental_quotes"
                    entityId={editing.id}
                    phone={customers?.find((c) => c.id === editing.customer_id)?.phone ?? null}
                    message={composeZaloMessage({
                      recipientName: editing.customer?.name ?? null,
                      companyName: companyHead?.short_name ?? null,
                      subject: `báo giá thuê giàn giáo ${editing.code}`,
                      details:
                        editing.estimated_total !== null
                          ? `Tổng giá trị: ${formatCurrency(editing.estimated_total)}${
                              editing.needed_date && editing.expected_end_date
                                ? ` (thuê từ ${formatDate(editing.needed_date)} đến ${formatDate(editing.expected_end_date)})`
                                : ''
                            }.`
                          : null,
                    })}
                  />
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
                      Gửi báo giá
                    </Button>
                  </>
                )}
              </div>
              {!locked && blockedReason && (
                <p className="text-sm text-fg-subtle">{blockedReason}</p>
              )}
            </div>
          </div>

          <section aria-label="Báo giá đã lưu" className="space-y-2">
            <h2 className="text-lg font-bold">Báo giá đã lưu</h2>
            {(quotes ?? []).length === 0 ? (
              <EmptyState message="Chưa có báo giá thuê nào. Nhập số lượng ở trên rồi lưu nháp." />
            ) : (
              <ul className="divide-y divide-border rounded-card bg-surface">
                {(quotes ?? []).map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div>
                      <p className="font-medium">
                        {q.code} — {q.customer?.name ?? '—'}
                      </p>
                      <p className="text-sm text-fg-subtle">
                        {RENTAL_QUOTE_STATUS_LABELS[q.status]}
                        {q.estimated_total !== null
                          ? ` · ${formatCurrency(q.estimated_total)}`
                          : ''}
                        {q.special_price ? ' · có giá đặc biệt' : ''}
                        {q.credit_exceeded ? ' · công nợ vượt hạn mức' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => loadQuote(q)}>
                        Mở
                      </Button>
                      <Button variant="subtle" onClick={() => printQuote(q, companyHead)}>
                        In
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
