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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FilePen,
  FileText,
  Lock,
  Send,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import PizZip from 'pizzip';
import {
  CONTRACT_PRICE_FORMS,
  CONTRACT_REQUIRED_TERM_TYPES,
  CONTRACT_TERM_TYPE_LABELS,
  CONTRACT_PRICE_FORM_LABELS,
  CONTRACT_TYPE_LABELS,
  buildTemplateData,
  formatDateTime,
  MISSING_FIELD_SOURCE_LABELS,
  TEMPLATE_BLANK,
  missingTemplateFieldsBySource,
  type MissingFieldSource,
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
  rankTemplates,
  type ContractTemplateRecord,
  useCompanyContractInfo,
  useContractDocuments,
  usePartnerContractInfo,
  useSaveContractDocument,
  useSaveCustomerInfo,
  customerColumnOf,
  useTemplatesForContract,
} from '@/hooks/use-contract-templates';
import {
  useContractTerms,
  useSubmitContractApproval,
  useUpdateContract,
  type ContractDetailRecord,
} from '@/hooks/use-contracts';
import { toUserMessage } from '@/hooks/use-error-message';
import { fillTemplate, inspectTemplate, safeFileName, saveBlob } from '@/lib/docx-template';
import {
  DocInputsSection,
  emptyFreeKeys,
  focusTemplateField,
  freeKey,
  missingByArticle,
  freeFieldStatus,
  templateInputData,
  useDocumentInputsState,
  type DocumentInputs,
} from './document-inputs';
import {
  openWorkspaceTab,
  revealById,
  SplitWorkspace,
  type WorkspaceTab,
} from '@/components/ui/split-workspace';
import { FullscreenFrame } from '@/components/ui/fullscreen-frame';
import { cn } from '@/lib/utils';

/**
 * Bước còn lập văn bản được — khớp trigger `contract_documents_before_insert`: chỉ khi Nháp (0176).
 * Đang chờ duyệt mà đổi văn bản thì người duyệt duyệt một bản, ký một bản khác.
 */
const DRAFTABLE_STAGES = ['nhap'] as const;

/**
 * Tab «Soạn hợp đồng»: bên trái sửa (thông tin in lên văn bản + điều khoản), bên phải bản xem
 * trước đứng yên khi cuộn. Trước đây Điều khoản và Văn bản là hai tab — sửa một dòng phải đổi
 * tab rồi kéo xuống tận cuối mới thấy văn bản (anh Dũng 21/10/2026).
 */
export function DocumentPanel({
  contract,
  canDraft,
  termsPanel,
}: {
  contract: ContractDetailRecord;
  /** Người chịu trách nhiệm có quyền sửa HD — đúng điều kiện `rls_contract_writable`. */
  canDraft: boolean;
  /** Khối điều khoản (HD-02) — đặt ở cột sửa, cạnh bản xem trước. */
  termsPanel: ReactNode;
}) {
  const locked = !(DRAFTABLE_STAGES as readonly string[]).includes(contract.stage);
  const editable = canDraft && !locked;
  // Mẫu đang chọn và giá trị đã điền dùng chung hai cột: cột trái điền nội dung riêng của văn
  // bản, cột phải điền và xem trước.
  const templates = useTemplatesForContract(contract.company_id, contract.type);
  const candidates = rankTemplates(templates.data ?? [], contract.price_form);
  const [templateId, setTemplateId] = useState<string>('');
  const chosen = candidates.find((t) => t.id === templateId) ?? candidates[0] ?? null;
  const inputs = useDocumentInputsState(contract, editable);
  const { data: versions } = useContractDocuments(contract.id);
  const versionsSection = (
    <VersionsSection
      contractId={contract.id}
      submittedId={contract.submitted_document_id}
      approvedId={contract.approved_document_id}
    />
  );

  // Chỉ xem (anh Dũng 25/10/2026): người không sửa được — Ban Giám đốc, người khác trong phòng — từng thấy cả
  // biểu mẫu trống bị khoá (con trỏ «cấm») và «Còn 119 chỗ». Họ cần đọc VĂN BẢN: bản xem trước toàn khổ, ai
  // đang soạn, các phiên bản. Bản xem trước luôn hiện — không thay bằng danh sách ô hay thông báo khoá.
  if (!editable) {
    // Đã khoá: đúng bản đã duyệt / đang gửi. Còn Nháp: văn bản dựng từ dữ liệu đang soạn — trừ khi bản mới nhất
    // là bản sửa trong Word, vì đó mới là bản sẽ gửi phê duyệt.
    const latest = versions?.[0] ?? null;
    const shown = locked
      ? (versions?.find((v) => v.id === contract.approved_document_id) ??
        versions?.find((v) => v.id === contract.submitted_document_id) ??
        latest)
      : latest?.source === 'sua_trong_word'
        ? latest
        : null;
    const notice = (
      <p className="flex items-start gap-2 rounded-card bg-surface px-4 py-3">
        <Lock className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span>
          {locked
            ? contract.stage === 'cho_duyet'
              ? 'Hợp đồng đang chờ phê duyệt — văn bản giữ đúng bản đã gửi. Bị trả về thì người chịu trách nhiệm lập bản mới.'
              : contract.stage === 'da_duyet'
                ? 'Hợp đồng đã được phê duyệt theo văn bản dưới đây — tải về để in và ký. Không lập thêm bản mới.'
                : 'Hợp đồng đã ký — văn bản đã khoá. Thay đổi sau ký đi qua tab Phát sinh.'
            : `${contract.responsible?.full_name ?? 'Người chịu trách nhiệm'} đang soạn văn bản này — chỉ người chịu trách nhiệm sửa được khi hợp đồng còn Nháp (Ban Giám đốc nhận soạn thay được bằng nút ở đầu trang). Văn bản dưới đây dựng theo dữ liệu hiện có.`}
        </span>
      </p>
    );
    const sideTabs: WorkspaceTab[] = [
      {
        id: 'dieu-khoan-tab',
        label: 'Điều khoản',
        side: 'left',
        content: <div id="dieu-khoan">{termsPanel}</div>,
      },
      { id: 'phien-ban', label: 'Phiên bản', side: 'left', content: versionsSection },
    ];
    if (shown || locked) {
      return (
        <Workspace
          top={notice}
          storageKey="hd-van-ban-xem"
          tabs={[
            {
              id: 'van-ban',
              label: 'Văn bản',
              side: 'right',
              content: shown ? (
                <SavedDocumentPreview
                  path={shown.storage_path}
                  title={`Bản ${shown.version}${shown.source === 'sua_trong_word' ? ' — sửa trong Word' : ''}`}
                />
              ) : (
                <p className="text-fg-subtle">Hợp đồng này chưa lưu văn bản nào.</p>
              ),
            },
            ...sideTabs,
          ]}
        />
      );
    }
    return (
      <FillSection
        contract={contract}
        canSave={false}
        templatesLoading={templates.isLoading}
        candidates={candidates}
        chosen={chosen}
        onChooseTemplate={setTemplateId}
        values={inputs.values}
        valuesReady={inputs.ready}
        setValue={inputs.setValue}
        layout={(parts) => (
          <Workspace
            top={
              <>
                {notice}
                {parts.toolbar}
              </>
            }
            storageKey="hd-van-ban-xem"
            tabs={[
              { id: 'van-ban', label: 'Văn bản', side: 'right', content: parts.preview },
              {
                id: 'cho-trong',
                label: 'Chỗ trống',
                side: 'left',
                badge: parts.requiredLeft || undefined,
                content: parts.missing,
              },
              ...sideTabs,
            ]}
          />
        )}
      />
    );
  }

  // Người soạn (anh Dũng 25/10/2026: «chia tab như Visual Studio Code, kéo ra kéo vào»): ngăn trái các tab soạn,
  // ngăn phải văn bản — sửa bên trái vẫn thấy văn bản bên phải, không phải cuộn xuống xem rồi cuộn lên sửa.
  return (
    <FillSection
      contract={contract}
      canSave={canDraft}
      templatesLoading={templates.isLoading}
      candidates={candidates}
      chosen={chosen}
      onChooseTemplate={setTemplateId}
      values={inputs.values}
      valuesReady={inputs.ready}
      setValue={inputs.setValue}
      layout={(parts) => (
        <Workspace
          top={parts.toolbar}
          storageKey="hd-van-ban-soan-buoc"
          tabs={[
            // Bốn BƯỚC soạn (anh Dũng 25/10/2026): mỗi bước một tab bên trái, ✓ khi xong / số còn thiếu, nút «Bước
            // tiếp» ở cuối; văn bản luôn bên phải.
            {
              id: 'thong-tin',
              label: '1. Thông tin',
              side: 'left',
              badge: stepBadge(parts.steps?.info),
              content: (
                <>
                  <InfoSection contract={contract} editable />
                  <NextStep to="dieu-khoan-tab" label="2. Điều khoản" />
                </>
              ),
            },
            {
              id: 'dieu-khoan-tab',
              label: '2. Điều khoản',
              side: 'left',
              badge: stepBadge(parts.steps?.terms),
              content: (
                <>
                  <div id="dieu-khoan">{termsPanel}</div>
                  <NextStep
                    to={chosen ? 'noi-dung' : 'kiem-tra'}
                    label={chosen ? '3. Nội dung riêng' : '4. Kiểm tra và gửi'}
                  />
                </>
              ),
            },
            ...(chosen
              ? [
                  {
                    id: 'noi-dung',
                    label: '3. Nội dung riêng',
                    side: 'left' as const,
                    content: (
                      <>
                        <p className="mb-3 text-sm text-ink-subtle">
                          Bước tùy chọn — dải chấm riêng của mẫu
                          {parts.steps && parts.steps.free > 0
                            ? ` (còn ${parts.steps.free} chỗ)`
                            : ''}
                          . Để trống thì văn bản in dải chấm như bản giấy.
                        </p>
                        <DocInputsSection
                          template={chosen}
                          values={inputs.values}
                          setValue={inputs.setValue}
                          setMany={inputs.setMany}
                          status={inputs.status}
                          editable
                        />
                        <NextStep to="kiem-tra" label="4. Kiểm tra và gửi" />
                      </>
                    ),
                  },
                ]
              : []),
            {
              id: 'kiem-tra',
              label: '4. Kiểm tra và gửi',
              side: 'left',
              badge: stepBadge(parts.requiredLeft),
              content: parts.missing,
            },
            { id: 'van-ban', label: 'Văn bản', side: 'right', content: parts.preview },
            { id: 'phien-ban', label: 'Phiên bản', side: 'right', content: versionsSection },
          ]}
        />
      )}
    />
  );
}

