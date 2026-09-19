/**
 * Nhánh BIỆT THỰ: khoảng lùi, mật độ, hình bao — ba lỗi hỏng im lặng, sửa 07/09/2026.
 *
 * Cả ba đều đúng với nhà phố và sai với biệt thự, nên đề bài demo (nhà phố 5 × 18 m, lùi 0)
 * không chạm tới cái nào. Đó là lý do chúng sống được lâu như vậy, và là lý do bộ này tồn tại
 * riêng: mọi bài ở đây phải khai `biet_thu` và một khoảng lùi khác không.
 *
 *  · V-23 — loại hình không tới bộ giải, nên biệt thự bị giải bằng luật nhà phố.
 *  · V-22 — mặt đứng phân loại theo ranh thửa, nên biệt thự có lùi thì mất sạch lỗ mở.
 *  · V-21 — hai lõi thang là vô nghiệm chắc chắn, hiện đang bị kẹp về một.
 *
 * Kèm một lỗi thứ tư cùng họ: Lớp 2 lấy đầu bài GHI ĐÈ gói quy tắc, còn bộ giải lấy mức CHẶT
 * hơn. (Từ 13/09/2026 gói quy chuẩn đã gỡ khỏi bộ giải — khoảng lùi và mật độ nay chỉ đến từ
 * đầu bài; phép «mức chặt hơn» còn giữ cho gói địa phương.) Đầu bài khai lùi nhỏ hơn quy chuẩn thì hai lớp soạn và thi hành trên hai mảnh đất khác
 * nhau, và phần chênh biến thành phương án vô nghiệm ở cuối.
 */

import { describe, expect, it } from 'vitest';
import type { DesignBrief, FloorPlan, SpaceProgram } from '@nvg/shared/design';
import { buildSpaceProgram } from '../program/engine';
import { effectiveMaxDensity, effectiveSetbacks, strictestSetbacks } from '../program/site-limits';
import { plateFor } from '../layout/plate';
import { buildArchModel, layoutIntent } from '../workflows/steps';
import { testNorms, testRulePack } from './program-fixtures';

const REF = `sha256:${'a'.repeat(64)}`;
const rules = testRulePack();
const norms = testNorms();

function brief(overrides: Partial<DesignBrief> = {}): DesignBrief {
  return {
    schema_version: '1.1.0',
    project_id: '11111111-1111-4111-8111-111111111111',
    building_type: 'biet_thu',
    locality: 'hung_yen',
    site: { width_m: 20, depth_m: 25 },
    floors: 2,
    family: [{ role: 'vo_chong', count: 2 }],
    required_spaces: [],
    ...overrides,
  } as DesignBrief;
}

describe('Khoảng lùi và mật độ: bộ giải KHÔNG còn gói quy chuẩn — đầu bài quyết (13/09/2026)', () => {
  // Haan: «bỏ quy chuẩn VN đi», cho toàn bộ bộ giải. Trước ngày ấy gói nền ép biệt thự lùi trước
  // 3 m và mật độ 60 %, và thắng mọi số khai trong đầu bài nhỏ hơn. Nay đầu bài là nguồn duy nhất.
  it('khoảng lùi là đúng số đầu bài khai, kể cả khi nhỏ', () => {
    const small = effectiveSetbacks(
      brief({ site: { width_m: 20, depth_m: 25, setback_required_m: { front: 1 } } } as never),
      rules,
    );
    expect(small.front).toBe(1);
    const large = effectiveSetbacks(
      brief({ site: { width_m: 20, depth_m: 25, setback_required_m: { front: 6 } } } as never),
      rules,
    );
    expect(large.front).toBe(6);
  });

  it('không khai khoảng lùi thì bằng không ở cả bốn phía, mọi loại nhà', () => {
    for (const type of ['nha_pho', 'biet_thu'] as const) {
      const setbacks = effectiveSetbacks(brief({ building_type: type } as never), rules);
      expect([setbacks.front, setbacks.back, setbacks.left, setbacks.right]).toEqual([0, 0, 0, 0]);
    }
  });

  it('mật độ là đúng số đầu bài khai; để trống là KHÔNG BIẾT, không phải một số mặc định', () => {
    expect(
      effectiveMaxDensity(
        brief({ site: { width_m: 20, depth_m: 25, max_density: 0.8 } } as never),
        rules,
      ),
    ).toBe(0.8);
    expect(effectiveMaxDensity(brief(), rules)).toBeNull();
    expect(rules.maxDensity('biet_thu')).toBeNull();
  });

  it('cơ chế «mức chặt hơn» vẫn còn cho ngày có gói địa phương', () => {
    // Gói `rules/locality/` (hiện rỗng) vẫn được đọc; khi có văn bản quy hoạch tỉnh, hai nguồn
    // gặp nhau lại phải lấy mức chặt hơn — giữ phép thử cho chính cơ chế đó.
    const out = strictestSetbacks(
      { front: 3 },
      brief({ site: { width_m: 20, depth_m: 25, setback_required_m: { front: 1 } } } as never),
    );
    expect(out.front).toBe(3);
  });
});

