import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Bằng chứng đột biến mã nguồn cho NVG (20/09/2026).
 *
 *   npx tsx scripts/mutation-proof.ts          # chạy toàn bộ
 *   npx tsx scripts/mutation-proof.ts --dry    # chỉ kiểm mọi đột biến còn áp được đúng một chỗ
 *   npx tsx scripts/mutation-proof.ts M03 M07  # chạy vài đột biến
 *
 * SỐ BÀI KIỂM KHÔNG CHỨNG MINH BỘ KIỂM CÓ TÁC DỤNG. Ngày 20/09/2026 hai lượt rà soát tìm ra tám
 * lỗi thật ở bước Mặt đứng trong khi 867 bài kiểm của module ấy đang xanh — không bài nào bắt được
 * lỗi nào. Ở đây mỗi mục là một LỖI THẬT được cài vào mã nguồn, đúng loại lỗi mà bộ kiểm hứa sẽ
 * bắt, rồi chạy lại bộ kiểm. Bộ kiểm phải ĐỎ. Vẫn xanh thì script báo «SỐNG SÓT» chứ không giấu.
 *
 * Mỗi đột biến mô phỏng một hậu quả nhìn thấy được: người dùng thấy dữ liệu không được phép thấy,
 * bản vẽ mất nhãn cảnh báo, tiền gọi mô hình tiêu vô ích, hoặc danh tính khách rời khỏi máy chủ.
 * Không có đột biến «đổi dấu ngẫu nhiên» — thứ đó đo độ phủ, còn ở đây cần chứng minh cam kết.
 *
 * KHÔNG chạy phép thử trong `db/`: chúng nối vào Supabase thật và xoá cứng dữ liệu theo tiền tố
 * `[TEST]`, nên không được chạy đi chạy lại hàng chục lượt. Hệ quả phải nhớ: RLS và mọi ràng buộc
 * nằm trong CSDL KHÔNG được chứng minh ở đây. Đó là khoảng trống lớn nhất của tệp này.
 *
 * ⚠️ Script GHI ĐÈ `workers/src/**` 11 lượt. Đang có `wrangler dev` chạy thì mỗi lượt là một lần
 * nạp lại Worker với mã đã cài lỗi — dừng nó trước khi chạy.
 *
 * AN TOÀN: tệp gốc đọc vào bộ nhớ và ghi trả lại trong `finally`, kể cả khi bấm Ctrl+C. Trước và
 * sau khi chạy, script băm toàn bộ mã nguồn và báo lỗi nếu hai bản băm khác nhau.
 */

type Axis = 'phân quyền' | 'riêng tư' | 'tiền' | 'bản vẽ';

type Mutation = {
  id: string;
  axis: Axis;
  file: string;
  /** Lỗi được mô phỏng, viết theo hậu quả thật. */
  bug: string;
  find: string;
  replace: string;
};

