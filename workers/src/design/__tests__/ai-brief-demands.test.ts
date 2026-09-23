/**
 * Đầu bài nói gì thì mặt bằng phải có nấy (T65, 22/09/2026).
 *
 * Haan: «mặt bằng phải theo sát yêu cầu đầu bài, không được làm thiếu hoặc sai so với đầu bài».
 *
 * Bộ này canh sáu điều, và điều đầu tiên là điều dễ mất nhất:
 *
 *  1. **Trường BỎ TRỐNG không sinh đòi hỏi nào.** «Chưa hỏi» khác «trả lời không». Một dòng
 *     `?? false` lọt vào `brief-demands.ts` là mọi hồ sơ chưa điền hết đầu bài bỗng bị bác vì
 *     những thứ gia chủ chưa từng nói.
 *  2. Thang máy thành một Ô THẬT ở mọi tầng, đủ rộng theo tải, và chồng khít — kể cả khi gia chủ
 *     mới chỉ CHỪA CHỖ. Chừa lệch tầng thì không phải chừa chỗ.
 *  3. Ban công đúng mặt gia chủ khai; «chỉ mặt tiền» là một câu CẤM với ba mặt còn lại.
 *  4. Ban công đua ra ngoài ranh: đúng mức đã khai, không có số thì không đua.
 *  5. Bảng dữ liệu và mã nguồn không lệch nhau — dòng `demands.spaces` nào cũng có người đọc,
 *     và hai tệp `kb/` cùng khai một con số thì con số ấy phải bằng nhau.
 *  6. Suy đoán nghề chỉ CẢNH BÁO, không bác phương án (T52).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import type { AiFloorPlan, AiSpaceProgramProposal, DesignBrief } from '@nvg/shared/design';
import { briefDemands, matchDemand } from '../ai/brief-demands';
import {
  allowedBox,
  checkBalconyDemand,
  checkElevatorStack,
  checkSoftDemands,
  labelReservedShaft,
} from '../ai/plan-demands';
import { projectBalconyCells } from '../ai/tree/balcony-projection';
import { checkProposal, programKnowledge } from '../ai/program';
import { buildableFromDigest } from '../ai/buildable';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { parseVocabulary, VocabularyIndex } from '../kb/vocabulary';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { RulePack } from '../rules/rule-pack';
import { digestOf, TOWNHOUSE } from './ai-digest-fixtures';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(root(p), 'utf8');

const vocabulary = new VocabularyIndex(parseVocabulary(read('kb/room_vocabulary.yaml')));
const labels = Object.fromEntries(vocabulary.vocabulary.types.map((t) => [t.code, t.vi]));
const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const fidelity = parseBriefFidelity(read('kb/brief_fidelity.yaml'));
const rawFidelity = load(read('kb/brief_fidelity.yaml')) as Record<string, any>;
const rawNorms = load(read('kb/construction_norms.yaml')) as Record<string, any>;
const emptyPack = selectedRulePack(NO_RULE_PACKS, {
  standards: new RulePack([], false),
  experience: new RulePack([], false),
});

/** Đầu bài nhà phố 3 tầng, thêm đúng những mục T62 mà phép thử đang xét. */
function briefWith(extra: Record<string, unknown>): DesignBrief {
  return { ...TOWNHOUSE, ...extra } as DesignBrief;
}

const demandsOf = (extra: Record<string, unknown>) =>
  briefDemands(digestOf(briefWith(extra)), fidelity);

// ── 1. Chưa hỏi khác trả lời không ──────────────────────────────────────────────────────

describe('trường bỏ trống KHÔNG sinh đòi hỏi', () => {
  it('đầu bài cũ, chưa có mục nào của T62: không thang máy, không ban công, không dòng nào', () => {
    const d = demandsOf({});
    expect(d.elevator).toBeNull();
    expect(d.balcony).toBeNull();
    expect(d.spaces).toEqual([]);
    expect(d.lines).toEqual([]);
  });

  it('khai «không làm thang máy» cũng không sinh ô nào — khác hẳn với việc đòi rồi bỏ qua', () => {
    expect(demandsOf({ vertical: { elevator: 'khong' } }).elevator).toBeNull();
  });

  it('khai ban công nhưng chưa chọn gì thì vẫn là chưa khai', () => {
    expect(demandsOf({ balconies: { note: 'chưa quyết' } }).balcony).toBeNull();
  });
});

