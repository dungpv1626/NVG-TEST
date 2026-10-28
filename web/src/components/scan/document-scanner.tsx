/**
 * Bộ quét tài liệu dùng chung: chụp / chọn ảnh từng trang → kéo 4 góc → nắn thẳng, làm rõ chữ
 * → một tệp PDF khổ A4.
 *
 * Anh Dũng 22/10/2026: Kinh doanh đưa sếp ký, đóng dấu trên giấy rồi cần một bản quét gọn để
 * báo cáo, gửi khách, lưu trữ. Chọn kéo góc bằng tay (không tải thư viện nhận mép ~8 MB) và xử lý
 * hẳn trên máy — ảnh gốc không rời máy, không gọi AI.
 *
 * Bộ quét KHÔNG biết hồ sơ nào: trả về một `File` PDF, nơi gọi tự tải lên kho của nó (hợp đồng,
 * phiếu khảo sát…). Hộp nằm trong portal, lớp trên mọi hộp thoại khác; phím Esc bị chặn để không
 * đóng nhầm hộp bên dưới và mất các trang đã chụp.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Camera,
  FileText,
  ImagePlus,
  RotateCw,
  ScanSearch,
  Spline,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { buildPdf, type ScanPage } from '@/lib/scan/build-pdf';
import { deskewAngle } from '@/lib/scan/deskew';
import { detectPaper } from '@/lib/scan/detect';
import { isBlurry, SHARPNESS_SIDE, sharpnessOfImage } from '@/lib/scan/quality';
import { enhance, SCAN_MODE_LABELS, type ScanMode } from '@/lib/scan/enhance';
import {
  bezierControl,
  defaultQuad,
  followCorners,
  hasBentEdge,
  MAX_PAGE_SIDE,
  pageSize,
  rotateQuadClockwise,
  straightMids,
  warpQuad,
  type EdgeMids,
  type Quad,
} from '@/lib/scan/perspective';
import { cn } from '@/lib/utils';

/** Ảnh nguồn thu về cạnh dài này trước khi kéo góc — đủ cho trang 2.000 px, nhẹ cho điện thoại. */
const SOURCE_MAX_SIDE = 4000;
const THUMB_SIDE = 320;
/** Cỡ bản nhỏ dùng đo góc dòng chữ. */
const DESKEW_SIDE = 900;
/** Tìm mép trên ảnh thu nhỏ — đủ chính xác cho gợi ý góc, nhanh trên điện thoại. */
const DETECT_SIDE = 480;

type QuadSource = 'auto' | 'default' | 'manual';

/** Vùng mặt bàn trên ảnh thu nhỏ (`k` = cỡ nhỏ / cỡ nguồn) — tô trắng khi nắn trang. */
interface OutsideMask {
  mask: Uint8Array;
  width: number;
  height: number;
  k: number;
}

/** 4 góc + điểm giữa cạnh gợi ý + vùng mặt bàn, theo toạ độ ảnh nguồn; `null` khi máy không chắc. */
function autoDetect(
  source: HTMLCanvasElement,
): { quad: Quad; mids: EdgeMids; outside: OutsideMask } | null {
  const k = Math.min(1, DETECT_SIDE / Math.max(source.width, source.height));
  const c = canvasOf(Math.round(source.width * k), Math.round(source.height * k));
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const r = detectPaper(ctx.getImageData(0, 0, c.width, c.height));
  if (!r) return null;
  return {
    quad: r.quad.map((p) => ({ x: p.x / k, y: p.y / k })) as Quad,
    mids: r.mids.map((p) => ({ x: p.x / k, y: p.y / k })) as EdgeMids,
    outside: { mask: r.outside, width: r.width, height: r.height, k },
  };
}

/** Kết quả tìm giấy → các trường của trang (không tìm được thì góc mặc định, không tô). */
function detectedFields(source: HTMLCanvasElement) {
  const r = autoDetect(source);
  return r
    ? { quad: r.quad, mids: r.mids, outside: r.outside, quadSource: 'auto' as const }
    : {
        quad: defaultQuad(source.width, source.height),
        mids: straightMids(defaultQuad(source.width, source.height)),
        outside: null,
        quadSource: 'default' as const,
      };
}

