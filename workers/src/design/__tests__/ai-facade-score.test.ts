/**
 * Thước chấm mặt đứng (T63) — KHÔNG chạm mạng, chấm trên hai ý tưởng dựng sẵn.
 *
 * Haan 20/09/2026: «cần cải tiến để bản vẽ mặt đứng đạt được tối thiểu 80% so với bản vẽ từ hồ sơ
 * thật của NVG». Bộ này canh đúng những chỗ mà một con số sai sẽ KHÔNG trông giống lỗi:
 *  · tiêu chí không áp dụng trả RỖNG, và trọng số của nó không chia lại cho phần còn lại;
 *  · tiêu chí do CHƯƠNG TRÌNH quyết không bao giờ đi vào danh sách gửi mô hình sửa;
 *  · điểm đổi đúng chiều khi bản vẽ đổi — một cái thước luôn cho cùng một số thì không đo gì.
 */

import { describe, expect, it } from 'vitest';
import type { AiFacadeConcept } from '@nvg/shared/design';
import { parseFacadeQuality } from '../ai/facade/quality';
import { facadeFixable, lightness, scoreFacade } from '../ai/facade/score';
import { facadeVocab, TOWNHOUSE_FACADE, VILLA_FACADE } from './ai-facade-fixtures';
import { read } from './ai-real-context';

const quality = parseFacadeQuality(read('kb/facade_quality.yaml'));

const score = (concept: AiFacadeConcept, railingCm: number | null = 90) =>
  scoreFacade({ concept, quality, vocab: facadeVocab, railingCm });

/** Bản sao sâu — mọi phép thử sửa ý tưởng phải sửa trên bản riêng của nó. */
const copy = (concept: AiFacadeConcept): AiFacadeConcept =>
  JSON.parse(JSON.stringify(concept)) as AiFacadeConcept;

describe('Thước chấm — đọc tệp', () => {
  it('tệp thật đọc được, có ngưỡng 80 và đủ năm nhóm', () => {
    expect(quality.acceptPercent).toBe(80);
    expect(Object.keys(quality.groups).sort()).toEqual(['C', 'M', 'R', 'T', 'V']);
    // Trọng số nhóm cộng đúng 100 — lệch thì % trên phần chấm được đọc sai mà không ai thấy.
    expect(Object.values(quality.groups).reduce((sum, g) => sum + g.weight, 0)).toBe(100);
  });

  it('tiêu chí thang `band` thiếu một mốc bị bắt NGAY lúc đọc tệp', () => {
    const broken = `
version: '1'
score_version: 1
co_so_du_lieu: 'x'
within_group: equal
groups: { M: { vi: 'Mái', weight: 100 } }
criteria:
  - { code: M1, group: M, vi: 'Dốc mái', kind: band, low: 30, high: 32, n: 1, label: 'ĐO' }
`;
    expect(() => parseFacadeQuality(broken)).toThrow(/hard_low/);
  });
});

describe('Chấm một ý tưởng', () => {
  it('nhà mái bằng: ba tiêu chí mái Nhật trả RỖNG kèm lý do, không phải 0 điểm', () => {
    const result = score(TOWNHOUSE_FACADE);
    const japanese = result.criteria.filter((c) => ['M1', 'M2', 'T2'].includes(c.code));
    expect(japanese.every((c) => c.score === null)).toBe(true);
    expect(japanese[0]!.why).toMatch(/mái Nhật/);
    // KHÔNG ÁP DỤNG thì ra khỏi phép chia hẳn (trọng số 0) — giữ lại phần của nó là phạt nhà mái
    // bằng vì nó không phải nhà mái Nhật.
    expect(japanese.every((c) => c.weight === 0)).toBe(true);
    expect(result.scoredWeight).toBe(100);
  });

  it('THIẾU ĐẦU VÀO thì khác: tiêu chí GIỮ phần trọng số, phần ấy không vào tổng chấm được', () => {
    // Chưa biết chiều cao lan can — R1 vẫn nhận trọng số của nhóm R, nhưng nhóm R không có điểm.
    const result = score(TOWNHOUSE_FACADE, null);
    const r1 = result.criteria.find((c) => c.code === 'R1')!;
    expect(r1.score).toBeNull();
    expect(r1.weight).toBe(quality.groups.R!.weight);
    expect(result.scoredWeight).toBe(100 - quality.groups.R!.weight);
  });

  it('nhóm Mái của nhà mái bằng dồn hết trọng số vào tiêu chí tường chắn mái', () => {
    const result = score(TOWNHOUSE_FACADE);
    const m3 = result.criteria.find((c) => c.code === 'M3')!;
    expect(m3.weight).toBe(quality.groups.M!.weight);
  });

  it('phần trăm tính trên phần CHẤM ĐƯỢC, không phải trên 100', () => {
    const result = score(VILLA_FACADE);
    expect(result.percent).toBe(Math.round((result.points / result.scoredWeight) * 100));
  });
});

