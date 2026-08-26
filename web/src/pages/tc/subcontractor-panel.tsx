/**
 * Tab Tổ đội của Chi tiết Công trình (TC-06).
 *
 * TC-06 có một câu không được bỏ qua: "mỗi công việc thuê ngoài vẫn phải có một người NỘI BỘ
 * chịu trách nhiệm chính". Nên ô "Người nội bộ chịu trách nhiệm" luôn hiển thị, và khi để
 * trống thì màn hình nói rõ ai đang chịu — chỉ huy trưởng của công trình — chứ không im lặng
 * để việc rơi vào khoảng không.
 *
 * ⚠️ Đánh giá chất lượng hiện chỉ giữ lần gần nhất. TC-06 yêu cầu "lịch sử đánh giá"; lịch
 * sử đầy đủ theo từng đợt chờ khảo sát Chỉ huy – Giám sát công trường (PRD Mục 10) vì chưa
 * biết công trường đánh giá theo đợt nghiệm thu, theo tháng hay theo hạng mục.
 */

import { useState, type FormEvent } from 'react';
import {
  BUTTONS,
  SUBCONTRACTOR_STATUS_META,
  SUBCONTRACT_FORMS,
  SUBCONTRACT_FORM_LABELS,
  SUBCONTRACTOR_STATUSES,
  formatCurrency,
  formatDate,
  type SubcontractForm,
  type SubcontractorStatus,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useActiveUsers } from '@/hooks/use-active-users';
import { useSaveSubcontractor, useSubcontractors } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';

const EMPTY_FORM = {
  name: '',
  contactName: '',
  contactPhone: '',
  scopeOfWork: '',
  form: 'don_gia_khoan' as SubcontractForm,
  contractValue: '',
  responsibleUserId: '',
  startDate: '',
  endDate: '',
};

export function SubcontractorPanel({
  siteId,
  companyId,
  siteResponsibleName,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  siteResponsibleName: string | null;
  readOnly: boolean;
}) {
  const { data: crews } = useSubcontractors(siteId);
  const { data: users } = useActiveUsers();
  const saveCrew = useSaveSubcontractor();

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.scopeOfWork.trim()) {
      setError('Vui lòng nhập tên tổ đội và phạm vi công việc.');
      return;
    }
    try {
      await saveCrew.mutateAsync({
        siteId,
        companyId,
        values: {
          name: form.name.trim(),
          contact_name: form.contactName.trim() || null,
          contact_phone: form.contactPhone.trim() || null,
          scope_of_work: form.scopeOfWork.trim(),
          form: form.form,
          contract_value: form.contractValue || null,
          responsible_user_id: form.responsibleUserId || null,
          start_date: form.startDate || null,
          end_date: form.endDate || null,
        },
      });
      setForm(EMPTY_FORM);
      setAdding(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function update(id: string, values: Record<string, unknown>) {
    setError(null);
    try {
      await saveCrew.mutateAsync({ id, siteId, companyId, values });
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
        <Button variant="primary" onClick={() => setAdding(true)}>
          Thêm tổ đội
        </Button>
      )}

      {adding && (
        <form
          onSubmit={submit}
          noValidate
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên tổ đội / nhà thầu phụ" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </Field>

            <Field label="Hình thức giao việc">
              <select
                value={form.form}
                onChange={(e) =>
                  setForm((f) => ({ ...f, form: e.target.value as SubcontractForm }))
                }
                className="h-10 w-full rounded-sm border border-border bg-surface px-3"
              >
                {SUBCONTRACT_FORMS.map((v) => (
                  <option key={v} value={v}>
                    {SUBCONTRACT_FORM_LABELS[v]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Phạm vi công việc" required className="sm:col-span-2">
              <textarea
                value={form.scopeOfWork}
                onChange={(e) => setForm((f) => ({ ...f, scopeOfWork: e.target.value }))}
                rows={2}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
              />
            </Field>

            <Field label="Người liên hệ tại hiện trường">
              <Input
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              />
            </Field>

            <Field label="Số điện thoại">
              <Input
                value={form.contactPhone}
                inputMode="tel"
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              />
            </Field>

            <Field label="Giá trị giao khoán" hint="Đơn vị đồng.">
              <MoneyInput
                value={form.contractValue}
                onChange={(v) => setForm((f) => ({ ...f, contractValue: v }))}
              />
            </Field>

            <Field
              label="Người nội bộ chịu trách nhiệm"
              hint="Để trống thì chỉ huy trưởng công trình chịu trách nhiệm (TC-06)."
            >
              <select
                value={form.responsibleUserId}
                onChange={(e) => setForm((f) => ({ ...f, responsibleUserId: e.target.value }))}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3"
              >
                <option value="">Chỉ huy trưởng công trình</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Bắt đầu">
              <DateInput
                value={form.startDate}
                onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
              />
            </Field>

            <Field label="Kết thúc">
              <DateInput
                value={form.endDate}
                onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
              />
            </Field>
          </div>

          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={saveCrew.isPending}>
              {BUTTONS.save}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}

      {(crews ?? []).length === 0 ? (
        <EmptyState message="Chưa có tổ đội nào tại công trình. Thêm tổ đội để theo dõi phạm vi khoán, khối lượng nghiệm thu và đánh giá chất lượng." />
      ) : (
        <ul className="space-y-3">
          {(crews ?? []).map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="font-medium">{c.name}</p>
                <StatusLozenge status={SUBCONTRACTOR_STATUS_META[c.status].statusGroup} />
                <span className="text-xs text-fg-subtle">{SUBCONTRACT_FORM_LABELS[c.form]}</span>
              </div>

              <p className="whitespace-pre-wrap">{c.scope_of_work}</p>

              <p className="mt-1 text-fg-subtle">
                {c.contract_value != null && <span>{formatCurrency(c.contract_value)} · </span>}
                {c.contact_name && <span>{c.contact_name} </span>}
                {c.contact_phone && <span>{c.contact_phone} · </span>}
                {c.start_date ? formatDate(c.start_date) : '?'} —{' '}
                {c.end_date ? formatDate(c.end_date) : '?'}
              </p>

              <p className="mt-1 text-fg-subtle">
                Người nội bộ chịu trách nhiệm:{' '}
                {c.responsible?.full_name ?? siteResponsibleName ?? 'Chưa phân công'}
                {!c.responsible && siteResponsibleName && ' (chỉ huy trưởng công trình)'}
              </p>

              {!readOnly && (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Field label="Trạng thái" className="w-48">
                    <select
                      value={c.status}
                      onChange={(e) =>
                        void update(c.id, { status: e.target.value as SubcontractorStatus })
                      }
                      className="h-10 w-full rounded-sm border border-border bg-surface px-3"
                    >
                      {SUBCONTRACTOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {SUBCONTRACTOR_STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Đánh giá chất lượng" className="w-48" hint="Thang 1–5.">
                    <select
                      value={c.quality_rating ?? ''}
                      onChange={(e) =>
                        void update(c.id, {
                          quality_rating: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="h-10 w-full rounded-sm border border-border bg-surface px-3"
                    >
                      <option value="">Chưa đánh giá</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {c.quality_notes && <p className="mt-2 text-fg-subtle">{c.quality_notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
