/**
 * Tạo khách hàng mới — mẫu bố cục Biểu mẫu (Webapp Flow Mục 4.4).
 *
 * Biểu mẫu dưới ~10 trường nên hiển thị MỘT TRANG, không dùng wizard.
 * Sau khi lưu thành công chuyển THẲNG đến màn hình Chi tiết của hồ sơ vừa tạo —
 * không quay lại danh sách rồi bắt người dùng tìm lại (Webapp Flow 4.4).
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUTTONS, CONFIRMS, ERRORS } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateEntity } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth, useCan } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/** Nguồn khách theo PRD CRM-01. */
const SOURCES = [
  'Giới thiệu',
  'BNI',
  'Facebook',
  'Website',
  'Môi giới bất động sản công nghiệp',
  'Mời thầu',
  'Khác',
];

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Phòng thủ nhiều lớp: nút đã bị ẩn ở màn hình Danh sách, nhưng người dùng vẫn có thể
  // gõ thẳng đường dẫn. Nói rõ lý do thay vì để họ điền xong rồi mới báo lỗi.
  const canCreate = useCan('CRM', 'create');
  const selectedCompanyId = useCompanyStore((s) => s.selectedCompanyId);

  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    source: '',
    address: '',
    needs: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const createCustomer = useCreateEntity<Record<string, unknown>, { id: string }>({
    table: 'customers',
    // Bảng dùng chung — không gắn company_id (Backend Schema 2.2).
    scopedByCompany: false,
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError(ERRORS.requiredField('tên khách hàng'));
      return;
    }

    try {
      // Mã hồ sơ do CSDL cấp — hai người tạo cùng lúc không thể nhận trùng mã.
      const companyCode =
        profile?.assignments.find((a) => a.companyId === selectedCompanyId)?.companyCode ??
        profile?.assignments[0]?.companyCode ??
        'NVG';

      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: companyCode,
        p_record_type: 'KH',
      });
      if (codeError) throw codeError;

      const created = await createCustomer.mutateAsync({
        code,
        name: form.name.trim(),
        contact_person: form.contactPerson.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        source: form.source || null,
        address: form.address.trim() || null,
        needs: form.needs.trim() || null,
        responsible_user_id: profile?.id ?? null,
      });

      setDirty(false);
      navigate(`/crm/khach-hang/${created.id}`, { replace: true });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  function handleCancel() {
    // Không bao giờ để mất dữ liệu đang nhập mà không hỏi (Webapp Flow 6.3).
    if (dirty && !window.confirm(CONFIRMS.unsavedChanges)) return;
    navigate('/crm/khach-hang');
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader
          title="Tạo khách hàng mới"
          breadcrumbs={[
            { label: 'Khách hàng & Cơ hội' },
            { label: 'Khách hàng', to: '/crm/khach-hang' },
            { label: 'Tạo mới' },
          ]}
        />
        <div className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card">
          <p className="font-medium">Vai trò hiện tại không có quyền tạo khách hàng.</p>
          <p className="mt-1 text-fg-subtle">
            Liên hệ quản lý trực tiếp nếu cần được cấp quyền, hoặc quay lại danh sách khách hàng.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/crm/khach-hang')}>
            {BUTTONS.back}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tạo khách hàng mới"
        breadcrumbs={[
          { label: 'Khách hàng & Cơ hội' },
          { label: 'Khách hàng', to: '/crm/khach-hang' },
          { label: 'Tạo mới' },
        ]}
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên khách hàng" required className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              autoFocus
              aria-invalid={Boolean(error) || undefined}
            />
          </Field>

          <Field label="Người liên hệ">
            <Input
              value={form.contactPerson}
              onChange={(e) => update('contactPerson', e.target.value)}
            />
          </Field>

          <Field label="Điện thoại">
            <Input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              inputMode="tel"
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </Field>

          <Field label="Nguồn khách">
            <select
              value={form.source}
              onChange={(e) => update('source', e.target.value)}
              className="h-9 w-full rounded-sm border border-border bg-surface px-3"
            >
              <option value="">Chưa xác định</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Địa chỉ" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => update('address', e.target.value)} />
          </Field>

          <Field label="Nhu cầu" className="sm:col-span-2">
            <textarea
              value={form.needs}
              onChange={(e) => update('needs', e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
            />
          </Field>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2">
          {/* Hành động chính DUY NHẤT của màn hình (Content Guidelines 6.3). */}
          <Button type="submit" variant="primary" disabled={createCustomer.isPending}>
            {createCustomer.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
          {/* Nút Hủy KHÔNG đặt cạnh nút có tác động phá hủy (Content Guidelines 4.5). */}
          <Button type="button" variant="subtle" onClick={handleCancel}>
            {BUTTONS.cancel}
          </Button>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // Bọc ô nhập trong <label> để có liên kết ngầm định — trình đọc màn hình đọc được tên
    // trường, và bấm vào nhãn thì con trỏ nhảy vào ô (Content Guidelines 6.8).
    <label className={cn('block space-y-1.5', className)}>
      {/* Nhãn trường KHÔNG có dấu hai chấm ở cuối (Content Guidelines 4.9). */}
      <span className="block font-medium">
        {label}
        {required && <span className="ml-0.5 text-status-overdue">*</span>}
      </span>
      {children}
    </label>
  );
}
