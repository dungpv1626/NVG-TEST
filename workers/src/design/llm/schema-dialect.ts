/**
 * Đổi một JSON Schema ĐỘC LẬP nhà cung cấp sang phương ngữ mà từng nhà cung cấp chấp nhận.
 *
 * Vì sao phải có: ba nhà cung cấp nhận ba tập con khác nhau của JSON Schema, và sai một chi
 * tiết là lời gọi bị từ chối bằng 400 với câu tiếng Anh khó đọc — hoặc tệ hơn, được chấp nhận
 * nhưng bỏ qua ràng buộc trong im lặng.
 *
 *  · OpenAI (`text.format.json_schema`, `strict: true`): mọi property phải nằm trong `required`
 *    (trường tuỳ chọn phải diễn đạt bằng `type: [T, 'null']`), mọi object phải có
 *    `additionalProperties: false`, và KHÔNG nhận ràng buộc số/độ dài/`pattern`/`format`.
 *  · Anthropic (`output_config.format.json_schema`): cần `additionalProperties: false`, KHÔNG
 *    nhận ràng buộc số/độ dài; trường tuỳ chọn giữ nguyên.
 *  · Gemini (`responseSchema`): tập con OpenAPI — KHÔNG có `$ref`/`$defs` (phải nhúng thẳng),
 *    KHÔNG có `additionalProperties`, kiểu chỉ là MỘT chuỗi, nullable diễn đạt bằng
 *    `nullable: true`, không có `oneOf`.
 *
 * Nguyên tắc: hàm này chỉ NỚI hoặc DIỄN ĐẠT LẠI, không bao giờ thêm ràng buộc. Ràng buộc số
 * thật sự (min/max, mẫu chuỗi) nằm ở Zod phía mình — mọi đầu ra mô hình đều đi qua đó sau khi
 * về, nên bỏ chúng khỏi lược đồ gửi đi không làm mất gì.
 */

export type SchemaProvider = 'openai' | 'anthropic' | 'gemini';

type Node = Record<string, unknown>;

/** Từ khoá mọi nhà cung cấp đều không cần — siêu dữ liệu của tệp hợp đồng. */
const META_KEYS = new Set(['$schema', '$id', '$comment', 'examples', 'default', 'title']);

/** Ràng buộc OpenAI và Anthropic từ chối. */
const CONSTRAINT_KEYS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
]);

/**
 * Ràng buộc Gemini từ chối — nó GIỮ được `minimum`/`maximum` của số.
 *
 * `minItems`/`maxItems` thì KHÔNG, dù tài liệu ghi là nhận: đo ngày 08/09/2026 trên
 * `gemini-3.1-pro-preview`, một mảng ĐỐI TƯỢNG có `maxItems: 40` trở lên làm cả lời gọi hỏng với
 * đúng một câu «Request contains an invalid argument», không nói trường nào. `maxItems: 20` thì
 * qua. Gemini có vẻ bung lược đồ ra theo số phần tử nên vượt trần độ phức tạp — nghĩa là ngưỡng
 * phụ thuộc mảng lớn cỡ nào, không phải một con số ghim được. Bỏ hẳn cho chắc: bỏ là NỚI, mà số
 * lượng thật vẫn do Zod chặn khi kết quả về.
 */
const GEMINI_STRIP = new Set([
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'uniqueItems',
  'minItems',
  'maxItems',
  'additionalProperties',
]);

export class SchemaDialectError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'SchemaDialectError';
  }
}

