/**
 * Bản PDF báo giá gửi khách (0239) — dựng THẲNG từ dữ liệu bằng pdf-lib, không đổi từ Word.
 *
 * - Chữ vector, chọn / tìm được: nhúng Be Vietnam Pro (TTF, `web/public/fonts`, giấy phép OFL) qua fontkit
 *   để dấu tiếng Việt hiện đúng; nhúng tập con nên tệp nhỏ.
 * - Khổ A4; bảng hạng mục dài thì sang trang, lặp dòng tiêu đề; mọi trang có «Trang i/n» và mã báo giá.
 * - Bản chưa duyệt in dấu «Bản nháp» chéo trang — chỉ để xem, không gửi khách (nơi gọi chặn).
 * - pdf-lib, fontkit, phông, logo chỉ nạp khi gọi.
 *
 * Toán bố cục (ngắt chữ, chia trang, cột) ở `quote-pdf-layout.ts`.
 */

import type { QuoteDocumentData } from '@nvg/shared';
import { alignX, itemColumns, pageLabel, paginateRows, wrapText } from './quote-pdf-layout';

const A4 = { w: 595.28, h: 841.89 } as const;
const MARGIN = { x: 42, top: 40, bottom: 52 } as const;
const BODY = 9.5;
const LINE = 1.38;

