/**
 * Tab Yêu cầu thay đổi của Chi tiết Dự án thiết kế (TK-06).
 *
 * TK-06 liệt kê đúng năm thứ phải ghi: người yêu cầu, nội dung, nguyên nhân, mức độ ảnh
 * hưởng đến tiến độ và chi phí, số lượng bản vẽ cần sửa lại. Biểu mẫu bám đúng danh sách đó
 * — thiếu một mục là thiếu căn cứ để người có thẩm quyền quyết định có làm hay không.
 *
 * Màn hình này vẫn dùng được SAU KHI bàn giao: TK-08 yêu cầu "xử lý sai khác/thay đổi tại
 * hiện trường", nên công trường phải ghi được yêu cầu ở đây thay vì gọi điện và Zalo.
 */

import { useState, type FormEvent } from 'react';
import {
  BUTTONS,
  CHANGE_REQUEST_ORIGIN_LABELS,
  CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_STATUS_META,
  formatCurrency,
  formatDateTime,
  type ChangeRequestOrigin,
  type ChangeRequestStatus,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useChangeRequests, useSaveChangeRequest } from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth } from '@/lib/auth';

const EM_DASH = '—';

export function ChangeRequestPanel({
  projectId,
  companyId,
  canEdit,
}: {
  projectId: string;
  companyId: string;
  /** Quyền sửa module TK. KHÁC "hồ sơ còn mở": ghi yêu cầu thay đổi vẫn được sau bàn giao. */
  canEdit: boolean;
}) {
  const promptDialog = usePromptDialog();
  const { profile } = useAuth();
  const { data: requests } = useChangeRequests(projectId);
  const save = useSaveChangeRequest();

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    origin: 'khach_hang' as ChangeRequestOrigin,
    requesterName: '',
    content: '',
    reason: '',
    scheduleImpactDays: '',
    costImpact: '',
    affectedDrawingCount: '',
    impactNotes: '',
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim() || !form.content.trim() || !form.reason.trim()) {
      setError('Vui lòng nhập tiêu đề, nội dung thay đổi và nguyên nhân.');
      return;
    }

    try {
      await save.mutateAsync({
        projectId,
        companyId,
        values: {
          title: form.title.trim(),
          origin: form.origin,
          requester_name: form.requesterName.trim() || null,
          requested_by: profile?.id ?? null,
          content: form.content.trim(),
          reason: form.reason.trim(),
          schedule_impact_days: form.scheduleImpactDays.trim()
            ? Number(form.scheduleImpactDays)
            : null,
          cost_impact: form.costImpact.trim() || null,
          affected_drawing_count: form.affectedDrawingCount.trim()
            ? Number(form.affectedDrawingCount)
            : null,
          impact_notes: form.impactNotes.trim() || null,
        },
      });
      setForm({
        title: '',
        origin: 'khach_hang',
        requesterName: '',
        content: '',
        reason: '',
        scheduleImpactDays: '',
        costImpact: '',
        affectedDrawingCount: '',
        impactNotes: '',
      });
      setAdding(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function changeStatus(id: string, status: ChangeRequestStatus) {
    setError(null);
    // Không thực hiện thì phải nói vì sao — người yêu cầu có quyền biết lý do bị từ chối.
    let decisionNotes: string | null = null;
    if (status === 'tu_choi') {
      const reason = await promptDialog.ask({
        title: 'Không thực hiện yêu cầu thay đổi?',
        label: 'Lý do không thực hiện',
        detail: 'Người yêu cầu đọc được lý do này.',
        confirmLabel: 'Không thực hiện',
      });
      if (reason === null) return;
      decisionNotes = reason;
    }

    try {
      await save.mutateAsync({
        id,
        projectId,
        companyId,
        values: {
          status,
          decided_at: status === 'moi' ? null : new Date().toISOString(),
          decided_by: status === 'moi' ? null : (profile?.id ?? null),
          decision_notes: decisionNotes,
        },
      });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      {promptDialog.dialog}
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {canEdit &&
        (adding ? (
          <form
            onSubmit={submit}
            noValidate
            className="rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <p className="mb-4 font-medium">Ghi nhận yêu cầu thay đổi</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tiêu đề" required className="sm:col-span-2">
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Dời vị trí bếp sang phía sau nhà"
                />
              </Field>

              <Field label="Nguồn yêu cầu">
                <select
                  value={form.origin}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, origin: e.target.value as ChangeRequestOrigin }))
                  }
                  className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
                >
                  {(Object.keys(CHANGE_REQUEST_ORIGIN_LABELS) as ChangeRequestOrigin[]).map((o) => (
                    <option key={o} value={o}>
                      {CHANGE_REQUEST_ORIGIN_LABELS[o]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tên người yêu cầu" hint="Người bên ngoài hệ thống, nếu có.">
                <Input
                  value={form.requesterName}
                  onChange={(e) => setForm((f) => ({ ...f, requesterName: e.target.value }))}
                />
              </Field>

              <Field label="Nội dung thay đổi" required className="sm:col-span-2">
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={3}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                />
              </Field>

              <Field label="Nguyên nhân" required className="sm:col-span-2">
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={2}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                />
              </Field>

              <Field label="Ảnh hưởng tiến độ" hint="Số ngày. Số âm nghĩa là rút ngắn.">
                <Input
                  value={form.scheduleImpactDays}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      scheduleImpactDays: e.target.value.replace(/[^\d-]/g, ''),
                    }))
                  }
                  inputMode="numeric"
                />
              </Field>

              <Field label="Ảnh hưởng chi phí" hint="Đơn vị đồng. Số âm nghĩa là giảm chi phí.">
                <MoneyInput
                  value={form.costImpact}
                  allowNegative
                  onChange={(v) => setForm((f) => ({ ...f, costImpact: v }))}
                />
              </Field>

              <Field label="Số bản vẽ phải sửa lại">
                <Input
                  value={form.affectedDrawingCount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      affectedDrawingCount: e.target.value.replace(/[^\d]/g, ''),
                    }))
                  }
                  inputMode="numeric"
                />
              </Field>

              <Field label="Ghi chú đánh giá ảnh hưởng" className="sm:col-span-2">
                <textarea
                  value={form.impactNotes}
                  onChange={(e) => setForm((f) => ({ ...f, impactNotes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                />
              </Field>
            </div>

            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="primary" disabled={save.isPending}>
                {BUTTONS.save}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                {BUTTONS.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Ghi nhận yêu cầu thay đổi
          </Button>
        ))}

      {(requests ?? []).length === 0 ? (
        <EmptyState message="Chưa có yêu cầu thay đổi nào. Mọi thay đổi từ khách hàng, công trường hay cơ quan quản lý ghi nhận tại đây để đánh giá ảnh hưởng trước khi vẽ lại." />
      ) : (
        <ul className="space-y-3">
          {(requests ?? []).map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.title}</span>
                <StatusLozenge
                  status={CHANGE_REQUEST_STATUS_META[r.status as ChangeRequestStatus].statusGroup}
                />
                <span className="text-fg-subtle">
                  {CHANGE_REQUEST_STATUS_META[r.status as ChangeRequestStatus].label}
                </span>
              </div>

              <p className="mt-1 text-fg-subtle">
                {CHANGE_REQUEST_ORIGIN_LABELS[r.origin as ChangeRequestOrigin]}
                {r.requester_name ? ` — ${r.requester_name}` : ''}
                {r.requester ? ` (ghi nhận: ${r.requester.full_name})` : ''} ·{' '}
                {formatDateTime(r.requested_at)}
              </p>

              <p className="mt-2 whitespace-pre-wrap">{r.content}</p>
              <p className="mt-1 text-fg-subtle">Nguyên nhân: {r.reason}</p>

              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-3">
                <div>
                  <dt className="text-fg-subtle">Ảnh hưởng tiến độ</dt>
                  <dd>
                    {r.schedule_impact_days != null ? `${r.schedule_impact_days} ngày` : EM_DASH}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Ảnh hưởng chi phí</dt>
                  <dd>{r.cost_impact != null ? formatCurrency(r.cost_impact) : EM_DASH}</dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Bản vẽ phải sửa lại</dt>
                  <dd>{r.affected_drawing_count ?? EM_DASH}</dd>
                </div>
              </dl>

              {r.decision_notes && (
                <p className="mt-2 text-fg-subtle">Lý do không thực hiện: {r.decision_notes}</p>
              )}

              {canEdit && (
                <div className="mt-3">
                  <Field label="Chuyển trạng thái">
                    <select
                      value={r.status}
                      onChange={(e) =>
                        void changeStatus(r.id, e.target.value as ChangeRequestStatus)
                      }
                      className="h-10 rounded-sm border border-border bg-surface px-3 sm:h-9"
                    >
                      {CHANGE_REQUEST_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {CHANGE_REQUEST_STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