export function schemaFor(provider: SchemaProvider, schema: Record<string, unknown>): Node {
  const root = structuredClone(schema) as Node;
  // Nhúng `$ref` cho CẢ BA nhà cung cấp, không riêng Gemini. OpenAI có đọc `$ref`, nhưng ở chế độ
  // `strict` nó từ chối mọi từ khoá đứng cạnh: `{ "$ref": "#/$defs/space_id", "description": … }`
  // trả 400 «$ref cannot have keywords {'description'}» (gặp thật 08/09/2026 ở
  // `ai-space-program-proposal`). Cách khác là bỏ các từ khoá anh em, nhưng `description` là lời
  // dặn cho mô hình — bỏ đi thì lược đồ vẫn hợp lệ mà kết quả kém hơn, và hỏng trong im lặng.
  // Nhúng giữ được lời dặn và cho cả ba đi chung một đường.
  const defs = (root.$defs ?? {}) as Record<string, Node>;
  const inlined = inlineRefs(root, defs, []) as Node;
  delete inlined.$defs;
  return transform(inlined, provider) as Node;
}

function transform(node: unknown, provider: SchemaProvider): unknown {
  if (Array.isArray(node)) return node.map((n) => transform(n, provider));
  if (!node || typeof node !== 'object') return node;

  const strip = provider === 'gemini' ? GEMINI_STRIP : CONSTRAINT_KEYS;
  const out: Node = {};
  for (const [key, value] of Object.entries(node as Node)) {
    if (key === 'additionalProperties' && value !== null && typeof value === 'object') {
      // Object kiểu "bản đồ" (khoá tự do → lược đồ). Không nhà cung cấp nào diễn đạt được:
      // OpenAI/Anthropic sẽ bị ép thành object đóng không có khoá nào, Gemini thành object rỗng
      // — tức là THÊM ràng buộc trong im lặng, trái với hợp đồng "chỉ nới" của tệp này. Kiểm
      // TRƯỚC bước lược từ khoá, nếu không Gemini lặng lẽ bỏ qua nó. Nói ra để chỗ gọi khai
      // `properties` tường minh (như `ai-brief-digest` làm với `adjacent`).
      throw new SchemaDialectError(
        'Lược đồ có `additionalProperties` dạng bản đồ — không nhà cung cấp nào nhận; khai `properties` tường minh.',
      );
    }
    if (META_KEYS.has(key) || strip.has(key)) continue;
    if (key === 'properties' || key === '$defs') {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          transform(v, provider),
        ]),
      );
    } else if (key === 'items') {
      out[key] = transform(value, provider);
    } else if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      // OpenAI và Gemini không có `oneOf`; `anyOf` diễn đạt được mọi lược đồ mình dùng.
      out[key === 'oneOf' ? 'anyOf' : key] = (value as unknown[]).map((v) =>
        transform(v, provider),
      );
    } else {
      out[key] = value;
    }
  }
  return finish(out, provider);
}

/** Kiểu JSON Schema của một giá trị `enum` — `integer` gộp vào `number` như cách lược đồ khai. */
function jsonType(value: unknown): string {
  if (typeof value === 'number') return 'number';
  return typeof value;
}

function isObjectNode(node: Node): boolean {
  return node.type === 'object' || node.properties !== undefined;
}

