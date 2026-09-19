/**
 * Mười bốn phép đo của bộ chấm (`ai/plan-score.ts`) trên hai fixture viết tay.
 *
 * Tệp này kiểm PHÉP ĐO; `plan-score-calibration.test.ts` kiểm NGƯỠNG trên hai hồ sơ thật. Hai câu
 * hỏi khác nhau, và không tệp nào trả lời hộ tệp kia: ở đây toạ độ là của tôi nên kiểm được từng con
 * số, còn ở kia số là đo thật nhưng không có toạ độ.
 *
 * ⚠️ Hai fixture này là ca thử BỘ VẼ, không phải mặt bằng hay — và bộ chấm trừ điểm chúng khá nặng.
 * Mỗi chỗ bị trừ dưới đây đi kèm lời giải thích vì sao nó là khuyết điểm THẬT của fixture. Đọc cả
 * tệp thì nó là bản mô tả khuyết điểm của hai fixture ấy, và nó sẽ đỏ nếu ai đó «cải thiện» fixture
 * mà không cập nhật phép thử — đúng hành vi mong muốn.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlan, AiSpaceProgram } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseAreaNorms } from '../kb/space-norms';
import { parsePlanQuality } from '../ai/plan-quality';
import {
  scoreForArtifact,
  scoreForScreen,
  scorePlan,
  type CriterionScore,
  type PlanScore,
} from '../ai/plan-score';
import { parseVocabulary, passageRules, roomGroups } from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const quality = parsePlanQuality(read('../../../../kb/plan_quality.yaml'));
const vocabulary = parseVocabulary(read('../../../../kb/room_vocabulary.yaml'));
const groups = roomGroups(vocabulary);
// Luật đi lại và định mức nghề đi kèm bộ chấm từ T48 — C6/C7 và A5/A6 không chấm được nếu thiếu.
const passage = passageRules(vocabulary);
const areaNorms = parseAreaNorms(read('../../../../kb/space_norms.yaml'));
const rules = new RulePack(
  [
    ...parseRuleFile(read('../../../../rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('../../../../rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);

/** Chương trình không gian suy từ chính mặt bằng, cộng phần `ensuite_of` gọi riêng khai thêm. */
function programOf(plan: AiFloorPlan, ensuite: Record<string, string> = {}): AiSpaceProgram {
  return {
    schema_version: '1.0.0',
    brief_ref: `sha256:${'9'.repeat(64)}`,
    spaces: plan.levels.flatMap((level) =>
      level.rooms.map((room) => ({
        id: room.id,
        type: room.type,
        level: level.level,
        target_area_m2: room.area_m2,
        ensuite_of: ensuite[room.id] ?? null,
        why: null,
      })),
    ),
    rationale: 'Chương trình dựng từ chính mặt bằng fixture.',
    assumptions: [],
    generator: plan.generator,
  } as AiSpaceProgram;
}

const score = (
  plan: AiFloorPlan,
  buildingType: string,
  ensuite: Record<string, string> = {},
): PlanScore =>
  scorePlan({
    plan,
    program: programOf(plan, ensuite),
    buildingType,
    quality,
    rules,
    groups,
    passage,
    areaNorms,
  });

const of = (result: PlanScore, code: string): CriterionScore =>
  result.criteria.find((entry) => entry.code === code)!;

