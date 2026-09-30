/**
 * Tạo gói thầu (DA-01, DA-02) — mẫu bố cục Biểu mẫu một trang (Webapp Flow 4.4).
 *
 * Gói thầu có hai đường vào, và biểu mẫu phải phục vụ được cả hai:
 *   1. Từ CƠ HỘI đã chốt của Kinh doanh — chọn cơ hội thì khách hàng suy ra theo, không nhập lại.
 *   2. Từ THƯ MỜI THẦU trực tiếp — không có cơ hội, chỉ có chủ đầu tư.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUTTONS, ERRORS } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { BlockedNotice } from '@/components/ui/states';
import { useActiveUsers } from '@/hooks/use-active-users';
import { useCreateBiddingProject } from '@/hooks/use-bidding-projects';
import { useEntityList } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useOpportunities } from '@/hooks/use-opportunities';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { companyCodeOf, useAuth, useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

const BREADCRUMBS = [
  { label: 'Dự án – Đấu thầu' },
  { label: 'Gói thầu', to: '/da/goi-thau' },
  { label: 'Tạo mới' },
];

interface CustomerOption {
  id: string;
  name: string;
}

export function BiddingCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canCreate = useCan('DA', 'create');
  const scope = useCompanyScope();
  const companyId = scope.companyId;

  const { data: customers } = useEntityList<CustomerOption>({
    table: 'customers',
    scopedByCompany: false,
    select: 'id, name',
    orderBy: { column: 'name', ascending: true },
  });
  const { data: opportunities } = useOpportunities();
  const { data: users } = useActiveUsers();
  const createProject = useCreateBiddingProject();

  const [form, setForm] = useState({
    name: '',
    opportunityId: '',
    customerId: '',
    responsibleUserId: '',
    estimatedValue: '',
    submissionDeadline: '',
    siteAddress: '',
    clarificationNotes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Hàng rào chống mất dữ liệu áp cho MỌI lối ra khỏi trang, không riêng nút Hủy
  // (Webapp Flow 6.3).
  const releaseUnsavedGuard = useUnsavedChangesGuard(dirty);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => {
      if (field !== 'opportunityId') return { ...f, [field]: value };
      // Chọn cơ hội thì khách hàng và tên gói thầu điền theo — PRD Mục 2.3: nhập một lần
      // tại nơi phát sinh, module sau LIÊN KẾT chứ không nhập lại.
      const source = (opportunities ?? []).find((o) => o.id === value);
      return {
        ...f,
        opportunityId: value,
        customerId: source?.customer?.id ?? f.customerId,
        name: f.name || (source?.name ?? ''),
        estimatedValue:
          f.estimatedValue || (source?.estimated_value ? String(source.estimated_value) : ''),
      };
    });
    setDirty(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError(ERRORS.requiredField('tên gói thầu'));
      return;
    }
    if (!companyId) {
      setError(
        'Chưa chọn pháp nhân. Chọn pháp nhân ở bộ chọn góc trên bên trái trước khi tạo hồ sơ.',
      );
      return;
    }

    try {
      const companyCode = companyCodeOf(profile, companyId) ?? 'NVC';
      const { data: code, error: codeError } = await supabase.rpc('next_record_code', {
        p_company_code: companyCode,
        p_record_type: 'DA',
      });
      if (codeError) throw codeError;

      const created = await createProject.mutateAsync({
        code,
        companyId,
        name: form.name.trim(),
        customerId: form.customerId || null,
        opportunityId: form.opportunityId || null,
        responsibleUserId: form.responsibleUserId || profile?.id || null,
        estimatedValue: form.estimatedValue.trim() || null,
        submissionDeadline: form.submissionDeadline || null,
        siteAddress: form.siteAddress.trim() || null,
        clarificationNotes: form.clarificationNotes.trim() || null,
      });

      setDirty(false);
      releaseUnsavedGuard();
      void navigate(`/da/goi-thau/${created.id}`, { replace: true });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  function handleCancel() {
    // KHÔNG hỏi ở đây: `useUnsavedChangesGuard` đã chặn mọi lần chuyển trang, kể cả
    // lần này. Hỏi thêm một lần nữa là bắt người dùng xác nhận hai lần cho một việc.
    void navigate('/da/goi-thau');
  }

  // Chế độ gộp "Toàn NVG" KHÔNG ghi được: NVG là mã tổng hợp toàn tập đoàn, không phải pháp
  // nhân giao dịch (Backend Schema 2.2). Hồ sơ ghi vào đó rơi ra ngoài P&L của cả ba công ty
  // — biến mất khỏi mọi màn hình đã lọc, mà báo cáo gộp vẫn cộng vào. CSDL cũng chặn
  // (migration 0108); chặn ở đây để người dùng biết trước khi gõ xong cả biểu mẫu.
  if (scope.isAggregate || !scope.companyId) {
    return (
      <>
        <PageHeader title="Tạo gói thầu mới" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Chọn pháp nhân trước khi tạo gói thầu"
          detail="Gói thầu thuộc về một pháp nhân cụ thể vì doanh thu và chi phí của nó vào P&amp;L của đúng công ty đó. Chọn NVC, NVO hoặc NVS ở bộ chọn góc trên bên trái."
          action={
            <Button variant="secondary" onClick={() => navigate('/da/goi-thau')}>
              {BUTTONS.back}
            </Button>
          }
        />
      </>
    );
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader title="Tạo gói thầu mới" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Vai trò hiện tại không có quyền tạo gói thầu."
          detail="Phòng Dự án – Đấu thầu tạo hồ sơ gói thầu. Liên hệ quản lý trực tiếp nếu cần được cấp quyền."
          action={
            <Button variant="secondary" onClick={() => navigate('/da/goi-thau')}>
              {BUTTONS.back}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tạo gói thầu mới" breadcrumbs={BREADCRUMBS} />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên gói thầu" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} autoFocus />
          </Field>

          <Field
            label="Cơ hội kinh doanh"
            className="sm:col-span-2"
            hint="Chọn nếu gói thầu đến từ một cơ hội đã chốt — khách hàng và giá trị dự kiến sẽ điền theo."
          >
            <select
              value={form.opportunityId}
              onChange={(e) => update('opportunityId', e.target.value)}
              className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
            >
              <option value="">Không đến từ cơ hội (thư mời thầu trực tiếp)</option>
              {(opportunities ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Chủ đầu tư">
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

          <Field label="Giá trị dự kiến" hint="Đơn vị đồng.">
            <MoneyInput value={form.estimatedValue} onChange={(v) => update('estimatedValue', v)} />
          </Field>

          <Field label="Hạn nộp thầu">
            <DateInput
              value={form.submissionDeadline}
              onChange={(v) => update('submissionDeadline', v)}
            />
          </Field>

          <Field label="Địa điểm công trình" className="sm:col-span-2">
            <Input
              value={form.siteAddress}
              onChange={(e) => update('siteAddress', e.target.value)}
            />
          </Field>

          <Field
            label="Nội dung cần làm rõ"
            className="sm:col-span-2"
            hint="Những điểm hồ sơ mời thầu còn thiếu hoặc mâu thuẫn, cần hỏi lại chủ đầu tư."
          >
            <textarea
              value={form.clarificationNotes}
              onChange={(e) => update('clarificationNotes', e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2"
            />
          </Field>
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
          <Button type="submit" variant="primary" disabled={createProject.isPending}>
            {createProject.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
          <Button type="button" variant="subtle" onClick={handleCancel}>
            {BUTTONS.cancel}
          </Button>
        </div>
      </form>
    </>
  );
}
