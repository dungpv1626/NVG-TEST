/**
 * Ảnh từ BẢN VẼ KỸ SƯ (T114 Đợt 4, 03/10/2026) — Haan: ảnh mặt bằng có nội thất và ảnh mặt đứng có
 * vật liệu vẽ được «dựa trên bản vẽ do AI tạo hoặc bản vẽ do kỹ sư chỉnh sửa (hoặc tự tạo)».
 *
 * Kỹ sư lấy DXF của AI về sửa trên AutoCAD, xuất ra PNG / JPG / PDF rồi tải lên đây. Trình duyệt
 * chuẩn hoá về một trong ba khung mô hình ảnh nhận (`lib/drawing-upload.ts`), cắt lề nếu cần.
 *
 * ── Ba thứ màn hình BẮT BUỘC ─────────────────────────────────────────────────────────────
 *  · **Khung tên.** Bản vẽ thật mang tên chủ nhà, địa chỉ, mã hồ sơ (dữ liệu hạng 1, T12). Có ô cắt
 *    lề và XEM TRƯỚC đúng tấm sẽ gửi; ô xác nhận bắt buộc — máy chủ cũng chặn khi thiếu.
 *  · **Giá trước khi bấm**, và hỏi lại khi vẽ lại một bản đã có ảnh.
 *  · **Nhãn hai lớp** trên ảnh vẽ ra (in lên pixel + dòng chữ), như mọi ảnh của nhánh AI.
 */

import { formatDateTime } from '@nvg/shared';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { FIELD_BOX } from '@/components/ui/field-box';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import {
  useDesignImage,
  useDrawFromUpload,
  useUploadDrawing,
  useUploadedDrawings,
  type UploadedDrawingItem,
  type UploadedDrawingKind,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  isPdf,
  normaliseDrawing,
  NO_CROP,
  pdfPageCount,
  type CropPercent,
} from '@/lib/drawing-upload';
import { Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { AiUsageLine } from './ai-usage';

const TEXT: Record<
  UploadedDrawingKind,
  { title: string; lead: string; draw: string; disclaimer: string; file: string }
> = {
  plan: {
    title: 'Ảnh nội thất từ bản vẽ của kỹ sư',
    lead: 'Tải mặt bằng một tầng (PNG, JPG hoặc PDF) để AI vẽ thành ảnh nội thất.',
    draw: 'Vẽ ảnh nội thất từ bản này',
    disclaimer: AI_DISCLAIMERS.aiSheetImage,
    file: 'mat-bang-noi-that',
  },
  facade: {
    title: 'Ảnh mặt đứng từ bản vẽ của kỹ sư',
    lead: 'Tải mặt đứng mặt tiền (PNG, JPG hoặc PDF) để AI vẽ thành ảnh có vật liệu và màu.',
    draw: 'Vẽ ảnh mặt đứng từ bản này',
    disclaimer: AI_DISCLAIMERS.aiFacadeImage,
    file: 'mat-dung-vat-lieu',
  },
};

const CROP_SIDES: Array<[keyof CropPercent, string]> = [
  ['top', 'Trên'],
  ['right', 'Phải'],
  ['bottom', 'Dưới'],
  ['left', 'Trái'],
];

export function AiUploadPanel({
  projectId,
  drawing,
  readOnly,
  disabled = false,
  bare = false,
}: {
  projectId: string;
  drawing: UploadedDrawingKind;
  readOnly: boolean;
  /** Đang có lượt chạy khác — không cho bấm chồng lên. */
  disabled?: boolean;
  /** Nhúng trong khung khác (khung gộp «Ảnh mặt bằng có nội thất»): không tự vẽ khung và tiêu đề. */
  bare?: boolean;
}): React.ReactElement {
  const text = TEXT[drawing];
  const list = useUploadedDrawings(projectId, drawing);
  const image = useAiChoice('image', false, 2, `upload-${drawing}`);
  const draw = useDrawFromUpload();
  const [asking, setAsking] = useState<UploadedDrawingItem | null>(null);
  const [drawingId, setDrawingId] = useState<string | null>(null);

  const run = (item: UploadedDrawingItem) => {
    if (!image.choice.route) return;
    setDrawingId(item.uploadId);
    void draw
      .mutateAsync({ projectId, uploadId: item.uploadId, drawing, route: image.choice.route })
      .catch(() => undefined)
      .finally(() => setDrawingId(null));
  };

  const body = (
    <>
      <p className="mb-3 text-fg-subtle">{text.lead}</p>

      {!readOnly && <UploadForm projectId={projectId} drawing={drawing} />}

      <div className="mt-4">
        {!readOnly && (
          <div className="mb-3">
            <AiModePicker
              kind="image"
              choice={image.choice}
              options={image.options}
              onMode={image.pickMode}
              onRoute={image.pickRoute}
              allowSolver={false}
              disabled={draw.isPending || disabled}
            />
          </div>
        )}
        {draw.isError && <p className="mb-3 text-status-overdue">{toUserMessage(draw.error)}</p>}
        <AiUsageLine usage={draw.data?.usage ?? null} className="mb-3" />

        {list.isLoading && <Skeleton className="h-24 w-full" />}
        {list.error && <p className="text-status-overdue">{toUserMessage(list.error)}</p>}
        {list.data && list.data.items.length === 0 && (
          <p className="text-fg-subtle">Chưa có bản vẽ nào được tải lên.</p>
        )}
        <ul className="space-y-4">
          {list.data?.items.map((item) => (
            <UploadedItem
              key={item.uploadId}
              projectId={projectId}
              item={item}
              text={text}
              readOnly={readOnly}
              busy={drawingId === item.uploadId}
              canDraw={!draw.isPending && !disabled && Boolean(image.choice.route)}
              onDraw={() => (item.imageArtifactId ? setAsking(item) : run(item))}
            />
          ))}
        </ul>
      </div>

      {asking && (
        <ConfirmDialog
          title="Vẽ lại ảnh từ bản này?"
          confirmLabel="Vẽ lại"
          cancelLabel="Thôi"
          className="border-tk-line bg-tk-panel text-tk-tx"
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const item = asking;
            setAsking(null);
            run(item);
          }}
        >
          <p>
            Bản vẽ này đã có ảnh. Mỗi lần vẽ là một lượt gọi tính tiền, và mô hình ảnh không tất
            định nên tấm mới sẽ khác tấm cũ chứ không đẹp hơn một cách chắc chắn.
          </p>
        </ConfirmDialog>
      )}
    </>
  );

  return bare ? <div>{body}</div> : <Panel title={text.title}>{body}</Panel>;
}