// ── 2. Thang máy ────────────────────────────────────────────────────────────────────────

describe('thang máy', () => {
  it('làm ngay: một ô ở mọi tầng, diện tích theo tải đầu bài khai', () => {
    const d = demandsOf({
      vertical: { elevator: 'lam_ngay', elevator_capacity: 'lon_630kg' },
    });
    expect(d.elevator).toMatchObject({
      mode: 'lam_ngay',
      type: 'elevator',
      minAreaM2: rawFidelity.demands.elevator.shaft_m2.lon_630kg,
      reservedLabel: null,
    });
    expect(d.lines.join(' ')).toContain('CHỒNG KHÍT');
  });

  it('chừa chỗ lắp sau: vẫn đòi đủ ô và vẫn chồng khít, nhưng mang nhãn ô chừa', () => {
    const d = demandsOf({ vertical: { elevator: 'chua_cho' } });
    expect(d.elevator?.mode).toBe('chua_cho');
    expect(d.elevator?.reservedLabel).toBe(rawFidelity.demands.elevator.reserved_label);
    // Chưa chọn tải thì dùng mức mặc định của tệp dữ liệu, không phải 0.
    expect(d.elevator?.minAreaM2).toBe(rawFidelity.demands.elevator.shaft_m2_unknown);
  });

  it('nhà một tầng: không đòi ô nào, nhưng NÓI RA là đã bỏ qua', () => {
    const d = briefDemands(
      digestOf(briefWith({ floors: 1, vertical: { elevator: 'lam_ngay' } })),
      fidelity,
    );
    expect(d.elevator).toBeNull();
    expect(d.warnings.join(' ')).toContain('chỉ một tầng');
  });

  it('cổng chương trình bác đề xuất thiếu thang máy ở một tầng', () => {
    const digest = digestOf(briefWith({ vertical: { elevator: 'lam_ngay' } }));
    const knowledge = programKnowledge({
      digest,
      vocabulary,
      labels,
      buildable: buildableFromDigest(digest),
      construction,
      rules: emptyPack,
      fidelity,
    });
    const proposal = (levels: number[]): AiSpaceProgramProposal => ({
      schema_version: '1.0.0',
      spaces: [
        { id: 'a1', type: 'living', level: 1, target_area_m2: 20 },
        { id: 'a2', type: 'kitchen', level: 1, target_area_m2: 10 },
        { id: 'a3', type: 'dining', level: 1, target_area_m2: 10 },
        { id: 'a4', type: 'wc', level: 1, target_area_m2: 3 },
        { id: 'a5', type: 'garage', level: 1, target_area_m2: 15 },
        { id: 'b1', type: 'master_bedroom', level: 2, target_area_m2: 18 },
        { id: 'b2', type: 'bedroom', level: 2, target_area_m2: 14 },
        { id: 'b3', type: 'bedroom', level: 3, target_area_m2: 14 },
        { id: 's1', type: 'stair', level: 1, target_area_m2: 6 },
        { id: 's2', type: 'stair', level: 2, target_area_m2: 6 },
        { id: 's3', type: 'stair', level: 3, target_area_m2: 6 },
        ...levels.map((level) => ({
          id: `lift${level}`,
          type: 'elevator',
          level,
          target_area_m2: 3,
        })),
      ],
      rationale: 'thử',
      assumptions: [],
    });

    const missing = checkProposal(proposal([1, 2]), knowledge, labels);
    expect(missing.some((i) => i.includes('tầng 3') && i.includes('Thang máy'))).toBe(true);

    const whole = checkProposal(proposal([1, 2, 3]), knowledge, labels);
    expect(whole.some((i) => i.includes('Thang máy'))).toBe(false);
  });

  it('cổng mặt bằng bác giếng thang lệch tầng — 20 cm là không lắp được cabin', () => {
    const lift = demandsOf({ vertical: { elevator: 'lam_ngay' } }).elevator;
    const issues: string[] = [];
    checkElevatorStack(planWithLift([0, 20]), lift, (_l, _c, message) => issues.push(message));
    expect(issues.some((i) => i.includes('lệch 20 cm'))).toBe(true);

    const aligned: string[] = [];
    checkElevatorStack(planWithLift([0, 0]), lift, (_l, _c, message) => aligned.push(message));
    expect(aligned).toEqual([]);
  });

  it('bản vẽ ghi «ô chừa», không ghi «thang máy», khi gia chủ mới chừa chỗ', () => {
    const lift = demandsOf({ vertical: { elevator: 'chua_cho' } }).elevator;
    const rooms = labelReservedShaft(
      [{ type: 'elevator' }, { type: 'stair' }] as { type: string; label?: string | null }[],
      lift,
    );
    expect(rooms[0]?.label).toBe(rawFidelity.demands.elevator.reserved_label);
    expect(rooms[1]?.label).toBeUndefined();

    // Lắp ngay thì không đổi nhãn — nhãn mặc định «Thang máy» mới là đúng sự thật.
    const now = demandsOf({ vertical: { elevator: 'lam_ngay' } }).elevator;
    const asRooms = [{ type: 'elevator' }] as { type: string; label?: string | null }[];
    expect(labelReservedShaft(asRooms, now)[0]?.label).toBeUndefined();
  });
});

