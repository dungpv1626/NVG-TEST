/**
 * Ba tab Đợt 5 của Chi tiết gói thầu (5C-1, 5C-5, 5C-9; migration 0208):
 *  - «Hồ sơ năng lực»: gắn giấy tờ từ kho bằng một bấm, giấy hết hạn trước ngày nộp tô đỏ.
 *  - «Làm rõ»: các vòng làm rõ (số vòng máy đánh, câu hỏi, trả lời, hạn) + gia hạn nộp có lý do và
 *    lịch sử — thay ô chữ «Ghi chú làm rõ» (ô cũ vẫn hiện để đọc).
 *  - «Bảo lãnh và kết quả»: bảo lãnh dự thầu, thu hồi; đơn vị trúng, giá trúng, lý do.
 * Máy không quyết giá, không nộp thầu (PRD 2.3) — chỉ ghi và nhắc.
 */

import { useState } from 'react';
import { AlertTriangle, Link2, Unlink } from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime, toNvgDateInput } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState } from '@/components/ui/states';
import { useCompanyDocuments } from '@/hooks/use-company-documents';
import {
  useBidCapabilityStatus,
  useBidClarifications,
  useBidDeadlineHistory,
  useBidGuarantees,
  useBidOutcome,
  useExtendBidDeadline,
  useLinkCapability,
  useRecordBidOutcomeDetails,
  useSaveClarification,
  useSaveGuarantee,
} from '@/hooks/use-bid-extras';
import { toUserMessage } from '@/hooks/use-error-message';
import { CAPABILITY_CATEGORIES } from './capability-page';

