/**
 * Đúc artifact `design_brief` và cổng chặn Lớp 2 (Mốc 2).
 *
 * Hai điều test này giữ, và cả hai đều hỏng trong im lặng nếu không có nó:
 *
 *  1. **Điểm do máy khách gửi lên bị bỏ.** Con số trong artifact quyết định Lớp 2 có chạy
 *     hay không, mà artifact thì bất biến — tin trình duyệt nghĩa là bất kỳ ai gọi được
 *     endpoint cũng vượt cổng chặn bằng một dòng JSON.
 *  2. **Ngưỡng đọc từ cấu hình, không có số dự phòng viết cứng.** Cấu hình bị xoá nhầm phải
 *     làm hệ thống DỪNG và nói ra, không phải lặng lẽ chạy theo một con số trong mã.
 */

import { describe, expect, it } from 'vitest';
import {
  BRIEF_FORM,
  BRIEF_SCHEMA_VERSION,
  scoreBrief,
  type DesignBriefDraft,
} from '@nvg/shared/design';
import { buildBriefPayload, BriefPayloadError } from '../brief/payload';
import { gateLayer2 } from '../brief/gate';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

const full: DesignBriefDraft = {
  building_type: 'nha_pho',
  locality: 'hung_yen',
  site: {
    width_m: 5,
    depth_m: 18,
    orientation: 'DN',
    access_sides: ['front'],
    adjacent: { left: 'nha_hang_xom' },
    legal_docs_available: true,
  },
  floors: 4,
  family: [{ role: 'vo_chong', count: 2 }],
  required_spaces: [{ type: 'living' }, { type: 'kitchen' }, { type: 'bedroom' }],
  style: 'hien_dai',
  budget_range_vnd: [2_000_000_000, 3_000_000_000],
  priorities: ['natural_light'],
  decision_maker: { name: 'Chủ nhà', relationship: 'chu_nha' },
};

const build = (structured: unknown) =>
  buildBriefPayload({ structured, projectId: PROJECT_ID, projectCode: 'NVO-TK-2026-0001' });