describe('hình dạng kết quả', () => {
  const result = score(TOWNHOUSE_PLAN, 'nha_pho');

  it('mang phiên bản THƯỚC, không phải phiên bản mặt bằng', () => {
    // Thiếu nó thì bảng lịch sử so hai model bằng hai cái thước khác nhau mà không ai biết (T27).
    expect(result.scoreVersion).toBe(quality.scoreVersion);
    expect(result.scoreVersion).toBeGreaterThan(0);
  });

  it('`scoredWeight` nói đúng phần trọng số chấm được — KHÔNG chia lại cho tiêu chí khác', () => {
    // Nhà phố không có mặt bằng bán hàng (C5) và không khai hộp kỹ thuật (E4), nên phần trọng số của
    // hai tiêu chí ấy không chấm được. Nếu chúng bị chia lại thì `scoredWeight` luôn bằng 100 và con
    // số này không nói được gì — đúng điều phương án cấm (5.5 điểm 2).
    // T48 (16/09/2026) thêm A5, A6 vào nhóm A và C6, C7, C8 vào nhóm C, nên trọng số MỖI tiêu chí
    // trong hai nhóm ấy nhỏ đi; tổng chấm được nhích lên vì năm tiêu chí mới đều đo được.
    expect(result.scoredWeight).toBe(91.25);
    expect(of(result, 'C5').weight).toBe(3.75);
    expect(of(result, 'C5').score).toBeNull();
    expect(of(result, 'E4').weight).toBe(5);
    expect(result.points).toBeLessThanOrEqual(result.scoredWeight);
  });

  it('phân biệt hai lý do không chấm: cổng đã bảo đảm, và thiếu dữ liệu', () => {
    expect(of(result, 'A2').khongChamVi).toBe('gate');
    expect(of(result, 'A2').weight).toBe(0);
    expect(of(result, 'C5').khongChamVi).toBe('thieu_du_lieu');
    for (const code of ['A2', 'C5', 'E4']) {
      expect(of(result, code).khongCham, code).toBeTruthy();
    }
  });

  it('nói ra phần điểm dựa trên ngưỡng CHƯA AI ĐO', () => {
    // Một người đọc con số tổng mà không biết phần nào dựa trên ngưỡng chưa ai đo sẽ tin nó chắc hơn
    // thực tế (T31). Trước T48 chỉ có A1; nay thêm năm tiêu chí của T48 (định mức nghề và đường đi),
    // ngưỡng của chúng đều là suy luận — nên phần «chưa ai đo» phải TĂNG, và màn hình phải nói ra.
    expect(result.suyLuanWeight).toBeCloseTo(26.25, 2);
    const guessed = result.criteria.filter((entry) => entry.n === 0 && entry.score !== null);
    expect(guessed.map((entry) => entry.code)).toEqual(['A1', 'A5', 'A6', 'C6', 'C7', 'C8']);
  });

  it('trọng số nhóm cộng lại đúng 100, và mỗi nhóm không vượt trọng số của nó', () => {
    expect(result.groups.reduce((sum, group) => sum + group.weight, 0)).toBe(100);
    for (const group of result.groups) {
      expect(group.points, group.code).toBeLessThanOrEqual(group.scoredWeight + 1e-9);
      expect(group.scoredWeight, group.code).toBeLessThanOrEqual(group.weight + 1e-9);
    }
  });
});

describe('nhà phố — mọi chỗ bị trừ là khuyết điểm THẬT của fixture', () => {
  const result = score(TOWNHOUSE_PLAN, 'nha_pho');

  it('B1 bắt hai phòng phục vụ rộng 0,95 m', () => {
    // `wc_1` và `laundry_3` đều là dải 95 × 200 cm bên cạnh ô thang. Ngưỡng: khu vệ sinh 1,25 m
    // (đo trên 5 khu vệ sinh thật), phòng giặt 1,2 m. Cả hai thiếu khoảng 30 cm — một khu vệ sinh
    // 0,95 m thì không đặt nổi bồn cầu cộng lối đứng.
    expect(of(result, 'B1').value).toBe(2);
    expect(of(result, 'B1').refs).toEqual(['wc_1', 'laundry_3']);
    expect(of(result, 'B1').score).toBe(0);
  });

  it('D1 bắt phòng khách KHÔNG có cửa sổ nào', () => {
    // Nhà phố chỉ đòi phòng khách và phòng ngủ chính có mặt thoáng — hai phòng, một phòng tối là
    // còn một nửa. Cửa sổ duy nhất của tầng 1 (`s1`) nằm trên tường giếng trời và phục vụ ô thang,
    // không phục vụ phòng khách.
    expect(of(result, 'D1').value).toBe(0.5);
    expect(of(result, 'D1').refs).toEqual(['living_1']);
  });

  it('E2 bắt hai khu vệ sinh KHÔNG chồng nhau giữa hai tầng', () => {
    // `wc_1` ở [283…378] theo x, `wc_2` ở [22…200] — cách nhau gần 3 m, tức hai tuyến ống đứng
    // riêng. Đây là thứ làm hồ sơ kỹ thuật đắt thêm mà bản vẽ mặt bằng không nói ra.
    expect(of(result, 'E2').value).toBe(0.5);
    expect(of(result, 'E2').refs).toEqual(['wc_2']);
  });

  it('C1 bắt phải đi xuyên phòng ngủ mới tới phòng ngủ chính', () => {
    // Tầng 2 của fixture là một chuỗi nối tiếp: thang → WC → sảnh → phòng ngủ → phòng ngủ chính.
    // Nên đường duy nhất tới `master_2` đi xuyên `bedroom_2`. Tầng 3 y như vậy với phòng thờ.
    expect(of(result, 'C1').value).toBe(2);
    expect(of(result, 'C1').refs).toEqual(['master_2', 'altar_3']);
  });

  it('C3 bắt phải đi qua hai phòng từ cửa vào tới chân thang', () => {
    // Thang đặt cuối nhà sâu 15 m, nên từ chỗ để xe phải qua phòng khách rồi bếp mới tới thang.
    expect(of(result, 'C3').value).toBe(2);
    expect(of(result, 'C3').score).toBe(0);
  });

  it('và những chỗ fixture LÀM ĐÚNG thì được đủ điểm', () => {
    // Ghi cả chiều này lại: một phép thử chỉ kiểm chỗ bị trừ thì không phân biệt được bộ chấm chặt
    // chẽ với bộ chấm luôn trả 0.
    expect(of(result, 'A3').value).toBe(1); // phòng thờ ở tầng 3, tầng cao nhất có người ở
    expect(of(result, 'A4').value).toBe(1); // cả ba tầng có phòng ngủ đều có khu vệ sinh
    expect(of(result, 'B2').value).toBe(0); // không phòng nào vượt tỷ lệ dài/rộng
    expect(of(result, 'B4').value).toBeCloseTo(0.177, 3); // 22 bậc cho tầng 3,9 m
    expect(of(result, 'C2').score).toBe(1); // tỷ lệ giao thông trong khoảng của nhà phố
    expect(of(result, 'C4').value).toBeCloseTo(1.67, 2);
  });
});

