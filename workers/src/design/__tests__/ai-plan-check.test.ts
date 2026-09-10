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
import { deriveWalls } from '../ai/draw/derive-walls';
import { renderPlanSheet } from '../ai/draw/plan-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { parseConstructionNorms } from '../kb/construction';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

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
  checkPlan({ plan, program: programOf(plan), doorExemptTypes, ...overrides });

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
    const codes = checkPlan({ plan: renamed, program, doorExemptTypes }).blocking.map(
      (i) => i.code,
    );
    expect(codes).toContain('room_unknown');
    expect(codes).toContain('room_missing');

    const moved = {
      ...program,
      spaces: program.spaces.map((space, index) => (index === 0 ? { ...space, level: 3 } : space)),
    };
    expect(
      checkPlan({ plan, program: moved, doorExemptTypes }).blocking.map((i) => i.code),
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
    expect(blocking.map((i) => i.code)).toEqual(['room_without_door']);
    expect(blocking[0]?.ref).toBe('living_1');

    // Giếng trời không có cửa vẫn hợp lệ vì thuộc nhóm ngoài trời của room_vocabulary.
    const noWellDoor = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).filter((door) => door.id !== 'd5'),
    }));
    expect(check(noWellDoor).blocking).toEqual([]);
  });

  it('cửa đặt ngoài đoạn tường, hoặc trên tường không có thật, đều bị bắt', () => {
    const outside = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).map((door) => (door.id === 'd1' ? { ...door, at: 900 } : door)),
    }));
    expect(check(outside).blocking.map((i) => i.code)).toContain('opening_outside_wall');

    const nowhere = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).map((door) =>
        door.id === 'd1' ? { ...door, wall: 'khong_co' } : door,
      ),
    }));
    expect(check(nowhere).blocking.map((i) => i.code)).toContain('opening_wall_missing');
  });

  it('hai lỗ mở chồng nhau trên cùng một tường thì bị bắt', () => {
    const plan = withLevel1(VILLA_PLAN, (level) => ({
      ...level,
      windows: (level.windows ?? []).map((window) =>
        window.id === 's2' ? { ...window, at: 250 } : window,
      ),
    }));
    expect(check(plan).blocking.map((i) => i.code)).toContain('opening_overlap');
  });

  it('cửa sổ đặt trên vách ngăn trong nhà thì bị bắt', () => {
    const plan = withLevel1(VILLA_PLAN, (level) => ({
      ...level,
      windows: (level.windows ?? []).map((window) =>
        window.id === 's1' ? { ...window, wall: 'pv1', at: 200 } : window,
      ),
    }));
    expect(check(plan).blocking.map((i) => i.code)).toContain('window_on_partition');
  });

  it('cạnh phòng không được tường phủ thì bị bắt', () => {
    const plan = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      walls: level.walls.filter((wall) => wall.id !== 'p2'),
    }));
    const codes = check(plan).blocking.map((i) => i.code);
    expect(codes).toContain('room_edge_uncovered');
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

  it('chỉ nhóm lỗi TƯỜNG mới bật `wallOnly` — mở đường cho lượt suy tường', () => {
    // Bỏ tường hậu — không lỗ mở nào bám vào nó, nên chỉ còn đúng lỗi "cạnh phòng hở".
    const wallsGone = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      walls: level.walls.filter((wall) => wall.id !== 'wb'),
    }));
    const result = check(wallsGone);
    expect(result.blocking.length).toBeGreaterThan(0);
    expect(result.wallOnly).toBe(true);

    const areaWrong = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      rooms: level.rooms.map((room, index) =>
        index === 0 ? { ...room, area_m2: room.area_m2 * 1.5 } : room,
      ),
    }));
    expect(check(areaWrong).wallOnly).toBe(false);
  });

  it('«phòng không có cửa» không chặn lượt suy tường khi chính tường đang sai', () => {
    // Đây là chỗ T19 từng KHÔNG kích hoạt đúng vào trường hợp nó sinh ra để cứu (vá 10/09/2026).
    // Bỏ một đoạn tường mà cửa đang bám vào: cửa hoá ra «nằm trên tường không tồn tại», nên phòng
    // của nó cũng bị báo mất cửa. Cả hai đều do tường, nên lượt suy tường vẫn phải mở.
    const broken = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      walls: level.walls.filter((wall) => wall.id !== 'p1'),
    }));
    const result = check(broken);
    const codes = result.blocking.map((issue) => issue.code);
    expect(codes).toContain('opening_wall_missing');
    expect(result.wallOnly).toBe(true);
  });

  it('phòng thiếu cửa mà tường vẫn đúng thì KHÔNG suy tường', () => {
    // Suy tường không cứu được một thiếu sót thiết kế, và bật cờ «tường do chương trình suy»
    // lúc ấy là in một câu sai lên tờ vẽ.
    const noDoor = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      doors: (level.doors ?? []).filter((door) => door.id !== 'd1' && door.id !== 'd2'),
    }));
    const result = check(noDoor);
    expect(result.blocking.map((issue) => issue.code)).toContain('room_without_door');
    expect(result.wallOnly).toBe(false);
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

