/**
 * Soạn hồ sơ dự thầu / biên bản thương thảo từ mẫu NVG (0236 — phần còn lại của câu 19).
 *
 * Máy điền sẵn mọi thứ hệ thống biết: pháp nhân (tên, mã số thuế, địa chỉ, người đại diện, chức vụ), gói thầu (tên,
 * dự án, bên mời thầu), giá dự thầu của bản dự toán ĐÃ PHÊ DUYỆT kèm bằng chữ, và các dòng bảng kê lấy từ hồ sơ có
 * thật (hợp đồng đã ký, người có chứng chỉ hành nghề, giấy tờ thiết bị) — người lập chọn dòng nào đưa vào. Phần còn
 * lại (giảm giá, thuế suất, thời gian thực hiện, hiệu lực hồ sơ, các chỗ trống riêng) điền ở cột trái, lưu dần theo
 * gói thầu. Phần kỹ thuật (biện pháp thi công…) KHÔNG soạn ở đây — danh mục kiểm tra ghi là việc của người viết.
 *
 * Bản xem trước LUÔN hiện (anh Dũng dặn), ô còn thiếu tô vàng. Người chỉ xem thấy bản đã lưu mới nhất (hoặc bản đang
 * điền khi chưa có bản nào). Mỗi lần lưu là một bản mới, bất biến; bản sau phải ghi lý do. Máy không ký, không nộp.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  BID_FORM_KIND_LABELS,
  BID_FORM_LOOPS,
  BID_FORM_SOURCE_LABELS,
  TEMPLATE_BLANK,
  bidPriceSummary,
  buildBidFormData,
  defaultBidFormTables,
  equipmentRow,
  experienceRow,
  formatCurrency,
  formatDate,
  formatDateTime,
  missingBidFormFields,
  personnelPatch,
  priceTableMismatch,
  type BidFormInputs,
  type BidFormKind,
  type BidFormMissing,
  type TemplateValue,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { SplitWorkspace, type WorkspaceTab } from '@/components/ui/split-workspace';
import {
  BID_DOCUMENT_BUCKET,
  useApprovedBidPrice,
  useBidEquipment,
  useBidExperience,
  useBidFormDocuments,
  useBidFormInputs,
  useBidFormTemplates,
  useBidPersonnel,
  useSaveBidFormDocument,
  useSaveBidFormInputs,
  type BidFormDocumentRecord,
} from '@/hooks/use-bid-forms';
import type { BiddingProjectDetailRecord } from '@/hooks/use-bidding-projects';
import {
  TEMPLATE_BUCKET,
  downloadFile,
  useCompanyContractInfo,
} from '@/hooks/use-contract-templates';
import { toUserMessage } from '@/hooks/use-error-message';
import { fillTemplate, inspectTemplate, safeFileName, saveBlob } from '@/lib/docx-template';
import { cn } from '@/lib/utils';
import { DocInputsSection, freeFieldStatus, templateInputData } from '../hd/document-inputs';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';
const CELL_INPUT =
  'h-9 w-full min-w-0 rounded-field border border-border-strong bg-surface px-2 text-sm disabled:bg-surface-sunken';

/** Bước của gói thầu mà hồ sơ dự thầu còn lập được — gương `rls_bid_form_writable` (0236). */
export function bidFormEditable(
  kind: BidFormKind,
  project: Pick<BiddingProjectDetailRecord, 'stage' | 'submitted_at'>,
  canEdit: boolean,
): boolean {
  if (!canEdit) return false;
  if (kind === 'thuong_thao') return project.stage === 'trung_thau';
  return (
    project.submitted_at === null &&
    !['nop_thau', 'trung_thau', 'truot_thau'].includes(project.stage)
  );
}

