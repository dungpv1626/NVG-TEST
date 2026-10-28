/**
 * Tài liệu gửi mô hình khi điền sẵn đầu bài: lược danh tính khách (hạng 2, T12), không gửi người quyết định /
 * ngân sách của báo cáo CRM, và lời dẫn mang mã lựa chọn của biểu mẫu. Giả lập chỉ dựng từ số đo thật.
 */

import { describe, expect, it } from 'vitest';
import { BRIEF_FORM } from '@nvg/shared/design';
import {
  customerIdentities,
  fakePrefill,
  prefillDocument,
  prefillPrompt,
  type PrefillSources,
} from '../brief-prefill';

const sources: PrefillSources = {
  designSurvey: {
    land_width: '5.00',
    land_depth: '18.00',
    land_area: null,
    orientation: 'Đông Nam',
    measurement_notes: 'Đo cùng anh Nguyễn Văn Thử, gọi 0912 345 678 khi cần.',
    surrounding_notes: null,
    usage_notes: 'Gia đình 5 người, ông bà ở tầng 1.',
    notes: null,
  },
  transcripts: ['Nhà tôi ở 12 Lê Lợi, muốn phong cách hiện đại.'],
  legacy: { design_task: null, functional_needs: null, style_note: null, site_condition: null },
  crm: {
    needs: 'Nhà phố 4 tầng',
    notes: null,
    details: [{ label: 'Hướng nhà', value: 'Đông Nam' }],
  },
};
const identities = ['Nguyễn Văn Thử', '0912345678', '12 Lê Lợi'];

describe('brief-prefill (Worker)', () => {
  it('lược tên, điện thoại, địa chỉ khách khỏi tài liệu', () => {
    const doc = prefillDocument(sources, identities);
    expect(doc).not.toContain('Nguyễn Văn Thử');
    expect(doc).not.toContain('0912 345 678');
    expect(doc).not.toContain('12 Lê Lợi');
    expect(doc).toContain('Chiều rộng lô đo được: 5.00 m');
    expect(doc).toContain('ông bà ở tầng 1');
    expect(doc).toContain('Báo cáo khảo sát của Kinh doanh');
  });

  it('lược cả tên gọi sau danh xưng («anh Mẫu»), không cắt chữ thường trùng tên', () => {
    const ids = customerIdentities({ name: 'Anh Trần Văn Mẫu (thử)', phone: null, address: null });
    const doc = prefillDocument(
      {
        designSurvey: null,
        transcripts: ['Nhà tôi là anh Mẫu. Thích mẫu nhà hiện đại.'],
        legacy: null,
        crm: null,
      },
      ids,
    );
    expect(doc).not.toContain('anh Mẫu');
    expect(doc).toContain('mẫu nhà hiện đại');
  });

  it('không có nguồn nào thì tài liệu rỗng — tuyến báo «chưa có gì để đọc», không gọi mô hình', () => {
    expect(
      prefillDocument({ designSurvey: null, transcripts: [], legacy: null, crm: null }, []),
    ).toBe('');
  });

  it('lời dẫn liệt kê câu kèm mã lựa chọn', () => {
    const prompt = prefillPrompt(BRIEF_FORM, 'tài liệu');
    expect(prompt).toContain(
      '- building_type | Loại hình công trình | chọn một — lựa chọn: nha_pho=Nhà phố',
    );
    expect(prompt).toContain('tài liệu');
  });

  it('giả lập chỉ đề xuất số đo có thật trên biên bản', () => {
    const paths = fakePrefill(sources).map((s) => s.path);
    expect(paths).toEqual(['site.width_m', 'site.depth_m', 'style']);
  });
});
