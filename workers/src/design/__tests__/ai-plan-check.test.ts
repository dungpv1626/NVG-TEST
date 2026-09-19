/**
 * Bộ kiểm mặt bằng của nhánh AI (`ai/plan-check.ts`) và lưới an toàn suy tường (T19).
 *
 * Cách viết: hai fixture VIẾT TAY phải đi qua sạch, rồi mỗi phép kiểm được chứng minh bằng một
 * bản sao ĐÃ LÀM HỎNG đúng một chỗ. Chỉ khẳng định "fixture sạch" thì không phân biệt được bộ
 * kiểm chặt chẽ với bộ kiểm luôn trả rỗng.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  aiFloorPlanSchema,
  type AiFloorPlan,
  type AiFloorPlanLevel,
  type AiSpaceProgram,
} from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { checkPlan, type PlanCheckInput } from '../ai/plan-check';
import { parseRuleMessages } from '../ai/plan-messages';
import { reviewPlanRooms } from '../ai/rule-warnings';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { levelFromRooms, withMergedParts } from '../ai/plan-geometry';
import { prepareWalls } from '../ai/draw/walls';
import { toRect } from '../ai/draw/geometry';
import { renderPlanSheet } from '../ai/draw/plan-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { parseConstructionNorms } from '../kb/construction';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { roomsProposalOf, TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const vocabulary = parseVocabulary(read('../../../../kb/room_vocabulary.yaml'));
const norms = parseConstructionNorms(read('../../../../kb/construction_norms.yaml'));
const style = parseSheetStyle(read('../../../../kb/sheet_style.yaml'));
const groups = roomGroups(vocabulary);

/**
 * Loại phòng KHÔNG bắt buộc có cửa — đọc nguyên nhóm `no_door_required` của
 * `kb/room_vocabulary.yaml`. Danh sách là DỮ LIỆU, đúng như bộ kiểm yêu cầu; viết cứng ở đây thì
 * phép thử sẽ không đỏ khi ai đó thêm loại không gian ngoài trời mới mà quên miễn trừ.
 */
const doorExemptTypes = new Set(groups.no_door_required ?? []);
const verticalTypes = new Set(groups.circulation ?? []);

/** Chương trình không gian suy từ chính mặt bằng — phép kiểm (2) so hai bên với nhau. */
function programOf(plan: AiFloorPlan): AiSpaceProgram {
  return {
    schema_version: '1.0.0',
    brief_ref: `sha256:${'3'.repeat(64)}`,
    spaces: plan.levels.flatMap((level) =>
      level.rooms.map((room) => ({
        id: room.id,
        type: room.type,
        level: level.level,
        target_area_m2: room.area_m2,
        ensuite_of: null,
        why: null,
      })),
    ),
    rationale: 'Chương trình dựng từ chính mặt bằng fixture.',
    assumptions: [],
    generator: {
      kind: 'ai',
      provider: 'fixture',
      model: 'viet-tay',
      route: 'fixture',
      prompt_version: '0.0.0',
      repaired: false,
    },
  } as AiSpaceProgram;
}

const check = (plan: AiFloorPlan, overrides: Partial<PlanCheckInput> = {}) =>
  checkPlan({ plan, program: programOf(plan), doorExemptTypes, verticalTypes, ...overrides });

/** Đổi tầng 1 của một phương án, giữ nguyên phần còn lại. */
function withLevel1(plan: AiFloorPlan, change: (level: AiFloorPlanLevel) => AiFloorPlanLevel) {
  const [first, ...rest] = plan.levels;
  return { ...plan, levels: [change(first!), ...rest] };
}

describe('bộ kiểm mặt bằng — fixture phải đi qua sạch', () => {
  for (const [name, plan] of [
    ['nhà phố', TOWNHOUSE_PLAN],
    ['biệt thự', VILLA_PLAN],
  ] as const) {
    it(`${name}: không lỗi chặn, không finding`, () => {
      const result = check(plan);
      expect(result.blocking).toEqual([]);
      expect(result.findings).toEqual([]);
    });
  }
});