/** Tô vàng mọi dải chấm trong bản xem trước — chỗ còn phải điền (tay hoặc ở cột trái). */
function highlightBlanks(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.includes(TEMPLATE_BLANK)) hits.push(n as Text);
  }
  for (const node of hits) {
    const parts = node.data.split(TEMPLATE_BLANK);
    const frag = document.createDocumentFragment();
    parts.forEach((part, i) => {
      if (part) frag.append(part);
      if (i < parts.length - 1) {
        const mark = document.createElement('mark');
        mark.textContent = TEMPLATE_BLANK;
        mark.className = 'bg-status-pending-bg text-fg';
        frag.append(mark);
      }
    });
    node.replaceWith(frag);
  }
}

interface SavedValues {
  _inputs?: BidFormInputs;
  /** Giá sau giảm (đồng, chữ số) của hồ sơ dự thầu đã lưu — Mẫu 11 ghi «Theo HSDT». */
  _price_after?: string | null;
}

export function BidFormComposer({
  project,
  kind,
  editable,
  onClose,
}: {
  project: BiddingProjectDetailRecord;
  kind: BidFormKind;
  editable: boolean;
  onClose: () => void;
}) {
  const templates = useBidFormTemplates(project.company_id, kind);
  const documents = useBidFormDocuments(project.id);
  const draft = useBidFormInputs(project.id, kind);
  const company = useCompanyContractInfo(project.company_id);
  const price = useApprovedBidPrice(project.id);
  const bidKind = kind === 'ho_so_du_thau';
  const experience = useBidExperience(project.company_id, bidKind && editable);
  const personnel = useBidPersonnel(project.company_id, bidKind && editable);
  const equipment = useBidEquipment(project.company_id, bidKind && editable);
  const saveDraft = useSaveBidFormInputs();
  const save = useSaveBidFormDocument();
  const promptDialog = usePromptDialog();

  const versions = useMemo(
    () => (documents.data ?? []).filter((d) => d.kind === kind),
    [documents.data, kind],
  );
  const latest = versions[0] ?? null;
  // Mẫu 11: giá của hồ sơ dự thầu đã lưu mới nhất (đã trừ giảm giá nếu có).
  const priceInBid = useMemo(() => {
    const bid = (documents.data ?? []).find((d) => d.kind === 'ho_so_du_thau');
    return ((bid?.filled_values ?? {}) as SavedValues)._price_after ?? null;
  }, [documents.data]);

  const [templateId, setTemplateId] = useState('');
  const [inputs, setInputs] = useState<BidFormInputs>({});
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = useRef(false);
  const restored = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Mở lại: nháp đang điền → giá trị của bản mới nhất → dòng gợi ý của mẫu.
  useEffect(() => {
    if (restored.current || !templates.data || documents.isLoading || draft.isLoading) return;
    restored.current = true;
    const fromLatest = ((latest?.filled_values ?? {}) as SavedValues)._inputs;
    const start = draft.data ?? fromLatest ?? {};
    setInputs({ ...start, tables: start.tables ?? defaultBidFormTables() });
    const keep = latest?.template_id && templates.data.some((t) => t.id === latest.template_id);
    setTemplateId(keep ? latest!.template_id! : (templates.data[0]?.id ?? ''));
  }, [templates.data, documents.isLoading, draft.isLoading, draft.data, latest]);

  // Lưu dần (0,8 giây sau lần gõ cuối) — tải lại trang không mất ô đã điền (CLAUDE.md 5.4).
  useEffect(() => {
    if (!dirty.current || !editable) return;
    setDraftStatus('saving');
    const t = setTimeout(() => {
      saveDraft.mutate(
        { projectId: project.id, companyId: project.company_id, kind, values: inputs },
        {
          onSuccess: () => setDraftStatus('saved'),
          onError: () => setDraftStatus('error'),
        },
      );
    }, 800);
    return () => clearTimeout(t);
    // `saveDraft` đổi danh tính mỗi lần render — chỉ lưu khi giá trị đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, editable, project.id, project.company_id, kind]);

  function patch(p: Partial<BidFormInputs>) {
    dirty.current = true;
    setInputs((v) => ({ ...v, ...p }));
  }
  function setTable(name: string, rows: Record<string, string>[]) {
    dirty.current = true;
    setInputs((v) => ({ ...v, tables: { ...(v.tables ?? {}), [name]: rows } }));
  }
  function setFree(patchFree: Record<string, string>) {
    dirty.current = true;
    setInputs((v) => ({ ...v, free: { ...(v.free ?? {}), ...patchFree } }));
  }

  const template = templates.data?.find((t) => t.id === templateId) ?? null;
  const approvedPrice = price.data?.bid_price ?? null;
  const source = useMemo(
    () => ({
      company: {
        legal_name: company.data?.legal_name ?? null,
        tax_code: company.data?.tax_code ?? null,
        address: company.data?.address ?? null,
        legal_representative: company.data?.legal_representative ?? null,
        representative_title: company.data?.representative_title ?? null,
      },
      bid: {
        name: project.name,
        project_name: project.opportunity?.name ?? null,
        inviter: project.customer?.name ?? null,
      },
      approvedBidPrice: approvedPrice,
      priceInBid,
    }),
    [company.data, project, approvedPrice, priceInBid],
  );
  const summary = bidPriceSummary(approvedPrice, inputs);
  const mismatch = bidKind ? priceTableMismatch(approvedPrice, inputs) : null;

  // Người chỉ xem: bản đã lưu mới nhất là bản xem trước (có thì không cần điền lại mẫu).
  const showSaved = !editable && latest !== null;
  const ready = Boolean(template && company.data && !price.isLoading && restored.current);
  const [filled, setFilled] = useState<{
    blob: Blob;
    data: Record<string, unknown>;
    missing: BidFormMissing[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (showSaved && latest) {
      void downloadFile(BID_DOCUMENT_BUCKET, latest.storage_path)
        .then((blob) => {
          if (!cancelled) setFilled({ blob, data: latest.filled_values, missing: [] });
        })
        .catch((e) => !cancelled && setError(toUserMessage(e)));
      return () => {
        cancelled = true;
      };
    }
    if (!ready || !template) return;
    const tpl = template;
    async function refill() {
      setBusy(true);
      try {
        const buffer = await (await downloadFile(TEMPLATE_BUCKET, tpl.storage_path)).arrayBuffer();
        const inspected = inspectTemplate(buffer);
        if (!inspected.ok)
          throw new Error(`Mẫu «${tpl.title}» có lỗi: ${inspected.errors.join(' ')}`);
        const data = buildBidFormData(source, inputs);
        Object.assign(data, templateInputData(tpl, inputs.free ?? {}).data);
        if (cancelled) return;
        setFilled({
          blob: fillTemplate(buffer, data as unknown as Record<string, TemplateValue>),
          data,
          missing: missingBidFormFields(inspected.tags, data),
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
  }, [showSaved, latest, ready, template, inputs, source]);

  useEffect(() => {
    const el = previewRef.current;
    if (!filled || !el) return;
    let cancelled = false;
    el.replaceChildren();
    void import('docx-preview').then(async ({ renderAsync }) => {
      if (cancelled) return;
      await renderAsync(filled.blob, el, undefined, { inWrapper: true, breakPages: true });
      if (!cancelled) highlightBlanks(el);
    });
    return () => {
      cancelled = true;
    };
  }, [filled]);

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
    const fileName = safeFileName(
      `${project.code} - ${BID_FORM_KIND_LABELS[kind]} - bản ${next}.docx`,
    );
    try {
      const version = await save.mutateAsync({
        projectId: project.id,
        companyId: project.company_id,
        kind,
        templateId: template.id,
        blob: filled.blob,
        fileName,
        filledValues: {
          ...filled.data,
          _inputs: inputs,
          _price_after: (summary.afterDiscount ?? summary.price)?.toString() ?? null,
        },
        missingFields: filled.missing.map((m) => m.label),
        changeReason: reason,
      });
      saveBlob(filled.blob, fileName);
      setMessage(`Đã lưu bản ${version} và tải về.`);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function downloadSaved(d: BidFormDocumentRecord) {
    try {
      saveBlob(await downloadFile(BID_DOCUMENT_BUCKET, d.storage_path), d.file_name);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  // Ô đã lưu dần vào gói thầu; chỉ hỏi khi lần lưu cuối chưa xong.
  const [askClose, setAskClose] = useState(false);
  function close() {
    if (editable && (draftStatus === 'saving' || draftStatus === 'error')) setAskClose(true);
    else onClose();
  }

  const label = BID_FORM_KIND_LABELS[kind];
  const free = inputs.free ?? {};
  const freeStatus = freeFieldStatus(template, free);

  const infoTab = (
    <div className="space-y-4 p-1">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
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
      {showSaved && latest && (
        <p className="rounded-card bg-surface p-4 text-sm">
          Đang xem bản {latest.version} đã lưu ({formatDateTime(latest.created_at)}
          {latest.creator ? ` — ${latest.creator.full_name}` : ''}).
        </p>
      )}
      {templates.data && templates.data.length === 0 ? (
        <p className="rounded-card bg-surface p-4">
          Pháp nhân này chưa có mẫu {label.toLowerCase()}. Ban Giám đốc hoặc Quản trị tải mẫu ở màn
          hình Mẫu hợp đồng.
        </p>
      ) : (
        !showSaved && (
          <>
            <section className="space-y-3 rounded-card bg-surface p-4">
              <h3 className="font-semibold">Gói thầu</h3>
              {(templates.data?.length ?? 0) > 1 && (
                <Field label="Mẫu">
                  <select
                    className={SELECT_CLASS}
                    value={templateId}
                    disabled={!editable}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {(templates.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <TextField
                label="Tên gói thầu"
                value={inputs.ten_goi_thau}
                placeholder={project.name}
                hint="Để trống thì in đúng tên gói thầu trên hệ thống."
                editable={editable}
                onChange={(v) => patch({ ten_goi_thau: v })}
              />
              <TextField
                label="Dự án"
                value={inputs.ten_du_an}
                placeholder={project.opportunity?.name ?? ''}
                hint={
                  project.opportunity
                    ? 'Để trống thì in tên cơ hội kinh doanh gắn gói thầu.'
                    : 'Gói thầu chưa gắn cơ hội — ghi tên dự án theo hồ sơ mời thầu.'
                }
                editable={editable}
                onChange={(v) => patch({ ten_du_an: v })}
              />
              <TextField
                label="Bên mời thầu"
                value={inputs.ben_moi_thau}
                placeholder={project.customer?.name ?? ''}
                hint={
                  project.customer
                    ? 'Để trống thì in chủ đầu tư của gói thầu.'
                    : 'Gói thầu chưa có chủ đầu tư — ghi tên bên mời thầu.'
                }
                editable={editable}
                onChange={(v) => patch({ ben_moi_thau: v })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Nơi lập"
                  value={inputs.noi_lap}
                  placeholder="Hưng Yên"
                  editable={editable}
                  onChange={(v) => patch({ noi_lap: v })}
                />
                <Field label="Ngày lập" hint="Chưa biết thì để trống — in dải chấm.">
                  <DateInput
                    value={inputs.ngay_lap ?? ''}
                    disabled={!editable}
                    onChange={(v) => patch({ ngay_lap: v })}
                  />
                </Field>
              </div>
              {bidKind && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Thời gian thực hiện (ngày)"
                    value={inputs.thoi_gian_thuc_hien}
                    inputMode="numeric"
                    hint="Theo hồ sơ mời thầu và tiến độ đề xuất."
                    editable={editable}
                    onChange={(v) => patch({ thoi_gian_thuc_hien: v })}
                  />
                  <TextField
                    label="Hiệu lực hồ sơ dự thầu (ngày)"
                    value={inputs.hieu_luc_hsdt}
                    inputMode="numeric"
                    hint="Kể từ ngày đóng thầu, theo hồ sơ mời thầu."
                    editable={editable}
                    onChange={(v) => patch({ hieu_luc_hsdt: v })}
                  />
                </div>
              )}
            </section>

            {bidKind && (
              <section className="space-y-3 rounded-card bg-surface p-4">
                <h3 className="font-semibold">Giá dự thầu</h3>
                {approvedPrice !== null ? (
                  <p className="text-sm">
                    Theo bản dự toán đã phê duyệt {price.data?.code} (bản {price.data?.version}):{' '}
                    <span className="font-semibold">{formatCurrency(approvedPrice)}</span>. Muốn đổi
                    giá thì lập bản dự toán mới và trình duyệt lại ở tab Dự toán.
                  </p>
                ) : (
                  <p className="rounded-sm bg-status-pending-bg px-3 py-2 text-sm">
                    Chưa có giá dự thầu đã phê duyệt — các ô giá in dải chấm. Trình duyệt bản dự
                    toán ở tab Dự toán.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Giá đã gồm thuế GTGT?">
                    <select
                      className={SELECT_CLASS}
                      value={inputs.vat_mode ?? ''}
                      disabled={!editable}
                      onChange={(e) =>
                        patch({ vat_mode: e.target.value as BidFormInputs['vat_mode'] })
                      }
                    >
                      <option value="">Chưa chọn — in dải chấm</option>
                      <option value="gom">Đã bao gồm thuế GTGT</option>
                      <option value="chua">Chưa bao gồm thuế GTGT</option>
                    </select>
                  </Field>
                  {inputs.vat_mode === 'gom' && (
                    <TextField
                      label="Thuế suất GTGT (%)"
                      value={inputs.vat_rate}
                      inputMode="decimal"
                      hint="Để tách giá trước thuế và tiền thuế ở Mẫu 10."
                      editable={editable}
                      onChange={(v) => patch({ vat_rate: v })}
                    />
                  )}
                  <Field label="Giảm giá">
                    <select
                      className={SELECT_CLASS}
                      value={inputs.giam_mode ?? ''}
                      disabled={!editable}
                      onChange={(e) =>
                        patch({ giam_mode: e.target.value as BidFormInputs['giam_mode'] })
                      }
                    >
                      <option value="">Chưa chọn — in dải chấm</option>
                      <option value="khong">Không giảm giá</option>
                      <option value="ty_le">Giảm theo tỷ lệ % (phương án A)</option>
                      <option value="so_tien">Giảm một số tiền (phương án B)</option>
                    </select>
                  </Field>
                  {(inputs.giam_mode === 'ty_le' || inputs.giam_mode === 'so_tien') && (
                    <TextField
                      label={
                        inputs.giam_mode === 'ty_le' ? 'Tỷ lệ giảm (%)' : 'Số tiền giảm (đồng)'
                      }
                      value={inputs.giam_gia}
                      inputMode={inputs.giam_mode === 'ty_le' ? 'decimal' : 'numeric'}
                      editable={editable}
                      onChange={(v) => patch({ giam_gia: v })}
                    />
                  )}
                </div>
                {summary.afterDiscount !== null &&
                  summary.discount !== null &&
                  summary.discount > 0n && (
                    <p className="text-sm">
                      Giảm {formatCurrency(summary.discount)} — giá sau giảm{' '}
                      <span className="font-semibold">{formatCurrency(summary.afterDiscount)}</span>
                      .
                    </p>
                  )}
                {summary.beforeVat !== null && summary.vat !== null && (
                  <p className="text-sm">
                    Trước thuế {formatCurrency(summary.beforeVat)}, tiền thuế{' '}
                    {formatCurrency(summary.vat)}.
                  </p>
                )}
                {summary.problems
                  .filter((p) => approvedPrice !== null || !p.startsWith('Chưa có giá'))
                  .map((p) => (
                    <p key={p} className="text-sm text-status-overdue">
                      {p}
                    </p>
                  ))}
                {mismatch && <p className="text-sm text-status-overdue">{mismatch}</p>}
              </section>
            )}

            {filled && (filled.missing.length > 0 || freeStatus.missing > 0) && (
              <section className="space-y-2 rounded-card bg-surface p-4">
                <h3 className="font-semibold">Còn thiếu — văn bản in dải chấm</h3>
                <MissingList missing={filled.missing} />
                {freeStatus.missing > 0 && (
                  <p className="text-sm text-fg-subtle">
                    {freeStatus.missing} chỗ trống riêng của mẫu chưa điền (tab Nội dung riêng) —
                    chỗ nào để trống thì điền tay trên bản in.
                  </p>
                )}
              </section>
            )}
          </>
        )
      )}
    </div>
  );

  const tablesTab = bidKind && !showSaved && (
    <div className="space-y-4 p-1">
      <LoopEditor
        name="hop_dong_tuong_tu"
        rows={inputs.tables?.hop_dong_tuong_tu ?? []}
        editable={editable}
        onChange={(r) => setTable('hop_dong_tuong_tu', r)}
        picker={
          editable && (
            <Picker
              label="Thêm từ hợp đồng đã ký"
              empty="Pháp nhân chưa có hợp đồng thi công / thiết kế đã ký trên hệ thống."
              options={(experience.data ?? []).map((c) => ({
                id: c.contract_id,
                text: `${c.code} — ${c.title}${c.value != null ? ` · ${formatCurrency(c.value)}` : ''}${
                  c.end_date ? ` · hoàn thành ${formatDate(c.end_date)}` : ''
                }`,
              }))}
              onPick={(id) => {
                const c = experience.data!.find((x) => x.contract_id === id)!;
                const rows = (inputs.tables?.hop_dong_tuong_tu ?? []).filter((r) =>
                  Object.keys(r).some((k) => k !== 'tai_lieu' && r[k]),
                );
                setTable('hop_dong_tuong_tu', [...rows, experienceRow(c)]);
              }}
            />
          )
        }
        note="«Phần NVC thực hiện» do người lập ghi. Hợp đồng ngoài hệ thống thì thêm dòng và gõ tay."
      />
      <LoopEditor
        name="nhan_su"
        rows={inputs.tables?.nhan_su ?? []}
        editable={editable}
        onChange={(r) => setTable('nhan_su', r)}
        rowAction={
          editable
            ? (row, set) => (
                <select
                  aria-label="Chọn người từ Nhân sự"
                  className={cn(CELL_INPUT, 'w-56')}
                  value=""
                  onChange={(e) => {
                    const p = personnel.data?.find(
                      (x, i) => `${x.employee_id}:${i}` === e.target.value,
                    );
                    if (p) set({ ...row, ...personnelPatch(p) });
                  }}
                >
                  <option value="">Chọn từ Nhân sự…</option>
                  {(personnel.data ?? []).map((p, i) => (
                    <option key={`${p.employee_id}:${i}`} value={`${p.employee_id}:${i}`}>
                      {p.full_name}
                      {p.certificate ? ` — ${p.certificate}` : ''}
                    </option>
                  ))}
                </select>
              )
            : undefined
        }
        note={
          (personnel.data?.length ?? 0) === 0
            ? 'Nhân sự chưa có ai mang chứng chỉ hành nghề trên hệ thống — gõ tay. Năm kinh nghiệm, HĐLĐ / BHXH do người lập ghi.'
            : 'Chọn người có chứng chỉ hành nghề trong Nhân sự để điền họ tên và chứng chỉ. Năm kinh nghiệm, HĐLĐ / BHXH do người lập ghi.'
        }
      />
      <LoopEditor
        name="thiet_bi"
        rows={inputs.tables?.thiet_bi ?? []}
        editable={editable}
        onChange={(r) => setTable('thiet_bi', r)}
        picker={
          editable && (
            <Picker
              label="Thêm từ giấy tờ thiết bị"
              empty="Kho hồ sơ năng lực chưa có giấy tờ thiết bị."
              options={(equipment.data ?? []).map((d) => ({
                id: d.id,
                text: `${d.title}${d.expiry_date ? ` · hết hạn ${formatDate(d.expiry_date)}` : ''}`,
              }))}
              onPick={(id) => {
                const d = equipment.data!.find((x) => x.id === id)!;
                setTable('thiet_bi', [...(inputs.tables?.thiet_bi ?? []), equipmentRow(d)]);
              }}
            />
          )
        }
        note="Số lượng, năm sản xuất, sở hữu / đi thuê do người lập ghi."
      />
      <LoopEditor
        name="tong_hop_gia"
        rows={inputs.tables?.tong_hop_gia ?? []}
        editable={editable}
        onChange={(r) => setTable('tong_hop_gia', r)}
        note="Giá từng hạng mục do người lập ghi theo bảng giá chi tiết; các dòng tổng lấy từ giá dự thầu đã duyệt."
      />
    </div>
  );

  const freeTab = template && !showSaved && (
    <div className="p-1">
      <DocInputsSection
        template={template}
        values={free}
        setValue={(k, v) => setFree({ [k]: v })}
        setMany={setFree}
        status={draftStatus}
        editable={editable}
      />
    </div>
  );

  const versionsTab = (
    <div className="p-1">
      {versions.length === 0 ? (
        <p className="rounded-card bg-surface p-4 text-fg-subtle">Chưa lưu bản nào.</p>
      ) : (
        <ul className="space-y-2 rounded-card bg-surface p-4">
          {versions.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Bản {d.version}</span>
              <span className="text-fg-subtle">
                {d.creator?.full_name ?? 'Hệ thống'} · {formatDateTime(d.created_at)}
                {d.change_reason ? ` · ${d.change_reason}` : ''}
                {d.missing_fields.length > 0 ? ` · còn ${d.missing_fields.length} ô điền tay` : ''}
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
      )}
    </div>
  );

  const preview = (
    <section
      aria-label="Bản xem trước"
      className="h-full min-h-[60vh] rounded-card bg-surface-hover p-2"
    >
      {!filled && (
        <p className="p-4 text-fg-subtle">
          {busy || templates.isLoading ? 'Đang điền mẫu…' : 'Chưa có mẫu để xem trước.'}
        </p>
      )}
      <div ref={previewRef} />
    </section>
  );

  const tabs: WorkspaceTab[] = [
    { id: 'thong-tin', label: 'Thông tin', side: 'left', content: infoTab },
    ...(tablesTab
      ? [{ id: 'bang-ke', label: 'Bảng kê', side: 'left' as const, content: tablesTab }]
      : []),
    ...(freeTab
      ? [
          {
            id: 'noi-dung-rieng',
            label: 'Nội dung riêng',
            side: 'left' as const,
            badge: freeStatus.missing > 0 ? freeStatus.missing : undefined,
            content: freeTab,
          },
        ]
      : []),
    {
      id: 'cac-ban',
      label: 'Các bản đã lưu',
      side: 'left',
      badge: versions.length || undefined,
      content: versionsTab,
    },
    { id: 'xem-truoc', label: 'Bản xem trước', side: 'right', content: preview },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Soạn ${label.toLowerCase()}`}
      className="fixed inset-0 z-40 flex flex-col bg-canvas"
    >
      {promptDialog.dialog}
      {askClose && (
        <ConfirmDialog
          title="Đóng khi chưa lưu xong?"
          confirmLabel="Đóng"
          cancelLabel="Ở lại"
          onCancel={() => setAskClose(false)}
          onConfirm={onClose}
        >
          <p>Lần lưu nháp cuối chưa xong — đóng bây giờ có thể mất vài ô vừa điền.</p>
        </ConfirmDialog>
      )}
      <header className="flex shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {editable ? 'Soạn' : 'Xem'} {label.toLowerCase()}
          </h2>
          <p className="truncate text-sm text-fg-subtle">
            {project.code} · {project.name}
            {editable && draftStatus === 'saving' && ' · Đang lưu nháp…'}
            {editable && draftStatus === 'saved' && ' · Đã lưu nháp'}
            {editable && draftStatus === 'error' && ' · Chưa lưu được nháp — kiểm tra kết nối'}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:overflow-hidden">
        <SplitWorkspace
          tabs={tabs}
          storageKey={`du-thau-${kind}`}
          className="lg:min-h-0 lg:flex-1"
        />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  hint,
  inputMode,
  editable,
  onChange,
}: {
  label: string;
  value: string | undefined;
  placeholder?: string;
  hint?: string;
  inputMode?: 'numeric' | 'decimal';
  editable: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        value={value ?? ''}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function MissingList({ missing }: { missing: BidFormMissing[] }) {
  const groups = new Map<string, string[]>();
  for (const m of missing) {
    const title =
      m.source === 'bang_ke' ? 'Bảng kê (tab Bảng kê)' : BID_FORM_SOURCE_LABELS[m.source];
    groups.set(title, [...(groups.get(title) ?? []), m.label]);
  }
  return (
    <ul className="space-y-1 text-sm">
      {[...groups].map(([title, labels]) => (
        <li key={title}>
          <span className="font-medium">{title}:</span> {labels.join(', ')}.
        </li>
      ))}
    </ul>
  );
}

function Picker({
  label,
  empty,
  options,
  onPick,
}: {
  label: string;
  empty: string;
  options: { id: string; text: string }[];
  onPick: (id: string) => void;
}) {
  if (options.length === 0) return <p className="text-sm text-fg-subtle">{empty}</p>;
  return (
    <select
      aria-label={label}
      className={SELECT_CLASS}
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
    >
      <option value="">{label}…</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.text}
        </option>
      ))}
    </select>
  );
}

function LoopEditor({
  name,
  rows,
  editable,
  onChange,
  picker,
  rowAction,
  note,
}: {
  name: string;
  rows: Record<string, string>[];
  editable: boolean;
  onChange: (rows: Record<string, string>[]) => void;
  picker?: ReactNode;
  rowAction?: (
    row: Record<string, string>,
    set: (row: Record<string, string>) => void,
  ) => ReactNode;
  note?: string;
}) {
  const loop = BID_FORM_LOOPS[name]!;
  const setRow = (i: number, row: Record<string, string>) =>
    onChange(rows.map((r, j) => (j === i ? row : r)));
  return (
    <section className="space-y-3 rounded-card bg-surface p-4">
      <h3 className="font-semibold">
        {loop.form} — {loop.label}
      </h3>
      {note && <p className="text-sm text-fg-subtle">{note}</p>}
      {picker}
      {/* Mỗi dòng một khung có nhãn — ngăn trái hẹp, bảng 6–7 cột phải cuộn ngang thì khó đọc (ảnh 4-soan-bang-ke). */}
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">Dòng {i + 1}</span>
              <div className="ml-auto flex items-center gap-2">
                {rowAction?.(row, (r) => setRow(i, r))}
                {editable && (
                  <button
                    type="button"
                    aria-label={`Xoá dòng ${i + 1}`}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-surface-hover"
                    onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {loop.columns.map((c) => (
                <label key={c.key} className="block text-xs text-fg-subtle">
                  {c.label}
                  <input
                    className={cn(CELL_INPUT, 'mt-1 text-fg')}
                    value={row[c.key] ?? ''}
                    disabled={!editable}
                    inputMode={
                      c.key === 'gia_tri' && name === 'tong_hop_gia' ? 'numeric' : undefined
                    }
                    onChange={(e) => setRow(i, { ...row, [c.key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {rows.length === 0 && (
        <p className="text-sm text-fg-subtle">
          Chưa có dòng nào — văn bản in hai dòng trống để điền tay.
        </p>
      )}
      {editable && (
        <Button variant="secondary" size="sm" onClick={() => onChange([...rows, {}])}>
          <Plus /> Thêm dòng
        </Button>
      )}
    </section>
  );
}