describe('T19 — suy tường từ phòng khi mô hình khai hỏng', () => {
  it('dựng lại đủ tường cho một tầng đã mất hết vách, và tờ vẽ vẫn ra', () => {
    const broken = withLevel1(TOWNHOUSE_PLAN, (level) => ({
      ...level,
      walls: level.walls.filter((wall) => wall.k === 'e'),
    }));
    const level1 = broken.levels[0]!;
    const derived = deriveWalls(level1, norms);

    expect(derived.level.walls.length).toBeGreaterThan(level1.walls.length);

    const repaired: AiFloorPlan = {
      ...broken,
      levels: [derived.level, ...broken.levels.slice(1)],
      generator: { ...broken.generator, walls_derived: true },
    };
    // Không còn cạnh phòng nào hở sau khi suy tường — đó là lý do T19 tồn tại.
    const codes = check(repaired).blocking.map((issue) => issue.code);
    expect(codes).not.toContain('room_edge_uncovered');

    const sheet = renderPlanSheet(repaired, 1, { style, labels: {} });
    expect(sheet.svg).toContain('Tường do chương trình suy từ phòng');
  });

  it('cửa của mô hình được đặt lại lên tường mới, không bị bỏ hết', () => {
    const level1 = TOWNHOUSE_PLAN.levels[0]!;
    const derived = deriveWalls(level1, norms);
    const kept = (derived.level.doors ?? []).length;
    expect(kept).toBeGreaterThanOrEqual((level1.doors ?? []).length - 1);
    for (const door of derived.level.doors ?? []) {
      expect(derived.level.walls.some((wall) => wall.id === door.wall)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Cảnh báo quy chuẩn trên mặt bằng — đo SAU, không chặn (T14, T20)
// ---------------------------------------------------------------------------

const nationalRules = new RulePack(
  ['10-dimensions', '20-daylight-access', '30-adjacency', '40-vertical', '50-massing'].flatMap(
    (name) => parseRuleFile(read(`../../../../rules/base/${name}.yaml`), `base/${name}.yaml`),
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
    // `lightwell_max_area` khai `lightwell` trong khi từ vựng ghi `light_well` — quy tắc chưa
    // từng chạy lần nào (ghi chú đầu `rules/nvg-experience.yaml`). Nó phải HIỆN RA, không được
    // im lặng, vì «không cảnh báo» rất dễ đọc thành «đạt quy chuẩn».
    const result = reviewPlanRooms({
      levels: VILLA_PLAN.levels,
      buildingType: 'biet_thu',
      rules: experienceRules,
      labels,
      groups,
      messages,
    });
    expect(result.unchecked.map((rule) => rule.ruleId)).toContain('lightwell_max_area');
    expect(result.checked).not.toContain('lightwell_max_area');
  });
});
