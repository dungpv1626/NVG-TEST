/**
 * «Gửi qua Zalo» dùng chung (anh Dũng 28/10/2026, «cách 1»): gửi cho khách bằng Zalo CÁ NHÂN của nhân viên.
 *
 * Zalo không có API cho tài khoản cá nhân và dự án không tự động hoá Zalo. Hệ thống chỉ:
 *  - soạn sẵn lời nhắn (người gửi sửa được, có xem trước);
 *  - điện thoại: mở bảng chia sẻ của máy kèm lời nhắn (và tệp nếu máy cho) — người dùng chọn Zalo;
 *  - máy tính: chép lời nhắn vào bộ nhớ tạm, mở `zalo.me/<số>` ở tab mới, tải tệp về để kéo vào khung chat.
 * Người dùng TỰ bấm gửi trong Zalo — nên màn hình chỉ nói «đã mở Zalo để gửi», và lịch sử (0238) chỉ ghi lần mở.
 *
 * Nút chỉ hiện cho người gửi được hồ sơ (`canSend`, CLAUDE.md 5.4); CSDL chặn lần nữa khi ghi lịch sử.
 */

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { formatDateTime, formatPhone } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  useOutboundShares,
  useRecordOutboundShare,
  type OutboundEntityType,
} from '@/hooks/use-outbound-shares';
import { detectZaloSendMode, normalizeZaloPhone, zaloChatUrl } from '@/lib/zalo-share';

export interface ZaloSendFile {
  name: string;
  /** Tải tệp khi mở hộp thoại — điện thoại cần tệp sẵn trong tay lúc bấm «Chia sẻ». */
  load: () => Promise<Blob>;
}

export interface ZaloSendProps {
  /** Người sửa được / chịu trách nhiệm hồ sơ — không có quyền thì không hiện gì. */
  canSend: boolean;
  entityType: OutboundEntityType;
  entityId: string;
  /** Số của khách trong hồ sơ; trống vẫn gửi được (mở Zalo không kèm số, hoặc nhập tại chỗ). */
  phone?: string | null;
  /** Lời nhắn soạn sẵn — đã gồm link có hạn nếu có. */
  message: string;
  /** Link có hạn đã dùng trong lời nhắn (ghi vào lịch sử). */
  shareLinkId?: string | null;
  file?: ZaloSendFile | null;
  label?: string;
  size?: 'sm' | 'md';
  /** Hiện danh sách nhỏ các lần đã mở Zalo ngay dưới nút. */
  showHistory?: boolean;
}