/** Huy hiệu bước: ✓ khi đủ, số còn thiếu khi chưa, không gì khi chưa dựng xong. */
function stepBadge(left: number | null | undefined): ReactNode {
  if (left === null || left === undefined) return undefined;
  return left === 0 ? '✓' : left;
}

/** Nút sang bước kế ở cuối mỗi bước soạn. */
function NextStep({ to, label }: { to: string; label: string }) {
  return (
    <div className="mt-4 flex justify-end">
      <Button variant="secondary" onClick={() => openWorkspaceTab(to)}>
        Bước tiếp: {label}
      </Button>
    </div>
  );
}

/**
 * Khung tab «Soạn hợp đồng»: phần trên (mẫu, nút, thông báo) rồi hai ngăn. Từ lg hai ngăn cao bằng phần màn hình dưới
 * header dính (`--detail-sticky-avail`, đo ở `EntityDetail`, tối thiểu 32rem) để mỗi ngăn cuộn riêng; dưới lg cuộn theo
 * trang.
 */
function Workspace({
  top,
  tabs,
  storageKey,
}: {
  top: ReactNode;
  tabs: WorkspaceTab[];
  storageKey: string;
}) {
  // «Toàn màn hình»: `FullscreenFrame` (anh Dũng 25/10/2026: khung soạn thấp, chữ nhỏ khó đọc).
  // Chiều cao đặt ở HAI NGĂN, không ở cả khung: phần trên (mẫu, dải báo vàng) từng ăn hết chiều cao khung, màn thấp /
  // header cao thì hai ngăn chỉ còn ~160 px, không đọc được (anh Dũng 27/10/2026). Nay hai ngăn cao bằng phần màn hình
  // dưới header, tối thiểu 32rem; phần trên cuộn đi theo trang. Toàn màn hình: `basis-auto` + co / giãn lấp khung.
  // Cuộn gần tới hai ngăn thì trang «hít» cho mép trên hai ngăn nằm ngay dưới header (header thu gọn khi cuộn — xem
  // `EntityDetail`), không để thanh tab của hai ngăn chui xuống dưới header. Chỉ đặt kiểu hít trên <main> khi khung
  // này đang hiện, gỡ khi rời tab.
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main || !window.matchMedia('(min-width: 1024px)').matches) return;
    const before = main.style.scrollSnapType;
    main.style.scrollSnapType = 'y proximity';
    return () => {
      main.style.scrollSnapType = before;
    };
  }, []);
  return (
    <FullscreenFrame top={top}>
      <SplitWorkspace
        tabs={tabs}
        storageKey={storageKey}
        className="lg:h-[max(32rem,var(--detail-sticky-avail,75vh))] lg:min-h-0 lg:flex-1 lg:basis-auto lg:snap-start lg:scroll-mt-[var(--detail-sticky-top,12rem)]"
      />
    </FullscreenFrame>
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
    <section className="rounded-card bg-surface p-4">
      <h3 className="font-medium">Thông tin in lên văn bản</h3>
      <p className="mt-1 text-sm text-fg-subtle">
        Giá trị, đối tác và điều khoản lấy từ hồ sơ. Các ô dưới đây hồ sơ chưa có.
        {!editable && ' Chỉ sửa được khi hợp đồng còn Nháp, bởi người chịu trách nhiệm.'}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
  /** Tệp sạch — lưu và tải về. */
  blob: Blob;
  /** Tệp cho bản xem trước: giá trị bọc dấu ẩn để tô màu (`markPreview`), không bao giờ lưu. */
  previewBlob: Blob;
  data: Record<string, TemplateValue>;
  missing: { source: MissingFieldSource; labels: string[]; keys: string[] }[];
  /** Ô thiếu của riêng hồ sơ (trước khi áp ô điền tay) — danh sách ô cho phần điền tay. */
  missingFromRecord: { source: MissingFieldSource; labels: string[]; keys: string[] }[];
  /** Giờ điền — bản xem trước tự cập nhật, người dùng cần biết nó mới tới đâu. */
  at: Date;
}

