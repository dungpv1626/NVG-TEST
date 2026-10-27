/**
 * Soạn phụ lục hợp đồng / biên bản thanh lý từ mẫu (0229, anh Dũng 27/10/2026: «soạn từ mẫu, tự điền»).
 *
 * Máy điền sẵn mọi thứ hệ thống biết: hai bên (pháp nhân NVG, khách hàng), số và ngày ký hợp đồng gốc, công trình, địa
 * điểm, số thứ tự phụ lục. Phần riêng của văn bản (khối lượng phát sinh, lý do, thời gian gia hạn, giá trị quyết toán…)
 * điền ở cột trái theo từng Điều — cùng bộ ô của tab Soạn hợp đồng. Bản xem trước LUÔN hiện, tự cập nhật.
 *
 * Mỗi lần lưu là một bản mới, bất biến; bản sau phải ghi lý do. Giá trị đã điền lưu kèm bản để mở lại soạn tiếp.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  buildAnnexData,
  formatDateTime,
  missingTemplateFields,
  toNvgDateInput,
  type TemplateValue,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import {
  useAnnexDocuments,
  useAnnexTemplates,
  useSaveAnnexDocument,
  type AnnexDocumentRecord,
  type AnnexKind,
} from '@/hooks/use-contract-annex';
import {
  DOCUMENT_BUCKET,
  TEMPLATE_BUCKET,
  downloadFile,
  useCompanyContractInfo,
  usePartnerContractInfo,
} from '@/hooks/use-contract-templates';
import { useContractTerms, type ContractDetailRecord } from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';
import { fillTemplate, inspectTemplate, safeFileName, saveBlob } from '@/lib/docx-template';
import { DocInputsSection, templateInputData, type DocumentInputs } from './document-inputs';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export const ANNEX_KIND_LABELS: Readonly<Record<AnnexKind, string>> = {
  phu_luc: 'phụ lục hợp đồng',
  thanh_ly: 'biên bản thanh lý',
};

interface SavedInputs {
  _inputs?: DocumentInputs;
  _annex?: { documentNumber: string; annexNumber: string; signedDate: string };
}

export function AnnexComposer({
  contract,
  kind,
  amendment,
  editable,
  onClose,
}: {
  contract: ContractDetailRecord;
  kind: AnnexKind;
  /** Phụ lục: phát sinh mà văn bản này thể hiện, và số thứ tự gợi ý của nó trong hợp đồng. */
  amendment?: { id: string; title: string; number: number };
  /** Lưu được bản mới (phụ lục còn Đề xuất / người được ghi thanh lý). Không thì chỉ xem và tải bản đã lưu. */
  editable: boolean;
  onClose: () => void;
}) {
  const templates = useAnnexTemplates(contract.company_id, kind);
  const documents = useAnnexDocuments(contract.id);
  const company = useCompanyContractInfo(contract.company_id);
  const partner = usePartnerContractInfo(contract.customer_id ?? undefined);
  const { data: terms } = useContractTerms(contract.id);
  const save = useSaveAnnexDocument();
  const promptDialog = usePromptDialog();

  const versions = useMemo(
    () =>
      (documents.data ?? []).filter(
        (d) => d.kind === kind && (d.amendment_id ?? null) === (amendment?.id ?? null),
      ),
    [documents.data, kind, amendment?.id],
  );
  const latest = versions[0] ?? null;

  const [templateId, setTemplateId] = useState<string>('');
  const [values, setValues] = useState<DocumentInputs>({});
  const [documentNumber, setDocumentNumber] = useState('');
  const [annexNumber, setAnnexNumber] = useState(amendment ? String(amendment.number) : '');
  const [signedDate, setSignedDate] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const restored = useRef(false);

  // Mở lại: chọn đúng mẫu và giá trị của bản mới nhất; chưa có bản nào thì mẫu đầu tiên.
  useEffect(() => {
    if (restored.current || !templates.data || documents.isLoading) return;
    restored.current = true;
    const saved = (latest?.filled_values ?? {}) as SavedInputs;
    const fromLatest =
      latest?.template_id && templates.data.some((t) => t.id === latest.template_id);
    setTemplateId(fromLatest ? latest!.template_id! : (templates.data[0]?.id ?? ''));
    if (saved._inputs) setValues(saved._inputs);
    if (saved._annex) {
      setDocumentNumber(saved._annex.documentNumber);
      if (saved._annex.annexNumber) setAnnexNumber(saved._annex.annexNumber);
      setSignedDate(saved._annex.signedDate);
    }
  }, [templates.data, documents.isLoading, latest]);

  const template = templates.data?.find((t) => t.id === templateId) ?? null;
  const ready = Boolean(
    template && company.data && terms && (!contract.customer_id || partner.data),
  );

  const [filled, setFilled] = useState<{
    blob: Blob;
    data: Record<string, TemplateValue>;
    missing: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !template) return;
    const tpl = template;
    let cancelled = false;
    async function refill() {
      setBusy(true);
      try {
        const buffer = await (await downloadFile(TEMPLATE_BUCKET, tpl.storage_path)).arrayBuffer();
        const inspected = inspectTemplate(buffer);
        if (!inspected.ok)
          throw new Error(`Mẫu «${tpl.title}» có lỗi: ${inspected.errors.join(' ')}`);
        const data = buildAnnexData(
          {
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
            company: company.data!,
            partner: partner.data ?? null,
            partner_name: contract.partner_name,
            terms: terms!,
            today: toNvgDateInput(new Date()),
          },
          {
            documentNumber: documentNumber || null,
            annexNumber: kind === 'phu_luc' ? annexNumber || null : null,
            signedDate: signedDate || null,
          },
        );
        Object.assign(data, templateInputData(tpl, values).data);
        if (cancelled) return;
        setFilled({
          blob: fillTemplate(buffer, data),
          data,
          missing: missingTemplateFields(inspected.tags, data),
        });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(toUserMessage(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    const t = setTimeout(() => void refill(), 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    ready,
    template,
    values,
    documentNumber,
    annexNumber,
    signedDate,
    contract,
    company.data,
    partner.data,
    terms,
    kind,
  ]);

  useEffect(() => {
    const el = previewRef.current;
    if (!filled || !el) return;
    let cancelled = false;
    el.replaceChildren();
    void import('docx-preview').then(({ renderAsync }) => {
      if (!cancelled)
        void renderAsync(filled.blob, el, undefined, { inWrapper: true, breakPages: true });
    });
    return () => {
      cancelled = true;
    };
  }, [filled]);

  function setValue(key: string, value: string) {
    setDirty(true);
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function saveVersion() {
    if (!filled || !template) return;
    setError(null);
    setMessage(null);
    const next = (latest?.version ?? 0) + 1;
    let reason: string | null = null;
    if (next > 1) {
      reason = await promptDialog.ask({
        title: `Lưu bản ${next}`,
        label: 'Nguyên nhân lập lại văn bản',
        confirmLabel: 'Lưu và tải về',
      });
      if (reason === null) return;
    }
    const what = kind === 'phu_luc' ? `Phụ lục ${annexNumber || ''}`.trim() : 'Biên bản thanh lý';
    const fileName = safeFileName(`${contract.code} - ${what} - bản ${next}.docx`);
    try {
      const version = await save.mutateAsync({
        contractId: contract.id,
        companyId: contract.company_id,
        kind,
        amendmentId: amendment?.id ?? null,
        templateId: template.id,
        blob: filled.blob,
        fileName,
        filledValues: {
          ...filled.data,
          _inputs: values,
          _annex: { documentNumber, annexNumber, signedDate },
        },
        missingFields: filled.missing,
        changeReason: reason,
      });
      saveBlob(filled.blob, fileName);
      setDirty(false);
      setMessage(`Đã lưu bản ${version} và tải về.`);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function downloadSaved(d: AnnexDocumentRecord) {
    try {
      saveBlob(await downloadFile(DOCUMENT_BUCKET, d.storage_path), d.file_name);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  // Không bao giờ mất dữ liệu đang nhập (CLAUDE.md 5.4): còn ô chưa lưu thì hỏi lại trước khi đóng.
  const [askClose, setAskClose] = useState(false);
  function close() {
    if (dirty) setAskClose(true);
    else onClose();
  }

  const label = ANNEX_KIND_LABELS[kind];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Soạn ${label}`}
      className="fixed inset-0 z-40 flex flex-col bg-canvas"
    >
      {promptDialog.dialog}
      {askClose && (
        <ConfirmDialog
          title="Đóng khi chưa lưu?"
          confirmLabel="Đóng không lưu"
          cancelLabel="Ở lại soạn tiếp"
          onCancel={() => setAskClose(false)}
          onConfirm={onClose}
        >
          <p>Các ô vừa điền chưa được lưu thành bản nào — đóng thì mất.</p>
        </ConfirmDialog>
      )}
      <header className="flex shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            Soạn {label}
            {amendment ? ` — ${amendment.title}` : ''}
          </h2>
          <p className="truncate text-sm text-fg-subtle">
            {contract.code} · {contract.title}
          </p>
        </div>
        {editable && (
          <Button
            variant="primary"
            disabled={!filled || busy || save.isPending}
            onClick={() => void saveVersion()}
          >
            {save.isPending ? 'Đang lưu…' : `Lưu bản ${(latest?.version ?? 0) + 1} và tải về`}
          </Button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Đóng"
          className="grid size-10 place-items-center rounded-full text-fg-subtle hover:bg-surface-hover"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)] lg:overflow-hidden">
        <div className="min-h-0 space-y-4 lg:overflow-y-auto lg:pr-2">
          {error && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed"
            >
              {message}
            </p>
          )}

          {templates.data && templates.data.length === 0 ? (
            <p className="rounded-card bg-surface p-4">
              Pháp nhân này chưa có mẫu {label}. Ban Giám đốc hoặc Quản trị tải mẫu ở màn hình Mẫu
              hợp đồng.
            </p>
          ) : (
            <section className="space-y-3 rounded-card bg-surface p-4">
              <h3 className="font-semibold">Thông tin văn bản</h3>
              <Field label="Mẫu">
                <select
                  className={SELECT_CLASS}
                  value={templateId}
                  disabled={!editable}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setDirty(true);
                  }}
                >
                  {(templates.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </Field>
              {kind === 'phu_luc' && (
                <Field
                  label="Số thứ tự phụ lục"
                  hint="Máy gợi ý theo thứ tự phát sinh của hợp đồng."
                >
                  <Input
                    value={annexNumber}
                    disabled={!editable}
                    onChange={(e) => {
                      setAnnexNumber(e.target.value);
                      setDirty(true);
                    }}
                  />
                </Field>
              )}
              <Field
                label="Số văn bản"
                hint="Số vào sổ văn bản, vd 05/PL-NVC — chưa cấp thì để trống, in dải chấm."
              >
                <Input
                  value={documentNumber}
                  disabled={!editable}
                  onChange={(e) => {
                    setDocumentNumber(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field
                label="Ngày ký văn bản"
                hint="Chưa biết thì để trống — văn bản in dải chấm để điền lúc ký."
              >
                <DateInput
                  value={signedDate}
                  disabled={!editable}
                  onChange={(v) => {
                    setSignedDate(v);
                    setDirty(true);
                  }}
                />
              </Field>
              {filled && filled.missing.length > 0 && (
                <p className="text-sm text-fg-subtle">
                  Hồ sơ còn thiếu, văn bản in dải chấm: {filled.missing.join(', ')}.
                </p>
              )}
            </section>
          )}

          {template && (
            <DocInputsSection
              template={template}
              values={values}
              setValue={setValue}
              setMany={(patch) => {
                setDirty(true);
                setValues((v) => ({ ...v, ...patch }));
              }}
              status="idle"
              editable={editable}
            />
          )}

          {versions.length > 0 && (
            <section className="rounded-card bg-surface p-4">
              <h3 className="font-semibold">Các bản đã lưu</h3>
              <ul className="mt-2 space-y-2">
                {versions.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">Bản {d.version}</span>
                    <span className="text-fg-subtle">
                      {d.creator?.full_name ?? 'Hệ thống'} · {formatDateTime(d.created_at)}
                      {d.change_reason ? ` · ${d.change_reason}` : ''}
                    </span>
                    <button
                      type="button"
                      className="ml-auto font-medium text-brand hover:underline"
                      onClick={() => void downloadSaved(d)}
                    >
                      Tải về
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section
          aria-label="Bản xem trước"
          className="min-h-[60vh] overflow-auto rounded-card bg-surface-hover p-2 lg:min-h-0"
        >
          {!filled && (
            <p className="p-4 text-fg-subtle">
              {busy ? 'Đang điền mẫu…' : 'Chọn mẫu để xem trước.'}
            </p>
          )}
          <div ref={previewRef} />
        </section>
      </div>
    </div>
  );
}
