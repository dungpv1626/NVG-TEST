/**
 * Tab Phát sinh của Chi tiết Hợp đồng (HD-04).
 *
 * Điều khoản khó nhất của Module HD, và màn hình phải phản ánh đúng nó: "mọi phát sinh phải
 * có đề xuất, BÁO GIÁ và XÁC NHẬN CỦA KHÁCH HÀNG trước khi thực hiện, trừ trường hợp khẩn
 * cấp được cấp có thẩm quyền cho phép".
 *
 * Vì vậy mỗi phát sinh hiển thị đúng BƯỚC TIẾP THEO còn thiếu, thay vì bày sẵn mọi nút rồi
 * để CSDL từ chối. Người dùng nhìn là biết còn phải làm gì — Webapp Flow 6.5: không hiện
 * nút rồi mới báo lỗi khi bấm.
 */

import { useState, type FormEvent } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import {
  AMENDMENT_STAGE_META,
  BUTTONS,
  formatCurrency,
  formatDateTime,
  type AmendmentStage,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useActiveUsers } from '@/hooks/use-active-users';
import {
  useConfirmAmendmentByCustomer,
  useContractAmendments,
  useCreateAmendment,
  useExecuteAmendment,
  useMarkAmendmentQuoteSent,
  useSubmitAmendmentApproval,
  type AmendmentRecord,
} from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';

const EM_DASH = '—';

