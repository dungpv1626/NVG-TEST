/**
 * Gói quy tắc — canh hai loại lỗi HỎNG IM LẶNG, cả hai đã xảy ra thật.
 *
 * ① **Mã phòng không tồn tại.** `lightwell_max_area` nhắm `lightwell` trong khi từ vựng chỉ có
 *    `light_well`, nên nó CHƯA TỪNG chạy lần nào — không lỗi, không cảnh báo, chỉ là một quy tắc
 *    vĩnh viễn không khớp gì. `load_bearing_wall_alignment` hỏng cùng kiểu: nhóm nó nhắm có
 *    `members: []`. Hai lỗi này chỉ lộ ra khi đối chiếu HAI tệp dữ liệu với nhau.
 *
 * ② **Thói quen bị gắn nhãn pháp quy.** `kindOf` từng hỏi «có chữ *kinh nghiệm* thì là thói
 *    quen, còn lại là luật», nên quy tắc mang nguồn `đo trên hồ sơ NVG` bị gọi là `legal`. Đó
 *    đúng là lỗi T20 đã sửa một lần: màn hình nói người dùng vi phạm quy chuẩn trong khi họ chỉ
 *    làm khác thói quen của chính mình.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kindOf, selectedRulePack } from '../ai/rule-packs';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';

/*
 * Đọc YAML từ ĐĨA, không import qua bundler: `rules/rule-pack-data.ts` nhúng tệp bằng
 * `import ... from '*.yaml'`, và phép biến đổi ấy chỉ có trong cấu hình build của Worker —
 * nhóm `logic` của Vitest không có, nên import nó ở đây làm cả tệp thử không nạp được.
 * Đọc từ đĩa còn đúng hơn về mặt ý đồ: phép thử này canh chính NỘI DUNG hai tệp dữ liệu.
 */
const read = (rel: string) => readFileSync(new URL(`../../../../${rel}`, import.meta.url), 'utf8');

// Nhánh AI đọc HAI tệp: thói quen nghề + ngưỡng đo được. Tệp thứ hai tách riêng vì bộ giải
// KHÔNG được đọc nó — xem `rule-pack-data.ts#NVG_MEASURED_FILES`.
const AI_FILES = ['rules/nvg-experience.yaml', 'rules/nvg-measured.yaml'] as const;
const experiencePack = new RulePack(
  AI_FILES.flatMap((f) => parseRuleFile(read(f), f)),
  false,
);
const nvgExperiencePack = () => experiencePack;
const measuredOnly = new RulePack(
  parseRuleFile(read('rules/nvg-measured.yaml'), 'rules/nvg-measured.yaml'),
  false,
);
// Gói pháp quy của nhánh AI rỗng từ 12/09/2026 (T30) — xem `rule-pack-data.ts#nationalRulePack`.
const emptyPack = new RulePack([], false);
const nationalRulePack = () => emptyPack;

const vocab = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groups = roomGroups(vocab);
const codes = new Set(vocab.types.map((t) => t.code));
const groupNames = new Set(Object.keys(groups));

describe('mọi target của quy tắc phải TỒN TẠI — lỗi `lightwell` không được lặp lại', () => {
  it('mỗi `target` là một mã phòng thật hoặc một nhóm thật', () => {
    const unknown = nvgExperiencePack()
      .rules.map((r) => ({ id: r.id, target: r.params.target }))
      .filter((r) => r.target !== undefined && r.target !== null)
      .filter((r) => !codes.has(String(r.target)) && !groupNames.has(String(r.target)));
    expect(unknown).toEqual([]);
  });

  it('nhóm mà quy tắc nhắm tới không được RỖNG — nhóm rỗng nghĩa là quy tắc không bao giờ chạy', () => {
    const emptyTargets = nvgExperiencePack()
      .rules.filter((r) => groupNames.has(String(r.params.target)))
      .filter((r) => (groups[String(r.params.target)] ?? []).length === 0)
      .map((r) => `${r.id} → ${String(r.params.target)}`);
    expect(emptyTargets).toEqual([]);
  });

  it('giếng trời nhắm đúng `light_well`, và mã ấy có trong từ vựng', () => {
    const rule = nvgExperiencePack().rules.find((r) => r.id === 'lightwell_max_area');
    expect(rule?.params.target).toBe('light_well');
    expect(codes.has('light_well')).toBe(true);
  });

  it('hai mã thêm ngày 12/09/2026 có mặt và đã vào nhóm (T32)', () => {
    // Thiếu nhóm thì mã tồn tại nhưng mọi quy tắc theo nhóm bỏ qua nó — lại một lỗi im lặng.
    expect(codes.has('porch')).toBe(true);
    expect(codes.has('vanity')).toBe(true);
    expect(groups.outdoor).toContain('porch');
    expect(groups.service).toContain('vanity');
  });
});

