/**
 * Thời hạn cam kết xử lý (NEN-12, TC-10) — bảng CỐ Ý RỖNG cho tới khi Ban Giám đốc ban hành.
 *
 * PRD v1.4 Mục 10, nguyên văn: không có tham số này thì cơ chế cảnh báo quá hạn của TC-10
 * KHÔNG CÓ CĂN CỨ ĐỂ CHẠY. Đây là câu hỏi #30 trong `doc/VAN_DE_CON_MO.md`.
 *
 * ## Vì sao không nạp sẵn một con số
 *
 * Nạp sẵn sẽ tạo đồng hồ đếm ngược trông như đã cam kết, và người duyệt bị gắn nhãn «Quá
 * hạn» theo một thời hạn chưa ai ký. Hộp thư Phê duyệt đang xử lý đúng: chưa có dòng thì
 * BỎ HẲN đồng hồ, không hiện "còn 0 ngày". Hồ sơ đó không đúng hạn cũng không trễ hạn — nó
 * là CHƯA BIẾT.
 *
 * Nên trạng thái rỗng ở đây không phải lỗi cần sửa, mà là một câu trả lời: nói rõ ai quyết,
 * và điều gì chưa chạy được trong lúc chờ.
 *
 * ## Dòng hẹp hơn thay thế dòng rộng hơn
 *
 * Thứ tự ưu tiên của `sla_target_hours`: đúng cả vai trò lẫn pháp nhân > đúng pháp nhân >
 * đúng vai trò > dòng chung. KHÔNG cộng dồn — cùng quy tắc `aging_buckets` và
 * `system_parameters`.
 */

import { useState, type FormEvent } from 'react';
import {
  APPROVAL_SUBJECTS,
  APPROVAL_SUBJECT_LABELS,
  BUTTONS,
  type ApprovalSubject,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCreateSla,
  useRoles,
  useSaveSla,
  useSlaDefinitions,
  type SlaRecord,
} from '@/hooks/use-admin';
import { useCompanies, useCompanyLookup } from '@/hooks/use-companies';
import { useCan } from '@/lib/auth';
import { NenNav } from './nen-nav';

/**
 * Loại việc khai được thời hạn: mọi loại phê duyệt, cộng các bước KHÔNG phải phê duyệt mà
 * công trường vẫn chờ — hiện có «Mua hàng lập đơn sau khi đề nghị đã duyệt» (TC-10,
 * `site_request_tracker` đọc loại `purchase_ordering`).
 */
type SlaRequestType = ApprovalSubject | 'purchase_ordering';

const SLA_REQUEST_TYPES: readonly SlaRequestType[] = [...APPROVAL_SUBJECTS, 'purchase_ordering'];

function slaTypeLabel(type: string): string {
  if (type === 'purchase_ordering') return 'Mua hàng lập đơn sau khi đề nghị được duyệt';
  return APPROVAL_SUBJECT_LABELS[type as ApprovalSubject] ?? type;
}

/** Giờ → cách đọc của người dùng. 8 giờ là một ngày công (`hours_per_workday`). */
function describeHours(hours: number): string {
  if (hours < 24) return `${hours} giờ`;
  const days = hours / 24;
  return Number.isInteger(days) ? `${hours} giờ (${days} ngày)` : `${hours} giờ`;
}

