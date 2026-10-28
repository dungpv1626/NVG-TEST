/**
 * Dựng ảnh trang phiếu khảo sát giấy trên trình duyệt rồi che thông tin khách (`paper-redact.ts`).
 *
 * Tệp đã lưu ở kho là PDF của bộ quét (mỗi trang đã nắn về A4) hoặc một ảnh chụp: PDF thì vẽ từng trang
 * bằng pdf.js (nạp khi cần, như `/xem-ban-ky`), ảnh thì giải mã thẳng. Ảnh XEM TRƯỚC và ảnh GỬI ĐI là
 * cùng một tệp JPEG — người dùng thấy đúng thứ rời máy. Ảnh đã che không lưu vào kho.
 */

import { defaultRedaction, redactRows } from './paper-redact';

/** Khớp giới hạn của Worker (`workers/src/ai/survey-paper-read.ts`): 4 trang, mỗi trang dưới 1,5 MB. */
export const PAPER_MAX_PAGES_CLIENT = 4;
const PAPER_MAX_PAGE_BYTES_CLIENT = 1_400_000;

/** Cạnh dài của ảnh gửi đi — đủ đọc chữ viết tay trên A4 (~150 dpi) mà một trang vẫn dưới 1 MB. */
const SEND_LONG_SIDE = 1800;

export interface PaperPageDraft {
  /** Ảnh trang gốc (chưa che), chỉ nằm trong bộ nhớ. */
  source: HTMLCanvasElement;
  top: number;
  bottom: number;
  barFound: boolean;
}

export interface RedactedPage {
  base64: string;
  url: string;
  bytes: number;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

async function renderPdf(file: Blob): Promise<{ canvases: HTMLCanvasElement[]; total: number }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const canvases: HTMLCanvasElement[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, PAPER_MAX_PAGES_CLIENT); n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: SEND_LONG_SIDE / Math.max(base.width, base.height),
      });
      const canvas = canvasOf(viewport.width, viewport.height);
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      canvases.push(canvas);
    }
    return { canvases, total: pdf.numPages };
  } finally {
    void task.destroy();
  }
}

async function renderImage(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, SEND_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = canvasOf(bitmap.width * k, bitmap.height * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Tải tệp phiếu (đường ký tạm của kho) và dựng các trang, kèm phần che mặc định của từng trang. */
export async function loadPaperPages(
  url: string,
  mimeType: string | null,
): Promise<{ pages: PaperPageDraft[]; truncatedFrom: number | null }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không tải được tệp phiếu từ kho.');
  const blob = await res.blob();
  const pdf = (mimeType ?? blob.type) === 'application/pdf';
  const { canvases, total } = pdf
    ? await renderPdf(blob)
    : { canvases: [await renderImage(blob)], total: 1 };
  const pages = canvases.map((source, i) => {
    const ctx = source.getContext('2d')!;
    const img = ctx.getImageData(0, 0, source.width, source.height);
    return { source, ...defaultRedaction(img, i) };
  });
  return { pages, truncatedFrom: total > PAPER_MAX_PAGES_CLIENT ? total : null };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', quality),
  );
}

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Ảnh trang ĐÃ CHE, dạng JPEG — vừa để xem trước vừa là đúng tệp gửi đi. */
export async function redactedJpeg(page: PaperPageDraft): Promise<RedactedPage> {
  const out = canvasOf(page.source.width, page.source.height);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(page.source, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  redactRows(img, page.top, page.bottom);
  ctx.putImageData(img, 0, 0);
  let blob = await toBlob(out, 0.8);
  if (blob.size > PAPER_MAX_PAGE_BYTES_CLIENT) blob = await toBlob(out, 0.6);
  return {
    base64: base64Of(await blob.arrayBuffer()),
    url: URL.createObjectURL(blob),
    bytes: blob.size,
  };
}
