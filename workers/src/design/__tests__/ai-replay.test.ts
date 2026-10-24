/**
 * Phát lại một lượt mặt bằng đã ghi (T170) — tuyến chỉ có khi `AI_REPLAY=1`, đầu bài phải trùng đầu bài
 * của lượt ghi, client phát lại trả câu đã ghi theo thứ tự và dừng khi hết. KHÔNG chạm mạng, KHÔNG gọi mô
 * hình: hàng rào và lệnh mở lượt là bản giả.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiBriefDigest } from '@nvg/shared/design';
import { handlePlanReplay, REPLAY_DIGEST_MISMATCH, type ReplayRouteDeps } from '../ai/replay-route';
import { digestDifferences, normaliseDigest } from '../ai/replay-digest';
import { ReplayTextClient, replayClientForRound, type ReplaySource } from '../llm/replay';
import { LlmCallFailed } from '../llm/gemini';
import { lastRound, planClientFor } from '../workflows/ai-design-steps';
import type { TextModelClient } from '../llm/text-client';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/ai-run-46d6eff3.json', import.meta.url)), 'utf8'),
) as { digest: AiBriefDigest; intents: Record<string, unknown> };

const options = { system: 's', prompt: 'p', schema: {} };

/** Hàng rào + lệnh mở lượt GIẢ: ghi lại lệnh mở, digest của hồ sơ đặt theo từng phép thử. */
function fakes(currentDigest: unknown) {
  const launched: { replay: ReplaySource; textRoute: string }[] = [];
  const deps: ReplayRouteDeps = {
    prepare: () => Promise.resolve({ ok: { digest: currentDigest } }),
    launch: (replay, textRoute) => {
      launched.push({ replay, textRoute });
      return Promise.resolve({ runId: 'run-1', variants: [{ id: 'AI-A', label: 'A' }] });
    },
  };
  return { deps, launched };
}

const body = (extra: Record<string, unknown> = {}) => ({
  projectId: 'p-1',
  replayOf: '46d6eff3',
  digest: fixture.digest,
  outputs: [fixture.intents.round1],
  textRoute: 'ai_text_openai',
  ...extra,
});

describe('tuyến POST /plan/replay (T170)', () => {
  it('không có cờ, hay cờ khác "1", thì 404 và không mở lượt nào', async () => {
    const { deps, launched } = fakes(fixture.digest);
    for (const flag of [undefined, '0', 'true', '']) {
      const env = flag === undefined ? {} : { AI_REPLAY: flag };
      expect((await handlePlanReplay(env, 'token', body(), deps)).status).toBe(404);
    }
    expect(launched).toHaveLength(0);
  });

  it('đầu bài hồ sơ khác đầu bài lượt ghi thì 409 kèm đường dẫn chỗ khác', async () => {
    const changed = { ...structuredClone(fixture.digest), floors: 3 };
    const { deps, launched } = fakes(changed);
    const result = await handlePlanReplay({ AI_REPLAY: '1' }, 'token', body(), deps);
    expect(result.status).toBe(409);
    expect(result.body.error).toBe(REPLAY_DIGEST_MISMATCH);
    expect(result.body.differences).toEqual(['floors']);
    expect(launched).toHaveLength(0);
  });

  it('khác chỉ ở khoá mới bằng null / danh sách rỗng thì vẫn phát lại', async () => {
    const current = {
      ...structuredClone(fixture.digest),
      custom: [],
      balconies: { ...fixture.digest.balconies, main_front_depth_m: null },
    };
    const { deps, launched } = fakes(current);
    expect((await handlePlanReplay({ AI_REPLAY: '1' }, 'token', body(), deps)).status).toBe(202);
    expect(launched).toHaveLength(1);
  });

  it('đầu bài trùng thì mở lượt mang đúng câu trả lời đã ghi', async () => {
    const { deps, launched } = fakes(structuredClone(fixture.digest));
    const result = await handlePlanReplay({ AI_REPLAY: '1' }, 'token', body(), deps);
    expect(result.status).toBe(202);
    expect(result.body.replayOf).toBe('46d6eff3');
    expect(launched).toEqual([
      {
        replay: { of: '46d6eff3', outputs: [fixture.intents.round1] },
        textRoute: 'ai_text_openai',
      },
    ]);
  });

  it('chưa đăng nhập 401; mã lượt sai dạng hay số câu trả lời sai thì 400', async () => {
    const { deps, launched } = fakes(fixture.digest);
    const env = { AI_REPLAY: '1' };
    expect((await handlePlanReplay(env, null, body(), deps)).status).toBe(401);
    for (const extra of [
      { replayOf: '46D6EFF3' },
      { replayOf: '46d6eff' },
      { outputs: [] },
      { outputs: [1, 2, 3, 4, 5, 6] },
      { digest: null },
      { textRoute: '' },
    ]) {
      expect((await handlePlanReplay(env, 'token', body(extra), deps)).status).toBe(400);
    }
    expect(launched).toHaveLength(0);
  });

  it('hàng rào chung từ chối thì trả nguyên lỗi của nó', async () => {
    const deps: ReplayRouteDeps = {
      prepare: () =>
        Promise.resolve({ error: { body: { error: 'Không có quyền.' }, status: 403 } }),
      launch: () => Promise.reject(new Error('không được mở')),
    };
    const result = await handlePlanReplay({ AI_REPLAY: '1' }, 'token', body(), deps);
    expect(result.status).toBe(403);
  });
});