describe('bộ kiểm mặt bằng — từng phép kiểm bắt đúng chỗ hỏng', () => {
  it('phòng lạ, phòng thiếu, phòng sai tầng đều bị bắt', () => {
    const plan = TOWNHOUSE_PLAN;
    const program = programOf(plan);

    const renamed = withLevel1(plan, (level) => ({
      ...level,
      rooms: level.rooms.map((room, index) => (index === 0 ? { ...room, id: 'phong_la' } : room)),
    }));
    const codes = checkPlan({
      plan: renamed,
      program,
      doorExemptTypes,
      verticalTypes,
    }).blocking.map((i) => i.code);
    expect(codes).toContain('room_unknown');
    expect(codes).toContain('room_missing');

    const moved = {
      ...program,
      spaces: program.spaces.map((space, index) => (index === 0 ? { ...space, level: 3 } : space)),
    };
    expect(
      checkPlan({ plan, program: moved, doorExemptTypes, verticalTypes }).blocking.map(
        (i) => i.code,
      ),
    ).toContain('room_wrong_level');
  });

  it('diện tích khai lệch chữ nhật quá dung sai thì bị bắt', () => {
    const plan = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      rooms: level.rooms.map((room, index) =>
        index === 0 ? { ...room, area_m2: room.area_m2 * 1.5 } : room,
      ),
    }));
    // Chương trình dựng từ chính mặt bằng đã hỏng, nên chỉ còn lỗi diện tích.
    expect(check(plan).blocking.map((i) => i.code)).toEqual(['room_area_mismatch']);
  });

  it('hai phòng chồng nhau thì bị bắt', () => {
    const plan = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      rooms: level.rooms.map((room) =>
        room.id === 'living_1' ? { ...room, rect: [22, 300, 378, 793] } : room,
      ),
    }));
    expect(check(plan).blocking.map((i) => i.code)).toContain('room_overlap');
  });

  it('phòng không có cửa nào mở vào thì bị bắt, trừ nhóm ngoài trời', () => {
    // Phòng khách chỉ có hai cửa: một sang chỗ để xe, một sang bếp. Bỏ cả hai thì không còn
    // lối vào nào — đúng thứ phép kiểm này phải bắt.
    const plan = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).filter((door) => door.id !== 'd1' && door.id !== 'd2'),
    }));
    const blocking = check(plan).blocking;
    expect(blocking.filter((i) => i.code === 'room_without_door').map((i) => i.ref)).toEqual([
      'living_1',
    ]);

    // Và cổng G3 nói tiếp phần hệ quả: cắt hai cửa ấy thì mọi thứ SAU phòng khách — bếp, thang,
    // WC, và cả ba tầng trên — cũng không còn đường vào. Trước 12/09/2026 không phép nào đo chiều
    // này, nên một cụm phòng biệt lập vẫn ĐẠT.
    const unreachable = blocking.filter((i) => i.code === 'room_unreachable').map((i) => i.ref);
    expect(unreachable).toContain('kitchen_1');
    expect(unreachable).toContain('stair_1');
    expect(unreachable).toContain('master_2');
    // Phòng ngoài trời không cần tới được: giếng trời thì không ai vào.
    expect(unreachable).not.toContain('light_well_1');

    // Giếng trời không có cửa vẫn hợp lệ vì thuộc nhóm ngoài trời của room_vocabulary.
    const noWellDoor = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).filter((door) => door.id !== 'd5'),
    }));
    expect(check(noWellDoor).blocking).toEqual([]);
  });

  it('lõi thang lệch giữa hai tầng, hoặc thiếu thang, đều bị bắt', () => {
    const shifted: AiFloorPlan = {
      ...TOWNHOUSE_PLAN,
      levels: TOWNHOUSE_PLAN.levels.map((level) =>
        level.level === 2
          ? { ...level, stairs: [{ ...level.stairs![0]!, rect: [22, 1265, 272, 1465] }] }
          : level,
      ),
    };
    expect(check(shifted).blocking.map((i) => i.code)).toContain('stair_not_aligned');

    const missing: AiFloorPlan = {
      ...TOWNHOUSE_PLAN,
      levels: TOWNHOUSE_PLAN.levels.map((level) =>
        level.level === 1 ? { ...level, stairs: [] } : level,
      ),
    };
    expect(check(missing).blocking.map((i) => i.code)).toContain('stair_missing');
  });

  it('phòng nằm ngoài phần đất được phép xây thì bị bắt', () => {
    const buildable = { x0: 0, y0: 0, x1: 400, y1: 800 };
    expect(check(TOWNHOUSE_PLAN, { buildable }).blocking.map((i) => i.code)).toContain(
      'room_outside_buildable',
    );
  });

  it('phòng thiếu cửa vẫn bị bắt — tường đúng không cứu được một thiếu sót thiết kế', () => {
    const noDoor = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).filter((door) => door.id !== 'd1' && door.id !== 'd2'),
    }));
    expect(check(noDoor).blocking.map((issue) => issue.code)).toContain('room_without_door');
  });
});

