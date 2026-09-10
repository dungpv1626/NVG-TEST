/**
 * Sinh zod + kiểu TypeScript từ JSON Schema trong `contracts/`.
 *
 * `contracts/*.schema.json` là NGUỒN GỐC, viết tay (doc/design/03-data-contracts.md).
 * Worker và Container đều validate ở ranh giới, không bên nào tin bên kia — nên schema
 * chỉ được viết MỘT nơi, hai bên còn lại đọc lại từ đó:
 *
 *   contracts/*.schema.json ─┬─► shared/src/design/*.generated.ts   (zod, tệp này sinh)
 *                           └─► compute/ đọc THẲNG tệp JSON lúc chạy (`jsonschema`)
 *
 * ⚠️ LỆCH TÀI LIỆU CÓ CHỦ Ý: tài liệu đề xuất sinh Pydantic bằng `datamodel-code-generator`.
 * Ở đây phía Python KHÔNG sinh mã — nó nạp thẳng chính tệp JSON Schema và validate bằng
 * `jsonschema`. Lý do: bản sinh ra là bản SAO, mà bản sao thì phải có bước kiểm tra để
 * không lệch; đọc thẳng nguồn gốc thì không có gì để lệch. Đổi lại mất gợi ý kiểu tĩnh phía
 * Python — chấp nhận được vì bộ giải đã có mô hình nội bộ riêng (`solver/model.py`).
 *
 * Vì sao tự sinh zod thay vì dùng `json-schema-to-zod`: thư viện đó KHÔNG giải `$ref`, mọi
 * tham chiếu thành `z.any()` — tức mất sạch ràng buộc của `semver`, `artifact_ref`, và cả
 * cây chia không gian đệ quy của LayoutIntent. Một schema mất ràng buộc còn nguy hiểm hơn
 * không có schema, vì nó trông như đã kiểm.
 *
 * Chạy:  node scripts/contracts-gen.mjs           ghi tệp
 *        node scripts/contracts-gen.mjs --check   so với bản đã commit, lệch thì thoát mã 1
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import * as prettier from 'prettier';
import yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'contracts');
const OUT_DIR = join(ROOT, 'shared', 'src', 'design');
const NORMS_FILE = join(ROOT, 'kb', 'space_norms.yaml');
const VOCAB_FILE = join(ROOT, 'kb', 'room_vocabulary.yaml');

// ---------------------------------------------------------------------------
// Tiện ích đặt tên
// ---------------------------------------------------------------------------

const pascal = (s) => s.replace(/(^|[_-])([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const camel = (s) => {
  const p = pascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
};

/** Chuỗi TypeScript an toàn cho một khoá đối tượng. */
const key = (k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));

