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
  living: { min_m2: 10, target_m2: 20, max_m2: 40, priority: 1, floor: ground, daylight: true, facade: true, ventilation: true }
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
    const spaces = build(brief({ required_spaces: ['altar_room', 'garage'], floors: 4 })).payload
      .spaces;
    expect(spaces.find((s) => s.type === 'altar_room')?.floor).toBe(4);
    expect(spaces.find((s) => s.type === 'garage')?.floor).toBe(1);
  });

  it('nguyện vọng tầng của gia đình thắng mặc định theo vai trò', () => {
    const spaces = build(brief({ family: [{ role: 'con', count: 1, floor_pref: 'top' }] })).payload
      .spaces;
    expect(spaces.find((s) => s.type === 'bedroom')?.floor).toBe(3);
  });
});

describe('Ba nguồn tri thức, đúng thứ tự ưu tiên', () => {
  it('diện tích tối thiểu của quy chuẩn THẮNG chuẩn nghề nghiệp', () => {
    // Hạ chuẩn nghề xuống dưới quy chuẩn: kết quả phải vẫn là con số của quy chuẩn.
    const loosened = structuredClone(norms);
    loosened.spaces.bedroom!.min_m2 = 4;
    loosened.spaces.bedroom!.target_m2 = 14;
    const program = buildSpaceProgram({ brief: brief(), briefRef: REF, rules, norms: loosened });
    const bedroom = program.payload.spaces.find((s) => s.type === 'bedroom');
    expect(bedroom?.min_area_m2).toBe(rules.minArea('nha_pho', 'bedroom'));
    expect(rules.minArea('nha_pho', 'bedroom')).toBe(9);
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
    expect(villa.payload.floor_allocation?.[0]?.usable_area_m2).toBe(200);
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
        required_spaces: ['study', 'altar_room', 'garage', 'laundry'],
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
    const program = build(brief({ required_spaces: ['altar_room'], floors: 3 })).payload;
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
   * Diện tích sàn dùng được của một tầng, đọc thẳng từ `floor_allocation`.
   *
   * Đây là con số engine THỰC SỰ dùng làm ràng buộc, nên nó là thước đo đúng. Hai thước đo
   * đã thử và loại:
   *  · tổng `target_area_m2` — bộ ép vừa co theo nhu cầu phòng, nên thấp hơn sàn ở mọi
   *    trường hợp; phép so "ít hơn" vẫn xanh dù bề rộng lấy sai.
   *  · tổng `max_area_m2` — các phòng cạnh tranh nhau nên tổng này VƯỢT sàn ở tầng đông
   *    phòng; nó là sàn dưới của độ phủ, không phải trần.
   */
  const usable = (result: ReturnType<typeof build>, floor: number): number =>
    (result.payload.floor_allocation ?? []).find((f) => f.floor === floor)?.usable_area_m2 ?? 0;

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
    // Biệt thự: gói nền cho trần mật độ 0,6 và khoảng lùi trước 3 m. Thửa hình thang mặt
    // tiền 12 m, mặt hậu 8 m, sâu 20 m:
    //  · ô chữ nhật xây được 8 × (20 − 3) = 136 m²;
    //  · diện tích THẬT (12+8)/2 × 20 = 200 m² → trần 120 m² → **trần mật độ chặn**;
    //  · hình bao 12 × 20 = 240 m² → trần 144 m² → ô chữ nhật chặn, ra 136 m².
    // Hai đường cho hai con số khác nhau, và không lỗi nào nổ ra ở đường sai.
    const villa = brief({
      building_type: 'biet_thu',
      floors: 2,
      site: { width_m: 12, depth_m: 20, shape: 'hinh_thang', rear_width_m: 8 },
    });
    expect(usable(build(villa), 1)).toBe(120);
  });

  it('không gian lạ trong đầu bài được NÓI RA, không bị nuốt', () => {
    const result = build(brief({ required_spaces: ['ho_boi_trong_nha'] }));
    expect(result.warnings.some((w) => w.includes('ho_boi_trong_nha'))).toBe(true);
  });

  it('địa phương chưa có gói riêng vẫn chạy đủ quy chuẩn quốc gia, và KHÔNG cảnh báo', () => {
    // Khoảng lùi và mật độ là QCVN — quy chuẩn quốc gia — nên chúng nằm ở gói nền. Tỉnh
    // chưa có văn bản riêng vì thế không phải một tình trạng đáng cảnh báo: kết quả vẫn
    // đúng quy chuẩn. Cảnh báo nổ ở mọi lần chạy là cảnh báo bị bỏ qua, và khi ấy cái
    // cảnh báo thật đứng cạnh nó cũng chịu chung số phận.
    //
    // Chế độ đã chạy vẫn ghi lại được — `runLayer2` đặt vào `params.rule_pack_locality`.
    const pack = testRulePack('ha_noi');
    expect(pack.localityMissing, 'chưa tỉnh nào có gói riêng').toBe(true);
    expect(pack.maxDensity('biet_thu'), 'trần mật độ phải đến từ gói nền').toBe(0.6);
    expect(pack.setbacks('biet_thu').front, 'khoảng lùi phải đến từ gói nền').toBe(3);

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
    const llm = new GeminiClient(new ModelRouter(parseModelConfig(modelsYaml), 'khoa-gia-lap'));
    const result = await resolveNeeds(['cần một phòng xông hơi ở tầng áp mái'], vocabulary, llm);

    expect(result.unresolved).toHaveLength(1);
    expect(result.notes[0]).toMatch(/dữ liệu nhạy cảm/);
  });
});
