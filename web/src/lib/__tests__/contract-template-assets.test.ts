/**
 * Bộ mẫu hợp đồng của ba pháp nhân (db/seed-assets/contract-templates, sinh bằng convert.py).
 *
 * Seed nạp thẳng các tệp này — không qua màn hình tải mẫu, nên không ai kiểm cú pháp lúc chọn
 * tệp. Phép thử thay chỗ đó: mỗi mẫu phải đọc được bằng ĐÚNG bộ điền của hệ thống, không có
 * chỗ trống lạ, cây chỗ trống khớp manifest (seed ghi vào `contract_templates.tags`), và điền ra
 * được tên hai bên + giá trị.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { CONTRACT_TYPES, buildTemplateData, type ContractType } from '@nvg/shared';
import { fillTemplate, inspectTemplate } from '../docx-template';

const ROOT = join(__dirname, '../../../../db/seed-assets/contract-templates');

interface ManifestEntry {
  file: string;
  code: string;
  title: string;
  contract_type: ContractType;
  tags: Record<string, Record<string, unknown>>;
  payment_milestones: { noi_dung: string; ty_le: string | null }[];
}

const entries = ['NVC', 'NVO', 'NVS'].flatMap((company) => {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, company, 'manifest.json'), 'utf-8'),
  ) as ManifestEntry[];
  return manifest.map((m) => ({ company, ...m }));
});

function load(company: string, file: string): ArrayBuffer {
  const buf = readFileSync(join(ROOT, company, file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function toBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error('Không đọc được tệp.'));
    r.readAsArrayBuffer(blob);
  });
}

describe('bộ mẫu hợp đồng NVC / NVO / NVS', () => {
  it('có đủ 21 mẫu, tệp nào trong thư mục cũng có trong manifest', () => {
    expect(entries).toHaveLength(21);
    for (const company of ['NVC', 'NVO', 'NVS']) {
      const files = readdirSync(join(ROOT, company)).filter((f) => f.endsWith('.docx'));
      const listed = entries.filter((e) => e.company === company).map((e) => e.file);
      expect(files.sort()).toEqual(listed.sort());
    }
  });

  it.each(entries.map((e) => [e.code, e] as const))(
    '%s đọc được, không có chỗ trống lạ',
    (_, e) => {
      expect(CONTRACT_TYPES).toContain(e.contract_type);
      const result = inspectTemplate(load(e.company, e.file));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.unknown).toEqual([]);
      expect(result.tags).toEqual(e.tags);
      // Không còn ghi chú soạn thảo nào lọt vào văn bản gửi khách.
      const xml = new PizZip(load(e.company, e.file)).file('word/document.xml')!.asText();
      expect(xml.replace(/<[^>]+>/g, '')).not.toContain('Ghi chú soạn thảo');
    },
  );

  it.each(entries.map((e) => [e.code, e] as const))(
    '%s điền ra tên hai bên và giá trị',
    async (_, e) => {
      const data = buildTemplateData({
        contract: {
          code: 'X-HD-2026-0001',
          contract_number: '01/2026',
          title: 'Công trình thử',
          type: e.contract_type,
          price_form: null,
          value: '1000000000',
          vat_rate: null,
          signed_date: '2026-10-21',
          start_date: null,
          end_date: null,
          project_location: 'Hưng Yên',
        },
        company: {
          legal_name: 'Pháp nhân NVG thử',
          tax_code: '1001004344',
          address: null,
          phone: null,
          email: null,
          legal_representative: 'Bùi Văn Thi',
          representative_title: null,
          bank_account_number: null,
          bank_name: null,
        },
        partner: null,
        partner_name: 'Đối tác thử',
        terms: [],
        today: '2026-10-21',
      });
      const text = new PizZip(await toBuffer(fillTemplate(load(e.company, e.file), data)))
        .file('word/document.xml')!
        .asText()
        .replace(/<[^>]+>/g, '');
      expect(text).toContain('Pháp nhân NVG thử');
      // Hợp đồng nội bộ NVS-HĐ-05: bên thuê là NVC / NVO in sẵn, không có đối tác ngoài.
      if (e.code !== 'NVS-HĐ-05') expect(text).toContain('Đối tác thử');
      if (e.tags.gia_tri) expect(text).toContain('1.000.000.000 đồng');
      expect(text).not.toMatch(/\{[#/]?[a-z_]+\}/);
    },
  );
});
