/**
 * Chi tiết Đầu mối (Đợt 1 — 1A, 1B) — mẫu bố cục 3 «Hồ sơ 360°».
 *
 * Mở ra ở tab Nhật ký chăm sóc: việc hằng ngày với một đầu mối là ghi lần liên hệ và hẹn bước
 * tiếp. Bốn lối ra của đầu mối: Chuyển thành cơ hội (có nhu cầu thật) · M1 Lưu trữ (chưa có nhu
 * cầu, hẹn ngày liên hệ lại) · Không phù hợp (bắt buộc lý do) · Mở lại.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { showcaseSendPath } from '@/pages/showcase/send-showcase-link';
import {
  CUSTOMER_SOURCES,
  LEAD_STATUS_META,
  OPPORTUNITY_PROJECT_TYPES,
  formatDate,
  formatDateTime,
  formatPhone,
  isLeadOpen,
  leadDisplayStatus,
} from '@nvg/shared';
import { ContactLogPanel } from '@/components/crm/contact-log-panel';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useContactDuplicates,
  useConvertLead,
  useLead,
  useUpdateLead,
  type LeadRecord,
} from '@/hooks/use-leads';
import { useCan, useIsOrgManager, useIsResponsible } from '@/lib/auth';

const EM_DASH = '—';
const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading, error } = useLead(id);
  const update = useUpdateLead();
  const prompt = usePromptDialog();
  const canCreateCrm = useCan('CRM', 'create');
  const isLeader = useIsOrgManager();
  const isResponsible = useIsResponsible(lead?.owner_id);
  const [converting, setConverting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!lead) {
    return (
      <RecordNotFound
        entity="đầu mối"
        listPath="/crm/dau-moi"
        listLabel="Quay lại danh sách đầu mối"
      />
    );
  }

  // Trùng điều kiện CSDL: người phụ trách / lãnh đạo, còn quyền ghi CRM, đầu mối chưa thành cơ hội.
  const canEdit = isResponsible && (canCreateCrm || isLeader) && !lead.converted_at;
  const open = isLeadOpen(lead.status);

  async function run(changes: Parameters<typeof update.mutateAsync>[0]['changes']) {
    setActionError(null);
    try {
      await update.mutateAsync({ id: lead!.id, changes });
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  async function archive() {
    const date = await prompt.ask({
      title: 'Lưu trữ — khách chưa có nhu cầu',
      label: 'Ngày liên hệ lại',
      type: 'date',
      detail: 'Đầu mối rời danh sách cần gọi; tới ngày này hệ thống nhắc liên hệ lại.',
      confirmLabel: 'Lưu trữ',
    });
    if (date) await run({ status: 'luu_tru', recontact_at: date });
  }

  async function reject() {
    const reason = await prompt.ask({
      title: 'Đánh dấu không phù hợp?',
      label: 'Lý do',
      placeholder: 'Ví dụ: ngoài khu vực phục vụ, chỉ hỏi giá cho biết',
      detail: 'Đầu mối được giữ lại để đồng nghiệp không gọi trùng. Mở lại được khi cần.',
      confirmLabel: 'Đánh dấu không phù hợp',
      danger: true,
    });
    if (reason) await run({ status: 'khong_phu_hop', closed_reason: reason });
  }

  return (
    <>
      {prompt.dialog}
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Khách hàng & Cơ hội' },
          { label: 'Đầu mối', to: '/crm/dau-moi' },
          { label: lead.full_name },
        ]}
        title={lead.full_name}
        code={lead.code}
        status={leadDisplayStatus(lead)}
        responsiblePerson={lead.owner?.full_name ?? null}
        deadline={
          open ? (lead.status === 'luu_tru' ? lead.recontact_at : lead.next_action_at) : null
        }
        defaultTab="nhat-ky"
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              {lead.status !== 'khong_phu_hop' && (
                <Button variant="primary" onClick={() => setConverting(true)}>
                  Chuyển thành cơ hội
                </Button>
              )}
              {/* Gửi mẫu công trình cho khách ngay từ đầu mối — link gắn với đầu mối, tạo xong ghi nhật ký chăm sóc. */}
              {open && (
                <Button variant="secondary" asChild>
                  <Link
                    to={showcaseSendPath({
                      leadId: lead.id,
                      name: lead.full_name,
                      projectType: lead.project_type,
                    })}
                  >
                    Gửi mẫu công trình
                  </Link>
                </Button>
              )}
              {open && lead.status !== 'luu_tru' && (
                <Button
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => void archive()}
                >
                  Lưu trữ — chưa có nhu cầu
                </Button>
              )}
              {open && (
                <Button
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => void reject()}
                >
                  Không phù hợp
                </Button>
              )}
              {!open && (
                <Button
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() =>
                    void run({ status: 'da_lien_he', closed_reason: null, recontact_at: null })
                  }
                >
                  Mở lại
                </Button>
              )}
              {lead.status === 'luu_tru' && (
                <Button
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => void run({ status: 'da_lien_he', recontact_at: null })}
                >
                  Theo dõi lại ngay
                </Button>
              )}
            </div>
          ) : undefined
        }
        tabs={[
          {
            id: 'nhat-ky',
            label: 'Nhật ký chăm sóc',
            content: (
              <>
                <StatusNote lead={lead} />
                <ContactLogPanel
                  subject={{ leadId: lead.id }}
                  canWrite={canEdit}
                  emptyHint={
                    lead.converted_at
                      ? 'Đầu mối đã thành cơ hội — việc chăm sóc tiếp tục trên cơ hội.'
                      : undefined
                  }
                />
              </>
            ),
          },
          {
            id: 'thong-tin',
            label: 'Thông tin',
            content: canEdit ? (
              <LeadInfoForm lead={lead} saving={update.isPending} onSave={(c) => void run(c)} />
            ) : (
              <LeadInfo lead={lead} />
            ),
          },
        ]}
        historyContent={
          <DetailFields
            fields={[
              { label: 'Ghi nhận lúc', value: formatDateTime(lead.created_at) },
              {
                label: 'Liên hệ gần nhất',
                value: formatDateTime(lead.last_contacted_at) || EM_DASH,
              },
              { label: 'Thành cơ hội lúc', value: formatDateTime(lead.converted_at) || EM_DASH },
              { label: 'Cập nhật gần nhất', value: formatDateTime(lead.updated_at) },
            ]}
          />
        }
        related={[
          {
            title: 'Hồ sơ liên quan',
            records: [
              ...(lead.opportunity
                ? [
                    {
                      label: 'Cơ hội',
                      value: `${lead.opportunity.code} — ${lead.opportunity.name}`,
                      to: `/crm/co-hoi/${lead.opportunity.id}`,
                    },
                  ]
                : []),
              ...(lead.customer_id
                ? [
                    {
                      label: 'Khách hàng',
                      value: 'Mở hồ sơ khách hàng',
                      to: `/crm/khach-hang/${lead.customer_id}`,
                    },
                  ]
                : []),
            ],
          },
        ]}
      />

      {converting && (
        <ConvertDialog
          lead={lead}
          onCancel={() => setConverting(false)}
          onDone={(opportunityId) => void navigate(`/crm/co-hoi/${opportunityId}`)}
        />
      )}
    </>
  );
}