describe('Mặt sàn giao cho Lớp 3a (plateFor) trừ khoảng lùi', () => {
  const emptyProgram = { floor_allocation: [] } as unknown as SpaceProgram;

  it('biệt thự: thu vào đúng khoảng lùi đầu bài khai', () => {
    // Không trừ thì `chooseFrame` chọn khung mẫu theo một bề rộng công trình không có, và
    // biệt thự mặt tiền rộng nhận khung nhà ống.
    const withSetback = brief({
      site: { width_m: 20, depth_m: 25, setback_required_m: { front: 3 } },
    } as never);
    const plate = plateFor(withSetback, emptyProgram, rules.setbacks('biet_thu'));
    expect(plate.widthM).toBe(20);
    expect(plate.depthM).toBe(22); // 25 − 3 (lùi trước đầu bài khai)
  });

  it('thu chiều sâu theo mật độ đầu bài khai, đúng như `_footprint` phía Python', () => {
    const declared = brief({
      site: { width_m: 20, depth_m: 25, setback_required_m: { front: 3 }, max_density: 0.6 },
    } as never);
    const plate = plateFor(
      declared,
      emptyProgram,
      rules.setbacks('biet_thu'),
      rules.maxDensity('biet_thu'),
    );
    expect(plate.depthM).toBeCloseTo(Math.min(22, (0.6 * 20 * 25) / 20), 6);
    expect(plate.depthM).toBeLessThan(22);
  });

  it('đầu bài khai mật độ CHẶT hơn gói thì đầu bài thắng — cùng chiều với bộ giải', () => {
    // Gói giả định 0,6 — cơ chế cho ngày có gói địa phương; gói hiện hành không khai mật độ.
    const density = 0.6;
    const tighter = Math.max(0.1, density - 0.2);
    const plate = plateFor(
      brief({ site: { width_m: 20, depth_m: 25, max_density: tighter } } as never),
      emptyProgram,
      rules.setbacks('biet_thu'),
      density,
    );
    expect(plate.depthM).toBeCloseTo((tighter * 20 * 25) / 20, 6);
  });

  it('nhà phố không đổi — đây là lý do lỗi này sống được lâu', () => {
    const plate = plateFor(
      brief({ building_type: 'nha_pho', site: { width_m: 5, depth_m: 18 } } as never),
      emptyProgram,
      rules.setbacks('nha_pho'),
    );
    expect(plate).toEqual({ widthM: 5, depthM: 18 });
  });

  it('không có gói quy tắc trong tay thì vẫn trừ phần khai trong đầu bài', () => {
    const plate = plateFor(
      brief({
        site: { width_m: 20, depth_m: 25, setback_required_m: { front: 4, back: 2 } },
      } as never),
      emptyProgram,
    );
    expect(plate.depthM).toBe(19); // 25 − 4 − 2
  });
});

