/**
 * Dựng bản .docx từ bản .md của một tài liệu sản phẩm (Tầm nhìn, PRD, SRS).
 *
 *   NODE_PATH=/tmp/sad/node_modules node doc/san-pham/md-docx.mjs doc/san-pham/VISION_BUSINESS_CASE.md
 *
 * Khác `sad-docx.mjs` (viết tay từng mục): ở đây bản .md là nguồn DUY NHẤT, bản .docx sinh ra từ nó,
 * nên hai bản không thể lệch nhau. Đổi lại, .md chỉ được dùng tập Markdown nhỏ dưới đây:
 *
 *   # Tiêu đề            → trang bìa (dòng chữ thường ngay sau = phụ đề)
 *   | | | bảng đầu tiên  → bảng thông tin trên trang bìa
 *   ## / ### / ####      → Heading 1 / 2 / 3
 *   | a | b | bảng       → bảng; tiêu đề rỗng («| | |») thì dựng bảng nhãn–nội dung
 *   > ghi chú            → đoạn có viền trái
 *   - mục / 1. mục       → danh sách
 *   ![..](đường-dẫn)     → sơ đồ; dòng «**Hình N.** …» ngay sau là chú thích
 *   ---                  → bỏ qua (chỉ để dễ đọc trong Git)
 *
 * Trong ô và đoạn: chỉ `**đậm**` và `` `mã` `` (giới hạn của `runs` trong docx-lib).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  Packer,
  Paragraph,
  TextRun,
  buildDocument,
  bullets,
  figure,
  h1,
  h2,
  h3,
  kvTable,
  note,
  p,
  pageBreak,
  spacer,
  steps,
  table,
  toc,
} from '../architecture/docx-lib.mjs';

const src = process.argv[2];
if (!src) {
  console.error('Cách dùng: node doc/san-pham/md-docx.mjs <tệp.md>');
  process.exit(1);
}
const base = dirname(src);
const lines = readFileSync(src, 'utf8').split('\n');

/**
 * Tách một dòng bảng thành các ô.
 *
 * Dấu gạch đứng nằm trong nội dung ô phải viết thoát `\\|` theo chuẩn Markdown — nếu không, ký
 * hiệu như `A ||--o{ B` sẽ bị hiểu thành thêm hai ô và bảng vỡ.
 */
const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

/** Bề ngang cột theo độ dài chữ trung bình — cột mã ngắn không chiếm nửa trang. */
function ratios(rows) {
  const n = rows[0].length;
  const avg = Array.from({ length: n }, (_, i) => {
    const lens = rows.map((r) => (r[i] ?? '').replace(/\*\*|`/g, '').length);
    return lens.reduce((a, b) => a + b, 0) / lens.length;
  });
  return avg.map((a) => Math.min(Math.max(Math.sqrt(a + 4), 2.2), 9));
}

let title = '';
let subtitle = '';
let meta = null;
const body = [];
/** Đề mục thu trong lúc duyệt, dùng dựng mục lục ghi sẵn. */
const headings = [];
/** Mỗi danh sách đánh số cần một bộ đếm riêng, nếu không nó đếm tiếp danh sách trước. */
let soThuTu = 0;
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  const t = line.trim();

  if (t === '' || t === '---') {
    i++;
    continue;
  }
  if (t.startsWith('# ')) {
    title = t.slice(2);
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i < lines.length && !/^[|#>!-]/.test(lines[i].trim())) subtitle = lines[i++].trim();
    continue;
  }
  if (t.startsWith('#### ')) {
    body.push(h3(t.slice(5)));
    i++;
    continue;
  }
  if (t.startsWith('### ')) {
    headings.push({ text: t.slice(4), level: 2 });
    body.push(h2(t.slice(4)));
    i++;
    continue;
  }
  if (t.startsWith('## ')) {
    headings.push({ text: t.slice(3), level: 1 });
    body.push(h1(t.slice(3)));
    i++;
    continue;
  }
  if (t.startsWith('|')) {
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) block.push(lines[i++]);
    const head = cells(block[0]);
    const rows = block.slice(2).map(cells);
    // Hàng lệch số ô làm thư viện docx ném lỗi khó lần; báo ngay ở đây, kèm nội dung hàng.
    for (const r of rows) {
      if (r.length !== head.length) {
        throw new Error(
          `Bảng lệch cột: tiêu đề ${head.length} ô, hàng ${r.length} ô — ${r.join(' | ')}\n` +
            'Nếu ô có dấu gạch đứng thì viết thoát thành \\|',
        );
      }
    }
    if (head.every((h) => h === '')) {
      if (!meta) meta = rows;
      else body.push(kvTable(rows, [1, 4]), spacer());
    } else {
      body.push(table(head, rows, ratios([head, ...rows])), spacer());
    }
    continue;
  }
  if (t.startsWith('>')) {
    const buf = [];
    while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
    body.push(note(buf.join(' ')));
    continue;
  }
  if (/^[-*] /.test(t)) {
    const items = [];
    while (i < lines.length && /^\s*[-*] /.test(lines[i])) {
      let item = lines[i++].trim().slice(2);
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*] /.test(lines[i])) item += ' ' + lines[i++].trim();
      items.push(item);
    }
    body.push(...bullets(items));
    continue;
  }
  if (/^\d+\. /.test(t)) {
    const items = [];
    while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
      let item = lines[i++].trim().replace(/^\d+\. /, '');
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+\. /.test(lines[i])) item += ' ' + lines[i++].trim();
      items.push(item);
    }
    body.push(...steps(items, soThuTu++));
    continue;
  }
  const img = t.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
  if (img) {
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
    let caption = '';
    if (i < lines.length && lines[i].trim().startsWith('**Hình')) caption = lines[i++].trim().replace(/\*\*/g, '').replace(/^Hình \d+\.\s*/, '');
    body.push(...figure(join(base, img[1]), caption));
    continue;
  }
  // Đoạn thường: gộp các dòng liền nhau.
  const buf = [t];
  i++;
  while (i < lines.length && lines[i].trim() !== '' && !/^([|#>!]|[-*] |\d+\. |---)/.test(lines[i].trim())) buf.push(lines[i++].trim());
  body.push(p(buf.join(' ')));
}

const cover = [
  new Paragraph({ spacing: { before: 1800, after: 0 }, children: [] }),
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: 'NHÀ VIỆT GROUP', font: 'Calibri', size: 22, bold: true, color: '1F5F4B' })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: title, font: 'Calibri', size: 40, bold: true, color: '1F2933' })],
  }),
  new Paragraph({
    spacing: { after: 480 },
    children: [new TextRun({ text: subtitle, font: 'Calibri', size: 24, color: '52606D' })],
  }),
  ...(meta ? [kvTable(meta, [1, 3])] : []),
];

const doc = buildDocument({
  headerText: `${title} — Nhà Việt Group`,
  description: title,
  children: [...cover, pageBreak(), ...toc(headings), pageBreak(), ...body],
});
const out = src.replace(/\.md$/, '.docx');
writeFileSync(out, await Packer.toBuffer(doc));
console.log('Đã ghi', out);
