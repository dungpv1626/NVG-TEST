/**
 * Canh RANH GIỚI của nhánh AI sau khi bộ giải nội bộ đã gỡ.
 *
 * Haan chốt ngày 09/09/2026: bộ giải CP-SAT không đạt qua thử nghiệm thực tế, nhánh AI thay
 * thế nó, và khi nhánh AI làm tốt thì bộ giải bị xoá (T15–T19). Phép thử này từng canh để nhánh
 * AI không phụ thuộc một dòng nào của bộ giải — nhờ vậy ngày 19/09/2026 (T58) bộ giải gỡ được
 * mà nhánh AI không vỡ.
 *
 * Nay nó canh hai việc:
 *  1. Nhánh AI vẫn không import Container (`compute-backend`, nay chỉ còn số hoá hồ sơ cũ) hay
 *     tệp hook dùng chung của các tab TK khác — hai dòng riêng, không dính nhau.
 *  2. Bộ giải KHÔNG được tạo lại lặng lẽ: thư mục, tệp và hợp đồng của nó không tồn tại và
 *     không ai import. Muốn đưa lại là một quyết định mới, không phải một dòng `import`.
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
  'workers/src/design/workflows/ai-facade-steps.ts',
];

/**
 * Đường dẫn nhánh AI không được import: các đường của bộ giải đã gỡ (T58), Container số hoá và
 * tệp hook của các tab TK khác.
 */
const SOLVER_PATHS = [
  '/program/',
  '/layout/',
  '/render/',
  'compute-backend',
  'workflows/steps',
  'workflows/design-pipeline',
  // Web: các panel của bộ giải (đã gỡ) và tệp hook của các tab TK khác.
  'program-panel',
  'variants-panel',
  'sheet-viewer',
  'massing-viewer',
  'render-panel',
  'schedules-panel',
  'use-design-projects',
];

/**
 * Định danh thuộc hợp đồng của bộ giải (đã gỡ cùng `contracts/*.schema.json` của nó, T58). Chặn
 * riêng vì chúng từng đi qua `@nvg/shared/design` — một đường import HỢP LỆ — nên không lộ ra ở
 * đường dẫn. Nhánh AI có hợp đồng riêng (`ai_space_program`, `ai_floor_plan`…).
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
// Bộ giải đã gỡ (T58) — không được tạo lại lặng lẽ
// ---------------------------------------------------------------------------

/** Thư mục và tệp của bộ giải nội bộ đã xoá ngày 19/09/2026. */
const REMOVED_SOLVER_PATHS = [
  'workers/src/design/program',
  'workers/src/design/layout',
  'workers/src/design/render',
  'workers/src/design/workflows/steps.ts',
  'workers/src/design/workflows/design-pipeline.ts',
  'workers/src/design/publish.ts',
  'web/src/pages/tk/program-panel.tsx',
  'web/src/pages/tk/variants-panel.tsx',
  'web/src/pages/tk/sheet-viewer.tsx',
  'web/src/pages/tk/massing-viewer.tsx',
  'web/src/pages/tk/render-panel.tsx',
  'web/src/pages/tk/schedules-panel.tsx',
  'compute/src/design_compute/solver',
  'rules/structure',
  // Hợp đồng chỉ bộ giải dùng — tệp sinh ra ở `shared/src/design/` đi theo.
  ...[
    'space-program',
    'program-intent',
    'layout-intent',
    'floor-plan',
    'infeasibility-report',
    'arch-model',
    'schedules',
    'render-request',
    'render-result',
    'publish-request',
  ].flatMap((name) => [`contracts/${name}.schema.json`, `shared/src/design/${name}.generated.ts`]),
];

function exists(relative: string): boolean {
  try {
    statSync(join(ROOT, relative));
    return true;
  } catch {
    return false;
  }
}

describe('Bộ giải nội bộ đã gỡ (T58)', () => {
  it('không thư mục hay tệp nào của nó còn nằm trong kho', () => {
    expect(REMOVED_SOLVER_PATHS.filter(exists)).toEqual([]);
  });

  it('không tệp nào import đường của nó hay dùng hợp đồng của nó', () => {
    const everything = ['workers/src', 'web/src', 'shared/src'].flatMap(sourcesUnder);
    // Đường import TƯƠNG ĐỐI: `@/components/layout/` là bố cục chung của web, không phải bộ giải.
    const removed =
      /^\.\.?\/(?:\.\.\/)*(?:program|layout|render)\/|workflows\/(?:steps|design-pipeline)|\/publish$|(?:program|variants|render|schedules)-panel|sheet-viewer|massing-viewer/;
    const offenders: string[] = [];
    for (const file of everything) {
      if (file.endsWith('ai-independence.test.ts')) continue;
      for (const target of importsOf(file)) {
        if (removed.test(target)) offenders.push(`${file} → ${target}`);
      }
      // Tệp sinh từ hợp đồng còn lại có thể nhắc tên trùng (mô tả của `cad-extraction`); hợp
      // đồng đã gỡ thì canh bằng việc tệp của nó không tồn tại, ở phép thử trên.
      if (file.endsWith('.generated.ts')) continue;
      const src = withoutComments(readFileSync(join(ROOT, file), 'utf8'));
      for (const symbol of SOLVER_SYMBOLS) {
        if (new RegExp(`\\b${symbol}\\b`).test(src)) offenders.push(`${file} → ${symbol}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