const MUTATIONS: Mutation[] = [
  // ── Phân quyền: ai thấy gì ────────────────────────────────────────────────────────────
  {
    id: 'M01',
    axis: 'phân quyền',
    file: 'web/src/lib/auth.tsx',
    bug: 'Không có quyền trên phân hệ nào thì thấy HẾT — gõ thẳng đường dẫn là vào được mọi màn hình',
    find: '  if (!p) return false;',
    replace: '  if (!p) return true;',
  },
  {
    id: 'M02',
    axis: 'phân quyền',
    file: 'web/src/lib/company-scope.ts',
    bug: 'Bỏ lọc pháp nhân: nhân viên NVO thấy cả hồ sơ của NVC và NVS trên mọi danh sách',
    find: "  return (query as { eq(column: string, value: string): Q }).eq('company_id', scope.companyId);",
    replace: '  return query;',
  },
  {
    id: 'M03',
    axis: 'phân quyền',
    file: 'workers/src/design/artifacts.ts',
    bug: 'Kho artifact dùng lại dòng của hồ sơ KHÁC khi trùng mã băm — head trỏ sang hồ sơ người khác',
    find: '    if (existing.data && (existing.data.project_id as string) !== scope.projectId) {',
    replace: '    if (false) {',
  },

  // ── Riêng tư: cái gì rời khỏi máy chủ ─────────────────────────────────────────────────
  {
    id: 'M04',
    axis: 'riêng tư',
    file: 'workers/src/design/brief/anonymise.ts',
    bug: 'Số điện thoại khách đi nguyên vào lời dẫn gửi nhà cung cấp mô hình',
    find: '      .replace(/(?<!\\d)\\(?(?:\\+?84|0)\\)?(?:[\\s.()-]?\\d){8,10}(?!\\d)/g, REDACTED)',
    replace: '      .replace(/(?!)/g, REDACTED)',
  },
  {
    id: 'M05',
    axis: 'riêng tư',
    file: 'workers/src/design/brief/anonymise.ts',
    bug: 'Tên khách hàng đi nguyên vào lời dẫn — bộ lược danh tính thành hàm rỗng',
    find: "    out = out.replace(new RegExp(pattern, 'giu'), REDACTED);",
    replace: '    out = out;',
  },

  // ── Tiền: lượt gọi mô hình ────────────────────────────────────────────────────────────
  {
    id: 'M06',
    axis: 'tiền',
    file: 'workers/src/design/ai/facade/image.ts',
    bug: 'Ảnh neo không được gửi kèm — trả tiền một lượt để mô hình vẽ một ngôi nhà khác',
    find: '  return { system: prompt.system, prompt: prompt.prompt, images: [anchor] };',
    replace: '  return { system: prompt.system, prompt: prompt.prompt, images: [] };',
  },
  {
    id: 'M07',
    axis: 'tiền',
    file: 'workers/src/design/ai/sheet-image.ts',
    bug: 'Như M06 nhưng cho tờ mặt bằng có nội thất',
    find: '  return { system: prompt.system, prompt: prompt.prompt, images: [anchor] };',
    replace: '  return { system: prompt.system, prompt: prompt.prompt, images: [] };',
  },

  // ── Bản vẽ: số đo và nhãn ─────────────────────────────────────────────────────────────
  {
    id: 'M08',
    axis: 'bản vẽ',
    file: 'shared/src/design/index.ts',
    bug: 'Mã artifact không còn theo nội dung — hai phương án khác nhau dùng chung một mã',
    find: '  const bytes = new TextEncoder().encode(canonicalJson(payload));',
    replace: "  const bytes = new TextEncoder().encode('artifact');",
  },
  {
    id: 'M09',
    axis: 'bản vẽ',
    file: 'shared/src/design/index.ts',
    bug: 'Tờ vẽ AI mất nhãn «bản phác, không dùng để thi công» — người đọc tưởng là hồ sơ thật',
    find: "  aiSheet: 'Đề xuất AI — bản phác, không dùng để thi công',",
    replace: "  aiSheet: '',",
  },
  {
    id: 'M10',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/merge.ts',
    bug: 'Lỗ mở của mặt đứng không còn lấy từ mặt bằng — mặt đứng và mặt bằng nói hai ngôi nhà khác nhau (T16)',
    find: '    openings_front: frame.openings.map((o) => ({ ...o })),',
    replace: '    openings_front: frame.openings.map((o) => ({ ...o, w: o.w + 10 })),',
  },
  {
    id: 'M11',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/draw/elevation-sheet.ts',
    bug: 'Chuỗi kích thước bỏ mất mép hình — tờ mặt đứng in ra tổng nhỏ hơn bề rộng thật',
    find: '  if (out.length > 0 && max !== undefined) out[out.length - 1] = max;',
    replace: '  if (false) out[out.length - 1] = max!;',
  },
];

/** Thư mục mã nguồn được băm trước và sau khi chạy. `db/` không đụng tới nên không băm. */
const SRC_DIRS = ['shared/src', 'workers/src', 'web/src'];
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const only = new Set(argv.filter((a) => /^M\d+$/.test(a)));

function hashTree(dirs: readonly string[]): string {
  const hash = createHash('sha256');
  const walk = (d: string) => {
    for (const entry of readdirSync(d).sort()) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(path).update(readFileSync(path));
    }
  };
  for (const dir of dirs) walk(dir);
  return hash.digest('hex');
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + needle.length)
  ) {
    count += 1;
  }
  return count;
}

type Outcome = { mutation: Mutation; killed: boolean; caughtBy: string[]; ms: number };

type VitestJson = {
  testResults: { name: string; assertionResults: { status: string; fullName: string }[] }[];
};

/** Bộ kiểm nhanh: `shared/`, `workers/`, `web/` — KHÔNG có `db/` (xem đầu tệp). */
function runSuite(reportFile: string): { passed: boolean; failures: string[] } {
  const result = spawnSync(
    'node_modules/.bin/vitest',
    [
      'run',
      '--project',
      'logic',
      '--project',
      'web',
      'shared/',
      'workers/',
      'web/src',
      '--bail=1',
      '--reporter=json',
      `--outputFile=${reportFile}`,
    ],
    { encoding: 'utf8' },
  );
  let failures: string[] = [];
  try {
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as VitestJson;
    failures = report.testResults.flatMap((file) =>
      file.assertionResults
        .filter((a) => a.status === 'failed')
        .map((a) => `${file.name.replace(`${process.cwd()}/`, '')} › ${a.fullName}`),
    );
    if (failures.length === 0 && result.status !== 0) {
      // Lỗi nạp module (cú pháp, kiểu) không có assertion nào — ghi tên tệp.
      failures = report.testResults
        .filter((file) => file.assertionResults.length === 0)
        .map((file) => `${file.name.replace(`${process.cwd()}/`, '')} (không nạp được)`);
    }
  } catch {
    failures = result.status === 0 ? [] : ['(không đọc được báo cáo vitest)'];
  }
  return { passed: result.status === 0, failures };
}

