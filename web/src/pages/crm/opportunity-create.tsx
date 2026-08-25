/**
 * Tạo cơ hội kinh doanh mới (CRM-01, CRM-02).
 *
 * Cơ hội là bảng GIAO DỊCH nên phải gắn `company_id` của pháp nhân đang chọn (NEN-01) —
 * hook `useCreateEntity` tự gắn.
 *
 * Khách hàng chọn từ danh mục đã có, KHÔNG nhập lại tên khách hàng ở đây:
 * PRD Mục 2.3 — "mỗi nghiệp vụ chỉ nhập một lần tại nơi phát sinh; các bộ phận liên quan
 * sử dụng lại, không nhập trùng".
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BUTTONS, CONFIRMS, ERRORS, formatCurrency } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateEntity, useEntityList } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth, useCan } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

/** Loại công trình gợi ý theo ba mảng của NVG (PRD Mục 1.1). */
const PROJECT_TYPES = [
  'Nhà xưởng công nghiệp',
  'Cải tạo nhà máy',
  'Nhà cao tầng',
  'Nhà phố',
  'Biệt thự',
  'Nhà ở nông thôn',
  'Cải tạo nhà ở',
  'Giàn giáo — bán',
  'Giàn giáo — cho thuê',
  'Kết cấu thép',
  'Khác',
];

export function OpportunityCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canCreate = useCan('CRM', 'create');
  const selectedCompanyId = useCompanyStore((s) => s.selectedCompanyId);

  const { data: customers, isLoading: loadingCustomers } = useEntityList<CustomerOption>({
    table: 'customers',
    scopedByCompany: false,
    select: 'id, code, name',
    orderBy: { column: 'name', ascending: true },
  });

  const [form, setForm] = useState({
    customerId: '',
    name: '',
    projectType: '',
    estimatedValue: '',
    expectedStartDate: '',
    dueDate: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const createOpportunity = useCreateEntity<Record<string, unknown>, { id: string }>({
    table: 'opportunities',
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  /** Bỏ mọi ký tự không phải số — người dùng gõ "1.500.000.000" vẫn nhận đúng. */
  const parsedValue = form.estimatedValue.replace(/\D/g, '');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.customerId) return setError(ERRORS.requiredField('khách hàng'));
    if (!form.name.trim()) return setError(ERRORS.requiredField('tên cơ hội'));

    try {
      const companyCode =
        profile?.assignments.find((a) => a.companyId === selectedCompanyId)?.companyCode ??
        profile?.assignments[0]?.companyCode ??
        'NVG';

      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: companyCode,
        p_record_type: 'CH',
      });
      if (codeError) throw codeError;

      const created = await createOpportunity.mutateAsync({
        code,
        customer_id: form.customerId,
        name: form.name.trim(),
        project_type: form.projectType || null,
        estimated_value: parsedValue ? parsedValue : null,
        expected_start_date: form.expectedStartDate || null,
        due_date: form.dueDate || null,
        notes: form.notes.trim() || null,
        owner_id: profile?.id ?? null,
        stage: 'tiep_nhan',
      });

      setDirty(false);
      navigate(`/crm/co-hoi/${created.id}`, { replace: true });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm(CONFIRMS.unsavedChanges)) return;
    navigate('/crm/co-hoi');
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader
          title="Tạo cơ hội mới"
          breadcrumbs={[
            { label: 'Khách hàng & Cơ hội' },
            { label: 'Cơ hội kinh doanh', to: '/crm/co-hoi' },
            { label: 'Tạo mới' },
          ]}
        />
        <div className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card">
          <p className="font-medium">Vai trò hiện tại không có quyền tạo cơ hội kinh doanh.</p>
          <p className="mt-1 text-fg-subtle">Liên hệ quản lý trực tiếp nếu cần được cấp quyền.</p>
        </div>
      </>
    );
  }

  const noCustomers = !loadingCustomers && (customers?.length ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Tạo cơ hội mới"
        breadcrumbs={[
          { label: 'Khách hàng & Cơ hội' },
          { label: 'Cơ hội kinh doanh', to: '/crm/co-hoi' },
          { label: 'Tạo mới' },
        ]}
      />

      {noCustomers ? (
        // Nêu rõ việc cần làm trước, thay vì để biểu mẫu có ô chọn rỗng không giải thích
        // (Content Guidelines 4.7).
        <div className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card">
          <p className="font-medium">Chưa có khách hàng nào trong hệ thống.</p>
          <p className="mt-1 text-fg-subtle">
            Cơ hội kinh doanh luôn gắn với một khách hàng. Tạo hồ sơ khách hàng trước để không
            phải nhập lại thông tin ở nhiều nơi.
          </p>
          <Button variant="primary" className="mt-4" asChild>
            <Link to="/crm/khach-hang/tao-moi">{BUTTONS.create('khách hàng')}</Link>
          </Button>
        </div>
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

            <Field label="Tên cơ hội" required className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Ví dụ: Nhà xưởng cơ khí 3.500 m2 — KCN Quang Minh"
              />
            </Field>

            <Field label="Loại công trình">
              <select
                value={form.projectType}
                onChange={(e) => update('projectType', e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-surface px-3"
              >
                <option value="">Chưa xác định</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Giá trị dự kiến">
              <Input
                value={form.estimatedValue}
                onChange={(e) => update('estimatedValue', e.target.value)}
                inputMode="numeric"
                placeholder="Đơn vị: đồng"
              />
              {parsedValue && (
                <p className="text-xs text-fg-subtle">{formatCurrency(parsedValue)}</p>
              )}
            </Field>

            <Field label="Tiến độ mong muốn">
              <Input
                type="date"
                value={form.expectedStartDate}
                onChange={(e) => update('expectedStartDate', e.target.value)}
              />
            </Field>

            <Field label="Thời hạn xử lý">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => update('dueDate', e.target.value)}
              />
            </Field>

            <Field label="Ghi chú" className="sm:col-span-2">
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
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
            <Button type="submit" variant="primary" disabled={createOpportunity.isPending}>
              {createOpportunity.isPending ? 'Đang lưu…' : BUTTONS.save}
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
    <label className={cn('block space-y-1.5', className)}>
      <span className="block font-medium">
        {label}
        {required && <span className="ml-0.5 text-status-overdue">*</span>}
      </span>
      {children}
    </label>
  );
}
