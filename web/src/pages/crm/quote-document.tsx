/**
 * Văn bản báo giá gửi khách (0239): xem trước bản Word điền từ mẫu của pháp nhân và SỬA CÂU CHỮ ngay trên bản xem
 * trước (như soạn hợp đồng 0222), tải Word / PDF, gửi Zalo (lời nhắn theo mẫu) và gửi email (hệ thống gửi qua
 * Resend, hoặc giả lập).
 *
 * - Sửa được trên văn bản: lời giới thiệu, phạm vi và điều kiện, điều kiện thanh toán, thời gian thực hiện, lời
 *   kết, người ký, chức vụ — cả sau khi duyệt (không phải giá); CSDL ghi lịch sử từng lần đổi.
 * - KHÔNG sửa trên văn bản: hạng mục, đơn giá, giảm giá, thuế, tổng — số đã duyệt, hiện khoá.
 * - «Tải lên bản đã sửa trong Word»: phiên bản bất biến, bắt buộc lý do; có bản này thì tải về / Zalo / email dùng
 *   ĐÚNG tệp Word ấy. Hệ thống không đổi Word sang PDF được, nên khi đó tệp gửi khách là .docx (màn hình nói rõ).
 * - Chỉ báo giá ĐÃ DUYỆT, đang hiệu lực mới tải / gửi bản cho khách. Bản chưa duyệt chỉ xem, PDF in «Bản nháp».
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Lock, Mail, Upload } from 'lucide-react';
import {
  buildQuoteDocumentData,
  fillMessageTemplate,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
  isEmailAddress,
  QUOTE_LOCKED_NOTE,
  QUOTE_MESSAGE_PLACEHOLDERS,
  QUOTE_TEXT_LABELS,
  type QuoteDocumentData,
  type QuoteMessageValues,
  type QuoteTextKey,
  type TemplateValue,
} from '@nvg/shared';
import { ZaloSend } from '@/components/share/zalo-send';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { TEXTAREA_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { downloadFile, TEMPLATE_BUCKET } from '@/hooks/use-contract-templates';
import { toUserMessage } from '@/hooks/use-error-message';
import { useOutboundShares } from '@/hooks/use-outbound-shares';
import { useQuoteMessageTemplate } from '@/hooks/use-message-templates';
import {
  QUOTE_DOCUMENT_BUCKET,
  quoteFileBase,
  useQuoteDocument,
  useQuoteTextChanges,
  useSaveQuoteText,
  useUploadQuoteDocument,
  type QuoteDocumentBundle,
  type QuoteUploadedDocument,
} from '@/hooks/use-quote-document';
import type { QuoteRecord } from '@/hooks/use-quotes';
import { fillTemplate, safeFileName, saveBlob, unfilledTagsInDocx } from '@/lib/docx-template';
import { sendEmail, type SendEmailResult } from '@/lib/share-api';
import { decorateQuotePreview, markQuoteData } from './quote-preview-marks';

const PDF_MIME = 'application/pdf';

async function makePdf(data: QuoteDocumentData, quote: QuoteRecord, draft: boolean): Promise<Blob> {
  const { buildQuotePdf } = await import('@/lib/quote-pdf');
  const bytes = await buildQuotePdf(data, { draft, title: `Báo giá ${quote.code}` });
  return new Blob([bytes as BlobPart], { type: PDF_MIME });
}

function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Giá trị chỗ trống của lời nhắn báo giá. */
export function quoteMessageValues(
  quote: QuoteRecord,
  bundle: QuoteDocumentBundle | undefined,
): QuoteMessageValues {
  return {
    ten_khach: bundle?.source.customer?.name ?? null,
    ma_bao_gia: quote.code,
    gia_tri: quote.total_value !== null ? formatCurrency(quote.total_value) : null,
    hieu_luc: formatDate(quote.valid_until) || null,
    nguoi_gui: bundle?.senderName ?? null,
    sdt_nguoi_gui: bundle?.senderPhone ? formatPhone(bundle.senderPhone) : null,
    phap_nhan: bundle?.source.company?.legal_name ?? bundle?.source.company?.short_name ?? null,
    ten_cong_trinh: bundle?.source.opportunityName ?? null,
  };
}