describe('Dựng payload artifact đầu bài', () => {
  it('Worker cấp khoá ngoại, mã hồ sơ và phiên bản hợp đồng', () => {
    // Ba trường này KHÔNG lấy từ máy khách: hai cái đầu đọc từ CSDL, cái thứ ba là hình dạng
    // hợp đồng đang dùng.
    const { payload } = build(full);
    expect(payload.project_id).toBe(PROJECT_ID);
    expect(payload.project_code).toBe('NVO-TK-2026-0001');
    // So với hằng số chứ không viết cứng chuỗi: tăng phiên bản hợp đồng là việc bình thường,
    // và một phép thử đỏ vì lý do đó chỉ dạy người đọc thói quen sửa test cho xanh.
    expect(payload.schema_version).toBe(BRIEF_SCHEMA_VERSION);
  });

  it('BỎ HẲN điểm do máy khách gửi lên', () => {
    const { payload, completenessScore } = build({ ...full, completeness_score: 0.99 });
    const honest = scoreBrief(full, BRIEF_FORM);
    expect(completenessScore).toBeCloseTo(honest.score);
    expect(payload.completeness_score).toBeCloseTo(honest.score);
    expect(payload.completeness_score).not.toBe(0.99);
  });

  it('bỏ luôn danh sách còn thiếu do máy khách gửi lên', () => {
    const { payload } = build({ ...full, missing_fields: [] });
    expect(payload.missing_fields).toEqual(scoreBrief(full, BRIEF_FORM).missingFields);
  });

  it('thiếu trường bắt buộc thì báo bằng NHÃN tiếng Việt, không phải tên cột', () => {
    // Lỗi thô của lớp hợp đồng là "locality — Required": đúng với người viết mã, vô nghĩa
    // với kiến trúc sư đang ngồi trước màn hình.
    try {
      build({ building_type: 'nha_pho', site: { width_m: 5, depth_m: 18 }, floors: 4 });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Địa phương');
      expect(message).not.toContain('locality');
      expect(message).not.toContain('Required');
      return;
    }
    throw new Error('Lẽ ra phải bị chặn.');
  });

  it('đầu bài trống báo thiếu chứ không dựng ra một artifact rỗng', () => {
    expect(() => build({})).toThrow(BriefPayloadError);
  });

  it('khoá lạ trong đầu bài bị chặn, kèm tên trường', () => {
    try {
      build({ ...full, khoa_bia: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(BriefPayloadError);
      expect((error as BriefPayloadError).retryable).toBe(false);
      return;
    }
    throw new Error('Lẽ ra phải bị chặn.');
  });

  it('trả kèm danh sách mâu thuẫn để lớp gọi hiển thị', () => {
    const { issues } = build({ ...full, budget_range_vnd: [3_000_000_000, 2_000_000_000] });
    expect(issues.map((i) => i.code)).toContain('ngan_sach_dao_nguoc');
  });

  it('cùng đầu bài cho cùng payload — điều kiện để mã băm lặp lại được', () => {
    expect(JSON.stringify(build(full).payload)).toBe(JSON.stringify(build(full).payload));
  });
});

describe('Cổng chặn Lớp 2', () => {
  const brief = (score: number, missing: string[] = []) => ({
    completeness_score: score,
    missing_fields: missing,
  });

  it('đủ điểm thì đi tiếp', () => {
    expect(gateLayer2(brief(0.8), 0.7).allowed).toBe(true);
  });

  it('bằng đúng ngưỡng vẫn đi tiếp', () => {
    // Tài liệu ghi "nhỏ hơn ngưỡng thì không được chạy" — bằng thì được. Cài thành `>` sẽ
    // chặn đúng những đầu bài vừa đủ, và không ai hiểu vì sao.
    expect(gateLayer2(brief(0.7), 0.7).allowed).toBe(true);
  });

  it('thiếu điểm thì chặn, và nói ra còn thiếu gì', () => {
    const result = gateLayer2(brief(0.5, ['site.width_m', 'floors']), 0.7);
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('50%');
    expect(result.message).toContain('70%');
    expect(result.message).toContain('site.width_m');
  });

  it('đầu bài không có điểm coi như 0, không coi như đủ', () => {
    expect(gateLayer2({}, 0.7).allowed).toBe(false);
  });

  it('chưa cấu hình ngưỡng thì DỪNG, không rơi về một con số viết cứng', () => {
    // Có số dự phòng trong mã nghĩa là cấu hình bị xoá nhầm sẽ không ai biết — hệ thống cứ
    // chạy theo con số trong mã, đúng thứ "ngưỡng để trong config" sinh ra để tránh.
    const result = gateLayer2(brief(0.9), null);
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('Chưa cấu hình');
  });
});

describe('Cổng chặn — mâu thuẫn NGHIÊM TRỌNG (13/09/2026)', () => {
  it('đủ điểm mà đầu bài tự nói ngược chính nó thì vẫn chặn, và nói ra mâu thuẫn nào', () => {
    const conflicted = {
      completeness_score: 0.98,
      missing_fields: [],
      building_type: 'biet_thu',
      floors: 2,
      site: { width_m: 15, depth_m: 20, access_sides: ['front'], main_entrance_side: 'back' },
    };
    const result = gateLayer2(conflicted, 0.7);
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('mâu thuẫn nghiêm trọng');
    expect(result.message).toContain('Mặt tiếp cận được');
  });

  it('chỉ có CẢNH BÁO thì vẫn cho chạy', () => {
    const warned = {
      completeness_score: 0.9,
      missing_fields: [],
      massing: { wings_preferred: 2, footprint_shape: 'chu_nhat' },
    };
    expect(gateLayer2(warned, 0.7).allowed).toBe(true);
  });
});
