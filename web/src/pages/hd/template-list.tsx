/**
 * Mẫu hợp đồng Word (GĐ4, migration 0171) — mẫu Danh sách (AFD 4.2) kèm biểu mẫu tải lên.
 *
 * Mẫu theo pháp nhân × loại hợp đồng × (tuỳ) hình thức giá. Tải lên thì kiểm ngay trên trình
 * duyệt: cú pháp chỗ trống đúng chưa, có chỗ trống nào hệ thống không biết không — sai thì
 * không cho lưu, để lỗi lộ lúc soạn mẫu chứ không lộ lúc Kinh doanh đang cần văn bản.
 *
 * Ai tải lên: người có quyền phê duyệt HD (Ban Giám đốc) hoặc Quản trị — cùng hàm CSDL
 * `auth_can_manage_contract_templates`. Không xoá mẫu: thay bằng bản mới rồi «Ngừng dùng».
 */

import { useState } from 'react';
import { CheckCircle2, Download, FileText, Upload } from 'lucide-react';
import {
  CONTRACT_PRICE_FORMS,
  CONTRACT_PRICE_FORM_LABELS,
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  TEMPLATE_FIELDS,
  TEMPLATE_FIELD_GROUP_LABELS,
  TEMPLATE_LOOP_COLUMNS,
  formatDate,
  type ContractPriceForm,
  type ContractType,
  type TemplateFieldGroup,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FIELD_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  TEMPLATE_BUCKET,
  downloadFile,
  useContractTemplates,
  useSetTemplateActive,
  useTransactionalCompanies,
  useUpdateCompanyContractInfo,
  useUploadContractTemplate,
  type CompanyContractInfo,
} from '@/hooks/use-contract-templates';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth, useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import {
  buildSampleTemplate,
  inspectTemplate,
  saveBlob,
  type TemplateTags,
} from '@/lib/docx-template';
import { cn } from '@/lib/utils';
import { HdNav } from './hd-nav';

function useIsAdmin(): boolean {
  const { profile } = useAuth();
  return profile?.assignments?.some((a) => a.roleCode === 'ADMIN') ?? false;
}

