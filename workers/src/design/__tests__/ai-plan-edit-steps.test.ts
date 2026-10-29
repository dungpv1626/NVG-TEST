/**
 * Bước Workflow của lượt sửa theo yêu cầu kỹ sư (T53): gọi mô hình với bảng bản vẽ, áp thao tác, ghi bản
 * sửa trỏ bản gốc. Client mô hình và kho artifact đều GIẢ — không chạm mạng, không tốn tiền.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlan, AiPlanEdit } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import type { TextModelClient } from '../llm/text-client';
import {
  applyEditStep,
  proposeEdit,
  type AiDesignParams,
  type EditCallOutcome,
  type PlanStepDeps,
} from '../workflows/ai-design-steps';
import { FAKE_CALL, loadRun, prompts, savedPlan } from './ai-real-context';

const run = loadRun('58688ead');
const base = savedPlan(run, 'round4');
const BASE_ID = `sha256:${'e'.repeat(64)}`;
const PROGRAM_ID = base.plan.program_ref;

function depsWith(answer: AiPlanEdit) {
  const prompts_: string[] = [];
  const writes: { kind: string; payload: unknown; inputs: string[]; params: unknown }[] = [];
  const inserts: Record<string, unknown>[] = [];
  const client: TextModelClient = {
    async complete(_route, _dc, options) {
      prompts_.push(options.prompt);
      return { json: answer, ...FAKE_CALL, usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
  const repo = {
    db: {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return { error: null };
        },
      }),
    },
    get: async (id: string) =>
      id === BASE_ID
        ? { id, kind: 'ai_floor_plan', payload: base.plan, createdAt: '' }
        : id === PROGRAM_ID
          ? { id, kind: 'ai_space_program', payload: base.program, createdAt: '' }
          : null,
    write: async (input: { kind: string; payload: unknown; inputs: string[]; params: unknown }) => {
      writes.push(input);
      return { id: `sha256:${'f'.repeat(64)}`, reused: false };
    },
  };
  const deps = {
    ...base.input,
    client,
    prompts,
    repo,
    provider: 'fake',
    model: 'fake-1',
  } as unknown as PlanStepDeps;
  return { deps, prompts: prompts_, writes, inserts };
}

const PARAMS: AiDesignParams = {
  runId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  companyId: '00000000-0000-4000-8000-000000000003',
  projectId: '00000000-0000-4000-8000-000000000004',
  actorId: null,
  discipline: 'kien_truc',
  stage: 'plan',
  textRoute: 'ai_text_fake',
  briefRef: `sha256:${'c'.repeat(64)}`,
  digest: run.digest,
  rulePacks: { standards: false, experience: false },
  variants: [{ id: 'AI-A', label: 'AI-A', strategy: '' }],
  edit: {
    baseArtifactId: BASE_ID,
    instruction: 'Cửa phòng ngủ 1 chuyển qua góc bên phải, mặt hành lang',
  },
};
const VARIANT = PARAMS.variants[0]!;

const nulls = {
  room: null,
  from: null,
  to: null,
  a: null,
  b: null,
  place: null,
  area_m2: null,
  delta_m: null,
  on: null,
  request: null,
};
const MOVE_DOOR: AiPlanEdit = {
  ops: [
    {
      ...nulls,
      op: 'move_door',
      level: 1,
      room: 'bedroom_1',
      to: 'circulation_1',
      place: 'end',
    },
  ],
  unsupported: [],
  explanation: 'Dời cửa phòng ngủ 1 về cuối vách hành lang.',
};

const outcomeOf = (edit: AiPlanEdit): EditCallOutcome => ({
  editJson: JSON.stringify(edit),
  issues: [],
  call: FAKE_CALL,
});

describe('proposeEdit', () => {
  it('gửi bảng bản vẽ + nguyên văn yêu cầu, KHÔNG gửi đầu bài; ghi nhật ký mục đích riêng', async () => {
    const { deps, prompts: sent, inserts } = depsWith(MOVE_DOOR);
    const outcome = await proposeEdit(deps, PARAMS, null);
    expect(outcome.editJson).not.toBeNull();
    expect(sent[0]).toContain('<plan>');
    expect(sent[0]).toContain('bedroom_1 |');
    expect(sent[0]).toContain('Cửa phòng ngủ 1 chuyển qua góc bên phải');
    expect(sent[0]).not.toContain('<brief>');
    expect(inserts[0]?.purpose).toBe('plan_house_edit');
  });

  it('lượt gọi lại mang thao tác cũ và lý do cổng', async () => {
    const { deps, prompts: sent } = depsWith(MOVE_DOOR);
    await proposeEdit(deps, PARAMS, {
      opsJson: JSON.stringify(MOVE_DOOR.ops),
      issues: ['Phòng "bedroom_1" không có cửa'],
    });
    expect(sent[0]).toContain('could not be applied');
    expect(sent[0]).toContain('Phòng "bedroom_1" không có cửa');
  });
});

describe('applyEditStep', () => {
  it('áp được: ghi MỘT mặt bằng trỏ bản gốc + chương trình cũ, nhãn «sửa 1», ghi chú thao tác', async () => {
    const { deps, writes } = depsWith(MOVE_DOOR);
    const result = await applyEditStep(deps, PARAMS, VARIANT, outcomeOf(MOVE_DOOR));
    expect('written' in result).toBe(true);
    expect(writes).toHaveLength(1);
    const plan = writes[0]!.payload as AiFloorPlan;
    expect(writes[0]!.kind).toBe('ai_floor_plan');
    expect(writes[0]!.inputs).toEqual([BASE_ID, PROGRAM_ID]);
    expect(plan.generator.edit?.base_ref).toBe(BASE_ID);
    expect(plan.variant_label).toMatch(/· sửa 1$/);
    expect(plan.house_intent).toHaveProperty('sketches');
    if ('written' in result) {
      expect(result.written.notes.map((note) => note.code)).toContain('edit_applied');
      expect(result.written.acceptPercent).toBe(60);
    }
  });

  it('dời vách: chương trình không đổi — chỉ ghi một mặt bằng', async () => {
    const wall: AiPlanEdit = {
      ops: [{ ...nulls, op: 'move_wall', level: 1, a: 'bedroom_1', b: 'wc_2', delta_m: 0.3 }],
      unsupported: [],
      explanation: '',
    };
    const { deps, writes } = depsWith(wall);
    const result = await applyEditStep(deps, PARAMS, VARIANT, outcomeOf(wall));
    expect('written' in result).toBe(true);
    expect(writes.map((write) => write.kind)).toEqual(['ai_floor_plan']);
  });

  it('cần xếp lại bố cục: là lỗi của lượt sửa — không ghi gì, KHÔNG trả ý định cho vòng `revise` (T184)', async () => {
    const relayout: AiPlanEdit = {
      ops: [{ ...nulls, op: 'relayout', level: 1, request: 'Move the kitchen to the front.' }],
      unsupported: [],
      explanation: '',
    };
    const { deps, writes } = depsWith(relayout);
    const result = await applyEditStep(deps, PARAMS, VARIANT, outcomeOf(relayout));
    expect(writes).toHaveLength(0);
    expect('relayout' in result).toBe(false);
    // Câu lỗi nói tầng, yêu cầu, và phải làm gì; còn thao tác để lời gọi lại (rẻ) nhận phản hồi.
    expect('rejected' in result && result.rejected.join(' ')).toMatch(
      /tầng 1 cần xếp lại bố cục .*Move the kitchen to the front.*không xếp lại cả tầng.*«Xếp mặt bằng»/,
    );
    expect('rejected' in result && result.opsJson).not.toBeNull();
  });

  it('bản sửa không qua cổng: câu lỗi nêu ĐÚNG thao tác làm hỏng và luật nó phá (T184)', async () => {
    const breaking: AiPlanEdit = {
      ops: [
        { ...nulls, op: 'window', level: 1, room: 'bedroom_1', on: true },
        { ...nulls, op: 'move_wall', level: 1, a: 'bedroom_1', b: 'wc_2', delta_m: 3 },
      ],
      unsupported: [],
      explanation: '',
    };
    const { deps, writes } = depsWith(breaking);
    const result = await applyEditStep(deps, PARAMS, VARIANT, outcomeOf(breaking));
    expect(writes).toHaveLength(0);
    const message = 'rejected' in result ? result.rejected.join(' ') : '';
    expect(message).toMatch(
      /^Thao tác «tầng 1: dời vách giữa "bedroom_1" và "wc_2" 3 m về phía "wc_2"» làm bản vẽ không qua cổng: .+/,
    );
    expect(message).toContain('(1 thao tác trước nó vẫn áp được.)');
    expect('rejected' in result && result.opsJson).not.toBeNull();
  });

  it('thao tác không áp được: không ghi, trả lý do và thao tác để gọi lại', async () => {
    const bad: AiPlanEdit = {
      ops: [{ ...nulls, op: 'swap_rooms', level: 1, a: 'stair_1', b: 'wc_2' }],
      unsupported: [],
      explanation: '',
    };
    const { deps, writes } = depsWith(bad);
    const result = await applyEditStep(deps, PARAMS, VARIANT, outcomeOf(bad));
    expect(writes).toHaveLength(0);
    expect('rejected' in result && result.rejected.join(' ')).toMatch(/ô thang/);
    expect('rejected' in result && result.opsJson).not.toBeNull();
  });

  it('không có thao tác nào: nói lại phần AI không làm được, không gọi lại', async () => {
    const none: AiPlanEdit = {
      ops: [],
      unsupported: ['Không rõ «góc kia» là góc nào.'],
      explanation: '',
    };
    const { deps } = depsWith(none);
    const result = await applyEditStep(deps, PARAMS, VARIANT, outcomeOf(none));
    expect('rejected' in result && result.rejected[0]).toMatch(/góc kia/);
    expect('rejected' in result && result.opsJson).toBeNull();
  });
});

describe('lời dẫn lượt sửa — gọn', () => {
  it('bảng bản vẽ biệt thự 26 phòng + lời dẫn hệ thống dưới 4.500 ký tự; mọi phòng có cửa trong bảng', async () => {
    const { deps, prompts: sent } = depsWith(MOVE_DOOR);
    await proposeEdit(deps, PARAMS, null);
    // Đo 17/09/2026: bảng ≈ 2.100, lời dẫn hệ thống 1.333 ký tự.
    expect(sent[0]!.length + prompts.planEdit.system.length).toBeLessThan(4_500);
    const doorLines = sent[0]!.split('\n').filter((line) => line.startsWith('doors: '));
    for (const id of ['bedroom_5', 'study_1', 'altar_room_1', 'bedroom_2']) {
      expect(doorLines.join(' '), id).toContain(id);
    }
  });
});

describe('lượt sửa không bao giờ rơi vào vòng xếp lại cả nhà (T184)', () => {
  // Lượt thật 29/10/2026 (hồ sơ 9272): AI trả thao tác `relayout`, Workflow chuyển sang `runVariant` — năm lời gọi
  // `plan_house_revise`, 0,589 USD, không lưu gì, trong khi màn hình hứa «một lượt gọi, thêm tối đa ba lượt». Phép thử Workflow
  // không chạy được ngoài runtime Workers, nên canh bằng mã nguồn: thân `runEdit` không gọi vòng xếp lại.
  const source = readFileSync(
    fileURLToPath(new URL('../workflows/ai-design.ts', import.meta.url)),
    'utf8',
  );
  const start = source.indexOf('private async runEdit(');
  const end = source.indexOf('private async writeBest(', start);
  const body = source.slice(start, end);

  it('thân runEdit tìm được', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it('runEdit chỉ gọi mô hình sửa (`proposeEdit`), không gọi `runVariant` / vòng `revise`', () => {
    expect(body).toContain('proposeEdit(');
    expect(body).not.toMatch(/runVariant|plan_house_revise|previousJson/);
    // Số lời gọi tối đa đọc từ thước chấm (`kb/plan_quality.yaml` `edit_calls_max`), không viết số trong mã.
    expect(body).toContain('deps.quality.editCallsMax');
  });
});
