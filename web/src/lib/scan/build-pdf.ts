/**
 * Ghép các trang quét thành một tệp PDF khổ A4.
 *
 * Trang ảnh (JPEG đã nắn) đặt vừa khít trang A4 đứng hoặc ngang theo chính ảnh; PDF người dùng
 * tải lên thì chép nguyên trang (`copyPages`), không vẽ lại — giữ chữ, giữ chữ ký số nếu có.
 * pdf-lib chỉ nạp khi gọi (`import()`), trang khác không phải tải thư viện này.
 */

export type ScanPage =
  | { kind: 'image'; jpeg: Uint8Array; width: number; height: number }
  | { kind: 'pdf'; bytes: Uint8Array };

/** Khổ A4 theo điểm PDF (1/72 inch). */
export const A4_POINTS = { short: 595.28, long: 841.89 } as const;

export async function buildPdf(pages: readonly ScanPage[], title?: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  doc.setCreator('Hệ thống Quản trị NVG');
  for (const page of pages) {
    if (page.kind === 'pdf') {
      const src = await PDFDocument.load(page.bytes, { ignoreEncryption: true });
      const copied = await doc.copyPages(src, src.getPageIndices());
      for (const p of copied) doc.addPage(p);
      continue;
    }
    const landscape = page.width > page.height;
    const w = landscape ? A4_POINTS.long : A4_POINTS.short;
    const h = landscape ? A4_POINTS.short : A4_POINTS.long;
    const img = await doc.embedJpg(page.jpeg);
    doc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}
