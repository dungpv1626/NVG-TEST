/**
 * Nhãn tiếng Việt của enum trong CSDL — migration `0103_vietnamese_enum_labels.sql`.
 *
 * Chữ hiện ra màn hình được dựng ở HAI nơi: `shared/` cho phần giao diện tự vẽ, và CSDL cho
 * những câu do hàm SQL sinh (thông báo phát hành, kết quả kiểm tra đồng bộ, tên dòng ngân
 * sách). Hai bản sao không tránh được — Postgres không đọc được TypeScript — nên chỗ này là
 * nơi buộc chúng nói giống nhau.
 *
 * Không có phép thử này thì cách hỏng điển hình là: ai đó sửa nhãn trong `shared/`, màn hình
 * đổi ngay, còn thông báo và tên dòng ngân sách giữ chữ cũ mãi mãi. Không lỗi nào nổ ra, và
 * người dùng chỉ thấy cùng một thứ được gọi bằng hai tên.
 *
 * Chạy: `npx vitest run --project logic db/src/__tests__/enum-labels.test.ts`
 */

import { describe, expect, it } from 'vitest';
import { createConnection } from '../client';
import {
  COST_GROUPS,
  COST_GROUP_LABELS,
  DESIGN_DISCIPLINES,
  DESIGN_DISCIPLINE_LABELS,
  DISCIPLINE_TASK_STATUSES,
  DISCIPLINE_TASK_STATUS_META,
} from '@nvg/shared';
import { ACCOUNTS, hasCredentials, signInAs } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('Nhãn enum trong CSDL khớp bảng nhãn của shared/', () => {
  it('bộ môn thiết kế', async () => {
    const client = await signInAs(ACCOUNTS.thietKeNvo);
    for (const code of DESIGN_DISCIPLINES) {
      const { data, error } = await client.rpc('design_discipline_label', { p_discipline: code });
      expect(error, code).toBeNull();
      expect(data, code).toBe(DESIGN_DISCIPLINE_LABELS[code]);
    }
  });

  it('trạng thái phần việc bộ môn', async () => {
    const client = await signInAs(ACCOUNTS.thietKeNvo);
    for (const code of DISCIPLINE_TASK_STATUSES) {
      const { data, error } = await client.rpc('discipline_task_status_label', { p_status: code });
      expect(error, code).toBeNull();
      expect(data, code).toBe(DISCIPLINE_TASK_STATUS_META[code].label);
    }
  });

  it('nhóm chi phí', async () => {
    const client = await signInAs(ACCOUNTS.thietKeNvo);
    for (const code of COST_GROUPS) {
      const { data, error } = await client.rpc('cost_group_label', { p_group: code });
      expect(error, code).toBeNull();
      expect(data, code).toBe(COST_GROUP_LABELS[code]);
    }
  });

  /**
   * Canh chính cái lỗi đã lọt: dựng chữ hiện ra màn hình bằng cách thay gạch dưới trong mã
   * enum thành dấu cách.
   *
   * Cách đó cho ra "Bộ môn kien truc chưa có bản vẽ nào được phát hành." — tiếng Việt không
   * dấu giữa một câu có dấu, vi phạm CLAUDE.md 4.1. Nó lọt lưới lâu vì `grep` một câu tiếng
   * Việt không dấu không ra tệp nào: chuỗi hỏng chỉ thành hình lúc chạy.
   *
   * Hỏi thẳng `pg_get_functiondef` của CSDL ĐANG CHẠY chứ không đọc tệp migration: hàm có
   * thể được thay bằng một migration sau, và thứ người dùng nhìn thấy là bản đang chạy.
   */
  it('không hàm nào dựng chữ hiển thị bằng cách bỏ gạch dưới của mã enum', async () => {
    const { sql } = createConnection();
    try {
      const rows = await sql`
        SELECT p.proname AS name
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prokind = 'f'
           -- Không dùng dấu chéo ngược trong biểu thức: chuỗi này nằm trong template literal
           -- của JavaScript, và ở đó "\s" biến thành "s" trước khi tới Postgres — biểu thức
           -- vẫn chạy, vẫn không báo lỗi, nhưng khớp thứ khác hẳn. Đã dính đúng bẫy đó.
           AND pg_get_functiondef(p.oid) ~ '(initcap|lower)[(]replace[(][^)]*::text'
         ORDER BY 1`;
      expect(rows.map((r) => r.name)).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  /**
   * Phép thử này canh CHIỀU NGƯỢC LẠI: không nhánh enum nào thiếu nhãn.
   *
   * Hàm nhãn trả `NULL` cho nhánh chưa khai, và `format('%s', NULL)` cho ra chuỗi rỗng —
   * câu thông báo mất một mảnh mà không lỗi nào nổ ra. Đọc thẳng `pg_enum` thay vì duyệt
   * danh sách trong `shared/`: enum thêm nhánh bằng migration, và migration đó có thể quên
   * cập nhật cả `shared/` lẫn hàm nhãn cùng lúc — hỏi chính CSDL thì không trốn được.
   *
   * Đây là chỗ DUY NHẤT trong bộ kiểm thử dùng kết nối trực tiếp: `pg_catalog` không nằm
   * trong schema mà PostgREST mở ra, nên không có đường nào hỏi qua Supabase client.
   */
  it('mọi nhánh enum trong CSDL đều có nhãn, không nhánh nào trả rỗng', async () => {
    const { sql } = createConnection();
    try {
      const rows = await sql`
        SELECT t.typname AS enum_name, e.enumlabel AS code
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
         WHERE t.typname IN ('design_discipline', 'discipline_task_status', 'cost_group')
           AND CASE t.typname
                 WHEN 'design_discipline'      THEN public.design_discipline_label(e.enumlabel::design_discipline)
                 WHEN 'discipline_task_status' THEN public.discipline_task_status_label(e.enumlabel::discipline_task_status)
                 WHEN 'cost_group'             THEN public.cost_group_label(e.enumlabel::cost_group)
               END IS NULL
         ORDER BY 1, 2`;
      expect(rows.map((r) => `${r.enum_name}.${r.code}`)).toEqual([]);
    } finally {
      await sql.end();
    }
  });
});
