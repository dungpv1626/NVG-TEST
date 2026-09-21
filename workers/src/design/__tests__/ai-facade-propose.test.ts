/**
 * Ý tưởng mặt đứng (T59): phép kiểm, lượt gọi mô hình và hai bước của lượt chạy nền — KHÔNG chạm
 * mạng. Mô hình giả trả ý tưởng viết tay của `ai-facade-fixtures.ts`.
 *
 * Điều cần canh nhất:
 *  · khung KHOÁ đi vào lời dẫn đúng như mặt bằng — mô hình không đoán lỗ mở;
 *  · mảng trang trí đè lên cửa và mã ngoài danh mục bị bắt TRƯỚC khi lưu;
 *  · lượt nào cũng ghi nhật ký chi phí, kể cả lượt trả về không dùng được.
 */

import { aiFacadeConceptSchema, type AiFacadeProposal } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { checkFacade } from '../ai/facade/check';
import { facadeFrame } from '../ai/facade/frame';
import { callFacadeModel, facadeFrameText } from '../ai/facade/propose';
import type { TextModelClient } from '../llm/text-client';
import {
  proposeFacadeStep,
  writeFacadeStep,
  type FacadeStepDeps,
} from '../workflows/ai-facade-steps';
import type { AiDesignParams } from '../workflows/ai-design-steps';
import {
  facadeVocab,
  norms,
  outdoor,
  shiftBack,
  TOWNHOUSE_PROPOSAL,
  VILLA_PROPOSAL,
} from './ai-facade-fixtures';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';
import { FAKE_CALL, loadRun, prompts, read } from './ai-real-context';
import { parseFacadeQuality } from '../ai/facade/quality';

const frame = facadeFrame(TOWNHOUSE_PLAN, norms, outdoor);
const facadeQuality = parseFacadeQuality(read('kb/facade_quality.yaml'));
const digest = loadRun('58688ead').digest;

const withElement = (element: AiFacadeProposal['elements'][number]): AiFacadeProposal => ({
  ...TOWNHOUSE_PROPOSAL,
  elements: [element],
});