describe('biệt thự — bốn mặt thoáng, hành lang giữa', () => {
  const result = score(VILLA_PLAN, 'biet_thu');

  it('D1 đủ điểm: mọi phòng ở đều có cửa sổ ra ngoài', () => {
    // Biệt thự dùng tập phòng `habitable` (không phải `living_and_master` của nhà phố), tức ngưỡng
    // CHẶT hơn — và fixture vẫn đạt, vì lô bốn mặt thoáng và hành lang giữa.
    expect(of(result, 'D1').value).toBe(1);
    expect(of(result, 'D1').refs).toEqual([]);
  });

  it('A3 không chấm được vì phương án không có chỗ thờ nào', () => {
    expect(of(result, 'A3').score).toBeNull();
    expect(of(result, 'A3').khongChamVi).toBe('thieu_du_lieu');
    expect(of(result, 'A3').weight).toBeCloseTo(5, 2);
  });

  it('C3 đủ điểm: cửa chính mở thẳng vào sảnh, sảnh chạm chân thang', () => {
    expect(of(result, 'C3').value).toBe(0);
    expect(of(result, 'C3').score).toBe(1);
  });

  it('`ensuite_of` miễn cho khu vệ sinh khép kín khỏi C1', () => {
    // Không khai `ensuite_of` thì `wc_2` bị coi là phòng chỉ tới được qua phòng ngủ — đúng về hình
    // học nhưng sai về nghiệp vụ: khu vệ sinh khép kín thì ĐÚNG là vào từ phòng ngủ. Chương trình
    // không gian là nơi nói điều đó, và bộ chấm phải đọc.
    const withoutEnsuite = of(result, 'C1');
    expect(withoutEnsuite.refs).toContain('wc_2');

    const withEnsuite = of(score(VILLA_PLAN, 'biet_thu', { wc_2: 'bedroom_4' }), 'C1');
    expect(withEnsuite.refs).not.toContain('wc_2');
    expect(withEnsuite.value).toBeLessThan(withoutEnsuite.value!);
  });
});