function StatusNote({ lead }: { lead: LeadRecord }) {
  const meta = LEAD_STATUS_META[lead.status];
  let text: string = meta.hint;
  if (lead.status === 'luu_tru')
    text = `Lưu trữ, khách chưa có nhu cầu — liên hệ lại ngày ${formatDate(lead.recontact_at)}.`;
  if (lead.status === 'khong_phu_hop') text = `Không phù hợp: ${lead.closed_reason ?? ''}`;
  if (lead.status === 'moi') text = 'Chưa liên hệ lần nào — ghi lần liên hệ đầu tiên bên dưới.';
  if (lead.status === 'da_lien_he' && lead.next_action) {
    text = `Bước tiếp: ${lead.next_action} — hẹn ${formatDate(lead.next_action_at)}.`;
  }
  return <p className="mb-4 rounded-sm bg-surface-sunken px-3 py-2">{text}</p>;
}

function LeadInfo({ lead }: { lead: LeadRecord }) {
  return (
    <DetailFields
      fields={[
        { label: 'Số điện thoại', value: formatPhone(lead.phone) || EM_DASH },
        { label: 'Email', value: lead.email ?? EM_DASH },
        { label: 'Khu vực', value: lead.area ?? EM_DASH },
        { label: 'Nguồn', value: lead.source },
        { label: 'Chi tiết nguồn', value: lead.source_detail ?? EM_DASH },
        { label: 'Khách đã giới thiệu', value: lead.referrer?.name ?? EM_DASH },
        { label: 'Loại công trình', value: lead.project_type ?? EM_DASH },
        { label: 'Nhu cầu ban đầu', value: lead.need ?? EM_DASH },
        { label: 'Ghi chú', value: lead.notes ?? EM_DASH },
      ]}
    />
  );
}

