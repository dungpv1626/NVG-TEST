/**
 * Mọi đường dẫn trình duyệt gọi qua `designApi` phải có một tuyến thật trong Worker.
 *
 * ## Vì sao cần một bài kiểm đọc thẳng mã nguồn
 *
 * Một tuyến gõ sai KHÔNG hỏng ở chỗ dễ thấy. `designApi` ném lỗi, TanStack Query hiện đúng một
 * dòng đỏ nhỏ trong panel — còn toàn bộ màn hình vẫn dựng, vẫn có dữ liệu, nút vẫn bấm được. Người
 * kiểm bằng mắt thấy màn hình «chạy».
 *
 * Đã xảy ra thật: hai nút «Chọn bản này» và «Thôi hiện» của bước Mặt đứng gọi `/design/facade/...`
 * trong khi tuyến nằm ở `/design/ai/facade/...` (T62, 20/09/2026). Lệch đúng một đoạn đường dẫn,
 * không một phép thử nào đỏ — vì phép thử giao diện mock cả tầng gọi mạng, còn phép thử Worker
 * gọi thẳng vào hàm xử lý. Chỉ bài kiểm đọc mã nguồn mới nối được hai đầu.
 *
 * Bảng tuyến dựng bằng cách đọc mã: KHÔNG nạp được `workers/src/index.ts` ở đây vì nó kéo theo các
 * mô-đun `-data` đọc YAML mà Vitest không phân tích nổi (quy tắc tách YAML, CLAUDE.md 8.x).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(resolve(ROOT, rel)).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') out.push(...sources(rel));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(rel);
    }
  }
  return out;
}

/** `METHOD /đường/dẫn` của mọi tuyến Hono, sau khi nối đủ tiền tố của các lần `route()`. */
function workerRoutes(): Set<string> {
  const files = sources('workers/src');
  const mounts: Array<{ parent: string; prefix: string; child: string }> = [];
  const handlers: Array<{ app: string; method: string; path: string }> = [];

  for (const file of files) {
    const code = readFileSync(resolve(ROOT, file), 'utf8');
    for (const m of code.matchAll(/(\w+)\.route\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g)) {
      mounts.push({ parent: m[1]!, prefix: m[2]!, child: m[3]! });
    }
    for (const m of code.matchAll(/(\w+)\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      handlers.push({ app: m[1]!, method: m[2]!.toUpperCase(), path: m[3]! });
    }
  }

  // Tiền tố của từng biến ứng dụng, lan từ gốc `app` của `workers/src/index.ts`.
  const prefix = new Map<string, string>([['app', '']]);
  for (let pass = 0; pass < mounts.length + 1; pass += 1) {
    for (const mount of mounts) {
      const base = prefix.get(mount.parent);
      if (base !== undefined) prefix.set(mount.child, `${base}${mount.prefix}`);
    }
  }

  const out = new Set<string>();
  for (const handler of handlers) {
    const base = prefix.get(handler.app);
    if (base === undefined) continue;
    out.add(`${handler.method} ${base}${handler.path}`.replace(/\/$/, ''));
  }
  return out;
}

/** Ô do `${…}` sinh ra — khớp với mọi giá trị. Ký tự không xuất hiện trong đường dẫn thật. */
const O_TRONG = '\u2022';

/** Đường dẫn trong mã giao diện: bỏ chuỗi truy vấn, đoạn `${…}` thành một ô trống. */
function clientPaths(): Array<{ file: string; method: string; path: string }> {
  const out: Array<{ file: string; method: string; path: string }> = [];
  for (const file of [...sources('web/src/hooks'), ...sources('web/src/pages')]) {
    const code = readFileSync(resolve(ROOT, file), 'utf8');
    const call = /designApi(?:<[^>]*>)?\(\s*(['`])([^'`]*?)\1\s*(,\s*\)|\)|,)/g;
    for (const m of code.matchAll(call)) {
      const raw = m[2]!;
      if (!raw.startsWith('/design/')) continue;
      // Tham số thứ hai = thân yêu cầu ⇒ POST; không có ⇒ GET (xem `designApi`). Dấu phẩy ngay
      // trước ngoặc đóng là dấu phẩy thừa của trình định dạng, không phải một tham số.
      out.push({
        file,
        method: m[3] === ',' ? 'POST' : 'GET',
        path: raw.split('?')[0]!.replace(/\$\{[^}]*\}/g, O_TRONG),
      });
    }
  }
  return out;
}

/** Một đoạn `:tên` của Hono, hoặc một đoạn do `${…}` sinh ra, khớp với mọi giá trị. */
function matches(route: string, path: string): boolean {
  const a = route.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i] || seg.startsWith(':') || b[i]!.includes(O_TRONG));
}

describe('đường dẫn `designApi` khớp tuyến Worker', () => {
  const routes = workerRoutes();

  it('bảng tuyến đọc ra được, và có những tuyến đã biết', () => {
    // Nếu cách đọc mã hỏng, tập này rỗng và mọi khẳng định dưới đây thành vô nghĩa.
    expect(routes.size).toBeGreaterThan(20);
    expect(routes).toContain('POST /design/ai/facade/choose');
    expect(routes).toContain('GET /design/ai/state/:projectId');
  });

  it('mọi lời gọi trong mã giao diện trỏ vào một tuyến có thật', () => {
    const lac = clientPaths().filter(
      (call) => ![...routes].some((route) => matches(route, `${call.method} ${call.path}`)),
    );
    expect(lac.map((c) => `${c.file}: ${c.method} ${c.path.split(O_TRONG).join('${…}')}`)).toEqual(
      [],
    );
  });
});
