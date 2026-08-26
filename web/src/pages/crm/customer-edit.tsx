/**
 * Sửa hồ sơ khách hàng (PRD CRM-01) — mẫu bố cục Biểu mẫu (Webapp Flow Mục 4.4).
 *
 * Dùng chung bộ trường với màn hình Tạo mới (`customer-form.tsx`); phần riêng của màn hình
 * này là quyền sửa và việc chuyển người chịu trách nhiệm.
 *
 * Điều kiện hiện màn hình khớp ĐÚNG policy `customers_update`: người chịu trách nhiệm, hoặc
 * hồ sơ chưa có người chịu trách nhiệm, hoặc vai trò cấp tập đoàn. Nếu chỉ dựa vào
 * `useCan('CRM','edit')` thì đồng nghiệp cùng phòng vẫn thấy nút Chỉnh sửa, điền xong mới bị
 * CSDL chặn — đúng tình huống Webapp Flow 6.5 cấm.
 *
 * Mã hồ sơ KHÔNG có trong biểu mẫu: mã do CSDL cấp lúc tạo và bất biến (migration 0019).
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BUTTONS, CONFIRMS, ERRORS } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { BlockedNotice, CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { useActiveUsers } from '@/hooks/use-active-users';
import { useEntityDetail, useUpdateEntity } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth, useCan, useIsResponsible } from '@/lib/auth';
import { CustomerFields, customerPayload, type CustomerFormValues } from './customer-form';

interface EditableCustomer {
  id: string;
  code: string;
  name: string;
  source: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  needs: string | null;
  notes: string | null;
  responsible_user_id: string | null;
}

const SELECT =
  'id, code, name, source, contact_person, phone, email, address, tax_code, needs, notes, responsible_user_id';

export function CustomerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canEditModule = useCan('CRM', 'edit');

  const { data, isLoading, error } = useEntityDetail<EditableCustomer>({
    table: 'customers',
    id,
    select: SELECT,
  });
  const { data: users } = useActiveUsers();
  const isResponsible = useIsResponsible(data?.responsible_user_id);

  const [form, setForm] = useState<CustomerFormValues | null>(null);
  // Hồ sơ nào đang nằm trong biểu mẫu. Không dùng `form === null` làm điều kiện nạp: hai
  // màn hình Sửa của hai khách hàng khác nhau dùng chung một route nên React giữ nguyên
  // component khi chuyển giữa chúng — chỉ so với `null` là biểu mẫu vẫn giữ hồ sơ cũ và
  // người dùng lưu đè dữ liệu khách này sang khách kia.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Nạp dữ liệu vào biểu mẫu MỘT lần cho mỗi hồ sơ. Không đồng bộ lại ở các lần render sau:
  // nếu `data` đổi trong lúc người dùng đang gõ (TanStack Query tải lại nền), ghi đè state
  // là xóa trắng những gì họ vừa nhập (Webapp Flow 6.3).
  useEffect(() => {
    if (!data || loadedId === data.id) return;
    setLoadedId(data.id);
    setDirty(false);
    setSaveError(null);
    setForm({
      name: data.name,
      contactPerson: data.contact_person ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      source: data.source ?? '',
      taxCode: data.tax_code ?? '',
      address: data.address ?? '',
      needs: data.needs ?? '',
      notes: data.notes ?? '',
      responsibleUserId: data.responsible_user_id ?? '',
    });
  }, [data, loadedId]);

  const updateCustomer = useUpdateEntity<EditableCustomer>({ table: 'customers' });

  const detailPath = `/crm/khach-hang/${id}`;
  const breadcrumbs = [
    { label: 'Khách hàng & Cơ hội' },
    { label: 'Khách hàng', to: '/crm/khach-hang' },
    { label: data?.name ?? 'Hồ sơ', to: detailPath },
    { label: 'Chỉnh sửa' },
  ];

  function update(field: keyof CustomerFormValues, value: string) {
    setForm((f) => (f ? { ...f, [field]: value } : f));
    setDirty(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form || !id) return;
    setSaveError(null);

    if (!form.name.trim()) {
      setSaveError(ERRORS.requiredField('tên khách hàng'));
      return;
    }

    try {
      await updateCustomer.mutateAsync({ id, changes: customerPayload(form) });
      setDirty(false);
      navigate(detailPath, { replace: true });
    } catch (e) {
      setSaveError(toUserMessage(e, 'edit'));
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm(CONFIRMS.unsavedChanges)) return;
    navigate(detailPath);
  }

  if (isLoading) return <CardGridSkeleton count={2} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data || !form) {
    return (
      <>
        <PageHeader title="Sửa hồ sơ khách hàng" breadcrumbs={breadcrumbs} />
        <BlockedNotice
          title="Không tìm thấy hồ sơ khách hàng này."
          detail="Có thể hồ sơ đã được xóa, hoặc vai trò hiện tại chưa được cấp quyền xem."
          action={
            <Button variant="secondary" onClick={() => navigate('/crm/khach-hang')}>
              {BUTTONS.back}
            </Button>
          }
        />
      </>
    );
  }

  const unassigned = data.responsible_user_id === null;
  if (!canEditModule || !(isResponsible || unassigned)) {
    const owner = users?.find((u) => u.id === data.responsible_user_id)?.full_name;
    return (
      <>
        <PageHeader title={`Sửa hồ sơ ${data.name}`} breadcrumbs={breadcrumbs} />
        <BlockedNotice
          title="Vai trò hiện tại không sửa được hồ sơ khách hàng này."
          // Nêu rõ AI xử lý được, không dừng ở "không đủ quyền" (Content Guidelines 4.6).
          detail={
            owner
              ? `Hồ sơ do ${owner} chịu trách nhiệm. Liên hệ ${owner} hoặc quản lý trực tiếp để cập nhật thông tin.`
              : 'Chỉ người chịu trách nhiệm hồ sơ hoặc quản lý trực tiếp mới sửa được. Liên hệ quản lý trực tiếp nếu cần.'
          }
          action={
            <Button variant="secondary" onClick={() => navigate(detailPath)}>
              {BUTTONS.back}
            </Button>
          }
        />
      </>
    );
  }

  const handingOver =
    form.responsibleUserId !== (data.responsible_user_id ?? '') &&
    form.responsibleUserId !== (profile?.id ?? '');

  return (
    <>
      <PageHeader title={`Sửa hồ sơ ${data.name}`} breadcrumbs={breadcrumbs} />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        {/* Mã hồ sơ hiển thị để đối chiếu, KHÔNG cho sửa — nó là căn cứ truy ngược của mọi
            hồ sơ liên quan (Backend Schema 2.3). */}
        <p className="mb-4 text-fg-subtle">
          Mã hồ sơ <span className="font-mono text-fg">{data.code}</span> — do hệ thống cấp,
          không thay đổi được.
        </p>

        <CustomerFields
          value={form}
          onChange={update}
          responsibleOptions={users ?? []}
          responsibleHint={
            handingOver
              ? 'Sau khi lưu, chỉ người chịu trách nhiệm mới và quản lý trực tiếp sửa được hồ sơ này.'
              : undefined
          }
        />

        {saveError && (
          <p role="alert" className="mt-4 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
            {saveError}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={updateCustomer.isPending}>
            {updateCustomer.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
          <Button type="button" variant="subtle" onClick={handleCancel}>
            {BUTTONS.cancel}
          </Button>
        </div>
      </form>
    </>
  );
}