/** Ghi mô tả của schema thành chú thích JSDoc, giữ nguyên tiếng Việt có dấu. */
function jsdoc(text, indent = '') {
  if (!text) return '';
  const lines = String(text).split('\n');
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join('\n')}\n${indent} */\n`;
}

// ---------------------------------------------------------------------------
// Phân tích $ref và phát hiện đệ quy
// ---------------------------------------------------------------------------

const refName = (ref) => {
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m) throw new Error(`Chỉ hỗ trợ $ref nội bộ dạng "#/$defs/<tên>", gặp: ${ref}`);
  return m[1];
};

/** Tập tên $def mà một schema tham chiếu tới (không đệ quy xuống $defs khác). */
function refsOf(schema, acc = new Set()) {
  if (!schema || typeof schema !== 'object') return acc;
  if (Array.isArray(schema)) {
    for (const s of schema) refsOf(s, acc);
    return acc;
  }
  if (typeof schema.$ref === 'string') acc.add(refName(schema.$ref));
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$ref') continue;
    if (v && typeof v === 'object') refsOf(v, acc);
  }
  return acc;
}

/** Tên $def nằm trong một chu trình tham chiếu (cần z.lazy). */
function cyclicDefs(defs) {
  const direct = new Map(Object.entries(defs).map(([n, s]) => [n, refsOf(s)]));
  const cyclic = new Set();
  for (const start of direct.keys()) {
    const seen = new Set();
    const stack = [...(direct.get(start) ?? [])];
    while (stack.length) {
      const n = stack.pop();
      if (n === start) {
        cyclic.add(start);
        break;
      }
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(direct.get(n) ?? []));
    }
  }
  return cyclic;
}

/** Thứ tự khai báo: $def được tham chiếu phải đứng trước. $def đệ quy dùng z.lazy nên bỏ qua. */
function topoOrder(defs, cyclic) {
  const direct = new Map(Object.entries(defs).map(([n, s]) => [n, refsOf(s)]));
  const out = [];
  const state = new Map();
  const visit = (n) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'doing') return; // chu trình — đã xử lý bằng z.lazy
    state.set(n, 'doing');
    for (const d of direct.get(n) ?? []) if (defs[d] && !cyclic.has(d)) visit(d);
    state.set(n, 'done');
    out.push(n);
  };
  for (const n of Object.keys(defs)) visit(n);
  return out;
}

// ---------------------------------------------------------------------------
// Sinh biểu thức zod
// ---------------------------------------------------------------------------

/** Ràng buộc số dùng chung cho number/integer. */
function numericChecks(s) {
  let out = '';
  if (s.type === 'integer') out += '.int()';
  // `multipleOf` dùng cho lưới TOẠ ĐỘ: nửa centimet ở `ai-floor-plan` (xem `$defs.cm` ở đó).
  // Chỉ sinh đúng ràng buộc đã khai — không tự suy ra một lưới mặc định nào.
  if (typeof s.multipleOf === 'number') out += `.multipleOf(${s.multipleOf})`;
  if (typeof s.minimum === 'number') out += `.gte(${s.minimum})`;
  if (typeof s.maximum === 'number') out += `.lte(${s.maximum})`;
  if (typeof s.exclusiveMinimum === 'number') out += `.gt(${s.exclusiveMinimum})`;
  if (typeof s.exclusiveMaximum === 'number') out += `.lt(${s.exclusiveMaximum})`;
  return out;
}

function stringChecks(s) {
  let out = '';
  if (typeof s.minLength === 'number') out += `.min(${s.minLength})`;
  if (typeof s.maxLength === 'number') out += `.max(${s.maxLength})`;
  if (s.format === 'uuid') out += '.uuid()';
  if (s.format === 'date-time') out += '.datetime({ offset: true })';
  if (typeof s.pattern === 'string') out += `.regex(${regexLiteral(s.pattern)})`;
  return out;
}

/** Mẫu chính quy của JSON Schema là chuỗi; chuyển sang literal RegExp của JS. */
function regexLiteral(pattern) {
  return `/${pattern.replace(/\//g, '\\/')}/`;
}

/**
 * `type: ["string", "null"]` và `enum: [..., null]` là hai cách JSON Schema diễn đạt
 * "được phép rỗng". Cả hai quy về `.nullable()` của zod.
 */
function splitNullable(s) {
  if (Array.isArray(s.type) && s.type.includes('null')) {
    const rest = s.type.filter((t) => t !== 'null');
    return [{ ...s, type: rest.length === 1 ? rest[0] : rest }, true];
  }
  if (Array.isArray(s.enum) && s.enum.includes(null)) {
    return [{ ...s, enum: s.enum.filter((v) => v !== null) }, true];
  }
  return [s, false];
}

function zodExpr(schema, ctx, indent = '  ') {
  const [s, nullable] = splitNullable(schema);
  const suffix = nullable ? '.nullable()' : '';
  return zodCore(s, ctx, indent) + suffix + describe(s);
}

function describe(s) {
  return s.description ? `.describe(${JSON.stringify(s.description)})` : '';
}

/**
 * Tên hợp đồng đang sinh, dùng làm tiền tố cho mọi ký hiệu suy từ `$defs`.
 *
 * Biến ở mức mô-đun là một chỗ luộm thuộm, nhưng luồn tiền tố qua sáu hàm lồng nhau còn tệ
 * hơn cho một script sinh mã chạy tuần tự từng tệp. `generate()` đặt lại trước mỗi tệp.
 */
let TITLE = '';

/**
 * Vì sao mọi ký hiệu của `$defs` đều mang tiền tố tên hợp đồng.
 *
 * Hai hợp đồng CỐ Ý dùng chung một định nghĩa: `kb-record` lặp lại nguyên `layout_node` của
 * `layout-intent`, vì bản ghi Knowledge Base được đưa vào prompt làm few-shot nên lệch định
 * dạng là dạy mô hình sinh sai. Nhưng mỗi tệp sinh ra một bản riêng, mà thùng chứa
 * `index.generated.ts` lại `export *` cả hai — trùng tên là lỗi biên dịch.
 *
 * Tiền tố giải việc đó bằng CẤU TRÚC chứ không bằng kỷ luật đặt tên: không thể trùng.
 */
const defConst = (name) => `${camel(`${TITLE}_${name}`)}Schema`;
const defType = (name) => pascal(`${TITLE}_${name}`);

function zodCore(s, ctx, indent) {
  if (typeof s.$ref === 'string') {
    const n = refName(s.$ref);
    ctx.used.add(n);
    return defConst(n);
  }

  if (s.const !== undefined) return `z.literal(${JSON.stringify(s.const)})`;

  if (Array.isArray(s.oneOf)) {
    const parts = s.oneOf.map((o) => zodExpr(o, ctx, indent + '  '));
    return `z.union([\n${parts.map((p) => `${indent}  ${p},`).join('\n')}\n${indent}])`;
  }

  if (Array.isArray(s.enum)) {
    if (s.enum.every((v) => typeof v === 'string')) {
      return `z.enum([${s.enum.map((v) => JSON.stringify(v)).join(', ')}])`;
    }
    return `z.union([${s.enum.map((v) => `z.literal(${JSON.stringify(v)})`).join(', ')}])`;
  }

  if (Array.isArray(s.type)) {
    const parts = s.type.map((t) => zodCore({ ...s, type: t }, ctx, indent));
    return `z.union([${parts.join(', ')}])`;
  }

  switch (s.type) {
    case 'string':
      return `z.string()${stringChecks(s)}`;
    case 'number':
    case 'integer':
      return `z.number()${numericChecks(s)}`;
    case 'boolean':
      return 'z.boolean()';
    case 'null':
      return 'z.null()';
    case 'array': {
      const item = s.items ? zodExpr(s.items, ctx, indent) : 'z.unknown()';
      let out = `z.array(${item})`;
      if (typeof s.minItems === 'number') out += `.min(${s.minItems})`;
      if (typeof s.maxItems === 'number') out += `.max(${s.maxItems})`;
      return out;
    }
    case 'object': {
      // Không có `properties` nhưng có `additionalProperties` = từ điển khoá tự do.
      if (!s.properties && s.additionalProperties && typeof s.additionalProperties === 'object') {
        let out = `z.record(z.string(), ${zodExpr(s.additionalProperties, ctx, indent)})`;
        if (typeof s.minProperties === 'number') {
          out += `.refine((v) => Object.keys(v).length >= ${s.minProperties}, {
${indent}  message: 'Cần ít nhất ${s.minProperties} mục.',
${indent}})`;
        }
        return out;
      }
      const required = new Set(s.required ?? []);
      const props = Object.entries(s.properties ?? {}).map(([k, v]) => {
        const doc = jsdoc(v.description, `${indent}  `);
        const expr = zodExpr(v, ctx, `${indent}  `);
        const opt = required.has(k) ? '' : '.optional()';
        return `${doc}${indent}  ${key(k)}: ${expr}${opt},`;
      });
      const body = props.length ? `\n${props.join('\n')}\n${indent}` : '';
      let out = `z.object({${body}})`;
      if (s.additionalProperties === false) out += '.strict()';
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        out += `.catchall(${zodExpr(s.additionalProperties, ctx, indent)})`;
      }
      return out;
    }
    default:
      return 'z.unknown()';
  }
}

