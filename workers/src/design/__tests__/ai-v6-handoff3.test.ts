/**
 * Handoff v6 sửa lỗi đợt 3 (07/10/2026): WC / giặt tầng trên không đè phòng ở (nhà ống — CHẶN), phòng ở phải có mặt
 * thoáng khi «lấy sáng» ở hai ưu tiên đầu (CHẶN), và hai chỗ Haan nới cho nhà ống (T116 tiếp 17): WC RIÊNG của phòng ngủ
 * được đè khách / ăn; mỗi tầng chỉ phòng ngủ chính bị đòi mặt thoáng, phòng ngủ thứ hai trở đi trừ điểm (D2). KHÔNG chạm
 * mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { chooseBandDoors } from '../ai/bands/doors';
import { wetOverIssues, windowIssues } from '../ai/bands/layout';
import { profileMinSide } from '../ai/house-profile-norms';
import { parseMandatoryRules } from '../ai/mandatory';
import { bandsAttempt, generateAiPlan, planContext, promptsFor } from '../ai/plan';
import { criterionFor } from '../ai/plan-quality';
import { groupsBelowFloor } from '../ai/plan-score';
import type { StructuredCallOptions } from '../llm/text-client';
import { NHAONG_BANDS, NHAONG_BANDS_T2, swapRoom, withDemoAreas } from './ai-bands-helpers';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = withDemoAreas(
  JSON.parse(
    readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
  ) as AiBriefDigest,
);
const input = {
  ...realContextInput(digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
  geometry: 'rect' as const,
  pipeline: 'v6' as const,
  ...layoutKb,
};

const c = (id: string, w = 0) => ({ id, w, stack: [] as { id: string; d: number }[] });
const st = (...ids: string[]) => ({ id: '', w: 0, stack: ids.map((id) => ({ id, d: 0 })) });
const band = (...cells: ReturnType<typeof c>[]) => ({ depth: 0, cells });

type Rect = { x0: number; y0: number; x1: number; y1: number };
const types: Record<string, string> = {
  living_1: 'living',
  dining_1: 'dining',
  bed_1: 'bedroom',
  wc_ngu: 'wc',
  wc_2: 'wc',
  ngu_2: 'bedroom',
  master_2: 'master_bedroom',
  ngu_con: 'bedroom',
  study_2: 'study',
  lw: 'light_well',
};
const typeOf = (id: string) => types[id] ?? '';
const storey = (level: number, rects: Record<string, Rect>) => ({
  level,
  rects: new Map(Object.entries(rects)),
});
const FORBIDDEN = new Set([
  'living',
  'dining',
  'bedroom',
  'master_bedroom',
  'altar_room',
  'kitchen',
]);
const ENSUITE = {
  parentOf: (id: string) => (id === 'wc_ngu' ? 'ngu_2' : null),
  below: new Set(['living', 'dining']),
};

describe('WC tầng trên đè phòng ở (nhà ống)', () => {
  const below = storey(1, {
    living_1: { x0: 0, y0: 0, x1: 500, y1: 400 },
    bed_1: { x0: 0, y0: 400, x1: 500, y1: 800 },
  });
  it('WC riêng của phòng ngủ đè phòng khách → được (Haan nới 07/10/2026); WC chung cùng chỗ → chặn', () => {
    const upper = storey(2, {
      ngu_2: { x0: 0, y0: 0, x1: 380, y1: 400 },
      wc_ngu: { x0: 380, y0: 0, x1: 500, y1: 400 },
    });
    expect(wetOverIssues([below, upper], typeOf, FORBIDDEN, undefined, ENSUITE)).toEqual([]);
    const common = storey(2, { wc_2: { x0: 380, y0: 0, x1: 500, y1: 400 } });
    expect(wetOverIssues([below, common], typeOf, FORBIDDEN, undefined, ENSUITE)).toMatchObject([
      { code: 'wet_over_living', level: 2, rooms: ['wc_2'] },
    ]);
  });
  it('WC riêng đè phòng ngủ tầng dưới → vẫn chặn', () => {
    const upper = storey(2, {
      ngu_2: { x0: 0, y0: 0, x1: 380, y1: 400 },
      wc_ngu: { x0: 380, y0: 400, x1: 500, y1: 800 },
    });
    expect(wetOverIssues([below, upper], typeOf, FORBIDDEN, undefined, ENSUITE)).toMatchObject([
      { code: 'wet_over_living', rooms: ['wc_ngu'] },
    ]);
  });
});

describe('phòng ở không mặt thoáng', () => {
  const footprint = { x0: 0, y0: 0, x1: 500, y1: 1600 };
  const rule = (mainBedroomOnly: boolean) => ({
    types: new Set(['bedroom', 'master_bedroom', 'study']),
    openSides: new Set(['y0'] as const),
    mainBedroomOnly,
  });
  const floor = storey(3, {
    master_2: { x0: 0, y0: 0, x1: 500, y1: 500 },
    ngu_con: { x0: 0, y0: 500, x1: 500, y1: 800 },
    study_2: { x0: 0, y0: 800, x1: 500, y1: 1100 },
  });
  const run = (main: boolean) =>
    windowIssues([floor], typeOf, rule(main), new Set(['light_well']), footprint, new Set()).map(
      (issue) => issue.rooms[0],
    );
  it('mặc định: phòng ngủ con và phòng làm việc giữa nhà đều bị chặn', () => {
    expect(run(false)).toEqual(['ngu_con', 'study_2']);
  });
  it('nhà ống: phòng ngủ thứ hai của tầng không bị chặn (trừ điểm D2); phòng làm việc vẫn chặn', () => {
    expect(run(true)).toEqual(['study_2']);
  });
  it('nhà ống, tầng không có phòng ngủ chính: phòng ngủ RỘNG NHẤT là phòng chính, phải có mặt thoáng', () => {
    const t4 = storey(4, {
      ngu_2: { x0: 0, y0: 500, x1: 500, y1: 900 },
      ngu_con: { x0: 0, y0: 0, x1: 500, y1: 300 },
    });
    expect(
      windowIssues([t4], typeOf, rule(true), new Set(), footprint, new Set()).map(
        (i) => i.rooms[0],
      ),
    ).toEqual(['ngu_2']);
  });
});

describe('hành lang là một vùng (mục 1)', () => {
  it('hai ô hành lang lệch nhau, cạnh chung 70 cm: nối bằng ô thông suốt vách — không đòi đủ vách cửa đi 90 cm', () => {
    const rects = new Map([
      ['gt_1', { x0: 0, y0: 0, x1: 90, y1: 300 }],
      ['gt_2', { x0: 20, y0: 300, x1: 400, y1: 400 }],
    ]);
    const doorsWith = (corridorPassCm?: number) =>
      chooseBandDoors({
        level: 2,
        rects,
        typeOf: () => 'circulation',
        parentOf: () => null,
        through: new Set(['circulation']),
        doorWallCm: 90,
        ...(corridorPassCm ? { corridorPassCm } : {}),
        prefer: [],
        entryRoom: null,
        garageRoom: null,
      });
    expect(doorsWith(60)).toMatchObject([{ a: 'gt_1', b: 'gt_2', kind: 'opening' }]);
    expect(doorsWith()).toEqual([]);
  });
  it('vách chung tối thiểu giữa hai ô hành lang đọc từ kb (`corridor_pass_clear_m`), không ghi cứng trong mã', () => {
    expect(planContext(input).bands!.corridorPassCm).toBe(60);
    expect(planContext(input).bands!.doorWallCm).toBeGreaterThan(60);
  });
});

describe('thước chấm nhà ống', () => {
  const quality = input.quality!;
  it('D2: nhà phố không chấm, nhà ống chấm — một phòng ngủ tối trừ nửa', () => {
    const d2 = quality.criteria.find((c) => c.code === 'D2')!;
    expect(criterionFor(d2, 'nha_pho').rooms).toBe('none');
    expect(criterionFor(d2, 'nha_pho', 'ong')).toMatchObject({ rooms: 'bedrooms', zero: 2 });
  });
  it('B1 đọc cạnh tối thiểu theo loại nhà: hành lang 0,9 m, ban công 0,5 m, phòng ngủ 2,4 m', () => {
    const side = profileMinSide(input.construction, 'ong');
    expect(side('circulation')).toBe(0.9);
    expect(side('balcony')).toBe(0.5);
    expect(side('bedroom')).toBe(2.4);
    expect(side('kitchen')).toBeNull();
    expect(profileMinSide(input.construction, 'khong_khai')('circulation')).toBeNull();
  });
});

describe('bộ dải mẫu C viết tay, đầu bài demo đã sửa (T116 tiếp 17)', () => {
  const context = planContext(input);
  const attempt = (bands: typeof NHAONG_BANDS) =>
    bandsAttempt(
      context,
      context.layout!,
      context.bands!,
      promptsFor(context, prompts),
      bands,
      {} as never,
      context.roof?.level,
    );
  it('một lời gọi, qua cổng, nhóm B không bị trừ vì hành lang / ban công đúng bảng KTS', async () => {
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: NHAONG_BANDS,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    const result = await generateAiPlan({
      ...input,
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
      planVariants: false,
    });
    expect(options).toHaveLength(1);
    const b1 = result.score?.criteria.find((c) => c.code === 'B1');
    expect(b1?.refs ?? []).toEqual([]);
    // Sàn từng nhóm (mục 3.4): WC chung một trục tầng 1 → 4 nên nhóm E qua sàn; D ≥ 60 %.
    expect(
      groupsBelowFloor(
        result.score!,
        input.quality!.acceptGroupFloorPercent,
        input.quality!.acceptGroupFloors,
      ),
    ).toEqual([]);
    expect(input.quality!.acceptGroupFloors).toEqual({ D: 60 });
  });
  it('một WC chung đặt sau thang tầng 2 → đè phòng ăn tầng 1, bị chặn', () => {
    const swapped = swapRoom(NHAONG_BANDS, '2', 'gt_4', 'wc_9');
    expect(attempt(swapped).issues.join('\n')).toMatch(/Storey 2: "wc_9" sits over "dining_1"/);
  });
  it('lỗi WC / mặt thoáng không chặn bước chèn sảnh đầu thang (phát lại df9da65a)', () => {
    // Bộ dải trước đợt 3 vướng luật mặt thoáng; tầng 3 bỏ sảnh trước ô thang — chương trình vẫn chèn sảnh, câu nhắc chỉ
    // mang lỗi mặt thoáng / WC, không mang lỗi đầu thang.
    // Tầng 3 hành lang dọc bên PHẢI, thang bên trái, không sảnh ngang: đầu trước ô thang chỉ giáp phòng ngủ.
    const noLanding = {
      ...NHAONG_BANDS_T2,
      storeys: NHAONG_BANDS_T2.storeys.map((s) =>
        s.level === '3'
          ? {
              ...s,
              bands: [
                band(st('ngu_vc', 'wc_ngu_vc'), c('gt_4', 900)),
                band(c('ngu_con_1'), c('gt_5', 900)),
                band(c('THANG'), st('kho_3', 'light_well_1')),
              ],
            }
          : s,
      ),
    };
    const result = attempt(noLanding);
    const issues = result.issues.join('\n');
    expect(issues).toMatch(/has no window/);
    expect(issues).not.toMatch(/front end of THANG/);
    const t3 = result.bandsBase!.storeys.find((s) => s.level === '3')!;
    expect(t3.bands.some((band) => band.cells[0]?.id === 'gt_h3a')).toBe(true);
  });
  it('C1 không tính hộp kỹ thuật (không có cửa) là phòng «không tới được»', async () => {
    const withShaft = {
      ...NHAONG_BANDS,
      storeys: NHAONG_BANDS.storeys.map((s) =>
        s.level === '2'
          ? {
              ...s,
              bands: [band(c('ngu_ob'), st('wc_ngu_ob', 'hkt_2')), ...s.bands.slice(1)],
            }
          : s,
      ),
    };
    const client = {
      async complete() {
        return {
          json: withShaft,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    const result = await generateAiPlan({
      ...input,
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
      planVariants: false,
    });
    const c1 = result.score?.criteria.find((criterion) => criterion.code === 'C1');
    expect(c1?.refs ?? []).toEqual([]);
  });
});
