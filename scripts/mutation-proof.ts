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
 * ⚠️⚠️ Script GHI ĐÈ `workers/src/**` MỘT LƯỢT CHO MỖI ĐỘT BIẾN — nay 23 lượt. Đang có
 * `wrangler dev` chạy thì mỗi lượt là một lần nạp lại Worker với mã đã cài lỗi, và nạp lại GIẾT
 * instance Workflow đang bay của Haan. Đã xảy ra thật ba lần (11/09, 13/09, 20/09). Kiểm
 * `ps aux | grep wrangler` và `SELECT status FROM design_ai_run ORDER BY created_at DESC LIMIT 1`
 * TRƯỚC KHI CHẠY.
 *
 * AN TOÀN: tệp gốc đọc vào bộ nhớ và ghi trả lại trong `finally`, kể cả khi bấm Ctrl+C. Trước và
 * sau khi chạy, script băm toàn bộ mã nguồn và báo lỗi nếu hai bản băm khác nhau.
 */

type Axis = 'phân quyền' | 'riêng tư' | 'tiền' | 'tiền gọi mô hình' | 'bản vẽ' | 'số đo';

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

  {
    id: 'M24',
    axis: 'phân quyền',
    file: 'shared/src/design/brief-form-overlay.ts',
    bug: 'Quản trị viên ẩn được câu hỏi BẮT BUỘC của hợp đồng (số tầng, bề rộng lô) — biểu mẫu vẫn chạy, chỉ ngắn đi, rồi MỌI đầu bài mới sau đó không chốt được và không màn hình nào nói vì sao',
    find: '      if (LOCKED_PATHS.includes(field.path)) {',
    replace: '      if (false) {',
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
  {
    id: 'M12',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/facade/score.ts',
    bug: 'Vòng tự sửa gửi cả tiêu chí do CHƯƠNG TRÌNH quyết cho mô hình — mỗi lượt sửa là tiền thật, và mô hình không sửa nổi cao độ lanh tô hay chiều cao lan can vì nó không cầm những số ấy (T63)',
    find: '    .filter((c) => c.doAi && c.score !== null && c.score < 1)',
    replace: '    .filter((c) => c.score !== null && c.score < 1)',
  },
  {
    id: 'M13',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/review.ts',
    bug: 'Tiêu chí kỹ sư KHÔNG chấm bị tính là chấm 0 — «tôi không có ý kiến» thành «tôi chấm trượt», và bảng điểm vẫn ra một con số trông bình thường (T63)',
    find: '    if (!row) return c;',
    replace: '    if (!row) return { ...c, score: 0 };',
  },
  {
    id: 'M14',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/score.ts',
    bug: 'Mặt tiền KHÔNG CÓ cửa sổ bị xếp thành «thiếu đầu vào» — mẫu số của điểm co lại vì một chuyện bình thường (Haan, 20/09/2026: có nhà cần có cửa sổ, có nhà không)',
    find: '      return windowsOn(concept, refLevel(concept)).length > 0 || KHONG_CUA_SO;',
    replace: '      return true;',
  },
  {
    id: 'M15',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/merge.ts',
    bug: 'Chiều cao lan can kỹ sư điền trong phiếu bị bỏ — tờ vẽ dựng theo quy ước cấu tạo, còn thước chấm đo đúng con số ấy, nên điểm nói về một cái lan can không có trên giấy (T65)',
    find: '      railing_h_cm: brief?.balcony.h_cm ?? null,',
    replace: '      railing_h_cm: null,',
  },

  // ── Phối cảnh (T67) ───────────────────────────────────────────────────────────────────
  {
    id: 'M16',
    axis: 'tiền',
    file: 'workers/src/design/ai/perspective/views.ts',
    bug: 'Góc nghiêng và toàn cảnh chạy khi CHƯA có tờ mặt bằng mái — trả tiền hai lượt để mô hình đoán chiều sâu nhà, và ảnh mâu thuẫn với mặt bằng (T65)',
    find: "    if (has.has('roof_plan')) {",
    replace: '    if (true) {',
  },
  {
    id: 'M18',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/draw/roof-plan.ts',
    bug: 'Vạch lối vào trên tờ mặt bằng mái vẽ bằng nét mảnh TRÙNG bề dày tường — hai cửa biến mất khỏi tờ neo, mô hình không biết xe vào phía nào, và tờ vẽ vẫn trông bình thường (đã dựng sai đúng như vậy ở bản đầu)',
    find: '        class: CLS.roofEntrance,',
    replace: '        class: CLS.roofBelow,',
  },
  {
    id: 'M19',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/perspective/views.ts',
    bug: 'Cho phép vẽ lại LẺ tấm mặt tiền ban ngày — bốn góc kia vẫn dựng theo tấm cũ, nên bộ năm ảnh giao khách là của HAI ngôi nhà, và không có gì trên màn hình nói ra (T67 Đợt C)',
    find: '  return view === SET_ANCHOR_VIEW',
    replace: '  return false',
  },
  {
    id: 'M23',
    axis: 'số đo',
    file: 'workers/src/design/ai/draw/svg.ts',
    bug: 'Ranh thửa mượn tên lớp CSS của lan can — luật sau đè luật trước, lan can của MỌI tờ mặt đứng thành nét đứt sai quy ước, và ảnh chụp vàng không bắt được vì hình y nguyên, chỉ CSS khác (đã xảy ra thật khi dựng T68)',
    find: "  roofLot: 'rlot',",
    replace: "  roofLot: 'rl',",
  },
  {
    id: 'M22',
    axis: 'số đo',
    file: 'workers/src/design/ai/perspective/prompt.ts',
    bug: 'Lời dẫn nói chiều sâu sân nhưng KHÔNG nói hệ quả — vẫn xin «một chiếc ô tô cho sinh động» trong cái sân 3 m ngắn hơn thân xe, nên mô hình nới sân ra cho vừa chiếc xe (đúng tấm ảnh Haan đo được 20/09/2026)',
    find: '    ctx.yard !== null && ctx.yard.frontM > 0 && ctx.yard.frontM < block.scale.carLengthM;',
    replace: '    false as boolean;',
  },
  {
    id: 'M21',
    axis: 'số đo',
    file: 'workers/src/design/ai/perspective/context.ts',
    bug: 'Khoảng sân thu về một bit có-hay-không thay vì số đo bốn mặt — đầu bài khai sân trước 3 m, ảnh phối cảnh vẽ 8–10 m, sai rõ tới mức một thân ô tô đã hơn 4 m mà sân vẫn thừa (Haan, 20/09/2026)',
    find: '    yard: yardOf(plan, lot),',
    replace: '    yard: lot ? { frontM: 0, backM: 0, leftM: 0, rightM: 0 } : null,',
  },
  {
    id: 'M20',
    axis: 'tiền',
    file: 'workers/src/design/workflows/ai-perspective-steps.ts',
    bug: 'Nút «Dừng» không cắt được lời gọi đang bay — màn hình nói «đang dừng» trong khi lượt vẽ vẫn chạy hết bốn phút và vẫn tính tiền, và không có gì đỏ ở đâu (Haan, 20/09/2026: «cứ chạy mãi… thêm nút stop»)',
    find: '      ...(signal ? { signal } : {}),',
    replace: '      ...(false as boolean ? { signal } : {}),',
  },
  {
    id: 'M17',
    axis: 'riêng tư',
    file: 'workers/src/design/ai/perspective/prompt.ts',
    bug: 'Hiện trạng một phía KHÔNG khai vẫn được nói ra — lời dẫn bịa ra nhà hàng xóm hoặc đất trống không tồn tại, và người xem tin ngay vì nó nằm trong ảnh chứ không nằm trong chữ',
    find: '      const phrase = code ? table[code] : undefined;',
    replace: "      const phrase = code ? table[code] : 'an empty plot';",
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
