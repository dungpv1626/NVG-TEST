/**
 * Bộ đổi phương ngữ JSON Schema — ba nhà cung cấp, ba tập con khác nhau.
 *
 * Sai một chi tiết là lời gọi bị 400 với câu tiếng Anh, hoặc tệ hơn: được nhận nhưng ràng
 * buộc bị bỏ qua trong im lặng. Bộ này ghim từng khác biệt đã đọc từ tài liệu ba nhà cung cấp
 * ngày 08/09/2026, và một tính chất chung: bộ đổi chỉ NỚI, không bao giờ thêm ràng buộc.
 */

import { describe, expect, it } from 'vitest';
import { SchemaDialectError, schemaFor } from '../llm/schema-dialect';

/** Lược đồ độc lập nhà cung cấp, có đủ thứ dễ vỡ: tuỳ chọn, enum, $ref, ràng buộc số, oneOf. */
const PORTABLE = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['name', 'kind'],
  properties: {
    name: { type: 'string', minLength: 1, pattern: '^[a-z]+$' },
    kind: { type: 'string', enum: ['a', 'b'] },
    area: { type: 'number', minimum: 0, maximum: 500 },
    level: { type: ['integer', 'null'] },
    shape: { $ref: '#/$defs/shape' },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
    pick: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  },
  $defs: { shape: { type: 'string', enum: ['L', 'U'] } },
} as const;

describe('OpenAI strict', () => {
  const out = schemaFor('openai', PORTABLE as never) as Record<string, unknown>;
  const props = out.properties as Record<string, Record<string, unknown>>;

  it('mọi property đều bắt buộc, trường tuỳ chọn diễn đạt bằng null', () => {
    expect((out.required as string[]).sort()).toEqual(Object.keys(props).sort());
    expect(props.area!.type).toEqual(['number', 'null']);
    expect(props.level!.type).toEqual(['integer', 'null']);
    // Enum tuỳ chọn thêm null vào cả `type` lẫn `enum`.
    expect(props.shape!.anyOf).toEqual([{ $ref: '#/$defs/shape' }, { type: 'null' }]);
  });

  it('bỏ ràng buộc số và chuỗi — chúng nằm ở Zod phía mình', () => {
    for (const key of ['minimum', 'maximum']) expect(props.area).not.toHaveProperty(key);
    for (const key of ['minLength', 'pattern']) expect(props.name).not.toHaveProperty(key);
    for (const key of ['minItems', 'maxItems']) expect(props.tags).not.toHaveProperty(key);
    expect(out).not.toHaveProperty('$schema');
  });

  it('`oneOf` đổi thành `anyOf`, `additionalProperties: false` ở mọi object', () => {
    expect(props.pick!.anyOf).toBeTruthy();
    expect(props.pick).not.toHaveProperty('oneOf');
    expect(out.additionalProperties).toBe(false);
  });

  it('trường bắt buộc KHÔNG bị thêm null — không nới quá tay', () => {
    expect(props.name!.type).toBe('string');
    expect(props.kind!.enum).toEqual(['a', 'b']);
  });
});

describe('Anthropic', () => {
  const out = schemaFor('anthropic', PORTABLE as never) as Record<string, unknown>;
  const props = out.properties as Record<string, Record<string, unknown>>;

  it('giữ nguyên `required`, thêm `additionalProperties: false`, bỏ ràng buộc số/độ dài', () => {
    expect(out.required).toEqual(['name', 'kind']);
    expect(out.additionalProperties).toBe(false);
    expect(props.area).toEqual({ type: 'number' });
    expect(props.name).toEqual({ type: 'string' });
  });
});

describe('Gemini responseSchema', () => {
  const out = schemaFor('gemini', PORTABLE as never) as Record<string, unknown>;
  const props = out.properties as Record<string, Record<string, unknown>>;

  it('nhúng $ref, bỏ $defs và additionalProperties', () => {
    expect(out).not.toHaveProperty('$defs');
    expect(out).not.toHaveProperty('additionalProperties');
    expect(props.shape).toEqual({ type: 'string', enum: ['L', 'U'] });
  });

  it('kiểu là MỘT chuỗi; null diễn đạt bằng `nullable: true`', () => {
    expect(props.level).toEqual({ type: 'integer', nullable: true });
  });

  it('giữ được minimum/maximum/minItems/maxItems — Gemini nhận chúng', () => {
    expect(props.area).toEqual({ type: 'number', minimum: 0, maximum: 500 });
    expect(props.tags).toMatchObject({ minItems: 1, maxItems: 5 });
    expect(props.name).toEqual({ type: 'string' }); // pattern/minLength thì bỏ
  });

  it('lược đồ đệ quy thì nói ra, không lặp vô hạn', () => {
    const recursive = {
      type: 'object',
      properties: { child: { $ref: '#/$defs/node' } },
      $defs: { node: { type: 'object', properties: { child: { $ref: '#/$defs/node' } } } },
    };
    expect(() => schemaFor('gemini', recursive)).toThrow(SchemaDialectError);
  });
});

describe('Không THÊM ràng buộc trong im lặng', () => {
  it('object kiểu bản đồ (additionalProperties là lược đồ) thì nói ra, không ép thành object đóng', () => {
    const map = {
      type: 'object',
      properties: { adjacent: { type: 'object', additionalProperties: { type: 'string' } } },
    };
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      expect(() => schemaFor(provider, map), provider).toThrow(SchemaDialectError);
    }
  });
});

describe('Không đụng đầu vào', () => {
  it('trả về bản sao — lược đồ gốc dùng lại được cho nhà cung cấp khác', () => {
    const before = JSON.stringify(PORTABLE);
    schemaFor('openai', PORTABLE as never);
    schemaFor('gemini', PORTABLE as never);
    expect(JSON.stringify(PORTABLE)).toBe(before);
  });
});