describe('Từng tiêu chí đổi đúng chiều', () => {
  it('V1: phần đế sáng hơn thân nhà thì mất điểm, tối hơn thì được điểm', () => {
    const dark = copy(VILLA_FACADE);
    const body = dark.materials.find((m) => m.where === 'body')!;
    const base = dark.materials.find((m) => m.where === 'base')!;
    body.colour = 'trang';
    base.colour = 'den';
    expect(score(dark).criteria.find((c) => c.code === 'V1')!.score).toBe(1);

    const light = copy(dark);
    light.materials.find((m) => m.where === 'base')!.colour = 'trang';
    expect(score(light).criteria.find((c) => c.code === 'V1')!.score).toBe(0);
  });

  it('V2: phần đế ốp đá được điểm, sơn thì không — đọc cờ `op` của danh mục', () => {
    const clad = copy(VILLA_FACADE);
    clad.materials.find((m) => m.where === 'base')!.material = 'da_granite';
    expect(score(clad).criteria.find((c) => c.code === 'V2')!.score).toBe(1);

    const painted = copy(clad);
    painted.materials.find((m) => m.where === 'base')!.material = 'son_nuoc';
    expect(score(painted).criteria.find((c) => c.code === 'V2')!.score).toBe(0);
  });

  it('M2: thêm dải diềm mái cho nhà mái Nhật thì được điểm', () => {
    const jp = copy(VILLA_FACADE);
    jp.roof.type = 'japanese';
    jp.roof.pitch_deg = 30;
    const before = score(jp).criteria.find((c) => c.code === 'M2')!;
    expect(before.score).toBe(0);

    jp.elevation.elements = [
      ...(jp.elevation.elements ?? []),
      { kind: 'eaves_band', rect: [0, 300, 100, 340], material_ref: 0 },
    ];
    expect(score(jp).criteria.find((c) => c.code === 'M2')!.score).toBe(1);
  });

  it('R1: lan can 110 cm của quy ước cũ TRƯỢT khoảng 80–90 của hồ sơ thật', () => {
    // Đây là chỗ thước chấm bắt được một số MỒI lệch hồ sơ, không phải bắt mô hình.
    expect(score(VILLA_FACADE, 110).criteria.find((c) => c.code === 'R1')!.score).toBe(0.5);
    expect(score(VILLA_FACADE, 90).criteria.find((c) => c.code === 'R1')!.score).toBe(1);
  });

  it('R1: chưa biết chiều cao lan can thì RỖNG, không phải 0', () => {
    const r1 = score(VILLA_FACADE, null).criteria.find((c) => c.code === 'R1')!;
    expect(r1.score).toBeNull();
    expect(r1.why).toMatch(/lan can/);
  });
});

/*
 * Haan, 20/09/2026: «việc có cửa sổ ở mặt tiền là không bắt buộc, có nhà cần có, có nhà không.»
 *
 * Nên «không có cửa sổ» phải nằm ở nhánh KHÔNG ÁP DỤNG, không phải nhánh thiếu đầu vào. Hai nhánh
 * cho ra hai mẫu số khác nhau cho cùng một bản vẽ, và mẫu số co lại là kiểu sai không ai nhìn ra:
 * điểm vẫn có, chỉ là nó nói về một phần nhỏ hơn của ngôi nhà.
 */