/** Mặt bằng hai tầng, mỗi tầng một ô thang máy 160×160 cm, lệch nhau theo `shift`. */
function planWithLift(shift: [number, number]): AiFloorPlan {
  return {
    levels: shift.map((dx, index) => ({
      level: index + 1,
      outline: [
        [0, 0],
        [500, 0],
        [500, 1800],
        [0, 1800],
      ],
      rooms: [
        {
          id: `lift${index + 1}`,
          type: 'elevator',
          rect: [100 + dx, 100, 260 + dx, 260],
          area_m2: 2.56,
        },
      ],
    })),
  } as unknown as AiFloorPlan;
}

// ── 3. Ban công đúng mặt ────────────────────────────────────────────────────────────────

describe('ban công', () => {
  it('«chỉ mặt tiền» là câu CẤM với ba mặt còn lại', () => {
    const d = demandsOf({ balconies: { scope: 'chi_mat_tien' } });
    expect(d.balcony?.sides).toEqual(['front']);
    expect(d.balcony?.forbiddenSides).toEqual(['back', 'left', 'right']);
  });

  it('khai `sides` mà bỏ sót một mặt thì KHÔNG thành cấm — đó chỉ là chưa nhắc tới', () => {
    const d = demandsOf({ balconies: { sides: ['front', 'back'] } });
    expect(d.balcony?.sides).toEqual(['front', 'back']);
    expect(d.balcony?.forbiddenSides).toEqual([]);
  });

  it('«mọi tầng» ghim từng tầng từ tầng hai trở lên', () => {
    const d = demandsOf({ balconies: { scope: 'moi_tang' } });
    expect(d.balcony?.levels).toEqual([2, 3]);
  });

  it('khai không làm ban công mà mặt bằng vẫn có thì bị bác', () => {
    const d = demandsOf({ balconies: { scope: 'khong_co' } });
    const issues: string[] = [];
    checkBalconyDemand(planWithBalcony(50), d.balcony, (_l, _c, m) => issues.push(m));
    expect(issues.some((i) => i.includes('KHÔNG làm ban công'))).toBe(true);
  });

  it('ban công ra mặt sau trong khi đầu bài khai mặt tiền thì bị bác', () => {
    const d = demandsOf({ balconies: { scope: 'chi_mat_tien' } });
    const issues: string[] = [];
    // Ban công nằm sát mép y LỚN của tầng = mặt sau.
    checkBalconyDemand(planWithBalcony(1700), d.balcony, (_l, _c, m) => issues.push(m));
    expect(issues.some((i) => i.includes('mặt sau'))).toBe(true);
    expect(issues.some((i) => i.includes('mặt trước'))).toBe(true);
  });

  it('ban công đúng mặt tiền thì không lỗi gì', () => {
    const d = demandsOf({ balconies: { scope: 'chi_mat_tien' } });
    const issues: string[] = [];
    checkBalconyDemand(planWithBalcony(0), d.balcony, (_l, _c, m) => issues.push(m));
    expect(issues).toEqual([]);
  });
});

/** Mặt bằng một tầng (tầng 2) với đúng một ban công, mép trước đặt ở `y0`. */
function planWithBalcony(y0: number): AiFloorPlan {
  return {
    levels: [
      {
        level: 2,
        outline: [
          [0, 0],
          [500, 0],
          [500, 1800],
          [0, 1800],
        ],
        rooms: [{ id: 'bal1', type: 'balcony', rect: [100, y0, 400, y0 + 100], area_m2: 3 }],
      },
    ],
  } as unknown as AiFloorPlan;
}