describe('nhánh AI KHÔNG kiểm pháp quy (T30)', () => {
  it('`nationalRulePack` dựng gói RỖNG, không đọc `rules/base/`', () => {
    // Khẳng định trên MÃ NGUỒN, không trên một gói rỗng tự dựng ở đây: kiểm cái sau là tự chứng
    // minh chính nó. Không import được `rule-pack-data` trong nhóm `logic` (nó nhúng YAML qua
    // bundler), nên đọc tệp là cách duy nhất còn lại để phép thử nói về mã thật.
    const src = readFileSync(new URL('../rules/rule-pack-data.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('export function nationalRulePack'));
    const end = body.indexOf('\n}');
    expect(body.slice(0, end)).toContain('new RulePack([], false)');
    expect(body.slice(0, end)).not.toContain('BASE_FILES');
  });

  it('`rules/base/` VẪN còn cho bộ giải — gỡ nhánh AI không được gỡ luôn bộ giải', () => {
    // T10: 1.211 phép thử của bộ giải đang xanh không được vỡ. Bộ giải đọc qua `rulePackFor`,
    // một hàm khác, và đó chính là lý do hai hàm được tách từ 09/09/2026.
    const src = readFileSync(new URL('../rules/rule-pack-data.ts', import.meta.url), 'utf8');
    expect(src).toContain('BASE_FILES');
    expect(read('rules/base/10-dimensions.yaml').length).toBeGreaterThan(0);
  });

  it('tích «quy chuẩn quốc gia» không ra quy tắc nào — ô tích đã gỡ, trường chỉ còn để đọc lịch sử', () => {
    const pack = selectedRulePack(
      { standards: true, experience: false },
      { standards: nationalRulePack(), experience: nvgExperiencePack() },
    );
    expect(pack.rules).toEqual([]);
  });

  it('gói kinh nghiệm vẫn có quy tắc — gỡ pháp quy không được gỡ luôn thứ đo được', () => {
    expect(nvgExperiencePack().rules.length).toBeGreaterThan(20);
  });
});

describe('không một quy tắc nào của gói kinh nghiệm được gắn nhãn pháp quy', () => {
  it('`kindOf` trả `experience` cho toàn bộ gói', () => {
    const mislabelled = nvgExperiencePack()
      .rules.filter((r) => kindOf(r) === 'legal')
      .map((r) => `${r.id} (${r.source})`);
    expect(mislabelled).toEqual([]);
  });

  it('chỉ nguồn DẪN ĐƯỢC văn bản mới là pháp quy', () => {
    const base = { id: 'x', applies_to: [], scope: 'floor', predicate: 'min_area', params: {} };
    const severity = 'warning' as const;
    expect(kindOf({ ...base, severity, source: 'QCVN 01:2021/BXD' })).toBe('legal');
    expect(kindOf({ ...base, severity, source: 'đo trên hồ sơ NVG' })).toBe('experience');
    expect(kindOf({ ...base, severity, source: 'kinh nghiệm NVG' })).toBe('experience');
  });
});

describe('xuất xứ của mỗi con số phải đọc được bằng máy', () => {
  it('mọi quy tắc khai `n` — chưa ai đo thì `n: 0`, không phải bỏ trống', () => {
    // Vì sao buộc khai: một ngưỡng đo trên 5 mặt bằng và một ngưỡng do team đoán trông y như nhau
    // trong YAML. `n` là chỗ duy nhất phân biệt được, và T31 buộc hiện nó ra màn hình.
    const missing = nvgExperiencePack()
      .rules.filter((r) => typeof r.params.n !== 'number')
      .map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('quy tắc có số đo thì kèm khoảng quan sát — một con số trần không kiểm lại được', () => {
    const measured = nvgExperiencePack().rules.filter((r) => Number(r.params.n) > 0);
    expect(measured.length).toBeGreaterThan(10);
    expect(measured.filter((r) => !r.params.khoang_quan_sat).map((r) => r.id)).toEqual([]);
  });

  it('không quy tắc nào khai n ≥ 15 — chưa có hồ sơ nào đủ cho tầng «định mức» (8.8 điểm 7)', () => {
    // Phép thử này đỏ khi ai đó khai một n lớn mà không bổ sung hồ sơ. Nó canh tính trung thực
    // của chính `n`, thứ mà T31 dựa vào để nói ra «đây là chỉ dấu, chưa phải chuẩn».
    const overclaimed = nvgExperiencePack()
      .rules.filter((r) => Number(r.params.n) >= 15)
      .map((r) => r.id);
    expect(overclaimed).toEqual([]);
  });
});

describe('gói ĐO ĐƯỢC không được chạm vào bộ giải (12/09/2026)', () => {
  // Chuyện đã xảy ra thật: `room_min_area_wc: 3.0` gộp vào `nvg-experience.yaml` nâng mức tối
  // thiểu của khu vệ sinh trong khâu chia diện tích của BỘ GIẢI từ 2,4 lên 3,0, và trên lô nhà
  // phố 3,5 × 12 m thì thang bộ tụt xuống mức sàn — 4 phép thử `program-plausibility` đỏ. Phép
  // đo không sai; lô ấy chật thật. Nhưng re-tune bộ giải là quyết định riêng, không phải hệ quả
  // phụ của một đợt sửa gói quy tắc nhánh AI.
  it('`rulePackFor` (đường của BỘ GIẢI) không nhắc tới gói đo được', () => {
    const src = readFileSync(new URL('../rules/rule-pack-data.ts', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('export function rulePackFor'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).not.toContain('NVG_MEASURED_FILES');
  });

  it('ngưỡng diện tích WC đo được nằm ở gói RIÊNG, không ở tệp dùng chung', () => {
    expect(measuredOnly.rules.map((r) => r.id)).toContain('room_min_area_wc');
    const shared = parseRuleFile(
      read('rules/nvg-experience.yaml'),
      'rules/nvg-experience.yaml',
    ).map((r) => r.id);
    expect(shared).not.toContain('room_min_area_wc');
  });

  it('nhánh AI vẫn thấy ĐỦ cả hai gói — tách không được làm mất quy tắc nào', () => {
    const ids = nvgExperiencePack().rules.map((r) => r.id);
    expect(ids).toContain('room_min_area_wc');
    expect(ids).toContain('room_min_dimension_closet');
    expect(ids.length).toBe(31);
  });
});