function finish(node: Node, provider: SchemaProvider): Node {
  if (node.const !== undefined && node.enum === undefined) {
    // `const` không nhà cung cấp nào nhận đồng đều; `enum` một giá trị thì cả ba đều nhận.
    node.enum = [node.const];
    delete node.const;
  }

  if (provider === 'openai') {
    if (isObjectNode(node)) {
      node.additionalProperties = false;
      const props = (node.properties ?? {}) as Record<string, Node>;
      const required = new Set((node.required as string[] | undefined) ?? []);
      for (const key of Object.keys(props)) {
        if (!required.has(key)) props[key] = nullable(props[key]!);
      }
      node.required = Object.keys(props);
      node.properties = props;
    }
    return node;
  }

  if (provider === 'anthropic') {
    if (isObjectNode(node)) node.additionalProperties = false;
    // `enum` kèm kiểu MẢNG (`["string", "null"]`) thì Claude trả 400 «Enum value 'start' does not
    // match declared type» — đo 17/09/2026 trên lượt sửa mặt bằng (trường `place`), OpenAI nhận
    // được. Tách thành `anyOf`: nhánh kiểu đơn mang các giá trị, nhánh `null` riêng.
    if (Array.isArray(node.type) && Array.isArray(node.enum)) {
      const values = node.enum as unknown[];
      const branches: Node[] = (node.type as string[]).map((type) =>
        type === 'null'
          ? { type: 'null' }
          : {
              type,
              enum: values.filter(
                (v) => v !== null && jsonType(v) === (type === 'integer' ? 'number' : type),
              ),
            },
      );
      delete node.type;
      delete node.enum;
      node.anyOf = branches;
    }
    return node;
  }

  // Gemini: một kiểu duy nhất + `nullable`.
  if (Array.isArray(node.type)) {
    const types = (node.type as string[]).filter((t) => t !== 'null');
    if (types.length !== (node.type as string[]).length) node.nullable = true;
    if (types.length > 1) {
      throw new SchemaDialectError(
        `Gemini không nhận nhiều kiểu cho một trường: ${(node.type as string[]).join(' | ')}.`,
      );
    }
    node.type = types[0];
  }
  if (Array.isArray(node.enum) && node.enum.includes(null)) {
    node.enum = node.enum.filter((v) => v !== null);
    node.nullable = true;
  }
  if (Array.isArray(node.anyOf)) {
    // `anyOf: [X, {type: null}]` là cách OpenAI nói "tuỳ chọn"; Gemini nói bằng `nullable`.
    const members = node.anyOf as Node[];
    const nonNull = members.filter((m) => m.type !== 'null');
    if (nonNull.length === 1 && members.length === 2) {
      const only = nonNull[0]!;
      delete node.anyOf;
      Object.assign(node, only, { nullable: true });
    }
  }
  return node;
}

/** Diễn đạt "trường này có thể vắng" theo cách OpenAI strict chấp nhận. */
function nullable(node: Node): Node {
  if (node.$ref !== undefined || Array.isArray(node.anyOf)) {
    const members = Array.isArray(node.anyOf) ? (node.anyOf as Node[]) : [node];
    if (members.some((m) => m.type === 'null')) return node;
    return { anyOf: [...members, { type: 'null' }] };
  }
  if (Array.isArray(node.type)) {
    if (!(node.type as string[]).includes('null')) node.type = [...(node.type as string[]), 'null'];
  } else if (typeof node.type === 'string') {
    node.type = [node.type, 'null'];
  }
  if (Array.isArray(node.enum) && !node.enum.includes(null)) node.enum = [...node.enum, null];
  return node;
}

/** Nhúng `$ref` nội bộ (`#/$defs/X`) vào chỗ dùng — Gemini không đọc được tham chiếu. */
function inlineRefs(node: unknown, defs: Record<string, Node>, stack: string[]): unknown {
  if (Array.isArray(node)) return node.map((n) => inlineRefs(n, defs, stack));
  if (!node || typeof node !== 'object') return node;
  const obj = node as Node;
  if (typeof obj.$ref === 'string') {
    const match = /^#\/\$defs\/(.+)$/.exec(obj.$ref);
    const name = match?.[1];
    if (!name || !defs[name]) {
      throw new SchemaDialectError(`Không nhúng được tham chiếu ${obj.$ref}: chỉ hỗ trợ #/$defs/…`);
    }
    if (stack.includes(name)) {
      throw new SchemaDialectError(
        `Lược đồ đệ quy (${name}) không nhúng được — bỏ $ref vòng trong hợp đồng.`,
      );
    }
    const { $ref: _ref, ...rest } = obj;
    const target = inlineRefs(defs[name], defs, [...stack, name]) as Node;
    return { ...target, ...rest };
  }
  const out: Node = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = key === '$defs' ? value : inlineRefs(value, defs, stack);
  }
  return out;
}
