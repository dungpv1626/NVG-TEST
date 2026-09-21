/**
 * Ẩn danh đầu bài + khảo sát cho nhánh AI (T12).
 *
 * Đây là kiểm thử của một CHÍNH SÁCH DỮ LIỆU: danh tính khách không đi ra nhà cung cấp ngoài,
 * kể cả khi nó nằm giữa chữ tự do, và một trường mới thêm vào đầu bài không tự đi theo.
 */

import { describe, expect, it } from 'vitest';
import type { DesignBrief } from '@nvg/shared/design';
import { AI_DIGEST_DATA_CLASS, anonymiseForAi, scrubIdentity } from '../brief/anonymise';

const brief = (over: Partial<DesignBrief> = {}): DesignBrief =>
  ({
    schema_version: '1.2.0',
    project_id: '11111111-1111-4111-8111-111111111111',
    project_code: 'NVO-TK-2026-0001',
    building_type: 'biet_thu',
    locality: 'hung_yen',
    site: {
      shape: 'chu_nhat',
      width_m: 15,
      depth_m: 20,
      area_m2: 300,
      orientation: 'DN',
      access_sides: ['front'],
      adjacent: { front: 'duong', left: 'nha_lien_ke' },
      max_density: 0.6,
    },
    floors: 2,
    style: 'hien_dai',
    priorities: ['natural_light'],
    budget_range_vnd: [4_000_000_000, 5_500_000_000],
    decision_maker: { name: 'Nguyễn Văn Tuấn', relationship: 'chu_nha' },
    family: [
      { role: 'ong_ba', count: 2, needs: ['phòng ngủ hướng vườn cho bà Lan'] },
      { role: 'vo_chong', count: 2, ensuite: true },
    ],
    required_spaces: [{ type: 'kitchen', area_m2: 18, amenities: 'bếp đảo, gọi 0912 345 678' }],
    completeness_score: 0.9,
    missing_fields: [],
    ...over,
  }) as DesignBrief;

