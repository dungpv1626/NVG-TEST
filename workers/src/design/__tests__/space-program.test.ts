/**
 * Lớp 2 — chương trình không gian (Mốc 4).
 *
 * Chạy trên rule pack và chuẩn diện tích THẬT (`program-fixtures.ts`), không phải dữ liệu tự
 * dựng: phần lớn hành vi của Lớp 2 do hai tệp YAML đó quyết định, nên kiểm thử không đọc
 * chúng thì không kiểm được gì đáng kể.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artifactId, canonicalJson, type DesignBrief } from '@nvg/shared/design';
import { parseArtifact } from '../contracts';
import { buildSpaceProgram, ProgramError } from '../program/engine';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { bandFor, parseSpaceNorms, SpaceNormsError } from '../program/norms';
import { RoomAreaPriors } from '../program/priors';
import { parseVocabulary, VocabularyIndex } from '../kb/vocabulary';
import { resolveNeeds } from '../program/needs';
import { GeminiClient } from '../llm/gemini';
import { ModelRouter, parseModelConfig } from '../llm/router';
import { testNorms, testRulePack, testVocabularyYaml } from './program-fixtures';

const norms = testNorms();
const rules = testRulePack();
const REF = `sha256:${'a'.repeat(64)}`;

function brief(overrides: Partial<DesignBrief> = {}): DesignBrief {
  return {
    schema_version: '1.1.0',
    project_id: '11111111-1111-4111-8111-111111111111',
    building_type: 'nha_pho',
    locality: 'hung_yen',
    site: { width_m: 5, depth_m: 18 },
    floors: 3,
    family: [
      { role: 'vo_chong', count: 2 },
      { role: 'con', count: 2 },
    ],
    required_spaces: [],
    ...overrides,
  } as DesignBrief;
}

const build = (b: DesignBrief = brief()) =>
  buildSpaceProgram({ brief: b, briefRef: REF, rules, norms });

describe('Ghim tầng cho phòng ngủ của một nhóm thành viên', () => {
  it('ghim vào đúng tầng đã khai, không để bước cân tải đẩy đi chỗ khác', () => {
    const { payload } = build(
      brief({
        floors: 3,
        family: [
          { role: 'vo_chong', count: 2, floor: 3 },
          { role: 'ong_ba', count: 2, floor: 1 },
        ],
      } as Partial<DesignBrief>),
    );
    expect(payload.spaces.find((s) => s.type === 'master_bedroom')?.floor).toBe(3);
    expect(payload.spaces.find((s) => s.type === 'bedroom')?.floor).toBe(1);
  });

  it('khu vệ sinh khép kín đi THEO tầng đã ghim của phòng mẹ', () => {
    const { payload } = build(
      brief({
        floors: 3,
        family: [{ role: 'vo_chong', count: 2, floor: 3, ensuite: true }],
      } as Partial<DesignBrief>),
    );
    const master = payload.spaces.find((s) => s.type === 'master_bedroom')!;
    const inside = payload.spaces.find((s) => s.enclosed_in === master.id)!;
    expect(master.floor).toBe(3);
    expect(inside.floor).toBe(3);
  });

  it('ghim vượt số tầng: bỏ ghim, cảnh báo bằng nhãn tiếng Việt, KHÔNG mất phòng', () => {
    // Hạ số tầng sau khi đã ghim là chuyện thường gặp. Mất luôn phòng ngủ vì một con số quá
    // hạn là hỏng nặng hơn nhiều so với việc xếp nó vào tầng khác.
    const result = build(
      brief({
        floors: 2,
        family: [{ role: 'vo_chong', count: 2, floor: 5 }],
      } as Partial<DesignBrief>),
    );
    expect(result.warnings.some((w) => w.includes('Phòng ngủ chính') && w.includes('tầng 5'))).toBe(
      true,
    );
    const master = result.payload.spaces.find((s) => s.type === 'master_bedroom');
    expect(master).toBeDefined();
    expect(master!.floor).toBeLessThanOrEqual(2);
  });

  it('`floor` thắng `floor_pref` khi đầu bài cũ còn mang cả hai', () => {
    const { payload } = build(
      brief({
        floors: 3,
        family: [{ role: 'vo_chong', count: 2, floor: 1, floor_pref: 'top' }],
      } as Partial<DesignBrief>),
    );
    expect(payload.spaces.find((s) => s.type === 'master_bedroom')?.floor).toBe(1);
  });
});

describe('Phòng ngủ khép kín', () => {
  const ensuiteBrief = () =>
    brief({
      family: [
        { role: 'vo_chong', count: 2, ensuite: true },
        { role: 'con', count: 2 },
      ],
    } as Partial<DesignBrief>);

  it('sinh một khu vệ sinh nằm TRONG phòng ngủ, cùng tầng với nó', () => {
    const { payload } = build(ensuiteBrief());
    const enclosed = payload.spaces.filter((s) => s.enclosed_in);
    expect(enclosed).toHaveLength(1);

    const child = enclosed[0]!;
    const parent = payload.spaces.find((s) => s.id === child.enclosed_in);
    expect(child.type).toBe('wc');
    expect(parent?.type).toBe('master_bedroom');
    // Tầng của nó là HỆ QUẢ, không phải lựa chọn. Để bước cân tải tự chọn thì sớm muộn có một
    // phòng ngủ tầng hai với khu vệ sinh riêng nằm ở tầng một.
    expect(child.floor).toBe(parent?.floor);
  });

  it('khu vệ sinh khép kín không đòi mặt thoáng và phải KỀ phòng mẹ', () => {
    const { payload } = build(ensuiteBrief());
    const child = payload.spaces.find((s) => s.enclosed_in)!;

    // Nó lấy sáng và gió qua chính phòng mẹ; đòi nó tự có mặt thoáng là ép một lỗ mở ra ngoài
    // mà nhà thật không làm.
    expect(child.needs_daylight).toBe(false);
    expect(child.needs_facade).toBe(false);

    const pair = (payload.adjacency ?? []).find(
      (a) =>
        a.kind === 'adjacent' &&
        [a.a, a.b].includes(child.id) &&
        [a.a, a.b].includes(child.enclosed_in!),
    );
    expect(pair?.weight).toBe(1);
  });

  it('dòng phòng ngủ khai tường minh GHI ĐÈ mà vẫn giữ khu vệ sinh khép kín', () => {
    // Hồi quy có thật, và nó hỏng im lặng: phần ghi đè chỉ đếm số dòng rồi bỏ qua phòng bị
    // đứng thay, kéo theo bỏ luôn khối `wc` gắn kèm. Không lỗi, không cảnh báo — chỉ là căn
    // nhà thiếu một khu vệ sinh. Vô hại chừng nào hiếm ai khai tường minh phòng ngủ; từ
    // 07/09/2026 biểu mẫu tự sinh MỌI dòng phòng ngủ nên nó sẽ đúng ở mọi hồ sơ.
    const { payload } = build(
      brief({
        family: [{ role: 'vo_chong', count: 2, ensuite: true }],
        required_spaces: [{ type: 'master_bedroom', floor: 2, ensuite: true }],
      } as Partial<DesignBrief>),
    );

    const beds = payload.spaces.filter((s) => s.type === 'master_bedroom');
    expect(beds).toHaveLength(1); // ghi đè, KHÔNG cộng thêm
    expect(beds[0]!.floor).toBe(2); // ghim của dòng khai tường minh vẫn có hiệu lực

    const enclosed = payload.spaces.filter((s) => s.enclosed_in);
    expect(enclosed).toHaveLength(1);
    expect(enclosed[0]!.enclosed_in).toBe(beds[0]!.id);
  });

  it('dòng khai tường minh KHÔNG nói gì về khép kín thì lấy theo Thành viên gia đình', () => {
    // Đầu bài lưu trước 07/09/2026 không có trường `ensuite` trên dòng không gian. Bỏ qua
    // vế này là làm mất khu vệ sinh của chính những hồ sơ cũ đó.
    const { payload } = build(
      brief({
        family: [{ role: 'vo_chong', count: 2, ensuite: true }],
        required_spaces: [{ type: 'master_bedroom', floor: 2 }],
      } as Partial<DesignBrief>),
    );
    expect(payload.spaces.filter((s) => s.enclosed_in)).toHaveLength(1);
  });

  it('dòng khai tường minh nói KHÔNG khép kín thì thắng câu trả lời của gia đình', () => {
    const { payload } = build(
      brief({
        family: [{ role: 'vo_chong', count: 2, ensuite: true }],
        required_spaces: [{ type: 'master_bedroom', floor: 2, ensuite: false }],
      } as Partial<DesignBrief>),
    );
    expect(payload.spaces.filter((s) => s.enclosed_in)).toHaveLength(0);
  });

  it('KHÔNG đếm hai lần: phòng khép kín không kéo theo một khu vệ sinh chung', () => {
    // Đây là chỗ hỏng im lặng nhất của tính năng: chương trình vẫn hợp lệ, bộ giải vẫn giải
    // được, chỉ là căn nhà thừa đúng bằng số phòng khép kín một khu vệ sinh mà không ai đặt.
    const plain = build().payload.spaces.filter((s) => s.type === 'wc' && !s.enclosed_in).length;
    const withEnsuite = build(ensuiteBrief()).payload.spaces.filter(
      (s) => s.type === 'wc' && !s.enclosed_in,
    ).length;
    expect(withEnsuite).toBeLessThanOrEqual(plain);
  });
});

describe('Không gian khai tường minh — một phần tử là một PHÒNG', () => {
  it('cùng một mã lặp lại thì ra bấy nhiêu phòng, ghim tầng riêng từng cái', () => {
    // Dùng `laundry` chứ không phải `study`: `study` nằm trong danh sách không gian bổ sung
    // (`allocation.fillers`) nên tầng nào còn trống sẽ được thêm một cái nữa, và bài test sẽ
    // đếm cả phần engine tự thêm.
    const { payload } = build(
      brief({
        floors: 3,
        family: [],
        required_spaces: [
          { type: 'laundry', floor: 1 },
          { type: 'laundry', floor: 3 },
        ],
      }),
    );
    const rooms = payload.spaces.filter((s) => s.type === 'laundry');
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.floor).sort()).toEqual([1, 3]);
  });

  it('diện tích khách khai thành TỐI THIỂU, nhưng KHÔNG kéo tối thiểu quy chuẩn xuống', () => {
    const { payload } = build(
      brief({
        family: [],
        required_spaces: [
          { type: 'laundry', area_m2: 24 },
          { type: 'wc', area_m2: 0.5 },
        ],
      }),
    );
    const wanted = payload.spaces.find((s) => s.type === 'laundry')!;
    expect(wanted.min_area_m2).toBe(24);
    expect(wanted.min_source).toBe('brief');
    expect(wanted.target_area_m2!).toBeGreaterThanOrEqual(24);

    // 0,5 m² là con số khách nói ra, và nó thua quy chuẩn. Diện tích tối thiểu không thương
    // lượng được, kể cả khi người khai muốn nhỏ hơn.
    const wc = payload.spaces.find((s) => s.type === 'wc')!;
    expect(wc.target_area_m2).toBeGreaterThanOrEqual(wc.min_area_m2!);
    expect(wc.min_source).not.toBe('brief');
  });

  it('phòng ngủ khai tường minh GHI ĐÈ phần suy từ gia đình, không cộng thêm', () => {
    const base = build(brief({ required_spaces: [] })).payload.spaces.filter(
      (s) => s.type === 'bedroom',
    ).length;
    const pinned = build(
      brief({ required_spaces: [{ type: 'bedroom', floor: 1 }] }),
    ).payload.spaces.filter((s) => s.type === 'bedroom');

    expect(pinned).toHaveLength(base);
    expect(pinned.some((r) => r.floor === 1)).toBe(true);
  });
});

describe('Chuẩn diện tích — tệp dữ liệu', () => {
  it('phủ được MỌI mã phòng của từ vựng', () => {
    // Một loại phòng thiếu chuẩn sẽ bị bỏ lặng lẽ khỏi chương trình không gian: khách yêu
    // cầu một không gian rồi không thấy nó ở đâu nữa, và không lỗi nào nổ ra.
    const vocabulary = parseVocabulary(testVocabularyYaml());
    const missing = vocabulary.types.map((t) => t.code).filter((code) => !norms.spaces[code]);
    expect(missing).toEqual([]);
  });

  it('chặn bộ ba diện tích nghịch đảo', () => {
    const broken = `
version: '1.0.0'
priors: { min_samples: 15, width_bands: [{ id: a, max_width_m: null, scale: 1 }] }
occupancy: {}
mandatory: {}
derived:
  wc: { per_bedrooms: 2, min_per_floor: 1 }
  circulation: { ratio_of_floor: 0.12 }
  stair: { per_core: 1 }
adjacency_weight: { error: 1, warning: 0.6 }
spaces:
  living:
    min_m2: 30
    target_m2: 20
    max_m2: 40
    priority: 1
    floor: ground
    daylight: true
    facade: true
    ventilation: true
`;
    expect(() => parseSpaceNorms(broken)).toThrow(SpaceNormsError);
  });

  it('chặn dải bề rộng cuối có cận trên', () => {
    const broken = `
version: '1.0.0'
priors:
  min_samples: 15
  width_bands:
    - { id: hep, max_width_m: 4.5, scale: 0.9 }
    - { id: rong, max_width_m: 8, scale: 1.1 }
occupancy: {}
mandatory: {}
derived:
  wc: { per_bedrooms: 2, min_per_floor: 1 }
  circulation: { ratio_of_floor: 0.12 }
  stair: { per_core: 1 }
adjacency_weight: { error: 1, warning: 0.6 }
spaces:
  living: { min_m2: 10, target_m2: 20, max_m2: 40, priority: 1, weight: 3, floor: ground, daylight: true, facade: true, ventilation: true }
`;
    // Lô 20 m rơi ra ngoài mọi dải → hệ số nhân thành undefined → diện tích thành NaN, và
    // sai kiểu đó chỉ lộ ra ở tận bản vẽ.
    expect(() => parseSpaceNorms(broken)).toThrow(/dải bề rộng cuối/);
  });

  it('dải bề rộng chọn đúng theo kích thước lô', () => {
    expect(bandFor(norms, 4).id).toBe('hep');
    expect(bandFor(norms, 5).id).toBe('trung_binh');
    expect(bandFor(norms, 20).id).toBe('rat_rong');
  });
});

describe('Soạn chương trình không gian', () => {
  it('kết quả đúng hợp đồng SpaceProgram', () => {
    expect(() => parseArtifact('space_program', build().payload)).not.toThrow();
  });

  it('mã không gian không trùng nhau và đúng định dạng hợp đồng', () => {
    const ids = build().payload.spaces.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('suy đúng số phòng ngủ từ thành phần gia đình', () => {
    const spaces = build().payload.spaces;
    // Hai vợ chồng ở chung một phòng ngủ chính; hai con mỗi cháu một phòng.
    expect(spaces.filter((s) => s.type === 'master_bedroom')).toHaveLength(1);
    expect(spaces.filter((s) => s.type === 'bedroom')).toHaveLength(2);
  });

  it('có đủ không gian bắt buộc dù đầu bài không khai gì', () => {
    const types = new Set(build(brief({ required_spaces: [] })).payload.spaces.map((s) => s.type));
    for (const required of ['living', 'dining', 'kitchen', 'wc', 'circulation']) {
      expect(types).toContain(required);
    }
  });

  it('thang có ở mọi tầng TRỪ tầng trên cùng', () => {
    const stairs = build().payload.spaces.filter((s) => s.type === 'stair');
    expect(stairs.map((s) => s.floor).sort()).toEqual([1, 2]);
  });

  it('nhà một tầng không có thang', () => {
    const spaces = build(brief({ floors: 1 })).payload.spaces;
    expect(spaces.filter((s) => s.type === 'stair')).toHaveLength(0);
  });

  it('mỗi tầng có đúng một khối giao thông', () => {
    const circulation = build().payload.spaces.filter((s) => s.type === 'circulation');
    expect(circulation.map((s) => s.floor).sort()).toEqual([1, 2, 3]);
  });

  it('mọi tầng đều có khu vệ sinh', () => {
    // Phần tối thiểu mỗi tầng phải GHIM theo tầng. Thả nổi rồi để bước cân tải quyết định
    // thì cả ba khu dồn lên tầng nhẹ nhất — đúng về số học, và là một căn nhà có hai tầng
    // không có nhà vệ sinh nào. Lỗi này đã xảy ra thật khi dựng bước gán tầng.
    const floors = new Set(
      build(brief({ floors: 4 }))
        .payload.spaces.filter((s) => s.type === 'wc')
        .map((s) => s.floor),
    );
    expect([...floors].sort()).toEqual([1, 2, 3, 4]);
  });

  it('phòng thả nổi dồn vào tầng đang dùng trước khi mở tầng mới; tầng trống được bổ sung (V-11)', () => {
    // Ba thế hệ, bốn phòng ngủ, bốn tầng: trước đây mỗi tầng một phòng ngủ và tầng nào cũng
    // trống 40 % — bộ giải phải phình vệ sinh hay mở thông tầng để lấp. Nay hai phòng ngủ ở
    // chung một tầng khi còn chỗ, và không tầng nào dưới ngưỡng bổ sung.
    const program = build(
      brief({
        floors: 4,
        family: [
          { role: 'ong_ba', count: 2 },
          { role: 'vo_chong', count: 2 },
          { role: 'con', count: 2 },
        ],
        required_spaces: [
          { type: 'altar_room', floor: 4 },
          { type: 'garage', floor: 1 },
        ],
      }),
    ).payload;
    const bedroomsByFloor = new Map<number, number>();
    for (const s of program.spaces) {
      if (s.type === 'bedroom' || s.type === 'master_bedroom') {
        bedroomsByFloor.set(s.floor, (bedroomsByFloor.get(s.floor) ?? 0) + 1);
      }
    }
    expect(Math.max(...bedroomsByFloor.values())).toBeGreaterThanOrEqual(2);
    for (const allocation of program.floor_allocation ?? []) {
      const ratio = (allocation.allocated_area_m2 ?? 0) / (allocation.usable_area_m2 ?? 1);
      expect(ratio, `tầng ${allocation.floor} còn trống quá`).toBeGreaterThanOrEqual(
        norms.allocation.filler_below_ratio - 1e-9,
      );
    }
  });

  it('diện tích đã phân bổ mỗi tầng khớp tổng diện tích mong muốn của tầng đó', () => {
    const program = build().payload;
    for (const allocation of program.floor_allocation ?? []) {
      const sum = program.spaces
        .filter((s) => s.floor === allocation.floor)
        .reduce((total, s) => total + (s.target_area_m2 ?? 0), 0);
      expect(allocation.allocated_area_m2).toBeCloseTo(sum, 1);
    }
  });

  it('quy tắc thắng nguyện vọng về tầng: phòng thờ lên trên cùng, gara xuống trệt', () => {
    const spaces = build(
      brief({ required_spaces: [{ type: 'altar_room' }, { type: 'garage' }], floors: 4 }),
    ).payload.spaces;
    expect(spaces.find((s) => s.type === 'altar_room')?.floor).toBe(4);
    expect(spaces.find((s) => s.type === 'garage')?.floor).toBe(1);
  });

  it('nguyện vọng tầng của gia đình thắng mặc định theo vai trò', () => {
    const spaces = build(brief({ family: [{ role: 'con', count: 1, floor_pref: 'top' }] })).payload
      .spaces;
    expect(spaces.find((s) => s.type === 'bedroom')?.floor).toBe(3);
  });

  it('ghim tầng từ đầu bài thắng cả nguyện vọng lẫn cân tải', () => {
    // `garage` mặc định xuống trệt theo rule pack (test ở trên) — ghim thẳng lên tầng 2 phải
    // thắng cả điều đó lẫn bước cân tải, vì đây là chỉ định CỨNG của người dùng.
    const spaces = build(brief({ required_spaces: [{ type: 'garage', floor: 2 }], floors: 3 }))
      .payload.spaces;
    expect(spaces.find((s) => s.type === 'garage')?.floor).toBe(2);
  });

  it('ghim vào tầng không tồn tại: bỏ ghim, cảnh báo, không mất không gian', () => {
    const result = build(brief({ required_spaces: [{ type: 'garage', floor: 99 }], floors: 3 }));
    // Nhãn tiếng Việt trong câu cảnh báo, không phải mã máy `garage` (CLAUDE.md 4.1).
    expect(result.warnings.some((w) => w.includes('Để xe') && w.includes('99'))).toBe(true);
    const garage = result.payload.spaces.find((s) => s.type === 'garage');
    expect(garage).toBeDefined();
    expect(garage!.floor).toBeGreaterThanOrEqual(1);
    expect(garage!.floor).toBeLessThanOrEqual(3);
  });
});

describe('Ba nguồn tri thức, đúng thứ tự ưu tiên', () => {
  it('diện tích tối thiểu của GÓI QUY TẮC thắng chuẩn nghề khi gói có khai', () => {
    // Gói hiện hành không còn quy chuẩn (13/09/2026); dựng một gói có `min_area` để giữ phép
    // thử cho CƠ CHẾ: hạ chuẩn nghề xuống dưới số của gói thì số của gói vẫn thắng.
    const pack = new RulePack(
      parseRuleFile(
        [
          '- id: test_min_area_bedroom',
          '  applies_to: [nha_pho]',
          '  scope: room',
          '  predicate: min_area',
          '  target: bedroom',
          '  value_m2: 9',
          '  severity: warning',
          "  source: 'kinh nghiệm NVG'",
          '  auto_repair: none',
        ].join('\n'),
        'test',
      ),
      false,
    );
    const loosened = structuredClone(norms);
    loosened.spaces.bedroom!.min_m2 = 4;
    loosened.spaces.bedroom!.target_m2 = 14;
    const program = buildSpaceProgram({
      brief: brief(),
      briefRef: REF,
      rules: pack,
      norms: loosened,
    });
    const bedroom = program.payload.spaces.find((s) => s.type === 'bedroom');
    expect(pack.minArea('nha_pho', 'bedroom')).toBe(9);
    expect(bedroom?.min_area_m2).toBe(9);
  });

  it('thống kê thực nghiệm THẮNG chuẩn nghề nghiệp khi có', () => {
    const priors = new RoomAreaPriors(
      [{ roomType: 'living', sampleCount: 40, projectCount: 20, p25: 18, median: 26.5, p75: 33 }],
      'trung_binh',
    );
    const withPriors = buildSpaceProgram({
      brief: brief({ site: { width_m: 5, depth_m: 30 } }),
      briefRef: REF,
      rules,
      norms,
      priors,
    });
    const living = withPriors.payload.spaces.find((s) => s.type === 'living');
    expect(living?.target_area_m2).toBe(26.5);
    expect(withPriors.payload.priors_applied).toBe(true);
  });

  it('không có thống kê thì KHÔNG khai là đã dùng', () => {
    expect(build().payload.priors_applied).toBe(false);
  });

  it('lô rộng hơn thì diện tích mong muốn lớn hơn', () => {
    const hep = build(brief({ site: { width_m: 4, depth_m: 30 } })).payload;
    const rong = build(brief({ site: { width_m: 7, depth_m: 30 } })).payload;
    const target = (p: typeof hep) =>
      p.spaces.find((s) => s.type === 'living')?.target_area_m2 ?? 0;
    expect(target(rong)).toBeGreaterThan(target(hep));
  });
});

describe('Ép vừa diện tích sàn', () => {
  it('lô chật thì nhường theo độ ưu tiên, không phòng nào xuống dưới tối thiểu', () => {
    const tight = build(brief({ site: { width_m: 4, depth_m: 10 }, floors: 2 }));
    for (const space of tight.payload.spaces) {
      expect(space.target_area_m2).toBeGreaterThanOrEqual(space.min_area_m2);
    }
    const floor1 = tight.payload.spaces.filter((s) => s.floor === 1);
    const allocated = floor1.reduce((sum, s) => sum + (s.target_area_m2 ?? 0), 0);
    const usable = tight.payload.floor_allocation?.find((f) => f.floor === 1)?.usable_area_m2 ?? 0;
    // Hoặc vừa sàn, hoặc engine đã NÓI RA là không vừa — không có trường hợp im lặng.
    expect(allocated <= usable + 0.1 || tight.warnings.some((w) => w.includes('Tầng 1'))).toBe(
      true,
    );
  });

  it('nhu cầu vượt sàn thì cảnh báo bằng tiếng Việt, không ném lỗi', () => {
    const crowded = build(
      brief({
        site: { width_m: 3.5, depth_m: 8 },
        floors: 1,
        family: [{ role: 'con', count: 6 }],
      }),
    );
    expect(crowded.warnings.some((w) => /vượt sàn có được/.test(w))).toBe(true);
  });

  it('mật độ xây dựng của đầu bài giới hạn sàn mỗi tầng', () => {
    const villa = build(
      brief({
        building_type: 'biet_thu',
        site: { width_m: 20, depth_m: 20, max_density: 0.5, setback_required_m: {} },
      }),
    );
    expect(villa.payload.floor_allocation?.[0]?.buildable_area_m2).toBe(200);
  });

  it('khoảng lùi lớn hơn lô thì dừng ngay, kèm câu giải thích', () => {
    expect(() =>
      build(
        brief({
          building_type: 'biet_thu',
          site: {
            width_m: 6,
            depth_m: 6,
            setback_required_m: { front: 4, back: 4, left: 1, right: 1 },
          },
        }),
      ),
    ).toThrow(ProgramError);
  });
});

describe('Phủ được mặt sàn — điều kiện để bộ giải có nghiệm', () => {
  // Bộ giải CP-SAT chia HẾT mặt sàn: không có khái niệm "phần còn lại để trống". Tổng diện
  // tích tối đa của một tầng nhỏ hơn mặt sàn là vô nghiệm ngay cả khi mọi phòng đều thoải
  // mái — và tập ràng buộc mâu thuẫn trả về sẽ chỉ vào `max_area` của một hành lang, tức là
  // chỗ khó hiểu nhất có thể. Lỗi này đã xảy ra thật, phát hiện khi chạy đầu-cuối qua
  // Container; phép thử dưới đây bắt nó mà không cần dựng Container.
  const cases: Array<[string, DesignBrief]> = [
    ['nhà phố hẹp 3 tầng', brief()],
    ['nhà phố 4 tầng ít người', brief({ floors: 4, family: [{ role: 'vo_chong', count: 2 }] })],
    ['nhà một tầng', brief({ floors: 1 })],
    [
      'biệt thự lô rộng',
      brief({
        building_type: 'biet_thu',
        site: { width_m: 18, depth_m: 25, max_density: 0.6 },
        floors: 2,
        required_spaces: [
          { type: 'study' },
          { type: 'altar_room' },
          { type: 'garage' },
          { type: 'laundry' },
        ],
      }),
    ],
  ];

  for (const [label, input] of cases) {
    it(`${label}: mọi tầng đều phủ được`, () => {
      const program = build(input).payload;
      for (const allocation of program.floor_allocation ?? []) {
        const onFloor = program.spaces.filter((s) => s.floor === allocation.floor);
        const usable = allocation.usable_area_m2 ?? 0;
        const totalMax = onFloor.reduce((sum, s) => sum + (s.max_area_m2 ?? 0), 0);
        const totalMin = onFloor.reduce((sum, s) => sum + s.min_area_m2, 0);
        expect(totalMax).toBeGreaterThanOrEqual(usable - 0.05);
        expect(totalMin).toBeLessThanOrEqual(usable + 0.05);
      }
    });
  }

  it('cận trên không bao giờ thấp hơn diện tích mong muốn', () => {
    for (const space of build(brief({ site: { width_m: 4, depth_m: 9 } })).payload.spaces) {
      expect(space.max_area_m2 ?? 0).toBeGreaterThanOrEqual(space.target_area_m2 ?? 0);
    }
  });

  it('giao thông lấy diện tích theo tỉ lệ mặt sàn, không phải một con số cố định', () => {
    const target = (b: DesignBrief) =>
      build(b).payload.spaces.find((s) => s.type === 'circulation' && s.floor === 2)
        ?.target_area_m2 ?? 0;
    expect(target(brief({ site: { width_m: 8, depth_m: 20 } }))).toBeGreaterThan(
      target(brief({ site: { width_m: 4, depth_m: 12 } })),
    );
  });
});

describe('Quan hệ liền kề — sinh từ rule pack, không khai lại', () => {
  it('bếp kề phòng ăn khi cùng tầng', () => {
    const program = build().payload;
    const kitchen = program.spaces.find((s) => s.type === 'kitchen')!;
    const dining = program.spaces.find((s) => s.type === 'dining')!;
    const pair = program.adjacency?.find(
      (a) => [a.a, a.b].includes(kitchen.id) && [a.a, a.b].includes(dining.id),
    );
    expect(pair?.kind).toBe('adjacent');
    expect(kitchen.floor).toBe(dining.floor);
  });

  it('quan hệ phạm vi CẢ NHÀ vẫn sinh khi hai phòng khác tầng', () => {
    const program = build(brief({ required_spaces: [{ type: 'altar_room' }], floors: 3 })).payload;
    const altar = program.spaces.find((s) => s.type === 'altar_room')!;
    const wcs = program.spaces.filter((s) => s.type === 'wc' && s.floor !== altar.floor);
    expect(wcs.length).toBeGreaterThan(0);
    for (const wc of wcs) {
      const pair = program.adjacency?.find(
        (a) => [a.a, a.b].includes(altar.id) && [a.a, a.b].includes(wc.id),
      );
      expect(pair?.kind).toBe('separate');
    }
  });

  it('trọng số suy từ mức nghiêm trọng của quy tắc', () => {
    const weights = new Set(build().payload.adjacency?.map((a) => a.weight));
    for (const weight of weights) {
      expect([norms.adjacency_weight.error, norms.adjacency_weight.warning]).toContain(weight);
    }
  });
});

describe('Tất định', () => {
  it('cùng đầu bài cho cùng chương trình không gian, từng byte', () => {
    // Đây là điều kiện để mã băm artifact có nghĩa: hai lần chạy ra hai mã băm khác nhau thì
    // "đã tính rồi thì không tính lại" không bao giờ có tác dụng.
    expect(JSON.stringify(build().payload)).toBe(JSON.stringify(build().payload));
  });

  it('mã băm sống sót qua một vòng cất và đọc lại', async () => {
    // Màn hình trả lời câu "bản đang xem có phải bản đã chốt không" bằng cách so MÃ BĂM,
    // không so chuỗi JSON. Phép thử này canh chính điều làm cho cách đó đúng: cất xuống kho
    // rồi đọc lên vẫn ra đúng mã băm cũ. So chuỗi JSON thì không — thứ tự khoá đổi trên
    // đường đi, và màn hình báo "chưa chốt" ngay sau khi vừa chốt xong. Đã xảy ra thật.
    const payload = build().payload;
    const roundTripped = parseArtifact('space_program', JSON.parse(canonicalJson(payload)));
    expect(await artifactId(roundTripped)).toBe(await artifactId(payload));
  });

  /**
   * TRẦN xây được của một tầng — sau khoảng lùi và mật độ, trước khi engine chọn dùng bao
   * nhiêu. Đây là con số ba phép đo dưới đây thật sự nhắm tới.
   *
   * ⚠️ Từ 07/09/2026 phải đọc `buildable_area_m2`, KHÔNG đọc `usable_area_m2` nữa:
   * `usable_area_m2` nay là mặt sàn engine CHỌN DÙNG, và nó nhỏ hơn trần bất cứ khi nào
   * chương trình không cần hết chỗ. Đọc nhầm trường thì ba phép đo dưới đây đo nhu cầu của
   * đầu bài mẫu chứ không đo phép tính khoảng lùi/mật độ mà chúng sinh ra để canh.
   *
   * Hai thước đo khác đã thử và loại:
   *  · tổng `target_area_m2` — co theo nhu cầu phòng, nên thấp hơn sàn ở mọi trường hợp;
   *    phép so "ít hơn" vẫn xanh dù bề rộng lấy sai.
   *  · tổng `max_area_m2` — các phòng cạnh tranh nhau nên tổng này VƯỢT sàn ở tầng đông
   *    phòng; nó là sàn dưới của độ phủ, không phải trần.
   */
  const usable = (result: ReturnType<typeof build>, floor: number): number =>
    (result.payload.floor_allocation ?? []).find((f) => f.floor === floor)?.buildable_area_m2 ?? 0;

  it('thửa hình thang: sàn tính trên phần đất HẸP, không trên hình bao', () => {
    // Mặt tiền 6 m, mặt hậu 4 m, sâu 20 m. Ô chữ nhật xây được là 4 × 20 = 80 m²; hình bao
    // là 6 × 20 = 120 m². Lấy hình bao là xếp phòng lên 40 m² đất không tồn tại.
    const trapezoid = brief({
      site: { width_m: 6, depth_m: 20, shape: 'hinh_thang', rear_width_m: 4 },
    });
    expect(usable(build(trapezoid), 1)).toBe(80);

    // Cùng mặt tiền, thửa chữ nhật thì dùng hết 6 × 20 — nên phép trên không phải là
    // "engine luôn lấy ít".
    expect(usable(build(brief({ site: { width_m: 6, depth_m: 20 } })), 1)).toBe(120);
  });

  it('phần đất ngoài ô chữ nhật được NÓI RA', () => {
    // Bộ giải chia hết một hình chữ nhật, nên phần đất ngoài ô đó không bao giờ có phòng.
    // Im lặng ở đây nghĩa là kiến trúc sư phát hiện ra ở bước chồng bản vẽ lên trích lục.
    const result = build(
      brief({ site: { width_m: 6, depth_m: 20, shape: 'hinh_thang', rear_width_m: 4 } }),
    );
    expect(result.warnings.some((w) => w.includes('nằm ngoài phần đó'))).toBe(true);
  });

  it('trần mật độ tính trên diện tích THẬT của thửa, không trên hình bao', () => {
    // Biệt thự, đầu bài khai mật độ 0,6 và khoảng lùi trước 3 m. Thửa hình thang mặt
    // tiền 12 m, mặt hậu 8 m, sâu 20 m:
    //  · ô chữ nhật xây được 8 × (20 − 3) = 136 m²;
    //  · diện tích THẬT (12+8)/2 × 20 = 200 m² → trần 120 m² → **trần mật độ chặn**;
    //  · hình bao 12 × 20 = 240 m² → trần 144 m² → ô chữ nhật chặn, ra 136 m².
    // Hai đường cho hai con số khác nhau, và không lỗi nào nổ ra ở đường sai.
    const villa = brief({
      building_type: 'biet_thu',
      floors: 2,
      site: {
        width_m: 12,
        depth_m: 20,
        shape: 'hinh_thang',
        rear_width_m: 8,
        max_density: 0.6,
        setback_required_m: { front: 3 },
      },
    });
    expect(usable(build(villa), 1)).toBe(120);
  });

  it('không gian lạ trong đầu bài được NÓI RA, không bị nuốt', () => {
    const result = build(brief({ required_spaces: [{ type: 'ho_boi_trong_nha' }] }));
    expect(result.warnings.some((w) => w.includes('ho_boi_trong_nha'))).toBe(true);
  });

  it('địa phương chưa có gói riêng vẫn chạy, KHÔNG cảnh báo, và KHÔNG tự ép số quy chuẩn nào', () => {
    // Từ 13/09/2026 bộ giải không còn gói quy chuẩn: khoảng lùi và mật độ chỉ đến từ đầu bài.
    // Tỉnh chưa có văn bản riêng không phải tình trạng đáng cảnh báo — cảnh báo nổ ở mọi lần
    // chạy là cảnh báo bị bỏ qua.
    //
    // Chế độ đã chạy vẫn ghi lại được — `runLayer2` đặt vào `params.rule_pack_locality`.
    const pack = testRulePack('ha_noi');
    expect(pack.localityMissing, 'chưa tỉnh nào có gói riêng').toBe(true);
    expect(pack.maxDensity('biet_thu'), 'gói không còn trần mật độ').toBeNull();
    expect(pack.setbacks('biet_thu').front ?? 0, 'gói không còn khoảng lùi').toBe(0);

    const elsewhere = buildSpaceProgram({
      brief: brief({ locality: 'ha_noi' }),
      briefRef: REF,
      rules: pack,
      norms,
    });
    expect(elsewhere.warnings.filter((w) => w.includes('ha_noi'))).toEqual([]);
    expect(elsewhere.payload.spaces.length).toBeGreaterThan(0);
  });
});