export function ZaloSend({
  canSend,
  showHistory = true,
  label = 'Gửi qua Zalo',
  size = 'md',
  ...props
}: ZaloSendProps) {
  const [open, setOpen] = useState(false);
  if (!canSend) return null;
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
        <MessageCircle aria-hidden /> {label}
      </Button>
      {showHistory && <ZaloShareHistory entityType={props.entityType} entityId={props.entityId} />}
      {open && <ZaloSendDialog {...props} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Các lần đã mở Zalo để gửi hồ sơ này — ba lần gần nhất. */
export function ZaloShareHistory({
  entityType,
  entityId,
}: {
  entityType: OutboundEntityType;
  entityId: string;
}) {
  const { data: all = [] } = useOutboundShares(entityType, entityId);
  // Email do hệ thống gửi (0239) có khối lịch sử riêng.
  const data = all.filter((s) => s.channel === 'zalo');
  if (data.length === 0) return null;
  const shown = data.slice(0, 3);
  return (
    <div className="text-xs text-fg-subtle">
      <p className="font-medium">Đã mở Zalo để gửi</p>
      <ul>
        {shown.map((s) => (
          <li key={s.id}>
            {formatDateTime(s.created_at)}
            {s.creator ? ` · ${s.creator.full_name}` : ''}
            {s.recipient ? ` · tới ${formatPhone(s.recipient)}` : ' · chưa có số'}
            {s.file_name ? ` · kèm ${s.file_name}` : ''}
          </li>
        ))}
      </ul>
      {data.length > shown.length && <p>và {data.length - shown.length} lần trước đó</p>}
    </div>
  );
}

type Done = { copied: boolean; downloaded: string | null; fileSkipped: boolean };

function ZaloSendDialog({
  entityType,
  entityId,
  phone,
  message,
  shareLinkId = null,
  file = null,
  onClose,
}: Omit<ZaloSendProps, 'canSend' | 'showHistory' | 'label' | 'size'> & { onClose: () => void }) {
  const mode = useState(detectZaloSendMode)[0];
  const record = useRecordOutboundShare();
  const [phoneInput, setPhoneInput] = useState(formatPhone(phone ?? ''));
  const [text, setText] = useState(message);
  const [loaded, setLoaded] = useState<File | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const normalized = normalizeZaloPhone(phoneInput);
  const phoneTyped = phoneInput.trim() !== '';

  // Esc đóng hộp này mà không đóng hộp thoại bên dưới (hộp tạo link vẫn mở sau lưng).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Tải tệp ngay khi mở: bảng chia sẻ của điện thoại phải được gọi liền sau cú bấm, không chờ mạng.
  // Nơi gọi thường dựng lại `file` mỗi lần vẽ — tải theo tên tệp, không theo đối tượng.
  const fileRef = useRef(file);
  fileRef.current = file;
  const fileName = file?.name ?? null;
  useEffect(() => {
    const f = fileRef.current;
    if (!f) return;
    let cancelled = false;
    f.load()
      .then((blob) => {
        if (!cancelled) setLoaded(new File([blob], f.name, { type: blob.type || undefined }));
      })
      .catch(() => {
        if (!cancelled)
          setLoadError('Không tải được tệp để gửi. Kiểm tra kết nối mạng rồi mở lại.');
      });
    return () => {
      cancelled = true;
    };
  }, [fileName]);

  async function writeHistory(via: 'bang_chia_se' | 'zalo_web', sentFile: boolean) {
    try {
      await record.mutateAsync({
        entityType,
        entityId,
        via,
        recipient: normalized,
        fileName: sentFile && file ? file.name : null,
        shareLinkId,
      });
    } catch {
      setRecordError(true);
    }
  }

  function download(f: File) {
    const href = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = href;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }

  async function openDesktop() {
    setError(null);
    // Mở tab ngay trong cú bấm — để sau một lượt chờ thì trình duyệt chặn cửa sổ bật lên.
    window.open(zaloChatUrl(normalized), '_blank', 'noopener,noreferrer');
    setBusy(true);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
    let downloaded: string | null = null;
    if (loaded) {
      download(loaded);
      downloaded = loaded.name;
    }
    await writeHistory('zalo_web', Boolean(downloaded));
    setBusy(false);
    setDone({ copied, downloaded, fileSkipped: Boolean(file) && !downloaded });
  }

  async function shareTouch() {
    setError(null);
    const data: ShareData = { text };
    const withFile =
      loaded !== null &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [loaded] });
    if (withFile) data.files = [loaded!];
    setBusy(true);
    try {
      await navigator.share(data);
    } catch (e) {
      setBusy(false);
      // Người dùng đóng bảng chia sẻ — không phải lỗi, không ghi lịch sử.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Không mở được bảng chia sẻ. Thử lại, hoặc chép lời nhắn và gửi tay trong Zalo.');
      return;
    }
    // Máy không chia sẻ được tệp: lời nhắn đã đi qua bảng chia sẻ, tệp tải về để đính kèm tay.
    let downloaded: string | null = null;
    if (loaded && !withFile) {
      download(loaded);
      downloaded = loaded.name;
    }
    await writeHistory('bang_chia_se', withFile || Boolean(downloaded));
    setBusy(false);
    setDone({ copied: true, downloaded, fileSkipped: Boolean(file) && !loaded });
  }

  const waitingFile = file !== null && loaded === null && loadError === null;
  const primaryLabel = mode === 'touch' ? 'Chia sẻ' : 'Mở Zalo';

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
        aria-labelledby="zalo-send-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card bg-surface p-5 shadow-overlay"
      >
        <h2 id="zalo-send-title" className="text-md font-semibold">
          Gửi qua Zalo
        </h2>

        {done ? (
          <div className="mt-3 space-y-3 text-sm">
            <p role="status" className="font-medium">
              {mode === 'touch'
                ? 'Đã mở bảng chia sẻ để gửi. Tin chỉ đi khi bấm gửi trong Zalo.'
                : 'Đã mở Zalo để gửi ở tab mới. Tin chỉ đi khi bấm gửi trong Zalo.'}
            </p>
            {mode === 'desktop' && done.copied && (
              <p>Lời nhắn đã chép sẵn — bấm vào khung chat Zalo rồi dán (Ctrl+V).</p>
            )}
            {mode === 'desktop' && !normalized && (
              <p>Chưa có số của khách — tìm khách trong Zalo theo tên hoặc số rồi dán lời nhắn.</p>
            )}
            {done.downloaded && (
              <p>Tệp «{done.downloaded}» đã tải về máy — kéo tệp vừa tải vào khung chat Zalo.</p>
            )}
            {done.fileSkipped && (
              <p className="text-status-overdue">Chưa tải được tệp — lời nhắn đi không kèm tệp.</p>
            )}
            {!done.copied && (
              <div className="space-y-1">
                <p>Chưa chép được tự động — chọn hết chữ dưới đây rồi chép (Ctrl+C):</p>
                <textarea
                  readOnly
                  value={text}
                  rows={5}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
                />
              </div>
            )}
            {recordError && (
              <p className="text-fg-subtle">
                Không ghi được lịch sử lần gửi này — việc gửi trong Zalo không bị ảnh hưởng.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              {mode === 'desktop' && (
                <Button
                  variant="subtle"
                  onClick={() =>
                    window.open(zaloChatUrl(normalized), '_blank', 'noopener,noreferrer')
                  }
                >
                  Mở lại Zalo
                </Button>
              )}
              <Button variant="primary" onClick={onClose}>
                Xong
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <Field
              label="Số Zalo của khách"
              optional
              hint="Chỉ dùng cho lần gửi này, không sửa hồ sơ khách."
            >
              <Input
                value={phoneInput}
                inputMode="tel"
                onChange={(e) => setPhoneInput(e.target.value)}
              />
            </Field>
            {phoneTyped && !normalized && (
              <p className="text-status-overdue">
                Số chưa đúng dạng số Việt Nam (10 chữ số, bắt đầu bằng 0) — Zalo sẽ mở trang chính.
              </p>
            )}
            <Field label="Lời nhắn">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
              />
            </Field>
            <div>
              <p className="text-xs font-medium text-fg-subtle">Xem trước</p>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-card bg-surface-sunken px-3 py-2">
                {text}
              </p>
            </div>
            {file && (
              <p>
                Kèm tệp: <span className="font-medium">{file.name}</span>
                {waitingFile && <span className="text-fg-subtle"> — đang chuẩn bị tệp…</span>}
              </p>
            )}
            {loadError && <p className="text-status-overdue">{loadError}</p>}
            <p className="text-fg-subtle">
              {mode === 'touch'
                ? 'Bấm «Chia sẻ», chọn Zalo, chọn đúng khách rồi bấm gửi trong Zalo.'
                : normalized
                  ? 'Bấm «Mở Zalo»: lời nhắn được chép sẵn và cửa sổ chat với số này mở ở tab mới — dán (Ctrl+V) rồi bấm gửi trong Zalo.'
                  : 'Chưa có số của khách: Zalo mở trang chính — tìm khách theo tên hoặc số, dán lời nhắn (Ctrl+V) rồi bấm gửi.'}
              {mode === 'desktop' &&
                file &&
                ' Tệp được tải về máy — kéo tệp vừa tải vào khung chat Zalo.'}
            </p>
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
                disabled={busy || text.trim() === '' || (mode === 'touch' && waitingFile)}
                onClick={() => void (mode === 'touch' ? shareTouch() : openDesktop())}
              >
                {busy ? 'Đang mở…' : primaryLabel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