// ── 4. Ban công đua ra ngoài ranh ───────────────────────────────────────────────────────

describe('ban công đua ra ngoài ranh', () => {
  const footprint = { x0: 0, y0: 0, x1: 500, y1: 1800 };
  const cell = (id: string, rect: typeof footprint) => ({
    id,
    kind: 'room' as const,
    rect,
    from: { x0: null, x1: null, y0: null, y1: null },
  });
  const typeOf = new Map([
    ['bal1', 'balcony'],
    ['bed1', 'bedroom'],
  ]);

  it('nới đúng mức đầu bài khai, và chỉ nới ô ban công áp sát mặt ấy', () => {
    const d = demandsOf({
      balconies: { sides: ['front'], projection_over_boundary: true, projection_m: 1.2 },
    });
    const out = projectBalconyCells({
      cells: [
        cell('bal1', { x0: 100, y0: 0, x1: 400, y1: 120 }),
        cell('bed1', { x0: 0, y0: 120, x1: 500, y1: 600 }),
      ],
      typeOf,
      balcony: d.balcony,
      level: 2,
      footprint,
    });
    expect(out.cells[0]?.rect.y0).toBe(-120);
    // Phòng ngủ không nhúc nhích: chỉ ban công mới được đua.
    expect(out.cells[1]?.rect).toEqual({ x0: 0, y0: 120, x1: 500, y1: 600 });
    expect(out.projected).toEqual([{ id: 'bal1', side: 'front', cm: 120 }]);
  });

  it('ban công nằm GIỮA nhà thì không nhô — nhô một ô ở giữa là đẩy nó xuyên phòng bên', () => {
    const d = demandsOf({
      balconies: { sides: ['front'], projection_over_boundary: true, projection_m: 1.2 },
    });
    const inner = cell('bal1', { x0: 100, y0: 600, x1: 400, y1: 720 });
    const out = projectBalconyCells({
      cells: [inner],
      typeOf,
      balcony: d.balcony,
      level: 2,
      footprint,
    });
    expect(out.cells[0]?.rect).toEqual(inner.rect);
    expect(out.projected).toEqual([]);
  });

  it('khai có đua mà KHÔNG khai bao nhiêu mét: không nhô, và nói ra là còn thiếu số', () => {
    const d = demandsOf({ balconies: { sides: ['front'], projection_over_boundary: true } });
    expect(d.balcony?.projection).toBeNull();
    expect(d.balcony?.projectionDistanceMissing).toBe(true);
    expect(d.warnings.join(' ')).toContain('chưa khai đua bao nhiêu mét');

    const out = projectBalconyCells({
      cells: [cell('bal1', { x0: 100, y0: 0, x1: 400, y1: 120 })],
      typeOf,
      balcony: d.balcony,
      level: 2,
      footprint,
    });
    expect(out.projected).toEqual([]);
  });

  it('mức đua bằng 0 cũng là CHƯA CÓ SỐ — không ô nào nhô', () => {
    // `briefDemands` đã lọc mức 0 từ trước, nên đây là hàng rào thứ hai cho người gọi khác dựng
    // tay một yêu cầu. Nó rẻ và nó chặn đúng thứ tệ nhất: nhô 0 cm thì ô ban công trùng khít mép
    // nhà, hình bao mọc thêm một cạnh có bề dày bằng không, và tờ vẽ ra một đường thừa.
    const base = demandsOf({
      balconies: { sides: ['front'], projection_over_boundary: true, projection_m: 1.2 },
    }).balcony!;
    const out = projectBalconyCells({
      cells: [cell('bal1', { x0: 100, y0: 0, x1: 400, y1: 120 })],
      typeOf,
      balcony: { ...base, projection: { sides: ['front'], m: 0 } },
      level: 2,
      footprint,
    });
    expect(out.projected).toEqual([]);
    expect(out.cells[0]?.rect.y0).toBe(0);
  });

  it('tầng 1 không đua — phần nhô của tầng trệt là lấn đất, không phải ban công', () => {
    const d = demandsOf({
      balconies: { sides: ['front'], projection_over_boundary: true, projection_m: 1.2 },
    });
    const out = projectBalconyCells({
      cells: [cell('bal1', { x0: 100, y0: 0, x1: 400, y1: 120 })],
      typeOf,
      balcony: d.balcony,
      level: 1,
      footprint,
    });
    expect(out.projected).toEqual([]);
  });

  it('cổng cho ban công ra ngoài ĐÚNG mức đã khai, và chặn phần vượt quá', () => {
    const d = demandsOf({
      balconies: { sides: ['front'], projection_over_boundary: true, projection_m: 1.2 },
    });
    const box = allowedBox(footprint, d.balcony, 'balcony', 2);
    expect(box.y0).toBe(-120);
    // Phòng khác vẫn bị giữ trong hình bao, và đó là chính đối tượng ban đầu.
    expect(allowedBox(footprint, d.balcony, 'bedroom', 2)).toBe(footprint);
  });
});

