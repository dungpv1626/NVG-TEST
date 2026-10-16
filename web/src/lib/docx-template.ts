/**
 * Mở / điền / dựng tệp Word cho mẫu hợp đồng (0171). Chạy ngay trên trình duyệt: dữ liệu hợp
 * đồng không rời máy người dùng trước khi tự họ lưu (CLAUDE.md 5.1 — dữ liệu hạng 1).
 *
 * Danh mục chỗ trống và cách tính giá trị nằm ở `@nvg/shared` (`hd-template.ts`); tệp này chỉ
 * lo phần tệp. Chỉ THAY CHỮ vào chỗ trống, nên định dạng của mẫu Word giữ nguyên vẹn.
 */

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { TEMPLATE_BLANK, unknownTemplateTags, type TemplateValue } from '@nvg/shared';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Cây chỗ trống: tag thường → `{}`, bảng lặp → `{ cột: {} }`. */
export type TemplateTags = Record<string, Record<string, unknown>>;

export type InspectResult =
  { ok: true; tags: TemplateTags; unknown: string[] } | { ok: false; errors: string[] };

interface DxtErrorProperties {
  id?: string;
  xtag?: string;
  errors?: { properties?: DxtErrorProperties }[];
}

/** Lỗi cú pháp mẫu → câu tiếng Việt chỉ ra chỗ sai (bộ điền chỉ báo tiếng Anh). */
function explain(p: DxtErrorProperties | undefined): string {
  const tag = p?.xtag ? `«${p.xtag}»` : 'một chỗ trống';
  switch (p?.id) {
    case 'unopened_tag':
      return `Chỗ trống ${tag} thiếu dấu mở «{».`;
    case 'unclosed_tag':
      return `Chỗ trống ${tag} thiếu dấu đóng «}».`;
    case 'duplicate_open_tag':
      return `Chỗ trống ${tag} có hai dấu mở «{{». Mỗi chỗ trống chỉ một cặp «{…}».`;
    case 'duplicate_close_tag':
      return `Chỗ trống ${tag} có hai dấu đóng «}}». Mỗi chỗ trống chỉ một cặp «{…}».`;
    case 'unclosed_loop':
      return `Bảng lặp ${tag} mở bằng «{#…}» nhưng thiếu «{/…}» để đóng.`;
    case 'unopened_loop':
      return `Bảng lặp ${tag} có «{/…}» nhưng thiếu «{#…}» để mở.`;
    case 'closing_tag_does_not_match_opening_tag':
    case 'unbalanced_loop_tags':
      return `Bảng lặp ${tag} mở và đóng không khớp tên, hoặc lồng sai thứ tự.`;
    default:
      return 'Tệp không đọc được như một mẫu Word. Kiểm tra lại tệp là .docx (không phải .doc) và các chỗ trống viết dạng {ten_cho_trong}.';
  }
}

function errorsOf(e: unknown): string[] {
  const props = (e as { properties?: DxtErrorProperties }).properties;
  const list = props?.errors?.map((x) => explain(x.properties)) ?? [explain(props)];
  return [...new Set(list)];
}

interface Part {
  type: string;
  value?: string;
  subparsed?: Part[];
}

/**
 * Ghi lại cây chỗ trống sau khi bộ điền dịch mẫu. Không dùng `InspectModule` có sẵn: nó cần
 * `lodash` mà gói không khai phụ thuộc (bản 3.71.0), chạy lên là «Cannot find module».
 */
class TagCollector {
  readonly name = 'TagCollector';
  private file: string | null = null;
  private readonly parts = new Map<string, Part[]>();

  set(obj: { inspect?: { filePath?: string; postparsed?: Part[] } }): void {
    if (obj.inspect?.filePath) this.file = obj.inspect.filePath;
    if (obj.inspect?.postparsed && this.file) this.parts.set(this.file, obj.inspect.postparsed);
  }

