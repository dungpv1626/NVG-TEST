/**
 * Ghi đầu mối mới (Đợt 1 — 1A) — mẫu bố cục 4 «Biểu mẫu».
 *
 * Nhanh là tiêu chí chính: người vừa gọi tới hotline thì chỉ cần tên + số + nguồn là lưu được.
 * Gõ xong số điện thoại là biết ngay số đó đã có ở đầu mối / khách hàng nào (của ai) — để không
 * gọi trùng khách của đồng nghiệp. Mã và người phụ trách do CSDL đặt.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CUSTOMER_SOURCES, ERRORS, OPPORTUNITY_PROJECT_TYPES } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { FormLayout, FormSection } from '@/components/ui/form-page';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useEntityList } from '@/hooks/use-entity';
import { useContactDuplicates, useCreateLead } from '@/hooks/use-leads';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { ContactDuplicatesNotice } from './contact-duplicates-notice';
import { useCan, useIsOrgManager } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';

const BREADCRUMBS = [
  { label: 'Khách hàng & Cơ hội' },
  { label: 'Đầu mối', to: '/crm/dau-moi' },
  { label: 'Ghi mới' },
];

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

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
    referredBy: '',
  });
  // Khách giới thiệu khách (CRM-07): chỉ hỏi khi nguồn là giới thiệu / khách cũ.
  const askReferrer = form.source === 'Giới thiệu' || form.source === 'Khách cũ giới thiệu';
  const { data: customers } = useEntityList<{ id: string; code: string; name: string }>({
    table: 'customers',
    scopedByCompany: false,
    select: 'id, code, name',
    orderBy: { column: 'name', ascending: true },
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
        referredByCustomerId: askReferrer ? form.referredBy || null : null,
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
      <form onSubmit={handleSubmit} noValidate>
        {/* v2 (màn 2.8): hai mục + thẻ «Sau khi lưu» — chỉ nói việc hệ thống thật sự làm. */}
        <FormLayout
          afterSave={[
            'Đầu mối ở trạng thái Mới — chưa liên hệ lần nào.',
            'Mỗi lần liên hệ ghi vào Nhật ký chăm sóc kèm bước tiếp và ngày hẹn; tới hẹn thì hiện trong Việc cần làm.',
            'Khách có nhu cầu thật thì chuyển thành cơ hội bằng một nút, không nhập lại.',
          ]}
        >
          <FormSection n={1} title="Người liên hệ">
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

            <ContactDuplicatesNotice
              hits={duplicates.data ?? []}
              footer={
                sameCompanyLead
                  ? 'Cùng pháp nhân thì không tạo trùng được — mở đầu mối trên và ghi tiếp nhật ký.'
                  : null
              }
            />

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

            {askReferrer && (
              <Field
                label="Khách đã giới thiệu"
                optional
                hint="Khách cũ nào giới thiệu — để biết khách nào mang lại khách mới"
                className="sm:col-span-2"
              >
                <select
                  value={form.referredBy}
                  onChange={(e) => update('referredBy', e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Không chọn</option>
                  {(customers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </FormSection>

          <FormSection n={2} title="Nhu cầu ban đầu">
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
                className="w-full rounded-field border border-border-strong bg-surface px-3 py-2 placeholder:text-fg-subtle"
              />
            </Field>
          </FormSection>

          {error && (
            <p
              role="alert"
              className="rounded-field bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
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
        </FormLayout>
      </form>
    </>
  );
}
