/**
 * Bộ dựng `SAD.docx`.
 *
 * Bản .docx là bản TRÌNH BÀY, không phải bản chuyển máy móc từ Markdown: nó có trang bìa, mục
 * lục, sơ đồ nhúng có chú thích, đầu trang, chân trang và số trang. Nội dung chữ giữ đồng bộ
 * với `SAD.md`; sơ đồ nhúng lấy từ `diagrams/*.png` do `diagrams/ve.sh` sinh ra.
 *
 * Gói `docx` CỐ Ý không nằm trong `package.json`: nó chỉ dùng để sinh tài liệu, không phải phụ
 * thuộc lúc chạy của web/, workers/ hay db/.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TableOfContents,
  TextRun,
  WidthType,
  convertInchesToTwip,
} = require('docx');

/** Bề ngang vùng chữ của khổ A4 với lề 2 cm, tính bằng DXA. */
export const CONTENT_WIDTH = 9638;

const FONT = 'Calibri';
const MONO = 'Consolas';
const INK = '1F2933';
const BRAND = '1F5F4B';
const RULE = 'C9D2CE';
const HEAD_FILL = 'EAF1EE';

export function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.tight ? 60 : 140, line: 276 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: runs(text, opts),
  });
}

/**
 * Chuỗi có thể mang đánh dấu nhẹ: `**đậm**` và `` `mã` ``.
 * Cố ý chỉ hai kiểu — tài liệu kiến trúc không cần nhiều hơn, và mỗi kiểu thêm vào là một
 * cách nữa để hai đoạn cùng nội dung trông khác nhau.
 */
function runs(text, opts = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(plain(text.slice(last, m.index), opts));
    const token = m[0];
    if (token.startsWith('**')) {
      out.push(plain(token.slice(2, -2), { ...opts, bold: true }));
    } else {
      out.push(
        new TextRun({
          text: token.slice(1, -1),
          font: MONO,
          size: (opts.size ?? 21) - 2,
          color: opts.color ?? INK,
        }),
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(plain(text.slice(last), opts));
  return out;
}

function plain(text, opts = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? 21,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    color: opts.color ?? INK,
  });
}

export function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 30, bold: true, color: BRAND })],
  });
}

export function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 25, bold: true, color: INK })],
  });
}

export function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: INK })],
  });
}

export function bullets(items) {
  return items.map(
    (text) =>
      new Paragraph({
        numbering: { reference: 'cham-tron', level: 0 },
        spacing: { after: 70, line: 276 },
        children: runs(text),
      }),
  );
}

export function steps(items) {
  return items.map(
    (text) =>
      new Paragraph({
        numbering: { reference: 'danh-so', level: 0 },
        spacing: { after: 70, line: 276 },
        children: runs(text),
      }),
  );
}

/** Đoạn ghi chú có viền trái — dùng cho cảnh báo và ràng buộc cứng. */
export function note(text) {
  return new Paragraph({
    spacing: { before: 120, after: 160, line: 276 },
    indent: { left: 220 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, space: 10, color: BRAND } },
    children: runs(text, { italic: false }),
  });
}

function cell(text, { header = false, width, mono = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: HEAD_FILL, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: String(text)
      .split('\n')
      .map(
        (line) =>
          new Paragraph({
            spacing: { after: 0, line: 252 },
            children: mono
              ? [new TextRun({ text: line, font: MONO, size: 17, color: INK })]
              : runs(line, { size: header ? 19 : 19, bold: header }),
          }),
      ),
  });
}

/**
 * Bảng có bề ngang khai TƯỜNG MINH ở cả bảng lẫn từng ô.
 * Khai theo phần trăm thì Google Docs dựng sai — đây là lý do duy nhất của `columnWidths`.
 */
export function table(head, rows, ratios) {
  const total = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.round((r / total) * CONTENT_WIDTH));
  widths[widths.length - 1] = CONTENT_WIDTH - widths.slice(0, -1).reduce((a, b) => a + b, 0);

  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map((t, i) => cell(t, { header: true, width: widths[i] })),
      }),
      // `cantSplit`: một dòng bị cắt ngang trang đọc ra thành hai dòng nửa vời — với bảng
      // quyết định kiến trúc thì đó là nửa câu trả lời ở trang này, nửa kia ở trang sau.
      ...rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: r.map((t, i) => cell(t, { width: widths[i] })),
          }),
      ),
    ],
  });
}