function LeadInfoForm({
  lead,
  saving,
  onSave,
}: {
  lead: LeadRecord;
  saving: boolean;
  onSave: (changes: {
    full_name: string;
    phone: string | null;
    email: string | null;
    area: string | null;
    source: string;
    need: string | null;
    project_type: string | null;
    notes: string | null;
  }) => void;
}) {
  const [f, setF] = useState({
    fullName: lead.full_name,
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    area: lead.area ?? '',
    source: lead.source,
    need: lead.need ?? '',
    projectType: lead.project_type ?? '',
    notes: lead.notes ?? '',
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <form
      noValidate
      className="grid max-w-2xl gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          full_name: f.fullName.trim() || lead.full_name,
          phone: f.phone.trim() || null,
          email: f.email.trim() || null,
          area: f.area.trim() || null,
          source: f.source,
          need: f.need.trim() || null,
          project_type: f.projectType || null,
          notes: f.notes.trim() || null,
        });
      }}
    >
      <Field label="Tên người liên hệ / doanh nghiệp" required className="sm:col-span-2">
        <Input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} />
      </Field>
      <Field label="Số điện thoại">
        <Input value={f.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="Email" optional>
        <Input value={f.email} inputMode="email" onChange={(e) => set('email', e.target.value)} />
      </Field>
      <Field label="Nguồn" required>
        <select
          value={f.source}
          onChange={(e) => set('source', e.target.value)}
          className={SELECT_CLASS}
        >
          {[...new Set([f.source, ...CUSTOMER_SOURCES])].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Khu vực" optional>
        <Input value={f.area} onChange={(e) => set('area', e.target.value)} />
      </Field>
      <Field label="Loại công trình" optional className="sm:col-span-2">
        <select
          value={f.projectType}
          onChange={(e) => set('projectType', e.target.value)}
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
          value={f.need}
          onChange={(e) => set('need', e.target.value)}
          rows={3}
          className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
        />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu thông tin'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Chuyển đầu mối thành cơ hội: tạo hồ sơ khách hàng mới — hoặc dùng khách đã có cùng số điện
 * thoại (khách cũ quay lại) — và một cơ hội ở bước Tiếp nhận.
 */
function ConvertDialog({
  lead,
  onCancel,
  onDone,
}: {
  lead: LeadRecord;
  onCancel: () => void;
  onDone: (opportunityId: string) => void;
}) {
  const convert = useConvertLead();
  const duplicates = useContactDuplicates(lead.phone ?? '', lead.id);
  const existingCustomers = (duplicates.data ?? []).filter((d) => d.kind === 'customer');
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState(`Nhu cầu của ${lead.full_name}`);
  const [projectType, setProjectType] = useState(lead.project_type ?? '');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      const opportunityId = await convert.mutateAsync({
        leadId: lead.id,
        customerId: customerId || null,
        opportunityName: name.trim() || null,
        projectType: projectType || null,
        estimatedValue: value ? Number(value) : null,
      });
      onDone(opportunityId);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <ConfirmDialog
      title="Chuyển thành cơ hội"
      confirmLabel="Tạo cơ hội"
      pending={convert.isPending}
      focusConfirm={false}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <div className="space-y-3">
        <p className="text-fg-subtle">
          Tạo cơ hội ở bước Tiếp nhận; nhật ký chăm sóc đi theo hồ sơ khách hàng. Đầu mối chuyển
          sang chỉ xem.
        </p>
        <Field label="Khách hàng" group>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Tạo hồ sơ khách hàng mới từ đầu mối</option>
            {existingCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                Dùng khách đã có: {c.name} ({c.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tên cơ hội" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Loại công trình" optional>
          <select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
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
        <Field label="Giá trị dự kiến (đồng)" optional>
          <MoneyInput value={value} onChange={setValue} />
        </Field>
        {error && (
          <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