/** Đo độ nét trên bản thu về cạnh dài cố định (ngưỡng không đổi theo máy ảnh). */
function blurryPhoto(source: HTMLCanvasElement): boolean {
  const k = Math.min(1, SHARPNESS_SIDE / Math.max(source.width, source.height));
  const c = canvasOf(Math.round(source.width * k), Math.round(source.height * k));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return isBlurry(sharpnessOfImage(ctx.getImageData(0, 0, c.width, c.height)));
}

/** Thứ tự trang = thứ tự chụp (`lastModified`), cùng thời điểm thì theo tên tệp. */
export function sortByCapture(files: File[]): File[] {
  return [...files].sort(
    (a, b) =>
      a.lastModified - b.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/** Xoay vùng mặt bàn 90° chiều kim đồng hồ cùng ảnh. */
function rotateMask(m: OutsideMask): OutsideMask {
  const { width: w, height: h } = m;
  const mask = new Uint8Array(w * h);
  // Ảnh mới rộng h, cao w: điểm mới (x', y') lấy từ điểm cũ (y', h − 1 − x').
  for (let y = 0; y < w; y++)
    for (let x = 0; x < h; x++) mask[y * h + x] = m.mask[(h - 1 - x) * w + y]!;
  return { mask, width: h, height: w, k: m.k };
}

type Page =
  | {
      id: string;
      kind: 'image';
      source: HTMLCanvasElement;
      sourceUrl: string;
      quad: Quad;
      /** Điểm giữa 4 cạnh — giấy cong thì lệch khỏi trung điểm, viền uốn theo mép. */
      mids: EdgeMids;
      mode: ScanMode;
      thumbUrl: string | null;
      /** 4 góc từ đâu: máy tự tìm, mặc định (không tìm được), hay người dùng đã kéo. */
      quadSource: QuadSource;
      /** Vùng mặt bàn máy tìm được — tô trắng khi nắn (tờ giấy tràn khung). */
      outside: OutsideMask | null;
      /** Ảnh chụp bị mờ (rung tay, lệch nét) — báo chụp lại ngay tại chỗ. */
      blurry: boolean;
    }
  | { id: string; kind: 'pdf'; name: string; bytes: Uint8Array; pageCount: number };

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

async function loadImage(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Trình duyệt không đọc được (thường là HEIC trên máy không phải iPhone).
    const url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('decode'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const k = Math.min(1, SOURCE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const c = canvasOf(Math.round(bitmap.width * k), Math.round(bitmap.height * k));
  const ctx = c.getContext('2d')!;
  // Mặc định trình duyệt thu nhỏ ở chất lượng thấp — chữ nhòe ngay từ đầu.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  if ('close' in bitmap) bitmap.close();
  return c;
}

/** Nắn + làm rõ một trang ra canvas, cạnh dài tối đa `maxSide`. */
function renderPage(page: Extract<Page, { kind: 'image' }>, maxSide: number): HTMLCanvasElement {
  const { width, height } = pageSize(page.quad, maxSide);
  const src = page.source
    .getContext('2d')!
    .getImageData(0, 0, page.source.width, page.source.height);
  const o = page.outside;
  const keep = o
    ? (x: number, y: number) => {
        const mx = Math.min(o.width - 1, Math.max(0, Math.floor(x * o.k)));
        const my = Math.min(o.height - 1, Math.max(0, Math.floor(y * o.k)));
        return !o.mask[my * o.width + mx];
      }
    : undefined;
  // Tờ giấy tràn khung thì 4 góc không nắn được hết độ nghiêng — đo góc dòng chữ trên bản nhỏ,
  // rồi nắn + xoay trong MỘT lần lấy mẫu ở cỡ thật (lấy mẫu hai lần làm chữ nhòe).
  const probeSize = pageSize(page.quad, Math.min(maxSide, DESKEW_SIDE));
  const probe = enhance(
    warpQuad(src, page.quad, probeSize.width, probeSize.height, keep, 0, page.mids),
    page.mode,
  );
  const angle = deskewAngle(probe);
  const out = enhance(warpQuad(src, page.quad, width, height, keep, -angle, page.mids), page.mode);
  const c = canvasOf(width, height);
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c;
}

function toJpeg(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (blob) =>
        blob
          ? void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)))
          : reject(new Error('jpeg')),
      'image/jpeg',
      0.85,
    ),
  );
}

