/**
 * Canh RANH GIỚI giữa nhánh AI và bộ giải nội bộ.
 *
 * Vì sao cần một kiểm thử cho việc này. Haan chốt ngày 09/09/2026: bộ giải CP-SAT không đạt
 * qua thử nghiệm thực tế, nhánh AI thay thế nó, và khi nhánh AI làm tốt thì **bộ giải sẽ bị
 * xoá** (T15–T19). Điều kiện để xoá được là nhánh AI không phụ thuộc một dòng nào của bộ giải.
 *
 * Đây là loại ràng buộc "mòn dần": không lần sửa nào phá nó một cách rõ ràng, nhưng một hôm
 * thiếu đúng một hàm tiện, ai đó `import { plateFor } from '../program/site-limits'` — mã chạy,
 * test xanh, rà soát không thấy gì bất thường. Đến ngày xoá bộ giải thì nhánh AI vỡ, và không
 * ai nhớ nổi lần sửa nào đã nối hai bên lại. Chỉ có đọc thẳng dòng `import` mới bắt được.
 *
 * Canh CẢ HAI CHIỀU. Chiều xuôi hiển nhiên; chiều ngược cũng phải chặn, vì nếu bộ giải bắt đầu
 * gọi sang `ai/` thì hai nhánh dính nhau y hệt, chỉ là mũi tên đổi đầu.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());

/** Mọi tệp `.ts`/`.tsx` dưới một thư mục, đệ quy. Trả đường dẫn tương đối từ gốc kho. */
function sourcesUnder(relativeDir: string): string[] {
  const abs = join(ROOT, relativeDir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return []; // thư mục chưa tồn tại — các đợt sau mới tạo
  }
  const out: string[] = [];
  for (const name of entries) {
    const rel = `${relativeDir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourcesUnder(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** Bỏ chú thích khỏi mã nguồn — để phép soi định danh không bắt nhầm chữ trong lời giải thích. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Đích của mọi câu `import … from '…'` và `export … from '…'` trong một tệp. */
function importsOf(relativeFile: string): string[] {
  const src = readFileSync(join(ROOT, relativeFile), 'utf8');
  return [...src.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+'([^']+)'/g)].map(
    (m) => m[1]!,
  );
}

// ---------------------------------------------------------------------------
// Chiều xuôi — nhánh AI KHÔNG được chạm bộ giải
// ---------------------------------------------------------------------------

/**
 * Thư mục thuộc nhánh AI. `rules/` có mặt ở đây vì nó là bộ ĐỌC gói quy tắc dùng chung: nó
 * từng nằm trong `program/` và đã chuyển ra ngoài đúng vì lý do này (09/09/2026).
 */
const AI_DIRS = ['workers/src/design/ai', 'workers/src/design/rules', 'web/src/pages/tk/ai'];

/** Tệp lẻ thuộc nhánh AI, không nằm trong thư mục riêng. */
const AI_FILES = [
  'workers/src/design/auth-scope.ts',
  'web/src/hooks/use-ai-design.ts',
  'workers/src/design/render-store.ts',
  'workers/src/design/workflows/ai-design.ts',
  'workers/src/design/workflows/ai-design-steps.ts',
];

/**
 * Đường dẫn thuộc BỘ GIẢI. Mỗi dòng là một thứ sẽ biến mất trong lần dọn cuối; nhánh AI trỏ
 * vào bất kỳ dòng nào là hôm ấy nó vỡ theo.
 *
 * `index.ts` có trong danh sách vì nó import cả bộ giải, Container và Workflow — trỏ vào nó
 * là kéo theo toàn bộ, dù chỉ cần một hàm tiện.
 */
const SOLVER_PATHS = [
  '/program/',
  '/layout/',
  '/render/',
  'compute-backend',
  'workflows/steps',
  'workflows/design-pipeline',
  // Web: các panel của bộ giải và tệp hook chung sẽ bị dọn cùng chúng.
  'program-panel',
  'variants-panel',
  'sheet-viewer',
  'massing-viewer',
  'render-panel',
  'schedules-panel',
  'use-design-projects',
];

/**
 * Định danh thuộc hợp đồng của bộ giải. Chặn riêng vì chúng đi qua `@nvg/shared/design` —
 * một đường import HỢP LỆ — nên không lộ ra ở đường dẫn. Nhánh AI có hợp đồng riêng
 * (`ai_space_program`, `ai_floor_plan`, `ai_facade_concept`, `ai_image_set`); mượn hợp đồng
 * của bộ giải là mượn luôn những trường chỉ bộ giải điền được.
 */
const SOLVER_SYMBOLS = [
  // Kiểu TypeScript cũng tính: `SpaceProgram` mang `floor_allocation`, `adjacency`,
  // `priors_applied` — những trường chỉ bộ giải điền được. Nhánh AI có `AiSpaceProgram` riêng.
  'SpaceProgram',
  'FloorPlan',
  'spaceProgramSchema',
  'floorPlanSchema',
  'layoutIntentSchema',
  'archModelSchema',
  'schedulesSchema',
  'renderResultSchema',
];

describe('Nhánh AI không phụ thuộc bộ giải nội bộ', () => {
  const aiSources = [
    ...AI_DIRS.flatMap(sourcesUnder),
    ...AI_FILES.filter((f) => {
      try {
        statSync(join(ROOT, f));
        return true;
      } catch {
        return false; // đợt sau mới tạo
      }
    }),
  ];

  it('có tệp để soát (danh sách thư mục không trỏ nhầm chỗ)', () => {
    expect(aiSources.length).toBeGreaterThan(5);
  });

  it('không tệp nào của nhánh AI import từ bộ giải', () => {
    const offenders: string[] = [];
    for (const file of aiSources) {
      for (const target of importsOf(file)) {
        const hit = SOLVER_PATHS.find((p) => target.includes(p));
        if (hit) offenders.push(`${file} → ${target}  (cấm: ${hit})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('không tệp nào của nhánh AI dùng hợp đồng dữ liệu của bộ giải', () => {
    const offenders: string[] = [];
    for (const file of aiSources) {
      const src = withoutComments(readFileSync(join(ROOT, file), 'utf8'));
      for (const symbol of SOLVER_SYMBOLS) {
        if (new RegExp(`\\b${symbol}\\b`).test(src)) offenders.push(`${file} → ${symbol}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Chiều ngược — bộ giải KHÔNG được chạm nhánh AI
// ---------------------------------------------------------------------------

describe('Bộ giải không phụ thuộc nhánh AI', () => {
  const solverSources = [
    ...sourcesUnder('workers/src/design/program'),
    ...sourcesUnder('workers/src/design/layout'),
    ...sourcesUnder('workers/src/design/render'),
  ];

  it('có tệp để soát', () => {
    expect(solverSources.length).toBeGreaterThan(5);
  });

  it('không tệp nào của bộ giải import từ `ai/`', () => {
    const offenders: string[] = [];
    for (const file of solverSources) {
      for (const target of importsOf(file)) {
        if (/(^|\/)ai\//.test(target)) offenders.push(`${file} → ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