// ── Kiểm trước: mọi đột biến phải áp được đúng một chỗ ──────────────────────────────────
const selected = MUTATIONS.filter((m) => only.size === 0 || only.has(m.id));
const invalid = selected.filter((m) => occurrences(readFileSync(m.file, 'utf8'), m.find) !== 1);
if (invalid.length) {
  for (const m of invalid) {
    const n = occurrences(readFileSync(m.file, 'utf8'), m.find);
    console.error(`✗ ${m.id} ${m.file}: đoạn cần sửa xuất hiện ${n} lần (phải đúng 1)`);
  }
  console.error('\nMã nguồn đã đổi so với danh sách đột biến — cập nhật `find` rồi chạy lại.');
  process.exit(2);
}
if (DRY) {
  console.log(`✓ ${selected.length} đột biến đều áp được đúng một chỗ.`);
  process.exit(0);
}

const workDir = mkdtempSync(join(tmpdir(), 'nvg-mutation-'));
const reportFile = join(workDir, 'vitest.json');
const before = hashTree(SRC_DIRS);

// Mốc: bộ kiểm phải xanh trên mã chưa sửa, nếu không mọi «bắt được» đều vô nghĩa.
const baseline = runSuite(reportFile);
if (!baseline.passed) {
  console.error('Bộ kiểm đang đỏ trên mã chưa sửa — sửa trước rồi mới đo đột biến:');
  for (const f of baseline.failures) console.error(`  ${f}`);
  process.exit(2);
}

let pending: { file: string; original: string } | null = null;
const restore = () => {
  if (pending) {
    writeFileSync(pending.file, pending.original);
    pending = null;
  }
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}
// Lưới cuối: mọi đường thoát khác (ném ngoài `try`, `process.exit` ở nhánh lỗi) vẫn trả tệp về.
process.on('exit', restore);

const outcomes: Outcome[] = [];
try {
  for (const mutation of selected) {
    const original = readFileSync(mutation.file, 'utf8');
    pending = { file: mutation.file, original };
    const started = Date.now();
    try {
      // Hàm thay thế, KHÔNG phải chuỗi: `$&`, `$1`, `` $` `` trong chuỗi thay thế bị
      // `String.replace` hiểu là mẫu thế, nên một đột biến có `$` sẽ ghi sai mà không ai biết.
      writeFileSync(
        mutation.file,
        original.replace(mutation.find, () => mutation.replace),
      );
      const { passed, failures } = runSuite(reportFile);
      const outcome = { mutation, killed: !passed, caughtBy: failures, ms: Date.now() - started };
      outcomes.push(outcome);
      const mark = outcome.killed ? 'BỊ BẮT ' : 'SỐNG SÓT';
      console.log(`${mark} ${mutation.id} [${mutation.axis}] ${mutation.bug}`);
      if (outcome.killed) console.log(`         ↳ ${failures[0] ?? '(bộ kiểm đỏ)'}`);
    } finally {
      restore();
    }
  }
} finally {
  restore();
  rmSync(workDir, { recursive: true, force: true });
}

const after = hashTree(SRC_DIRS);
if (after !== before) {
  console.error('\n!!! Mã nguồn sau khi chạy KHÁC trước khi chạy. Kiểm tra `git diff` ngay.');
  process.exit(3);
}

const killed = outcomes.filter((o) => o.killed);
const survived = outcomes.filter((o) => !o.killed);
const byAxis = (axis: Axis) => {
  const all = outcomes.filter((o) => o.mutation.axis === axis);
  return `${all.filter((o) => o.killed).length}/${all.length}`;
};

console.log(
  `\nKết quả: ${killed.length}/${outcomes.length} đột biến bị bộ kiểm bắt ` +
    `(phân quyền ${byAxis('phân quyền')} · riêng tư ${byAxis('riêng tư')} · ` +
    `tiền ${byAxis('tiền')} · bản vẽ ${byAxis('bản vẽ')}).`,
);
console.log('Mã nguồn đã được khôi phục nguyên vẹn (băm mã nguồn trước = sau).');
if (survived.length) {
  console.log('\nĐột biến sống sót — bộ kiểm chưa canh được những lỗi này:');
  for (const o of survived) console.log(`  ${o.mutation.id} ${o.mutation.file}: ${o.mutation.bug}`);
  process.exit(1);
}
