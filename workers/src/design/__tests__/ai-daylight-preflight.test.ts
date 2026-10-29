/**
 * Kiểm ánh sáng TRƯỚC lượt «Xếp mặt bằng» (29/10/2026). Lượt thật a66f4aa0 trên 9272 (biệt thự 15 × 20 m, chỉ thoáng mặt
 * trước + mặt trái) tốn 0,577 USD rồi ra phương án có ba phòng tối — phần ấy biết được từ đầu bài, không cần gọi mô hình.
 */
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { daylightPreflightAdvice } from '../ai/house-profile-norms';
import { planContext } from '../ai/plan';
import { askedTypes } from '../ai/program';
import { loadRun, realContextInput } from './ai-real-context';

const villa = loadRun('a66f4aa0').digest;
const tube = loadRun('4a25b460').digest;

function advise(digest: AiBriefDigest): string | null {
  const input = realContextInput(digest, {
    stairShape: true,
    openSetback: true,
    houseProfile: true,
  });
  const context = planContext(input);
  return daylightPreflightAdvice(input.construction, digest, context.buildable, context.openFaces, {
    required: new Set(context.knowledge.brief_spaces.map((row) => row.type)),
    allowed: askedTypes(context.knowledge),
  });
}

describe('kiểm ánh sáng trước lượt', () => {
  it('biệt thự 9272: phần sâu giữa nhà quá lớn → báo trước, chỉ đúng hai mặt thoáng', () => {
    const advice = advise(villa);
    expect(advice).toMatch(/chỉ thoáng mặt trước, mặt trái/);
    expect(advice).toMatch(/\(4\d %\) nằm sâu hơn 4,5 m/);
    expect(advice).toMatch(/«Giếng trời»/);
    // Đầu bài 9272 có «chỗ phơi ngoài trời» — sân trong được phép mà không bắt, và mô hình đã bỏ qua.
    expect(advice).toMatch(/mới cho phép chứ chưa buộc phải có/);
  });

  it('đầu bài ghi hẳn giếng trời vào không gian yêu cầu → không báo', () => {
    const asked = {
      ...villa,
      required_spaces: [
        ...(villa.required_spaces ?? []),
        { type: 'light_well', floor: 1, area_m2: null, ensuite: null, amenities: null },
      ],
    } as AiBriefDigest;
    expect(advise(asked)).toBeNull();
  });

  it('thoáng thêm mặt sau → phần sâu nhỏ lại, không báo', () => {
    const open = {
      ...villa,
      site: { ...villa.site, adjacent: { ...villa.site.adjacent, back: 'duong_lon' } },
    } as AiBriefDigest;
    expect(advise(open)).toBeNull();
  });

  it('đầu bài không mở đường giếng trời / sân trong → câu nói rõ AI không được tự thêm', () => {
    // 9272 mở đường sân trong qua «chỗ phơi ngoài trời» (`cho_phoi_ngoai_troi` ∋ courtyard) — ở đây bỏ cả hai tập.
    const input = realContextInput(villa, {
      stairShape: true,
      openSetback: true,
      houseProfile: true,
    });
    const context = planContext(input);
    const none = { required: new Set<string>(), allowed: new Set<string>() };
    expect(
      daylightPreflightAdvice(
        input.construction,
        villa,
        context.buildable,
        context.openFaces,
        none,
      ),
    ).toMatch(/AI không được tự thêm/);
  });

  it('nhà ống không kiểm — phòng ngủ phụ nhà phố được lấy sáng gián tiếp', () => {
    expect(advise(tube)).toBeNull();
  });
});
