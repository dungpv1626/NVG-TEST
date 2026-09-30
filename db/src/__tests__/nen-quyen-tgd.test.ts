/**
 * Hạn mức phê duyệt và thời hạn xử lý: CHỈ Tổng Giám đốc và Quản trị viên sửa được (0141).
 *
 * Haan 30/09/2026: «đồng ý, chỉ TGĐ». Hạn mức là cấu hình quyền lực nhất hệ thống — ai được duyệt
 * bao nhiêu tiền — nên canh cả hai chiều: TGĐ sửa được; Giám đốc Tài chính (trước 0141 được sửa
 * thời hạn) nay không sửa được, kể cả bằng cách gọi thẳng API.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/nen-quyen-tgd.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const SLA_TYPE = `${TEST_PREFIX}_quyen_tgd`;

describeDb('Hạn mức và thời hạn — chỉ Tổng Giám đốc sửa (0141)', () => {
  let tgd: SupabaseClient;
  let cfo: SupabaseClient;
  let limit: { id: string; max_amount: number | null };

  beforeAll(async () => {
    tgd = await signInAs(ACCOUNTS.tgd);
    cfo = await signInAs(ACCOUNTS.cfo);
    const { data } = await tgd
      .from('approval_limits')
      .select('id, max_amount')
      .eq('subject', 'purchase_request')
      .eq('step', 2)
      .limit(1)
      .single();
    limit = data as { id: string; max_amount: number | null };
  });

  afterAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await sql`DELETE FROM sla_definitions WHERE request_type = ${SLA_TYPE}`;
    } finally {
      await sql.end();
    }
  });

  it('Tổng Giám đốc sửa được hạn mức phê duyệt', async () => {
    // Ghi lại đúng giá trị đang có: kiểm quyền ghi mà không đổi cấu hình của bản chạy thử.
    const { data, error } = await tgd
      .from('approval_limits')
      .update({ max_amount: limit.max_amount })
      .eq('id', limit.id)
      .select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('Giám đốc Tài chính KHÔNG sửa được hạn mức phê duyệt', async () => {
    const { data } = await cfo
      .from('approval_limits')
      .update({ max_amount: 1 })
      .eq('id', limit.id)
      .select('id');
    expect(data ?? []).toEqual([]);
  });

  it('Tổng Giám đốc khai được thời hạn xử lý; Giám đốc Tài chính thì không', async () => {
    const byCfo = await cfo
      .from('sla_definitions')
      .insert({ request_type: SLA_TYPE, target_hours: 8, label: `${TEST_PREFIX} CFO` })
      .select('id');
    expect(byCfo.error).toBeTruthy();

    const byTgd = await tgd
      .from('sla_definitions')
      .insert({ request_type: SLA_TYPE, target_hours: 8, label: `${TEST_PREFIX} TGĐ` })
      .select('id')
      .single();
    expect(byTgd.error).toBeNull();

    const cfoEdit = await cfo
      .from('sla_definitions')
      .update({ target_hours: 1 })
      .eq('id', (byTgd.data as { id: string }).id)
      .select('id');
    expect(cfoEdit.data ?? []).toEqual([]);
  });
});