export function AmendmentPanel({
  contractId,
  companyId,
  readOnly,
}: {
  contractId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: amendments } = useContractAmendments(contractId);
  const { data: users } = useActiveUsers();
  const createAmendment = useCreateAmendment();

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    content: '',
    reason: '',
    valueChange: '',
    scheduleImpactDays: '',
    isEmergency: false,
    emergencyAuthorizedBy: '',
    emergencyReason: '',
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim() || !form.content.trim() || !form.reason.trim()) {
      setError('Vui lòng nhập tiêu đề, nội dung phát sinh và nguyên nhân.');
      return;
    }
    // HD-04 bắt buộc ghi RÕ người có thẩm quyền đã cho phép. Hỏi ngay tại chỗ thay vì để
    // ràng buộc CSDL trả về một thông báo khó hiểu sau khi đã gõ xong biểu mẫu.
    if (form.isEmergency && !form.emergencyAuthorizedBy) {
      setError('Trường hợp khẩn cấp phải ghi rõ người có thẩm quyền đã cho phép thực hiện.');
      return;
    }

    try {
      await createAmendment.mutateAsync({
        contractId,
        companyId,
        values: {
          title: form.title.trim(),
          content: form.content.trim(),
          reason: form.reason.trim(),
          value_change: form.valueChange.trim() || '0',
          schedule_impact_days: form.scheduleImpactDays.trim() || null,
          is_emergency: form.isEmergency,
          emergency_authorized_by: form.isEmergency ? form.emergencyAuthorizedBy : null,
          emergency_reason: form.isEmergency ? form.emergencyReason.trim() || null : null,
        },
      });
      setForm({
        title: '',
        content: '',
        reason: '',
        valueChange: '',
        scheduleImpactDays: '',
        isEmergency: false,
        emergencyAuthorizedBy: '',
        emergencyReason: '',
      });
      setAdding(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {!readOnly &&
        (adding ? (
          <form
            onSubmit={submit}
            noValidate
            className="rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <p className="mb-4 font-medium">Đề xuất phát sinh ngoài hợp đồng</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tiêu đề" required className="sm:col-span-2">
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Gia cố nền đất yếu khu vực móng trục A"
                />
              </Field>

              <Field label="Nội dung phát sinh" required className="sm:col-span-2">
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

              <Field
                label="Thay đổi giá trị hợp đồng"
                hint="Đơn vị đồng. Số âm nghĩa là giảm trừ khối lượng."
              >
                <Input
                  value={form.valueChange}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, valueChange: e.target.value.replace(/[^\d-]/g, '') }))
                  }
                  inputMode="numeric"
                />
              </Field>

              <Field label="Thay đổi tiến độ" hint="Số ngày. Số âm nghĩa là rút ngắn.">
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

              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isEmergency}
                  onChange={(e) => setForm((f) => ({ ...f, isEmergency: e.target.checked }))}
                  className="mt-1 size-4"
                />
                <span>
                  <span className="block font-medium">Trường hợp khẩn cấp</span>
                  <span className="block text-xs text-fg-subtle">
                    Chỉ dùng khi phải làm ngay để bảo đảm an toàn hoặc tránh thiệt hại lớn hơn.
                    Bỏ qua bước xác nhận của khách hàng, nhưng phải ghi rõ người có thẩm quyền
                    đã cho phép (HD-04).
                  </span>
                </span>
              </label>

              {form.isEmergency && (
                <>
                  <Field label="Người có thẩm quyền đã cho phép" required>
                    <select
                      value={form.emergencyAuthorizedBy}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, emergencyAuthorizedBy: e.target.value }))
                      }
                      className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
                    >
                      <option value="">Chọn người đã cho phép</option>
                      {(users ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Lý do khẩn cấp">
                    <Input
                      value={form.emergencyReason}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, emergencyReason: e.target.value }))
                      }
                      placeholder="Nguy cơ sạt lở, đã báo và được đồng ý qua điện thoại"
                    />
                  </Field>
                </>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="primary" disabled={createAmendment.isPending}>
                {BUTTONS.save}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                {BUTTONS.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Đề xuất phát sinh
          </Button>
        ))}

      {(amendments ?? []).length === 0 ? (
        <EmptyState message="Chưa có phát sinh ngoài hợp đồng. Mọi công việc ngoài phạm vi đã ký ghi nhận tại đây, có báo giá và xác nhận của khách hàng trước khi thực hiện." />
      ) : (
        <ul className="space-y-3">
          {(amendments ?? []).map((a) => (
            <AmendmentCard key={a.id} amendment={a} readOnly={readOnly} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AmendmentCard({
  amendment,
  readOnly,
}: {
  amendment: AmendmentRecord;
  readOnly: boolean;
}) {
  const markQuoteSent = useMarkAmendmentQuoteSent();
  const submitApproval = useSubmitAmendmentApproval();
  const confirmByCustomer = useConfirmAmendmentByCustomer();
  const execute = useExecuteAmendment();
  const [error, setError] = useState<string | null>(null);

  const stage = amendment.stage as AmendmentStage;
  const meta = AMENDMENT_STAGE_META[stage];
  const isClosed = stage === 'da_thuc_hien' || stage === 'tu_choi';

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  function confirmCustomer() {
    const name = window.prompt('Tên người xác nhận phía khách hàng:');
    if (name === null) return;
    void run(() =>
      confirmByCustomer.mutateAsync({ amendmentId: amendment.id, confirmedBy: name.trim() }),
    );
  }

  /**
   * Chỉ hiện ĐÚNG bước tiếp theo còn thiếu. Bày sẵn cả bốn nút rồi để CSDL từ chối ba cái là
   * vi phạm Webapp Flow 6.5 và làm người dùng phải đoán thứ tự.
   */
  const nextAction = (() => {
    if (readOnly || isClosed) return null;

    if (amendment.is_emergency) {
      return (
        <Button variant="primary" onClick={() => void run(() => execute.mutateAsync({ amendmentId: amendment.id }))}>
          Ghi nhận đã thực hiện
        </Button>
      );
    }

    if (!amendment.quote_sent_at) {
      return (
        <Button
          variant="primary"
          onClick={() => void run(() => markQuoteSent.mutateAsync({ amendmentId: amendment.id }))}
        >
          Đã gửi báo giá cho khách hàng
        </Button>
      );
    }

    if (stage === 'de_xuat') {
      return (
        <Button
          variant="primary"
          onClick={() => void run(() => submitApproval.mutateAsync({ amendmentId: amendment.id }))}
        >
          Gửi phê duyệt
        </Button>
      );
    }

    if (stage === 'cho_duyet') {
      return <span className="text-fg-subtle">Đang chờ phê duyệt trong Hộp thư Phê duyệt.</span>;
    }

    if (!amendment.customer_confirmed_at) {
      return (
        <Button variant="primary" onClick={confirmCustomer}>
          Ghi nhận khách hàng xác nhận
        </Button>
      );
    }

    return (
      <Button
        variant="primary"
        onClick={() => void run(() => execute.mutateAsync({ amendmentId: amendment.id }))}
      >
        Ghi nhận đã thực hiện
      </Button>
    );
  })();

  return (
    <li className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{amendment.title}</span>
        <StatusLozenge status={meta.statusGroup} />
        <span className="text-fg-subtle">{meta.label}</span>
        {amendment.is_emergency && (
          <span className="inline-flex items-center gap-1 text-status-overdue">
            <ShieldAlert className="size-4" />
            Khẩn cấp
          </span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap">{amendment.content}</p>
      <p className="mt-1 text-fg-subtle">Nguyên nhân: {amendment.reason}</p>

      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-3">
        <div>
          <dt className="text-fg-subtle">Thay đổi giá trị</dt>
          <dd>{formatCurrency(amendment.value_change)}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Thay đổi tiến độ</dt>
          <dd>
            {amendment.schedule_impact_days ? `${amendment.schedule_impact_days} ngày` : EM_DASH}
          </dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Đề xuất bởi</dt>
          <dd>
            {amendment.requester?.full_name ?? EM_DASH} · {formatDateTime(amendment.requested_at)}
          </dd>
        </div>
      </dl>

      {/* HD-04 bắt "ghi nhận RÕ trường hợp khẩn cấp và người phê duyệt" — nên hiển thị nổi
          bật, không giấu trong ghi chú. */}
      {amendment.is_emergency && (
        <p className="mt-2 flex gap-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Thực hiện theo diện khẩn cấp, người cho phép:{' '}
            <strong>{amendment.authorizer?.full_name ?? 'chưa ghi nhận'}</strong>
            {amendment.emergency_reason ? `. ${amendment.emergency_reason}` : ''}
          </span>
        </p>
      )}

      <ul className="mt-2 space-y-0.5 text-fg-subtle">
        <li>
          Báo giá gửi khách:{' '}
          {amendment.quote_sent_at ? formatDateTime(amendment.quote_sent_at) : 'chưa gửi'}
        </li>
        <li>
          Khách hàng xác nhận:{' '}
          {amendment.customer_confirmed_at
            ? `${amendment.customer_confirmed_by} · ${formatDateTime(amendment.customer_confirmed_at)}`
            : 'chưa xác nhận'}
        </li>
        {amendment.executed_at && <li>Đã thực hiện: {formatDateTime(amendment.executed_at)}</li>}
        {amendment.decision_notes && <li>Kết luận: {amendment.decision_notes}</li>}
      </ul>

      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}

      {nextAction && <div className="mt-3">{nextAction}</div>}
    </li>
  );
}
