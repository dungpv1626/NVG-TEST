/**
 * Nhúng bảng `users` qua PostgREST phải CHỈ ĐÍCH DANH khoá ngoại.
 *
 * ## Vì sao cần một bài kiểm đọc thẳng mã nguồn
 *
 * Gần như mọi bảng nghiệp vụ đều có nhiều cột trỏ về `users`: `created_by`, `updated_by`,
 * cộng thêm cột nghiệp vụ riêng (`user_id`, `responsible_user_id`, `changed_by`…). Khi câu
 * `select` nhúng `users(...)` mà không nêu tên khoá, PostgREST không đoán được đi theo cột
 * nào và trả **300 Multiple Choices**.
 *
 * Chỗ chết người: `supabase-js` KHÔNG coi 300 là lỗi. Hook không ném, TanStack Query không
 * vào nhánh lỗi, màn hình nhận mảng rỗng và vẽ ra trạng thái rỗng — đọc y hệt "chưa có dữ
 * liệu nào". Đúng thứ đã xảy ra thật với màn hình Người dùng của phân hệ Quản trị: bảng có
 * đủ tài khoản, giao diện nói "Chưa có tài khoản nào", không một dòng lỗi nào ở console.
 *
 * Kiểm thử đơn vị không bắt được vì nó mock cả tầng gọi mạng. Chỉ có bài kiểm đọc mã nguồn
 * mới giữ được ranh giới này.
 *
 * Cú pháp đúng: `users!<tên_khoá_ngoại>(cột, …)` — tên khoá lấy từ `pg_constraint`, không
 * đoán theo quy ước đặt tên (kho này có cả `_fkey` lẫn `_users_id_fk`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUEST_DETAIL_SELECT, REQUEST_LIST_SELECT } from '@/hooks/use-purchasing';

const ROOTS = ['web/src/hooks', 'web/src/pages', 'web/src/components'];

function allSources(): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(path);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        out.push({ file: path, code: readFileSync(resolve(process.cwd(), path), 'utf8') });
      }
    }
  };
  ROOTS.forEach(walk);
  return out;
}

describe('Nhúng bảng users qua PostgREST', () => {
  it('mọi chỗ nhúng `users(` đều nêu tên khoá ngoại', () => {
    /**
     * Bắt `users(` và `:users(` nhưng bỏ qua `users!ten_khoa(` — dấu `!` chính là phần nêu
     * tên khoá. Cũng bỏ qua `.from('users')`, đó là truy vấn thẳng bảng chứ không phải nhúng.
     */
    const offenders: string[] = [];

    for (const { file, code } of allSources()) {
      for (const [index, line] of code.split('\n').entries()) {
        if (!/(^|[^a-z_!])users\(/.test(line)) continue;
        if (/users!/.test(line)) continue;
        offenders.push(`${file}:${index + 1}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('mọi chỗ nhúng `user_companies(` đều nêu tên khoá ngoại', () => {
    // `user_companies` có ba cột trỏ về `users` (`user_id`, `created_by`, `updated_by`).
    const offenders: string[] = [];

    for (const { file, code } of allSources()) {
      for (const [index, line] of code.split('\n').entries()) {
        if (!/(^|[^a-z_!])user_companies\(/.test(line)) continue;
        if (/user_companies!/.test(line)) continue;
        offenders.push(`${file}:${index + 1}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Một truy vấn nhúng cùng một tên (`site:…`) hai lần thì PostgREST trả 400 «table name … specified
 * more than once» cho CẢ truy vấn. Lỗi thật 30/09/2026: danh sách đề nghị mua thêm `site(code)`
 * vào chuỗi cột dùng chung, chi tiết nối thêm `site(id, code, name)` → mọi trang chi tiết hỏng.
 */
describe('Mỗi tên nhúng xuất hiện một lần trong một truy vấn', () => {
  const aliases = (select: string) => [...select.matchAll(/(\w+):\w+!/g)].map((m) => m[1]);

  it.each([
    ['danh sách đề nghị mua', REQUEST_LIST_SELECT],
    ['chi tiết đề nghị mua', REQUEST_DETAIL_SELECT],
  ])('%s', (_name, select) => {
    const names = aliases(select);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