describe('Mặt đứng phân loại theo HÌNH BAO công trình, không theo ranh thửa', () => {
  /** Mặt bằng một tầng, khối thụt vào 3 m phía trước — đúng hình một biệt thự có khoảng lùi. */
  function inset(withFootprint: boolean): FloorPlan {
    const [x0, y0, x1, y1] = [0, 3, 20, 25];
    return {
      schema_version: '1.0.0',
      intent_ref: REF,
      rule_pack_version: '2026.08.1',
      site: { width_m: 20, depth_m: 25 },
      ...(withFootprint ? { footprint_m: [x0, y0, x1, y1] } : {}),
      levels: [
        {
          level: 1,
          height_m: 3.6,
          rooms: [
            {
              id: 'living_1',
              type: 'living',
              polygon: [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
              ],
              area_m2: 440,
              has_daylight: true,
            },
          ],
          voids: [],
          walls: [
            { id: 'w_front', a: [x0, y0], b: [x1, y0] },
            { id: 'w_left', a: [x0, y0], b: [x0, y1] },
          ],
          openings: [
            { id: 'o1', wall: 'w_front', kind: 'door', offset_m: 2, width_m: 1.2 },
            { id: 'o2', wall: 'w_left', kind: 'window', offset_m: 4, width_m: 1.5 },
          ],
        },
      ],
      cores: [],
      constraint_report: { status: 'pass', violations: [] },
    } as unknown as FloorPlan;
  }

  it('biệt thự có khoảng lùi vẫn có cửa trên mặt trước và mặt bên', () => {
    // So với `plan.site` thì tường mặt trước nằm ở y = 3 chứ không phải y = 0, nên không mặt
    // nào khớp và cả bốn mảng về rỗng. Không lỗi, không cảnh báo — chỉ là phối cảnh và khối
    // ba chiều mất sạch cửa.
    const { payload } = buildArchModel(inset(true), REF);
    const facades = Object.fromEntries(
      (payload.facades ?? []).map((f) => [f.direction, f.openings ?? []]),
    );
    expect(facades.front).toHaveLength(1);
    expect(facades.left).toHaveLength(1);
    expect(facades.front?.[0]).toMatchObject({ kind: 'door', w_m: 1.2 });
  });

  it('artifact cũ chưa có hình bao thì lùi về hộp bao của tường, không về ranh thửa', () => {
    // Artifact là bất biến: bản tạo trước 07/09/2026 sẽ nằm đó mãi. Đọc chúng bằng ranh thửa
    // là tái diễn đúng lỗi vừa sửa.
    const { payload } = buildArchModel(inset(false), REF);
    const front = (payload.facades ?? []).find((f) => f.direction === 'front');
    expect(front?.openings ?? []).toHaveLength(1);
  });
});

describe('Hai lõi thang — kẹp về một cho tới khi bộ giải đặt được (V-21)', () => {
  it('đầu bài xin hai lõi thì vẫn ra một, và NÓI RA điều đó', () => {
    const result = buildSpaceProgram({
      brief: brief({ floors: 3, massing: { cores_preferred: 2 } } as never),
      briefRef: REF,
      rules,
      norms,
    });
    const stairs = result.payload.spaces.filter((s) => s.type === 'stair');
    // Ba tầng → thang ở tầng 1 và 2, một lõi.
    expect(stairs).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes('lõi thang'))).toBe(true);
  });

  it('một lõi thì không có cảnh báo nào — kẹp không được nổ oan', () => {
    const result = buildSpaceProgram({
      brief: brief({ floors: 3, massing: { cores_preferred: 1 } } as never),
      briefRef: REF,
      rules,
      norms,
    });
    expect(result.warnings.some((w) => w.includes('lõi thang'))).toBe(false);
  });
});