// ---------------------------------------------------------------------------
// Sinh kiểu TypeScript — chỉ cần cho $def đệ quy (z.infer không xuyên qua z.lazy)
// ---------------------------------------------------------------------------

function tsType(s, defs, indent = '') {
  if (typeof s.$ref === 'string') return defType(refName(s.$ref));
  const [core, nullable] = splitNullable(s);
  const base = tsCore(core, defs, indent);
  return nullable ? `${base} | null` : base;
}

function tsCore(s, defs, indent) {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (Array.isArray(s.oneOf)) {
    return s.oneOf.map((o) => `(${tsType(o, defs, indent)})`).join(' | ');
  }
  if (Array.isArray(s.enum)) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (Array.isArray(s.type))
    return s.type.map((t) => tsCore({ ...s, type: t }, defs, indent)).join(' | ');
  switch (s.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `Array<${s.items ? tsType(s.items, defs, indent) : 'unknown'}>`;
    case 'object': {
      if (!s.properties && s.additionalProperties && typeof s.additionalProperties === 'object') {
        return `Record<string, ${tsType(s.additionalProperties, defs, indent)}>`;
      }
      const required = new Set(s.required ?? []);
      const rows = Object.entries(s.properties ?? {}).map(
        ([k, v]) =>
          `${indent}  ${key(k)}${required.has(k) ? '' : '?'}: ${tsType(v, defs, `${indent}  `)};`,
      );
      return `{\n${rows.join('\n')}\n${indent}}`;
    }
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Sinh một tệp
// ---------------------------------------------------------------------------

function generate(file) {
  const raw = readFileSync(join(SRC_DIR, file), 'utf8');
  const schema = JSON.parse(raw);
  const title = schema.title ?? pascal(basename(file, '.schema.json'));
  TITLE = title;
  const defs = schema.$defs ?? {};
  const cyclic = cyclicDefs(defs);
  const ctx = { used: new Set() };

  const parts = [];
  parts.push(`/**
 * SINH TỰ ĐỘNG TỪ \`contracts/${file}\` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy \`npm run contracts:gen\`.
 * \`npm run contracts:check\` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';
`);

  for (const name of topoOrder(defs, cyclic)) {
    const def = defs[name];
    const constName = defConst(name);
    const typeName = defType(name);
    if (cyclic.has(name)) {
      // `z.infer` không xuyên qua `z.lazy`, nên kiểu đệ quy phải viết tường minh.
      parts.push(`${jsdoc(def.description)}export type ${typeName} = ${tsType(def, defs)};

export const ${constName}: z.ZodType<${typeName}> = z.lazy(() =>
  ${zodExpr(def, ctx, '  ')},
);
`);
    } else {
      // Xuất cả kiểu cho $def không đệ quy: kiểu đệ quy ở trên tham chiếu tới chúng, và một
      // kiểu không xuất hiện trong khai báo xuất ra ngoài sẽ khiến TypeScript báo "không gọi
      // tên được" ở nơi khác (TS2742) khi suy kiểu bắc qua ranh giới gói.
      parts.push(`${jsdoc(def.description)}export const ${constName} = ${zodExpr(def, ctx, '')};

export type ${typeName} = z.infer<typeof ${constName}>;
`);
    }
  }

  const rootConst = `${camel(title)}Schema`;
  parts.push(`${jsdoc(schema.description)}export const ${rootConst} = ${zodExpr(schema, ctx, '')};

export type ${title} = z.infer<typeof ${rootConst}>;
`);

  // $def không ai dùng là dấu hiệu schema nguồn viết thừa — báo sớm còn hơn để lẫn.
  const unused = Object.keys(defs).filter((n) => !ctx.used.has(n));
  if (unused.length) {
    throw new Error(`${file}: $defs không được tham chiếu: ${unused.join(', ')}`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Gương của `kb/` — chỉ hai mẩu biểu mẫu Đầu bài cần
// ---------------------------------------------------------------------------

/**
 * Vì sao bảng này phải đi ra tới trình duyệt.
 *
 * "Mấy người một phòng ngủ" là tri thức, nên nó nằm ở `kb/` và chỉ Worker đọc lúc chạy
 * (CLAUDE.md 8.8 mục 7). Nhưng biểu mẫu Đầu bài phải nói ngay tại chỗ rằng "Con · 2 người"
 * cho ra HAI phòng ngủ còn "Ông bà · 2 người" cho ra MỘT — nếu không, người khai tích vào
 * ô phòng ngủ ở phần gia đình rồi đi tìm chúng ở danh sách không gian mà không thấy, đúng
 * chỗ đã báo lỗi ngày 06/09/2026.
 *
 * Ba cách lấy nó xuống trình duyệt, và vì sao chọn cách này:
 *  · Chép tay sang `shared/` — hai bản, lệch nhau vào đúng ngày ai đó sửa YAML.
 *  · Gọi Worker lúc mở biểu mẫu — buộc Đầu bài phải có dịch vụ thiết kế mới điền được, trong
 *    khi cả phần còn lại của nó chạy thẳng trên Supabase.
 *  · Sinh ra lúc build từ chính tệp YAML — một nguồn, không phụ thuộc lúc chạy, và
 *    `contracts:check` bắt được lệch y như với `contracts/`.
 *
 * Chỉ lấy `occupancy` và bảng nhãn, không lấy cả tệp: diện tích chuẩn và định mức là việc của
 * Lớp 2, đưa ra trình duyệt là mở đường cho một bản Lớp 2 thứ hai viết bằng TypeScript.
 */
function generateKbMirror() {
  const norms = yaml.load(readFileSync(NORMS_FILE, 'utf8'));
  const occupancy = norms?.occupancy ?? {};
  const vocab = yaml.load(readFileSync(VOCAB_FILE, 'utf8'));
  const labels = (vocab?.types ?? [])
    .map((room) => `  ${key(room.code)}: ${JSON.stringify(room.vi)},`)
    .join('\n');
  const rows = Object.entries(occupancy)
    .map(
      ([role, rule]) =>
        `  ${key(role)}: { perRoom: ${rule.per_room}, roomType: ${JSON.stringify(rule.room_type)} },`,
    )
    .join('\n');

  return `/**
 * SINH TỰ ĐỘNG từ \`kb/space_norms.yaml\` (mục \`occupancy\`) và \`kb/room_vocabulary.yaml\`
 * (nhãn tiếng Việt) — KHÔNG SỬA TAY. Xem \`scripts/contracts-gen.mjs\`.
 */

/** Mấy người ở chung một phòng ngủ, và phòng đó là loại gì. */
export interface OccupancyRule {
  readonly perRoom: number;
  readonly roomType: string;
}

export const OCCUPANCY: Readonly<Record<string, OccupancyRule>> = {
${rows}
};

/** Số phòng ngủ một nhóm thành viên cần — cùng phép tính Lớp 2 dùng ở \`collectRequests\`. */
export function bedroomsFor(role: string, count: number): number {
  const rule = OCCUPANCY[role];
  if (!rule || count <= 0) return 0;
  return Math.ceil(count / rule.perRoom);
}

/** Loại phòng ngủ của một vai trò (\`bedroom\` hay \`master_bedroom\`); rỗng khi vai trò lạ. */
export function bedroomTypeFor(role: string): string | null {
  return OCCUPANCY[role]?.roomType ?? null;
}

/** Nhãn tiếng Việt của mã phòng — gương của \`kb/room_vocabulary.yaml\`. */
export const ROOM_LABEL: Readonly<Record<string, string>> = {
${labels}
};
`;
}

// ---------------------------------------------------------------------------

const files = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.schema.json'))
  .sort();

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const check = process.argv.includes('--check');
const outputs = new Map();

/*
 * Chạy Prettier ngay trong bộ sinh, không để `prettier --write` chạm vào sau.
 *
 * Nếu định dạng nằm ngoài bộ sinh thì `--check` sẽ so bản chưa định dạng với bản đã định
 * dạng trên đĩa và luôn báo lệch — một cảnh báo giả lặp lại mỗi lần chạy, đúng loại làm
 * người đọc quen với việc bỏ qua kết quả kiểm tra.
 */
const prettierOptions = { ...(await prettier.resolveConfig(OUT_DIR)), parser: 'typescript' };
const format = (code) => prettier.format(code, prettierOptions);

for (const file of files) {
  const name = basename(file, '.schema.json');
  outputs.set(join(OUT_DIR, `${name}.generated.ts`), await format(generate(file)));
}

outputs.set(join(OUT_DIR, 'kb.generated.ts'), await format(generateKbMirror()));

// Tệp gom — nơi duy nhất web/ và workers/ import vào.
const barrel = `/**
 * SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Xem \`scripts/contracts-gen.mjs\`.
 */

${files.map((f) => `export * from './${basename(f, '.schema.json')}.generated';`).join('\n')}
export * from './kb.generated';
`;
outputs.set(join(OUT_DIR, 'index.generated.ts'), await format(barrel));

let stale = 0;
for (const [path, content] of outputs) {
  if (check) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current !== content) {
      console.error(`Lệch: ${path.replace(`${ROOT}/`, '')}`);
      stale += 1;
    }
  } else {
    writeFileSync(path, content, 'utf8');
  }
}

if (check) {
  if (stale) {
    console.error(
      `\n${stale} tệp sinh ra không khớp với contracts/. Chạy \`npm run contracts:gen\` rồi commit lại.`,
    );
    process.exit(1);
  }
  console.log(`Hợp đồng dữ liệu khớp — ${outputs.size} tệp.`);
} else {
  console.log(`Đã sinh ${outputs.size} tệp vào shared/src/design/.`);
}