describe('Đọc nhu cầu viết bằng lời', () => {
  const vocabulary = new VocabularyIndex(parseVocabulary(testVocabularyYaml()));

  it('lượt bảng bí danh chạy không cần mạng', async () => {
    const result = await resolveNeeds(['phòng thờ', 'GARA', 'phòng làm việc'], vocabulary);
    expect(result.spaces).toContain('altar_room');
    expect(result.spaces).toContain('garage');
    expect(result.spaces).toContain('study');
    expect(result.unresolved).toEqual([]);
  });

  it('đoạn chữ không quy được thì giữ nguyên văn cho người đọc', async () => {
    const result = await resolveNeeds(['ưu tiên đón nắng buổi sáng'], vocabulary);
    expect(result.unresolved).toEqual(['ưu tiên đón nắng buổi sáng']);
    expect(result.notes[0]).toMatch(/chưa được đọc tự động/);
  });

  it('KHÔNG gửi đầu bài ra dịch vụ ngoài khi cấu hình chưa cho phép', async () => {
    // Đây là hàng rào quan trọng nhất của bước này. Đầu bài là dữ liệu hạng 1; mọi đầu ra
    // trong giai đoạn demo khai `max_data_class: 3`. Lời gọi phải bị chặn TRƯỚC khi ra mạng
    // và phải hiện thành câu tiếng Việt, không phải một lỗi kỹ thuật.
    const modelsYaml = readFileSync(
      fileURLToPath(new URL('../../../../config/models.yaml', import.meta.url)),
      'utf-8',
    );
    const llm = new GeminiClient(
      new ModelRouter(parseModelConfig(modelsYaml), { gemini: 'khoa-gia-lap' }),
    );
    const result = await resolveNeeds(['cần một phòng xông hơi ở tầng áp mái'], vocabulary, llm);

    expect(result.unresolved).toHaveLength(1);
    expect(result.notes[0]).toMatch(/dữ liệu nhạy cảm/);
  });
});

