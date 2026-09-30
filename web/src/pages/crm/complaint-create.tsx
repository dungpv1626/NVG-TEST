/**
 * Ghi nhận khiếu nại (PRD CRM-08) — mẫu bố cục 4 "Biểu mẫu" (Webapp Flow 4.4).
 *
 * CRM-08 nói "ghi nhận VÀ PHÂN LUỒNG": người tiếp nhận (thường là kinh doanh hoặc hành
 * chính) không nhất thiết là người xử lý, nên "Người chủ trì" là một ô chọn chứ không mặc
 * định là người đang đăng nhập.
 *
 * Khách hàng chọn từ danh mục đã có — PRD Mục 2.3 "mỗi nghiệp vụ chỉ nhập một lần tại nơi
 * phát sinh".
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BUTTONS,
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  ERRORS,
  type ComplaintSeverity,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice } from '@/components/ui/states';
import { useActiveUsers, type ActiveUser } from '@/hooks/use-active-users';
import { useEntityList } from '@/hooks/use-entity';
import { useCreateComplaint } from '@/hooks/use-complaints';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { companyCodeOf, useAuth, useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

const BREADCRUMBS = [
  { label: 'Khách hàng & Cơ hội' },
  { label: 'Khiếu nại', to: '/crm/khieu-nai' },
  { label: 'Ghi nhận mới' },
];

export function ComplaintCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const canCreate = useCan('CRM', 'create');
  const scope = useCompanyScope();
  const selectedCompanyId = scope.companyId;

  const { data: customers, isLoading: loadingCustomers } = useEntityList<CustomerOption>({
    table: 'customers',
    scopedByCompany: false,
    select: 'id, code, name',
    orderBy: { column: 'name', ascending: true },
  });
  const { data: users } = useActiveUsers();

  const [form, setForm] = useState({
    // Mở từ Chi tiết Khách hàng thì điền sẵn khách đó — không bắt chọn lại thứ đã biết.
    customerId: searchParams.get('khach-hang') ?? '',
    title: '',
    content: '',
    severity: 'trung_binh' as ComplaintSeverity,
    assigneeId: '',
    collaboratorIds: [] as string[],
    responseDueDate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Hàng rào chống mất dữ liệu áp cho MỌI lối ra khỏi trang, không riêng nút Hủy
  // (Webapp Flow 6.3).
  const releaseUnsavedGuard = useUnsavedChangesGuard(dirty);

  const createComplaint = useCreateComplaint();

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.customerId) return setError(ERRORS.requiredField('khách hàng'));
    if (!form.title.trim()) return setError(ERRORS.requiredField('tiêu đề khiếu nại'));
    if (!form.content.trim()) return setError(ERRORS.requiredField('nội dung khách phản ánh'));

    try {
      const companyCode =
        companyCodeOf(profile, selectedCompanyId) ?? profile?.assignments[0]?.companyCode ?? 'NVG';

      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: companyCode,
        p_record_type: 'KN',
      });
      if (codeError) throw codeError;

      const created = await createComplaint.mutateAsync({
        code: code as string,
        companyId: selectedCompanyId!,
        customerId: form.customerId,
        title: form.title.trim(),
        content: form.content.trim(),
        severity: form.severity,
        assigneeId: form.assigneeId || null,
        // Người chủ trì không cần nằm trong danh sách phối hợp — mẫu RLS B xét cả hai.
        collaboratorIds: form.collaboratorIds.filter((id) => id !== form.assigneeId),
        responseDueDate: form.responseDueDate || null,
      });

      setDirty(false);
      releaseUnsavedGuard();
      void navigate(`/crm/khieu-nai/${created.id}`, { replace: true });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  function handleCancel() {
    // KHÔNG hỏi ở đây: `useUnsavedChangesGuard` đã chặn mọi lần chuyển trang, kể cả
    // lần này. Hỏi thêm một lần nữa là bắt người dùng xác nhận hai lần cho một việc.
    void navigate('/crm/khieu-nai');
  }

  // Chế độ gộp "Toàn NVG" KHÔNG ghi được: NVG là mã tổng hợp toàn tập đoàn, không phải pháp
  // nhân giao dịch (Backend Schema 2.2). Hồ sơ ghi vào đó rơi ra ngoài P&L của cả ba công ty
  // — biến mất khỏi mọi màn hình đã lọc, mà báo cáo gộp vẫn cộng vào. CSDL cũng chặn
  // (migration 0108); chặn ở đây để người dùng biết trước khi gõ xong cả biểu mẫu.
  if (scope.isAggregate || !scope.companyId) {
    return (
      <>
        <PageHeader title="Ghi nhận khiếu nại" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Chọn pháp nhân trước khi ghi nhận khiếu nại"
          detail="Khiếu nại gắn với hợp đồng và công trình của một pháp nhân cụ thể. Chọn NVC, NVO hoặc NVS ở bộ chọn góc trên bên trái."
        />
      </>
    );
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader title="Ghi nhận khiếu nại" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Vai trò hiện tại không có quyền ghi nhận khiếu nại."
          detail="Liên hệ quản lý trực tiếp nếu cần được cấp quyền."
        />
      </>
    );
  }

  const noCustomers = !loadingCustomers && (customers?.length ?? 0) === 0;

  return (
    <>
      <PageHeader title="Ghi nhận khiếu nại" breadcrumbs={BREADCRUMBS} />

      {noCustomers ? (
        <BlockedNotice
          title="Chưa có khách hàng nào trong hệ thống."
          detail="Khiếu nại luôn gắn với một khách hàng. Tạo hồ sơ khách hàng trước để không phải nhập lại thông tin ở nhiều nơi."
          action={
            <Button variant="primary" asChild>
              <Link to="/crm/khach-hang/tao-moi">{BUTTONS.create('khách hàng')}</Link>
            </Button>
          }
        />
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Khách hàng" required className="sm:col-span-2">
              <select
                value={form.customerId}
                onChange={(e) => update('customerId', e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-surface px-3"
              >
                <option value="">Chọn khách hàng</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tiêu đề" required className="sm:col-span-2">
              <Input
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="Ví dụ: Thấm trần tầng 2 sau mưa lớn"
              />
            </Field>

            <Field
              label="Nội dung khách phản ánh"
              required
              hint="Ghi đúng lời khách. Không thêm nhận xét cảm tính hay suy đoán."
              className="sm:col-span-2"
            >
              <textarea
                value={form.content}
                onChange={(e) => update('content', e.target.value)}
                rows={4}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
              />
            </Field>

            <Field label="Mức độ nghiêm trọng">
              <select
                value={form.severity}
                onChange={(e) => update('severity', e.target.value as ComplaintSeverity)}
                className="h-9 w-full rounded-sm border border-border bg-surface px-3"
              >
                {COMPLAINT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {COMPLAINT_SEVERITY_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Hạn phản hồi">
              <DateInput
                value={form.responseDueDate}
                onChange={(v) => update('responseDueDate', v)}
              />
            </Field>

            <Field label="Người chủ trì" className="sm:col-span-2">
              <select
                value={form.assigneeId}
                onChange={(e) => update('assigneeId', e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-surface px-3"
              >
                <option value="">Chưa phân công</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <PeoplePicker
              label="Người phối hợp"
              hint="Người phối hợp cũng sửa được diễn biến xử lý của khiếu nại này."
              users={(users ?? []).filter((u) => u.id !== form.assigneeId)}
              selected={form.collaboratorIds}
              onChange={(ids) => update('collaboratorIds', ids)}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={createComplaint.isPending}>
              {createComplaint.isPending ? 'Đang lưu…' : BUTTONS.save}
            </Button>
            <Button type="button" variant="subtle" onClick={handleCancel}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

/**
 * Chọn nhiều người bằng danh sách hộp kiểm.
 *
 * Không dùng `<select multiple>`: người dùng phải giữ Ctrl để chọn nhiều, và bỏ chọn nhầm
 * toàn bộ chỉ bằng một cú nhấp — đúng kiểu thao tác "không bao giờ để mất dữ liệu đang nhập"
 * mà Webapp Flow 6.3 muốn tránh.
 */
function PeoplePicker({
  label,
  hint,
  users,
  selected,
  onChange,
}: {
  label: string;
  hint: string;
  users: ActiveUser[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="font-medium">{label}</legend>
      <p className="text-xs text-fg-subtle">{hint}</p>
      <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
        {users.map((u) => (
          <label key={u.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(u.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...selected, u.id] : selected.filter((id) => id !== u.id),
                )
              }
            />
            <span>{u.full_name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