describe('phòng ghép đi vào A1 và A3 đúng cách', () => {
  /** Bếp ghép phòng ăn: một chữ nhật, hai mã phòng — đúng 3 trong 6 mặt bằng thật. */
  const merged: AiFloorPlan = {
    ...TOWNHOUSE_PLAN,
    levels: TOWNHOUSE_PLAN.levels.map((level) =>
      level.level === 1
        ? {
            ...level,
            rooms: level.rooms.map((room) =>
              room.id === 'kitchen_1' ? { ...room, also: ['dining_1'] } : room,
            ),
          }
        : level,
    ),
  };

  it('A1 so với TỔNG diện tích yêu cầu của mọi mã phòng ghép', () => {
    // Chữ nhật «bếp ăn» 12,5 m² phải đủ cho cả bếp 7 m² lẫn phòng ăn 5,5 m². So với riêng bếp thì
    // nó «rộng gấp 1,8 lần yêu cầu» — một kết luận sai sinh ra từ việc đọc thiếu `also`.
    const program = programOf(merged);
    program.spaces = [
      ...program.spaces.map((space) =>
        space.id === 'kitchen_1' ? { ...space, target_area_m2: 7 } : space,
      ),
      {
        id: 'dining_1',
        type: 'dining',
        level: 1,
        target_area_m2: 5.5,
        ensuite_of: null,
        why: null,
      },
    ];
    const result = scorePlan({
      plan: merged,
      program,
      buildingType: 'nha_pho',
      quality,
      rules,
      groups,
      passage,
      areaNorms,
    });
    // 12,46 so với 12,5 yêu cầu là lệch dưới 1%, nên phòng này KHÔNG nằm trong danh sách bị trừ.
    expect(of(result, 'A1').refs).not.toContain('kitchen_1');
  });

  it('A3 tìm được chỗ thờ khai trong `also`, không chỉ phòng thờ riêng', () => {
    // Hồ sơ P2 tầng 5 có «PHÒNG KHÁCH + THỜ». Bỏ vế này thì A3 trả «chưa đủ dữ liệu» trên đúng loại
    // hồ sơ nó được dựng ra để chấm.
    const inLiving: AiFloorPlan = {
      ...VILLA_PLAN,
      levels: VILLA_PLAN.levels.map((level) =>
        level.level === 2
          ? {
              ...level,
              rooms: level.rooms.map((room) =>
                room.id === 'master_2' ? { ...room, also: ['altar_2'] } : room,
              ),
            }
          : level,
      ),
    };
    const program = programOf(inLiving);
    program.spaces = [
      ...program.spaces,
      {
        id: 'altar_2',
        type: 'altar_room',
        level: 2,
        target_area_m2: 4,
        ensuite_of: null,
        why: null,
      },
    ];
    const result = scorePlan({
      plan: inLiving,
      program,
      buildingType: 'biet_thu',
      quality,
      rules,
      groups,
    });
    expect(of(result, 'A3').score).not.toBeNull();
    expect(of(result, 'A3').value).toBe(1);
  });
});

describe('`refs` chỉ mang chỗ BỊ TRỪ ĐIỂM', () => {
  // Lộ ra khi soát bằng mắt trên trình duyệt 13/09/2026: B4, C3 và C4 đủ điểm mà màn hình vẫn in
  // «Chỗ bị trừ: st1, st2». Ba phép đo ấy trả về phần tử QUYẾT ĐỊNH giá trị (thang lệch nhất, hành
  // lang hẹp nhất) chứ không phải phần tử sai — đúng dữ liệu, sai tên gọi. Hai hậu quả: màn hình
  // nói sai, và ghi chú «tránh những chỗ này» của lượt lấy mẫu sau (T25) trỏ vào chỗ đang làm đúng.
  const result = score(VILLA_PLAN, 'biet_thu');

  it('tiêu chí đủ điểm KHÔNG nêu chỗ nào', () => {
    for (const entry of result.criteria) {
      if (entry.score === 1)
        expect({ code: entry.code, refs: entry.refs }).toEqual({
          code: entry.code,
          refs: [],
        });
    }
  });

  it('tiêu chí bị trừ vẫn nêu đủ chỗ — bất biến này không được làm mất dữ liệu', () => {
    const c1 = of(result, 'C1');
    expect(c1.score).toBeLessThan(1);
    expect(c1.refs).toContain('bedroom_3');
  });
});