function UploadForm({
  projectId,
  drawing,
}: {
  projectId: string;
  drawing: UploadedDrawingKind;
}): React.ReactElement {
  const upload = useUploadDrawing();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState(1);
  const [crop, setCrop] = useState<CropPercent>(NO_CROP);
  const [note, setNote] = useState('');
  const [cleared, setCleared] = useState(false);
  const [preview, setPreview] = useState<{ base64: string; width: number; height: number } | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Đọc số trang khi chọn PDF.
  useEffect(() => {
    setPage(1);
    setPages(1);
    if (!file || !isPdf(file)) return;
    let cancelled = false;
    void pdfPageCount(file)
      .then((n) => !cancelled && setPages(n))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Xem trước ĐÚNG tấm sẽ gửi — dựng lại khi đổi trang hay đổi phần cắt. Hoãn một nhịp để gõ số
  // cắt không dựng lại sau mỗi phím.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!file) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void normaliseDrawing(file, { page, crop })
        .then((out) => !cancelled && setPreview(out))
        .catch((error: unknown) => !cancelled && setPreviewError(toUserMessage(error)));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [file, page, crop]);

  const submit = () => {
    if (!preview || !cleared) return;
    setDone(false);
    void upload
      .mutateAsync({
        projectId,
        drawing,
        level: drawing === 'plan' ? level : null,
        note: note.trim() || null,
        identityCleared: cleared,
        imageBase64: preview.base64,
      })
      .then(() => {
        setFile(null);
        setCrop(NO_CROP);
        setNote('');
        setCleared(false);
        setDone(true);
      })
      .catch(() => undefined);
  };

  return (
    <div className="space-y-3 rounded-md border border-tk-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-fg-subtle">Tệp bản vẽ (PNG, JPG, PDF)</p>
          {/* Ô tệp gốc ẨN: nó tự sinh chữ tiếng Anh («Choose File», «No file chosen») theo ngôn ngữ
              trình duyệt (CLAUDE.md 4.1). Nút và tên tệp là chữ của chúng ta. */}
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
            className="hidden"
            onChange={(event) => {
              setDone(false);
              setFile(event.target.files?.[0] ?? null);
              // Chọn lại đúng tệp vừa chọn vẫn phải bắn `change`.
              event.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" aria-hidden />
              {file ? 'Chọn tệp khác' : 'Chọn tệp bản vẽ'}
            </Button>
            <span className="text-fg-subtle">{file ? file.name : 'Chưa chọn tệp nào'}</span>
          </div>
        </div>
        {file && isPdf(file) && pages > 1 && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-subtle">Trang</span>
            <select
              value={page}
              onChange={(event) => setPage(Number(event.target.value))}
              className={FIELD_BOX}
            >
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Trang {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {drawing === 'plan' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-subtle">Tầng</span>
            <select
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
              className={FIELD_BOX}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Tầng {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {file && (
        <>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-fg-subtle">
              Cắt bỏ lề (phần trăm mỗi cạnh) — dùng để bỏ khung tên
            </legend>
            <div className="flex flex-wrap gap-3">
              {CROP_SIDES.map(([side, label]) => (
                <label key={side} className="flex items-center gap-2">
                  <span>{label}</span>
                  <Input
                    inputMode="numeric"
                    className="w-20"
                    aria-label={`Cắt bỏ cạnh ${label.toLocaleLowerCase('vi-VN')}`}
                    value={crop[side] ? String(crop[side]) : ''}
                    placeholder="0"
                    onChange={(event) => {
                      const value = Number(event.target.value.replace(/[^0-9]/g, '') || 0);
                      setCrop((prev) => ({ ...prev, [side]: Math.min(45, value) }));
                    }}
                  />
                  <span className="text-fg-subtle">%</span>
                </label>
              ))}
            </div>
          </fieldset>

          {!preview && !previewError && <Skeleton className="h-64 w-full" />}
          {previewError && <p className="text-status-overdue">{previewError}</p>}
          {preview && (
            <div>
              <p className="mb-1 text-xs text-fg-subtle">Xem trước tấm sẽ gửi đi.</p>
              <img
                src={`data:image/png;base64,${preview.base64}`}
                alt="Xem trước bản vẽ sẽ tải lên"
                className="max-h-96 rounded-md border border-tk-line bg-white"
              />
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-subtle">
              Ghi chú (tùy chọn) — chỉ để nhận ra bản vẽ, không gửi cho mô hình
            </span>
            <Input
              value={note}
              maxLength={200}
              placeholder="Ví dụ: sau khi sửa WC tầng 2"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <label className="flex min-h-10 items-start gap-2">
            <input
              type="checkbox"
              checked={cleared}
              onChange={(event) => setCleared(event.target.checked)}
              className="mt-1"
            />
            <span>
              Đã bỏ khung tên và mọi thông tin chủ nhà (tên, địa chỉ, số điện thoại, mã hồ sơ) khỏi
              bản vẽ. Tấm xem trước ở trên sẽ được gửi cho nhà cung cấp mô hình ảnh.
            </span>
          </label>

          <Button
            variant="secondary"
            onClick={submit}
            disabled={!preview || !cleared || upload.isPending}
          >
            <Upload className="size-4" aria-hidden />
            {upload.isPending ? 'Đang tải lên…' : 'Tải bản vẽ lên'}
          </Button>
        </>
      )}
      {upload.isError && <p className="text-status-overdue">{toUserMessage(upload.error)}</p>}
      {done && (
        <p className="text-status-completed">Đã tải bản vẽ lên. Không gọi AI, không tốn tiền.</p>
      )}
    </div>
  );
}

function UploadedItem({
  projectId,
  item,
  text,
  readOnly,
  busy,
  canDraw,
  onDraw,
}: {
  projectId: string;
  item: UploadedDrawingItem;
  text: (typeof TEXT)[UploadedDrawingKind];
  readOnly: boolean;
  busy: boolean;
  canDraw: boolean;
  onDraw: () => void;
}): React.ReactElement {
  const source = useDesignImage(`/design/ai/uploads/${projectId}/${item.uploadId}/file`);
  // Đường dẫn ảnh đổi theo mã tấm mới nhất — vẽ xong, danh sách tải lại, mã đổi, ảnh tải lại.
  const drawn = useDesignImage(
    item.imageArtifactId
      ? `/design/ai/uploads/${projectId}/${item.uploadId}/image?v=${item.imageArtifactId}`
      : null,
  );

  const label = [
    item.drawing === 'plan' ? `Tầng ${item.level ?? 1}` : 'Mặt đứng mặt tiền',
    `tải lên ${formatDateTime(item.createdAt)}`,
    item.note,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="rounded-md border border-tk-line p-3">
      <p className="mb-2 font-medium">{label}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-fg-subtle">Bản vẽ đã tải lên</p>
          {source.loading && <Skeleton className="h-48 w-full" />}
          {source.error && <p className="text-status-overdue">{source.error}</p>}
          {source.url && (
            <img
              src={source.url}
              alt={`Bản vẽ kỹ sư — ${label}`}
              className="w-full rounded-md border border-tk-line bg-white"
            />
          )}
        </div>
        <div>
          <p className="mb-1 text-xs text-fg-subtle">Ảnh do AI vẽ</p>
          {(busy || drawn.loading) && <Skeleton className="h-48 w-full" />}
          {drawn.error && <p className="text-status-overdue">{drawn.error}</p>}
          {!busy && !drawn.loading && !item.imageArtifactId && (
            <p className="text-fg-subtle">Chưa có ảnh.</p>
          )}
          {!busy && drawn.url && (
            <>
              <img
                src={drawn.url}
                alt={`Ảnh do AI vẽ — ${label}`}
                className="w-full rounded-md border border-tk-line bg-white"
              />
              <a
                href={drawn.url}
                download={`${text.file}-${item.uploadId.slice(7, 15)}.png`}
                className="mt-2 inline-block underline"
              >
                Tải ảnh
              </a>
            </>
          )}
        </div>
      </div>
      {!readOnly && (
        <Button className="mt-3" onClick={onDraw} disabled={!canDraw || busy}>
          <ImageIcon className="size-4" aria-hidden />
          {busy ? 'Đang vẽ…' : text.draw}
        </Button>
      )}
    </li>
  );
}
