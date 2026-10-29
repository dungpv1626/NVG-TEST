/**
 * Mẫu Word báo giá DEMO (db/seed-assets/quote-templates, build.mjs — 0239) và bản ví dụ tải về ở trang Mẫu hợp
 * đồng (web/public/mau/bao-gia-vi-du.docx — 0240).
 *
 * Seed nạp thẳng các tệp này, không qua màn hình tải mẫu, nên phép thử thay chỗ kiểm lúc chọn tệp: đọc được bằng
 * đúng bộ điền, mọi chỗ trống có trong danh mục báo giá (`unknownQuoteTemplateTags`), cây chỗ trống khớp manifest, và
 * bản ví dụ tải lên lại được nguyên vẹn (cùng kiểm như khi NVG chọn tệp). Ngược lại, mẫu hợp đồng bị kiểm báo giá
 * phải báo chỗ trống lạ — hai danh mục không lẫn nhau.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { buildQuoteDocumentData, unknownQuoteTemplateTags, type TemplateValue } from '@nvg/shared';
import { fillTemplate, inspectTemplate } from '../docx-template';

const ROOT = join(__dirname, '../../../..');

function load(path: string): ArrayBuffer {
  const buf = readFileSync(join(ROOT, path));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('mẫu Word báo giá', () => {
  for (const code of ['NVC', 'NVO', 'NVS']) {
    it(`${code}: hợp lệ theo danh mục báo giá, khớp manifest`, () => {
      const dir = `db/seed-assets/quote-templates/${code}`;
      const [m] = JSON.parse(readFileSync(join(ROOT, dir, 'manifest.json'), 'utf-8')) as {
        file: string;
        tags: Record<string, unknown>;
      }[];
      const r = inspectTemplate(load(`${dir}/${m!.file}`), unknownQuoteTemplateTags);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.unknown).toEqual([]);
      expect(r.tags).toEqual(m!.tags);
    });
  }

  it('bản ví dụ tải về: qua được kiểm lúc chọn tệp và điền ra số tiền', () => {
    const buffer = load('web/public/mau/bao-gia-vi-du.docx');
    const r = inspectTemplate(buffer, unknownQuoteTemplateTags);
    expect(r.ok && r.unknown).toEqual([]);
    const data = buildQuoteDocumentData({
      quote: {
        code: 'NVC-BG-THU',
        version: 1,
        status: 'completed',
        created_at: '2026-10-29',
        valid_until: null,
        notes: null,
        total_value: 2_000_000,
        discount_amount: null,
        vat_rate: null,
        vat_included: null,
        line_items_based: true,
      },
      items: [
        {
          position: 1,
          description: 'Đào móng',
          unit: 'm3',
          quantity: 2,
          unit_price: 1_000_000,
          amount: 2_000_000,
        },
      ],
      company: null,
      customer: null,
      opportunityName: null,
      preparedBy: null,
    });
    const out = fillTemplate(buffer, data as unknown as Record<string, TemplateValue>);
    return out.arrayBuffer().then((b) => {
      const xml = new PizZip(b)
        .file('word/document.xml')!
        .asText()
        .replace(/<[^>]+>/g, '');
      expect(xml).toContain('Đào móng');
      expect(xml).toContain('2.000.000 đồng');
      expect(xml).not.toMatch(/\{[#/]?[a-z_]+\}/);
    });
  });

  it('mẫu hợp đồng kiểm theo danh mục báo giá thì báo chỗ trống lạ', () => {
    const r = inspectTemplate(
      load(
        'db/seed-assets/contract-templates/NVC/NVC-HD-01_Hop_dong_thi_cong_xay_dung_voi_CDT.docx',
      ),
      unknownQuoteTemplateTags,
    );
    expect(r.ok && r.unknown.length).toBeGreaterThan(0);
  });
});