describe('scrubIdentity', () => {
  it('lược số điện thoại, email, đường dẫn, mã hồ sơ của hệ thống, dãy số dài và tên đã biết', () => {
    const out = scrubIdentity(
      'Anh Tuấn (0912 345 678, tuan@example.com) ở NVO-TK-2026-0001, CCCD 012345678901, xem https://x.vn/a. Chị Hà muốn hàng rào cao.',
      ['Nguyễn Văn Tuấn', 'Tuấn', 'Hà'],
    );
    for (const secret of [
      '0912',
      '345 678',
      'example.com',
      'NVO-TK-2026-0001',
      '012345678901',
      'https://',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).not.toMatch(/(?<!\p{L})Tuấn(?!\p{L})/u);
    expect(out).not.toMatch(/(?<!\p{L})Hà(?!\p{L})/u);
    expect(out).toContain('hàng rào cao');
  });

  it('tên đơn trùng từ thông dụng KHÔNG cắt hướng nhà, lan can, tên tỉnh — chỉ lược khi đứng sau danh xưng', () => {
    // Rà soát 08/09/2026: bản trước lược mọi chỗ xuất hiện của «Nam», «Đông», «Hà» — mất hướng
    // nhà, tức mất đúng dữ liệu hạng 2 mà bản gửi tồn tại để giữ.
    const out = scrubIdentity(
      'lan can cao 1,1 m, hướng Nam, phía Đông giáp hẻm; chị Hà ở Hà Nội; bà Lan và anh Nam cùng ở.',
      ['Lan', 'Nam', 'Đông', 'Hà'],
    );
    expect(out).toContain('lan can cao 1,1 m, hướng Nam, phía Đông giáp hẻm');
    expect(out).toContain('ở Hà Nội');
    expect(out).toContain('chị [đã lược]');
    expect(out).toContain('bà [đã lược] và anh [đã lược] cùng ở');
  });

  it('cụm tên đầy đủ lược ở mọi chỗ; số điện thoại có ngoặc và mã tiêu chuẩn xử lý đúng', () => {
    const out = scrubIdentity(
      'Chủ nhà Nguyễn Văn Tuấn, liên hệ (0912)345678 hoặc +84 912 345 678; kết cấu theo TCVN-5574-2018, hợp đồng HĐ-2026-15.',
      ['Nguyễn Văn Tuấn'],
    );
    expect(out).not.toContain('Nguyễn Văn Tuấn');
    expect(out).not.toContain('345678');
    expect(out).not.toContain('345 678');
    expect(out).not.toContain('HĐ-2026-15');
    expect(out).toContain('TCVN-5574-2018');
  });

  it('không đụng số đo và năm — chúng là dữ liệu thiết kế', () => {
    expect(scrubIdentity('lô 5,2 × 18,5 m, xây 2026, 120 m² sàn')).toBe(
      'lô 5,2 × 18,5 m, xây 2026, 120 m² sàn',
    );
  });
});

describe('anonymiseForAi', () => {
  it('khai hạng 2 CỨNG — mặt bằng kích thước thật, đã lược danh tính', () => {
    expect(AI_DIGEST_DATA_CLASS).toBe(2);
  });

  it('không mang mã hồ sơ, ngân sách, người quyết định, điểm đầy đủ; có kích thước thật', () => {
    const digest = anonymiseForAi({
      brief: brief(),
      freeText: {
        design_task: 'Nhà cho anh Tuấn ở Thái Bình',
        legal_documents: 'Sổ đỏ số 123456789',
      },
      survey: { land_width: '15.20', land_depth: 20, notes: 'Gặp chị Lan, gọi 0987654321' },
      identities: ['Nguyễn Văn Tuấn', 'Tuấn', 'Lan', '0987654321'],
    });
    const text = JSON.stringify(digest);
    for (const secret of [
      'NVO-TK-2026-0001',
      '4000000000',
      '11111111',
      'Tuấn',
      'Lan"',
      '0987',
      '123456789',
      'completeness',
      'legal_documents',
      'decision_maker',
      'budget',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    // Kích thước thật ĐI QUA — đó là toàn bộ lý do hạng 2 tồn tại.
    expect(digest.site.width_m).toBe(15);
    expect(digest.survey?.land_width_m).toBe(15.2);
    expect(digest.required_spaces[0]?.area_m2).toBe(18);
    // Chữ tự do đi qua sau khi lược.
    expect(digest.free_text.design_task).toMatch(/^Nhà cho anh \[đã lược\]/);
    expect(digest.family[0]?.needs?.[0]).toBe('phòng ngủ hướng vườn cho bà [đã lược]');
    expect(digest.required_spaces[0]?.amenities).toBe('bếp đảo, gọi [đã lược]');
  });

  it('một trường MỚI trong đầu bài không tự đi ra — hợp đồng là danh sách cho phép', () => {
    const digest = anonymiseForAi({
      brief: brief({ ghi_chu_noi_bo: 'lợi nhuận 18 %' } as unknown as Partial<DesignBrief>),
    });
    expect(JSON.stringify(digest)).not.toContain('lợi nhuận');
  });

  it('đầu bài nhập tay (không khảo sát) thì survey là null, không bịa', () => {
    expect(anonymiseForAi({ brief: brief() }).survey).toBeNull();
  });
});

describe('trường đầu bài 1.4.0 đi tới mô hình (13/09/2026)', () => {
  it('lối vào, lối xe, tường ranh, khoảng sân và số xe có mặt trong bản gửi', () => {
    const digest = anonymiseForAi({
      brief: brief({
        site: {
          width_m: 15,
          depth_m: 20,
          access_sides: ['front', 'left'],
          main_entrance_side: 'front',
          vehicle_entrance_side: 'front',
          boundary_walls: { right: 'chung' },
        },
        massing: { yards: ['san_ben'], yard_depth_m: { left: 3 } },
        parking: { cars: 1, motorbikes: 2 },
      }),
    });
    expect(digest.site.main_entrance_side).toBe('front');
    expect(digest.site.vehicle_entrance_side).toBe('front');
    expect(digest.site.boundary_walls).toEqual({
      front: null,
      back: null,
      left: null,
      right: 'chung',
    });
    expect(digest.massing?.yard_depth_m).toEqual({ left: 3 });
    expect(digest.parking).toEqual({ cars: 1, motorbikes: 2, car_size: null, ev_charging: null });
  });

  it('đầu bài cũ không có các trường ấy vẫn dựng được bản gửi', () => {
    const digest = anonymiseForAi({ brief: brief() });
    expect(digest.site.main_entrance_side).toBeNull();
    expect(digest.parking).toBeNull();
  });
});