describe('Phép kiểm ý tưởng mặt đứng', () => {
  it('ý tưởng mẫu qua được', () => {
    expect(checkFacade(TOWNHOUSE_PROPOSAL, frame, facadeVocab)).toEqual([]);
    const villa = facadeFrame(shiftBack(VILLA_PLAN, 500), norms, outdoor);
    expect(checkFacade(VILLA_PROPOSAL, villa, facadeVocab)).toEqual([]);
  });

  it('mã ngoài danh mục bị bắt, nói rõ mã nào', () => {
    const issues = checkFacade(
      { ...TOWNHOUSE_PROPOSAL, roof: { ...TOWNHOUSE_PROPOSAL.roof, material: 'ngoi_vang' } },
      frame,
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/ngoi_vang/);
  });

  it('mái dốc: chóp trang trí trên đường mái được phép, không bị coi là ngoài khung', () => {
    // Trần của mảng trang trí phải là trần của MÁI. Lấy đỉnh tường chắn mái làm trần thì mọi thứ
    // nằm trên mái dốc đều bị loại, kể cả loại kỹ sư yêu cầu — và mỗi lượt thử lại là tiền thật.
    const pitched: AiFacadeProposal = {
      ...TOWNHOUSE_PROPOSAL,
      roof: { type: 'japanese', pitch_deg: 30, material: 'ngoi_phang', colour: 'xam_dam' },
      elements: [{ kind: 'finial', rect: [190, 1230, 210, 1300], material_ref: 1 }],
    };
    expect(checkFacade(pitched, frame, facadeVocab)).toEqual([]);
    // Mái bằng thì trần vẫn là đỉnh tường chắn mái — mảng bay trên trời vẫn bị bắt.
    expect(
      checkFacade(
        withElement({ kind: 'finial', rect: [190, 1230, 210, 1300], material_ref: 1 }),
        frame,
        facadeVocab,
      ).join(' '),
    ).toMatch(/nằm ngoài khung mặt đứng/);
  });

  it('mảng ốp đè lên cửa để xe thì bị bắt — lỗ mở là dữ liệu KHOÁ của mặt bằng', () => {
    const issues = checkFacade(
      withElement({ kind: 'cladding', rect: [100, 50, 200, 150], material_ref: 1 }),
      frame,
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/đè lên lỗ mở tầng 1/);
  });

  it('ô văng và lam được phép đè lên cửa', () => {
    for (const kind of ['canopy', 'louvre'] as const) {
      expect(
        checkFacade(
          withElement({ kind, rect: [100, 50, 200, 150], material_ref: 1 }),
          frame,
          facadeVocab,
        ),
      ).toEqual([]);
    }
  });

  it('mảng nằm ngoài khung, chữ nhật ngược, material_ref lạc đều bị bắt', () => {
    const outside = checkFacade(
      withElement({ kind: 'planter', rect: [900, 0, 1000, 50], material_ref: null }),
      frame,
      facadeVocab,
    );
    expect(outside.join(' ')).toMatch(/ngoài khung/);
    const flipped = checkFacade(
      withElement({ kind: 'cornice', rect: [200, 50, 100, 60], material_ref: null }),
      frame,
      facadeVocab,
    );
    expect(flipped.join(' ')).toMatch(/x1 > x0/);
    const dangling = checkFacade(
      withElement({ kind: 'cornice', rect: [0, 1000, 400, 1010], material_ref: 9 }),
      frame,
      facadeVocab,
    );
    expect(dangling.join(' ')).toMatch(/material_ref 9/);
  });

  it('thiếu vật liệu thân nhà, hoặc có ban công mà không chọn lan can, thì bị bắt', () => {
    const issues = checkFacade(
      {
        ...TOWNHOUSE_PROPOSAL,
        materials: TOWNHOUSE_PROPOSAL.materials.filter((m) => m.where !== 'body'),
        balcony_railing: null,
        elements: [],
      },
      frame,
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/thân nhà/);
    expect(issues.join(' ')).toMatch(/lan can/);
  });

  it('mái hỗn hợp phải khai đường mái', () => {
    const issues = checkFacade(
      { ...TOWNHOUSE_PROPOSAL, roof: { ...TOWNHOUSE_PROPOSAL.roof, type: 'mixed', pitch_deg: 20 } },
      frame,
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/hỗn hợp/);
  });

  it('nhà sát ranh mà mô hình khai cổng — KHÔNG bắt gọi lại tốn tiền, hàm ghép tự bỏ', () => {
    const withGate = {
      ...TOWNHOUSE_PROPOSAL,
      gate: VILLA_PROPOSAL.gate,
      fence: VILLA_PROPOSAL.fence,
    };
    expect(checkFacade(withGate, frame, facadeVocab)).toEqual([]);
  });

  it('cổng cao quá giới hạn dựng được thì bị bắt', () => {
    const villa = facadeFrame(shiftBack(VILLA_PLAN, 500), norms, outdoor);
    const issues = checkFacade(
      { ...VILLA_PROPOSAL, gate: { ...VILLA_PROPOSAL.gate!, h: 2000 } },
      villa,
      facadeVocab,
    );
    expect(issues.join(' ')).toMatch(/Cổng cao 2000/);
  });
});

