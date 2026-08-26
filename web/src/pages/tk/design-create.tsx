/**
 * Tạo dự án thiết kế (TK-01) — mẫu bố cục Biểu mẫu một trang (Webapp Flow 4.4).
 *
 * Hai đường vào, biểu mẫu phải phục vụ được cả hai:
 *   1. Từ CƠ HỘI đã chốt khảo sát của Kinh doanh — chọn cơ hội thì khách hàng suy ra theo.
 *   2. Trực tiếp từ khách quen của NVO — không có cơ hội, chỉ có chủ nhà.
 *
 * Đầu bài chi tiết KHÔNG nhập ở đây: nó là tài liệu có phiên bản (TK-01) và soạn ở tab Đầu
 * bài sau khi hồ sơ đã tồn tại. Nhồi cả đầu bài vào biểu mẫu tạo mới sẽ khiến bản đầu tiên
 * không có nguyên nhân thay đổi để ghi, mà cũng không ai điền đủ trong một lần.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUTTONS, ERRORS } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice } from '@/components/ui/states';
import { useActiveUsers } from '@/hooks/use-active-users';
import { useCreateDesignProject } from '@/hooks/use-design-projects';
import { useEntityList } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useOpportunities } from '@/hooks/use-opportunities';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useAuth, useCan } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';

const BREADCRUMBS = [
  { label: 'Thiết kế' },
  { label: 'Dự án thiết kế', to: '/tk/du-an' },
  { label: 'Tạo mới' },
];

interface CustomerOption {
  id: string;
  name: string;
}

export function DesignCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canCreate = useCan('TK', 'create');
  const companyId = useCompanyStore((s) => s.selectedCompanyId);

  const { data: customers } = useEntityList<CustomerOption>({
    table: 'customers',
    scopedByCompany: false,
    select: 'id, name',
    orderBy: { column: 'name', ascending: true },
  });
  const { data: opportunities } = useOpportunities();
  const { data: users } = useActiveUsers();
  const createProject = useCreateDesignProject();

  const [form, setForm] = useState({
    name: '',
    opportunityId: '',
    customerId: '',
    responsibleUserId: '',
    handoverDeadline: '',
    siteAddress: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Hàng rào chống mất dữ liệu áp cho MỌI lối ra khỏi trang, không riêng nút Hủy
  // (Webapp Flow 6.3).
  const releaseUnsavedGuard = useUnsavedChangesGuard(dirty);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => {
      if (field !== 'opportunityId') return { ...f, [field]: value };
      // Chọn cơ hội thì khách hàng và tên dự án điền theo — PRD Mục 2.3: nhập một lần tại
      // nơi phát sinh, module sau LIÊN KẾT chứ không nhập lại.
      const source = (opportunities ?? []).find((o) => o.id === value);
      return {
        ...f,
        opportunityId: value,
        customerId: source?.customer?.id ?? f.customerId,
        name: f.name || (source?.name ?? ''),
      };
    });
    setDirty(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError(ERRORS.requiredField('tên dự án thiết kế'));
      return;
    }
    if (!companyId) {
      setError('Chưa chọn pháp nhân. Chọn pháp nhân ở thanh bên trước khi tạo hồ sơ.');
      return;
    }

    try {
      const companyCode =
        profile?.assignments.find((a) => a.companyId === companyId)?.companyCode ?? 'NVO';
      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: companyCode,
        p_record_type: 'TK',
      });
      if (codeError) throw codeError;

      const created = await createProject.mutateAsync({
        code,
        companyId,
        name: form.name.trim(),
        customerId: form.customerId || null,
        opportunityId: form.opportunityId || null,
        responsibleUserId: form.responsibleUserId || profile?.id || null,
        handoverDeadline: form.handoverDeadline || null,
        siteAddress: form.siteAddress.trim() || null,
        notes: form.notes.trim() || null,
      });

      setDirty(false);
      releaseUnsavedGuard();
      navigate(`/tk/du-an/${created.id}`, { replace: true });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  function handleCancel() {
    // KHÔNG hỏi ở đây: `useUnsavedChangesGuard` đã chặn mọi lần chuyển trang, kể cả
    // lần này. Hỏi thêm một lần nữa là bắt người dùng xác nhận hai lần cho một việc.
    navigate('/tk/du-an');
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader title="Tạo dự án thiết kế mới" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Vai trò hiện tại không có quyền tạo dự án thiết kế."
          detail="Phòng Thiết kế – Đấu thầu tạo hồ sơ thiết kế. Liên hệ quản lý trực tiếp nếu cần được cấp quyền."
          action={
            <Button variant="secondary" onClick={() => navigate('/tk/du-an')}>
              {BUTTONS.back}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tạo dự án thiết kế mới" breadcrumbs={BREADCRUMBS} />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên dự án thiết kế" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} autoFocus />
          </Field>

          <Field
            label="Cơ hội kinh doanh"
            className="sm:col-span-2"
            hint="Chọn nếu dự án đến từ một cơ hội đã chốt khảo sát — khách hàng sẽ điền theo."
          >
            <select
              value={form.opportunityId}
              onChange={(e) => update('opportunityId', e.target.value)}
              className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
            >
              <option value="">Không đến từ cơ hội (khách hàng liên hệ trực tiếp)</option>
              {(opportunities ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Khách hàng">
            <select
              value={form.customerId}
              onChange={(e) => update('customerId', e.target.value)}
              className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
            >
              <option value="">Chưa xác định</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Người chịu trách nhiệm">
            <select
              value={form.responsibleUserId}
              onChange={(e) => update('responsibleUserId', e.target.value)}
              className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
            >
              <option value="">Người tạo hồ sơ</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Hạn bàn giao hồ sơ thi công"
            hint="Mốc để tính quá hạn trên danh sách và Dashboard."
          >
            <DateInput
              value={form.handoverDeadline}
              onChange={(v) => update('handoverDeadline', v)}
            />
          </Field>

          <Field label="Địa điểm khu đất">
            <Input
              value={form.siteAddress}
              onChange={(e) => update('siteAddress', e.target.value)}
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
          <p role="alert" className="mt-4 text-status-overdue">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <Button type="submit" variant="primary" disabled={createProject.isPending}>
            {createProject.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
          <Button type="button" variant="secondary" onClick={handleCancel}>
            {BUTTONS.cancel}
          </Button>
        </div>
      </form>
    </>
  );
}