describe('hình dạng cho màn hình (`scoreForScreen`)', () => {
  const screen = scoreForScreen(scoreForArtifact(score(TOWNHOUSE_PLAN, 'nha_pho')), quality);

  it('mọi khoá màn hình đọc đều có mặt, và KHÔNG khoá snake_case nào lọt ra', () => {
    // Phép thử này canh một chỗ hỏng IM LẶNG. Payload artifact dùng snake_case (hợp đồng JSON
    // Schema) còn màn hình dùng camelCase; đổi tên một khoá ở đây thì panel đọc `undefined` rồi vẽ
    // một bảng trông bình thường với mọi ô trống — không lỗi, không cảnh báo, không ảnh chụp nào
    // đỏ, vì phép thử phía web dùng fixture viết tay nên nó không biết backend đã đổi tên.
    expect(Object.keys(screen).sort()).toEqual([
      'coSoDuLieu',
      'criteria',
      'currentVersion',
      'groups',
      'points',
      'reasonedWeight',
      'scoreVersion',
      'scoredWeight',
    ]);
    expect(Object.keys(screen.groups[0]!).sort()).toEqual([
      'code',
      'points',
      'scoredWeight',
      'vi',
      'weight',
    ]);
    expect(Object.keys(screen.criteria[0]!).sort()).toEqual([
      'code',
      'giaiThich',
      'group',
      'label',
      'n',
      'notScored',
      'refs',
      'score',
      'value',
      'vi',
      'weight',
      'why',
    ]);
    // Chỉ soát KHOÁ (có dấu hai chấm theo sau). `thieu_du_lieu` là một GIÁ TRỊ enum của hợp đồng
    // và phải giữ nguyên văn — soát cả giá trị thì phép thử đỏ vì chính thứ nó phải bảo vệ.
    const leaked = JSON.stringify(screen).match(/"[a-z]+_[a-z_]+":/g);
    expect(leaked).toBeNull();
  });

  it('chữ tiếng Việt tra lại từ THƯỚC, không đọc từ artifact', () => {
    // Câu chữ là thứ sửa được; đúc nó vào artifact bất biến là đúc một bản sao rồi để nó lệch dần.
    // Sửa `vi` trong `kb/plan_quality.yaml` phải đổi ngay màn hình, kể cả với phương án đúc hôm qua.
    const c1 = screen.criteria.find((entry) => entry.code === 'C1')!;
    expect(c1.vi).toBe(quality.criteria.find((entry) => entry.code === 'C1')!.vi);
    expect(screen.groups.find((group) => group.code === 'C')!.vi).toBe(quality.groups.C!.vi);
  });

  it('mang CẢ phiên bản thước lúc chấm và thước hôm nay', () => {
    // Hai trường, không phải một: màn hình chỉ nói được «điểm này chấm bằng thước cũ» khi nó thấy
    // cả hai. Đọc lại KHÔNG chấm lại, nên bằng nhau ở đây là vì artifact vừa đúc xong.
    expect(screen.scoreVersion).toBe(quality.scoreVersion);
    expect(screen.currentVersion).toBe(quality.scoreVersion);
  });

  it('giữ nguyên hai lý do không chấm, không gộp thành một ô trống', () => {
    expect(screen.criteria.find((entry) => entry.code === 'A2')!.notScored).toBe('gate');
    expect(screen.criteria.find((entry) => entry.code === 'C5')!.notScored).toBe('thieu_du_lieu');
    expect(screen.criteria.find((entry) => entry.code === 'C5')!.why).toBeTruthy();
    expect(screen.criteria.find((entry) => entry.code === 'C1')!.notScored).toBeNull();
  });
});

describe('tiêu chí T48 — đường đi hằng ngày và định mức nghề', () => {
  it('C6 và C7 đo được số cửa và số mét tới WC chung', () => {
    const result = score(TOWNHOUSE_PLAN, 'nha_pho');
    const c6 = of(result, 'C6');
    const c7 = of(result, 'C7');
    if (c6.value === null) {
      // Fixture không có WC chung thì phải nói ra lý do, không âm thầm cho điểm.
      expect(c6.khongChamVi).toBe('thieu_du_lieu');
      return;
    }
    expect(c6.value).toBeGreaterThanOrEqual(1);
    expect(c7.value).toBeGreaterThan(0);
    expect(c6.refs.length).toBe(1);
  });

  it('C8 đo chiều dài hành lang trên mỗi phòng nó phục vụ', () => {
    const c8 = of(score(TOWNHOUSE_PLAN, 'nha_pho'), 'C8');
    if (c8.value === null) {
      expect(c8.khongChamVi).toBe('thieu_du_lieu');
      return;
    }
    expect(c8.value).toBeGreaterThan(0);
  });

  it('A5 đếm phòng dưới định mức nghề, A6 đếm phòng vượt định mức — chỉ trừ điểm, không chặn', () => {
    const plan = structuredClone(TOWNHOUSE_PLAN) as AiFloorPlan;
    const room = plan.levels[0]!.rooms.find((entry) => entry.type === 'living')!;
    const [x0, y0, x1] = room.rect;
    // Phòng khách 2 m² — dưới mức tối thiểu 12 m² của nghề.
    room.rect = [x0!, y0!, x1!, y0! + 40];
    room.area_m2 = 2;
    const result = score(plan, 'nha_pho');
    expect(of(result, 'A5').value).toBeGreaterThanOrEqual(1);
    expect(of(result, 'A5').refs).toContain(room.id);
    // Vẫn chỉ là điểm: không có mã lỗi nào ở đây, và phương án vẫn chấm được.
    expect(result.points).toBeGreaterThan(0);
  });
});
