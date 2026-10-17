/**
 * Tab «Văn bản» của Chi tiết Hợp đồng — điền mẫu Word từ hồ sơ (GĐ4, vấn đề 5 của chủ dự án).
 *
 * Ba khối, theo đúng thứ tự người soạn làm việc:
 *   1. Thông tin in lên văn bản mà hồ sơ chưa có (hình thức giá, thuế suất, địa điểm, thời gian).
 *   2. Chọn mẫu → điền và xem trước → lưu phiên bản và tải về. Ô chưa có dữ liệu được liệt kê
 *      TRƯỚC khi lưu và in dải chấm trên văn bản — không bịa số (CLAUDE.md 5.2).
 *   3. Các phiên bản đã lưu — bất biến; hợp đồng đã ký thì khoá, không lập thêm.
 *
 * Điền chạy trên trình duyệt (`lib/docx-template.ts`); chỉ tệp đã lưu mới lên kho.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, FileText, Lock } from 'lucide-react';
import {
  CONTRACT_PRICE_FORMS,
  CONTRACT_PRICE_FORM_LABELS,
  CONTRACT_TYPE_LABELS,
  buildTemplateData,
  formatDateTime,
  missingTemplateFields,
  toNvgDateInput,
  type ContractPriceForm,
  type TemplateValue,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { FIELD_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import {
  DOCUMENT_BUCKET,
  TEMPLATE_BUCKET,
  downloadFile,
  useCompanyContractInfo,
  useContractDocuments,
  usePartnerContractInfo,
  useSaveContractDocument,
  useTemplatesForContract,
  type ContractTemplateRecord,
} from '@/hooks/use-contract-templates';
import {
  useContractTerms,
  useUpdateContract,
  type ContractDetailRecord,
} from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';
import { fillTemplate, inspectTemplate, safeFileName, saveBlob } from '@/lib/docx-template';
import { cn } from '@/lib/utils';

/**
 * Bước còn lập văn bản được — khớp trigger `contract_documents_before_insert`: chỉ khi Nháp (0176).
 * Đang chờ duyệt mà đổi văn bản thì người duyệt duyệt một bản, ký một bản khác.
 */
const DRAFTABLE_STAGES = ['nhap'] as const;