const PLACEHOLDER_LABEL = Object.fromEntries(
  QUOTE_MESSAGE_PLACEHOLDERS.map((p) => [p.key, p.label]),
);

/** Tệp gửi khách: bản Word sửa tay nếu có, không thì PDF dựng từ dữ liệu. */
interface CustomerFile {
  name: string;
  kind: 'pdf' | 'docx';
  load: () => Promise<Blob>;
}

/** Khối nút văn bản + gửi khách trên thẻ một phiên bản báo giá. */
export function QuoteDocumentActions({
  quote,
  opportunityId,
  canSend,
  canEditText,
}: {
  quote: QuoteRecord;
  opportunityId: string;
  /** Người chịu trách nhiệm cơ hội / lãnh đạo (gửi được bản đã duyệt). */
  canSend: boolean;
  /** Được sửa câu chữ của báo giá (người sửa được cơ hội; CSDL kiểm lại). */
  canEditText: boolean;
}) {
  const bundle = useQuoteDocument(quote, opportunityId);
  const [viewing, setViewing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = quote.status === 'completed' && quote.is_current_version;
  const zaloTemplate = useQuoteMessageTemplate(quote.company_id, 'zalo').template;
  const data = useMemo(
    () => (bundle.data ? buildQuoteDocumentData(bundle.data.source) : null),
    [bundle.data],
  );
  const upload = approved ? (bundle.data?.uploads[0] ?? null) : null;
  const base = safeFileName(quoteFileBase(quote));

  const customerFile: CustomerFile | null = !data
    ? null
    : upload
      ? {
          name: `${base} (sua trong Word ban ${upload.version}).docx`,
          kind: 'docx',
          load: () => downloadFile(QUOTE_DOCUMENT_BUCKET, upload.storage_path),
        }
      : { name: `${base}.pdf`, kind: 'pdf', load: () => makePdf(data, quote, !approved) };

  async function onDownload() {
    if (!customerFile) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await customerFile.load();
      // Bản nháp: chỉ mở để xem, không tải về như bản gửi khách.
      if (approved) saveBlob(blob, customerFile.name);
      else openBlob(blob);
    } catch {
      setError('Không dựng được tệp báo giá. Tải lại trang rồi thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const zaloMessage = fillMessageTemplate(
    zaloTemplate.body,
    quoteMessageValues(quote, bundle.data),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="secondary" size="sm" onClick={() => setViewing(true)} disabled={!data}>
          <Eye aria-hidden /> Xem văn bản
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void onDownload()}
          disabled={!customerFile || busy}
        >
          {approved ? <Download aria-hidden /> : <FileText aria-hidden />}
          {busy
            ? 'Đang dựng tệp…'
            : !approved
              ? 'Xem PDF bản nháp'
              : upload
                ? 'Tải Word đã sửa'
                : 'Tải PDF'}
        </Button>
        {canSend && approved && customerFile && (
          <>
            <ZaloSend
              canSend
              size="sm"
              entityType="quotes"
              entityId={quote.id}
              phone={bundle.data?.customerPhone ?? null}
              message={zaloMessage.text}
              file={{ name: customerFile.name, load: customerFile.load }}
            />
            <div className="inline-flex flex-col items-start gap-1">
              <Button variant="secondary" size="sm" onClick={() => setEmailing(true)}>
                <Mail aria-hidden /> Gửi email
              </Button>
              <EmailHistory quoteId={quote.id} />
            </div>
          </>
        )}
      </div>
      {upload && (
        <p className="text-xs text-fg-subtle">
          Đang gửi khách bản sửa trong Word lần {upload.version} (
          {formatDateTime(upload.created_at)}
          {upload.creator ? `, ${upload.creator.full_name}` : ''}). Hệ thống không đổi được Word
          sang PDF, nên Zalo, email và «Tải» dùng đúng tệp Word này.
        </p>
      )}
      {!approved && quote.is_current_version && (
        <p className="text-xs text-fg-subtle">
          Bản chưa duyệt chỉ xem được (PDF in dấu «Bản nháp»). Phê duyệt xong mới tải và gửi khách.
        </p>
      )}
      {error && <p className="text-status-overdue">{error}</p>}
      {viewing && bundle.data && data && (
        <QuoteDocumentDialog
          quote={quote}
          bundle={bundle.data}
          data={data}
          approved={approved}
          upload={upload}
          canEditText={canEditText && quote.is_current_version}
          canUpload={canSend && approved}
          onDownload={() => void onDownload()}
          downloadLabel={!approved ? 'Xem PDF bản nháp' : upload ? 'Tải Word đã sửa' : 'Tải PDF'}
          onClose={() => setViewing(false)}
        />
      )}
      {emailing && bundle.data && customerFile && (
        <QuoteEmailDialog
          quote={quote}
          bundle={bundle.data}
          file={customerFile}
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
}

function EmailHistory({ quoteId }: { quoteId: string }) {
  const { data = [] } = useOutboundShares('quotes', quoteId);
  const emails = data.filter((s) => s.channel === 'email').slice(0, 3);
  if (emails.length === 0) return null;
  return (
    <div className="text-xs text-fg-subtle">
      <p className="font-medium">Đã gửi email</p>
      <ul>
        {emails.map((s) => (
          <li key={s.id}>
            {formatDateTime(s.created_at)}
            {s.creator ? ` · ${s.creator.full_name}` : ''}
            {s.recipient ? ` · tới ${s.recipient}` : ''}
            {s.simulated ? ' · giả lập, chưa gửi thật' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Khung hộp thoại dùng chung trong tệp này — Esc / bấm nền để đóng, khoá cuộn trang sau. */
function Dialog({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-card bg-surface shadow-overlay ${wide ? 'max-w-5xl' : 'max-w-lg'}`}
      >
        <h2 className="border-b border-border px-5 py-3 text-md font-semibold">{title}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

interface InlineEdit {
  key: QuoteTextKey;
  value: string;
  top: number;
  left: number;
}

function QuoteDocumentDialog({
  quote,
  bundle,
  data,
  approved,
  upload,
  canEditText,
  canUpload,
  onDownload,
  downloadLabel,
  onClose,
}: {
  quote: QuoteRecord;
  bundle: QuoteDocumentBundle;
  data: QuoteDocumentData;
  approved: boolean;
  upload: QuoteUploadedDocument | null;
  canEditText: boolean;
  canUpload: boolean;
  onDownload: () => void;
  downloadLabel: string;
  onClose: () => void;
}) {
  const [viewEl, setViewEl] = useState<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [docx, setDocx] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inline, setInline] = useState<InlineEdit | null>(null);
  const saveText = useSaveQuoteText();
  const template = bundle.template;
  // Có bản Word sửa tay thì xem đúng tệp ấy (không dựng lại từ mẫu) và không sửa câu chữ ở đây nữa.
  const editable = canEditText && !upload;

  useEffect(() => {
    const el = viewEl;
    if (!el || (!template && !upload)) return;
    let cancelled = false;
    void (async () => {
      try {
        let preview: Blob;
        if (upload) {
          preview = await downloadFile(QUOTE_DOCUMENT_BUCKET, upload.storage_path);
          if (!cancelled) setDocx(preview);
        } else {
          const file = await downloadFile(TEMPLATE_BUCKET, template!.storage_path);
          const buffer = await file.arrayBuffer();
          if (cancelled) return;
          setDocx(fillTemplate(buffer, data as unknown as Record<string, TemplateValue>));
          preview = fillTemplate(buffer, markQuoteData(data, editable));
        }
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        el.replaceChildren();
        await renderAsync(preview, el, undefined, {
          inWrapper: true,
          ignoreLastRenderedPageBreak: true,
          breakPages: true,
        });
        if (!cancelled && !upload) decorateQuotePreview(el);
      } catch {
        if (!cancelled)
          setError('Không mở được văn bản Word báo giá. Bản PDF vẫn dựng được từ dữ liệu báo giá.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewEl, template, upload, data, editable]);

  function openInline(mark: HTMLElement) {
    const box = boxRef.current;
    if (!box) return;
    const key = mark.dataset.quoteKey as QuoteTextKey;
    const at = mark.getBoundingClientRect();
    const origin = box.getBoundingClientRect();
    setInline({
      key,
      value: (data[key] as string | null) ?? '',
      top: at.bottom - origin.top + box.scrollTop + 6,
      left: Math.max(0, Math.min(at.left - origin.left, origin.width - 400)),
    });
  }

  async function saveInline() {
    if (!inline) return;
    setError(null);
    try {
      await saveText.mutateAsync({
        quoteId: quote.id,
        current: bundle.source.texts ?? {},
        key: inline.key,
        value: inline.value,
      });
      setInline(null);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <Dialog title={`Văn bản báo giá ${quote.code}`} onClose={onClose} wide>
      <div className="space-y-3">
        {!approved && (
          <p
            role="status"
            className="rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2"
          >
            Bản nháp — chưa phê duyệt. Chỉ để xem; phê duyệt xong mới tải và gửi khách.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-subtle">
            {upload
              ? `Bản sửa trong Word lần ${upload.version} — ${upload.reason}`
              : template
                ? `Mẫu: ${template.title}`
                : 'Pháp nhân chưa có mẫu Word báo giá.'}
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            {approved && docx && !upload && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => saveBlob(docx, `${safeFileName(quoteFileBase(quote))}.docx`)}
              >
                <Download aria-hidden /> Tải Word
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onDownload}>
              {downloadLabel}
            </Button>
            <Button size="sm" variant="primary" onClick={onClose}>
              Đóng
            </Button>
          </span>
        </div>

        {!upload && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
            {editable && (
              <span className="rounded-sm bg-status-progress-bg px-1.5 text-fg">
                Bấm chỗ tô xanh để sửa câu chữ
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-sm bg-surface-sunken px-1.5 text-fg">
              <Lock className="size-3" aria-hidden /> {QUOTE_LOCKED_NOTE}
            </span>
          </p>
        )}
        {upload && canEditText && (
          <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
            Câu chữ sửa trên hệ thống không áp vào bản Word đã tải lên. Cần đổi nữa thì sửa trong
            Word rồi tải lên bản mới.
          </p>
        )}

        {error && <p className="text-status-overdue">{error}</p>}
        {template || upload ? (
          <div ref={boxRef} className="relative">
            <div
              ref={setViewEl}
              onClick={(e) => {
                const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-quote-key]');
                if (mark && editable) openInline(mark);
              }}
              className="docx-preview-host max-h-[62vh] overflow-auto rounded-sm bg-surface-sunken"
              aria-label="Bản xem trước văn bản báo giá"
            />
            {inline && (
              <div
                role="dialog"
                aria-label={`Sửa ${QUOTE_TEXT_LABELS[inline.key]}`}
                style={{ top: inline.top, left: inline.left }}
                className="absolute z-20 w-[25rem] max-w-full rounded-card bg-surface p-3 shadow-overlay ring-1 ring-border"
              >
                <p className="text-xs font-medium text-ink-subtle">
                  {QUOTE_TEXT_LABELS[inline.key]}
                </p>
                <textarea
                  autoFocus
                  rows={inline.key === 'nguoi_ky' || inline.key === 'chuc_vu_ky' ? 1 : 5}
                  value={inline.value}
                  onChange={(e) => setInline({ ...inline, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setInline(null);
                    }
                  }}
                  className={`${TEXTAREA_BOX} mt-2`}
                />
                <p className="mt-1 text-xs text-fg-subtle">
                  Để trống rồi lưu thì quay về câu mặc định. Chỉ chữ thường, không định dạng.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={saveText.isPending}
                    onClick={() => void saveInline()}
                  >
                    {saveText.isPending ? 'Đang lưu…' : 'Lưu'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setInline(null)}>
                    Thôi
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
            Ban Giám đốc hoặc Quản trị tải mẫu Word báo giá ở trang Mẫu hợp đồng. Trong lúc chờ, bản
            PDF vẫn dựng được.
          </p>
        )}

        {canUpload && <UploadEditedWord quote={quote} uploads={bundle.uploads} />}
        <TextChangeHistory quoteId={quote.id} />
      </div>
    </Dialog>
  );
}

/** «Tải lên bản đã sửa trong Word» — chỉ báo giá đã duyệt; tệp còn chỗ trống `{…}` bị từ chối. */
function UploadEditedWord({
  quote,
  uploads,
}: {
  quote: QuoteRecord;
  uploads: QuoteUploadedDocument[];
}) {
  const upload = useUploadQuoteDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function choose(f: File | null) {
    setError(null);
    setDone(false);
    setFile(null);
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      setError(
        'Chỉ nhận tệp Word .docx — lưu lại trong Word bằng «Save As → Word Document (.docx)».',
      );
      return;
    }
    const left = unfilledTagsInDocx(await f.arrayBuffer());
    if (left === null) {
      setError('Tệp không đọc được như một văn bản Word. Kiểm tra lại tệp rồi chọn lại.');
      return;
    }
    if (left.length > 0) {
      setError(
        `Tệp còn chỗ trống chưa điền: ${left.slice(0, 6).join(', ')}${left.length > 6 ? '…' : ''}. Đây là mẫu gốc — tải Word đã điền về, sửa rồi tải lên lại.`,
      );
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) return;
    if (!reason.trim()) {
      setError('Vui lòng ghi đã sửa gì trong Word.');
      return;
    }
    setError(null);
    try {
      await upload.mutateAsync({ quoteId: quote.id, file, reason });
      setDone(true);
      setFile(null);
      setReason('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <section className="space-y-2 rounded-sm border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Bản đã sửa trong Word</h3>
        <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden /> Tải lên bản đã sửa trong Word
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          aria-label="Chọn tệp Word đã sửa"
          onChange={(e) => void choose(e.target.files?.[0] ?? null)}
        />
      </div>
      <p className="text-xs text-fg-subtle">
        Bản tải lên phải giữ nguyên số tiền đã duyệt — hệ thống không đọc ngược tệp Word. Từ lúc tải
        lên, Zalo, email và «Tải» gửi đúng tệp Word này.
      </p>
      {file && (
        <div className="space-y-2">
          <p>
            Tệp: <span className="font-medium">{file.name}</span>
          </p>
          <Field label="Đã sửa gì" required>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Ví dụ: thêm bảng tiến độ giao hàng theo yêu cầu khách"
              className={TEXTAREA_BOX}
            />
          </Field>
          <Button
            size="sm"
            variant="primary"
            disabled={upload.isPending}
            onClick={() => void submit()}
          >
            {upload.isPending ? 'Đang tải lên…' : 'Lưu bản đã sửa'}
          </Button>
        </div>
      )}
      {done && <p role="status">Đã lưu bản sửa trong Word — gửi khách sẽ dùng tệp này.</p>}
      {error && <p className="text-status-overdue">{error}</p>}
      {uploads.length > 0 && (
        <ul className="text-xs text-fg-subtle">
          {uploads.map((u) => (
            <li key={u.id}>
              Bản {u.version} · {formatDateTime(u.created_at)}
              {u.creator ? ` · ${u.creator.full_name}` : ''} · {u.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TextChangeHistory({ quoteId }: { quoteId: string }) {
  const { data = [] } = useQuoteTextChanges(quoteId);
  if (data.length === 0) return null;
  return (
    <details className="rounded-sm border border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">
        Lịch sử sửa câu chữ ({data.length} lần gần nhất)
      </summary>
      <ul className="mt-2 space-y-1">
        {data.map((c) => (
          <li key={c.id}>
            <span className="text-fg-subtle">
              {formatDateTime(c.changed_at)}
              {c.changer ? ` · ${c.changer.full_name}` : ''} ·{' '}
            </span>
            {QUOTE_TEXT_LABELS[c.field] ?? c.field}:{' '}
            {c.new_value ? `«${c.new_value.slice(0, 120)}»` : 'quay về câu mặc định'}
          </li>
        ))}
      </ul>
    </details>
  );
}

function QuoteEmailDialog({
  quote,
  bundle,
  file,
  onClose,
}: {
  quote: QuoteRecord;
  bundle: QuoteDocumentBundle;
  file: CustomerFile;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { template } = useQuoteMessageTemplate(quote.company_id, 'email');
  const values = quoteMessageValues(quote, bundle);
  const initialSubject = fillMessageTemplate(template.subject ?? '', values);
  const initialBody = fillMessageTemplate(
    file.kind === 'docx'
      ? template.body.replace('dưới dạng PDF', 'dưới dạng tệp Word')
      : template.body,
    values,
  );
  const [to, setTo] = useState(bundle.customerEmail ?? '');
  const [subject, setSubject] = useState(initialSubject.text);
  const [body, setBody] = useState(initialBody.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SendEmailResult | null>(null);
  const missing = [...new Set([...initialSubject.missing, ...initialBody.missing])];

  async function viewFile() {
    try {
      const blob = await file.load();
      if (file.kind === 'pdf') openBlob(blob);
      else saveBlob(blob, file.name);
    } catch {
      setError('Không mở được tệp đính kèm. Tải lại trang rồi thử lại.');
    }
  }

  async function send() {
    setError(null);
    if (!isEmailAddress(to)) {
      setError('Địa chỉ email người nhận chưa đúng dạng. Kiểm tra lại rồi gửi.');
      return;
    }
    setBusy(true);
    try {
      const blob = await file.load();
      const result = await sendEmail({
        entityType: 'quotes',
        entityId: quote.id,
        to: to.trim(),
        subject,
        body,
        attachment: { name: file.name, bytes: new Uint8Array(await blob.arrayBuffer()) },
      });
      setDone(result);
      void queryClient.invalidateQueries({ queryKey: ['outbound-shares', 'quotes', quote.id] });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: ['opportunity_stage_history'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gửi được email. Thử lại sau ít phút.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Gửi báo giá qua email" onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          {done.fake ? (
            <p
              role="status"
              className="rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2 font-medium"
            >
              Đã giả lập gửi email tới {to.trim()} — chưa có thư nào đi thật. Hệ thống chưa cấu hình
              máy chủ email; tải tệp báo giá và gửi bằng email của mình nếu cần gửi ngay.
            </p>
          ) : (
            <p
              role="status"
              className="rounded-sm border border-status-completed bg-status-completed-bg px-3 py-2 font-medium"
            >
              Đã gửi email tới {to.trim()} lúc {formatDateTime(done.sent_at)}, kèm «{file.name}».
            </p>
          )}
          {done.marked_sent && (
            <p>Báo giá đã đánh dấu «Đã gửi khách»; cơ hội sang bước Đàm phán nếu đang ở Báo giá.</p>
          )}
          {done.mark_error && (
            <p className="text-status-overdue">
              Chưa đánh dấu được «Đã gửi khách»: {done.mark_error} Bấm «Gửi cho khách hàng» trên thẻ
              báo giá.
            </p>
          )}
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Xong
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <Field label="Gửi tới" required hint="Chỉ dùng cho lần gửi này, không sửa hồ sơ khách.">
            <Input
              inputMode="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="khachhang@example.com"
              autoFocus={!to}
            />
          </Field>
          <Field label="Tiêu đề" required>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Nội dung" required hint="Sửa ở đây chỉ áp cho lần gửi này.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className={TEXTAREA_BOX}
            />
          </Field>
          {missing.length > 0 && (
            <p className="rounded-sm bg-status-pending-bg px-3 py-2">
              Còn chỗ để dải chấm vì chưa có dữ liệu:{' '}
              {missing.map((k) => PLACEHOLDER_LABEL[k] ?? k).join('; ')}. Sửa trong nội dung trước
              khi gửi.
            </p>
          )}
          <p>
            Kèm tệp:{' '}
            <button
              type="button"
              className="font-medium text-brand underline-offset-2 hover:underline"
              onClick={() => void viewFile()}
            >
              {file.name}
            </button>
          </p>
          {file.kind === 'docx' && (
            <p className="text-xs text-fg-subtle">
              Kèm tệp Word vì báo giá đang dùng bản sửa trong Word — hệ thống không đổi Word sang
              PDF được.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="subtle" onClick={onClose} disabled={busy}>
              Huỷ
            </Button>
            <Button
              variant="primary"
              onClick={() => void send()}
              disabled={busy || !to.trim() || !subject.trim() || !body.trim()}
            >
              {busy ? 'Đang gửi…' : 'Gửi email'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