describe('Phòng ngủ ghi rõ phòng của ai (13/09/2026)', () => {
  it('mỗi phòng ngủ suy từ gia đình mang vai trò và số người; khép kín mang theo chủ phòng', () => {
    const { payload } = build(
      brief({
        floors: 2,
        site: { width_m: 12, depth_m: 20 },
        family: [
          { role: 'ong_ba', count: 2, ensuite: true },
          { role: 'vo_chong', count: 2 },
          { role: 'con', count: 2 },
        ],
      }),
    );
    const occupants = payload.spaces
      .filter((s) => s.type === 'bedroom' || s.type === 'master_bedroom')
      .map((s) => s.occupant);
    expect(occupants).toHaveLength(4);
    expect(occupants).toEqual(
      expect.arrayContaining([
        'Con 1 · 1 người',
        'Con 2 · 1 người',
        'Ông bà · 2 người',
        'Vợ chồng · 2 người',
      ]),
    );
    const ensuite = payload.spaces.find((s) => s.enclosed_in);
    expect(ensuite?.occupant).toBe('khép kín — Ông bà · 2 người');
  });

  it('dòng phòng ngủ khai tường minh đứng thay phòng suy diễn vẫn nhận đúng chủ phòng', () => {
    const { payload } = build(
      brief({
        family: [{ role: 'con', count: 1 }],
        required_spaces: [{ type: 'bedroom', floor: 2 }],
      }),
    );
    const bed = payload.spaces.find((s) => s.type === 'bedroom')!;
    expect(bed.floor).toBe(2);
    expect(bed.occupant).toBe('Con · 1 người');
  });
});

