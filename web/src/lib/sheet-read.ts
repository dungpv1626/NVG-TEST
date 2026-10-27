/**
 * Đọc bảng tính trên trình duyệt — trang tính ĐẦU TIÊN của `.xlsx`, hoặc `.csv` — thành mảng dòng × ô (chuỗi).
 *
 * Không thêm thư viện: `.xlsx` là gói zip chứa XML, dự án đã có `pizzip` (mẫu hợp đồng). Chỉ đọc GIÁ TRỊ ô: chuỗi dùng
 * chung, chuỗi tại chỗ, số (giữ nguyên chữ số như Excel lưu — số điện thoại không bị làm tròn), đúng/sai. Công thức đọc
 * kết quả đã lưu. Ngày dạng số sê-ri Excel giữ nguyên số — đầu mối không có cột ngày.
 */

import PizZip from 'pizzip';

export type SheetTable = string[][];

/** Tách CSV: nháy kép bọc ô (nháy kép đôi = một nháy), dấu phân cách `,` hoặc `;` (Excel tiếng Việt hay xuất `;`). */
export function parseCsv(text: string): SheetTable {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: SheetTable = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = false;
      } else value += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(value);
      value = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else value += ch;
  }
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function xmlDoc(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

/** Chữ của một phần tử `<si>` / `<is>`: nối mọi `<t>` (chuỗi có định dạng chia nhiều đoạn), bỏ phiên âm `<rPh>`. */
function richText(node: Element): string {
  let out = '';
  for (const t of Array.from(node.getElementsByTagName('t'))) {
    if (t.parentElement?.localName === 'rPh') continue;
    out += t.textContent ?? '';
  }
  return out;
}

/** «B12» → cột 1 (bắt đầu từ 0). */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Đường dẫn trang tính đầu tiên theo `workbook.xml` + quan hệ của nó; thiếu thì thử `sheet1.xml`. */
function firstSheetPath(zip: PizZip): string {
  const fallback = 'xl/worksheets/sheet1.xml';
  const wb = zip.file('xl/workbook.xml')?.asText();
  const rels = zip.file('xl/_rels/workbook.xml.rels')?.asText();
  if (!wb || !rels) return fallback;
  const sheet = xmlDoc(wb).getElementsByTagName('sheet')[0];
  const rid =
    sheet?.getAttribute('r:id') ??
    sheet?.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'id',
    );
  if (!rid) return fallback;
  const rel = Array.from(xmlDoc(rels).getElementsByTagName('Relationship')).find(
    (r) => r.getAttribute('Id') === rid,
  );
  const target = rel?.getAttribute('Target');
  if (!target) return fallback;
  return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
}

export function parseXlsx(data: ArrayBuffer | Uint8Array): SheetTable {
  const zip = new PizZip(data);
  const sharedXml = zip.file('xl/sharedStrings.xml')?.asText();
  const shared = sharedXml
    ? Array.from(xmlDoc(sharedXml).getElementsByTagName('si')).map(richText)
    : [];
  const sheetXml = zip.file(firstSheetPath(zip))?.asText();
  if (!sheetXml) throw new Error('Tệp Excel không có trang tính nào đọc được.');
  const rows: SheetTable = [];
  for (const r of Array.from(xmlDoc(sheetXml).getElementsByTagName('row'))) {
    const rowNumber = Number(r.getAttribute('r')) || rows.length + 1;
    while (rows.length < rowNumber - 1) rows.push([]);
    const out: string[] = [];
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r');
      const col = ref ? columnIndex(ref) : out.length;
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let text: string;
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') {
        const is = c.getElementsByTagName('is')[0];
        text = is ? richText(is) : '';
      } else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else text = v;
      while (out.length < col) out.push('');
      out[col] = text;
    }
    rows.push(out);
  }
  return rows;
}

/** Đọc tệp người dùng chọn. Lỗi trả câu tiếng Việt nói cần làm gì. */
export async function readSheetFile(file: File): Promise<SheetTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(await file.text());
  if (name.endsWith('.xlsx')) {
    try {
      return parseXlsx(await file.arrayBuffer());
    } catch {
      throw new Error(
        'Không đọc được tệp Excel. Mở tệp trong Excel, lưu lại dạng .xlsx rồi chọn lại.',
      );
    }
  }
  throw new Error(
    'Chỉ nhận tệp .xlsx hoặc .csv. Tệp .xls đời cũ: mở trong Excel rồi lưu lại dạng .xlsx.',
  );
}
