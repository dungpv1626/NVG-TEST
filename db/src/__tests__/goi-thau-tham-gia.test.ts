/**
 * G6 (0247, kế hoạch A10): gói thầu có hình thức + loại công trình, Ban Giám đốc quyết định tham gia,
 * Cung ứng / Thi công / Kế toán góp ý trên gói thầu.
 *
 * Canh:
 *  - chưa duyệt tham gia thì Đấu thầu không lập được dự toán, gói không vào được Lập dự toán;
 *  - cột quyết định không tự khai được từ trình duyệt, kể cả lúc tạo gói;
 *  - Đấu thầu không tự duyệt được quyết định của mình (không có hạn mức);
 *  - Ban Giám đốc từ chối = «Không tham gia» kèm lý do, gói đóng, cơ hội gốc sang Mất cơ hội;
 *  - Thi công / Kế toán / Cung ứng trả lời được yêu cầu ý kiến, đọc được tóm tắt gói nhưng KHÔNG đọc
 *    được gói thầu, dự toán, giá dự thầu; phòng này không đọc / ghi được ý kiến của phòng kia;
 *  - xin ý kiến thì báo người của phòng, trả lời thì báo người xin.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/goi-thau-tham-gia.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BID_REVIEW_DEPARTMENTS,
  BID_WORK_TYPES,
  bidAssessmentMissing,
  PROCUREMENT_FORMS,
  type BidAssessment,
} from '@nvg/shared';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

type Sql = ReturnType<typeof import('../client').createConnection>['sql'];

async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const FULL_ASSESSMENT = {
  criteria: {
    nang_luc: { rating: 'thuan_loi', note: '' },
    tien_do: { rating: 'can_luu_y', note: 'Trùng hai công trình đang chạy tháng 3' },
    dong_tien: { rating: 'can_luu_y', note: 'Tạm ứng 10 %, phải ứng vốn thép' },
    phap_ly: { rating: 'thuan_loi' },
    canh_tranh: { rating: 'rui_ro_cao', note: 'Bốn nhà thầu, có hai đơn vị giá thấp' },
    loi_nhuan: { rating: 'thuan_loi' },
  },
  recommendation: 'tham_gia',
  summary: 'Năng lực đáp ứng, cần chuẩn bị dòng tiền.',
};

let nvcId = '';
let stamp = 0;

describeDb('Gói thầu — quyết định tham gia và ý kiến các phòng (0247)', () => {
  let dt: SupabaseClient;
  let tgd: SupabaseClient;
  let tc: SupabaseClient;
  let kt: SupabaseClient;
  let mh: SupabaseClient;
  let dtId = '';

  beforeAll(async () => {
    [dt, tgd, tc, kt, mh] = await Promise.all([
      signInAs(ACCOUNTS.dauThauNvc),
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.ketoan),
      signInAs(ACCOUNTS.muaHang),
    ]);
    await withSql(async (sql) => {
      const [c] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = c!.id;
      const [u] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.dauThauNvc}`;
      dtId = u!.id;
    });
  });

  /** Đấu thầu tạo gói qua trình duyệt — kể cả khi cố khai sẵn «đã duyệt». */
  async function newBid(label: string, opportunityId: string | null = null): Promise<string> {
    stamp += 1;
    const { data, error } = await dt
      .from('bidding_projects')
      .insert({
        company_id: nvcId,
        code: `DA-G6-${label}-${Date.now()}-${stamp}`,
        name: `${TEST_PREFIX} G6 ${label} ${stamp}`,
        responsible_user_id: dtId,
        opportunity_id: opportunityId,
        estimated_value: 9_000_000_000,
        participation_status: 'da_duyet',
      })
      .select('id, participation_status')
      .single();
    expect(error).toBeNull();
    expect(data!.participation_status, 'tạo gói không khai được «đã duyệt»').toBe('chua_danh_gia');
    return data!.id as string;
  }

  async function fill(id: string, assessment: object = FULL_ASSESSMENT) {
    const { error } = await dt
      .from('bidding_projects')
      .update({
        procurement_form: 'dau_thau',
        work_type: 'xay_moi_nha_xuong',
        participation_assessment: assessment,
      })
      .eq('id', id);
    expect(error).toBeNull();
  }

  async function approvalOf(id: string): Promise<string> {
    return withSql(async (sql) => {
      const [a] = await sql<{ id: string }[]>`
        SELECT id FROM approvals WHERE entity_type = 'bidding_projects' AND entity_id = ${id}
           AND status = 'pending_approval'`;
      return a!.id;
    });
  }

  const insertEstimate = (id: string) =>
    dt.from('estimates').insert({
      company_id: nvcId,
      bidding_project_id: id,
      code: `DT-G6-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    });

  it('chưa duyệt tham gia → không lập được dự toán, điều kiện bước nói lý do; duyệt xong thì lập được', async () => {
    const id = await newBid('cua-chan');

    const blocked = await insertEstimate(id);
    expect(blocked.error?.code).toBe('42501');
    expect(blocked.error?.message).toMatch(/chưa được Ban Giám đốc duyệt tham gia/);

    const { data: ready } = await dt.rpc('stage_readiness', { p_entity_type: 'bidding', p_id: id });
    const req = (ready as { for_stage: string; met: boolean; label: string }[]).find(
      (r) => r.for_stage === 'du_toan',
    );
    expect(req?.met).toBe(false);
    expect(req?.label).toMatch(/Đánh giá và quyết định tham gia/);

    // Tự khai quyết định từ trình duyệt bị chặn.
    const self = await dt
      .from('bidding_projects')
      .update({ participation_status: 'da_duyet' })
      .eq('id', id);
    expect(self.error?.code).toBe('42501');

    // Thiếu đánh giá → gửi không được, nói rõ thiếu gì.
    const empty = await dt.rpc('submit_bid_participation', { p_bidding_project_id: id });
    expect(empty.error?.message).toMatch(/hình thức lựa chọn nhà thầu/);
    await fill(id, { criteria: { nang_luc: { rating: 'rui_ro_cao' } } });
    const partial = await dt.rpc('submit_bid_participation', { p_bidding_project_id: id });
    expect(partial.error?.message).toMatch(/Năng lực: ghi rõ vì sao.*Tiến độ: chọn mức.*Đề xuất/);

    await fill(id);
    const sent = await dt.rpc('submit_bid_participation', { p_bidding_project_id: id });
    expect(sent.error).toBeNull();

    // Đã gửi thì đánh giá khoá; vẫn chưa lập dự toán được.
    const locked = await dt.from('bidding_projects').update({ work_type: 'bao_tri' }).eq('id', id);
    expect(locked.error?.code).toBe('42501');
    expect((await insertEstimate(id)).error?.message).toMatch(/đang chờ Ban Giám đốc duyệt/);

    // Đấu thầu không tự duyệt được (không có hạn mức bid_participation).
    const approvalId = await approvalOf(id);
    const selfApprove = await dt.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: 'Tự duyệt',
    });
    expect(selfApprove.error?.message).toMatch(/hạn mức phê duyệt/);

    const ok = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: 'Tham gia, chuẩn bị bảo lãnh.',
    });
    expect(ok.error).toBeNull();

    expect((await insertEstimate(id)).error).toBeNull();
    await withSql(async (sql) => {
      const [b] = await sql`SELECT stage::text, participation_status, participation_decision_note
                              FROM bidding_projects WHERE id = ${id}`;
      expect(b!.stage).toBe('du_toan');
      expect(b!.participation_status).toBe('da_duyet');
      expect(b!.participation_decision_note).toBe('Tham gia, chuẩn bị bảo lãnh.');
      const [n] = await sql`SELECT count(*)::int AS c FROM notifications
                             WHERE related_entity_id = ${id} AND user_id = ${dtId}
                               AND type = 'bid_participation_approved'`;
      expect(n!.c).toBe(1);
    });
    const { data: after } = await dt.rpc('stage_readiness', { p_entity_type: 'bidding', p_id: id });
    expect((after as { met: boolean }[]).every((r) => r.met)).toBe(true);
  });

  it('gói chưa duyệt không vào được Lập dự toán kể cả qua hàm nghiệp vụ của người dùng', async () => {
    const id = await newBid('qua-ham');
    // Dự toán có sẵn (do hệ thống / dữ liệu cũ) — người dùng trình giá thì bước bị chặn.
    const estimateId = await withSql(async (sql) => {
      const [e] = await sql<{ id: string }[]>`
        INSERT INTO estimates (company_id, bidding_project_id, code, bid_price)
        VALUES (${nvcId}, ${id}, ${'DT-G6Q-' + Date.now()}, 1000000) RETURNING id`;
      return e!.id;
    });
    const r = await dt.rpc('request_estimate_approval', { p_estimate_id: estimateId });
    expect(r.error?.message).toMatch(/chưa được Ban Giám đốc duyệt tham gia/);
  });

  it('Ban Giám đốc từ chối → Không tham gia kèm lý do, gói đóng, cơ hội gốc Mất cơ hội', async () => {
    const oppId = await withSql(async (sql) => {
      const [customer] = await sql`SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1`;
      const [owner] =
        await sql`SELECT id FROM users WHERE email = 'kinhdoanh.nvc@nhavietgroup.test'`;
      const [o] = await sql`
        INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
        VALUES (${nvcId}, ${'G6-CH-' + Date.now()}, ${customer!.id}, ${TEST_PREFIX + ' G6 cơ hội'},
                ${owner!.id}, 'bao_gia')
        RETURNING id`;
      return o!.id as string;
    });
    const id = await newBid('tu-choi', oppId);
    await fill(id);
    expect(
      (await dt.rpc('submit_bid_participation', { p_bidding_project_id: id })).error,
    ).toBeNull();
    const approvalId = await approvalOf(id);

    const noReason = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'rejected',
      p_note: ' ',
    });
    expect(noReason.error?.message).toMatch(/lý do/);

    const rejected = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'rejected',
      p_note: 'Dòng tiền quý 1 không đủ để ứng vốn',
    });
    expect(rejected.error).toBeNull();

    await withSql(async (sql) => {
      const [b] =
        await sql`SELECT stage::text, participation_status, lost_reason, deadline_reminded_stage
                              FROM bidding_projects WHERE id = ${id}`;
      expect(b!.stage).toBe('khong_tham_gia');
      expect(b!.participation_status).toBe('khong_tham_gia');
      expect(b!.lost_reason).toBe('Không tham gia: Dòng tiền quý 1 không đủ để ứng vốn');
      expect(b!.deadline_reminded_stage).toBe(0);
      const [o] = await sql`SELECT stage::text, lost_reason FROM opportunities WHERE id = ${oppId}`;
      expect(o!.stage).toBe('mat_co_hoi');
      expect(o!.lost_reason).toMatch(/^Không tham gia gói thầu DA-G6-tu-choi-.*: Dòng tiền quý 1/);
    });
    expect((await insertEstimate(id)).error?.message).toMatch(/không tham gia/);
    expect(
      (await dt.rpc('request_bid_reviews', { p_bidding_project_id: id, p_departments: ['TC'] }))
        .error?.message,
    ).toMatch(/đã kết thúc/);
  });

  it('xin ý kiến ba phòng → báo đúng người; phòng trả lời được, không đọc được gói thầu và giá', async () => {
    const id = await newBid('y-kien');
    const req = await dt.rpc('request_bid_reviews', {
      p_bidding_project_id: id,
      p_departments: ['MH', 'TC', 'KT'],
      p_note: 'Cần ý kiến trước thứ sáu',
    });
    expect(req.error).toBeNull();
    expect(req.data).toBe(3);

    // Người khác ngoài người chịu trách nhiệm không xin được (Thi công gọi thử).
    const foreign = await tc.rpc('request_bid_reviews', {
      p_bidding_project_id: id,
      p_departments: ['TC'],
    });
    expect(foreign.error).not.toBeNull();

    const reviewIds = await withSql(async (sql) => {
      const rows = await sql<{ id: string; department: string }[]>`
        SELECT id, department FROM bid_department_reviews WHERE bidding_project_id = ${id}`;
      const byDept = Object.fromEntries(rows.map((r) => [r.department, r.id]));
      for (const [email, dept] of [
        [ACCOUNTS.muaHang, 'MH'],
        [ACCOUNTS.congTruongNvc, 'TC'],
        [ACCOUNTS.ketoan, 'KT'],
        [ACCOUNTS.cfo, 'KT'],
      ] as const) {
        const [n] = await sql`
          SELECT count(*)::int AS c FROM notifications n JOIN users u ON u.id = n.user_id
           WHERE u.email = ${email} AND n.type = 'bid_review_requested'
             AND n.related_entity_id = ${byDept[dept]!} AND n.action_url = ${'/y-kien-goi-thau/' + byDept[dept]!}`;
        expect(n!.c, `${email} phải được báo`).toBe(1);
      }
      // Đấu thầu (người xin) không tự báo cho mình; Kinh doanh không thuộc phòng nào.
      const [none] = await sql`
        SELECT count(*)::int AS c FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE u.email = ${ACCOUNTS.kinhDoanhNvc} AND n.type = 'bid_review_requested'
           AND n.related_entity_id = ANY (${rows.map((r) => r.id)})`;
      expect(none!.c).toBe(0);
      return byDept as Record<'MH' | 'TC' | 'KT', string>;
    });

    // Thi công / Kế toán: không đọc được gói thầu, dự toán; đọc được tóm tắt của đúng phòng mình.
    for (const [client, dept] of [
      [tc, 'TC'],
      [kt, 'KT'],
      [mh, 'MH'],
    ] as const) {
      const bid = await client.from('bidding_projects').select('id').eq('id', id);
      expect(bid.data, `${dept} không đọc được gói thầu`).toEqual([]);
      const est = await client
        .from('estimates')
        .select('id, bid_price')
        .eq('bidding_project_id', id);
      expect(est.data ?? [], `${dept} không đọc được dự toán`).toEqual([]);
      const { data: mine, error } = await client.rpc('bid_reviews', { p_bidding_project_id: id });
      expect(error).toBeNull();
      const rows = mine as Record<string, unknown>[];
      expect(rows.map((r) => r.department)).toEqual([dept]);
      expect(rows[0]!.bid_code).toMatch(/^DA-G6-y-kien/);
      expect(rows[0]!.can_respond).toBe(true);
      expect(Object.keys(rows[0]!).some((k) => /bid_price|cost|profit|margin/.test(k))).toBe(false);
    }

    // Thi công trả lời thiếu → nói rõ; trả lời ý kiến của Kế toán → bị chặn.
    const short = await tc.rpc('submit_bid_review', {
      p_review_id: reviewIds.TC,
      p_recommendation: 'dong_y',
      p_method_opinion: 'Lắp dựng bằng cẩu 50 tấn',
    });
    expect(short.error?.message).toMatch(/năng lực đáp ứng/);
    const cross = await tc.rpc('submit_bid_review', {
      p_review_id: reviewIds.KT,
      p_recommendation: 'dong_y',
      p_cash_flow_opinion: 'x',
      p_guarantee_opinion: 'x',
      p_payment_terms_opinion: 'x',
    });
    expect(cross.error).not.toBeNull();

    expect(
      (
        await tc.rpc('submit_bid_review', {
          p_review_id: reviewIds.TC,
          p_recommendation: 'dong_y_co_dieu_kien',
          p_method_opinion: 'Lắp dựng bằng cẩu 50 tấn, thi công cuốn chiếu',
          p_capacity_opinion: 'Có chỉ huy trưởng từ tháng 2',
          p_summary: 'Cần lùi tiến độ 2 tuần',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await kt.rpc('submit_bid_review', {
          p_review_id: reviewIds.KT,
          p_recommendation: 'dong_y',
          p_cash_flow_opinion: 'Âm tiền tháng 2–3 khoảng 1,2 tỷ',
          p_guarantee_opinion: 'Hạn mức bảo lãnh còn 3 tỷ',
          p_payment_terms_opinion: 'Tạm ứng 10 %, giữ lại 5 %',
        })
      ).error,
    ).toBeNull();

    // Cung ứng đính kèm báo giá: được vào yêu cầu của mình, không vào yêu cầu của phòng khác.
    const okFile = await mh.from('bid_department_review_files').insert({
      review_id: reviewIds.MH,
      file_path: `${reviewIds.MH}/bao-gia-thep.pdf`,
      file_name: 'bao-gia-thep.pdf',
    });
    expect(okFile.error).toBeNull();
    const badFile = await mh.from('bid_department_review_files').insert({
      review_id: reviewIds.TC,
      file_path: `${reviewIds.TC}/x.pdf`,
      file_name: 'x.pdf',
    });
    expect(badFile.error).not.toBeNull();

    // Người chịu trách nhiệm thấy cả ba ý kiến và được báo khi phòng trả lời.
    const { data: all } = await dt.rpc('bid_reviews', { p_bidding_project_id: id });
    const rows = all as { department: string; status: string; file_count: number }[];
    expect(rows.map((r) => `${r.department}:${r.status}`).sort()).toEqual([
      'KT:da_gop_y',
      'MH:cho_y_kien',
      'TC:da_gop_y',
    ]);
    expect(rows.find((r) => r.department === 'MH')!.file_count).toBe(1);
    await withSql(async (sql) => {
      const [n] = await sql`SELECT count(*)::int AS c FROM notifications
                             WHERE user_id = ${dtId} AND related_entity_id = ${id}
                               AND type = 'bid_review_answered'`;
      expect(n!.c).toBe(2);
    });
  });

  it('danh sách mã và quy tắc đánh giá khớp giữa CSDL và shared', async () => {
    await withSql(async (sql) => {
      const defs = await sql<{ conname: string; def: string }[]>`
        SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname IN ('bidding_projects_procurement_form_check', 'bidding_projects_work_type_check')
            OR (conrelid = 'public.bid_department_reviews'::regclass AND contype = 'c'
                AND pg_get_constraintdef(oid) LIKE '%department%')`;
      const codes = (name: string) =>
        [...(defs.find((d) => d.conname.includes(name))?.def ?? '').matchAll(/'([a-z_A-Z]+)'/g)]
          .map((m) => m[1])
          .sort();
      expect(codes('procurement_form')).toEqual([...PROCUREMENT_FORMS].sort());
      expect(codes('work_type')).toEqual([...BID_WORK_TYPES].sort());
      expect(codes('department')).toEqual([...BID_REVIEW_DEPARTMENTS].sort());

      const cases: BidAssessment[] = [
        {},
        FULL_ASSESSMENT as BidAssessment,
        { criteria: { nang_luc: { rating: 'rui_ro_cao' }, tien_do: { rating: 'thuan_loi' } } },
        { ...(FULL_ASSESSMENT as BidAssessment), recommendation: null },
      ];
      for (const c of cases) {
        const [r] = await sql<{ m: string[] }[]>`
          SELECT public.bid_assessment_missing(${JSON.stringify(c)}::jsonb) AS m`;
        expect(r!.m.length, JSON.stringify(c)).toBe(bidAssessmentMissing(c).length);
      }
    });
  });
});