describe('Mục «Tổ chức khối nhà» đi được tới artifact, và NÓI THẬT về mình', () => {
  const program = (massing: Record<string, unknown>) =>
    buildSpaceProgram({
      brief: brief({ floors: 2, massing } as never),
      briefRef: REF,
      rules,
      norms,
    });

  const digestOf = (massing: Record<string, unknown>) => {
    const built = program(massing);
    const intent = layoutIntent(built.payload, REF, {
      massing: massing as never,
    });
    return (intent.payload as unknown as { massing: Record<string, unknown> }).massing;
  };

  it('ghi lại nguyên văn sáu lựa chọn, và KHÔNG một con số kích thước nào', () => {
    // Trước 07/09/2026 sáu câu này không tới được Lớp 3a: chúng chiếm 10 trên 38 điểm đầy đủ
    // của một đầu bài biệt thự mà không tác động gì.
    const digest = digestOf({
      footprint_shape: 'L',
      wings_preferred: 2,
      cores_preferred: 1,
      service_core: true,
      yards: ['san_ben'],
      indoor_outdoor: 'mo_toi_da',
    });

    expect(digest).toMatchObject({
      shape: 'L',
      wings_preferred: 2,
      service_core: true,
      indoor_outdoor: 'mo_toi_da',
      yards: ['san_ben'],
    });
    // Mọi thứ đi qua đây là LỰA CHỌN RỜI RẠC — bộ giải mới là nơi gán số (nguyên tắc 2).
    for (const value of Object.values(digest)) {
      expect(typeof value === 'number' && !Number.isInteger(value)).toBe(false);
    }
  });

  it('cánh nhà gửi cho bộ giải vẫn là MỘT, dù đầu bài xin hai', () => {
    // `adapters.py::_single_wing` NÉM LỖI khi nhận nhiều hơn một cánh — phát ra hai cánh
    // không cho kết quả kém hơn mà cho lỗi 500. Nguyện vọng nằm ở `wings_preferred`, tách
    // khỏi con số bộ giải thật sự nhận.
    const digest = digestOf({ wings_preferred: 2 });
    expect((digest.wings as unknown[]).length).toBe(1);
    expect(digest.wings_preferred).toBe(2);
  });

  it('câu chưa giải được thì GỌI TÊN ra, kèm lý do đọc được', () => {
    // Im lặng thì cả sáu câu trông như đã được tôn trọng, và kiến trúc sư đọc phương án không
    // có cách nào biết mình đang nhìn kết quả của yêu cầu nào.
    const digest = digestOf({ footprint_shape: 'U', cores_preferred: 2, yards: ['san_trong'] });
    const deferred = digest.deferred as { field: string; reason: string }[];
    expect(deferred.map((d) => d.field).sort()).toEqual([
      'cores_preferred',
      'footprint_shape',
      'yards',
    ]);
    for (const item of deferred) {
      expect(item.reason.length).toBeGreaterThan(10);
      // Lý do là câu tiếng Việt cho người đọc, không phải mã máy (CLAUDE.md 4.1).
      expect(item.reason).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it('lối dịch vụ riêng có tác dụng THẬT: bếp kề lối đi, lối đi tách khỏi phòng khách', () => {
    // Diễn đạt bằng quan hệ chứ không bằng hình học — đây là quy ước tiện nghi, không phải
    // quy chuẩn, nên nó thuộc hàm mục tiêu chứ không phải ràng buộc cứng. Đặt cứng thì một lô
    // hẹp thành vô nghiệm và người dùng mất cả phương án vì một ô chọn tiện nghi.
    const withCore = program({ service_core: true }).payload;
    const without = program({ service_core: false }).payload;

    const kitchens = withCore.spaces.filter((s) => s.type === 'kitchen').map((s) => s.id);
    const routes = withCore.spaces.filter((s) => s.type === 'circulation').map((s) => s.id);
    const livings = withCore.spaces.filter((s) => s.type === 'living').map((s) => s.id);
    expect(kitchens.length).toBeGreaterThan(0);

    const pairs = (program: typeof withCore, kind: string) =>
      (program.adjacency ?? []).filter((a) => a.kind === kind);

    expect(
      pairs(withCore, 'adjacent').some(
        (a) =>
          (kitchens.includes(a.a) && routes.includes(a.b)) ||
          (kitchens.includes(a.b) && routes.includes(a.a)),
      ),
    ).toBe(true);
    expect(
      pairs(withCore, 'separate').some(
        (a) =>
          (livings.includes(a.a) && routes.includes(a.b)) ||
          (livings.includes(a.b) && routes.includes(a.a)),
      ),
    ).toBe(true);

    // Không khai thì KHÔNG sinh thêm cặp nào — nếu không, mọi đầu bài đều mang một lối dịch
    // vụ không ai yêu cầu.
    expect((without.adjacency ?? []).length).toBeLessThan((withCore.adjacency ?? []).length);
    expect(digestOf({ service_core: true }).honoured).toContain('service_core');
  });

  it('đầu bài KHÔNG khai khối nhà thì digest rỗng, không bịa ra lời hứa nào', () => {
    const digest = digestOf({});
    expect(digest.honoured).toEqual([]);
    expect(digest.deferred).toEqual([]);
  });
});
