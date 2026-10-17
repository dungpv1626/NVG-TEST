/**
 * Ghi đầu mối mới (Đợt 1 — 1A) — mẫu bố cục 4 «Biểu mẫu».
 *
 * Nhanh là tiêu chí chính: người vừa gọi tới hotline thì chỉ cần tên + số + nguồn là lưu được.
 * Gõ xong số điện thoại là biết ngay số đó đã có ở đầu mối / khách hàng nào (của ai) — để không
 * gọi trùng khách của đồng nghiệp. Mã và người phụ trách do CSDL đặt.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CUSTOMER_SOURCES, ERRORS, LEAD_STATUS_META, OPPORTUNITY_PROJECT_TYPES } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useContactDuplicates, useCreateLead } from '@/hooks/use-leads';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useCan, useIsOrgManager } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';

const BREADCRUMBS = [
  { label: 'Khách hàng & Cơ hội' },
  { label: 'Đầu mối', to: '/crm/dau-moi' },
  { label: 'Ghi mới' },
];

const SELECT_CLASS = 'h-9 w-full rounded-sm border border-border-strong bg-surface px-3';

export function LeadCreatePage() {
  const navigate = useNavigate();
  const scope = useCompanyScope();
  const canCreateCrm = useCan('CRM', 'create');
  // Lãnh đạo đi chào khách cũng ghi được đầu mối (policy `leads_insert`).
  const isLeader = useIsOrgManager();
  const canCreate = canCreateCrm || isLeader;
  const createLead = useCreateLead();

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    area: '',
    source: '',
    sourceDetail: '',
    need: '',
    projectType: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const releaseUnsavedGuard = useUnsavedChangesGuard(dirty);
  const duplicates = useContactDuplicates(form.phone);
  const sameCompanyLead = (duplicates.data ?? []).find(
    (d) => d.kind === 'lead' && d.company_code === scope.companyCode,
  );

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.fullName.trim()) return setError(ERRORS.requiredField('tên người liên hệ'));
    if (!form.phone.replace(/\D/g, '') && !form.email.trim()) {
      return setError(
        'Nhập số điện thoại hoặc email — không có cách liên lạc thì không chăm sóc được.',
      );
    }
    if (!form.source) return setError(ERRORS.requiredField('nguồn'));
    try {
      const created = await createLead.mutateAsync({
        companyId: scope.companyId!,
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        area: form.area.trim() || null,
        source: form.source,
        sourceDetail: form.sourceDetail.trim() || null,
        need: form.need.trim() || null,
        projectType: form.projectType || null,
        notes: form.notes.trim() || null,
      });
      setDirty(false);
      releaseUnsavedGuard();
      void navigate(`/crm/dau-moi/${created.id}`, { replace: true });
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === '23505'
          ? 'Số điện thoại này đã có ở một đầu mối khác của pháp nhân. Mở đầu mối đó và ghi tiếp nhật ký thay vì tạo mới.'
          : toUserMessage(err, 'create'),
      );
    }
  }

  if (scope.isAggregate || !scope.companyId) {
    return (
      <>
        <PageHeader title="Ghi đầu mối" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Chọn pháp nhân trước khi ghi đầu mối"
          detail="Đầu mối thuộc về công ty sẽ chăm sóc khách. Chọn NVC, NVO hoặc NVS ở bộ chọn góc trên bên trái."
        />
      </>
    );
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader title="Ghi đầu mối" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Vai trò hiện tại không có quyền ghi đầu mối."
          detail="Kinh doanh và Ban Giám đốc ghi được đầu mối. Liên hệ quản lý trực tiếp nếu cần được cấp quyền."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ghi đầu mối" breadcrumbs={BREADCRUMBS} />
      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên người liên hệ / doanh nghiệp" required className="sm:col-span-2">
            <Input
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Số điện thoại">
            <Input
              value={form.phone}
              inputMode="tel"
              onChange={(e) => update('phone', e.target.value)}
            />
          </Field>
          <Field label="Email" optional>
            <Input
              value={form.email}
              inputMode="email"
              onChange={(e) => update('email', e.target.value)}
            />
          </Field>

          {(duplicates.data ?? []).length > 0 && (
            <div
              role="status"
              className="rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2 sm:col-span-2"
            >
              <p className="font-medium text-status-pending">Số này đã có trong hệ thống</p>
              <ul className="mt-1 space-y-0.5">
                {duplicates.data!.map((d) => (
                  <li key={d.id}>
                    <Link
                      to={d.kind === 'lead' ? `/crm/dau-moi/${d.id}` : `/crm/khach-hang/${d.id}`}
                      className="text-brand hover:underline"
                    >
                      {d.kind === 'lead' ? 'Đầu mối' : 'Khách hàng'} {d.code} — {d.name}
                    </Link>
                    {d.company_code && <span className="text-fg-subtle"> · {d.company_code}</span>}
                    {d.owner_name && (
                      <span className="text-fg-subtle"> · phụ trách: {d.owner_name}</span>
                    )}
                    {d.status && (
                      <span className="text-fg-subtle"> · {LEAD_STATUS_META[d.status].label}</span>
                    )}
                  </li>
                ))}
              </ul>
              {sameCompanyLead && (
                <p className="mt-1 text-fg-subtle">
                  Cùng pháp nhân thì không tạo trùng được — mở đầu mối trên và ghi tiếp nhật ký.
                </p>
              )}
            </div>
          )}

          <Field label="Nguồn" required>
            <select
              value={form.source}
              onChange={(e) => update('source', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Chọn nguồn</option>
              {CUSTOMER_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Chi tiết nguồn"
            optional
            hint="Ví dụ: tên người giới thiệu, chiến dịch quảng cáo"
          >
            <Input
              value={form.sourceDetail}
              onChange={(e) => update('sourceDetail', e.target.value)}
            />
          </Field>

          <Field label="Khu vực" optional>
            <Input value={form.area} onChange={(e) => update('area', e.target.value)} />
          </Field>
          <Field label="Loại công trình" optional>
            <select
              value={form.projectType}
              onChange={(e) => update('projectType', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Chưa rõ</option>
              {OPPORTUNITY_PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nhu cầu ban đầu" optional className="sm:col-span-2">
            <textarea
              value={form.need}
              onChange={(e) => update('need', e.target.value)}
              rows={3}
              placeholder="Khách nói gì khi liên hệ"
              className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 placeholder:text-fg-subtle"
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

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={createLead.isPending || Boolean(sameCompanyLead)}
          >
            {createLead.isPending ? 'Đang lưu…' : 'Lưu đầu mối'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate('/crm/dau-moi')}>
            Huỷ
          </Button>
        </div>
      </form>
    </>
  );
}