export function SlaPage() {
  const canEdit = useCan('NEN', 'edit');
  const { data, isLoading, error, refetch } = useSlaDefinitions();
  const { data: roles } = useRoles();
  const { data: companies } = useCompanies();
  const lookupCompany = useCompanyLookup();
  const createSla = useCreateSla();
  const saveSla = useSaveSla();

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    requestType: 'payment_request' as SlaRequestType,
    roleId: '',
    companyId: '',
    hours: '',
    label: '',
  });

  const [editing, setEditing] = useState<SlaRecord | null>(null);
  const [editHours, setEditHours] = useState('');

  async function addSla(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const hours = Number(form.hours);
    if (!Number.isInteger(hours) || hours <= 0) {
      setFormError('Thời hạn phải là số giờ nguyên lớn hơn 0.');
      return;
    }
    if (!form.label.trim()) {
      setFormError('Vui lòng nhập diễn giải để người nhận hiểu thời hạn này áp dụng cho việc gì.');
      return;
    }
    try {
      await createSla.mutateAsync({
        requestType: form.requestType,
        responsibleRoleId: form.roleId || null,
        companyId: form.companyId || null,
        targetHours: hours,
        label: form.label.trim(),
      });
      setForm({ ...form, hours: '', label: '' });
      setShowForm(false);
    } catch (err) {
      setFormError(toUserMessage(err, 'create'));
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    const hours = Number(editHours);
    if (!Number.isInteger(hours) || hours <= 0) {
      setFormError('Thời hạn phải là số giờ nguyên lớn hơn 0.');
      return;
    }
    try {
      await saveSla.mutateAsync({
        id: editing.id,
        targetHours: hours,
        isActive: editing.is_active,
      });
      setEditing(null);
    } catch (err) {
      setFormError(toUserMessage(err, 'edit'));
    }
  }

  const rows = data ?? [];

  return (
    <>
      <NenNav />
      <PageHeader
        title="Thời hạn xử lý"
        description="Cam kết bao lâu thì một đề nghị phải được xử lý xong. Đồng hồ hạn trên Hộp thư Phê duyệt và cảnh báo quá hạn đều đọc bảng này."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Thời hạn xử lý' }]}
        actions={
          canEdit ? (
            <Button
              variant={showForm ? 'subtle' : 'primary'}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? BUTTONS.cancel : 'Thêm thời hạn'}
            </Button>
          ) : undefined
        }
      />

      {isLoading && <TableSkeleton columns={5} />}
      {error && <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />}

      {!isLoading && !error && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6">
          <p className="font-medium">Chưa có thời hạn nào được ban hành.</p>
          <p className="mt-2 text-fg-subtle">
            Bảng này cố ý để trống, không phải thiếu dữ liệu. Thời hạn cam kết phản hồi của từng
            phòng ban là quyết định của Ban Giám đốc Nhà Việt Group. Trong lúc chưa có, Hộp thư Phê
            duyệt bỏ hẳn đồng hồ đếm ngược thay vì hiện một con số chưa ai cam kết, và cảnh báo quá
            hạn cho đề nghị từ công trường chưa có căn cứ để chạy.
          </p>
          <p className="mt-2 text-fg-subtle">
            Khi Ban Giám đốc đã quyết, thêm từng dòng tại đây: loại đề nghị, phòng ban tiếp nhận, và
            số giờ cam kết.
          </p>
        </div>
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="p-3 font-medium">Loại đề nghị</th>
                <th className="p-3 font-medium">Phòng ban tiếp nhận</th>
                <th className="p-3 font-medium">Pháp nhân</th>
                <th className="p-3 font-medium">Thời hạn</th>
                <th className="p-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const company = lookupCompany(s.company_id);
                return (
                  <tr key={s.id} className="border-b border-border last:border-b-0">
                    <td className="p-3">
                      <div>{slaTypeLabel(s.request_type)}</div>
                      <div className="text-xs text-fg-subtle">{s.label}</div>
                    </td>
                    <td className="p-3">
                      {s.role?.label ?? (
                        <span className="text-fg-subtle">Mọi vai trò tiếp nhận</span>
                      )}
                    </td>
                    <td className="p-3">
                      {company ? (
                        company.short_name
                      ) : (
                        <span className="text-fg-subtle">Mọi pháp nhân</span>
                      )}
                    </td>
                    <td className="p-3">{describeHours(s.target_hours)}</td>
                    <td className="p-3">
                      {!s.is_active && <span className="mr-2 text-fg-subtle">Đã tắt</span>}
                      {canEdit && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditing(s);
                            setEditHours(String(s.target_hours));
                            setFormError(null);
                          }}
                        >
                          {BUTTONS.edit}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={addSla}
          className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <p className="mb-3 text-fg-subtle">
            Chỉ thêm dòng khi Ban Giám đốc đã quyết. Dòng hẹp hơn thay thế dòng rộng hơn, không cộng
            dồn: đúng cả vai trò lẫn pháp nhân được ưu tiên trước dòng chung.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Loại đề nghị" required>
              <select
                value={form.requestType}
                onChange={(e) =>
                  setForm({ ...form, requestType: e.target.value as SlaRequestType })
                }
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                {SLA_REQUEST_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {slaTypeLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số giờ cam kết" required hint="Tính theo giờ. Một ngày công là 8 giờ.">
              <Input
                inputMode="numeric"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
              />
            </Field>
            <Field label="Phòng ban tiếp nhận" optional hint="Để trống là áp dụng cho mọi vai trò.">
              <select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                <option value="">Mọi vai trò tiếp nhận</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pháp nhân" optional hint="Để trống là áp dụng cho mọi pháp nhân.">
              <select
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                <option value="">Mọi pháp nhân</option>
                {(companies ?? [])
                  .filter((c) => c.is_transactional)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.short_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Diễn giải"
              required
              className="sm:col-span-2"
              hint="Hiện cho người nhận đề nghị, nên viết theo việc thật."
            >
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </Field>
          </div>

          {formError && (
            <p
              role="alert"
              className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" className="mt-3" disabled={createSla.isPending}>
            {createSla.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
        </form>
      )}

      {editing && (
        <form
          onSubmit={saveEdit}
          className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <h2 className="font-semibold">{editing.label}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Số giờ cam kết" required>
              <Input
                inputMode="numeric"
                value={editHours}
                onChange={(e) => setEditHours(e.target.value)}
              />
            </Field>
            <Field label="Trạng thái dòng" group>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.is_active}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  className="size-4"
                />
                <span>Đang áp dụng</span>
              </label>
            </Field>
          </div>

          {formError && (
            <p
              role="alert"
              className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={saveSla.isPending}>
              {saveSla.isPending ? 'Đang lưu…' : BUTTONS.save}
            </Button>
            <Button type="button" variant="subtle" onClick={() => setEditing(null)}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
