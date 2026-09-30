/**
 * Chốt chặn tách môi trường (C-1) — `db/src/env.ts`.
 *
 * Chạy `env.ts` trong tiến trình con với chuỗi kết nối GIẢ trỏ vào project demo. Không mở kết nối
 * nào: chốt phải đánh trước khi có kết nối, nên chỉ cần nạp tệp là đủ để thấy nó đánh hay không.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_PROJECT_REF } from '../env';

const ENV_TS = fileURLToPath(new URL('../env.ts', import.meta.url));
const FAKE_DEMO_DB = `postgresql://postgres.${DEMO_PROJECT_REF}:x@pooler.example:5432/postgres`;
const FAKE_LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';

function load(env: Record<string, string>): { ok: boolean; stderr: string } {
  const base = { ...process.env };
  // Bỏ biến của chính lượt kiểm thử này để mỗi ca chỉ thấy đúng thứ nó đặt.
  for (const k of ['VITEST', 'NVG_DB_TARGET', 'DATABASE_URL', 'SUPABASE_URL']) delete base[k];
  const r = spawnSync('npx', ['tsx', '-e', `import(${JSON.stringify(ENV_TS)})`], {
    env: { ...base, ...env },
    encoding: 'utf8',
  });
  return { ok: r.status === 0, stderr: r.stderr };
}

describe('chốt chặn bản chạy thử / demo', () => {
  it('bộ kiểm thử trỏ vào demo thì dừng — kể cả khi gọi tường minh', () => {
    const plain = load({ VITEST: 'true', DATABASE_URL: FAKE_DEMO_DB });
    expect(plain.ok).toBe(false);
    expect(plain.stderr).toContain('Bộ kiểm thử đang trỏ vào bản chạy thử');

    const explicit = load({ VITEST: 'true', NVG_DB_TARGET: 'demo', DATABASE_URL: FAKE_DEMO_DB });
    expect(explicit.ok).toBe(false);
  });

  it('lệnh thường trỏ vào demo mà không gọi tường minh thì dừng', () => {
    const r = load({ SUPABASE_URL: `https://${DEMO_PROJECT_REF}.supabase.co` });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('db:migrate:demo');
  });

  it('trỏ về máy thì chạy bình thường', () => {
    expect(load({ DATABASE_URL: FAKE_LOCAL_DB }).ok).toBe(true);
    expect(load({ VITEST: 'true', DATABASE_URL: FAKE_LOCAL_DB }).ok).toBe(true);
  });
});