export function DocumentPanel({
  contract,
  canDraft,
}: {
  contract: ContractDetailRecord;
  /** Người chịu trách nhiệm có quyền sửa HD — đúng điều kiện `rls_contract_writable`. */
  canDraft: boolean;
}) {
  const locked = !(DRAFTABLE_STAGES as readonly string[]).includes(contract.stage);
  return (
    <div className="space-y-4">
      <InfoSection contract={contract} editable={canDraft && contract.stage === 'nhap'} />
      {locked ? (
        <p className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2">
          <Lock className="size-4 text-fg-subtle" aria-hidden />
          {contract.stage === 'cho_duyet' || contract.stage === 'da_duyet'
            ? 'Hợp đồng đang chờ duyệt hoặc đã duyệt — văn bản giữ đúng bản đã gửi. Bị trả về thì lập bản mới.'
            : 'Hợp đồng đã ký — văn bản đã khoá, không lập thêm bản điền mới. Thay đổi sau ký đi qua tab Phát sinh.'}
        </p>
      ) : (
        <FillSection contract={contract} canSave={canDraft} />
      )}
      <VersionsSection
        contractId={contract.id}
        submittedId={contract.submitted_document_id}
        approvedId={contract.approved_document_id}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Thông tin in lên văn bản
// ---------------------------------------------------------------------------------------------

function InfoSection({
  contract,
  editable,
}: {
  contract: ContractDetailRecord;
  editable: boolean;
}) {
  const update = useUpdateContract();
  const [form, setForm] = useState({
    priceForm: contract.price_form ?? '',
    vatRate: contract.vat_rate ? String(Number(contract.vat_rate)) : '',
    location: contract.project_location ?? '',
    startDate: contract.start_date ?? '',
    endDate: contract.end_date ?? '',
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setMessage(null);
    const vat = form.vatRate.trim().replace(',', '.');
    if (vat && !(Number(vat) >= 0 && Number(vat) <= 100)) {
      setMessage({ ok: false, text: 'Thuế suất phải là số từ 0 đến 100.' });
      return;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setMessage({ ok: false, text: 'Ngày kết thúc phải sau ngày bắt đầu.' });
      return;
    }
    try {
      await update.mutateAsync({
        id: contract.id,
        changes: {
          price_form: (form.priceForm || null) as ContractPriceForm | null,
          vat_rate: vat || null,
          project_location: form.location.trim() || null,
          start_date: form.startDate || null,
          end_date: form.endDate || null,
        },
      });
      setMessage({ ok: true, text: 'Đã lưu thông tin.' });
    } catch (e) {
      setMessage({ ok: false, text: toUserMessage(e, 'edit') });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h3 className="font-medium">Thông tin in lên văn bản</h3>
      <p className="mt-1 text-sm text-fg-subtle">
        Giá trị, đối tác và điều khoản lấy từ hồ sơ. Các ô dưới đây hồ sơ chưa có.
        {!editable && ' Chỉ sửa được khi hợp đồng còn Nháp, bởi người chịu trách nhiệm.'}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Hình thức giá" hint="Luật Xây dựng 2025, Điều 82 khoản 2.">
          <select
            value={form.priceForm}
            disabled={!editable}
            onChange={(e) => setForm((f) => ({ ...f, priceForm: e.target.value }))}
            className={cn(FIELD_BOX, 'w-full')}
          >
            <option value="">Chưa chọn</option>
            {CONTRACT_PRICE_FORMS.map((p) => (
              <option key={p} value={p}>
                {CONTRACT_PRICE_FORM_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Thuế suất GTGT (%)"
          hint="Giá trị hợp đồng đã gồm thuế này. Để trống thì văn bản không tách thuế."
        >
          <Input
            value={form.vatRate}
            disabled={!editable}
            inputMode="decimal"
            onChange={(e) =>
              setForm((f) => ({ ...f, vatRate: e.target.value.replace(/[^\d.,]/g, '') }))
            }
          />
        </Field>
        <Field label="Địa điểm thực hiện">
          <Input
            value={form.location}
            disabled={!editable}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </Field>
        <Field label="Ngày bắt đầu">
          <DateInput
            value={form.startDate}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
          />
        </Field>
        <Field label="Ngày kết thúc">
          <DateInput
            value={form.endDate}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
          />
        </Field>
      </div>
      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={update.isPending} onClick={() => void save()}>
            Lưu thông tin
          </Button>
          {message && (
            <span
              role={message.ok ? 'status' : 'alert'}
              className={message.ok ? 'text-status-completed' : 'text-status-overdue'}
            >
              {message.text}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Điền mẫu
// ---------------------------------------------------------------------------------------------

interface Filled {
  templateId: string;
  blob: Blob;
  data: Record<string, TemplateValue>;
  missing: string[];
}

/** Mẫu khớp hình thức giá đứng trước, mẫu dùng chung (không ghi hình thức giá) sau. */
function rankTemplates(list: ContractTemplateRecord[], priceForm: ContractPriceForm | null) {
  return list
    .filter((t) => t.price_form === null || t.price_form === priceForm)
    .sort((a, b) => Number(b.price_form === priceForm) - Number(a.price_form === priceForm));
}

function FillSection({ contract, canSave }: { contract: ContractDetailRecord; canSave: boolean }) {
  const promptDialog = usePromptDialog();
  const templates = useTemplatesForContract(contract.company_id, contract.type);
  const company = useCompanyContractInfo(contract.company_id);
  const partner = usePartnerContractInfo(contract.customer_id ?? undefined);
  const { data: terms } = useContractTerms(contract.id);
  const { data: versions } = useContractDocuments(contract.id);
  const save = useSaveContractDocument();

  const candidates = rankTemplates(templates.data ?? [], contract.price_form);
  const [templateId, setTemplateId] = useState<string>('');
  const chosen = candidates.find((t) => t.id === templateId) ?? candidates[0] ?? null;

  const [filled, setFilled] = useState<Filled | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Hồ sơ đổi (thông tin, điều khoản) thì bản xem trước cũ không còn đúng.
  useEffect(() => {
    setFilled(null);
  }, [contract, terms, chosen?.id]);

  useEffect(() => {
    const el = previewRef.current;
    if (!filled || !el) return;
    let cancelled = false;
    el.replaceChildren();
    void import('docx-preview').then(({ renderAsync }) => {
      if (cancelled) return;
      void renderAsync(filled.blob, el, undefined, {
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
        breakPages: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filled]);

  if (templates.isLoading)
    return <div className="h-24 animate-pulse rounded-lg bg-surface-hover" />;

  if (candidates.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h3 className="font-medium">Lập văn bản từ mẫu</h3>
        <p className="mt-2">
          Chưa có mẫu «{CONTRACT_TYPE_LABELS[contract.type]}» đang dùng cho pháp nhân này.
        </p>
        <p className="mt-1 text-fg-subtle">
          Ban Giám đốc hoặc Quản trị hệ thống tải mẫu Word lên ở màn hình Mẫu hợp đồng.
        </p>
        <Link
          to="/hd/mau-hop-dong"
          className="mt-3 inline-block font-medium text-brand underline-offset-2 hover:underline"
        >
          Mở Mẫu hợp đồng
        </Link>
      </section>
    );
  }

  const ready = Boolean(company.data && terms && (!contract.customer_id || partner.data));

  async function fill() {
    if (!chosen || !company.data || !terms) return;
    setError(null);
    setSavedVersion(null);
    setBusy(true);
    try {
      const buffer = await (await downloadFile(TEMPLATE_BUCKET, chosen.storage_path)).arrayBuffer();
      const inspected = inspectTemplate(buffer);
      if (!inspected.ok) {
        setError(`Mẫu «${chosen.title}» có lỗi: ${inspected.errors.join(' ')}`);
        return;
      }
      const data = buildTemplateData({
        contract: {
          code: contract.code,
          contract_number: contract.contract_number,
          title: contract.title,
          type: contract.type,
          price_form: contract.price_form,
          value: contract.value,
          vat_rate: contract.vat_rate,
          signed_date: contract.signed_date,
          start_date: contract.start_date,
          end_date: contract.end_date,
          project_location: contract.project_location,
        },
        company: company.data,
        partner: partner.data ?? null,
        partner_name: contract.partner_name,
        terms,
        today: toNvgDateInput(new Date()),
      });
      setFilled({
        templateId: chosen.id,
        blob: fillTemplate(buffer, data),
        data,
        missing: missingTemplateFields(inspected.tags, data),
      });
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAndDownload() {
    if (!filled) return;
    setError(null);
    const next = (versions?.[0]?.version ?? 0) + 1;
    let reason: string | null = null;
    if (next > 1) {
      reason = await promptDialog.ask({
        title: `Lưu bản ${next}`,
        label: 'Nguyên nhân lập lại văn bản',
        confirmLabel: 'Lưu và tải về',
      });
      if (reason === null) return;
    }
    const fileName = safeFileName(`${contract.code} - ${contract.title} - bản ${next}.docx`);
    try {
      const version = await save.mutateAsync({
        contractId: contract.id,
        companyId: contract.company_id,
        templateId: filled.templateId,
        blob: filled.blob,
        fileName,
        filledValues: filled.data,
        missingFields: filled.missing,
        changeReason: reason,
      });
      setSavedVersion(version);
      saveBlob(filled.blob, fileName);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      {promptDialog.dialog}
      <h3 className="font-medium">Lập văn bản từ mẫu</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Mẫu" className="min-w-64 flex-1">
          <select
            value={chosen?.id ?? ''}
            onChange={(e) => setTemplateId(e.target.value)}
            className={cn(FIELD_BOX, 'w-full')}
          >
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.price_form ? ` — ${CONTRACT_PRICE_FORM_LABELS[t.price_form]}` : ''}
              </option>
            ))}
          </select>
        </Field>
        {/* Nút phụ: nút chính của màn hình là bước hợp đồng ở đầu trang (CGD 6.3). */}
        <Button variant="secondary" disabled={!ready || busy} onClick={() => void fill()}>
          {filled ? 'Điền lại' : 'Điền và xem trước'}
        </Button>
        {filled && canSave && (
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() => void saveAndDownload()}
          >
            <Download className="size-4" aria-hidden /> Lưu phiên bản và tải về
          </Button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}
      {savedVersion !== null && (
        <p role="status" className="mt-3 text-status-completed">
          Đã lưu bản {savedVersion} và tải về máy.
        </p>
      )}

      {filled && (
        <>
          {filled.missing.length > 0 ? (
            <div className="mt-3 rounded-md border border-status-pending bg-status-pending-bg px-3 py-2">
              <p className="flex items-center gap-2 font-medium text-status-pending">
                <AlertTriangle className="size-4" aria-hidden />
                {filled.missing.length} ô chưa có dữ liệu — văn bản in dải chấm để điền tay
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5 text-sm">
                {filled.missing.map((m) => (
                  <li key={m} className="rounded-sm bg-surface px-2 py-0.5">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-status-completed">Mọi chỗ trống của mẫu đã có dữ liệu.</p>
          )}
          <p className="mt-3 text-xs text-fg-subtle">
            Bản xem trước có thể lệch đôi chút so với Word (đầu / chân trang, hộp chữ). Tệp tải về
            giữ nguyên định dạng của mẫu.
          </p>
          <div
            ref={previewRef}
            aria-label="Xem trước văn bản hợp đồng"
            className="mt-2 max-h-[70vh] overflow-auto rounded-md border border-border"
          />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Phiên bản đã lưu
// ---------------------------------------------------------------------------------------------

function VersionsSection({
  contractId,
  submittedId,
  approvedId,
}: {
  contractId: string;
  submittedId: string | null;
  approvedId: string | null;
}) {
  const { data: versions } = useContractDocuments(contractId);
  const [error, setError] = useState<string | null>(null);

  async function download(path: string, name: string) {
    setError(null);
    try {
      saveBlob(await downloadFile(DOCUMENT_BUCKET, path), name);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h3 className="font-medium">Các phiên bản đã lưu</h3>
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
      {(versions ?? []).length === 0 ? (
        <p className="mt-2 text-fg-subtle">Chưa lưu văn bản nào cho hợp đồng này.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {versions!.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <FileText className="size-4 text-fg-subtle" aria-hidden />
              <span className="font-semibold">Bản {v.version}</span>
              {v.id === approvedId ? (
                <span className="rounded-full bg-status-completed-bg px-2 py-0.5 text-xs font-semibold text-status-completed">
                  Bản đã duyệt
                </span>
              ) : (
                v.id === submittedId && (
                  <span className="rounded-full bg-status-pending-bg px-2 py-0.5 text-xs font-semibold text-status-pending">
                    Bản gửi duyệt
                  </span>
                )
              )}
              <span className="text-fg-subtle">
                {formatDateTime(v.created_at)} · {v.creator?.full_name ?? 'Không rõ người lập'}
                {v.template ? ` · mẫu «${v.template.title}»` : ''}
              </span>
              {v.missing_fields.length > 0 && (
                <span className="text-status-pending">{v.missing_fields.length} ô điền tay</span>
              )}
              {v.change_reason && <span className="w-full text-sm">Lý do: {v.change_reason}</span>}
              <button
                type="button"
                onClick={() => void download(v.storage_path, v.file_name)}
                className="ml-auto inline-flex items-center gap-1 font-medium text-brand underline-offset-2 hover:underline"
              >
                <Download className="size-4" aria-hidden /> Tải về
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