const TEXTAREA = 'w-full rounded-sm border border-border bg-surface px-3 py-2';
const labelOf = (v: string) => CAPABILITY_CATEGORIES.find((c) => c.value === v)?.label ?? v;

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
export function BidCapabilityPanel({
  bidId,
  companyId,
  readOnly,
}: {
  bidId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: linked } = useBidCapabilityStatus(bidId);
  const { data: library } = useCompanyDocuments(CAPABILITY_CATEGORIES.map((c) => c.value));
  const link = useLinkCapability();
  const [error, setError] = useState<string | null>(null);
  const linkedIds = new Set((linked ?? []).map((l) => l.document_id));
  const available = (library ?? []).filter(
    (d) => d.company_id === companyId && !linkedIds.has(d.id),
  );
  const red = (linked ?? []).filter((l) => l.expires_before_submission);

  async function run(input: Parameters<typeof link.mutateAsync>[0]) {
    setError(null);
    try {
      await link.mutateAsync(input);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      <ErrorLine message={error} />
      {red.length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {red.length} giấy tờ hết hạn trước ngày nộp thầu — gia hạn ở Hồ sơ năng lực trước khi nộp.
        </p>
      )}

      <section>
        <h3 className="font-medium">Đã gắn vào gói</h3>
        {(linked ?? []).length === 0 ? (
          <EmptyState message="Chưa gắn giấy tờ năng lực nào. Chọn ở danh sách bên dưới." />
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {(linked ?? []).map((l) => (
              <li key={l.link_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium">{l.title}</p>
                  <p className="text-sm text-fg-subtle">
                    {labelOf(l.category)}
                    {l.fiscal_year ? ` · năm ${l.fiscal_year}` : ''}
                    {l.has_file ? '' : ' · chưa có bản chụp'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {l.expires_before_submission ? (
                    <span className="font-medium text-status-overdue">
                      Hết hạn {formatDate(l.expiry_date)} — trước ngày nộp
                    </span>
                  ) : l.expiry_date ? (
                    <span className="text-status-completed">
                      Còn hạn tới {formatDate(l.expiry_date)}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">
                      {l.fiscal_year ? `Báo cáo năm ${l.fiscal_year}` : 'Không có hạn'}
                    </span>
                  )}
                  {!readOnly && (
                    <Button
                      variant="subtle"
                      aria-label={`Bỏ gắn ${l.title}`}
                      onClick={() =>
                        void run({
                          bidId,
                          companyId,
                          documentId: l.document_id,
                          unlinkId: l.link_id,
                        })
                      }
                    >
                      <Unlink className="size-4" aria-hidden />
                      Bỏ gắn
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!readOnly && (
        <section>
          <h3 className="font-medium">Trong kho hồ sơ năng lực</h3>
          {available.length === 0 ? (
            <EmptyState message="Kho không còn giấy tờ nào chưa gắn. Thêm ở trang Hồ sơ năng lực." />
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
              {available.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <p>{d.title}</p>
                    <p className="text-sm text-fg-subtle">
                      {labelOf(d.category)}
                      {d.expiry_date ? ` · hết hạn ${formatDate(d.expiry_date)}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void run({ bidId, companyId, documentId: d.id })}
                  >
                    <Link2 className="size-4" aria-hidden />
                    Gắn vào gói
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function BidClarificationPanel({
  bidId,
  companyId,
  canEdit,
  canExtend,
  deadline,
  legacyNotes,
}: {
  bidId: string;
  companyId: string;
  canEdit: boolean;
  /** Đổi hạn nộp chỉ khi gói chưa nộp. */
  canExtend: boolean;
  deadline: string | null;
  legacyNotes: string | null;
}) {
  const { data: rounds } = useBidClarifications(bidId);
  const { data: history } = useBidDeadlineHistory(bidId);
  const save = useSaveClarification();
  const extend = useExtendBidDeadline();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState({
    direction: 'nvg_hoi' as 'nvg_hoi' | 'cdt_hoi',
    question: '',
    due: '',
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ext, setExt] = useState({ date: '', reason: '' });

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-6">
      <ErrorLine message={error} />

      <section className="space-y-3">
        <h3 className="font-medium">Các vòng làm rõ</h3>
        {(rounds ?? []).length === 0 ? (
          <EmptyState message="Chưa có vòng làm rõ nào." />
        ) : (
          <ul className="space-y-2">
            {(rounds ?? []).map((r) => {
              const overdue =
                !r.answer && r.due_date !== null && r.due_date < toNvgDateInput(new Date());
              return (
                <li key={r.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      Vòng {r.round_no} —{' '}
                      {r.direction === 'nvg_hoi'
                        ? 'Nhà Việt hỏi chủ đầu tư'
                        : 'Chủ đầu tư yêu cầu làm rõ'}
                    </span>
                    <span
                      className={
                        r.answer
                          ? 'text-status-completed'
                          : overdue
                            ? 'font-medium text-status-overdue'
                            : 'text-status-pending'
                      }
                    >
                      {r.answer
                        ? `Đã trả lời ${r.answered_date ? formatDate(r.answered_date) : ''}`
                        : overdue
                          ? `Quá hạn ${formatDate(r.due_date)}`
                          : r.due_date
                            ? `Chờ trả lời — hạn ${formatDate(r.due_date)}`
                            : 'Chờ trả lời'}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{r.question}</p>
                  {r.answer ? (
                    <p className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-3">
                      {r.answer}
                    </p>
                  ) : (
                    canEdit && (
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <Field label="Trả lời" className="flex-1">
                          <textarea
                            rows={2}
                            className={TEXTAREA}
                            value={answers[r.id] ?? ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, [r.id]: e.target.value }))}
                          />
                        </Field>
                        <Button
                          variant="secondary"
                          disabled={save.isPending || !(answers[r.id] ?? '').trim()}
                          onClick={() =>
                            void act(() =>
                              save.mutateAsync({
                                kind: 'answer',
                                id: r.id,
                                answer: answers[r.id]!.trim(),
                              }),
                            )
                          }
                        >
                          Lưu trả lời
                        </Button>
                      </div>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="grid gap-3 rounded-lg border border-border bg-surface-sunken p-3 sm:grid-cols-3">
            <Field label="Chiều hỏi">
              <select
                className="h-10 w-full rounded-sm border border-border bg-surface px-2 sm:h-9"
                value={q.direction}
                onChange={(e) =>
                  setQ((x) => ({ ...x, direction: e.target.value as 'nvg_hoi' | 'cdt_hoi' }))
                }
              >
                <option value="nvg_hoi">Nhà Việt hỏi chủ đầu tư</option>
                <option value="cdt_hoi">Chủ đầu tư yêu cầu làm rõ</option>
              </select>
            </Field>
            <Field label="Hạn trả lời">
              <DateInput value={q.due} onChange={(v) => setQ((x) => ({ ...x, due: v }))} />
            </Field>
            <Field label="Câu hỏi" required className="sm:col-span-3">
              <textarea
                rows={2}
                className={TEXTAREA}
                value={q.question}
                onChange={(e) => setQ((x) => ({ ...x, question: e.target.value }))}
              />
            </Field>
            <div>
              <Button
                variant="primary"
                disabled={save.isPending || !q.question.trim()}
                onClick={() =>
                  void act(
                    () =>
                      save.mutateAsync({
                        kind: 'new',
                        bidId,
                        companyId,
                        direction: q.direction,
                        question: q.question.trim(),
                        dueDate: q.due || null,
                      }),
                    () => setQ({ direction: 'nvg_hoi', question: '', due: '' }),
                  )
                }
              >
                Thêm vòng làm rõ
              </Button>
            </div>
          </div>
        )}
        {legacyNotes && (
          <p className="text-sm text-fg-subtle">
            Ghi chú làm rõ cũ (trước khi có các vòng):{' '}
            <span className="whitespace-pre-wrap">{legacyNotes}</span>
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Hạn nộp và gia hạn</h3>
        <p>Hạn nộp hiện tại: {deadline ? formatDate(deadline) : 'Chưa đặt'}</p>
        {canExtend && (
          <div className="grid gap-3 rounded-lg border border-border bg-surface-sunken p-3 sm:grid-cols-3">
            <Field label="Hạn nộp mới" required>
              <DateInput value={ext.date} onChange={(v) => setExt((x) => ({ ...x, date: v }))} />
            </Field>
            <Field label="Lý do gia hạn" required className="sm:col-span-2">
              <Input
                value={ext.reason}
                placeholder="Văn bản gia hạn số …/CĐT"
                onChange={(e) => setExt((x) => ({ ...x, reason: e.target.value }))}
              />
            </Field>
            <div>
              <Button
                variant="secondary"
                disabled={extend.isPending || !ext.date || !ext.reason.trim()}
                onClick={() =>
                  void act(
                    () =>
                      extend.mutateAsync({
                        bidId,
                        newDeadline: ext.date,
                        reason: ext.reason.trim(),
                      }),
                    () => setExt({ date: '', reason: '' }),
                  )
                }
              >
                Ghi nhận gia hạn
              </Button>
            </div>
          </div>
        )}
        {(history ?? []).length > 0 && (
          <ul className="space-y-1 text-sm">
            {(history ?? []).map((h) => (
              <li key={h.id} className="border-l-2 border-border pl-3">
                {h.old_deadline ? formatDate(h.old_deadline) : 'Chưa đặt'} →{' '}
                {h.new_deadline ? formatDate(h.new_deadline) : 'Bỏ hạn'}
                <span className="text-fg-subtle">
                  {' '}
                  · {h.reason ?? 'không ghi lý do'} · {formatDateTime(h.created_at)}
                  {h.creator ? ` — ${h.creator.full_name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function BidGuaranteePanel({
  bidId,
  companyId,
  canEdit,
  hasResult,
}: {
  bidId: string;
  companyId: string;
  canEdit: boolean;
  hasResult: boolean;
}) {
  const { data: guarantees } = useBidGuarantees(bidId);
  const { data: outcome } = useBidOutcome(bidId);
  const save = useSaveGuarantee();
  const record = useRecordBidOutcomeDetails();
  const [error, setError] = useState<string | null>(null);
  const [g, setG] = useState({ amount: '', bank: '', number: '', issued: '', expiry: '' });
  const [release, setRelease] = useState<Record<string, string>>({});
  const [o, setO] = useState<{ winner: string; price: string; reason: string } | null>(null);
  const today = toNvgDateInput(new Date());

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  const form = o ?? {
    winner: outcome?.winner_name ?? '',
    price: outcome?.winning_price != null ? String(outcome.winning_price) : '',
    reason: outcome?.outcome_reason ?? '',
  };

  return (
    <div className="space-y-6">
      <ErrorLine message={error} />
      <section className="space-y-3">
        <h3 className="font-medium">Bảo lãnh dự thầu</h3>
        {(guarantees ?? []).length === 0 ? (
          <EmptyState message="Chưa ghi bảo lãnh dự thầu nào." />
        ) : (
          <ul className="space-y-2">
            {(guarantees ?? []).map((x) => {
              const expired = !x.released_at && x.expiry_date < today;
              return (
                <li key={x.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">
                      {formatCurrency(x.amount)} — {x.bank_name}
                      {x.guarantee_number ? ` · Số ${x.guarantee_number}` : ''}
                    </span>
                    <span
                      className={
                        x.released_at
                          ? 'text-status-completed'
                          : expired
                            ? 'font-medium text-status-overdue'
                            : 'text-status-progress'
                      }
                    >
                      {x.released_at
                        ? `Đã thu hồi ${formatDate(x.released_at)}`
                        : expired
                          ? `Hết hạn ${formatDate(x.expiry_date)} — chưa thu hồi`
                          : `Còn hiệu lực tới ${formatDate(x.expiry_date)}`}
                    </span>
                  </div>
                  {!x.released_at && canEdit && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <Field label="Ngày thu hồi">
                        <DateInput
                          value={release[x.id] ?? ''}
                          onChange={(v) => setRelease((r) => ({ ...r, [x.id]: v }))}
                        />
                      </Field>
                      <Button
                        variant="secondary"
                        disabled={!release[x.id]}
                        onClick={() =>
                          void act(() =>
                            save.mutateAsync({
                              kind: 'release',
                              id: x.id,
                              releasedAt: release[x.id]!,
                              note: null,
                            }),
                          )
                        }
                      >
                        Ghi nhận đã thu hồi
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && (
          <div className="grid gap-3 rounded-lg border border-border bg-surface-sunken p-3 sm:grid-cols-3">
            <Field label="Số tiền bảo lãnh" required>
              <MoneyInput value={g.amount} onChange={(v) => setG((x) => ({ ...x, amount: v }))} />
            </Field>
            <Field label="Ngân hàng" required>
              <Input
                value={g.bank}
                onChange={(e) => setG((x) => ({ ...x, bank: e.target.value }))}
              />
            </Field>
            <Field label="Số bảo lãnh">
              <Input
                value={g.number}
                onChange={(e) => setG((x) => ({ ...x, number: e.target.value }))}
              />
            </Field>
            <Field label="Ngày phát hành">
              <DateInput value={g.issued} onChange={(v) => setG((x) => ({ ...x, issued: v }))} />
            </Field>
            <Field label="Ngày hết hạn" required>
              <DateInput value={g.expiry} onChange={(v) => setG((x) => ({ ...x, expiry: v }))} />
            </Field>
            <div className="flex items-end">
              <Button
                variant="secondary"
                disabled={save.isPending || !g.amount || !g.bank.trim() || !g.expiry}
                onClick={() =>
                  void act(
                    () =>
                      save.mutateAsync({
                        kind: 'new',
                        bidId,
                        companyId,
                        amount: Number(g.amount),
                        bankName: g.bank.trim(),
                        guaranteeNumber: g.number.trim() || null,
                        issuedDate: g.issued || null,
                        expiryDate: g.expiry,
                      }),
                    () => setG({ amount: '', bank: '', number: '', issued: '', expiry: '' }),
                  )
                }
              >
                Thêm bảo lãnh
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Kết quả và rút kinh nghiệm</h3>
        {!hasResult ? (
          <p className="text-fg-subtle">
            Ghi nhận trúng / trượt thầu ở đầu trang trước; sau đó ghi đơn vị trúng, giá trúng và lý
            do tại đây.
          </p>
        ) : (
          <>
            {outcome?.outcome_recorded_at && (
              <p className="text-sm text-fg-subtle">
                Ghi lần cuối {formatDateTime(outcome.outcome_recorded_at)}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Đơn vị trúng thầu">
                <Input
                  value={form.winner}
                  disabled={!canEdit}
                  onChange={(e) => setO({ ...form, winner: e.target.value })}
                />
              </Field>
              <Field label="Giá trúng thầu">
                <MoneyInput
                  value={form.price}
                  disabled={!canEdit}
                  onChange={(v) => setO({ ...form, price: v })}
                />
              </Field>
              <Field label="Lý do trúng / trượt" className="sm:col-span-2">
                <textarea
                  rows={2}
                  className={TEXTAREA}
                  value={form.reason}
                  disabled={!canEdit}
                  onChange={(e) => setO({ ...form, reason: e.target.value })}
                />
              </Field>
            </div>
            {canEdit && (
              <Button
                variant="secondary"
                disabled={record.isPending}
                onClick={() =>
                  void act(() =>
                    record.mutateAsync({
                      bidId,
                      winner: form.winner,
                      price: form.price ? Number(form.price) : null,
                      reason: form.reason,
                    }),
                  )
                }
              >
                Lưu kết quả
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
