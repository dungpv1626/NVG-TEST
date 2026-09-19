/**
 * Bộ đổi phương ngữ JSON Schema — ba nhà cung cấp, ba tập con khác nhau.
 *
 * Sai một chi tiết là lời gọi bị 400 với câu tiếng Anh, hoặc tệ hơn: được nhận nhưng ràng
 * buộc bị bỏ qua trong im lặng. Bộ này ghim từng khác biệt đã đọc từ tài liệu ba nhà cung cấp
 * ngày 08/09/2026, và một tính chất chung: bộ đổi chỉ NỚI, không bao giờ thêm ràng buộc.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SchemaDialectError, schemaFor } from '../llm/schema-dialect';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

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
    // `$ref` được nhúng trước, nên trường tuỳ chọn kiểu tham chiếu ra thẳng enum + null chứ
    // không còn `anyOf` bọc `$ref` — OpenAI strict từ chối mọi từ khoá đứng cạnh `$ref`.
    expect(props.shape).toEqual({ type: ['string', 'null'], enum: ['L', 'U', null] });
    expect(JSON.stringify(out)).not.toContain('$ref');
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

  it('`enum` kèm kiểu mảng có null → `anyOf` (Claude trả 400 cho dạng gộp, đo 17/09/2026)', () => {
    const place = {
      type: 'object',
      properties: { place: { type: ['string', 'null'], enum: ['start', 'end', null] } },
    };
    const sent = schemaFor('anthropic', place) as { properties: Record<string, unknown> };
    expect(sent.properties.place).toEqual({
      anyOf: [{ type: 'string', enum: ['start', 'end'] }, { type: 'null' }],
    });
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

  it('giữ được minimum/maximum của SỐ — Gemini nhận chúng', () => {
    expect(props.area).toEqual({ type: 'number', minimum: 0, maximum: 500 });
    expect(props.name).toEqual({ type: 'string' }); // pattern/minLength thì bỏ
  });

  it('bỏ minItems/maxItems — mảng lớn làm Gemini trả 400 không nói trường nào', () => {
    // Đo 08/09/2026: `maxItems: 40` trên mảng đối tượng đủ để hỏng cả lời gọi. Số lượng thật vẫn
    // do Zod chặn khi kết quả về, nên bỏ ở đây không mất gì.
    expect(props.tags).toEqual({ type: 'array', items: { type: 'string' } });
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

describe('`$ref` có từ khoá đứng cạnh', () => {
  // Gặp thật 08/09/2026 với `ai-space-program-proposal`: OpenAI trả 400
  // «$ref cannot have keywords {'description'}» và cả lượt lập chương trình không gian hỏng.
  // Đây là hình dạng bình thường của hợp đồng mình viết, nên phải chạy được ở cả ba nhà cung cấp.
  const withSibling = {
    type: 'object',
    required: ['id'],
    properties: {
      id: { $ref: '#/$defs/space_id', description: 'Mã tạm do mô hình đặt.' },
    },
    $defs: { space_id: { type: 'string', pattern: '^[a-z_]+$' } },
  };

  for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
    it(`${provider}: nhúng tham chiếu, giữ lời dặn, không còn $ref nào`, () => {
      const out = schemaFor(provider, withSibling);
      expect(JSON.stringify(out)).not.toContain('$ref');
      expect(out).not.toHaveProperty('$defs');
      const id = (out.properties as Record<string, Record<string, unknown>>).id!;
      expect(id.type).toBe('string');
      expect(id.description).toBe('Mã tạm do mô hình đặt.');
    });
  }
});

describe('Mọi hợp đồng gửi cho mô hình đều đổi được sang cả ba phương ngữ', () => {
  // Duyệt thư mục thay vì liệt kê tay: hợp đồng `ai-*` mới sinh ra ở các đợt sau (mặt bằng đề
  // xuất là cái tiếp theo), và người viết nó không có lý do gì để nhớ quay lại thêm vào đây.
  const files = readdirSync(root('contracts'))
    .filter((f) => f.startsWith('ai-') && f.endsWith('.schema.json'))
    .sort();

  it('có hợp đồng để duyệt', () => expect(files.length).toBeGreaterThan(0));

  for (const file of files) {
    const schema = JSON.parse(readFileSync(root(`contracts/${file}`), 'utf8')) as Record<
      string,
      unknown
    >;
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      it(`${file} → ${provider}`, () => {
        const out = schemaFor(provider, schema);
        const text = JSON.stringify(out);
        // `$ref` còn sót là 400 ở OpenAI strict và bị bỏ qua ở Gemini — hai kiểu hỏng khác nhau,
        // cùng một nguyên nhân.
        expect(text).not.toContain('$ref');
        // Gemini trả 400 cho `minItems`/`maxItems` trên mảng lớn, và câu lỗi KHÔNG nói trường nào
        // — không có cách nào lần ra từ thông báo, nên chặn ở đây.
        if (provider === 'gemini') {
          expect(text).not.toContain('minItems');
          expect(text).not.toContain('maxItems');
        }
      });
    }
  }
});

describe('Không đụng đầu vào', () => {
  it('trả về bản sao — lược đồ gốc dùng lại được cho nhà cung cấp khác', () => {
    const before = JSON.stringify(PORTABLE);
    schemaFor('openai', PORTABLE as never);
    schemaFor('gemini', PORTABLE as never);
    expect(JSON.stringify(PORTABLE)).toBe(before);
  });
});
