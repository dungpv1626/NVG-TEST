/**
 * Chuẩn hoá bản vẽ kỹ sư tải lên (PNG / JPG / PDF) thành ảnh PNG cho mô hình ảnh — ở TRÌNH DUYỆT
 * (T114 Đợt 4). Worker không có canvas và không đọc được PDF.
 *
 * Ba việc, theo thứ tự:
 *  1. Dựng ảnh nguồn: ảnh thì giải mã thẳng; PDF thì dựng MỘT trang (kỹ sư chọn) bằng pdf.js — thư
 *     viện chỉ nạp khi gặp PDF, không vào gói chính.
 *  2. Cắt lề theo phần trăm — chỗ kỹ sư bỏ khung tên (thường ở cạnh phải hoặc cạnh dưới). Dữ liệu
 *     hạng 1 (T12): khung tên mang tên chủ nhà, địa chỉ, mã hồ sơ.
 *  3. Đặt vào MỘT trong ba khung mô hình ảnh nhận (1024², 1536×1024, 1024×1536), theo tỷ lệ bản vẽ,
 *     thu vừa và đệm nền trắng — KHÔNG kéo méo: mô hình vẽ theo đúng tỷ lệ nó nhìn thấy.
 */

export class DrawingUploadError extends Error {}

/** Phần trăm cắt bỏ ở mỗi cạnh, 0–45. */
export interface CropPercent {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_CROP: CropPercent = { top: 0, right: 0, bottom: 0, left: 0 };

/** Cạnh dài nhất khi dựng trang PDF — đủ nét cho khung 1536 px mà không làm canvas quá nặng. */
const PDF_LONG_SIDE_PX = 3000;

/** Khung theo tỷ lệ bản vẽ: ngang rõ → 1536×1024, dọc rõ → 1024×1536, còn lại vuông. */
export function frameFor(width: number, height: number): { width: number; height: number } {
  const ratio = width / height;
  if (ratio >= 1.25) return { width: 1536, height: 1024 };
  if (ratio <= 0.8) return { width: 1024, height: 1536 };
  return { width: 1024, height: 1024 };
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** Số trang của một PDF — để màn hình hỏi trang nào. */
export async function pdfPageCount(file: File): Promise<number> {
  const { pdf, task } = await openPdf(file);
  try {
    return pdf.numPages;
  } finally {
    void task.destroy();
  }
}

/** Chuẩn hoá thành PNG base64 (không tiền tố `data:`), kèm khung đã chọn. */
export async function normaliseDrawing(
  file: File,
  options: { page?: number; crop?: CropPercent } = {},
): Promise<{ base64: string; width: number; height: number }> {
  const source = isPdf(file)
    ? await renderPdfPage(file, options.page ?? 1)
    : await decodeImage(file);
  const crop = options.crop ?? NO_CROP;
  const clamp = (v: number) => Math.min(45, Math.max(0, v)) / 100;
  const sx = source.width * clamp(crop.left);
  const sy = source.height * clamp(crop.top);
  const sw = source.width * (1 - clamp(crop.left) - clamp(crop.right));
  const sh = source.height * (1 - clamp(crop.top) - clamp(crop.bottom));
  if (sw < 16 || sh < 16) throw new DrawingUploadError('Phần còn lại sau khi cắt quá nhỏ.');

  const frame = frameFor(sw, sh);
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new DrawingUploadError('Trình duyệt không dựng được ảnh từ bản vẽ.');
  // Nền trắng: PNG trong suốt từ CAD tới nhà cung cấp thành một tấm gần như trống.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, frame.width, frame.height);
  const scale = Math.min(frame.width / sw, frame.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(
    source.canvas,
    sx,
    sy,
    sw,
    sh,
    (frame.width - dw) / 2,
    (frame.height - dh) / 2,
    dw,
    dh,
  );
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:image/png') || comma < 0) {
    throw new DrawingUploadError('Trình duyệt không dựng được ảnh từ bản vẽ.');
  }
  return { base64: dataUrl.slice(comma + 1), width: frame.width, height: frame.height };
}

type Source = { canvas: CanvasImageSource; width: number; height: number };

async function decodeImage(file: File): Promise<Source> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    throw new DrawingUploadError('Chỉ nhận tệp PNG, JPG hoặc PDF.');
  }
  try {
    const bitmap = await createImageBitmap(file);
    return { canvas: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    throw new DrawingUploadError('Không đọc được ảnh. Kiểm tra tệp có mở được trên máy không.');
  }
}

async function openPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return { pdf: await task.promise, task };
  } catch {
    void task.destroy();
    throw new DrawingUploadError('Không đọc được tệp PDF.');
  }
}

async function renderPdfPage(file: File, pageNumber: number): Promise<Source> {
  const { pdf, task } = await openPdf(file);
  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new DrawingUploadError(`Tệp PDF chỉ có ${pdf.numPages} trang.`);
    }
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: PDF_LONG_SIDE_PX / Math.max(base.width, base.height),
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    // Nền trắng do pdf.js tự tô (`background`); truyền `canvas` chứ không `canvasContext` — bản 5 trở đi.
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    return { canvas, width: canvas.width, height: canvas.height };
  } finally {
    void task.destroy();
  }
}
