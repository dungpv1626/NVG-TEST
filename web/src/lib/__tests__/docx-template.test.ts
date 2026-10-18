import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_BLANK, buildTemplateData, type TemplateSource } from '@nvg/shared';
import { buildSampleTemplate, fillTemplate, inspectTemplate } from '../docx-template';

/** Blob của jsdom không phải lúc nào cũng có `arrayBuffer()` — đọc qua FileReader. */
function toBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error('Không đọc được tệp.'));
    r.readAsArrayBuffer(blob);
  });
}

function documentText(buffer: ArrayBuffer): string {
  const xml = new PizZip(buffer).file('word/document.xml')!.asText();
  return xml.replace(/<[^>]+>/g, '');
}

/** Một tệp .docx tối giản với đúng một đoạn văn. */
function docxWith(text: string): ArrayBuffer {
  const base = new PizZip();
  base.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  base.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  base.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return base.generate({ type: 'arraybuffer' });
}

const source: TemplateSource = {
  contract: {
    code: 'NVC-HD-2026-0007',
    contract_number: '07/2026/HĐTC',
    title: 'Thi công nhà xưởng Tân Uyên',
    type: 'thi_cong',
    price_form: 'tron_goi',
    value: '1100000000',
    vat_rate: '10',
    signed_date: '2026-10-05',
    start_date: '2026-10-10',
    end_date: null,
    project_location: 'KCN Tân Uyên, Bình Dương',
  },
  company: {
    legal_name: 'Công ty Cổ phần Nhà Việt Cons',
    tax_code: '0312345678',
    address: 'TP. Hồ Chí Minh',
    phone: null,
    email: null,
    legal_representative: 'Nguyễn Văn A',
    representative_title: 'Giám đốc',
    bank_account_number: null,
    bank_name: null,
  },
  partner: null,
  partner_name: 'Công ty TNHH Khách & Cộng sự',
  terms: [
    {
      term_type: 'tien_do_thanh_toan',
      description: 'Tạm ứng khi ký',
      amount: '330000000',
      percent_value: '30',
      due_date: '2026-10-12',
      position: '1',
    },
    {
      term_type: 'tien_do_thanh_toan',
      description: 'Nghiệm thu bàn giao',
      amount: '770000000',
      percent_value: '70',
      due_date: null,
      position: '2',
    },
  ],
  today: '2026-10-16',
};

describe('mẫu hợp đồng Word', () => {
  it('mẫu ví dụ chỉ dùng chỗ trống hệ thống biết', async () => {
    const result = inspectTemplate(await toBuffer(buildSampleTemplate()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unknown).toEqual([]);
    expect(Object.keys(result.tags)).toEqual(
      expect.arrayContaining(['ben_a_ten', 'gia_tri_bang_chu', 'dot_thanh_toan']),
    );
    expect(Object.keys(result.tags.dot_thanh_toan!)).toEqual(
      expect.arrayContaining(['stt', 'so_tien', 'han']),
    );
  });

  it('điền đủ: giá trị, bằng chữ, mỗi đợt một dòng bảng; ô thiếu in dải chấm', async () => {
    const template = await toBuffer(buildSampleTemplate());
    const filled = await toBuffer(fillTemplate(template, buildTemplateData(source)));
    const text = documentText(filled);
    expect(text).toContain('Số: 07/2026/HĐTC');
    expect(text).toContain('1.100.000.000 đồng (bằng chữ: Một tỷ một trăm triệu đồng)');
    expect(text).toContain('Tạm ứng khi ký');
    expect(text).toContain('Nghiệm thu bàn giao');
    expect(text).toContain('12/10/2026');
    // Đối tác ngoài danh mục: tên có ký tự «&» vẫn ra đúng, không vỡ XML.
    expect(text).toContain('Công ty TNHH Khách &amp; Cộng sự');
    // Chưa khai ngày kết thúc / tài khoản → dải chấm để điền tay, không bịa.
    expect(text).toContain(`đến ngày ${TEMPLATE_BLANK}`);
    expect(text).not.toMatch(/\{[a-z_#/]+\}/);
  });

  it('báo chỗ trống lạ và lỗi cú pháp bằng tiếng Việt', () => {
    const unknown = inspectTemplate(docxWith('Kính gửi {ten_khach}'));
    expect(unknown).toMatchObject({ ok: true, unknown: ['ten_khach'] });

    const broken = inspectTemplate(docxWith('Giá trị {gia_tri'));
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.errors.join(' ')).toMatch(/thiếu dấu đóng/);

    const loop = inspectTemplate(docxWith('{#dot_thanh_toan}{stt}'));
    expect(loop.ok).toBe(false);
  });
});
