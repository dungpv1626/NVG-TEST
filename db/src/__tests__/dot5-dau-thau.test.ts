/**
 * Đợt 5 — 5C-1, 5C-5, 5C-9: Đấu thầu NVC (migration 0208).
 *
 * Canh:
 *  1. Kho hồ sơ năng lực: Đấu thầu lập + gắn vào gói một bấm; giấy hết hạn TRƯỚC ngày nộp bị cờ
 *     đỏ; không gắn được giấy của pháp nhân khác; Kinh doanh không thấy.
 *  2. Báo cáo tài chính (Mẫu D): Đấu thầu thấy dòng, KHÔNG mở được tệp; CFO mở được và lượt mở
 *     được ghi `sensitive_access_logs`.
 *  3. Vòng làm rõ tự đánh số; đã trả lời thì không sửa câu hỏi; mọi lần đổi hạn nộp có lịch sử,
 *     gia hạn bắt buộc lý do.
 *  4. Bảo lãnh đã thu hồi thì khoá; chi tiết kết quả chỉ ghi sau khi có kết quả.
 *  5. Nhắc hạn: quá hạn nộp / làm rõ luôn báo một lần.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/dot5-dau-thau.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const isoDate = (offset: number) => {
  const d = new Date(Date.now() + 7 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

describeDb('5C — hồ sơ năng lực, làm rõ, bảo lãnh (0208)', () => {
  let da: SupabaseClient;
  let kd: SupabaseClient;
  let cfo: SupabaseClient;
  let nvc: string;
  let nvs: string;
  let bidId: string;
  let me: string;

  beforeAll(async () => {
    da = await signInAs(ACCOUNTS.dauThauNvc);
    kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    cfo = await signInAs(ACCOUNTS.cfo);
    nvc = (await da.from('companies').select('id').eq('code', 'NVC').single()).data!.id;
    nvs = (await cfo.from('companies').select('id').eq('code', 'NVS').single()).data!.id;
    me = (await da.rpc('auth_user_id')).data as string;
    const bid = await da
      .from('bidding_projects')
      .insert({
        company_id: nvc,
        code: `NVC-GT-THU5-${Math.floor(Math.random() * 900000 + 100000)}`,
        name: `${TEST_PREFIX} Gói thầu nhà xưởng 5C`,
        responsible_user_id: me,
        submission_deadline: isoDate(20),
      })
      .select('id')
      .single();
    if (bid.error) throw new Error(bid.error.message);
    bidId = bid.data.id;
  });

  afterAll(async () => {
    await sqlRun(async (sql) => {
      await sql`DELETE FROM notifications WHERE related_entity_id = ${bidId}`;
      await sql`DELETE FROM bidding_projects WHERE id = ${bidId}`;
      await sql`DELETE FROM sensitive_access_logs WHERE entity_type = 'company_documents'
                AND entity_id IN (SELECT id FROM company_documents WHERE title LIKE ${TEST_PREFIX + '%'})`;
      await sql`DELETE FROM company_documents WHERE title LIKE ${TEST_PREFIX + '%'}`;
    });
  });

  async function newDoc(category: string, title: string, extra: Record<string, unknown> = {}) {
    const r = await da
      .from('company_documents')
      .insert({ company_id: nvc, category, title: `${TEST_PREFIX} ${title}`, ...extra })
      .select('id, module')
      .single();
    if (r.error) throw new Error(r.error.message);
    return r.data as { id: string; module: string };
  }

  it('gắn hồ sơ năng lực một bấm; giấy hết hạn trước ngày nộp bị cờ đỏ; Kinh doanh không thấy', async () => {
    const license = await newDoc('phap_ly', 'Chứng chỉ năng lực hạng II', {
      expiry_date: isoDate(10),
    });
    const iso = await newDoc('chung_chi', 'ISO 9001', { expiry_date: isoDate(300) });
    expect(license.module).toBe('DA');

    for (const id of [license.id, iso.id]) {
      const l = await da
        .from('bid_capability_links')
        .insert({ bidding_project_id: bidId, company_document_id: id, company_id: nvc });
      expect(l.error).toBeNull();
    }
    const st = await da.rpc('bid_capability_status', { p_bidding_project_id: bidId });
    const rows = st.data as { document_id: string; expires_before_submission: boolean }[];
    expect(rows.find((r) => r.document_id === license.id)!.expires_before_submission).toBe(true);
    expect(rows.find((r) => r.document_id === iso.id)!.expires_before_submission).toBe(false);

    const other = await sqlRun(
      (sql) => sql<{ id: string }[]>`INSERT INTO company_documents (company_id, category, title)
        VALUES (${nvs}, 'phap_ly', ${TEST_PREFIX + ' Giấy NVS'}) RETURNING id`,
    );
    const bad = await da
      .from('bid_capability_links')
      .insert({ bidding_project_id: bidId, company_document_id: other[0]!.id, company_id: nvc });
    expect(bad.error).toBeTruthy();

    const kdSee = await kd.from('company_documents').select('id').eq('id', license.id);
    expect(kdSee.data ?? []).toHaveLength(0);
  });

  it('báo cáo tài chính: Đấu thầu thấy dòng nhưng không mở được tệp; CFO mở được và có nhật ký', async () => {
    const fs = await newDoc('bao_cao_tai_chinh', 'Báo cáo tài chính năm 2025', {
      fiscal_year: 2025,
    });
    const path = `${nvc}/${fs.id}/bctc-2025.pdf`;
    const up = await da.storage
      .from('company-docs')
      .upload(path, new Blob([PDF], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    expect(up.error).toBeNull();
    await da.from('company_documents').update({ file_path: path }).eq('id', fs.id);

    const row = await da.from('company_documents').select('id, fiscal_year').eq('id', fs.id);
    expect(row.data).toHaveLength(1);
    const daUrl = await da.storage.from('company-docs').createSignedUrl(path, 60);
    expect(daUrl.data?.signedUrl ?? null).toBeNull();
    const daOpen = await da.rpc('open_financial_statement', { p_document_id: fs.id });
    expect(daOpen.error).toBeTruthy();

    const cfoOpen = await cfo.rpc('open_financial_statement', { p_document_id: fs.id });
    expect(cfoOpen.error).toBeNull();
    expect(cfoOpen.data).toBe(path);
    const cfoUrl = await cfo.storage.from('company-docs').createSignedUrl(path, 60);
    expect(cfoUrl.error).toBeNull();
    const logs = await sqlRun(
      (sql) => sql<{ n: number }[]>`SELECT count(*)::int AS n FROM sensitive_access_logs
        WHERE entity_type = 'company_documents' AND entity_id = ${fs.id}`,
    );
    expect(logs[0]!.n).toBe(1);
  });

  it('vòng làm rõ tự đánh số; đã trả lời thì khoá câu hỏi; gia hạn có lịch sử và bắt buộc lý do', async () => {
    const q1 = await da
      .from('bid_clarifications')
      .insert({
        bidding_project_id: bidId,
        company_id: nvc,
        question: 'Khối lượng thép mái?',
        round_no: 0,
      })
      .select('id, round_no')
      .single();
    const q2 = await da
      .from('bid_clarifications')
      .insert({
        bidding_project_id: bidId,
        company_id: nvc,
        question: 'Có bắt buộc PCCC?',
        round_no: 0,
        due_date: isoDate(-1),
      })
      .select('id, round_no')
      .single();
    expect([q1.data!.round_no, q2.data!.round_no]).toEqual([1, 2]);

    const ans = await da
      .from('bid_clarifications')
      .update({ answer: 'Theo bản vẽ KC-05.' })
      .eq('id', q1.data!.id)
      .select('answered_date')
      .single();
    expect(ans.data!.answered_date).not.toBeNull();
    const edit = await da
      .from('bid_clarifications')
      .update({ question: 'Sửa câu hỏi' })
      .eq('id', q1.data!.id)
      .select('id');
    expect(edit.error?.message ?? '').toContain('đã có trả lời');

    const kdQ = await kd
      .from('bid_clarifications')
      .insert({ bidding_project_id: bidId, company_id: nvc, question: 'KD hỏi', round_no: 0 });
    expect(kdQ.error).toBeTruthy();

    const noReason = await da.rpc('extend_bid_deadline', {
      p_bidding_project_id: bidId,
      p_new_deadline: isoDate(25),
      p_reason: ' ',
    });
    expect(noReason.error).toBeTruthy();
    const ok = await da.rpc('extend_bid_deadline', {
      p_bidding_project_id: bidId,
      p_new_deadline: isoDate(25),
      p_reason: 'Văn bản gia hạn số 12/CĐT',
    });
    expect(ok.error).toBeNull();
    const hist = await da
      .from('bid_deadline_extensions')
      .select('old_deadline, new_deadline, reason')
      .eq('bidding_project_id', bidId);
    expect(hist.data).toEqual([
      { old_deadline: isoDate(20), new_deadline: isoDate(25), reason: 'Văn bản gia hạn số 12/CĐT' },
    ]);
  });

  it('nhắc: quá hạn làm rõ / quá hạn nộp luôn báo một lần', async () => {
    await sqlRun(
      (sql) =>
        sql`UPDATE bidding_projects SET submission_deadline = ${isoDate(-2)} WHERE id = ${bidId}`,
    );
    const count = (type: string) =>
      sqlRun(
        async (sql) =>
          (
            await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications
              WHERE related_entity_id = ${bidId} AND type = ${type} AND user_id = ${me}`
          )[0]!.n,
      );
    await sqlRun((sql) => sql`SELECT scan_bid_deadline_reminders()`);
    await sqlRun((sql) => sql`SELECT scan_bid_deadline_reminders()`);
    expect(await count('bid_deadline')).toBe(1);
    expect(await count('bid_clarification_due')).toBe(1);
  });

  it('bảo lãnh thu hồi thì khoá; chi tiết kết quả chỉ ghi sau khi có kết quả', async () => {
    const g = await da
      .from('bid_guarantees')
      .insert({
        bidding_project_id: bidId,
        company_id: nvc,
        amount: 150_000_000,
        bank_name: 'Ngân hàng thử',
        expiry_date: isoDate(60),
      })
      .select('id')
      .single();
    expect(g.error).toBeNull();
    await da
      .from('bid_guarantees')
      .update({ released_at: isoDate(0) })
      .eq('id', g.data!.id);
    const edit = await da
      .from('bid_guarantees')
      .update({ amount: 1 })
      .eq('id', g.data!.id)
      .select('id');
    expect(edit.error?.message ?? '').toContain('đã thu hồi');

    const early = await da.rpc('record_bid_outcome_details', {
      p_bidding_project_id: bidId,
      p_winner_name: 'Công ty A',
      p_winning_price: 9_000_000_000,
      p_reason: 'Giá thấp hơn',
    });
    expect(early.error).toBeTruthy();
    await sqlRun(
      (sql) => sql`UPDATE bidding_projects SET stage = 'truot_thau', submitted_at = now(),
                   lost_reason = 'Giá cao' WHERE id = ${bidId}`,
    );
    const kdDetail = await kd.rpc('record_bid_outcome_details', {
      p_bidding_project_id: bidId,
      p_winner_name: 'x',
      p_winning_price: 1,
      p_reason: 'x',
    });
    expect(kdDetail.error).toBeTruthy();
    const done = await da.rpc('record_bid_outcome_details', {
      p_bidding_project_id: bidId,
      p_winner_name: 'Công ty A',
      p_winning_price: 9_000_000_000,
      p_reason: 'Giá thấp hơn 4%',
    });
    expect(done.error).toBeNull();
  });
});
