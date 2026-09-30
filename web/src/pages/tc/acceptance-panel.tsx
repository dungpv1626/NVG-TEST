/**
 * Tab Nghiệm thu của Chi tiết Công trình (TC-04).
 *
 * Ba loại nghiệm thu tách bạch ngay ở ô chọn, và ô chọn ghi rõ hệ quả: chỉ nghiệm thu VỚI
 * CHỦ ĐẦU TƯ mới báo Kế toán thu tiền. PRD TC-04 nói "biên bản nghiệm thu là căn cứ để Kế
 * toán thông báo thu tiền theo hợp đồng" — nhưng nghiệm thu nội bộ là kiểm soát chất lượng,
 * còn nghiệm thu với tổ đội là để TRẢ tiền ra. Người lập biên bản phải thấy khác biệt đó
 * trước khi bấm, không phải sau khi Kế toán gọi điện hỏi.
 *
 * Biên bản đã nghiệm thu không sửa được: nó đã ký với bên ngoài. Sai thì hủy kèm nguyên
 * nhân và lập biên bản mới — dấu vết cũ vẫn còn (TC-08).
 */

import { useState, type FormEvent } from 'react';
import {
  ACCEPTANCE_STATUS_META,
  ACCEPTANCE_TYPES,
  ACCEPTANCE_TYPE_LABELS,
  BUTTONS,
  formatCurrency,
  formatDate,
  triggersBilling,
  type AcceptanceType,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import {
  useAcceptanceRecords,
  useCancelAcceptance,
  useRecordAcceptance,
  useSubcontractors,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  CHECKLIST_RESULT_LABELS,
  useAcceptanceChecklists,
  useChecklistResults,
  useRecordAcceptanceWithChecklist,
} from '@/hooks/use-acceptance-checklists';
import { uploadConstructionPhotos } from '@/hooks/use-site-photos';
import {
  AcceptanceChecklistField,
  missingAnswers,
  type ChecklistAnswers,
} from './acceptance-checklist-field';
import { PhotoStrip } from './site-photo-picker';

/** Kết quả từng mục của một biên bản đã ký — chỉ đọc. */
function ChecklistResults({ acceptanceId }: { acceptanceId: string }) {
  const { data } = useChecklistResults(acceptanceId);
  if (!data || data.length === 0) return null;
  return (
    <ol className="mt-3 space-y-2 border-t border-border pt-3">
      {data.map((row) => (
        <li key={row.id}>
          <p>
            {row.position}. {row.item_label} —{' '}
            <strong
              className={
                row.result === 'khong_dat'
                  ? 'text-status-overdue'
                  : row.result === 'dat'
                    ? 'text-status-completed'
                    : 'text-fg-subtle'
              }
            >
              {CHECKLIST_RESULT_LABELS[row.result]}
            </strong>
            {row.note && <span className="text-fg-subtle"> · {row.note}</span>}
          </p>
          <PhotoStrip paths={row.photo_paths} />
        </li>
      ))}
    </ol>
  );
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export function AcceptancePanel({ siteId, readOnly }: { siteId: string; readOnly: boolean }) {
  const { data: records } = useAcceptanceRecords(siteId);
  const { data: crews } = useSubcontractors(siteId);
  const recordAcceptance = useRecordAcceptance();
  const recordWithChecklist = useRecordAcceptanceWithChecklist();
  const { data: checklists } = useAcceptanceChecklists();
  const [checklistId, setChecklistId] = useState('');
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [saving, setSaving] = useState(false);
  const cancelAcceptance = useCancelAcceptance();

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    acceptanceType: 'noi_bo' as AcceptanceType,
    stageName: '',
    scope: '',
    value: '',
    acceptedDate: TODAY(),
    subcontractorId: '',
    counterpartSignedBy: '',
    outstandingIssues: '',
  });

  const needsBilling = triggersBilling(form.acceptanceType);
  const needsCrew = form.acceptanceType === 'thau_phu';

  function startAdding() {
    setForm({
      acceptanceType: 'noi_bo',
      stageName: '',
      scope: '',
      value: '',
      acceptedDate: TODAY(),
      subcontractorId: '',
      counterpartSignedBy: '',
      outstandingIssues: '',
    });
    setChecklistId('');
    setAnswers({});
    setError(null);
    setAdding(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.stageName.trim()) {
      setError('Vui lòng nhập giai đoạn hoặc hạng mục được nghiệm thu.');
      return;
    }
    const checklist = (checklists ?? []).find((c) => c.id === checklistId);
    if (checklist) {
      const missing = missingAnswers(checklist.items, answers);
      if (missing.length > 0) {
        setError(`Chưa chấm đủ, hoặc thiếu ảnh bắt buộc: ${missing.join('; ')}.`);
        return;
      }
    }
    setSaving(true);
    try {
      if (checklist) {
        // Ảnh tải TRƯỚC, biên bản ghi SAU — biên bản đã ký không bao giờ trỏ vào ảnh chưa có.
        const results = [];
        for (const item of checklist.items) {
          const a = answers[item.key]!;
          const photoPaths =
            a.files.length > 0 ? await uploadConstructionPhotos(siteId, 'nghiem-thu', a.files) : [];
          results.push({
            key: item.key,
            result: a.result!,
            note: a.note.trim() || null,
            photo_paths: photoPaths,
          });
        }
        await recordWithChecklist.mutateAsync({
          siteId,
          acceptanceType: form.acceptanceType,
          stageName: form.stageName.trim(),
          checklistId: checklist.id,
          results,
          scope: form.scope.trim() || null,
          value: form.value || null,
          acceptedDate: form.acceptedDate || null,
          subcontractorId: form.subcontractorId || null,
          counterpartSignedBy: form.counterpartSignedBy.trim() || null,
          outstandingIssues: form.outstandingIssues.trim() || null,
        });
        setAdding(false);
        return;
      }
      await recordAcceptance.mutateAsync({
        siteId,
        acceptanceType: form.acceptanceType,
        stageName: form.stageName.trim(),
        scope: form.scope.trim() || null,
        value: form.value || null,
        acceptedDate: form.acceptedDate || null,
        subcontractorId: form.subcontractorId || null,
        counterpartSignedBy: form.counterpartSignedBy.trim() || null,
        outstandingIssues: form.outstandingIssues.trim() || null,
      });
      setAdding(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    } finally {
      setSaving(false);
    }
  }

  async function cancel(acceptanceId: string) {
    const reason = window.prompt('Nguyên nhân hủy biên bản nghiệm thu:');
    if (reason === null) return;
    setError(null);
    try {
      await cancelAcceptance.mutateAsync({ siteId, acceptanceId, reason: reason.trim() });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {!readOnly && !adding && (
        <Button variant="primary" onClick={startAdding}>
          Lập biên bản nghiệm thu
        </Button>
      )}

      {adding && (
        <form
          onSubmit={submit}
          noValidate
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Loại nghiệm thu"
              required
              hint={
                needsBilling
                  ? 'Kế toán sẽ nhận thông báo đủ căn cứ thu tiền theo hợp đồng.'
                  : 'Không báo Kế toán thu tiền — chỉ nghiệm thu với chủ đầu tư mới là căn cứ đòi tiền.'
              }
            >
              <select
                value={form.acceptanceType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, acceptanceType: e.target.value as AcceptanceType }))
                }
                className="h-10 w-full rounded-sm border border-border bg-surface px-3"
              >
                {ACCEPTANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCEPTANCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Giai đoạn / hạng mục" required>
              <Input
                value={form.stageName}
                onChange={(e) => setForm((f) => ({ ...f, stageName: e.target.value }))}
                placeholder="Đợt 1 — phần móng"
                autoFocus
              />
            </Field>

            <Field
              label="Danh mục kiểm tra"
              className="sm:col-span-2"
              hint="Chấm từng mục và chụp ảnh ngay tại hiện trường; kết quả đi cùng biên bản đã ký."
            >
              <select
                value={checklistId}
                onChange={(e) => {
                  setChecklistId(e.target.value);
                  setAnswers({});
                }}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3"
              >
                <option value="">Không dùng danh mục kiểm tra</option>
                {(checklists ?? [])
                  .filter((c) => !c.acceptance_type || c.acceptance_type === form.acceptanceType)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>

            {checklistId && (
              <div className="sm:col-span-2">
                <AcceptanceChecklistField
                  items={(checklists ?? []).find((c) => c.id === checklistId)?.items ?? []}
                  answers={answers}
                  onChange={setAnswers}
                  disabled={saving}
                />
              </div>
            )}

            <Field label="Khối lượng nghiệm thu" className="sm:col-span-2">
              <textarea
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                rows={2}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              />
            </Field>

            <Field label="Giá trị" required={needsBilling} hint="Đơn vị đồng.">
              <MoneyInput
                value={form.value}
                required={needsBilling}
                onChange={(v) => setForm((f) => ({ ...f, value: v }))}
              />
            </Field>

            <Field label="Ngày nghiệm thu">
              <DateInput
                value={form.acceptedDate}
                onChange={(v) => setForm((f) => ({ ...f, acceptedDate: v }))}
              />
            </Field>

            {needsCrew && (
              <Field label="Tổ đội được nghiệm thu" required>
                <select
                  value={form.subcontractorId}
                  onChange={(e) => setForm((f) => ({ ...f, subcontractorId: e.target.value }))}
                  className="h-10 w-full rounded-sm border border-border bg-surface px-3"
                >
                  <option value="">Chọn tổ đội</option>
                  {(crews ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Người ký phía đối tác">
              <Input
                value={form.counterpartSignedBy}
                onChange={(e) => setForm((f) => ({ ...f, counterpartSignedBy: e.target.value }))}
              />
            </Field>

            <Field
              label="Tồn tại cần khắc phục"
              className="sm:col-span-2"
              hint="Ghi ngay trên biên bản — đây là chỗ hay bị bỏ quên nhất khi bàn giao."
            >
              <textarea
                value={form.outstandingIssues}
                onChange={(e) => setForm((f) => ({ ...f, outstandingIssues: e.target.value }))}
                rows={2}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              />
            </Field>
          </div>

          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lập biên bản'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}

      {(records ?? []).length === 0 ? (
        <EmptyState message="Chưa có biên bản nghiệm thu nào. Lập biên bản khi hoàn thành một giai đoạn hoặc hạng mục — biên bản với chủ đầu tư là căn cứ để Kế toán thu tiền theo hợp đồng." />
      ) : (
        <ul className="space-y-3">
          {(records ?? []).map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.stage_name}</p>
                <StatusLozenge status={ACCEPTANCE_STATUS_META[r.status].statusGroup} />
                <span className="text-xs text-fg-subtle">
                  {ACCEPTANCE_TYPE_LABELS[r.acceptance_type]}
                </span>
                {r.code && <span className="ms-auto text-xs text-fg-subtle">{r.code}</span>}
              </div>

              {r.scope && <p className="whitespace-pre-wrap">{r.scope}</p>}

              <p className="mt-1 text-fg-subtle">
                {r.value != null && <span>{formatCurrency(r.value)} · </span>}
                {r.accepted_date ? formatDate(r.accepted_date) : 'Chưa ghi ngày'}
                {r.counterpart_signed_by && <span> · {r.counterpart_signed_by} ký</span>}
              </p>

              {r.outstanding_issues && (
                <p className="mt-2 rounded-sm bg-status-pending-bg px-3 py-2 text-status-pending">
                  Tồn tại cần khắc phục: {r.outstanding_issues}
                </p>
              )}

              <ChecklistResults acceptanceId={r.id} />

              {r.cancel_reason && (
                <p className="mt-2 text-status-overdue">Đã hủy: {r.cancel_reason}</p>
              )}

              {!readOnly && r.status === 'da_nghiem_thu' && (
                <button
                  type="button"
                  className="mt-2 text-brand underline"
                  onClick={() => void cancel(r.id)}
                >
                  Hủy biên bản
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