export function ContractTemplatePage() {
  const isAdmin = useIsAdmin();
  const canManage = useCan('HD', 'approve') || isAdmin;
  const templates = useContractTemplates();
  const setActive = useSetTemplateActive();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(path: string, name: string) {
    setError(null);
    try {
      saveBlob(await downloadFile(TEMPLATE_BUCKET, path), name);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Mẫu hợp đồng"
        description="Tệp Word có chỗ trống — hệ thống điền từ hồ sơ hợp đồng, pháp nhân, đối tác và điều khoản."
        breadcrumbs={[{ label: 'Hợp đồng', to: '/hd/hop-dong' }, { label: 'Mẫu hợp đồng' }]}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => saveBlob(buildSampleTemplate(), 'Mau vi du hop dong.docx')}
            >
              <Download className="size-4" aria-hidden /> Tải mẫu ví dụ
            </Button>
            {canManage && !uploading && (
              <Button variant="primary" onClick={() => setUploading(true)}>
                <Upload className="size-4" aria-hidden /> Tải mẫu lên
              </Button>
            )}
          </>
        }
      />
      <HdNav />

      {uploading && <UploadForm onDone={() => setUploading(false)} />}

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}

      {templates.isLoading ? (
        <CardGridSkeleton count={2} />
      ) : templates.error ? (
        <ErrorState
          message={toUserMessage(templates.error)}
          onRetry={() => void templates.refetch()}
        />
      ) : (templates.data ?? []).length === 0 ? (
        <div className="rounded-card bg-surface">
          <EmptyState
            icon={<FileText className="size-6" />}
            message={
              canManage
                ? 'Chưa có mẫu hợp đồng nào cho pháp nhân này. Tải mẫu ví dụ để xem cách viết chỗ trống, rồi tải mẫu Word của NVG lên.'
                : 'Chưa có mẫu hợp đồng nào cho pháp nhân này. Ban Giám đốc hoặc Quản trị hệ thống tải mẫu lên.'
            }
            action={
              canManage && !uploading ? (
                <Button variant="primary" onClick={() => setUploading(true)}>
                  Tải mẫu lên
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-card bg-surface">
          {templates.data!.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <FileText className="size-5 text-fg-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                <p className="text-sm text-fg-subtle">
                  {t.company?.short_name ?? ''} · {CONTRACT_TYPE_LABELS[t.contract_type]} ·{' '}
                  {t.price_form ? CONTRACT_PRICE_FORM_LABELS[t.price_form] : 'Mọi hình thức giá'} ·{' '}
                  {Object.keys(t.tags).length} chỗ trống · tải lên {formatDate(t.created_at)}
                  {t.creator ? ` bởi ${t.creator.full_name}` : ''}
                </p>
                {t.notes && <p className="text-sm">{t.notes}</p>}
              </div>
              <span className={t.is_active ? 'text-status-completed' : 'text-fg-subtle'}>
                {t.is_active ? 'Đang dùng' : 'Ngừng dùng'}
              </span>
              <button
                type="button"
                className="font-medium text-brand underline-offset-2 hover:underline"
                onClick={() => void download(t.storage_path, t.file_name)}
              >
                Tải tệp
              </button>
              {canManage && (
                <button
                  type="button"
                  className="text-fg-subtle underline-offset-2 hover:underline"
                  disabled={setActive.isPending}
                  onClick={() =>
                    void setActive
                      .mutateAsync({ id: t.id, isActive: !t.is_active })
                      .catch((e: unknown) => setError(toUserMessage(e, 'edit')))
                  }
                >
                  {t.is_active ? 'Ngừng dùng' : 'Dùng lại'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <PlaceholderGuide />
      <CompanyInfoSection canEdit={isAdmin} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function UploadForm({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth();
  const scope = useCompanyScope();
  const companies = useTransactionalCompanies();
  const upload = useUploadContractTemplate();
  const allowed = (companies.data ?? []).filter((c) =>
    profile?.scopeCompanies.some((s) => s.companyId === c.id),
  );

  const [form, setForm] = useState({
    companyId: '',
    title: '',
    contractType: 'thi_cong' as ContractType,
    priceForm: '' as ContractPriceForm | '',
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<
    { ok: true; tags: TemplateTags } | { ok: false; problems: string[] } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const companyId =
    form.companyId || allowed.find((c) => c.id === scope.companyId)?.id || allowed[0]?.id || '';

  async function chooseFile(f: File | null) {
    setFile(f);
    setCheck(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.docx')) {
      setCheck({
        ok: false,
        problems: ['Chỉ nhận tệp Word .docx. Tệp .doc cũ: mở bằng Word rồi lưu lại dạng .docx.'],
      });
      return;
    }
    const result = inspectTemplate(await f.arrayBuffer());
    if (!result.ok) {
      setCheck({ ok: false, problems: result.errors });
    } else if (result.unknown.length > 0) {
      setCheck({
        ok: false,
        problems: [
          `Hệ thống không biết ${result.unknown.length} chỗ trống: ${result.unknown.map((u) => `{${u}}`).join(', ')}. Sửa tên theo bảng «Cách viết chỗ trống» bên dưới rồi chọn lại tệp.`,
        ],
      });
    } else if (Object.keys(result.tags).length === 0) {
      setCheck({
        ok: false,
        problems: ['Tệp chưa có chỗ trống nào dạng {ten_cho_trong} — không có gì để điền.'],
      });
    } else {
      setCheck({ ok: true, tags: result.tags });
      if (!form.title) setForm((s) => ({ ...s, title: f.name.replace(/\.docx$/i, '') }));
    }
  }

  async function submit() {
    setError(null);
    if (!file || !check?.ok) return;
    if (!form.title.trim()) {
      setError('Vui lòng nhập tên mẫu.');
      return;
    }
    try {
      await upload.mutateAsync({
        companyId,
        title: form.title.trim(),
        contractType: form.contractType,
        priceForm: form.priceForm || null,
        file,
        tags: check.tags,
        notes: form.notes.trim() || null,
      });
      onDone();
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <section className="mb-4 rounded-card bg-surface p-4">
      <h2 className="font-medium">Tải mẫu lên</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Tệp Word (.docx)" required className="sm:col-span-2 lg:col-span-3">
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </Field>
        <Field label="Pháp nhân" required>
          <select
            value={companyId}
            onChange={(e) => setForm((s) => ({ ...s, companyId: e.target.value }))}
            className={cn(FIELD_BOX, 'w-full')}
          >
            {allowed.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Loại hợp đồng" required>
          <select
            value={form.contractType}
            onChange={(e) =>
              setForm((s) => ({ ...s, contractType: e.target.value as ContractType }))
            }
            className={cn(FIELD_BOX, 'w-full')}
          >
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hình thức giá" hint="Để «Mọi hình thức giá» nếu mẫu dùng chung.">
          <select
            value={form.priceForm}
            onChange={(e) =>
              setForm((s) => ({ ...s, priceForm: e.target.value as ContractPriceForm | '' }))
            }
            className={cn(FIELD_BOX, 'w-full')}
          >
            <option value="">Mọi hình thức giá</option>
            {CONTRACT_PRICE_FORMS.map((p) => (
              <option key={p} value={p}>
                {CONTRACT_PRICE_FORM_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tên mẫu" required>
          <Input
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
          />
        </Field>
        <Field label="Ghi chú" optional className="sm:col-span-2">
          <Input
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          />
        </Field>
      </div>

      {check && !check.ok && (
        <div
          role="alert"
          className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          <p className="font-medium">Mẫu chưa dùng được:</p>
          <ul className="list-disc pl-6">
            {check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {check?.ok && (
        <p className="mt-3 flex items-center gap-2 text-status-completed">
          <CheckCircle2 className="size-4" aria-hidden />
          Mẫu hợp lệ — {Object.keys(check.tags).length} chỗ trống hệ thống điền được.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-status-overdue">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          disabled={!check?.ok || !companyId || upload.isPending}
          onClick={() => void submit()}
        >
          Lưu mẫu
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function PlaceholderGuide() {
  const groups = Object.keys(TEMPLATE_FIELD_GROUP_LABELS) as TemplateFieldGroup[];
  return (
    <details className="mt-6 rounded-card bg-surface p-4">
      <summary className="cursor-pointer font-medium">Cách viết chỗ trống</summary>
      <div className="mt-3 space-y-1 text-sm">
        <p>
          Gõ tên chỗ trống trong cặp ngoặc nhọn ngay trong Word, ví dụ <code>{'{ben_a_ten}'}</code>.
          Ô hồ sơ chưa có dữ liệu sẽ in dải chấm để điền tay.
        </p>
        <p>
          Bảng lặp: đặt <code>{'{#dot_thanh_toan}'}</code> ở ô đầu và{' '}
          <code>{'{/dot_thanh_toan}'}</code> ở ô cuối của MỘT hàng bảng — mỗi đợt thanh toán thành
          một hàng. Ô trong hàng:{' '}
          {TEMPLATE_LOOP_COLUMNS.map(([k, label], i) => (
            <span key={k}>
              {i > 0 && ', '}
              <code>{`{${k}}`}</code> ({label.toLowerCase()})
            </span>
          ))}
          .
        </p>
        <p>
          Bên A / bên B tự đổi theo loại hợp đồng: NVG nhận thầu / bán thì là bên B; NVG đi thuê
          (khoán, thầu phụ) thì là bên A.
        </p>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g}>
            <p className="font-medium">{TEMPLATE_FIELD_GROUP_LABELS[g]}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {TEMPLATE_FIELDS.filter((f) => f.group === g).map((f) => (
                <li key={f.key}>
                  <code>{f.kind === 'loop' ? `{#${f.key}}…{/${f.key}}` : `{${f.key}}`}</code>{' '}
                  <span className="text-fg-subtle">— {f.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------------------------

const COMPANY_FIELDS: { key: keyof CompanyContractInfo; label: string }[] = [
  { key: 'tax_code', label: 'Mã số thuế' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'email', label: 'Email' },
  { key: 'legal_representative', label: 'Người đại diện' },
  { key: 'representative_title', label: 'Chức vụ người đại diện' },
  { key: 'bank_account_number', label: 'Số tài khoản của pháp nhân' },
  { key: 'bank_name', label: 'Ngân hàng' },
];

function CompanyInfoSection({ canEdit }: { canEdit: boolean }) {
  const companies = useTransactionalCompanies();
  return (
    <section className="mt-6">
      <h2 className="font-medium">Thông tin pháp nhân in trên hợp đồng</h2>
      <p className="mt-1 text-sm text-fg-subtle">
        {canEdit
          ? 'Ô trống sẽ in dải chấm trên văn bản.'
          : 'Ô trống sẽ in dải chấm trên văn bản. Quản trị hệ thống cập nhật các ô này.'}
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        {(companies.data ?? []).map((c) => (
          <CompanyCard key={c.id} company={c} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function CompanyCard({ company, canEdit }: { company: CompanyContractInfo; canEdit: boolean }) {
  const update = useUpdateCompanyContractInfo();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() =>
    Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, (company[f.key] as string | null) ?? ''])),
  );
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        id: company.id,
        changes: Object.fromEntries(
          COMPANY_FIELDS.map((f) => [f.key, form[f.key]!.trim() || null]),
        ),
      });
      setEditing(false);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <article className="rounded-card bg-surface p-4">
      <p className="font-medium">{company.legal_name}</p>
      {editing ? (
        <div className="mt-2 space-y-2">
          {COMPANY_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
          {error && (
            <p role="alert" className="text-status-overdue">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="primary" disabled={update.isPending} onClick={() => void save()}>
              Lưu
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Hủy
            </Button>
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-2 space-y-1 text-sm">
            {COMPANY_FIELDS.map((f) => (
              <div key={f.key} className="flex gap-2">
                <dt className="w-40 shrink-0 text-fg-subtle">{f.label}</dt>
                <dd className={company[f.key] ? '' : 'text-fg-subtle'}>
                  {(company[f.key] as string | null) ?? 'Chưa có'}
                </dd>
              </div>
            ))}
          </dl>
          {canEdit && (
            <Button variant="secondary" className="mt-3" onClick={() => setEditing(true)}>
              Sửa thông tin
            </Button>
          )}
        </>
      )}
    </article>
  );
}