// ── 5. Bảng dữ liệu và mã nguồn không lệch nhau ─────────────────────────────────────────

describe('kb và mã nguồn phải nói cùng một thứ', () => {
  it('mọi dòng `demands.spaces` đều có người đọc trong brief-demands.ts', () => {
    const digest = digestOf(TOWNHOUSE);
    // `matchDemand` trả `null` cho cả «chưa trả lời» lẫn «mã lạ», nên không phân biệt được bằng
    // kết quả. Danh sách mã đã cài cứng ở đây là bản sao có chủ ý: thêm một dòng vào tệp YAML mà
    // quên viết nhánh đọc nó thì phép thử này đỏ, và một yêu cầu của gia chủ không lặng lẽ biến mất.
    const handled = new Set([
      'phong_tho_rieng',
      'tho_san_thuong',
      'kinh_doanh_tai_nha',
      'van_phong_tai_nha',
      'wc_cho_khach',
      'bep_phu',
      'kho_do_nhieu',
      'hop_ky_thuat_cuc_nong',
      'cho_phoi_ngoai_troi',
      'bon_nuoc_mai',
      'bep_kin_chien_xao',
      'khach_o_lai',
      'lam_viec_tai_nha',
    ]);
    for (const row of fidelity.demands.spaces) {
      expect(handled.has(row.code), `\`${row.code}\` chưa có nhánh trong matchDemand`).toBe(true);
    }
    // Và chiều ngược lại: không giữ nhánh chết cho dòng đã xoá khỏi tệp dữ liệu.
    const inFile = new Set(fidelity.demands.spaces.map((row) => row.code));
    for (const code of handled) {
      expect(inFile.has(code), `\`${code}\` có nhánh nhưng không còn dòng nào trong kb`).toBe(true);
    }
    expect(matchDemand('ma_khong_ton_tai', digest)).toBeNull();
  });

  it('cạnh nhỏ nhất của giếng thang khai ở hai tệp kb thì phải bằng nhau', () => {
    expect(rawNorms.usable.min_side_m.elevator).toBe(rawFidelity.demands.elevator.shaft_min_side_m);
  });

  it('mọi loại phòng bảng đòi hỏi nhắc tới đều có trong từ vựng', () => {
    const known = new Set(vocabulary.vocabulary.types.map((t) => t.code));
    for (const row of fidelity.demands.spaces) {
      for (const code of row.anyOf) {
        expect(known.has(code), `\`${code}\` không có trong kb/room_vocabulary.yaml`).toBe(true);
      }
    }
    expect(known.has(fidelity.demands.elevator.spaceType)).toBe(true);
    expect(known.has(fidelity.demands.balcony.spaceType)).toBe(true);
  });
});

// ── 6. Suy đoán nghề chỉ cảnh báo ───────────────────────────────────────────────────────

