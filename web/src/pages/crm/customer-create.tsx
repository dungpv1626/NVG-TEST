/**
 * Tạo khách hàng mới — mẫu bố cục Biểu mẫu (Webapp Flow Mục 4.4).
 *
 * Biểu mẫu dưới ~10 trường nên hiển thị MỘT TRANG, không dùng wizard.
 * Sau khi lưu thành công chuyển THẲNG đến màn hình Chi tiết của hồ sơ vừa tạo —
 * không quay lại danh sách rồi bắt người dùng tìm lại (Webapp Flow 4.4).
 *
 * Các trường nhập nằm ở `customer-form.tsx`, dùng chung với màn hình Sửa.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUTTONS, ERRORS } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { BlockedNotice } from '@/components/ui/states';
import { useCreateEntity } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { companyCodeOf, useAuth, useCan } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';
import {
  CustomerFields,
  EMPTY_CUSTOMER_FORM,
  customerPayload,
  type CustomerFormValues,
} from './customer-form';

const BREADCRUMBS = [
  { label: 'Khách hàng & Cơ hội' },
  { label: 'Khách hàng', to: '/crm/khach-hang' },
  { label: 'Tạo mới' },
];

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Phòng thủ nhiều lớp: nút đã bị ẩn ở màn hình Danh sách, nhưng người dùng vẫn có thể
  // gõ thẳng đường dẫn. Nói rõ lý do thay vì để họ điền xong rồi mới báo lỗi.
  const canCreate = useCan('CRM', 'create');
  const selectedCompanyId = useCompanyStore((s) => s.selectedCompanyId);

  const [form, setForm] = useState<CustomerFormValues>(EMPTY_CUSTOMER_FORM);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Hàng rào chống mất dữ liệu áp cho MỌI lối ra khỏi trang, không riêng nút Hủy
  // (Webapp Flow 6.3).
  const releaseUnsavedGuard = useUnsavedChangesGuard(dirty);

  const createCustomer = useCreateEntity<Record<string, unknown>, { id: string }>({
    table: 'customers',
    // Bảng dùng chung — không gắn company_id (Backend Schema 2.2).
    scopedByCompany: false,
  });

  function update(field: keyof CustomerFormValues, value: string) {
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
        companyCodeOf(profile, selectedCompanyId) ?? profile?.assignments[0]?.companyCode ?? 'NVG';

      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: companyCode,
        p_record_type: 'KH',
      });
      if (codeError) throw codeError;

      const created = await createCustomer.mutateAsync({
        code,
        ...customerPayload(form),
        // Người tạo nhận trách nhiệm hồ sơ mới. Chuyển giao cho người khác là thao tác
        // riêng ở màn hình Sửa, không phải quyết định lúc đang nhập liệu.
        responsible_user_id: profile?.id ?? null,
      });

      setDirty(false);
      releaseUnsavedGuard();
      navigate(`/crm/khach-hang/${created.id}`, { replace: true });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  function handleCancel() {
    // KHÔNG hỏi ở đây: `useUnsavedChangesGuard` đã chặn mọi lần chuyển trang, kể cả
    // lần này. Hỏi thêm một lần nữa là bắt người dùng xác nhận hai lần cho một việc.
    navigate('/crm/khach-hang');
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader title="Tạo khách hàng mới" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Vai trò hiện tại không có quyền tạo khách hàng."
          detail="Liên hệ quản lý trực tiếp nếu cần được cấp quyền, hoặc quay lại danh sách khách hàng."
          action={
            <Button variant="secondary" onClick={() => navigate('/crm/khach-hang')}>
              {BUTTONS.back}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tạo khách hàng mới" breadcrumbs={BREADCRUMBS} />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <CustomerFields value={form} onChange={update} />

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
          >
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
