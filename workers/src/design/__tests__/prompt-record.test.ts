/**
 * Nguyên văn lời gọi mô hình — thứ kỹ sư tải về để đọc lại (13/09/2026).
 *
 * Canh ba điều: ghi ĐÚNG thứ đã gửi (kể cả lượt hỏng), bản ghi nằm cạnh ĐÚNG dòng nhật ký, và tệp
 * chữ có đủ ba phần theo thứ tự nhà cung cấp nhận.
 */

import { describe, expect, it } from 'vitest';
import { recordAiCall } from '../ai/call-log';
import {
  formatPromptText,
  promptKey,
  recordingClient,
  type PromptRecord,
} from '../ai/prompt-record';
import type { StructuredCallOptions, TextModelClient } from '../llm/text-client';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { $ref: '#/$defs/space_id' } },
  $defs: { space_id: { type: 'string', pattern: '^[a-z0-9_]+$' } },
};

const options = (prompt: string): StructuredCallOptions => ({
  system: 'You are a senior architect.',
  prompt,
  schema: SCHEMA,
  reasoningEffort: 'medium',
});

describe('recordingClient', () => {
  it('ghi mọi lời gọi theo thứ tự — kể cả lời gọi hỏng giữa chừng', async () => {
    let n = 0;
    const inner: TextModelClient = {
      async complete() {
        n += 1;
        if (n === 2) throw new Error('mạng rớt');
        return {
          json: {},
          provider: 'openai',
          model: 'gpt-5',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    const recorded = recordingClient(inner);
    await recorded.client.complete('ai_text_openai', 2, options('{"a":1}'));
    await recorded.client.complete('ai_text_openai', 2, options('{"a":2}')).catch(() => undefined);
    expect(recorded.records.map((r) => r.prompt)).toEqual(['{"a":1}', '{"a":2}']);
    expect(recorded.records[0]).toMatchObject({
      route: 'ai_text_openai',
      dataClass: 2,
      reasoningEffort: 'medium',
      imageCount: 0,
      output: {},
    });
    // Lời gọi hỏng không có đầu ra để ghi — vắng hẳn, không phải `null` giả.
    expect(recorded.records[1]).not.toHaveProperty('output');
  });
});

describe('recordAiCall lưu bản ghi cạnh dòng nhật ký', () => {
  function fakeDb() {
    const rows: Record<string, unknown>[] = [];
    return {
      rows,
      db: {
        from: () => ({
          insert: async (row: Record<string, unknown>) => {
            rows.push(row);
            return { error: null };
          },
        }),
      },
    };
  }
  const scope = {
    tenantId: 't',
    companyId: 'c',
    projectId: 'p1',
    discipline: 'kien_truc' as const,
    actorId: 'u',
  };
  const meta = { route: 'ai_text_openai', purpose: 'plan_level', dataClass: 2 as const };
  const record: PromptRecord = {
    version: 1,
    route: 'ai_text_openai',
    dataClass: 2,
    system: 's',
    prompt: 'p',
    schema: SCHEMA,
    reasoningEffort: null,
    maxOutputTokens: null,
    imageCount: 0,
  };
  const outcome = {
    provider: 'openai',
    model: 'gpt-5',
    usage: { inputTokens: 10, outputTokens: 20 },
    latencyMs: 5,
    status: 'ok' as const,
  };

  it('khoá trong kho mang ĐÚNG mã của dòng nhật ký', async () => {
    const { db, rows } = fakeDb();
    const puts: [string, string][] = [];
    await recordAiCall(db as never, scope, meta, { ...outcome, request: record }, undefined, {
      put: async (key, payload) => {
        puts.push([key, payload]);
        return key;
      },
    });
    expect(rows).toHaveLength(1);
    expect(typeof rows[0]!.id).toBe('string');
    expect(puts).toEqual([[promptKey('p1', rows[0]!.id as string), JSON.stringify(record)]]);
    expect('request' in rows[0]!).toBe(false);
  });

  it('kho hỏng thì nhật ký tiền vẫn ghi, không ném', async () => {
    const { db, rows } = fakeDb();
    await expect(
      recordAiCall(db as never, scope, meta, { ...outcome, request: record }, undefined, {
        put: async () => {
          throw new Error('kho đổ');
        },
      }),
    ).resolves.toEqual(expect.any(String));
    expect(rows).toHaveLength(1);
  });
});

describe('formatPromptText', () => {
  const meta = {
    createdAt: '2026-09-13T15:17:00Z',
    purpose: 'plan_level_resample',
    purposeLabel: 'Mặt bằng — xếp lại / sửa một tầng',
    provider: 'openai',
    model: 'gpt-5',
    promptVersion: '2.3.0',
    inputTokens: 5666,
    outputTokens: 31669,
    status: 'ok',
  };
  const record: PromptRecord = {
    version: 1,
    route: 'ai_text_openai',
    dataClass: 2,
    system: 'SYSTEM TEXT',
    prompt:
      '{"brief":{"floors":2},"knowledge":{"level":2}}\n\nREVISION. <previous_tree>{}</previous_tree>',
    schema: SCHEMA,
    reasoningEffort: 'medium',
    maxOutputTokens: null,
    imageCount: 0,
  };

  it('đủ ba phần theo thứ tự, JSON thụt lề, phần chữ nối sau giữ nguyên văn', () => {
    const text = formatPromptText(record, meta);
    const system = text.indexOf('1. LỜI DẪN HỆ THỐNG');
    const prompt = text.indexOf('2. THÂN LỜI GỌI');
    const schema = text.indexOf('3. LƯỢC ĐỒ ĐẦU RA BẮT BUỘC');
    expect(system).toBeGreaterThan(0);
    expect(prompt).toBeGreaterThan(system);
    expect(schema).toBeGreaterThan(prompt);
    expect(text).toContain('SYSTEM TEXT');
    expect(text).toContain('"floors": 2');
    expect(text).toContain('REVISION. <previous_tree>{}</previous_tree>');
    expect(text).toContain('Mức suy nghĩ      : medium');
    expect(text).toContain('Token vào / ra    : 5666 / 31669');
  });

  it('lược đồ in đúng phương ngữ đã gửi — OpenAI strict không có `pattern`, `$ref` đã nhúng', () => {
    const text = formatPromptText(record, meta);
    const schemaPart = text.slice(text.indexOf('3. LƯỢC ĐỒ ĐẦU RA BẮT BUỘC'));
    expect(schemaPart).toContain('phương ngữ đã gửi cho openai');
    expect(schemaPart).not.toContain('"pattern"');
    expect(schemaPart).not.toContain('$ref');
  });
});
