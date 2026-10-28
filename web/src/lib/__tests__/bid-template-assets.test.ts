/**
 * Bộ biểu mẫu hồ sơ dự thầu NVC (db/seed-assets/bid-templates, sinh bằng convert_bid.py — 0236).
 *
 * Seed nạp thẳng các tệp này, không qua màn hình tải mẫu, nên phép thử thay chỗ kiểm lúc chọn tệp: mỗi mẫu đọc được
 * bằng ĐÚNG bộ điền của hệ thống, mọi chỗ trống đều có trong danh mục (`da-bid-forms.ts`), cây chỗ trống khớp
 * manifest (seed ghi vào `contract_templates.tags`), dòng gợi ý của bảng khớp danh mục, không còn chữ in cứng của
 * NVC (tên, mã số thuế, người đại diện) hay ghi chú soạn thảo, và điền ra được tên pháp nhân + giá.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import {
  BID_FORM_LOOPS,
  buildBidFormData,
  unknownBidFormTags,
  type TemplateValue,
} from '@nvg/shared';
import { fillTemplate, inspectTemplate } from '../docx-template';

const DIR = join(__dirname, '../../../../db/seed-assets/bid-templates/NVC');

interface ManifestEntry {
  file: string;
  code: string;
  document_kind: 'ho_so_du_thau' | 'thuong_thao';
  tags: Record<string, Record<string, unknown>>;
  loops: Record<string, { columns: string[]; default_rows: Record<string, string>[] }>;
  free_fields: { key: string; article: string; before: string }[];
}

const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf-8')) as ManifestEntry[];

function load(file: string): ArrayBuffer {
  const buf = readFileSync(join(DIR, file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const textOf = (buffer: ArrayBuffer) =>
  new PizZip(buffer)
    .file('word/document.xml')!
    .asText()
    .replace(/<[^>]+>/g, '');

function toBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error('Không đọc được tệp.'));
    r.readAsArrayBuffer(blob);
  });
}

describe('bộ biểu mẫu hồ sơ dự thầu NVC', () => {
  it('hai mẫu (hồ sơ dự thầu, biên bản thương thảo), tệp nào trong thư mục cũng có trong manifest', () => {
    expect(manifest.map((m) => m.document_kind).sort()).toEqual(['ho_so_du_thau', 'thuong_thao']);
    const files = readdirSync(DIR).filter((f) => f.endsWith('.docx'));
    expect(files.sort()).toEqual(manifest.map((m) => m.file).sort());
  });

  it.each(manifest.map((m) => [m.code, m] as const))(
    '%s đọc được, mọi chỗ trống có trong danh mục, khớp manifest',
    (_, m) => {
      const result = inspectTemplate(load(m.file));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(unknownBidFormTags(result.tags)).toEqual([]);
      expect(result.tags).toEqual(m.tags);
      const freeKeys = Object.keys(result.tags).filter((k) => /^o_\d+$/.test(k));
      expect(freeKeys.sort()).toEqual(m.free_fields.map((f) => f.key).sort());
      // Số định danh cá nhân (CCCD) không nhập vào hệ thống — giữ dải chấm điền tay (CLAUDE.md 9.5 câu 12).
      expect(m.free_fields.filter((f) => /định danh cá nhân:\s*$/.test(f.before))).toEqual([]);
      const text = textOf(load(m.file));
      expect(text).not.toContain('Ghi chú soạn thảo');
      // Chữ in cứng của pháp nhân phải thành chỗ trống — đổi người đại diện thì văn bản đổi theo.
      for (const hard of ['BÙI VĂN THI', '1001004344', 'Lê Quý Đôn', 'PHÁT TRIỂN NHÀ VIỆT']) {
        expect(text).not.toContain(hard);
      }
      // Phần C (sổ theo dõi nội bộ) không đi vào văn bản nộp.
      expect(text).not.toContain('SỔ THEO DÕI GÓI THẦU');
    },
  );

  it('dòng gợi ý của bảng kê trong mẫu khớp danh mục', () => {
    const bid = manifest.find((m) => m.document_kind === 'ho_so_du_thau')!;
    expect(Object.keys(bid.loops).sort()).toEqual(Object.keys(BID_FORM_LOOPS).sort());
    for (const [name, loop] of Object.entries(bid.loops)) {
      expect(loop.default_rows).toEqual(BID_FORM_LOOPS[name]!.defaultRows);
      expect(loop.columns.filter((c) => c !== 'stt')).toEqual(
        BID_FORM_LOOPS[name]!.columns.map((c) => c.key),
      );
    }
  });

  it.each(manifest.map((m) => [m.code, m] as const))(
    '%s điền ra tên pháp nhân, gói thầu, giá; không còn chỗ trống chưa thay',
    async (_, m) => {
      const data = buildBidFormData(
        {
          company: {
            legal_name: 'Pháp nhân NVC thử',
            tax_code: '0000000001',
            address: 'Địa chỉ thử',
            legal_representative: 'Người đại diện thử',
            representative_title: 'Giám đốc',
          },
          bid: { name: 'Gói thầu thử', project_name: 'Dự án thử', inviter: 'Bên mời thầu thử' },
          approvedBidPrice: '1000000000',
        },
        { giam_mode: 'khong', vat_mode: 'gom', vat_rate: '8' },
      );
      const text = textOf(
        await toBuffer(
          fillTemplate(load(m.file), data as unknown as Record<string, TemplateValue>),
        ),
      );
      expect(text).toContain('Pháp nhân NVC thử');
      expect(text).toContain('Gói thầu thử');
      expect(text).toContain('1.000.000.000 đồng');
      if (m.document_kind === 'ho_so_du_thau') {
        expect(text).toContain('Người đại diện thử');
        expect(text).toContain('Bên mời thầu thử');
        expect(text).toContain('Một tỷ đồng');
        expect(text).toContain('Chỉ huy trưởng');
      }
      expect(text).not.toMatch(/\{[#/]?[a-z0-9_]+\}/);
    },
  );
});