async function fetchBytes(path: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Không tải được ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

export interface QuotePdfOptions {
  /** Báo giá chưa duyệt — in dấu «Bản nháp». */
  draft: boolean;
  title: string;
}

/** Dựng PDF; trả bytes để tải về / đính kèm email. */
export async function buildQuotePdf(
  data: QuoteDocumentData,
  opts: QuotePdfOptions,
): Promise<Uint8Array> {
  const [{ PDFDocument, rgb, degrees }, fontkitMod, regularBytes, boldBytes, logoBytes] =
    await Promise.all([
      import('pdf-lib'),
      import('@pdf-lib/fontkit'),
      fetchBytes('/fonts/BeVietnamPro-Regular.ttf'),
      fetchBytes('/fonts/BeVietnamPro-Bold.ttf'),
      fetchBytes('/brand/nvg-logo.png').catch(() => null),
    ]);
  const doc = await PDFDocument.create();
  // Bản ES của fontkit chỉ có `export default`; tệp kiểu lại khai dạng không gian tên.
  const fontkit = ((fontkitMod as unknown as { default?: unknown }).default ??
    fontkitMod) as Parameters<typeof doc.registerFontkit>[0];
  doc.registerFontkit(fontkit);
  doc.setTitle(opts.title);
  doc.setCreator('Hệ thống Quản trị NVG');
  doc.setLanguage('vi-VN');
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

  const INK = rgb(0.114, 0.165, 0.133);
  const MUTED = rgb(0.42, 0.47, 0.44);
  const BRAND = rgb(0.122, 0.361, 0.227);
  const BRAND_SOFT = rgb(0.91, 0.94, 0.918);
  const RULE = rgb(0.75, 0.8, 0.77);

  type Font = typeof regular;
  const contentW = A4.w - MARGIN.x * 2;
  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page = doc.addPage([A4.w, A4.h]);
  pages.push(page);
  let y = A4.h - MARGIN.top;

  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    pages.push(page);
    y = A4.h - MARGIN.top;
  };
  const ensure = (h: number) => {
    if (y - h < MARGIN.bottom) newPage();
  };
  const text = (s: string, x: number, yy: number, font: Font, size: number, color = INK) =>
    page.drawText(s, { x, y: yy, font, size, color });
  const measureWith = (font: Font, size: number) => (s: string) => font.widthOfTextAtSize(s, size);

  /** Đoạn văn tự ngắt dòng; sang trang khi cần. */
  const paragraph = (
    s: string,
    o: {
      font?: Font;
      size?: number;
      color?: ReturnType<typeof rgb>;
      after?: number;
      indent?: number;
    } = {},
  ) => {
    const font = o.font ?? regular;
    const size = o.size ?? BODY;
    const x = MARGIN.x + (o.indent ?? 0);
    for (const line of wrapText(s, contentW - (o.indent ?? 0), measureWith(font, size))) {
      ensure(size * LINE);
      y -= size * LINE;
      text(line, x, y + size * 0.25, font, size, o.color ?? INK);
    }
    y -= o.after ?? 4;
  };
  /** «Nhãn: giá trị» — nhãn đậm, giá trị tự ngắt dòng ở cột sau nhãn. */
  const labelled = (label: string, value: string | null, labelW = 92) => {
    if (!value) return;
    const lines = wrapText(value, contentW - labelW, measureWith(regular, BODY));
    lines.forEach((line, i) => {
      ensure(BODY * LINE);
      y -= BODY * LINE;
      if (i === 0) text(label, MARGIN.x, y + BODY * 0.25, bold, BODY);
      text(line, MARGIN.x + labelW, y + BODY * 0.25, regular, BODY);
    });
    y -= 2;
  };
  const heading = (s: string) => {
    ensure(BODY * LINE * 3);
    y -= 6;
    paragraph(s, { font: bold, size: 10.5, color: BRAND, after: 2 });
  };

  // --- Đầu thư -------------------------------------------------------------------------------------
  const logoW = 92;
  const logoH = logo ? (logo.height / logo.width) * logoW : 0;
  if (logo) page.drawImage(logo, { x: MARGIN.x, y: y - logoH, width: logoW, height: logoH });
  const headX = MARGIN.x + (logo ? logoW + 16 : 0);
  const headW = A4.w - MARGIN.x - headX;
  let hy = y - 2;
  const headLines: [string, Font, number, ReturnType<typeof rgb>][] = [];
  for (const l of wrapText(data.nvg_ten ?? 'Nhà Việt Group', headW, measureWith(bold, 12)))
    headLines.push([l, bold, 12, BRAND]);
  const contact = [
    data.nvg_dia_chi ? `Địa chỉ: ${data.nvg_dia_chi}` : null,
    [
      data.nvg_ma_so_thue ? `Mã số thuế: ${data.nvg_ma_so_thue}` : null,
      data.nvg_dien_thoai ? `Điện thoại: ${data.nvg_dien_thoai}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null,
    data.nvg_email ? `Email: ${data.nvg_email}` : null,
  ].filter((v): v is string => Boolean(v));
  for (const c of contact)
    for (const l of wrapText(c, headW, measureWith(regular, 8.5)))
      headLines.push([l, regular, 8.5, MUTED]);
  for (const [l, f, s, c] of headLines) {
    hy -= s * LINE;
    text(l, headX, hy + s * 0.25, f, s, c);
  }
  y = Math.min(y - logoH, hy) - 8;
  page.drawLine({
    start: { x: MARGIN.x, y },
    end: { x: A4.w - MARGIN.x, y },
    thickness: 1.2,
    color: BRAND,
  });
  y -= 22;

  // --- Tiêu đề, khách hàng ------------------------------------------------------------------------
  const title = 'BẢNG BÁO GIÁ';
  text(title, (A4.w - bold.widthOfTextAtSize(title, 17)) / 2, y, bold, 17, BRAND);
  y -= 16;
  const sub = `Số: ${data.so_bao_gia ?? ''} (phiên bản ${data.phien_ban ?? ''})${data.ngay_bao_gia ? ` — Ngày ${data.ngay_bao_gia}` : ''}`;
  text(sub, (A4.w - regular.widthOfTextAtSize(sub, BODY)) / 2, y, regular, BODY, MUTED);
  y -= 18;

  labelled('Kính gửi:', data.khach_ten_day_du ?? 'Quý khách');
  labelled('Địa chỉ:', data.khach_dia_chi);
  labelled(
    'Liên hệ:',
    [data.khach_dien_thoai, data.khach_email].filter(Boolean).join(' · ') || null,
  );
  labelled('Nội dung:', data.ten_cong_trinh);
  y -= 4;
  paragraph(data.gioi_thieu ?? 'Trân trọng gửi Quý khách báo giá như sau:', { after: 8 });

  // --- Bảng hạng mục --------------------------------------------------------------------------------
  const cols = itemColumns(MARGIN.x, contentW);
  const PAD = 4;
  const rowSize = 8.8;
  const headerH = 20;
  const rows = data.hang_muc.map((r) =>
    cols.map((c) =>
      wrapText(
        (r as Record<string, string>)[c.key] ?? '',
        c.width - PAD * 2,
        measureWith(regular, rowSize),
      ),
    ),
  );
  const rowHeights = rows.map(
    (cells) => Math.max(...cells.map((l) => l.length)) * rowSize * LINE + 8,
  );

  const drawHeader = () => {
    page.drawRectangle({
      x: MARGIN.x,
      y: y - headerH,
      width: contentW,
      height: headerH,
      color: BRAND,
    });
    for (const c of cols) {
      const w = bold.widthOfTextAtSize(c.label, 8.2);
      text(
        c.label,
        alignX({ ...c, align: c.align === 'left' ? 'left' : 'center' }, w, PAD),
        y - 13.5,
        bold,
        8.2,
        rgb(1, 1, 1),
      );
    }
    y -= headerH;
  };

  if (rows.length > 0) {
    const firstSpace = y - MARGIN.bottom;
    const fullSpace = A4.h - MARGIN.top - MARGIN.bottom;
    const chunks = paginateRows(rowHeights, firstSpace, fullSpace, headerH);
    chunks.forEach((chunk, ci) => {
      if (ci > 0) newPage();
      if (chunk.length === 0) return;
      drawHeader();
      chunk.forEach((ri, k) => {
        const h = rowHeights[ri]!;
        if (k % 2 === 1)
          page.drawRectangle({
            x: MARGIN.x,
            y: y - h,
            width: contentW,
            height: h,
            color: rgb(0.97, 0.975, 0.97),
          });
        cols.forEach((c, cj) => {
          rows[ri]![cj]!.forEach((line, li) => {
            const w = regular.widthOfTextAtSize(line, rowSize);
            text(
              line,
              alignX(c, w, PAD),
              y - 4 - (li + 1) * rowSize * LINE + rowSize * 0.3,
              regular,
              rowSize,
            );
          });
        });
        y -= h;
        page.drawLine({
          start: { x: MARGIN.x, y },
          end: { x: A4.w - MARGIN.x, y },
          thickness: 0.4,
          color: RULE,
        });
      });
    });
    y -= 10;
  }

  // --- Tổng --------------------------------------------------------------------------------------
  const sums: [string, string | null, boolean][] = [
    ['Tổng các hạng mục', data.tong_hang_muc as string | null, false],
    ['Giảm giá', data.tong_hang_muc ? (data.giam_gia as string | null) : null, false],
    [
      `Thuế giá trị gia tăng${data.thue_suat ? ` (${data.thue_suat as string})` : ''}`,
      data.thue_suat === 'không ghi' ? null : data.tien_thue,
      false,
    ],
    ['Tổng cộng', (data.tong_cong as string | null) ?? 'Chưa có giá trị', true],
  ];
  const sumX = MARGIN.x + contentW * 0.45;
  const sumW = contentW * 0.55;
  ensure(sums.length * 18 + 40);
  for (const [label, value, strong] of sums) {
    if (!value) continue;
    const h = strong ? 20 : 16;
    if (strong)
      page.drawRectangle({ x: sumX, y: y - h, width: sumW, height: h, color: BRAND_SOFT });
    const f = strong ? bold : regular;
    const size = strong ? 10.5 : BODY;
    text(label, sumX + 6, y - h + 5.5, f, size, strong ? BRAND : INK);
    const vw = f.widthOfTextAtSize(value, size);
    text(value, sumX + sumW - 6 - vw, y - h + 5.5, f, size, strong ? BRAND : INK);
    y -= h;
  }
  y -= 6;
  if (data.tong_cong_bang_chu) {
    paragraph(`Bằng chữ: ${data.tong_cong_bang_chu as string}.`, { font: bold, after: 2 });
  }
  if (data.ghi_chu_thue)
    paragraph(data.ghi_chu_thue as string, { size: 8.5, color: MUTED, after: 6 });

  // --- Điều kiện ---------------------------------------------------------------------------------
  if (data.dieu_kien) {
    heading('Phạm vi và điều kiện');
    paragraph(data.dieu_kien as string);
  }
  heading('Điều kiện thanh toán');
  paragraph((data.dieu_khoan_thanh_toan as string | null) ?? '');
  if (data.thoi_gian_thuc_hien) {
    heading('Thời gian thực hiện');
    paragraph(data.thoi_gian_thuc_hien);
  }
  heading('Hiệu lực báo giá');
  paragraph(
    data.hieu_luc
      ? `Báo giá có hiệu lực đến hết ngày ${data.hieu_luc as string}. Sau thời hạn này, đơn giá có thể được điều chỉnh theo thị trường.`
      : 'Báo giá chưa ghi thời hạn hiệu lực.',
  );
  if (data.ghi_chu_cuoi) paragraph(data.ghi_chu_cuoi, { after: 4 });

  // --- Ký --------------------------------------------------------------------------------------
  ensure(110);
  y -= 18;
  const colW = contentW / 2;
  const center = (s: string, cx: number, yy: number, f: Font, size: number, color = INK) =>
    text(s, cx - f.widthOfTextAtSize(s, size) / 2, yy, f, size, color);
  const leftC = MARGIN.x + colW / 2;
  const rightC = MARGIN.x + colW * 1.5;
  center('Người lập báo giá', leftC, y, bold, BODY);
  center(`Đại diện ${(data.nvg_ten_ngan as string | null) ?? 'pháp nhân'}`, rightC, y, bold, BODY);
  if (data.chuc_vu_ky) center(data.chuc_vu_ky, rightC, y - 13, regular, BODY);
  center('(Ký, ghi rõ họ tên, đóng dấu)', rightC, y - 26, regular, 8, MUTED);
  y -= 82;
  if (data.nguoi_lap) center(data.nguoi_lap as string, leftC, y, bold, BODY);
  if (data.nguoi_lap_dien_thoai)
    center(
      `Điện thoại: ${data.nguoi_lap_dien_thoai as string}`,
      leftC,
      y - 13,
      regular,
      8.5,
      MUTED,
    );
  if (data.nguoi_ky) center(data.nguoi_ky, rightC, y, bold, BODY);

  // --- Chân trang + dấu nháp ---------------------------------------------------------------------
  const total = pages.length;
  pages.forEach((p, i) => {
    const label = pageLabel(i, total);
    const left = `Báo giá ${data.so_bao_gia ?? ''}`;
    p.drawLine({
      start: { x: MARGIN.x, y: 36 },
      end: { x: A4.w - MARGIN.x, y: 36 },
      thickness: 0.5,
      color: RULE,
    });
    p.drawText(left, { x: MARGIN.x, y: 24, font: regular, size: 7.5, color: MUTED });
    p.drawText(label, {
      x: A4.w - MARGIN.x - regular.widthOfTextAtSize(label, 7.5),
      y: 24,
      font: regular,
      size: 7.5,
      color: MUTED,
    });
    if (opts.draft) {
      const mark = 'Bản nháp — chưa phê duyệt';
      const size = 46;
      const w = bold.widthOfTextAtSize(mark, size);
      p.drawText(mark, {
        x: A4.w / 2 - (w / 2) * Math.cos(Math.PI / 4),
        y: A4.h / 2 - (w / 2) * Math.sin(Math.PI / 4),
        font: bold,
        size,
        color: rgb(0.8, 0.2, 0.2),
        opacity: 0.16,
        rotate: degrees(45),
      });
    }
  });

  return doc.save();
}