function fakeClient(answer: unknown) {
  const calls: { prompt: string; system: string; dataClass: number; schema: unknown }[] = [];
  const client: TextModelClient = {
    async complete(_route, dataClass, options) {
      calls.push({
        prompt: options.prompt,
        system: options.system ?? '',
        dataClass,
        schema: options.schema,
      });
      return { json: answer, ...FAKE_CALL, usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
  return { client, calls };
}

describe('Lượt gọi mô hình', () => {
  it('lời dẫn mang khung KHOÁ đúng như mặt bằng, danh mục mã và dữ liệu hạng 2', async () => {
    const { client, calls } = fakeClient(TOWNHOUSE_PROPOSAL);
    const attempt = await callFacadeModel({
      client,
      route: 'ai_text_fake',
      prompts,
      digest,
      frame,
      vocab: facadeVocab,
    });
    expect(attempt.proposal).toEqual(TOWNHOUSE_PROPOSAL);
    const [call] = calls;
    expect(call?.dataClass).toBe(2);
    expect(call?.prompt).toContain('storey 1, garage, x 50–350, z 0–250');
    expect(call?.prompt).toContain('LOCKED balconies');
    expect(call?.prompt).toContain('son_nuoc — smooth exterior paint on render');
    expect(call?.prompt).toContain('Front yard: no');
    expect(JSON.stringify(call?.schema)).toContain('balcony_railing');
  });

  it('câu trả lời sai hợp đồng: không ném, trả lỗi để lớp gọi quyết gọi lại', async () => {
    const { client } = fakeClient({ style: 'hien_dai' });
    const attempt = await callFacadeModel({
      client,
      route: 'ai_text_fake',
      prompts,
      digest,
      frame,
      vocab: facadeVocab,
    });
    expect(attempt.proposal).toBeNull();
    expect(attempt.issues[0]).toMatch(/Sai cấu trúc/);
  });

  it('lượt gọi lại nối lý do vào CUỐI, phần đầu giữ nguyên từng byte (bộ nhớ đệm nhà cung cấp)', async () => {
    const first = fakeClient(TOWNHOUSE_PROPOSAL);
    const second = fakeClient(TOWNHOUSE_PROPOSAL);
    const input = { route: 'ai_text_fake', prompts, digest, frame, vocab: facadeVocab };
    await callFacadeModel({ ...input, client: first.client });
    await callFacadeModel({
      ...input,
      client: second.client,
      retryIssues: ['Vật liệu mái: mã «x» không có trong danh mục.'],
    });
    const a = first.calls[0]!.prompt;
    const b = second.calls[0]!.prompt;
    expect(b.startsWith(a)).toBe(true);
    expect(b.slice(a.length)).toContain('- Vật liệu mái: mã «x» không có trong danh mục.');
  });

  it('khung dạng chữ ghi rõ khi nhà không có lỗ mở hay ban công', () => {
    const bare = { ...frame, openings: [], balconies: [] };
    expect(facadeFrameText(bare)).toMatch(/LOCKED openings[^\n]*\n- none/);
  });
});

const PLAN_REF = `sha256:${'d'.repeat(64)}`;
const PARAMS: AiDesignParams = {
  runId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  companyId: '00000000-0000-4000-8000-000000000003',
  projectId: '00000000-0000-4000-8000-000000000004',
  actorId: null,
  discipline: 'kien_truc',
  stage: 'facade',
  textRoute: 'ai_text_fake',
  briefRef: `sha256:${'c'.repeat(64)}`,
  digest,
  rulePacks: { standards: false, experience: false },
  variants: [],
  planRef: PLAN_REF,
};

function stepDeps(answer: unknown) {
  const inserts: Record<string, unknown>[] = [];
  const writes: Record<string, unknown>[] = [];
  const { client } = fakeClient(answer);
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
      id === PLAN_REF
        ? { id, kind: 'ai_floor_plan', payload: TOWNHOUSE_PLAN, createdAt: '' }
        : null,
    write: async (input: Record<string, unknown>) => {
      writes.push(input);
      return { id: `sha256:${'f'.repeat(64)}`, reused: false };
    },
  };
  const deps = {
    client,
    prompts,
    construction: norms,
    outdoor,
    vocab: facadeVocab,
    // Thước chấm điểm (T63): bước đề xuất chấm ngay trên ý tưởng vừa qua cổng để biết có cần gọi
    // lại vì ĐIỂM không, nên phép thử phải cấp thước thật.
    quality: facadeQuality,
    repo,
    provider: 'fake',
    model: 'fake-1',
  } as unknown as FacadeStepDeps;
  return { deps, inserts, writes };
}

describe('Hai bước của lượt chạy nền', () => {
  it('lượt gọi dùng được: ghi nhật ký «ok», trả ý tưởng', async () => {
    const { deps, inserts } = stepDeps(TOWNHOUSE_PROPOSAL);
    const outcome = await proposeFacadeStep(deps, PARAMS, 1, null);
    expect(outcome.proposalJson).not.toBeNull();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ purpose: 'facade', status: 'ok', data_class: 2 });
  });

  it('lượt trả về không dùng được: vẫn ghi nhật ký «rejected» — tiền đã tiêu', async () => {
    const bad = withElement({ kind: 'cladding', rect: [100, 50, 200, 150], material_ref: 1 });
    const { deps, inserts } = stepDeps(bad);
    const outcome = await proposeFacadeStep(deps, PARAMS, 2, ['lý do cũ']);
    expect(outcome.proposalJson).toBeNull();
    expect(outcome.issues.length).toBeGreaterThan(0);
    expect(inserts[0]).toMatchObject({ purpose: 'facade_revise', status: 'rejected' });
  });

  it('bước ghi đúc ai_facade_concept đúng hợp đồng, trỏ mặt bằng, đặt head', async () => {
    const { deps, writes } = stepDeps(TOWNHOUSE_PROPOSAL);
    const written = await writeFacadeStep(
      deps,
      PARAMS,
      JSON.stringify(TOWNHOUSE_PROPOSAL),
      FAKE_CALL,
      1,
    );
    expect(written.artifactId).toMatch(/^sha256:/);
    const [write] = writes;
    expect(write).toMatchObject({
      kind: 'ai_facade_concept',
      inputs: [PLAN_REF],
      step: 'ai_facade_propose',
    });
    expect(write?.setHead).not.toBe(false);
    const payload = aiFacadeConceptSchema.parse(write?.payload);
    expect(payload.plan_ref).toBe(PLAN_REF);
    expect(payload.generator.prompt_version).toBe(prompts.version);
    expect(payload.openings_front).toEqual(frame.openings);
  });
});