describe('lời gia chủ thì bác được, suy đoán nghề thì không', () => {
  it('bếp phụ gia chủ tự khai là ràng buộc CHẶN', () => {
    const d = demandsOf({ lifestyle: { second_kitchen: true } });
    const row = d.spaces.find((s) => s.code === 'bep_phu');
    expect(row?.blocking).toBe(true);
    expect(row?.count).toBe(2);
  });

  it('«nấu nhiều chiên xào» chỉ là suy đoán nghề — không được bác phương án nào', () => {
    const d = demandsOf({ lifestyle: { cooking: 'nau_nhieu_chien_xao' } });
    const row = d.spaces.find((s) => s.code === 'bep_kin_chien_xao');
    expect(row?.blocking).toBe(false);
    // Và nó KHÔNG đi vào lời dẫn như một mệnh lệnh.
    expect(d.lines.join(' ')).not.toContain('chiên xào');
  });

  it('người đi lại khó khăn ở nhà nhiều tầng không thang máy: cảnh báo, không bác', () => {
    const d = demandsOf({ lifestyle: { reduced_mobility: true } });
    expect(d.warnings.join(' ')).toContain('đi lại khó khăn');
    expect(d.spaces.every((s) => !s.blocking || s.code !== 'thang_may')).toBe(true);
  });

  it('đòi hỏi MỀM chưa được đáp ứng thì ra cảnh báo, KHÔNG ra lỗi chặn', () => {
    const d = demandsOf({ lifestyle: { cooking: 'nau_nhieu_chien_xao', overnight_guests: true } });
    const levels: string[] = [];
    const messages: string[] = [];
    // Mặt bằng chỉ có phòng khách: thiếu cả bếp lẫn phòng ngủ cho khách.
    const plan = {
      levels: [
        {
          level: 1,
          outline: [
            [0, 0],
            [500, 0],
            [500, 1800],
            [0, 1800],
          ],
          rooms: [{ id: 'l1', type: 'living', rect: [0, 0, 500, 400], area_m2: 20 }],
        },
      ],
    } as unknown as AiFloorPlan;

    checkSoftDemands(plan, d.spaces, (level, _c, message) => {
      levels.push(level);
      messages.push(message);
    });
    expect(messages.length).toBeGreaterThan(0);
    // Điều quan trọng nhất của phép thử này: KHÔNG một dòng nào là `blocking`.
    expect(levels.every((l) => l === 'finding')).toBe(true);
    expect(messages.join(' ')).toContain('Không chặn');
  });

  it('đòi hỏi mềm ĐÃ được đáp ứng thì im lặng', () => {
    const d = demandsOf({ lifestyle: { cooking: 'nau_nhieu_chien_xao' } });
    const messages: string[] = [];
    const plan = {
      levels: [
        {
          level: 1,
          outline: [
            [0, 0],
            [500, 0],
            [500, 1800],
            [0, 1800],
          ],
          rooms: [{ id: 'k1', type: 'kitchen', rect: [0, 0, 300, 400], area_m2: 12 }],
        },
      ],
    } as unknown as AiFloorPlan;
    checkSoftDemands(plan, d.spaces, (_l, _c, message) => messages.push(message));
    expect(messages).toEqual([]);
  });

  it('dòng CHẶN không đi qua đường cảnh báo — hai chỗ nói cùng một lỗi là thừa', () => {
    const d = demandsOf({ lifestyle: { second_kitchen: true } });
    const messages: string[] = [];
    const plan = {
      levels: [
        {
          level: 1,
          outline: [
            [0, 0],
            [500, 0],
            [500, 1800],
            [0, 1800],
          ],
          rooms: [{ id: 'l1', type: 'living', rect: [0, 0, 500, 400], area_m2: 20 }],
        },
      ],
    } as unknown as AiFloorPlan;
    checkSoftDemands(plan, d.spaces, (_l, _c, message) => messages.push(message));
    expect(messages.join(' ')).not.toContain('bếp phụ');
  });

  it('chỗ để xe tính theo CỠ xe đầu bài khai', () => {
    const sedan = demandsOf({ parking: { cars: 1, motorbikes: 0, car_size: 'gam_thap' } });
    const pickup = demandsOf({ parking: { cars: 1, motorbikes: 0, car_size: 'ban_tai' } });
    expect(sedan.garageMinM2).toBe(rawFidelity.demands.car_m2_by_size.gam_thap);
    expect(pickup.garageMinM2).toBe(rawFidelity.demands.car_m2_by_size.ban_tai);
    expect(pickup.garageMinM2!).toBeGreaterThan(sedan.garageMinM2!);

    // Không khai cỡ thì vẫn dùng con số chung như trước T65 — không đoán hộ một cỡ xe.
    const unknown = demandsOf({ parking: { cars: 1, motorbikes: 0 } });
    expect(unknown.garageMinM2).toBe(rawFidelity.parking.car_m2);
  });
});