/** Khối chữ đẳng khoảng — dùng cho sơ đồ khối vẽ bằng ký tự. */
export function pre(lines) {
  return new Table({
    columnWidths: [CONTENT_WIDTH],
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: 'F6F8F7', color: 'auto' },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: lines.map(
              (line) =>
                new Paragraph({
                  spacing: { after: 0, line: 240 },
                  children: [new TextRun({ text: line, font: MONO, size: 16, color: INK })],
                }),
            ),
          }),
        ],
      }),
    ],
  });
}

export function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

/** Đọc bề ngang và bề cao của tệp PNG từ khối IHDR — không cần thư viện ảnh. */
function pngSize(path) {
  const head = readFileSync(path).subarray(0, 33);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

let soHinh = 0;

/**
 * Sơ đồ kèm chú thích, tự thu về vừa khung trang.
 *
 * Khung mặc định 650 × 700 điểm ảnh là vùng chữ của khổ A4 lề 0,75 inch. Thu theo cạnh dài hơn
 * để sơ đồ **không bao giờ tràn trang** — tràn trang là lỗi hay gặp nhất khi nhúng sơ đồ rộng.
 */
export function figure(path, caption, { maxWidth = 650, maxHeight = 700 } = {}) {
  const { width, height } = pngSize(path);
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  soHinh += 1;

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 60 },
      keepNext: true,
      children: [
        new ImageRun({
          type: 'png',
          data: readFileSync(path),
          transformation: { width: Math.round(width * ratio), height: Math.round(height * ratio) },
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `Hình ${soHinh} — ${caption}`, font: FONT, size: 18, italics: true, color: '52606D' }),
      ],
    }),
  ];
}

export function spacer() {
  return new Paragraph({ spacing: { after: 160 }, children: [] });
}

export function titlePage({ title, subtitle, module: moduleName, version, date, author, status }) {
  return [
    new Paragraph({ spacing: { before: 1800, after: 0 }, children: [] }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: 'NHÀ VIỆT GROUP', font: FONT, size: 22, bold: true, color: BRAND }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: title, font: FONT, size: 44, bold: true, color: INK })],
    }),
    new Paragraph({
      spacing: { after: 480 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, space: 8, color: BRAND } },
      children: [new TextRun({ text: subtitle, font: FONT, size: 24, color: '52606D' })],
    }),
    table(
      ['Hạng mục', 'Nội dung'],
      [
        ['Phạm vi', moduleName],
        ['Phiên bản tài liệu', version],
        ['Ngày phát hành', date],
        ['Người soạn', author],
        ['Trạng thái', status],
      ],
      [1, 3],
    ),
  ];
}

export function buildDocument({ headerText, children }) {
  return new Document({
    creator: 'Nhà Việt Group',
    title: headerText,
    description: 'Tài liệu Kiến trúc Phần mềm',
    numbering: {
      config: [
        {
          reference: 'cham-tron',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 360, hanging: 220 } },
                run: { font: FONT, size: 21, color: INK },
              },
            },
          ],
        },
        {
          reference: 'danh-so',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 360, hanging: 220 } },
                run: { font: FONT, size: 21, color: INK },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: FONT, size: 21, color: INK } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: {
              top: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(0.8),
              right: convertInchesToTwip(0.8),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 120 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 6, color: RULE } },
                children: [
                  new TextRun({ text: headerText, font: FONT, size: 16, color: '7B8794' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Trang ', font: FONT, size: 16, color: '7B8794' }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '7B8794' }),
                  new TextRun({ text: ' / ', font: FONT, size: 16, color: '7B8794' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '7B8794' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export function toc() {
  return [
    h1('Mục lục'),
    new TableOfContents('Mục lục', { hyperlink: true, headingStyleRange: '1-3' }),
    note(
      'Mục lục sinh bằng trường của Word. Mở tệp lần đầu, chọn mục lục rồi nhấn F9 để Word điền số trang.',
    ),
  ];
}

export { Packer, Paragraph, TextRun };