  tags(): TemplateTags {
    const out: TemplateTags = {};
    const walk = (parts: Part[], into: Record<string, Record<string, unknown>>) => {
      for (const part of parts) {
        if (part.type !== 'placeholder' || !part.value) continue;
        const slot = (into[part.value] ??= {});
        if (part.subparsed) walk(part.subparsed, slot as Record<string, Record<string, unknown>>);
      }
    };
    for (const parts of this.parts.values()) walk(parts, out);
    return out;
  }
}

function open(buffer: ArrayBuffer, modules: TagCollector[] = []): Docxtemplater {
  return new Docxtemplater(new PizZip(buffer), {
    modules,
    paragraphLoop: true,
    // Lỗi mẫu đã được dịch sang tiếng Việt cho người dùng; không đổ JSON tiếng Anh ra console.
    errorLogging: false,
    linebreaks: true,
    nullGetter: () => TEMPLATE_BLANK,
  });
}

/** Đọc mẫu: cú pháp đúng chưa, dùng những chỗ trống nào, chỗ nào hệ thống không biết. */
export function inspectTemplate(buffer: ArrayBuffer): InspectResult {
  try {
    const collector = new TagCollector();
    open(buffer, [collector]);
    const tags = collector.tags();
    return { ok: true, tags, unknown: unknownTemplateTags(tags) };
  } catch (e) {
    return { ok: false, errors: errorsOf(e) };
  }
}

/** Điền mẫu. Ô `null` in dải chấm để điền tay; bảng lặp rỗng không in dòng nào. */
export function fillTemplate(buffer: ArrayBuffer, data: Record<string, TemplateValue>): Blob {
  const doc = open(buffer);
  doc.render(data);
  return doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME }) as Blob;
}

/** Tên tệp an toàn: bỏ ký tự hệ điều hành cấm, giữ chữ có dấu. */
export function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lưu một Blob thành tệp trên máy người dùng. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------------------------
// Mẫu ví dụ — cho người soạn mẫu thấy cách viết chỗ trống. KHÔNG phải mẫu pháp chế của NVG.
// ---------------------------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function run(text: string, bold = false): string {
  return `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(content: string | string[], opts: { center?: boolean; bold?: boolean } = {}): string {
  const runs = (Array.isArray(content) ? content : [content])
    .map((t, i) => run(t, opts.bold || (Array.isArray(content) && i === 0 && t.endsWith(':'))))
    .join('');
  const pPr = opts.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : '';
  return `<w:p>${pPr}${runs}</w:p>`;
}

function cell(text: string, bold = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(text, { bold })}</w:tc>`;
}

