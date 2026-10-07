/**
 * Lược đồ hình chữ nhật v5 (`prompt-mat-bang-v5.md`, Haan chốt 04/10/2026) → ý định có bản phác: mã danh mục, gốc góc
 * lô, tự sửa nhẹ, lỗi có số đo, ban công đua, delta vòng sửa; KHỨ HỒI trên mọi bản phác thật đã ghi; và một lượt
 * đầu-cuối bằng client giả trên lượt thật 182665ea.
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AiHouseLayout } from '@nvg/shared/design';
import type { HouseIntent } from '../ai/house';
import type { ProgramRow } from '../ai/house-program';
import {
  gridParamsInMm,
  layoutToIntent,
  layoutView,
  mergeLayoutDelta,
  normaliseLayoutIds,
  rectFromSketch,
  type LayoutOptions,
} from '../ai/layout';
import {
  callHouseModel,
  evaluateHouseBest,
  mergeRevision,
  planContext,
  programGenerator,
  promptsFor,
} from '../ai/plan';
import type { StructuredCallOptions, TextModelClient } from '../llm/text-client';
import {
  FAKE_CALL,
  layoutFromRecorded,
  layoutKb,
  loadRun,
  prompts,
  realContextInput,
} from './ai-real-context';

// Lô 14 × 12 m, khối xây được lùi 2 m mặt trước và 2 m bên trái: 10 × 8 m.
const BLOCK = { x: 2000, y: 2000, widthMm: 10_000, depthMm: 8000 };
const row = (id: string, type: string, level = '1', parent: string | null = null): ProgramRow => ({
  id,
  name: id,
  level,
  type,
  min_m2: null,
  parent,
});
const PROGRAM: ProgramRow[] = [
  row('living_1', 'living'),
  row('ngu_vc', 'master_bedroom'),
  row('wc_ngu_vc', 'wc', '1', 'ngu_vc'),
  row('storage_1', 'storage'),
  row('bc_ngu_vc', 'balcony', '1', 'ngu_vc'),
];
const OPTIONS: LayoutOptions = {
  block: BLOCK,
  program: PROGRAM,
  spec: layoutKb.houseProgram,
  cellMm: 500,
  wallM: 0.22,
  cantileverFaces: { front: 100 },
  parentTypes: new Set(['bedroom', 'master_bedroom']),
  levels: [1],
};

function layout(
  rooms: [string, string, number[]][],
  extra: Partial<AiHouseLayout> = {},
): AiHouseLayout {
  return {
    variant_label: 'Thử',
    rationale: '',
    design_notes: [],
    assumptions: [],
    rooms: rooms.map(([id, level, rect]) => ({ id, level, rect })),
    doors: [],
    open: [],
    cantilevers: [],
    entry_room: '',
    garage_room: '',
    ...extra,
  };
}

describe('layoutToIntent — mã danh mục, gốc góc lô, tự sửa, lỗi có số đo', () => {
  it('loại và phòng mẹ lấy từ danh mục; rect đổi ra bản phác 0,5 m của KHỐI; WC 1,5 m = 3 ô', () => {
    const out = layoutToIntent(
      layout([
        ['living_1', '1', [2000, 2000, 6000, 8000]],
        ['ngu_vc', '1', [8000, 2000, 4000, 5000]],
        ['wc_ngu_vc', '1', [8000, 7000, 1500, 3000]],
        ['storage_1', '1', [9500, 7000, 2500, 3000]],
      ]),
      OPTIONS,
    );
    expect(out.issues).toEqual([]);
    expect(out.fixes).toEqual([]);
    const wc = out.intent.rooms.find((room) => room.id === 'wc_ngu_vc')!;
    expect(wc.type).toBe('wc');
    expect(wc.ensuite_of).toBe('ngu_vc');
    expect(wc.target_area_m2).toBeCloseTo((1.5 - 0.22) * (3 - 0.22), 1);
    const rows = out.intent.sketches![0]!.rows.map((r) => r.split(' '));
    expect(rows).toHaveLength(16);
    expect(rows[0]).toHaveLength(20);
    expect(rows[12]!.filter((id) => id === 'wc_ngu_vc')).toHaveLength(3);
    expect(out.intent.garage_room).toBeNull();
  });

  it('mã mô hình tự thêm theo tiền tố được nhận; mã lạ và tầng lạ là lỗi', () => {
    const out = layoutToIntent(
      layout([
        ['living_1', '1', [2000, 2000, 6000, 8000]],
        ['gt_1', '1', [8000, 2000, 1500, 8000]],
        ['ngu_vc', '1', [9500, 2000, 2500, 8000]],
        ['phong_la', '1', [0, 0, 100, 100]],
        ['kho_2', '7', [0, 0, 100, 100]],
      ]),
      OPTIONS,
    );
    expect(out.intent.rooms.find((room) => room.id === 'gt_1')?.type).toBe('circulation');
    expect(out.issues.map((issue) => `${issue.code}:${issue.rooms[0]}`).sort()).toEqual([
      'layout_bad_level:kho_2',
      'layout_unknown_id:phong_la',
    ]);
  });

  it('bắt bước 100, kéo vách lệch ≤ 300 mm về một đường và về mép khối', () => {
    const out = layoutToIntent(
      layout([
        ['living_1', '1', [2000, 2000, 5800, 8000]],
        ['ngu_vc', '1', [8040, 2000, 3800, 8000]],
      ]),
      OPTIONS,
    );
    expect(out.issues).toEqual([]);
    const [a, b] = out.intent.rooms;
    expect(a!.rect![0] + a!.rect![2]).toBe(b!.rect![0]);
    expect(b!.rect![0] + b!.rect![2]).toBe(12_000);
  });

  it('lỗ giữa nhà là lỗi — toạ độ trong câu nhắc là toạ độ LÔ', () => {
    const out = layoutToIntent(
      layout([
        ['living_1', '1', [2000, 2000, 10_000, 3000]],
        ['ngu_vc', '1', [2000, 5000, 4000, 5000]],
        ['storage_1', '1', [8000, 5000, 4000, 5000]],
        ['wc_ngu_vc', '1', [6000, 8000, 2000, 2000]],
      ]),
      OPTIONS,
    );
    expect(out.issues.map((issue) => issue.code)).toEqual(['rect_gap']);
    expect(out.issues[0]!.params.rect).toBe('[6000, 5000, 2000, 3000]');
  });

  it('ban công đua: phòng ban công cho danh mục (không ô), cửa từ phòng chủ, độ đua hạ về mức đầu bài', () => {
    const out = layoutToIntent(
      layout(
        [
          ['living_1', '1', [2000, 2000, 6000, 8000]],
          ['ngu_vc', '1', [8000, 2000, 4000, 8000]],
        ],
        {
          cantilevers: [
            { id: 'bc_ngu_vc', from_room: 'ngu_vc', face: 'front', depth: 1500 },
            { id: 'bc_2', from_room: 'living_1', face: 'left', depth: 1000 },
          ],
        },
      ),
      OPTIONS,
    );
    expect(out.intent.cantilevers).toEqual([
      { id: 'bc_ngu_vc', from: 'ngu_vc', face: 'front', depth_cm: 100, level: 1 },
    ]);
    const bc = out.intent.rooms.find((room) => room.id === 'bc_ngu_vc')!;
    expect(bc.type).toBe('balcony');
    expect(bc.ensuite_of).toBe('ngu_vc');
    expect(out.intent.sketches![0]!.rows.join(' ')).not.toContain('bc_ngu_vc');
    expect(out.intent.relationships).toContainEqual({
      a: 'ngu_vc',
      b: 'bc_ngu_vc',
      kind: 'adjacent',
    });
    expect(out.issues.map((issue) => issue.code)).toEqual(['cantilever_bad']);
    expect(out.fixes.some((fix) => fix.includes('100 cm'))).toBe(true);
  });

  it('cửa và ô thông thành quan hệ; xem lại đổi ngược, ban công đua về `cantilevers`', () => {
    const out = layoutToIntent(
      layout(
        [
          ['living_1', '1', [2000, 2000, 6000, 8000]],
          ['ngu_vc', '1', [8000, 2000, 4000, 8000]],
        ],
        {
          doors: [
            ['living_1', 'ngu_vc'],
            ['living_1', 'out'],
          ],
          cantilevers: [{ id: 'bc_ngu_vc', from_room: 'ngu_vc', face: 'front', depth: 1000 }],
          entry_room: 'living_1',
        },
      ),
      OPTIONS,
    );
    expect(out.intent.relationships.filter((rel) => rel.a === 'living_1')).toEqual([
      { a: 'living_1', b: 'ngu_vc', kind: 'adjacent' },
    ]);
    const back = layoutView(out.intent, BLOCK);
    expect(back.rooms.map((room) => room.id)).toEqual(['living_1', 'ngu_vc']);
    expect(back.doors).toEqual([['living_1', 'ngu_vc']]);
    expect(back.cantilevers).toEqual([
      { id: 'bc_ngu_vc', from_room: 'ngu_vc', face: 'front', depth: 1000 },
    ]);
    expect(back.rooms[0]!.rect).toEqual([2000, 2000, 6000, 8000]);
  });
});

describe('delta vòng sửa và chuẩn hoá mã', () => {
  const base = layout(
    [
      ['living_1', '1', [2000, 2000, 6000, 8000]],
      ['ngu_vc', '1', [8000, 2000, 4000, 8000]],
      ['storage_1', '1', [8000, 8000, 4000, 2000]],
    ],
    {
      doors: [
        ['living_1', 'ngu_vc'],
        ['living_1', 'storage_1'],
      ],
      cantilevers: [{ id: 'bc_ngu_vc', from_room: 'ngu_vc', face: 'front', depth: 1000 }],
    },
  );

  it('dời, xoá, thêm cửa, gỡ ban công đua — phòng xoá kéo theo cửa', () => {
    const merged = mergeLayoutDelta(base, {
      rooms_upsert: [{ id: 'ngu_vc', level: '1', rect: [8000, 2000, 4000, 6000] }],
      rooms_delete: ['storage_1'],
      doors_add: [['ngu_vc', 'living_1']],
      doors_remove: [],
      cantilevers_upsert: [{ id: 'bc_ngu_vc', from_room: 'ngu_vc', face: 'front', depth: 0 }],
      notes: ['Thu phòng ngủ'],
    });
    expect(merged.rooms.map((room) => room.id)).toEqual(['living_1', 'ngu_vc']);
    expect(merged.rooms[1]!.rect).toEqual([8000, 2000, 4000, 6000]);
    expect(merged.doors).toEqual([['living_1', 'ngu_vc']]);
    expect(merged.cantilevers).toEqual([]);
    expect(merged.design_notes).toEqual(['Thu phòng ngủ']);
  });

  it('mã in hoa / có dấu của tài liệu bàn giao về dạng hợp đồng ở mọi chỗ', () => {
    expect(
      normaliseLayoutIds({
        rooms: [{ id: 'NGU_OB', level: '1', rect: [0, 0, 1, 1] }],
        doors: [['NGU_OB', 'GT-1']],
        cantilevers: [{ id: 'BC_M', from_room: 'NGU_OB', face: 'front', depth: 1000 }],
        entry_room: 'KHÁCH',
      }),
    ).toEqual({
      rooms: [{ id: 'ngu_ob', level: '1', rect: [0, 0, 1, 1] }],
      doors: [['ngu_ob', 'gt_1']],
      cantilevers: [{ id: 'bc_m', from_room: 'ngu_ob', face: 'front', depth: 1000 }],
      entry_room: 'khach',
    });
  });
});

describe('khứ hồi trên bản phác thật đã ghi', () => {
  const ids = readdirSync('workers/src/design/__tests__/fixtures')
    .filter((f) => f.startsWith('ai-run-'))
    .map((f) => f.slice(7, -5));

  it('tầng toàn phòng chữ nhật: bản phác → rect (toạ độ lô) → bản phác cùng cỡ ô ra y nguyên', () => {
    let checked = 0;
    const broken: string[] = [];
    for (const id of ids) {
      const run = loadRun(id);
      const context = planContext(realContextInput(run.digest));
      const { buildableCm, knowledge } = context;
      const block = {
        x: buildableCm.x0 * 10,
        y: buildableCm.y0 * 10,
        widthMm: (buildableCm.x1 - buildableCm.x0) * 10,
        depthMm: (buildableCm.y1 - buildableCm.y0) * 10,
      };
      const cellMm = knowledge.sketch_grid.cell_m * 1000;
      for (const [round, raw] of Object.entries(run.intents)) {
        for (const sketch of (raw as HouseIntent).sketches ?? []) {
          const grid = sketch.rows.map((r) => r.trim().split(/\s+/));
          if (
            grid.length !== knowledge.sketch_grid.rows ||
            grid.some((line) => line.length !== knowledge.sketch_grid.columns)
          )
            continue;
          const roomIds = [...new Set(grid.flat())].filter((cell) => cell !== '.');
          const count = (room: string) => grid.flat().filter((cell) => cell === room).length;
          const box = (room: string) => {
            const rs = grid.flatMap((line, r) => (line.includes(room) ? [r] : []));
            const cs = grid.flatMap((line) => line.flatMap((c, i) => (c === room ? [i] : [])));
            return (
              (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...cs) - Math.min(...cs) + 1)
            );
          };
          if (roomIds.some((room) => count(room) !== box(room))) continue;
          const out = layoutToIntent(
            layout(
              roomIds.map((room) => [
                room,
                String(sketch.level),
                rectFromSketch(sketch.rows, room, block)!,
              ]),
            ),
            {
              block,
              cellMm,
              wallM: 0.22,
              program: roomIds.map((room) => row(room, 'living', String(sketch.level))),
              spec: layoutKb.houseProgram,
            },
          );
          checked += 1;
          if (
            out.intent.sketches![0]!.rows.join('\n') !==
            grid.map((line) => line.join(' ')).join('\n')
          )
            broken.push(`${id} ${round} tầng ${sketch.level}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(broken).toEqual([]);
  });
});

describe('chế độ hình chữ nhật đầu-cuối (client giả, lượt thật 182665ea)', () => {
  it('thân lời gọi là <rules><knowledge><brief> của tài liệu; câu trả lời v5 đi qua bộ xếp', async () => {
    const run = loadRun('182665ea');
    const input = {
      ...realContextInput(run.digest, { stairShape: true, openSetback: true }),
      ...layoutKb,
      geometry: 'rect' as const,
    };
    const context = planContext(input);
    expect(context.geometry).toBe('rect');
    expect(context.knowledge.sketch_grid.cell_m).toBe(0.5);
    const full = mergeRevision(
      run.intents.round2 as HouseIntent,
      run.intents.round3 as HouseIntent,
      [],
    );
    const answer = layoutFromRecorded(full, context.layout!.program, context.blockMm);
    const seen: StructuredCallOptions[] = [];
    const client: TextModelClient = {
      complete: async (_route, _dc, options) => {
        seen.push(options);
        return {
          json: answer,
          provider: 'fake',
          model: 'fake',
          usage: { inputTokens: null, outputTokens: null },
          latencyMs: 0,
        };
      },
    };
    const attempt = await callHouseModel({ client, route: 'fake', prompts, context });

    const prompt = seen[0]!.prompt;
    expect(prompt.startsWith('<rules>\n1 Use exactly the rooms of knowledge.program')).toBe(true);
    expect(prompt).toMatch(/<\/rules>\n<knowledge>\{"site":\{"lot_mm":\[15000,20000\]/);
    expect(prompt).toContain('"program":[["ngu_ob","Phòng ngủ ông bà');
    expect(prompt).not.toContain('## Khu đất');
    expect(prompt).toContain('## Lời gia chủ (nguyên văn)');
    for (const gone of [
      'sketch',
      'min_cells',
      'served_from',
      'room_area_m2',
      'elevator',
      'light_well',
      'shop',
    ])
      expect(`${seen[0]!.system}${prompt}`, gone).not.toContain(gone);
    expect(seen[0]!.system).toContain('design_notes');

    expect(attempt.issues).toEqual([]);
    const intent = attempt.intent!;
    expect(intent.rooms.some((room) => room.id === 'ngu_ob')).toBe(true);
    const result = evaluateHouseBest(
      input,
      context,
      intent,
      programGenerator(FAKE_CALL, 'fake', prompts.version, false),
      promptsFor(context, prompts),
    );
    expect(result.ok || result.rejections.length > 0).toBeTruthy();
  }, 120_000);
});

describe('câu nhắc chế độ hình chữ nhật', () => {
  const context = planContext({
    ...realContextInput(loadRun('182665ea').digest),
    ...layoutKb,
    geometry: 'rect',
  });
  const merged = promptsFor(context, prompts).floorLevel;

  it('không câu nào còn nói ô, hàng, cột, bản phác hay quan hệ `adjacent`', () => {
    const bad = Object.entries({ ...merged.hints, ...merged.scoreHints })
      .filter(([, line]) => /sketch|\bcells?\b|\brows?\b|\bcolumns?\b|adjacent|grid/i.test(line))
      .map(([code]) => code);
    expect(bad).toEqual([]);
    expect(merged.system).not.toMatch(/sketch|\bcells?\b/i);
    expect(merged.revise).not.toMatch(/sketch|\bcells?\b/i);
  });

  it('câu nhắc mang số luật mô hình thấy ở <rules>', () => {
    expect(merged.ruleOf?.program_brief).toBe(1);
    expect(merged.ruleOf?.rect_outside_block).toBe(2);
  });

  it('tham số ô của lỗi đổi sang mm theo toạ độ LÔ', () => {
    const out = gridParamsInMm(
      {
        rows: '3–5',
        cols: '2–4',
        need_cells: 8,
        door_cells: 2,
        detail:
          '"bedroom_1" (rows 3–5, columns 2–4) touches "wc_1"; the nearest corridor is 2 cells away.',
        line: 'between columns 6 and 7',
      },
      { x: 500, y: 500, ox: 2000, oy: 4000 },
    );
    expect(out.rect).toBe('[2500, 5000, 1500, 1500]');
    expect(out.need_m2).toBe(2);
    expect(out.door_mm).toBe(1000);
    expect(out.detail).toBe(
      '"bedroom_1" (x 2500–4000 mm, y 5000–6500 mm) touches "wc_1"; the nearest corridor is 1000 mm away.',
    );
    expect(out.line).toBe('at x = 5000 mm');
  });
});