describe('đối chiếu đầu bài theo nghĩa (T170)', () => {
  const base = { floors: 2, style: 'hien_dai', balconies: { front: true }, custom: [{ a: 1 }] };

  it('khoá vắng ≡ null', () => {
    expect(
      digestDifferences(base, { ...base, balconies: { front: true, main_front_depth_m: null } }),
    ).toEqual([]);
  });

  it('mảng rỗng ≡ null', () => {
    expect(digestDifferences({ ...base, custom: null }, { ...base, custom: [] })).toEqual([]);
    expect(normaliseDigest({ a: [], b: null, c: undefined })).toEqual({});
  });

  it('khác một con số thì báo đúng đường dẫn', () => {
    expect(digestDifferences(base, { ...base, floors: 3 })).toEqual(['floors']);
  });

  it('khác một giá trị liệt kê thì báo đúng đường dẫn', () => {
    expect(digestDifferences(base, { ...base, style: 'tan_co_dien' })).toEqual(['style']);
  });

  it('thứ tự phần tử mảng phải khớp', () => {
    expect(digestDifferences({ list: [1, 2] }, { list: [2, 1] })).toEqual(['list[0]', 'list[1]']);
  });
});

describe('client phát lại (T170)', () => {
  const source = { of: '46d6eff3', outputs: [{ round: 1 }, { round: 2 }] };

  it('trả câu đã ghi theo thứ tự, không token, nhà cung cấp replay', async () => {
    const client = new ReplayTextClient(source);
    const first = await client.complete('ai_text_openai', 2, options);
    const second = await client.complete('ai_text_openai', 2, options);
    expect(first.json).toEqual({ round: 1 });
    expect(second.json).toEqual({ round: 2 });
    expect(first.provider).toBe('replay');
    expect(first.model).toBe('replay:46d6eff3');
    expect(first.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('hết câu đã ghi thì ném lỗi KHÔNG thử lại', async () => {
    const client = new ReplayTextClient(source, 2);
    const error = await client.complete('ai_text_openai', 2, options).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmCallFailed);
    expect((error as LlmCallFailed).retryable).toBe(false);
    expect((error as LlmCallFailed).message).toBe(
      'Hết câu trả lời đã ghi của lượt 46d6eff3 — phát lại dừng, không gọi mô hình.',
    );
  });

  it('client theo vòng không phụ thuộc số lần dựng (Workflow chạy lại run())', async () => {
    const round2 = replayClientForRound(source, 2);
    expect((await round2.complete('r', 2, options)).json).toEqual({ round: 2 });
    expect((await replayClientForRound(source, 2).complete('r', 2, options)).json).toEqual({
      round: 2,
    });
  });

  it('params có replay thì chọn client phát lại, không thì giữ client thật', async () => {
    const live: TextModelClient = { complete: () => Promise.reject(new Error('không được gọi')) };
    expect(planClientFor({}, 1, live)).toBe(live);
    expect(planClientFor({ replay: null }, 1, live)).toBe(live);
    const chosen = planClientFor({ replay: source }, 2, live);
    expect(chosen).toBeInstanceOf(ReplayTextClient);
    expect((await chosen.complete('r', 2, options)).json).toEqual({ round: 2 });
  });
});

describe('lastRound — phát lại hết câu ghi thì như hết lượt sửa (T170)', () => {
  const answers = (n: number) => ({ replay: { of: '46d6eff3', outputs: Array(n).fill({}) } });

  it('lượt thật: chỉ trần sửa quyết định', () => {
    expect(lastRound({} as never, 1)).toBe(false);
  });

  it('phát lại một câu: vòng 1 là vòng cuối — lưu bản đã xếp, không đòi câu thứ hai', () => {
    expect(lastRound(answers(1) as never, 1)).toBe(true);
  });

  it('phát lại hai câu: vòng 1 chưa phải vòng cuối, vòng 2 là vòng cuối', () => {
    expect(lastRound(answers(2) as never, 1)).toBe(false);
    expect(lastRound(answers(2) as never, 2)).toBe(true);
  });
});
