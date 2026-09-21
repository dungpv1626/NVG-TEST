/**
 * Phân công công trường — mẫu phân quyền E (CLAUDE.md 3.4, migration `0115`).
 *
 * Người ở hiện trường chỉ thấy dữ liệu của công trình được phân công. Hai điều dễ làm sai,
 * cả hai đều đã ghi thành hàng rào trong CSDL:
 *
 * 1. **Quên phân công phải dẫn tới thấy ÍT đi, không phải nhiều hơn.** Nên màn hình này nói
 *    rõ ai chưa có phân công nào, thay vì để im lặng thành "thấy tất cả".
 * 2. **Dấu hiệu "người hiện trường" là cột `roles.site_scoped`, KHÔNG phải quyền duyệt.**
 *    Chỉ huy trưởng CÓ quyền phê duyệt (họ ký bảng công khối công trường) nên không dùng
 *    quyền duyệt làm dấu hiệu cấp quản lý được.
 *
 * Người đứng ở `construction_sites.responsible_user_id` coi như đã được phân công, không cần
 * thêm dòng ở đây — bảng bên dưới ghi chú điều đó để khỏi tạo dòng trùng.
 *
 * Kết thúc một phân công là ĐẶT NGÀY KẾT THÚC, không xóa dòng: vẫn phải dựng lại được ai
 * từng vào công trình nào trong khoảng nào.
 */

import { useState, type FormEvent } from 'react';
import { BUTTONS, formatDate } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useAdminUsers,
  useCreateSiteAssignment,
  useEndSiteAssignment,
  useSiteAssignments,
} from '@/hooks/use-admin';
import { useCompanyLookup } from '@/hooks/use-companies';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import { useCan } from '@/lib/auth';
import { NenNav } from './nen-nav';

const HOM_NAY = () => new Date().toISOString().slice(0, 10);

export function SiteAssignmentPage() {
  const canEdit = useCan('NEN', 'edit');
  const { data, isLoading, error, refetch } = useSiteAssignments();
  const { data: users } = useAdminUsers();
  const { data: sites } = useConstructionSites();
  const lookupCompany = useCompanyLookup();
  const createAssignment = useCreateSiteAssignment();
  const endAssignment = useEndSiteAssignment();

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: '',
    siteId: '',
    siteRole: '',
    assignedFrom: HOM_NAY(),
  });

  async function addAssignment(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.userId || !form.siteId) {
      setFormError('Vui lòng chọn người và công trình.');
      return;
    }
    try {
      await createAssignment.mutateAsync({
        userId: form.userId,
        siteId: form.siteId,
        siteRole: form.siteRole.trim() || null,
        assignedFrom: form.assignedFrom,
      });
      setForm({ ...form, userId: '', siteId: '', siteRole: '' });
      setShowForm(false);
    } catch (err) {
      setFormError(toUserMessage(err, 'create'));
    }
  }

  async function endOne(id: string) {
    setFormError(null);
    try {
      await endAssignment.mutateAsync({ id, assignedTo: HOM_NAY() });
    } catch (err) {
      setFormError(toUserMessage(err, 'edit'));
    }
  }

  const rows = data ?? [];

  return (
    <>
      <NenNav />
      <PageHeader
        title="Phân công công trường"
        description="Người ở hiện trường chỉ thấy dữ liệu của công trình được phân công. Người chịu trách nhiệm công trình đã được tính là phân công sẵn, không cần thêm dòng."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Phân công công trường' }]}
        actions={
          canEdit ? (
            <Button
              variant={showForm ? 'subtle' : 'primary'}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? BUTTONS.cancel : 'Thêm phân công'}
            </Button>
          ) : undefined
        }
      />

      {formError && !showForm && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {formError}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={addAssignment}
          className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Người được phân công" required>
              <select
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                <option value="">Chọn người</option>
                {(users ?? [])
                  .filter((u) => u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                      {u.job_title ? ` — ${u.job_title}` : ''}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Công trình" required>
              <select
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
              >
                <option value="">Chọn công trình</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vai trò tại công trình" optional hint="Ví dụ: chỉ huy trưởng, giám sát.">
              <Input
                value={form.siteRole}
                onChange={(e) => setForm({ ...form, siteRole: e.target.value })}
              />
            </Field>
            <Field label="Có hiệu lực từ">
              <DateInput
                value={form.assignedFrom}
                onChange={(v) => setForm({ ...form, assignedFrom: v })}
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

          <Button
            type="submit"
            variant="primary"
            className="mt-3"
            disabled={createAssignment.isPending}
          >
            {createAssignment.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
        </form>
      )}

      {isLoading && <TableSkeleton columns={5} />}
      {error && <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState message="Chưa có phân công nào. Người ở hiện trường sẽ không thấy công trình nào cho tới khi được phân công — bấm «Thêm phân công» để bắt đầu." />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="p-3 font-medium">Người</th>
                <th className="p-3 font-medium">Công trình</th>
                <th className="p-3 font-medium">Pháp nhân</th>
                <th className="p-3 font-medium">Vai trò tại công trình</th>
                <th className="p-3 font-medium">Hiệu lực</th>
                <th className="p-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const company = lookupCompany(a.site?.company_id ?? null);
                const daKetThuc = a.assigned_to !== null;
                return (
                  <tr key={a.id} className="border-b border-border last:border-b-0">
                    <td className="p-3">{a.assigned_user?.full_name ?? 'Không rõ'}</td>
                    <td className="p-3">
                      {a.site ? `${a.site.code} — ${a.site.name}` : 'Công trình đã xóa'}
                    </td>
                    <td className="p-3">{company?.short_name ?? '—'}</td>
                    <td className="p-3">{a.site_role ?? '—'}</td>
                    <td className="p-3">
                      {formatDate(a.assigned_from)}
                      {daKetThuc ? ` — ${formatDate(a.assigned_to)}` : ' — đang hiệu lực'}
                    </td>
                    <td className="p-3">
                      {canEdit && !daKetThuc && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={endAssignment.isPending}
                          onClick={() => void endOne(a.id)}
                        >
                          Kết thúc
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
    </>
  );
}