describe('fixture viết tay phải hợp lệ theo chính hợp đồng dữ liệu', () => {
  // Bộ kiểm không hỏi về đơn vị, nên một fixture dùng toạ độ ngoài lưới vẫn đi qua sạch ở trên —
  // rồi bị `repo.write` từ chối lúc ghi, sau khi đã trả tiền cho lượt gọi. Phép thử này đóng đúng
  // khoảng trống đó (thêm 10/09/2026, sau khi nó đã xảy ra thật với `ai-plan.test.ts`).
  it('hai fixture đi qua `aiFloorPlanSchema`', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      const parsed = aiFloorPlanSchema.safeParse(plan);
      expect(
        parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      ).toEqual([]);
    }
  });
});

describe('T23 — chương trình suy tường từ phòng ở MỌI lượt', () => {
  const outdoorTypes = new Set(groups.outdoor ?? []);

  const geometryOf = (plan: AiFloorPlan, index: number) =>
    levelFromRooms(roomsProposalOf(plan).levels[index]!, norms, outdoorTypes);

  it('mỗi cạnh phòng đều có tường chạy dọc — đúng cái `room_edge_uncovered` từng canh', () => {
    // Phép kiểm `room_edge_uncovered` đã XOÁ cùng T23, vì mâu thuẫn nó bắt (tường mô hình khai
    // không trùng phòng mô hình khai) nay không diễn đạt được. Nhưng BẤT BIẾN thì vẫn phải đúng,
    // nên nó chuyển từ phép kiểm đầu ra của mô hình thành phép thử của chính bộ suy tường.
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (let index = 0; index < plan.levels.length; index += 1) {
        const { level } = geometryOf(plan, index);
        const walls = prepareWalls(level.walls);
        for (const room of level.rooms) {
          const rect = toRect(room.rect);
          for (const edge of [
            { axis: 'x' as const, line: rect.y0, from: rect.x0, to: rect.x1, side: -1 },
            { axis: 'x' as const, line: rect.y1, from: rect.x0, to: rect.x1, side: 1 },
            { axis: 'y' as const, line: rect.x0, from: rect.y0, to: rect.y1, side: -1 },
            { axis: 'y' as const, line: rect.x1, from: rect.y0, to: rect.y1, side: 1 },
          ]) {
            const covered = walls.some((wall) => {
              const horizontal = Math.abs(wall.a[1] - wall.b[1]) <= 1;
              if (edge.axis === 'x' ? !horizontal : horizontal) return false;
              const centre =
                edge.axis === 'x' ? (wall.a[1] + wall.b[1]) / 2 : (wall.a[0] + wall.b[0]) / 2;
              return Math.abs(centre - edge.side * (wall.t / 2) - edge.line) <= 1;
            });
            expect(covered, `${room.id} cạnh ${edge.axis}@${edge.line}`).toBe(true);
          }
        }
      }
    }
  });

  it('cạnh biên của phòng NGOÀI TRỜI thành lan can, cạnh giáp phòng trong thành tường bao', () => {
    // Phân biệt này không phải thẩm mỹ: phép đối chiếu mặt thoáng chỉ tính cửa sổ trên tường `e`.
    // Gộp hết thành `p` thì mọi cửa sổ mở ra ban công biến mất khỏi phép đo, và cảnh báo «phòng
    // ngủ không có cửa sổ» nổ ra trên một mặt bằng đúng.
    const { level } = geometryOf(TOWNHOUSE_PLAN, 1);
    const balcony = toRect(level.rooms.find((room) => room.id === 'balcony_2')!.rect);
    const onFrontEdgeOfBalcony = prepareWalls(level.walls).filter(
      (wall) => Math.abs((wall.a[1] + wall.b[1]) / 2 + wall.t / 2 - balcony.y0) <= 1,
    );
    expect(onFrontEdgeOfBalcony.length).toBeGreaterThan(0);
    expect(onFrontEdgeOfBalcony.every((wall) => wall.kind === 'r')).toBe(true);

    // Cạnh sau của ban công giáp phòng ngủ chính: đó là ranh trong–ngoài, phải là tường bao.
    const between = prepareWalls(level.walls).filter(
      (wall) => Math.abs((wall.a[1] + wall.b[1]) / 2 - (balcony.y1 + 22 / 2)) <= 1,
    );
    expect(between.length).toBeGreaterThan(0);
    expect(between.every((wall) => wall.kind === 'e')).toBe(true);
  });

  it('artifact dựng từ phần mô hình khai đi qua bộ kiểm SẠCH, và tờ vẽ nói ra chỗ suy hộ', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      const levels = plan.levels.map((_, index) => {
        const { level, issues } = geometryOf(plan, index);
        expect(issues).toEqual([]);
        return { ...level, outline_faces: plan.levels[index]!.outline_faces };
      });
      const rebuilt: AiFloorPlan = {
        ...plan,
        levels,
        generator: { ...plan.generator, walls_derived: true },
      };
      const result = check(rebuilt);
      expect(result.blocking).toEqual([]);
      expect(result.findings).toEqual([]);

      const sheet = renderPlanSheet(rebuilt, 1, { style, labels: {} });
      expect(sheet.svg).toContain('Tường do chương trình suy từ phòng');
    }
  });

  it('lỗ mở giữ nguyên số lượng, và mỗi cái neo vào một đoạn tường CÓ THẬT', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (let index = 0; index < plan.levels.length; index += 1) {
        const source = plan.levels[index]!;
        const { level, notes } = geometryOf(plan, index);
        expect(notes.map((note) => note.code)).toEqual([]);
        expect((level.doors ?? []).length).toBe((source.doors ?? []).length);
        expect((level.windows ?? []).length).toBe((source.windows ?? []).length);
        for (const opening of [...(level.doors ?? []), ...(level.windows ?? [])]) {
          expect(
            level.walls.some((wall) => wall.id === opening.wall),
            opening.id,
          ).toBe(true);
        }
      }
    }
  });

  it('chiều mở cánh đi qua vòng artifact → đề xuất → artifact mà không lật', () => {
    // Tường chương trình suy ra có thể chạy NGƯỢC chiều cạnh phòng. Thiếu phép lật bản lề và
    // chiều quét thì một nửa số cửa mở sai phía, và KHÔNG lỗi nào nổ ra — tờ vẽ chỉ trông lạ.
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (let index = 0; index < plan.levels.length; index += 1) {
        const before = new Map(
          (plan.levels[index]!.doors ?? []).map((door) => [door.id, door] as const),
        );
        for (const door of geometryOf(plan, index).level.doors ?? []) {
          const original = before.get(door.id)!;
          const sameWall = plan.levels[index]!.walls.find((w) => w.id === original.wall);
          const derived = geometryOf(plan, index).level.walls.find((w) => w.id === door.wall);
          if (!sameWall || !derived) continue;
          // Cùng PHƯƠNG thì mới so được chiều; tường suy ra luôn cùng phương với tường gốc.
          const sameDirection =
            (sameWall.b[0]! - sameWall.a[0]!) * (derived.b[0]! - derived.a[0]!) +
              (sameWall.b[1]! - sameWall.a[1]!) * (derived.b[1]! - derived.a[1]!) >
            0;
          if (!sameDirection) continue;
          expect(door.hinge, `${door.id} bản lề`).toBe(original.hinge);
          expect(door.side, `${door.id} chiều quét`).toBe(original.side);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cảnh báo quy chuẩn trên mặt bằng — đo SAU, không chặn (T14, T20)
// ---------------------------------------------------------------------------

const nationalRules = new RulePack(
  ['10-dimensions', '20-daylight-access', '30-adjacency', '40-vertical', '50-massing'].flatMap(
    // Gói quy chuẩn CŨ chép vào dữ liệu kiểm thử (`rules/base/` đã xoá 13/09/2026) — chỉ để cơ
    // chế đối chiếu có một gói thật để chạy.
    (name) => parseRuleFile(read(`./fixtures/rules-legacy-base/${name}.yaml`), `base/${name}.yaml`),
  ),
);
const experienceRules = new RulePack(
  parseRuleFile(read('../../../../rules/nvg-experience.yaml'), 'nvg-experience.yaml'),
);
const messages = parseRuleMessages(read('../../../../rules/messages.vi.yaml'));
const labels: Record<string, string> = Object.fromEntries(
  vocabulary.types.map((type) => [type.code, type.vi]),
);

const review = (plan: AiFloorPlan, buildingType = 'biet_thu') =>
  reviewPlanRooms({
    levels: plan.levels,
    buildingType,
    rules: nationalRules,
    labels,
    groups,
    messages,
  });

describe('cảnh báo quy chuẩn trên mặt bằng', () => {
  it('đo được nhiều vị từ hơn bước chương trình, và nói ra phần chưa đối chiếu được', () => {
    const result = review(VILLA_PLAN);
    expect(result.checked.length).toBeGreaterThan(0);
    // Cảnh báo rỗng KHÔNG có nghĩa "đạt quy chuẩn" — danh sách chưa đối chiếu được phải có mặt
    // để màn hình nói thật về phạm vi đã soát.
    expect(result.unchecked.length).toBeGreaterThan(0);
    for (const rule of result.unchecked) {
      expect(result.checked).not.toContain(rule.ruleId);
    }
  });

  it('phòng không có cửa sổ ra ngoài thì bị cảnh báo, không bị chặn', () => {
    // Bỏ cả hai cửa sổ của phòng khách tầng 1. Phòng vẫn hợp lệ với bộ kiểm — nó có cửa, có
    // tường bao kín — nên chỉ hiện thành CẢNH BÁO quy chuẩn, đúng ranh giới của T14.
    const dark = withLevel1(VILLA_PLAN, (level) => ({
      ...level,
      windows: (level.windows ?? []).filter((window) => window.id !== 's1' && window.id !== 's4'),
    }));
    expect(check(dark).blocking).toEqual([]);
    const daylight = review(dark).warnings.filter((w) => w.ruleId.includes('daylight'));
    expect(daylight.length).toBeGreaterThan(0);
    expect(daylight[0]?.level).toBe(1);
    expect(daylight[0]?.source).toContain('QCVN');
  });

  it('phòng hẹp hơn bề rộng tối thiểu thì bị cảnh báo', () => {
    const narrow = withLevel1(VILLA_PLAN, (level) => ({
      ...level,
      rooms: level.rooms.map((room) =>
        room.id === 'bedroom_1' ? { ...room, rect: [22, 1114, 200, 1378], area_m2: 4.7 } : room,
      ),
    }));
    const dimension = review(narrow).warnings.filter((w) => w.ruleId.includes('dimension'));
    expect(dimension.map((w) => w.spaceId)).toContain('bedroom_1');
  });
});

describe('quy tắc nhắm NHÓM phòng — không được biến mất im lặng', () => {
  it('quy tắc tỉ lệ dài/rộng nhắm nhóm `habitable` vẫn bắt được phòng cụ thể', () => {
    // Bóp phòng khách thành dải 2,0 × 6,0 m — tỉ lệ 3,0 vượt ngưỡng 2,5 của kinh nghiệm NVG.
    // Quy tắc ấy khai `target: habitable`, một mã NHÓM chứ không phải mã phòng: so thẳng chuỗi
    // thì nó không khớp phòng nào và lặng lẽ không chạy.
    const narrow = withLevel1(VILLA_PLAN, (level) => ({
      ...level,
      rooms: level.rooms.map((room) =>
        room.id === 'living_1' ? { ...room, rect: [22, 22, 222, 622], area_m2: 12 } : room,
      ),
    }));
    const warnings = reviewPlanRooms({
      levels: narrow.levels,
      buildingType: 'biet_thu',
      rules: experienceRules,
      labels,
      groups,
      messages,
    }).warnings;
    expect(warnings.map((w) => w.ruleId)).toContain('aspect_ratio_max_habitable');
  });

  it('quy tắc khai mã phòng KHÔNG có thật rơi vào danh sách chưa đối chiếu được', () => {
    // Cơ chế: một quy tắc nhắm vào mã phòng không tồn tại phải HIỆN RA trong danh sách chưa đối
    // chiếu được, không được im lặng — «không cảnh báo» rất dễ đọc thành «đạt».
    //
    // ⚠️ Phép thử này trước đây dùng `lightwell_max_area` làm ví dụ, vì quy tắc ấy khai `lightwell`
    // trong khi từ vựng ghi `light_well` nên CHƯA TỪNG chạy. Tức nó dùng một LỖI THẬT làm mẫu —
    // và khi lỗi được sửa ngày 12/09/2026, phép thử đỏ. Nay dùng một quy tắc BỊA RA: cơ chế vẫn
    // được canh, mà không còn phụ thuộc vào việc một lỗi cụ thể còn tồn tại hay không.
    const bogus = new RulePack(
      parseRuleFile(
        `- id: bogus_max_area_khong_co_ma_nay
  applies_to: [biet_thu]
  scope: floor
  predicate: max_area
  target: phong_khong_ton_tai
  value_m2: 8.0
  severity: warning
  source: 'kinh nghiệm NVG'
`,
        'test://bogus.yaml',
      ),
      false,
    );
    const result = reviewPlanRooms({
      levels: VILLA_PLAN.levels,
      buildingType: 'biet_thu',
      rules: bogus,
      labels,
      groups,
      messages,
    });
    expect(result.unchecked.map((rule) => rule.ruleId)).toContain('bogus_max_area_khong_co_ma_nay');
    expect(result.checked).not.toContain('bogus_max_area_khong_co_ma_nay');
  });

  it('giếng trời nay ĐO ĐƯỢC thật — mã phòng đã sửa thành `light_well` (12/09/2026)', () => {
    // Mặt khác của cùng chuyện: quy tắc sau khi sửa mã phải RỜI khỏi danh sách chưa đối chiếu
    // được. Không có phép thử này thì một lần sửa ngược lại sẽ không ai thấy.
    const result = reviewPlanRooms({
      levels: VILLA_PLAN.levels,
      buildingType: 'biet_thu',
      rules: experienceRules,
      labels,
      groups,
      messages,
    });
    expect(result.unchecked.map((rule) => rule.ruleId)).not.toContain('lightwell_max_area');
  });
});

describe('withMergedParts — chia khu của không gian mở (T48)', () => {
  const room = {
    id: 'living_1',
    type: 'living',
    rect: [0, 0, 600, 1500] as [number, number, number, number],
    area_m2: 90,
    also: ['dining_1', 'kitchen_1'],
  };
  const targets: Record<string, { type: string; target: number }> = {
    living_1: { type: 'living', target: 56 },
    dining_1: { type: 'dining', target: 15 },
    kitchen_1: { type: 'kitchen', target: 12 },
  };

  it('chia dọc cạnh DÀI theo tỉ lệ diện tích mục tiêu, phủ kín chữ nhật, không chồng nhau', () => {
    const [out] = withMergedParts([room], (id) => targets[id] ?? null);
    const parts = out!.parts!;
    expect(parts.map((part) => part.id)).toEqual(['living_1', 'dining_1', 'kitchen_1']);
    expect(parts[0]!.rect[1]).toBe(0);
    expect(parts[2]!.rect[3]).toBe(1500);
    for (let i = 1; i < parts.length; i += 1) {
      expect(parts[i]!.rect[1]).toBe(parts[i - 1]!.rect[3]);
      expect(parts[i]!.rect[0]).toBe(0);
      expect(parts[i]!.rect[2]).toBe(600);
    }
    // Khu lớn nhất là phòng chính, và các khu cộng lại bằng diện tích chữ nhật.
    const total = parts.reduce((sum, part) => sum + part.area_m2, 0);
    expect(Math.round(total)).toBe(90);
    expect(parts[0]!.area_m2).toBeGreaterThan(parts[1]!.area_m2);
  });

  it('phòng không gộp thì không có khu nào', () => {
    const [out] = withMergedParts([{ ...room, also: [] }], (id) => targets[id] ?? null);
    expect(out!.parts).toBeUndefined();
  });

  /**
   * Haan 18/09/2026, chấm lượt 3bc3d2ed: «không nên xếp cửa ra vào phòng ngủ ở phía bếp nấu nướng».
   * Cửa phòng ngủ ấy mở vào chính không gian mở này — chỗ sửa được mà không đụng tường là THỨ TỰ
   * các khu bên trong nó.
   */
  const zoning = {
    cooking: new Set(['kitchen']),
    quiet: new Set(['bedroom', 'master_bedroom', 'altar_room', 'study']),
  };

  it('phòng ngủ nằm ngay dưới: khu bếp dời khỏi vách chung, khu ăn xuống thay chỗ', () => {
    const bedroom = {
      id: 'bedroom_1',
      type: 'bedroom',
      rect: [0, 1510, 600, 2000] as [number, number, number, number],
      area_m2: 29,
    };
    const out = withMergedParts([room, bedroom], (id) => targets[id] ?? null, zoning);
    const parts = out[0]!.parts!;
    expect(parts[parts.length - 1]!.id).not.toBe('kitchen_1');
    expect(parts[0]!.id).toBe('living_1');
    // Cạnh chung với phòng ngủ là cạnh y = 1500; khu nằm ở đó không phải bếp.
    const atBedroom = parts.find((part) => part.rect[3] === 1500)!;
    expect(atBedroom.id).toBe('dining_1');
  });

  it('không có phòng yên tĩnh nào kề: giữ nguyên thứ tự mô hình khai', () => {
    const out = withMergedParts([room], (id) => targets[id] ?? null, zoning);
    expect(out[0]!.parts!.map((part) => part.id)).toEqual(['living_1', 'dining_1', 'kitchen_1']);
  });

  it('thiếu diện tích mục tiêu của một thành viên thì KHÔNG chia — thà một nhãn chung còn hơn ranh đặt bừa', () => {
    const [out] = withMergedParts([room], (id) =>
      id === 'kitchen_1' ? null : (targets[id] ?? null),
    );
    expect(out!.parts).toBeUndefined();
  });
});