export function DocumentScanner({
  title,
  fileName,
  onDone,
  onCancel,
}: {
  title: string;
  /** Tên tệp PDF trả về (không cần đuôi). */
  fileName: string;
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const [pages, setPages] = useState<Page[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Chặn Esc ở pha bắt: hộp thoại bên dưới nghe Esc để đóng — đóng nhầm là mất các trang đã chụp.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopImmediatePropagation();
    };
    document.addEventListener('keydown', onKey, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previous;
    };
  }, []);

  // Ảnh thu nhỏ của trang đã nắn — cập nhật sau mỗi lần kéo góc / đổi chế độ.
  const pending = pages.filter((p) => p.kind === 'image' && p.thumbUrl === null).map((p) => p.id);
  const pendingKey = pending.join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const timer = setTimeout(() => {
      setPages((all) =>
        all.map((p) =>
          p.kind === 'image' && p.thumbUrl === null
            ? { ...p, thumbUrl: renderPage(p, THUMB_SIDE).toDataURL('image/jpeg', 0.8) }
            : p,
        ),
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [pendingKey]);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const added: Page[] = [];
    // Hộp chọn tệp trả nhiều tệp theo thứ tự riêng của máy (theo tên, hoặc đảo ngược) — ảnh chụp
    // đầu tiên bị xếp xuống cuối (anh Dũng 22/10/2026). Xếp theo thời điểm chụp, trùng thì theo tên.
    for (const file of sortByCapture(Array.from(list))) {
      const id = crypto.randomUUID();
      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { PDFDocument } = await import('pdf-lib');
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          added.push({ id, kind: 'pdf', name: file.name, bytes, pageCount: doc.getPageCount() });
        } else {
          const source = await loadImage(file);
          added.push({
            id,
            kind: 'image',
            source,
            sourceUrl: source.toDataURL('image/jpeg', 0.8),
            ...detectedFields(source),
            blurry: blurryPhoto(source),
            mode: 'document',
            thumbUrl: null,
          });
        }
      } catch {
        setError(
          `Không đọc được tệp «${file.name}». Chụp lại bằng nút «Chụp trang», hoặc chọn ảnh JPG / PNG / tệp PDF.`,
        );
      }
    }
    if (added.length) {
      setPages((all) => {
        setSelected(all.length);
        return [...all, ...added];
      });
    }
  }

  function update(id: string, change: (p: Extract<Page, { kind: 'image' }>) => Partial<Page>) {
    setPages((all) =>
      all.map((p) =>
        p.id === id && p.kind === 'image' ? ({ ...p, ...change(p), thumbUrl: null } as Page) : p,
      ),
    );
  }

  function rotate(id: string) {
    update(id, (p) => {
      const c = canvasOf(p.source.height, p.source.width);
      const ctx = c.getContext('2d')!;
      ctx.translate(c.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(p.source, 0, 0);
      return {
        source: c,
        sourceUrl: c.toDataURL('image/jpeg', 0.8),
        quad: rotateQuadClockwise(p.quad, p.source.height),
        mids: rotateQuadClockwise(p.mids, p.source.height),
        outside: p.outside && rotateMask(p.outside),
      };
    });
  }

  function move(index: number, delta: number) {
    setPages((all) => {
      const next = [...all];
      const j = index + delta;
      if (j < 0 || j >= next.length) return all;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
    setSelected(index + delta);
  }

  function remove(index: number) {
    setPages((all) => all.filter((_, i) => i !== index));
    setSelected((s) => Math.max(0, Math.min(s, pages.length - 2)));
  }

  async function finish() {
    setError(null);
    try {
      const out: ScanPage[] = [];
      for (let i = 0; i < pages.length; i++) {
        setProgress(`Đang xử lý trang ${i + 1} / ${pages.length}…`);
        // Nhường một nhịp để dòng tiến trình kịp vẽ trước khi nắn trang nặng.
        await new Promise((r) => setTimeout(r, 30));
        const p = pages[i]!;
        if (p.kind === 'pdf') {
          out.push({ kind: 'pdf', bytes: p.bytes });
        } else {
          const c = renderPage(p, MAX_PAGE_SIDE);
          out.push({ kind: 'image', jpeg: await toJpeg(c), width: c.width, height: c.height });
        }
      }
      setProgress('Đang ghép tệp PDF…');
      const bytes = await buildPdf(out, title);
      onDone(
        new File([bytes as Uint8Array<ArrayBuffer>], `${fileName}.pdf`, {
          type: 'application/pdf',
        }),
      );
    } catch {
      setError('Không tạo được tệp PDF. Thử bớt trang, hoặc chụp lại trang vừa thêm.');
    } finally {
      setProgress(null);
    }
  }

  const current = pages[selected];
  const totalPages = pages.reduce((n, p) => n + (p.kind === 'pdf' ? p.pageCount : 1), 0);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex flex-col bg-surface"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 text-base font-semibold">{title}</h2>
        <Button variant="subtle" onClick={onCancel} disabled={progress !== null}>
          Huỷ
        </Button>
        <Button
          variant="primary"
          onClick={() => void finish()}
          disabled={pages.length === 0 || progress !== null}
        >
          {progress ?? `Xong — tạo PDF${totalPages ? ` (${totalPages} trang)` : ''}`}
        </Button>
      </header>

      {/* Ô tệp gốc của trình duyệt tự sinh chữ theo ngôn ngữ máy — ẩn, dùng nút tiếng Việt (4.1). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="scan-camera"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        data-testid="scan-files"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
          >
            {error}
          </p>
        )}
        {!current ? (
          <div className="m-auto max-w-md text-center">
            <p className="font-medium">Chưa có trang nào</p>
            <p className="mt-1 text-sm text-fg-subtle">
              Đặt tờ giấy trên mặt phẳng, đủ sáng, chụp thẳng từ trên xuống. Chụp lần lượt từng
              trang; sau đó kéo 4 góc cho khớp mép giấy.
            </p>
          </div>
        ) : current.kind === 'pdf' ? (
          <div className="m-auto flex max-w-md flex-col items-center gap-2 text-center">
            <FileText className="size-10 text-fg-subtle" aria-hidden />
            <p className="font-medium">{current.name}</p>
            <p className="text-sm text-fg-subtle">
              Tệp PDF có sẵn — {current.pageCount} trang, giữ nguyên, không nắn lại.
            </p>
          </div>
        ) : (
          <PageEditor
            page={current}
            onQuad={(quad, mids) =>
              update(current.id, () => ({ quad, mids, quadSource: 'manual' }))
            }
            onDetect={() => update(current.id, (p) => detectedFields(p.source))}
            onMode={(mode) => update(current.id, () => ({ mode }))}
            onRotate={() => rotate(current.id)}
          />
        )}
      </main>

      <footer className="border-t border-border px-4 py-3">
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {pages.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex w-24 shrink-0 flex-col rounded-md border p-1',
                i === selected ? 'border-brand ring-1 ring-brand' : 'border-border',
              )}
            >
              <button
                type="button"
                className="relative flex h-24 items-center justify-center overflow-hidden rounded-sm bg-surface-sunken"
                aria-label={`Trang ${i + 1}`}
                onClick={() => setSelected(i)}
              >
                {p.kind === 'image' && p.blurry && (
                  <span className="absolute left-1 top-1 rounded-sm bg-status-overdue-bg px-1 text-[10px] font-semibold text-status-overdue">
                    Mờ
                  </span>
                )}
                {p.kind === 'pdf' ? (
                  <span className="text-xs">PDF · {p.pageCount} trang</span>
                ) : p.thumbUrl ? (
                  <img src={p.thumbUrl} alt="" className="max-h-full max-w-full" />
                ) : (
                  <span className="text-xs text-fg-subtle">Đang nắn…</span>
                )}
              </button>
              <div className="mt-1 flex items-center justify-between text-xs">
                <button
                  type="button"
                  aria-label="Đưa lên trước"
                  className="rounded-sm p-1 hover:bg-surface-muted disabled:opacity-40"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                </button>
                <span>{i + 1}</span>
                <button
                  type="button"
                  aria-label="Đưa ra sau"
                  className="rounded-sm p-1 hover:bg-surface-muted disabled:opacity-40"
                  disabled={i === pages.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Xoá trang ${i + 1}`}
                  className="rounded-sm p-1 text-status-overdue hover:bg-surface-muted"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          ))}
          {/* Nút chụp luôn hiện, không ẩn sau menu (AFD 4.8). */}
          <div className="flex shrink-0 flex-col justify-center gap-2">
            <Button variant="secondary" onClick={() => cameraRef.current?.click()}>
              <Camera className="size-4" aria-hidden /> Chụp trang
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" aria-hidden /> Thêm ảnh / PDF
            </Button>
            {pages.length > 1 && (
              <Button
                variant="subtle"
                onClick={() => {
                  setPages((all) => [...all].reverse());
                  setSelected((s) => pages.length - 1 - s);
                }}
              >
                <ArrowLeftRight className="size-4" aria-hidden /> Đảo thứ tự trang
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  );
}

function PageEditor({
  page,
  onQuad,
  onMode,
  onRotate,
  onDetect,
}: {
  page: Extract<Page, { kind: 'image' }>;
  onQuad: (quad: Quad, mids: EdgeMids) => void;
  onDetect: () => void;
  onMode: (mode: ScanMode) => void;
  onRotate: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Góc và điểm giữa chung một trạng thái: kéo góc dời cả điểm giữa, hai lần cập nhật rời nhau
  // giữa các nhịp pointermove dồn dập sẽ tính độ lệch theo góc cũ.
  const [shape, setShape] = useState({ quad: page.quad, mids: page.mids });
  const { quad, mids } = shape;
  /** Đang kéo gì: 0–3 là góc, 4–7 là điểm giữa cạnh 0–3. */
  const dragging = useRef<number | null>(null);
  useEffect(() => setShape({ quad: page.quad, mids: page.mids }), [page.quad, page.mids, page.id]);
  const bent = hasBentEdge(quad, mids);

  const w = page.source.width;
  const h = page.source.height;

  function toImage(e: ReactPointerEvent) {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(w, Math.max(0, ((e.clientX - r.left) / r.width) * w)),
      y: Math.min(h, Math.max(0, ((e.clientY - r.top) / r.height) * h)),
    };
  }

  // Bán kính điểm kéo theo toạ độ ảnh: ~22 px trên màn hình (vùng bấm ≥ 40 px, 5.4).
  const handle = (Math.max(w, h) / 600) * 22;

  // Viền: 4 đường cong bậc hai qua góc và điểm giữa (cạnh thẳng thì điều khiển = trung điểm).
  const outline =
    `M${quad[0].x},${quad[0].y} ` +
    quad
      .map((a, i) => {
        const b = quad[(i + 1) % 4]!;
        const c = bezierControl(a, b, mids[i]!);
        return `Q${c.x},${c.y} ${b.x},${b.y}`;
      })
      .join(' ') +
    ' Z';

  function grab(e: ReactPointerEvent<SVGElement>, target: number) {
    (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture(e.pointerId);
    dragging.current = target;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <SegmentedControl
          options={Object.keys(SCAN_MODE_LABELS) as ScanMode[]}
          value={page.mode}
          onChange={onMode}
          getLabel={(m) => SCAN_MODE_LABELS[m]}
        />
        <Button variant="secondary" size="sm" onClick={onRotate}>
          <RotateCw className="size-4" aria-hidden /> Xoay
        </Button>
        <Button variant="secondary" size="sm" onClick={onDetect}>
          <ScanSearch className="size-4" aria-hidden /> Tự tìm mép
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!bent}
          onClick={() => onQuad(quad, straightMids(quad))}
        >
          <Spline className="size-4" aria-hidden /> Làm thẳng cạnh
        </Button>
      </div>
      <p
        role="status"
        className={cn(
          'max-w-xl text-center text-sm',
          page.quadSource === 'default' ? 'text-status-pending' : 'text-fg-subtle',
        )}
      >
        {page.quadSource === 'auto'
          ? bent
            ? 'Máy đã tự tìm mép giấy, cả chỗ giấy cong — kiểm lại 4 chấm tròn ở góc và chấm nhỏ giữa cạnh, lệch thì kéo cho khớp mép.'
            : 'Máy đã tự tìm mép giấy — kiểm lại 4 chấm tròn, lệch thì kéo cho khớp góc giấy.'
          : page.quadSource === 'default'
            ? 'Không tự tìm được mép giấy — kéo 4 chấm tròn vào đúng 4 góc tờ giấy. Lần sau đặt giấy trên nền tối hơn (bàn gỗ, bìa sẫm) để máy tự tìm.'
            : 'Kéo 4 chấm tròn cho khớp 4 góc tờ giấy. Giấy cong thì kéo chấm nhỏ giữa cạnh cho viền ôm theo mép.'}
      </p>
      {page.blurry && (
        <p
          role="alert"
          className="max-w-xl rounded-sm bg-status-overdue-bg px-3 py-2 text-center text-sm text-status-overdue"
        >
          Ảnh này bị mờ (rung tay hoặc máy chưa lấy nét) — chữ trên bản quét sẽ không rõ. Nên xoá
          trang này và chụp lại: tì khuỷu tay lên bàn, chạm vào tờ giấy trên màn hình để máy lấy
          nét, chờ một nhịp rồi mới bấm chụp.
        </p>
      )}
      <div
        ref={boxRef}
        className="relative max-h-[60vh] max-w-full touch-none select-none"
        style={{ aspectRatio: `${w} / ${h}`, height: '60vh' }}
      >
        <img
          src={page.sourceUrl}
          alt="Ảnh trang đang quét"
          className="size-full"
          draggable={false}
        />
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          onPointerMove={(e) => {
            const target = dragging.current;
            if (target === null) return;
            const p = toImage(e);
            setShape((s) => {
              if (target >= 4) {
                return {
                  quad: s.quad,
                  mids: s.mids.map((c, i) => (i === target - 4 ? p : c)) as EdgeMids,
                };
              }
              const next = s.quad.map((c, i) => (i === target ? p : c)) as Quad;
              return { quad: next, mids: followCorners(s.quad, s.mids, next) };
            });
          }}
          onPointerUp={() => {
            if (dragging.current === null) return;
            dragging.current = null;
            onQuad(quad, mids);
          }}
        >
          <path d={outline} className="fill-brand/10 stroke-brand" strokeWidth={handle / 6} />
          {mids.map((p, i) => (
            <g
              key={`mid-${i}`}
              data-testid={`scan-edge-${i}`}
              className="cursor-grab"
              onPointerDown={(e) => grab(e, 4 + i)}
            >
              {/* Vùng bấm vô hình cùng cỡ chấm góc (≥ 40 px); chấm nhìn thấy nhỏ hơn cho khỏi lẫn với góc. */}
              <circle cx={p.x} cy={p.y} r={handle} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={handle * 0.55}
                className="fill-brand stroke-surface"
                strokeWidth={handle / 6}
              />
            </g>
          ))}
          {quad.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={handle}
              data-testid={`scan-corner-${i}`}
              className="cursor-grab fill-surface stroke-brand"
              strokeWidth={handle / 4}
              onPointerDown={(e) => grab(e, i)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