describe('Giải thích con số «sàn mỗi tầng» (13/09/2026)', () => {
  it('kể đủ các bước, và các bước cộng lại ra đúng con số trên bảng', () => {
    const result = build(
      brief({
        building_type: 'biet_thu',
        site: { width_m: 15, depth_m: 20, max_density: 0.6, setback_required_m: { front: 3 } },
        floors: 2,
      }),
    );
    const e = result.plateExplanation;
    const usable = result.payload.floor_allocation![0]!.usable_area_m2!;

    expect(e.site).toMatchObject({ widthM: 15, depthM: 20 });
    // Bộ giải không còn gói quy chuẩn (13/09/2026): mật độ đang áp là đúng số đầu bài khai.
    expect(e.densityRule).toBeNull();
    expect(e.densityDeclared).toBe(0.6);
    expect(e.maxDensity).toBe(0.6);
    expect(e.setbacks.front).toBe(3);
    expect(e.afterSetbacks.widthM).toBeCloseTo(
      e.rect.widthM - e.setbacks.left - e.setbacks.right,
      6,
    );
    expect(e.afterSetbacks.depthM).toBeCloseTo(
      e.rect.depthM - e.setbacks.front - e.setbacks.back,
      6,
    );
    expect(e.buildableM2).toBeCloseTo(
      Math.min(e.afterSetbacks.areaM2, e.byDensityM2 ?? Number.POSITIVE_INFINITY),
      6,
    );
    expect(e.evenShareM2).toBeCloseTo(e.roomDemandM2 / e.floors / (1 - e.circulationRatio), 6);
    expect(Math.round(e.plateM2 * 10) / 10).toBeCloseTo(usable, 1);
    // Con số cuối là min(xây được, max(chia đều, tầng nặng nhất)) — và nói ra vế nào quyết.
    const need = Math.max(e.evenShareM2, e.heaviest?.plateM2 ?? 0);
    expect(e.plateM2).toBeCloseTo(Math.min(e.buildableM2, need), 6);
    expect(e.limitedBy).toBe(
      need > e.buildableM2
        ? 'buildable'
        : (e.heaviest?.plateM2 ?? 0) >= e.evenShareM2
          ? 'heaviest_floor'
          : 'even_share',
    );
  });
});