function FillSection({
  contract,
  canSave,
  templatesLoading,
  candidates,
  chosen,
  onChooseTemplate,
  values,
  valuesReady,
  setValue,
  layout,
}: {
  contract: ContractDetailRecord;
  canSave: boolean;
  templatesLoading: boolean;
  candidates: ContractTemplateRecord[];
  chosen: ContractTemplateRecord | null;
  onChooseTemplate: (id: string) => void;
  /** Giá trị người soạn đã điền (0186) — lưu theo hợp đồng. */
  values: DocumentInputs;
  valuesReady: boolean;
  setValue: (key: string, value: string) => void;
  /** Đặt các khối (thanh công cụ, chỗ trống, văn bản) vào khung làm việc của nơi gọi. */
  layout: (parts: FillParts) => ReactNode;
}) {
  const promptDialog = usePromptDialog();
  const company = useCompanyContractInfo(contract.company_id);
  const partner = usePartnerContractInfo(contract.customer_id ?? undefined);
  const { data: terms } = useContractTerms(contract.id);
  const { data: versions } = useContractDocuments(contract.id);
  const save = useSaveContractDocument();

  const [filled, setFilled] = useState<Filled | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const submitApproval = useSubmitContractApproval();
  // Ô điền tay chỗ trống chuẩn (số hợp đồng, ngày ký, tài khoản…) — khoá không có «:»; chỗ
  // trống tự do của mẫu (khoá «<mẫu>:o_N») điền ở cột trái. Cả hai lưu theo hợp đồng (0186).
  const manual = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => !k.includes(':') && v.trim()),
  );
  // Phần tử giữ bản xem trước là STATE, không ref: kéo tab «Văn bản» sang ngăn kia thì phần tử dựng lại và văn bản
  // phải vẽ lại vào phần tử mới.
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = usePreviewZoom(previewEl);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  // Ô điền ngay trên văn bản (anh Dũng 25/10/2026): nhãn ở cột trái là câu văn máy tự cắt quanh chỗ trống,
  // khó đoán ô nào là ô nào — bấm chỗ trống trên chính văn bản thì gõ luôn tại đó, thấy nguyên câu.
  const [inline, setInline] = useState<InlineEdit | null>(null);
  const latest = versions?.[0] ?? null;
  const wordLatest = latest?.source === 'sua_trong_word' ? latest : null;

  const ready = Boolean(
    valuesReady && company.data && terms && (!contract.customer_id || partner.data),
  );

  // Xem trước LUÔN hiện và tự cập nhật: mở tab, đổi mẫu, sửa thông tin / điều khoản, gõ ô điền
  // tay → điền lại sau một nhịp. Trước đây phải bấm «Điền và xem trước» mới biết thiếu ô nào
  // (anh Dũng 21/10/2026). Trong lúc chờ điền lại thì khoá «Lưu phiên bản» để không lưu bản cũ.
  const fillRef = useRef<() => Promise<void>>(async () => {});
  const [stale, setStale] = useState(true);
  useEffect(() => {
    if (!ready || !chosen) return;
    setStale(true);
    const t = setTimeout(() => void fillRef.current(), 400);
    return () => clearTimeout(t);
  }, [ready, contract, terms, chosen, values, company.data, partner.data]);

  useEffect(() => {
    const el = previewEl;
    if (!filled || !el) return;
    let cancelled = false;
    el.replaceChildren();
    void import('docx-preview').then(({ renderAsync }) => {
      if (cancelled) return;
      void renderAsync(filled.previewBlob, el, undefined, {
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
        breakPages: true,
      }).then(() => {
        if (cancelled) return;
        markPreview(el);
        fitPreview(el);
      });
    });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fitPreview(el));
    observer?.observe(el);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [filled, previewEl]);

  if (templatesLoading) return <div className="h-24 animate-pulse rounded-lg bg-surface-hover" />;

  if (candidates.length === 0) {
    return (
      <section className="rounded-card bg-surface p-4">
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

  async function fill() {
    if (!chosen || !company.data || !terms) return;
    setError(null);
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
      const missingFromRecord = missingTemplateFieldsBySource(inspected.tags, data, contract.type);
      for (const [key, value] of Object.entries(manual)) data[key] = value.trim();
      const free = templateInputData(chosen, values);
      Object.assign(data, free.data);
      setFilled({
        templateId: chosen.id,
        blob: fillTemplate(buffer, data),
        previewBlob: fillTemplate(buffer, {
          ...wrapForPreview(data, new Set([...Object.keys(manual), ...free.filledKeys])),
          // Chỗ trống chưa điền mang khoá trong bản xem trước — bấm chỗ vàng là tới ô điền.
          ...Object.fromEntries(
            [
              ...emptyFreeKeys(chosen, values),
              ...missingFromRecord
                .filter((g) => !g.source.startsWith('dieu_khoan'))
                .flatMap((g) => g.keys)
                .filter((k) => !manual[k]),
            ].map((k) => [k, BLANK_OPEN + k + BLANK_CLOSE]),
          ),
        }),
        data,
        missing: missingTemplateFieldsBySource(inspected.tags, data, contract.type),
        missingFromRecord,
        at: new Date(),
      });
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
      setStale(false);
    }
  }

  fillRef.current = fill;

  /** Lưu phiên bản văn bản; trả số bản, hoặc null khi người dùng huỷ / lỗi. */
  async function saveVersion(download: boolean): Promise<number | null> {
    if (!filled) return null;
    setError(null);
    setSavedMessage(null);
    const next = (versions?.[0]?.version ?? 0) + 1;
    let reason: string | null = null;
    if (next > 1) {
      reason = await promptDialog.ask({
        title: `Lưu bản ${next}`,
        label: wordLatest
          ? `Nguyên nhân lập lại văn bản — bản ${next} điền từ mẫu, KHÔNG giữ các sửa trong Word của bản ${wordLatest.version}`
          : 'Nguyên nhân lập lại văn bản',
        confirmLabel: download ? 'Lưu và tải về' : 'Lưu',
      });
      if (reason === null) return null;
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
        missingFields: filled.missing.flatMap((g) => g.labels),
        changeReason: reason,
      });
      if (download) {
        saveBlob(filled.blob, fileName);
        setSavedMessage(`Đã lưu bản ${version} và tải về máy.`);
      }
      return version;
    } catch (e) {
      setError(toUserMessage(e, 'create'));
      return null;
    }
  }

  // Lưu văn bản rồi gửi phê duyệt ngay — trước phải lưu ở cột phải, rồi kéo lên đầu trang bấm
  // «Gửi phê duyệt» (anh Dũng 21/10/2026). Điều kiện gửi vẫn do CSDL kiểm (`submit_contract_approval`).
  async function saveAndSubmit() {
    const version = await saveVersion(false);
    if (version === null) return;
    try {
      await submitApproval.mutateAsync({ contractId: contract.id });
      setSavedMessage(`Đã lưu bản ${version} và gửi phê duyệt.`);
    } catch (e) {
      setSavedMessage(`Đã lưu bản ${version}.`);
      setError(`Chưa gửi phê duyệt được: ${toUserMessage(e, 'edit')}`);
    }
  }

  /** Khoá lưu của một chỗ trống: chỗ trống tự do của mẫu mang tiền tố mẫu, ô chuẩn thì không (0186). */
  function storeKey(key: string): string {
    return chosen?.free_fields?.some((f) => f.key === key) ? freeKey(chosen.id, key) : key;
  }

  function openInline(mark: HTMLElement) {
    const key = mark.dataset.key!;
    const box = previewBoxRef.current;
    if (!box) return;
    const at = mark.getBoundingClientRect();
    const origin = box.getBoundingClientRect();
    const sentence = (mark.closest('p')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    setInline({
      key,
      value: values[storeKey(key)] ?? '',
      sentence: sentence.length > 240 ? `${sentence.slice(0, 240)}…` : sentence,
      top: at.bottom - origin.top + box.scrollTop + 6,
      left: Math.max(0, Math.min(at.left - origin.left, origin.width - 320)),
    });
  }

  function saveInline() {
    if (!inline) return;
    setValue(storeKey(inline.key), inline.value);
    setInline(null);
  }

  // Tải lên bản đã sửa trong Word (0222): một phiên bản mới, đánh dấu «sửa trong Word», bắt buộc ghi đã
  // sửa gì. Máy không đọc ngược tệp — chỉ kiểm đúng là tệp Word đọc được.
  async function uploadEdited(file: File) {
    setError(null);
    setSavedMessage(null);
    if (!/\.docx$/i.test(file.name)) {
      setError(
        'Chỉ nhận tệp Word .docx — lưu lại trong Word bằng «Save As → Word Document (.docx)».',
      );
      return;
    }
    try {
      const zip = new PizZip(await file.arrayBuffer());
      if (!zip.file('word/document.xml')) throw new Error('not docx');
    } catch {
      setError('Tệp không mở được như văn bản Word — kiểm tra lại tệp rồi tải lên.');
      return;
    }
    const next = (versions?.[0]?.version ?? 0) + 1;
    const reason = await promptDialog.ask({
      title: `Tải lên bản ${next} — sửa trong Word`,
      label: 'Đã sửa gì trong Word (người duyệt đọc dòng này)',
      confirmLabel: 'Tải lên',
    });
    if (reason === null) return;
    try {
      const version = await save.mutateAsync({
        contractId: contract.id,
        companyId: contract.company_id,
        templateId: chosen?.id ?? null,
        blob: file,
        fileName: safeFileName(
          `${contract.code} - ${contract.title} - bản ${next} (sửa trong Word).docx`,
        ),
        filledValues: {},
        missingFields: [],
        changeReason: reason,
        source: 'sua_trong_word',
      });
      setSavedMessage(`Đã lưu bản ${version} — bản sửa trong Word.`);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function submitLatest() {
    setError(null);
    try {
      await submitApproval.mutateAsync({ contractId: contract.id });
      setSavedMessage(`Đã gửi phê duyệt bản ${wordLatest?.version ?? ''}.`);
    } catch (e) {
      setError(`Chưa gửi phê duyệt được: ${toUserMessage(e, 'edit')}`);
    }
  }

  const missingTerms = CONTRACT_REQUIRED_TERM_TYPES.filter(
    (type) => !(terms ?? []).some((t) => t.term_type === type),
  ).map((type) => CONTRACT_TERM_TYPE_LABELS[type]);
  const toolbar = (
    <div>
      {promptDialog.dialog}
      <h3 className="font-medium">Lập văn bản từ mẫu</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {!canSave && chosen ? (
          <p className="min-w-64 flex-1">
            <span className="text-ink-subtle">Mẫu: </span>
            {chosen.title}
          </p>
        ) : (
          <Field label="Mẫu" className="min-w-64 flex-1">
            <select
              value={chosen?.id ?? ''}
              onChange={(e) => onChooseTemplate(e.target.value)}
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
        )}
        {filled && canSave && (
          <Button
            variant="secondary"
            disabled={save.isPending || stale || busy}
            onClick={() => void saveVersion(true)}
          >
            <Download className="size-4" aria-hidden /> Lưu phiên bản và tải về
          </Button>
        )}
        {filled && canSave && contract.stage === 'nhap' && (
          <Button
            variant={wordLatest ? 'secondary' : 'primary'}
            disabled={save.isPending || submitApproval.isPending || stale || busy}
            onClick={() => void saveAndSubmit()}
          >
            <Send className="size-4" aria-hidden /> Lưu và gửi phê duyệt
          </Button>
        )}
        {canSave && contract.stage === 'nhap' && (
          <>
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => uploadRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden /> Tải lên bản đã sửa trong Word
            </Button>
            <input
              ref={uploadRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void uploadEdited(f);
              }}
            />
          </>
        )}
      </div>
      {canSave && (
        <p className="mt-2 text-xs text-fg-subtle">
          Cần sửa câu chữ, thêm hoặc bớt điều khoản: «Lưu phiên bản và tải về», sửa trong Word, rồi
          «Tải lên bản đã sửa trong Word». Bấm chỗ vàng hoặc xanh dương trên văn bản để điền ngay
          tại chỗ.
        </p>
      )}
      {wordLatest && (
        <div className="mt-3 rounded-field border border-status-pending bg-status-pending-bg p-3 text-sm">
          <p className="flex items-start gap-2 font-semibold">
            <FilePen className="mt-0.5 size-4 shrink-0" aria-hidden />
            Bản {wordLatest.version} là bản sửa trong Word — gửi phê duyệt sẽ gửi đúng bản này.
          </p>
          <p className="mt-1">Đã sửa: {wordLatest.change_reason}</p>
          <p className="mt-1 text-fg-subtle">
            Bản xem trước dưới đây dựng lại từ mẫu và các ô đã điền — không có các sửa trong Word.
            Lưu phiên bản từ mẫu sẽ tạo bản mới không giữ các sửa đó.
          </p>
          {canSave && contract.stage === 'nhap' && (
            <Button
              variant="primary"
              className="mt-2"
              disabled={submitApproval.isPending}
              onClick={() => void submitLatest()}
            >
              <Send className="size-4" aria-hidden /> Gửi phê duyệt bản {wordLatest.version}
            </Button>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}
      {savedMessage && (
        <p role="status" className="mt-3 text-status-completed">
          {savedMessage}
        </p>
      )}
    </div>
  );
  const missing = filled ? (
    <>
      <MissingBox
        filled={filled}
        contract={contract}
        editable={canSave}
        manual={manual}
        onManualChange={setValue}
        updating={stale || busy}
        free={freeFieldStatus(chosen, values)}
        freeArticles={missingByArticle(chosen, values)}
        missingTerms={missingTerms}
      />
    </>
  ) : null;
  const preview = filled ? (
    <>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
        <PreviewZoomControl zoom={zoom} onChange={setZoom} target={previewEl} />
        <span>{stale || busy ? 'Đang cập nhật…' : `Cập nhật ${formatDateTime(filled.at)}`}</span>
        <span className="rounded-sm bg-status-completed-bg px-1.5 text-fg">Lấy từ hồ sơ</span>
        <span className="rounded-sm bg-status-progress-bg px-1.5 text-fg">Điền tay</span>
        <span className="rounded-sm bg-status-pending-bg px-1.5 text-fg">Còn thiếu</span>
        <span>Xem trước có thể lệch đôi chút so với Word; tệp tải về giữ đúng định dạng mẫu.</span>
      </p>
      <div ref={previewBoxRef} className="relative mt-2">
        <div
          ref={setPreviewEl}
          aria-label="Xem trước văn bản hợp đồng"
          onClick={(e) => {
            const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-key]');
            if (!mark) return;
            if (canSave) openInline(mark);
            else focusTemplateField(mark.dataset.key!);
          }}
          className={cn(
            'rounded-md border border-border',
            zoom === 'fit' ? 'overflow-x-hidden' : 'overflow-x-auto',
          )}
        />
        {inline && (
          <InlineBlankEditor
            edit={inline}
            onChange={(value) => setInline({ ...inline, value })}
            onSave={saveInline}
            onCancel={() => setInline(null)}
            onOpenField={() => {
              focusTemplateField(inline.key);
              setInline(null);
            }}
          />
        )}
      </div>
    </>
  ) : (
    <div
      className="h-64 animate-pulse rounded-md bg-surface-hover"
      aria-label="Đang dựng văn bản"
    />
  );
  return (
    <>
      {layout({
        toolbar,
        missing,
        preview,
        requiredLeft: filled ? requiredCount(filled, missingTerms) : null,
        steps: filled
          ? {
              info: filled.missing
                .filter((g) => g.source === 'thong_tin')
                .reduce((n, g) => n + g.labels.length, 0),
              terms: missingTerms.length,
              free: (() => {
                const f = freeFieldStatus(chosen, values);
                return f.missing + f.unchosen;
              })(),
            }
          : null,
      })}
    </>
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
    <section className="rounded-card bg-surface p-4">
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
              {v.source === 'sua_trong_word' && (
                <span className="rounded-full bg-status-pending-bg px-2 py-0.5 text-xs font-semibold text-status-pending">
                  Sửa trong Word
                </span>
              )}
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

/** Lối sửa của từng nhóm ô thiếu — ẩn khi không có nơi sửa trên hệ thống. */
function missingSourceLink(
  source: MissingFieldSource,
  contract: ContractDetailRecord,
): { to?: string; scrollTo?: string; label: string } | null {
  switch (source) {
    case 'dieu_khoan':
    case 'dieu_khoan_tuy_chon':
      return { scrollTo: 'dieu-khoan', label: 'Tới phần Điều khoản' };
    case 'phap_nhan':
      return { to: '/hd/mau-hop-dong', label: 'Mở Mẫu hợp đồng' };
    case 'khach_hang':
      return contract.customer_id
        ? { to: `/crm/khach-hang/${contract.customer_id}/chinh-sua`, label: 'Sửa hồ sơ khách hàng' }
        : null;
    default:
      return null;
  }
}

type MissingGroup = { source: MissingFieldSource; labels: string[]; keys: string[] };

/**
 * Mức cần thiết của từng nhóm ô còn thiếu (anh Dũng 25/10/2026: «Còn 119 chỗ» gộp chỗ bắt buộc với hàng trăm dải
 * chấm tùy chọn của mẫu — người soạn không biết bao giờ là đủ). Cần điền = thứ văn bản không thể thiếu (điều khoản
 * bắt buộc, thông tin hợp đồng, bên NVG); Nên điền = thông tin bên khách và điều khoản không bắt buộc; Tùy chọn =
 * dải chấm riêng của mẫu, để trống thì in dải chấm như bản giấy; Lúc ký = số / ngày / nơi ký.
 */
// Điều khoản bắt buộc đếm thẳng từ các dòng điều khoản đã ghi (`missingTerms`), không từ chỗ trống của mẫu: mẫu
// không có bảng lặp cho mọi nhóm, nên «Phạm vi công việc — chưa có dòng nào» từng không được đếm (25/10/2026).
const REQUIRED_SOURCES: readonly MissingFieldSource[] = ['thong_tin', 'phap_nhan'];
const SHOULD_SOURCES: readonly MissingFieldSource[] = [
  // Ô còn trống TRONG các dòng điều khoản đã ghi (vd hạn của một đợt thanh toán) — nhóm đã có dòng, nên «nên điền».
  'dieu_khoan',
  'khach_hang',
  'dieu_khoan_tuy_chon',
  'dien_tay',
];

/** Số mục «Cần điền» — cùng phép đếm với khung chỗ trống, để huy hiệu trên tab khớp con số trong khung. */
function requiredCount(filled: Filled, missingTerms: string[]): number {
  return (
    filled.missing
      .filter((g) => REQUIRED_SOURCES.includes(g.source))
      .reduce((n, g) => n + g.labels.length, 0) + missingTerms.length
  );
}

/** Các khối của phần lập văn bản — nơi gọi xếp vào khung làm việc. */
export interface FillParts {
  /** Mẫu + các nút lưu / gửi / tải lên + thông báo. */
  toolbar: ReactNode;
  /** Khung chỗ trống chia mức (null khi chưa dựng xong). */
  missing: ReactNode;
  /** Văn bản xem trước (luôn có — đang dựng thì khung xám). */
  preview: ReactNode;
  /** Số mục cần điền còn thiếu (null khi chưa dựng xong). */
  requiredLeft: number | null;
  /** Còn thiếu theo bước soạn: thông tin hợp đồng / điều khoản bắt buộc / chỗ trống riêng của mẫu (tùy chọn). */
  steps: { info: number; terms: number; free: number } | null;
}

const isAppendix = (article: string) => /^(PHỤ LỤC|PHU LUC)/i.test(article.trim());

/**
 * Khung ô còn thiếu, chia theo mức cần thiết; ô điền tay NGAY tại chỗ (anh Dũng 21/10/2026: «còn 6 ô, muốn điền
 * luôn thì sao?»). Nhóm điều khoản chỉ dẫn sang cột trái — dữ liệu của hợp đồng; nhóm khác điền tay cho RIÊNG văn
 * bản này, không ghi ngược vào hồ sơ pháp nhân / khách hàng.
 */
function MissingBox({
  filled,
  contract,
  editable,
  manual,
  onManualChange,
  updating,
  free,
  freeArticles,
  missingTerms,
}: {
  filled: Filled;
  contract: ContractDetailRecord;
  editable: boolean;
  manual: Record<string, string>;
  onManualChange: (key: string, value: string) => void;
  updating: boolean;
  /** Chỗ trống tự do của mẫu (cột trái «Nội dung riêng của văn bản»). */
  free: { missing: number; unchosen: number };
  freeArticles: { article: string; missing: number; firstKey: string }[];
  /** Nhóm điều khoản bắt buộc chưa ghi dòng nào (nhãn), theo `CONTRACT_REQUIRED_TERM_TYPES`. */
  missingTerms: string[];
}) {
  const customerId = contract.customer_id;
  const stillMissing = new Set(filled.missing.flatMap((g) => g.labels));
  // Nhóm điền tay lấy từ ô thiếu CỦA HỒ SƠ, để ô đã gõ vẫn còn đó mà sửa.
  const groups: MissingGroup[] = [
    ...filled.missingFromRecord.filter((g) => !g.source.startsWith('dieu_khoan')),
    ...filled.missing.filter((g) => g.source.startsWith('dieu_khoan')),
  ];
  const countOf = (sources: readonly MissingFieldSource[]) =>
    filled.missing
      .filter((g) => sources.includes(g.source))
      .reduce((n, g) => n + g.labels.length, 0);
  const required = countOf(REQUIRED_SOURCES) + missingTerms.length;
  const should = countOf(SHOULD_SOURCES);
  const optional = free.missing + free.unchosen;
  const atSigning = filled.missing.find((g) => g.source === 'ky')?.labels ?? [];
  const mainArticles = freeArticles.filter((a) => !isAppendix(a.article));
  const appendixArticles = freeArticles.filter((a) => isAppendix(a.article));

  function renderGroup(g: MissingGroup) {
    const link = missingSourceLink(g.source, contract);
    const manualGroup = editable && !g.source.startsWith('dieu_khoan');
    return (
      <div key={g.source} className="mt-3">
        <p className="text-sm font-medium">
          {MISSING_FIELD_SOURCE_LABELS[g.source]}
          {link && editable && (
            <>
              {' · '}
              {link.scrollTo ? (
                <button
                  type="button"
                  className="text-brand underline-offset-2 hover:underline"
                  onClick={() => revealById(link.scrollTo!)}
                >
                  {link.label}
                </button>
              ) : (
                <Link to={link.to!} className="text-brand underline-offset-2 hover:underline">
                  {link.label}
                </Link>
              )}
            </>
          )}
        </p>
        {manualGroup && g.source === 'khach_hang' && customerId ? (
          <CustomerInlineForm
            customerId={customerId}
            keys={g.keys}
            labels={g.labels}
            manual={manual}
            onManualChange={onManualChange}
          />
        ) : manualGroup ? (
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {g.keys.map((key, i) => (
              <Field key={key} label={g.labels[i]!}>
                <Input
                  id={`manual-${key}`}
                  value={manual[key] ?? ''}
                  onChange={(e) => onManualChange(key, e.target.value)}
                  placeholder="Để trống thì in dải chấm"
                  className={cn(manual[key]?.trim() && 'border-status-progress')}
                />
              </Field>
            ))}
          </div>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1.5 text-sm">
            {g.labels
              .filter((m) => stillMissing.has(m))
              .map((m) => (
                <li key={m} className="rounded-sm bg-surface px-2 py-0.5">
                  {m}
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  }

  const articleChips = (list: typeof freeArticles) => (
    <ul className="mt-1 flex flex-wrap gap-1.5 text-sm">
      {list.map((a) => (
        <li key={a.article}>
          <button
            type="button"
            className="rounded-sm bg-surface px-2 py-0.5 text-left hover:bg-surface-hover"
            title={`${a.article} — còn ${a.missing} chỗ`}
            onClick={() => focusTemplateField(a.firstKey)}
          >
            {shortArticle(a.article)} <span className="text-ink-subtle">· {a.missing}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const requiredGroups = groups.filter((g) => REQUIRED_SOURCES.includes(g.source));
  const shouldGroups = groups.filter((g) => SHOULD_SOURCES.includes(g.source));

  return (
    <section
      aria-label="Chỗ trống của văn bản"
      className={cn(
        'mt-3 rounded-md border px-3 py-2',
        required > 0
          ? 'border-status-pending bg-status-pending-bg'
          : 'border-status-completed bg-status-completed-bg',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 font-semibold',
          required > 0 ? 'text-status-pending' : 'text-status-completed',
        )}
      >
        {required > 0 ? (
          <AlertTriangle className="size-4" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden />
        )}
        {required > 0 ? `Cần điền: còn ${required} mục` : 'Đã đủ các mục cần điền'}
      </p>
      <p className="mt-0.5 text-xs text-ink-subtle">
        {[
          should > 0 && `Nên điền: ${should}`,
          optional > 0 && `Tùy chọn của mẫu: ${optional}`,
          atSigning.length > 0 && `Điền lúc ký: ${atSigning.length}`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Mọi chỗ trống của mẫu đã có dữ liệu.'}
        {updating ? ' · Đang cập nhật bản xem trước…' : ''}
      </p>

      {missingTerms.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium">
            Điều khoản bắt buộc chưa ghi
            {editable && (
              <>
                {' · '}
                <button
                  type="button"
                  className="text-brand underline-offset-2 hover:underline"
                  onClick={() => revealById('dieu-khoan')}
                >
                  Tới phần Điều khoản
                </button>
              </>
            )}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-sm">
            {missingTerms.map((m) => (
              <li key={m} className="rounded-sm bg-surface px-2 py-0.5">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
      {requiredGroups.map(renderGroup)}

      {shouldGroups.length > 0 && (
        <details className="mt-3" open={required === 0}>
          <summary className="cursor-pointer text-sm font-semibold">
            Nên điền{should > 0 ? ` — còn ${should}` : ''}
          </summary>
          {shouldGroups.map(renderGroup)}
        </details>
      )}

      {optional > 0 && editable && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Tùy chọn của mẫu — {optional} chỗ
          </summary>
          <p className="mt-1 text-xs text-ink-subtle">
            Dải chấm riêng của mẫu (cột bên trái «Nội dung riêng của văn bản»). Để trống thì văn bản
            in dải chấm như bản giấy — điền tay trên bản in được. Bấm một mục để tới ô, hoặc bấm chỗ
            vàng trên văn bản.
          </p>
          {mainArticles.length > 0 && articleChips(mainArticles)}
          {free.unchosen > 0 && (
            <button
              type="button"
              className="mt-1.5 rounded-sm bg-surface px-2 py-0.5 text-sm hover:bg-surface-hover"
              onClick={() => revealById('noi-dung-van-ban')}
            >
              Chọn phương án <span className="text-ink-subtle">· {free.unchosen}</span>
            </button>
          )}
          {appendixArticles.length > 0 && (
            <>
              <p className="mt-2 text-xs font-medium">Phụ lục</p>
              {articleChips(appendixArticles)}
            </>
          )}
        </details>
      )}

      {atSigning.length > 0 && (
        <p className="mt-3 text-xs text-ink-subtle">
          Điền lúc ký: {atSigning.join(', ')} — để dải chấm là bình thường.
        </p>
      )}
      {editable && (
        <p className="mt-2 text-xs text-ink-subtle">
          Ô điền tay chỉ áp cho văn bản này. Thông tin dùng lâu dài (pháp nhân, khách hàng) nên sửa
          ở hồ sơ để lần sau máy tự điền.
        </p>
      )}
    </section>
  );
}

// Dấu ẩn (vùng ký tự riêng của Unicode) bọc giá trị trong tệp XEM TRƯỚC để tô màu theo nguồn.
const REC_OPEN = '\uE000';
const REC_CLOSE = '\uE001';
const MAN_OPEN = '\uE002';
const MAN_CLOSE = '\uE003';
const BLANK_OPEN = '\uE004';
const BLANK_CLOSE = '\uE005';
/** Ngăn khoá với giá trị trong dấu «điền tay» — để bấm chỗ xanh dương trên văn bản là sửa đúng ô. */
const KEY_SEP = '\uE006';
const HIDDEN_MARKS = /[\uE000-\uE006]/g;

/** Bọc từng giá trị bằng dấu ẩn — mỗi dòng một cặp, vì xuống dòng tách thành nhiều nút chữ. */
function wrapForPreview(
  data: Record<string, TemplateValue>,
  manualKeys: ReadonlySet<string>,
): Record<string, TemplateValue> {
  const wrap = (v: string, manualKey: string | null) =>
    v
      .split('\n')
      .map((line) =>
        line
          ? manualKey
            ? MAN_OPEN + manualKey + KEY_SEP + line + MAN_CLOSE
            : REC_OPEN + line + REC_CLOSE
          : line,
      )
      .join('\n');
  const out: Record<string, TemplateValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string')
      out[key] = /^pa_\d+_[a-z]_o$/.test(key)
        ? value
        : wrap(value, manualKeys.has(key) ? key : null);
    else if (Array.isArray(value))
      out[key] = value.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, typeof v === 'string' ? wrap(v, null) : v]),
        ),
      ) as TemplateValue;
    else out[key] = value;
  }
  return out;
}

/**
 * Tô màu bản xem trước: xanh lá = lấy từ hồ sơ, xanh dương = điền tay, vàng = dải chấm còn thiếu
 * (anh Dũng 21/10/2026: «đổi thành xanh hay màu khác để dễ phân biệt»). Dấu ẩn bị gỡ khỏi chữ.
 */
function markPreview(root: HTMLElement) {
  const token = new RegExp(
    `${REC_OPEN}([^${REC_CLOSE}]*)${REC_CLOSE}|${MAN_OPEN}([a-z0-9_]+)${KEY_SEP}([^${MAN_CLOSE}]*)${MAN_CLOSE}|${BLANK_OPEN}([a-z0-9_]+)${BLANK_CLOSE}|${TEMPLATE_BLANK}`,
    'g',
  );
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const v = n.nodeValue ?? '';
    if (v.includes(TEMPLATE_BLANK) || /[\uE000-\uE006]/.test(v)) hits.push(n as Text);
  }
  for (const node of hits) {
    const text = node.nodeValue!;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(token)) {
      if (m.index > last) frag.append(text.slice(last, m.index).replace(HIDDEN_MARKS, ''));
      const mark = document.createElement('mark');
      if (m[1] !== undefined) {
        mark.textContent = m[1];
        mark.className = 'bg-status-completed-bg text-fg';
      } else if (m[2] !== undefined) {
        // Đã điền tay — bấm để sửa ngay tại chỗ.
        mark.textContent = m[3]!;
        mark.dataset.key = m[2];
        mark.title = 'Bấm để sửa';
        mark.className =
          'cursor-pointer bg-status-progress-bg text-fg hover:outline hover:outline-1';
      } else if (m[4] !== undefined) {
        // Chỗ trống điền được trên màn hình — bấm là mở ô điền ngay tại chỗ.
        mark.textContent = TEMPLATE_BLANK;
        mark.dataset.key = m[4];
        mark.title = 'Bấm để điền';
        mark.className =
          'cursor-pointer bg-status-pending-bg text-fg hover:outline hover:outline-1';
      } else {
        mark.textContent = TEMPLATE_BLANK;
        mark.className = 'bg-status-pending-bg text-fg';
      }
      frag.append(mark);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last).replace(HIDDEN_MARKS, ''));
    node.replaceWith(frag);
  }
}

/**
 * Cỡ chữ của bản xem trước (anh Dũng 25/10/2026: «văn bản nhỏ nên khó đọc»): «Vừa khổ» co / giãn trang A4 theo bề
 * rộng ngăn; chọn một mức cố định thì trang giữ mức đó, ngăn hẹp hơn thì cuộn ngang. Nhớ trên máy người dùng.
 */
type PreviewZoom = 'fit' | number;
const ZOOM_KEY = 'hd-van-ban-co-chu';
const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
/** «Vừa khổ» được giãn tới mức này khi ngăn rộng hơn trang (toàn màn hình). */
const FIT_MAX = 1.5;

function readZoom(): PreviewZoom {
  try {
    const raw = window.localStorage.getItem(ZOOM_KEY);
    const n = Number(raw);
    return raw && raw !== 'fit' && n >= ZOOM_STEPS[0]! && n <= ZOOM_STEPS.at(-1)! ? n : 'fit';
  } catch {
    return 'fit';
  }
}

function usePreviewZoom(el: HTMLElement | null): [PreviewZoom, (z: PreviewZoom) => void] {
  const [zoom, setZoom] = useState<PreviewZoom>(readZoom);
  useEffect(() => {
    try {
      window.localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      // chỉ là tiện lợi
    }
    if (!el) return;
    el.dataset.zoom = String(zoom);
    fitPreview(el);
  }, [el, zoom]);
  return [zoom, setZoom];
}

/** Mức đang thấy thật (kể cả khi đang «Vừa khổ») — để nút +/− bước tiếp từ đó. */
function currentZoom(el: HTMLElement | null): number {
  const z = Number(el?.querySelector<HTMLElement>('.docx-wrapper')?.style.zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function PreviewZoomControl({
  zoom,
  onChange,
  target,
}: {
  zoom: PreviewZoom;
  onChange: (z: PreviewZoom) => void;
  target: HTMLElement | null;
}) {
  const now = zoom === 'fit' ? currentZoom(target) : zoom;
  const smaller = [...ZOOM_STEPS].reverse().find((z) => z < now - 0.01);
  const larger = ZOOM_STEPS.find((z) => z > now + 0.01);
  const btn =
    'grid size-8 place-items-center rounded-full text-ink-subtle hover:bg-surface-hover hover:text-ink disabled:opacity-40';
  return (
    <span role="group" aria-label="Cỡ chữ văn bản" className="inline-flex items-center gap-0.5">
      <button
        type="button"
        className={btn}
        disabled={smaller === undefined}
        onClick={() => smaller !== undefined && onChange(smaller)}
        aria-label="Thu nhỏ chữ"
        title="Thu nhỏ chữ"
      >
        <ZoomOut className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange('fit')}
        aria-pressed={zoom === 'fit'}
        title="Vừa bề rộng ngăn"
        className={cn(
          'min-w-20 rounded-full px-2 py-1 text-xs tabular-nums',
          zoom === 'fit'
            ? 'bg-pill font-semibold text-ink'
            : 'text-ink-subtle hover:bg-surface-hover',
        )}
      >
        {zoom === 'fit' ? 'Vừa khổ' : `${Math.round(zoom * 100)} %`}
      </button>
      <button
        type="button"
        className={btn}
        disabled={larger === undefined}
        onClick={() => larger !== undefined && onChange(larger)}
        aria-label="Phóng to chữ"
        title="Phóng to chữ"
      >
        <ZoomIn className="size-4" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Co trang A4 vừa bề rộng cột xem trước — cột hẹp hơn khổ giấy, để nguyên thì phải cuộn
 * ngang mới đọc hết dòng. Người dùng chọn mức cố định (`data-zoom`) thì giữ mức đó.
 */
function fitPreview(root: HTMLElement) {
  const wrapper = root.querySelector<HTMLElement>('.docx-wrapper');
  if (!wrapper) return;
  wrapper.style.zoom = '1';
  // Đo theo trang giấy, không theo `scrollWidth`: docx-preview đặt trang GIỮA khung, nên ở ngăn hẹp phần tràn sang
  // trái không được tính và trang bị cắt mép phải (thấy khi kéo ngăn «Văn bản» hẹp lại, 25/10/2026).
  const pages = [...wrapper.querySelectorAll<HTMLElement>(':scope > section')];
  const pageWidth = Math.max(0, ...pages.map((p) => p.offsetWidth));
  const style = getComputedStyle(wrapper);
  const need =
    pageWidth > 0
      ? pageWidth + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      : wrapper.scrollWidth;
  const fixed = Number(root.dataset.zoom);
  const zoom =
    root.dataset.zoom && root.dataset.zoom !== 'fit' && fixed > 0
      ? fixed
      : Math.min(FIT_MAX, root.clientWidth / need);
  wrapper.style.zoom = String(zoom);
}

/** «Điều 7. Thanh toán» → «Điều 7»; «PHỤ LỤC 01 – …» → «Phụ lục 01» — nhãn gọn cho danh sách. */
function shortArticle(article: string): string {
  const m = /^(Điều \d+|PHỤ LỤC \d+|BIÊN BẢN [^–(]{0,30})/i.exec(article);
  if (!m) return article;
  return m[1]!.replace(/^PHỤ LỤC/i, 'Phụ lục').trim();
}

interface InlineEdit {
  /** Khoá chỗ trống trong mẫu (`o_12`, `doi_tac_dia_chi`…), không phải khoá lưu. */
  key: string;
  value: string;
  /** Nguyên câu văn chứa chỗ trống — thay cho nhãn máy tự cắt ở cột trái. */
  sentence: string;
  top: number;
  left: number;
}

/** Ô điền nổi ngay dưới chỗ trống trên bản xem trước. Enter lưu, Shift+Enter xuống dòng, Esc thôi. */
function InlineBlankEditor({
  edit,
  onChange,
  onSave,
  onCancel,
  onOpenField,
}: {
  edit: InlineEdit;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenField: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Điền chỗ trống"
      style={{ top: edit.top, left: edit.left }}
      className="absolute z-20 w-80 rounded-card bg-surface p-3 shadow-overlay ring-1 ring-border"
    >
      {edit.sentence && <p className="text-xs text-ink-subtle">{edit.sentence}</p>}
      <textarea
        autoFocus
        rows={2}
        value={edit.value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave();
          }
        }}
        aria-label="Nội dung chỗ trống"
        className={cn(FIELD_BOX, 'mt-2 h-auto w-full py-2')}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={onSave}>
          Lưu
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Thôi
        </Button>
        <button
          type="button"
          onClick={onOpenField}
          className="ml-auto text-xs font-medium text-brand underline-offset-2 hover:underline"
        >
          Mở ô ở cột trái
        </button>
      </div>
    </div>
  );
}

/**
 * Văn bản của một phiên bản ĐÃ LƯU (bản đã duyệt / đang gửi / mới nhất) — cho người chỉ xem và hợp đồng đã
 * khoá. Bản sửa trong Word cũng hiện đúng như tệp đã tải lên, vì đây là tệp thật trong kho, không dựng lại từ mẫu.
 */
function SavedDocumentPreview({ path, title }: { path: string; title: string }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = usePreviewZoom(el);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!el) return;
    let cancelled = false;
    setError(null);
    el.replaceChildren();
    void (async () => {
      try {
        const blob = await downloadFile(DOCUMENT_BUCKET, path);
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        await renderAsync(blob, el, undefined, {
          inWrapper: true,
          ignoreLastRenderedPageBreak: true,
          breakPages: true,
        });
        if (!cancelled) fitPreview(el);
      } catch (e) {
        if (!cancelled) setError(toUserMessage(e));
      }
    })();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fitPreview(el));
    observer?.observe(el);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [path, el]);
  return (
    <section className="rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Văn bản — {title}</h3>
        <PreviewZoomControl zoom={zoom} onChange={setZoom} target={el} />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          Không mở được văn bản: {error}
        </p>
      )}
      <div
        ref={setEl}
        aria-label="Văn bản hợp đồng đã lưu"
        className={cn(
          'mt-2 rounded-md border border-border',
          zoom === 'fit' ? 'overflow-x-hidden' : 'overflow-x-auto',
        )}
      />
    </section>
  );
}

/**
 * Thiếu thông tin bên khách (địa chỉ, điện thoại, mã số thuế…): điền và lưu THẲNG vào hồ sơ khách hàng ngay tại đây
 * (anh Dũng 25/10/2026 — trước phải rời trang sang hồ sơ khách). Văn bản này và mọi văn bản sau tự điền. Không sửa
 * được hồ sơ (không phải người chịu trách nhiệm khách) thì vẫn điền riêng cho văn bản này như trước.
 */
function CustomerInlineForm({
  customerId,
  keys,
  labels,
  manual,
  onManualChange,
}: {
  customerId: string;
  keys: string[];
  labels: string[];
  manual: Record<string, string>;
  onManualChange: (key: string, value: string) => void;
}) {
  const save = useSaveCustomerInfo();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = keys
    .map((key, i) => ({ key, label: labels[i]!, column: customerColumnOf(key) }))
    .filter((f): f is { key: string; label: string; column: string } => f.column !== null);
  const others = keys
    .map((key, i) => ({ key, label: labels[i]! }))
    .filter((f) => customerColumnOf(f.key) === null);

  async function saveToCustomer() {
    setError(null);
    setMessage(null);
    const changes = Object.fromEntries(
      fields
        .map((f) => [f.column, (draft[f.key] ?? '').trim()] as const)
        .filter(([, v]) => v !== ''),
    );
    if (Object.keys(changes).length === 0) return;
    try {
      await save.mutateAsync({ customerId, changes });
      setDraft({});
      setMessage('Đã lưu vào hồ sơ khách hàng — văn bản tự cập nhật.');
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="mt-1 space-y-2">
      {fields.length > 0 && (
        <div className="rounded-field bg-surface p-3">
          <p className="text-xs text-ink-subtle">
            Lưu vào hồ sơ khách hàng — văn bản này và các văn bản sau tự điền.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  id={`customer-${f.key}`}
                  value={draft[f.key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            disabled={save.isPending || fields.every((f) => !(draft[f.key] ?? '').trim())}
            onClick={() => void saveToCustomer()}
          >
            Lưu vào hồ sơ khách hàng
          </Button>
          {message && (
            <p role="status" className="mt-1 text-xs text-status-completed">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs text-status-overdue">
              {error}
            </p>
          )}
        </div>
      )}
      <details open={fields.length === 0 || error !== null}>
        <summary className="cursor-pointer text-xs text-ink-subtle">
          Hoặc chỉ điền cho văn bản này (không lưu vào hồ sơ)
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[...fields, ...others].map((f) => (
            <Field key={f.key} label={f.label}>
              <Input
                id={`manual-${f.key}`}
                value={manual[f.key] ?? ''}
                onChange={(e) => onManualChange(f.key, e.target.value)}
                placeholder="Để trống thì in dải chấm"
                className={cn(manual[f.key]?.trim() && 'border-status-progress')}
              />
            </Field>
          ))}
        </div>
      </details>
    </div>
  );
}