function table(header: string[], row: string[]): string {
  const border =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
      .join('') +
    '</w:tblBorders>';
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${border}</w:tblPr>` +
    `<w:tr>${header.map((h) => cell(h, true)).join('')}</w:tr>` +
    `<w:tr>${row.map((c) => cell(c)).join('')}</w:tr></w:tbl>`
  );
}

const SAMPLE_BODY = [
  para('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { center: true, bold: true }),
  para('Độc lập - Tự do - Hạnh phúc', { center: true }),
  para(''),
  para('{loai_hop_dong}', { center: true, bold: true }),
  para('Số: {so_hop_dong}', { center: true }),
  para(
    '(Mẫu ví dụ của hệ thống để minh hoạ cách viết chỗ trống — thay bằng mẫu do pháp chế NVG soạn.)',
    { center: true },
  ),
  para(
    'Căn cứ Bộ luật Dân sự năm 2015; Luật Xây dựng số 135/2025/QH15; Nghị định số 210/2026/NĐ-CP và nhu cầu của hai bên.',
  ),
  para(
    'Hôm nay, ngày {ngay_ky_ngay} tháng {ngay_ky_thang} năm {ngay_ky_nam}, tại {dia_diem}, chúng tôi gồm:',
  ),
  para(['BÊN A:', ' {ben_a_ten}']),
  para('Đại diện: {ben_a_dai_dien} — Chức vụ: {ben_a_chuc_vu}'),
  para('Địa chỉ: {ben_a_dia_chi}'),
  para('Mã số thuế: {ben_a_ma_so_thue} — Điện thoại: {ben_a_dien_thoai}'),
  para(['BÊN B:', ' {ben_b_ten}']),
  para('Đại diện: {ben_b_dai_dien} — Chức vụ: {ben_b_chuc_vu}'),
  para('Địa chỉ: {ben_b_dia_chi}'),
  para('Mã số thuế: {ben_b_ma_so_thue} — Điện thoại: {ben_b_dien_thoai}'),
  para('Tài khoản: {ben_b_so_tai_khoan} tại {ben_b_ngan_hang}'),
  para('Hai bên thống nhất ký hợp đồng «{ten_hop_dong}» với các điều khoản sau:'),
  para('Điều 1. Phạm vi công việc', { bold: true }),
  para('{#pham_vi}'),
  para('{stt}. {noi_dung}'),
  para('{/pham_vi}'),
  para('Điều 2. Giá trị hợp đồng', { bold: true }),
  para('Hình thức giá: {hinh_thuc_gia}.'),
  para(
    'Giá trị hợp đồng: {gia_tri} (bằng chữ: {gia_tri_bang_chu}), đã bao gồm thuế GTGT {thue_suat}.',
  ),
  para('Trong đó: giá trị trước thuế {gia_tri_truoc_thue}; tiền thuế GTGT {tien_thue}.'),
  para('Điều 3. Thời gian thực hiện', { bold: true }),
  para('Từ ngày {ngay_bat_dau} đến ngày {ngay_ket_thuc}.'),
  para('Điều 4. Tiến độ thanh toán', { bold: true }),
  table(
    ['Đợt', 'Nội dung', 'Tỷ lệ', 'Số tiền', 'Hạn'],
    ['{#dot_thanh_toan}{stt}', '{noi_dung}', '{ty_le}', '{so_tien}', '{han}{/dot_thanh_toan}'],
  ),
  para('Điều 5. Tạm ứng và bảo lãnh', { bold: true }),
  para('{#tam_ung}'),
  para('Tạm ứng {stt}: {noi_dung} — {so_tien}.'),
  para('{/tam_ung}'),
  para('{#bao_lanh}'),
  para('Bảo lãnh {stt}: {noi_dung} — {so_tien}, hiệu lực tới {han}.'),
  para('{/bao_lanh}'),
  para('Điều 6. Bảo hành', { bold: true }),
  para('{#bao_hanh}'),
  para('{noi_dung}'),
  para('{/bao_hanh}'),
  para('Điều 7. Phạt vi phạm', { bold: true }),
  para('{#phat}'),
  para('{noi_dung} {ty_le}'),
  para('{/phat}'),
  para('Điều 8. Quyết toán và thanh lý', { bold: true }),
  para('{#quyet_toan}'),
  para('{noi_dung}'),
  para('{/quyet_toan}'),
  para('Điều 9. Điều khoản chung', { bold: true }),
  para('(Nội dung do pháp chế NVG soạn: bất khả kháng, tranh chấp, hiệu lực, số bản…)'),
  para(''),
  para('ĐẠI DIỆN BÊN A                                        ĐẠI DIỆN BÊN B', {
    center: true,
    bold: true,
  }),
  para('{ben_a_dai_dien}                                        {ben_b_dai_dien}', {
    center: true,
  }),
].join('');

/** Dựng tệp mẫu ví dụ `.docx` (Times New Roman 13). */
export function buildSampleTemplate(): Blob {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
      '<w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults></w:styles>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${SAMPLE_BODY}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>',
  );
  return zip.generate({ type: 'blob', mimeType: DOCX_MIME }) as Blob;
}
