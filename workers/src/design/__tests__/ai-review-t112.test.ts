/**
 * T112 — các chỗ bộ sinh tri thức đưa dữ liệu mâu thuẫn cho mô hình (review lời dẫn 01/10/2026), đo trên
 * đầu bài thật biệt thự Hưng Yên 15 × 20 m, ba thế hệ (lượt ghi 46d6eff3, lời dẫn 9.3.0). KHÔNG gọi mô hình.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AiBriefDigest } from '@nvg/shared/design';
import { feasibilityIssue } from '../ai/feasibility';
import { faceTags, houseSystem, planContext, type HouseModelKnowledge } from '../ai/plan';
import { prompts } from './ai-real-context';
import { askedTypes, checkProposal, liftToBriefFloors } from '../ai/program';
import { loadRun, realContextInput } from './ai-real-context';

const HUNG_YEN = loadRun('46d6eff3').digest;

function contextOf(digest: AiBriefDigest) {
  const input = realContextInput(digest, { stairShape: true, openSetback: true });
  return { input, context: planContext(input) };
}

const { input, context } = contextOf(HUNG_YEN);
const sent = context.modelKnowledge as HouseModelKnowledge;

describe('tri thức gửi mô hình không tự mâu thuẫn', () => {
  it('«Góc làm việc» của vợ chồng không mang mã `study` khi tầng 2 đã có phòng làm việc riêng', () => {
    const couple = sent.bedrooms.find((b) => b.for === 'vo_chong')!;
    expect(couple.inside).not.toContain('study');
    expect(couple.inside).not.toContain('study_area');
    expect(sent.bedrooms.find((b) => b.for === 'con')!.inside).toEqual(['study_area']);
  });

  it('không có phòng làm việc riêng cùng tầng thì góc làm việc gửi là `study_area`', () => {
    const digest = {
      ...HUNG_YEN,
      required_spaces: HUNG_YEN.required_spaces!.filter((s) => s.type !== 'study'),
    };
    const couple = (contextOf(digest).context.modelKnowledge as HouseModelKnowledge).bedrooms.find(
      (b) => b.for === 'vo_chong',
    )!;
    expect(couple.inside).toEqual(['study_area']);
  });

  it('cặp gộp chỉ gồm hai loại có thể cùng tầng — phòng thờ tầng 2 không gộp với phòng khách tầng 1', () => {
    const pairs = sent.open_pairs.map((pair) => [...pair].sort().join('|'));
    expect(pairs).not.toContain('altar_room|living');
    expect(pairs).toContain('dining|kitchen');
  });

  it('luật đi lại chỉ nhắc mã có trong `room_types`', () => {
    const types = new Set(Object.keys(sent.room_types));
    expect(sent.walk_through).not.toContain('core');
    for (const code of [...sent.walk_through, ...sent.entry_through]) expect(types).toContain(code);
    for (const [type, from] of Object.entries(sent.served_from)) {
      expect(types).toContain(type);
      for (const code of from) expect(types).toContain(code);
    }
  });
});

describe('mặt thoáng xét khoảng lùi (Haan: lùi dưới 1 m thì không thoáng)', () => {
  it('mặt sau giáp đất trống, lùi 0 m: không thoáng', () => {
    expect(context.openFaces).toEqual(['front', 'left']);
    expect(sent.open_faces).not.toContain('back');
  });

  it('chừa sân sau 1 m thì mặt sau thoáng lại', () => {
    const digest = {
      ...HUNG_YEN,
      massing: {
        ...HUNG_YEN.massing!,
        yard_depth_m: { ...HUNG_YEN.massing!.yard_depth_m, back: 1 },
      },
    };
    expect(contextOf(digest).context.openFaces).toContain('back');
  });

  it('ban công BẮT BUỘC ở mặt không thoáng thì nói ra trên màn hình', () => {
    const digest = {
      ...HUNG_YEN,
      balconies: { ...HUNG_YEN.balconies!, required_sides: ['back'] },
    } as AiBriefDigest;
    const warnings = contextOf(digest).context.demands.warnings;
    expect(warnings.some((w) => w.includes('mặt sau') && w.includes('không thoáng'))).toBe(true);
    expect(context.demands.warnings.some((w) => w.includes('bắt buộc có ban công'))).toBe(false);
  });

  it('ban công phơi phía sau mà mặt sau không thoáng: nói ra; chừa sân sau thì thôi', () => {
    const phoi = (w: string) => w.includes('ban công phơi phía sau');
    expect(context.demands.warnings.some(phoi)).toBe(true);
    const digest = {
      ...HUNG_YEN,
      massing: {
        ...HUNG_YEN.massing!,
        yard_depth_m: { ...HUNG_YEN.massing!.yard_depth_m, back: 1.5 },
      },
    };
    expect(contextOf(digest).context.demands.warnings.some(phoi)).toBe(false);
  });
});

describe('đầu bài bằng chữ', () => {
  it('ban công đua nói «mép nhà», không nói «ranh đất»', () => {
    expect(context.narrative).toContain('ĐUA RA NGOÀI mép nhà 1 m');
    expect(context.narrative).not.toMatch(/ĐUA RA NGOÀI ranh đất/);
  });

  it('cục nóng ở sân thượng mở đường cho sân thượng (không chặn)', () => {
    const demand = context.demands.spaces.find((s) => s.code === 'cuc_nong_san_thuong');
    expect(demand).toMatchObject({ anyOf: ['terrace'], blocking: false, level: 2 });
    expect(askedTypes(context.knowledge).has('terrace')).toBe(true);
  });
});

describe('gió mát ở mặt giáp nhà cao hơn', () => {
  it('bên phải giáp nhà 3 tầng, nhà này 2 tầng: cảnh báo gió bị chặn', () => {
    expect(context.demands.warnings.some((w) => /gió mát từ mặt bên phải/.test(w))).toBe(true);
  });

  it('nhà bên thấp hơn: không cảnh báo', () => {
    const digest = {
      ...HUNG_YEN,
      site: { ...HUNG_YEN.site, neighbour_floors: { ...HUNG_YEN.site.neighbour_floors, right: 1 } },
    } as AiBriefDigest;
    expect(contextOf(digest).context.demands.warnings.some((w) => /gió mát/.test(w))).toBe(false);
  });
});

describe('phòng ngủ khép kín ghép với đúng dòng đầu bài', () => {
  // Tầng 1: «phòng ngủ 20 m² khép kín» (ông bà) + «phòng ngủ 15 m²» (giúp việc).
  const proposal = (big: number, small: number, ensuiteOn: 'big' | 'small') => ({
    spaces: [
      { id: 'b1', type: 'bedroom', level: 1, target_area_m2: big, ensuite_of: null },
      { id: 'b2', type: 'bedroom', level: 1, target_area_m2: small, ensuite_of: null },
      {
        id: 'w1',
        type: 'wc',
        level: 1,
        target_area_m2: 4,
        ensuite_of: ensuiteOn === 'big' ? 'b1' : 'b2',
      },
    ],
  });
  const floor1 = (issues: string[]) => issues.filter((i) => /Phòng ngủ tầng 1/.test(i));

  it('WC khép kín gắn vào phòng nhỏ: phòng ấy phải đạt mức 20 m² của dòng khép kín', () => {
    const issues = checkProposal(
      proposal(21, 15, 'small') as never,
      context.knowledge,
      input.labels,
    );
    expect(floor1(issues)).toEqual([
      'Phòng ngủ tầng 1: đầu bài khai tối thiểu 20 m², đề xuất 15 m² — nhỏ hơn mức tối thiểu.',
    ]);
  });

  it('nâng diện tích mục tiêu theo cùng cách ghép: phòng có WC khép kín lên 20 m²', () => {
    const lifted = liftToBriefFloors(
      proposal(16, 14, 'small') as never,
      context.knowledge,
      input.labels,
    ).proposal.spaces;
    expect(lifted.find((s) => s.id === 'b2')!.target_area_m2).toBe(20);
    expect(lifted.find((s) => s.id === 'b1')!.target_area_m2).toBe(16);
  });

  it('WC khép kín ở phòng lớn: như trước, không lỗi', () => {
    const issues = checkProposal(proposal(21, 15, 'big') as never, context.knowledge, input.labels);
    expect(floor1(issues)).toEqual([]);
  });
});

describe('kiểm khả thi trước khi gọi mô hình', () => {
  const wall = input.construction.walls.exterior_m;

  it('đầu bài Hưng Yên đi tiếp', () => {
    expect(feasibilityIssue(context.knowledge, wall, input.quality, input.labels)).toBeNull();
  });

  it('không đầu bài nào đã ghi bị chặn (mọi lượt ghi đều từng được gửi mô hình)', () => {
    const dir = fileURLToPath(new URL('./fixtures', import.meta.url));
    const ids = readdirSync(dir)
      .filter((f) => f.startsWith('ai-run-'))
      .map((f) => f.slice('ai-run-'.length, -'.json'.length));
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) {
      const c = contextOf(loadRun(id).digest);
      expect(
        feasibilityIssue(c.context.knowledge, wall, input.quality, input.labels),
        id,
      ).toBeNull();
    }
  });

  it('phòng khách 150 m² trên sàn 192 m²: chặn, nói tầng và phòng chiếm nhiều nhất', () => {
    const digest = {
      ...HUNG_YEN,
      required_spaces: HUNG_YEN.required_spaces!.map((s) =>
        s.type === 'living' ? { ...s, area_m2: 150 } : s,
      ),
    };
    const message = feasibilityIssue(
      contextOf(digest).context.knowledge,
      wall,
      input.quality,
      input.labels,
    );
    expect(message).toMatch(
      /^Chưa tạo được mặt bằng vì diện tích yêu cầu vượt sàn xây được: tầng 1/,
    );
    expect(message).toContain('Phòng khách');
    expect(message).not.toContain('tầng 2 cần');
  });

  it('thước không khai mức thì không kiểm', () => {
    const digest = {
      ...HUNG_YEN,
      required_spaces: HUNG_YEN.required_spaces!.map((s) =>
        s.type === 'living' ? { ...s, area_m2: 150 } : s,
      ),
    };
    expect(
      feasibilityIssue(
        contextOf(digest).context.knowledge,
        wall,
        { feasibilityMaxPercent: null },
        input.labels,
      ),
    ).toBeNull();
  });
});

describe('lời dẫn 9.4.0 ghép theo đầu bài', () => {
  const system = (flags: Parameters<typeof houseSystem>[1]) =>
    houseSystem(prompts.floorLevel.system, flags);

  it('không thang máy thì không có chữ «lift» / «elevator»; không ông bà chưa ghim tầng thì không câu ấy', () => {
    const text = system(context.promptFlags);
    expect(context.promptFlags).toEqual({
      elevator: false,
      terrace: true,
      ong_ba_unset: false,
      roof: false,
      // Đầu bài này không cho vào nhà qua gara (T165) — câu gara làm entry_room không có.
      entry_garage: false,
    });
    expect(text).not.toMatch(/elevator|lift/i);
    expect(text).not.toContain('ong_ba');
    expect(text).toContain(
      'Only corridors, the roof terrace and living/dining open off the stair.',
    );
    expect(text).not.toMatch(/\[\[|\]\]/);
  });

  it('bật cờ thì câu trở lại', () => {
    const text = system({ elevator: true, terrace: false, ong_ba_unset: true });
    expect(text).toContain('a lift sits beside it');
    expect(text).toContain('Only corridors, the elevator and living/dining open off the stair.');
    expect(text).toContain('for: "ong_ba"');
  });

  it('không còn câu «kitchen and wc grouped» ngược luật bếp – WC; có câu WC khép kín mở từ phòng mẹ', () => {
    const text = system(context.promptFlags);
    expect(text).not.toMatch(/kitchen and\s+wc grouped/);
    expect(text).toMatch(/not sharing a wall, doors not facing/);
    expect(text).toContain('A room with `ensuite_of` opens only from its parent bedroom');
    // T155 (lượt 79669685): phòng con không phục vụ phòng khác — giặt phơi không mở qua ban công riêng của phòng ngủ.
    expect(text).toMatch(/serves no other room: no\s+laundry off a bedroom's own balcony\./);
  });

  it('cờ lạ trong tệp dữ liệu là lỗi, không gửi chữ thô', () => {
    expect(() => houseSystem('a[[lo|b]]', context.promptFlags)).toThrow(/cờ lời dẫn lạ/);
  });

  it('nhãn mặt: phải giáp nhà bên là mặt mù, gió mát chỉ ở mặt thoáng', () => {
    expect(sent.faces).toEqual({
      front: ['open', 'cool_wind'],
      back: ['harsh_sun'],
      left: ['open', 'harsh_sun'],
      right: ['blind'],
    });
    expect(
      faceTags({ ...HUNG_YEN, site: { ...HUNG_YEN.site, cool_wind_sides: [] } }, ['front']),
    ).toMatchObject({ front: ['open'] });
  });
});