describe('Thứ ngôi nhà KHÔNG CÓ, khác thứ chưa đo được', () => {
  const remove = (concept: AiFacadeConcept, kind: string) => {
    const out = copy(concept);
    out.openings_front = out.openings_front.filter((o) => o.kind !== kind);
    return out;
  };

  it('mặt tiền không cửa sổ: C1 và C3 ra khỏi phép chia, nhóm Cửa vẫn chấm đủ trọng số', () => {
    const result = score(remove(VILLA_FACADE, 'window'));
    for (const code of ['C1', 'C3']) {
      const c = result.criteria.find((x) => x.code === code)!;
      expect(c.score).toBeNull();
      expect(c.weight).toBe(0);
      expect(c.why).toMatch(/cửa sổ/);
    }
    // Phần của chúng về C2, nhóm không hụt — và tổng chấm được KHÔNG co lại.
    expect(result.criteria.find((x) => x.code === 'C2')!.weight).toBe(quality.groups.C!.weight);
    expect(result.groups.find((g) => g.code === 'C')!.scoredWeight).toBe(quality.groups.C!.weight);
    expect(result.scoredWeight).toBe(score(VILLA_FACADE).scoredWeight);
  });

  it('nhà phố vào bằng cửa để xe: cả nhóm Cửa rời khỏi mẫu số, không phải 0 điểm', () => {
    // Nhà phố mẫu để tầng trệt chỉ có cửa để xe; bỏ nốt cửa chính là mặt tiền không còn gì để đo
    // cao độ lanh tô. Cả ba tiêu chí C ra khỏi phép chia — KHÔNG phải cùng nhau ăn 0 điểm.
    const result = score(remove(TOWNHOUSE_FACADE, 'door'));
    expect(result.criteria.filter((c) => c.group === 'C').every((c) => c.score === null)).toBe(
      true,
    );
    expect(result.groups.find((g) => g.code === 'C')!.scoredWeight).toBe(0);
    expect(result.scoredWeight).toBe(
      score(TOWNHOUSE_FACADE).scoredWeight - quality.groups.C!.weight,
    );
    expect(result.criteria.find((c) => c.code === 'C2')!.why).toMatch(/cửa chính/);
  });

  it('tầng có cửa chính mới là tầng đem đo — nhà phố đo hàng cửa tầng 2, không phải tầng để xe', () => {
    // Nếu bộ chấm đo «tầng thấp nhất», nhà phố mẫu sẽ thành «không có cửa sổ» một cách oan uổng:
    // tầng trệt của nó chỉ có cửa để xe.
    const c3 = score(TOWNHOUSE_FACADE).criteria.find((c) => c.code === 'C3')!;
    expect(c3.score).not.toBeNull();
    expect(c3.value).toBe(90);
  });

  /*
   * Bắt được khi làm mục khảo sát lan can (20/09/2026): hồ sơ demo KHÔNG CÓ ban công nào, mà thước
   * vẫn trừ điểm «lan can ban công cao 80–90 cm» — đúng chỗ duy nhất bản vẽ ấy mất điểm. Biểu mẫu
   * thì ẩn mục lan can ở chính ngôi nhà đó, nên kỹ sư không có đường nào sửa con số bị trừ.
   */
  it('nhà không có ban công: R1 ra khỏi phép chia, nhóm Lan can rời mẫu số', () => {
    const noBalcony = copy(VILLA_FACADE);
    noBalcony.balconies = [];
    const result = score(noBalcony);
    const r1 = result.criteria.find((c) => c.code === 'R1')!;
    expect(r1.score).toBeNull();
    expect(r1.weight).toBe(0);
    expect(r1.why).toMatch(/ban công/);
    expect(result.scoredWeight).toBe(score(VILLA_FACADE).scoredWeight - quality.groups.R!.weight);
  });

  it('CHƯA BIẾT thì vẫn giữ phần của mình — lan can rỗng vẫn co `scoredWeight`', () => {
    // Đối chứng của ba phép thử trên: hai nhánh phải cho ra hai kết quả khác nhau, nếu không thì
    // `chi_khi` chỉ là chữ trang trí.
    const base = score(VILLA_FACADE).scoredWeight;
    expect(score(remove(VILLA_FACADE, 'window'), null).scoredWeight).toBe(
      base - quality.groups.R!.weight,
    );
  });
});

describe('Danh sách gửi mô hình sửa', () => {
  it('KHÔNG bao giờ chứa tiêu chí do chương trình quyết', () => {
    const fixable = facadeFixable(score(TOWNHOUSE_FACADE, 110), 20);
    expect(fixable.length).toBeGreaterThan(0);
    // C1/C2/C3 (cao độ lanh tô, cửa) và R1 (lan can) đến từ mặt bằng và quy ước cấu tạo.
    expect(fixable.map((c) => c.code)).not.toContain('R1');
    expect(fixable.every((c) => c.doAi)).toBe(true);
  });

  it('xếp tiêu chí mất nhiều điểm nhất lên trước', () => {
    const fixable = facadeFixable(score(TOWNHOUSE_FACADE, 110), 20);
    const lost = fixable.map((c) => c.weight * (1 - c.score!));
    expect([...lost].sort((a, b) => b - a)).toEqual(lost);
  });
});

describe('Độ sáng màu — L*, không phải relative luminance', () => {
  it('trắng sáng hơn đen; mã hỏng trả rỗng', () => {
    expect(lightness('#FFFFFF')).toBeGreaterThan(lightness('#000000')!);
    expect(lightness('không-phải-mã')).toBeNull();
  });

  /*
   * Hàng rào của một lỗi đã xảy ra thật (20/09/2026): bộ chấm lần đầu dùng relative luminance Y,
   * và «ghi bạc» #A7ABAE có Y = 0,40 nên bị xếp vào nhóm TỐI — trong khi bốn trong sáu hồ sơ NVG
   * dùng đúng loại ghi sáng ấy cho thân nhà. Cái thước chấm trượt chính bản vẽ nó dựng từ đó.
   */
  it('ghi bạc là màu SÁNG, gần trắng hơn gần nâu — điều mà Y nói ngược lại', () => {
    const ghi = lightness('#A7ABAE')!;
    const trang = lightness('#F5F5F2')!;
    const nau = lightness('#8A5A3B')!;
    expect(trang - ghi).toBeLessThan(ghi - nau);
    expect(ghi).toBeGreaterThan(60);
  });
});