describe('Tiện ích trong phòng ngủ gộp vào phòng, không tách dòng (13/09/2026)', () => {
  const withNeeds = () =>
    brief({
      floors: 2,
      site: { width_m: 12, depth_m: 20 },
      family: [
        { role: 'ong_ba', count: 2, needs: ['closet'] },
        { role: 'con', count: 2, needs: ['study_area', 'balcony'] },
      ],
    });

  it('tủ đồ, góc học tập nằm trong phòng của đúng nhóm; ban công vẫn là không gian riêng', () => {
    // Đi qua đúng đường của `run.ts`: mã nhu cầu thường vào `extraSpaces`, mã `in_bedroom` thì không.
    const b = withNeeds();
    const extra = (b.family ?? [])
      .flatMap((m) => m.needs ?? [])
      .filter((code) => !norms.in_bedroom.includes(code));
    const { payload } = buildSpaceProgram({
      brief: b,
      briefRef: REF,
      rules,
      norms,
      extraSpaces: extra,
    });

    expect(payload.spaces.some((s) => s.type === 'closet' || s.type === 'study_area')).toBe(false);
    expect(payload.spaces.some((s) => s.type === 'balcony')).toBe(true);

    const ongBa = payload.spaces.find((s) => s.occupant?.startsWith('Ông bà'))!;
    expect(ongBa.includes).toEqual(['closet']);
    const con = payload.spaces.filter((s) => s.occupant?.startsWith('Con'));
    expect(con).toHaveLength(2);
    for (const room of con) expect(room.includes).toEqual(['study_area']);
  });

  it('diện tích tối thiểu của tiện ích cộng vào phòng', () => {
    const plain = build(
      brief({
        floors: 2,
        site: { width_m: 12, depth_m: 20 },
        family: [{ role: 'ong_ba', count: 2 }],
      }),
    );
    const withCloset = build(
      brief({
        floors: 2,
        site: { width_m: 12, depth_m: 20 },
        family: [{ role: 'ong_ba', count: 2, needs: ['closet'] }],
      }),
    );
    const min = (p: typeof plain) =>
      p.payload.spaces.find((s) => s.occupant?.startsWith('Ông bà'))!.min_area_m2;
    expect(min(withCloset) - min(plain)).toBeCloseTo(norms.spaces.closet!.min_m2, 6);
  });
});

describe('Khoảng sân mong muốn trừ vào sàn xây được (13/09/2026)', () => {
  it('mặt nào sân sâu hơn khoảng lùi thì sân quyết — cùng phép với dòng tổng ở Đầu bài', () => {
    const base = brief({
      building_type: 'biet_thu',
      site: { width_m: 15, depth_m: 20 },
      floors: 2,
    });
    const withYard = {
      ...base,
      massing: {
        ...(base.massing ?? {}),
        yard_depth_m: { left: 2 },
      },
    } as unknown as DesignBrief;
    const a = build(base).plateExplanation;
    const b = build(withYard).plateExplanation;
    expect(b.yards.left).toBe(2);
    expect(b.afterSetbacks.widthM).toBeCloseTo(
      a.afterSetbacks.widthM - Math.max(0, 2 - a.setbacks.left),
      6,
    );
  });
});
