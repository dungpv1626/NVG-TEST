/**
 * Seed phải mang đủ dữ liệu mà migration chèn theo vai trò — C-1, 30/09/2026.
 *
 * Trên một CSDL mới, migration chạy TRƯỚC seed. Lệnh chèn kiểu «mọi vai trò có mã X» gặp bảng vai
 * trò rỗng thì chèn 0 dòng mà không báo lỗi — CSDL cũ có dữ liệu chỉ vì seed đã chạy từ trước.
 * Phép thử đọc tệp migration, không chạm CSDL.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROLE_CAPABILITY_SEED, ROLE_SEED } from '../seed/data';

const MIGRATIONS = fileURLToPath(new URL('../../migrations/', import.meta.url));
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .join('\n');

describe('seed mang đủ dữ liệu migration chèn theo vai trò', () => {
  it('mọi năng lực migration từng cấp đều có trong ROLE_CAPABILITY_SEED', () => {
    const granted: string[] = [];
    for (const block of sql.matchAll(/INSERT INTO public\.role_capabilities[\s\S]*?;/g)) {
      for (const m of block[0].matchAll(/\('([A-Z_]+)',\s*'(design\.[a-z_.]+)'\)/g)) {
        granted.push(`${m[1]} ${m[2]}`);
      }
    }
    expect(granted.length, 'đọc được danh sách năng lực trong migration').toBeGreaterThan(20);

    const seeded = new Set(
      Object.entries(ROLE_CAPABILITY_SEED).flatMap(([role, caps]) =>
        caps.map((c) => `${role} ${c}`),
      ),
    );
    expect(granted.filter((g) => !seeded.has(g))).toEqual([]);
  });

  it('quyền phân hệ migration cấp theo vai trò cũng có trong ROLE_SEED', () => {
    const missing: string[] = [];
    for (const m of sql.matchAll(
      /INSERT INTO public\.permissions \(role_id, module_code, can_view\)\s*SELECT r\.id, '(\w+)', true\s*FROM public\.roles r\s*WHERE r\.code = '(\w+)'/g,
    )) {
      const [, module, role] = m;
      const perms = ROLE_SEED.find((r) => r.code === role)?.permissions as
        Record<string, string[]> | undefined;
      if (!perms?.[module!]?.includes('view')) missing.push(`${role} xem ${module}`);
    }
    expect(missing).toEqual([]);
  });
});
