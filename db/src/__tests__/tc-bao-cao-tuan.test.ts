/**
 * T3 + T4 (doc/KE_HOACH_THI_CONG_THEO_KHAO_SAT.md, migration 0242).
 *
 * T3 — kế hoạch tuần, đánh dấu trong nhật ký:
 *   · chỉ huy trưởng lập đầu việc trên công trình được giao; tổ đội công trình khác bị chặn;
 *   · chỉ huy trưởng công trình khác không lập được, không thấy gì;
 *   · «chép việc chưa xong của tuần trước» chép phần còn lại của khối lượng, bấm lại không nhân bản;
 *   · đánh dấu «xong» trong nhật ký đóng đầu việc; người khác không đánh dấu thay vào nhật ký của mình.
 * T4 — báo cáo tuần / tháng:
 *   · gửi xong là dòng bất biến (kể cả quyền cao nhất của CSDL) và báo Trưởng phòng + giám đốc;
 *   · giám đốc đọc được; chỉ huy trưởng công trình khác không đọc được, hàm số liệu từ chối;
 *   · số liệu không chứa tiền (không khoá tiền, không giá trị hợp đồng / khoán nào lọt vào);
 *   · chưa có dữ liệu thì NULL, không 0.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-bao-cao-tuan.test.ts --pool=forks --poolOptions.forks.maxForks=1`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Số tiền dễ nhận ra — không được xuất hiện ở bất kỳ đâu trong số liệu báo cáo. */
const CONTRACT_VALUE = 7_654_321_987;
const CREW_VALUE = 312_456_789;

interface Fixture {
  companyId: string;
  contractId: string;
  siteId: string;
  otherSiteId: string;
  crewId: string;
  otherCrewId: string;
  milestoneId: string;
  milestoneLabel: string;
  chtId: string;
  tpId: string;
  tgdId: string;
  thisWeek: string;
  lastWeek: string;
  today: string;
}

describeDb('T3 + T4 — kế hoạch tuần, báo cáo tuần / tháng (0242)', () => {
  let f: Fixture;
  let cht: SupabaseClient;
  let tp: SupabaseClient;
  let tgd: SupabaseClient;
  let itemId = '';
  let reportId = '';
  let otherReportId = '';

  beforeAll(async () => {
    [cht, tp, tgd] = await Promise.all([
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.tgd),
    ]);
    f = await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const ids = async (email: string) =>
        (await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`)[0]!.id;
      const chtId = await ids(ACCOUNTS.chiHuyTruongNvc);
      const tpId = await ids(ACCOUNTS.congTruongNvc);
      const tgdId = await ids(ACCOUNTS.tgd);
      const [d] = await sql<{ today: string; this_week: string; last_week: string }[]>`
        SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today,
               to_char(date_trunc('week', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 'YYYY-MM-DD') AS this_week,
               to_char(date_trunc('week', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) - interval '7 days', 'YYYY-MM-DD') AS last_week`;
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date, responsible_user_id)
        VALUES (${nvc!.id}, ${'NVC-HD-BCT-' + stamp}, ${TEST_PREFIX + ' Báo cáo tuần ' + stamp},
                'thi_cong', 'da_ky', ${CONTRACT_VALUE}, current_date - 30, ${tpId})
        RETURNING id`;
      const sites = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id, contract_id)
        VALUES
          (${nvc!.id}, ${'NVC-CT-BCT-A-' + stamp}, ${TEST_PREFIX + ' Báo cáo A ' + stamp}, 'dang_thi_cong',
           current_date + 60, ${chtId}, ${c!.id}),
          (${nvc!.id}, ${'NVC-CT-BCT-B-' + stamp}, ${TEST_PREFIX + ' Báo cáo B ' + stamp}, 'dang_thi_cong',
           current_date + 60, ${tpId}, NULL)
        RETURNING id`;
      const crews = await sql<{ id: string }[]>`
        INSERT INTO subcontractors (company_id, construction_site_id, name, scope_of_work, contract_value)
        VALUES (${nvc!.id}, ${sites[0]!.id}, ${TEST_PREFIX + ' Tổ cốt thép A'}, 'Gia công lắp dựng thép', ${CREW_VALUE}),
               (${nvc!.id}, ${sites[1]!.id}, ${TEST_PREFIX + ' Tổ cốt thép B'}, 'Gia công lắp dựng thép', ${CREW_VALUE})
        RETURNING id`;
      // Công trình NVC mới tự có bộ mốc (0182) — lấy mốc đầu tiên.
      const [m] = await sql<{ id: string; label: string }[]>`
        SELECT id, label FROM site_milestones WHERE construction_site_id = ${sites[0]!.id}
         ORDER BY position LIMIT 1`;
      return {
        companyId: nvc!.id,
        contractId: c!.id,
        siteId: sites[0]!.id,
        otherSiteId: sites[1]!.id,
        crewId: crews[0]!.id,
        otherCrewId: crews[1]!.id,
        milestoneId: m!.id,
        milestoneLabel: m!.label,
        chtId,
        tpId,
        tgdId,
        today: d!.today,
        thisWeek: d!.this_week,
        lastWeek: d!.last_week,
      };
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM notifications WHERE related_entity_type = 'site_reports'
                  AND related_entity_id IN (SELECT id FROM site_reports
                                             WHERE construction_site_id IN (${f.siteId}, ${f.otherSiteId}))`;
      // Xoá cứng công trình thử → báo cáo bị xoá dây chuyền (ngoại lệ duy nhất của trigger bất biến).
      await sql`DELETE FROM construction_sites WHERE id IN (${f.siteId}, ${f.otherSiteId})`;
      await sql`DELETE FROM contracts WHERE id = ${f.contractId}`;
    });
  });

  function insertItem(client: SupabaseClient, siteId: string, extra: Record<string, unknown> = {}) {
    return client
      .from('site_plan_items')
      .insert({
        construction_site_id: siteId,
        company_id: f.companyId,
        week_start: f.thisWeek,
        name: `${TEST_PREFIX} Lắp dựng cốt thép móng M1–M6`,
        target_quantity: 12.5,
        quantity_unit: 'tấn',
        ...extra,
      })
      .select('id, week_start, status, done_at')
      .single();
  }

  async function insertLog(client: SupabaseClient, siteId: string, userId: string) {
    const { data, error } = await client
      .from('site_logs')
      .insert({
        company_id: f.companyId,
        construction_site_id: siteId,
        log_date: f.today,
        log_type: 'tien_do',
        content: `${TEST_PREFIX} Lắp thép móng M1, M2.`,
        workforce_count: 14,
        weather: 'Nắng',
        logged_by: userId,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  }

  // ---------------------------------------------------------------- T3
  it('chỉ huy trưởng lập đầu việc của tuần, giao tổ đội và mốc của công trình', async () => {
    const { data, error } = await insertItem(cht, f.siteId, {
      subcontractor_id: f.crewId,
      site_milestone_id: f.milestoneId,
      // Ngày giữa tuần quy về thứ Hai; trạng thái từ trình duyệt không được tự đặt «xong» kèm giờ giả.
      week_start: f.today,
    });
    expect(error).toBeNull();
    expect(data!.week_start).toBe(f.thisWeek);
    expect(data!.status).toBe('dang_lam');
    itemId = data!.id as string;

    const wrongCrew = await insertItem(cht, f.siteId, { subcontractor_id: f.otherCrewId });
    expect(wrongCrew.error?.message).toMatch(/tổ đội của công trình này/);
  });

  it('chỉ huy trưởng công trình khác không lập được, không thấy đầu việc nào', async () => {
    const denied = await insertItem(cht, f.otherSiteId);
    expect(denied.error).not.toBeNull();

    const ok = await insertItem(tp, f.otherSiteId, { subcontractor_id: f.otherCrewId });
    expect(ok.error).toBeNull();

    const { data } = await cht
      .from('site_plan_items')
      .select('id')
      .eq('construction_site_id', f.otherSiteId);
    expect(data).toEqual([]);
    const copy = await cht.rpc('copy_unfinished_plan_items', {
      p_site_id: f.otherSiteId,
      p_week_start: f.thisWeek,
    });
    expect(copy.error).not.toBeNull();
  });

  it('chép việc chưa xong của tuần trước: phần còn lại của khối lượng, bấm lại không nhân bản', async () => {
    const prevId = await withSql(async (sql) => {
      const [it] = await sql<{ id: string }[]>`
        INSERT INTO site_plan_items (company_id, construction_site_id, week_start, name, target_quantity, quantity_unit)
        VALUES (${f.companyId}, ${f.siteId}, ${f.lastWeek}, ${TEST_PREFIX + ' Đổ bê tông lót móng'}, 40, 'm3')
        RETURNING id`;
      const [done] = await sql<{ id: string }[]>`
        INSERT INTO site_plan_items (company_id, construction_site_id, week_start, name, status, done_at)
        VALUES (${f.companyId}, ${f.siteId}, ${f.lastWeek}, ${TEST_PREFIX + ' Đào đất hố móng'}, 'xong', now())
        RETURNING id`;
      const [log] = await sql<{ id: string }[]>`
        INSERT INTO site_logs (company_id, construction_site_id, log_date, log_type, content, logged_by)
        VALUES (${f.companyId}, ${f.siteId}, ${f.lastWeek}::date + 2, 'tien_do', ${TEST_PREFIX + ' Đổ lót'}, ${f.chtId})
        RETURNING id`;
      await sql`INSERT INTO site_log_plan_progress (site_log_id, plan_item_id, company_id, construction_site_id, quantity_done)
                VALUES (${log!.id}, ${it!.id}, ${f.companyId}, ${f.siteId}, 15)`;
      void done;
      return it!.id;
    });

    const first = await cht.rpc('copy_unfinished_plan_items', {
      p_site_id: f.siteId,
      p_week_start: f.thisWeek,
    });
    expect(first.error).toBeNull();
    expect(first.data).toBe(1);
    const { data: copied } = await cht
      .from('site_plan_items')
      .select('name, target_quantity, copied_from_id, week_start')
      .eq('copied_from_id', prevId);
    expect(copied).toHaveLength(1);
    expect(Number(copied![0]!.target_quantity)).toBe(25);
    expect(copied![0]!.week_start).toBe(f.thisWeek);

    const again = await cht.rpc('copy_unfinished_plan_items', {
      p_site_id: f.siteId,
      p_week_start: f.thisWeek,
    });
    expect(again.data).toBe(0);
  });

  it('đánh dấu trong nhật ký: khối lượng hôm nay + «xong» đóng đầu việc; người khác không đánh dấu thay', async () => {
    const logId = await insertLog(cht, f.siteId, f.chtId);

    const byOther = await tp.from('site_log_plan_progress').insert({
      site_log_id: logId,
      plan_item_id: itemId,
      company_id: f.companyId,
      construction_site_id: f.siteId,
      quantity_done: 1,
    });
    expect(byOther.error?.message).toMatch(/người đã ghi mục nhật ký/);

    const { error } = await cht.from('site_log_plan_progress').insert({
      site_log_id: logId,
      plan_item_id: itemId,
      company_id: f.companyId,
      construction_site_id: f.siteId,
      quantity_done: 4.5,
      marked_done: true,
    });
    expect(error).toBeNull();

    const { data: item } = await cht
      .from('site_plan_items')
      .select('status, done_at, done_log_id')
      .eq('id', itemId)
      .single();
    expect(item!.status).toBe('xong');
    expect(item!.done_at).not.toBeNull();
    expect(item!.done_log_id).toBe(logId);

    // Dấu đã ghi không sửa được.
    const edit = await cht
      .from('site_log_plan_progress')
      .update({ quantity_done: 99 })
      .eq('site_log_id', logId)
      .select('id');
    expect(edit.data ?? []).toEqual([]);
  });

  // ---------------------------------------------------------------- T4
  it('số liệu báo cáo: kế hoạch / đã làm từ nhật ký; chưa ghi số thì NULL, không 0; không có tiền', async () => {
    const { data, error } = await cht.rpc('site_report_data', {
      p_site_id: f.siteId,
      p_kind: 'tuan',
      p_date: f.today,
    });
    expect(error).toBeNull();
    const d = data as {
      plan: { id: string; done_quantity: number | null; days_worked: number; status: string }[];
      logs: { days_logged: number; days: { workforce: number | null; weather: string | null }[] };
      attendance: unknown[];
      milestones: { pending: { label: string }[] };
    };
    const main = d.plan.find((p) => p.id === itemId)!;
    expect(Number(main.done_quantity)).toBe(4.5);
    expect(main.days_worked).toBe(1);
    expect(main.status).toBe('xong');
    const copied = d.plan.find((p) => p.id !== itemId)!;
    expect(copied.done_quantity).toBeNull();
    expect(d.logs.days_logged).toBe(1);
    expect(d.logs.days[0]!.workforce).toBe(14);
    expect(d.attendance).toEqual([]);
    expect(d.milestones.pending.map((m) => m.label)).toContain(f.milestoneLabel);

    const text = JSON.stringify(data);
    expect(text).not.toContain(String(CONTRACT_VALUE));
    expect(text).not.toContain(String(CREW_VALUE));
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    walk(data);
    for (const k of keys) expect(k).not.toMatch(/value|amount|price|cost|money|tien|gia_tri/i);
  });

  it('chỉ huy trưởng công trình khác không lấy được số liệu báo cáo', async () => {
    const { error } = await cht.rpc('site_report_data', {
      p_site_id: f.otherSiteId,
      p_kind: 'tuan',
      p_date: f.today,
    });
    expect(error?.message).toMatch(/Không xem được báo cáo/);
  });

  it('gửi báo cáo: chụp số liệu + nhận định, báo Trưởng phòng và giám đốc; gửi lại cùng kỳ bị chặn', async () => {
    // Trình duyệt không ghi thẳng bảng — số liệu phải do máy chụp.
    const direct = await cht.from('site_reports').insert({
      construction_site_id: f.siteId,
      company_id: f.companyId,
      code: 'GIA',
      kind: 'tuan',
      period_start: f.thisWeek,
      period_end: f.thisWeek,
      data: {},
    });
    expect(direct.error).not.toBeNull();

    const { data, error } = await cht.rpc('send_site_report', {
      p_site_id: f.siteId,
      p_kind: 'tuan',
      p_date: f.today,
      p_highlights: 'Xong cốt thép móng M1–M6.',
      p_problems: 'Cần văn phòng chốt nhà cung cấp bê tông trước thứ Năm.',
      p_next_plan: 'Đổ bê tông móng.',
    });
    expect(error).toBeNull();
    reportId = data as string;

    const again = await cht.rpc('send_site_report', {
      p_site_id: f.siteId,
      p_kind: 'tuan',
      p_date: f.today,
    });
    expect(again.error?.message).toMatch(/đã gửi/);

    for (const [client, label] of [
      [tp, 'Trưởng phòng Thi công'],
      [tgd, 'Tổng Giám đốc'],
    ] as const) {
      const { count } = await client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'site_report_sent')
        .eq('related_entity_id', reportId);
      expect(count, label).toBe(1);
    }
    const { count: self } = await cht
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'site_report_sent')
      .eq('related_entity_id', reportId);
    expect(self).toBe(0);
  });

  it('giám đốc đọc được báo cáo; chỉ huy trưởng công trình khác không đọc được', async () => {
    const { data: byTgd } = await tgd
      .from('site_reports')
      .select('id, highlights, data')
      .eq('id', reportId)
      .single();
    expect(byTgd!.highlights).toBe('Xong cốt thép móng M1–M6.');
    expect((byTgd!.data as { site: { id: string } }).site.id).toBe(f.siteId);

    const { data: sent, error } = await tp.rpc('send_site_report', {
      p_site_id: f.otherSiteId,
      p_kind: 'tuan',
      p_date: f.today,
      p_problems: 'Thiếu người.',
    });
    expect(error).toBeNull();
    otherReportId = sent as string;

    const { data: byTgdOther } = await tgd
      .from('site_reports')
      .select('id')
      .eq('id', otherReportId);
    expect(byTgdOther).toHaveLength(1);
    const { data: byCht } = await cht.from('site_reports').select('id').eq('id', otherReportId);
    expect(byCht).toEqual([]);
  });

  it('báo cáo đã gửi bất biến — cả trình duyệt lẫn quyền cao nhất của CSDL', async () => {
    const edit = await cht
      .from('site_reports')
      .update({ highlights: 'Sửa lại' })
      .eq('id', reportId)
      .select('id');
    expect(edit.data ?? []).toEqual([]);

    await withSql(async (sql) => {
      await expect(
        sql`UPDATE site_reports SET highlights = 'Sửa ngầm' WHERE id = ${reportId}`,
      ).rejects.toThrow(/không sửa, không xoá/);
      await expect(sql`DELETE FROM site_reports WHERE id = ${reportId}`).rejects.toThrow(
        /không sửa, không xoá/,
      );
      const [r] = await sql<
        { highlights: string }[]
      >`SELECT highlights FROM site_reports WHERE id = ${reportId}`;
      expect(r!.highlights).toBe('Xong cốt thép móng M1–M6.');
    });
  });

  it('báo cáo tháng kèm nhận định các báo cáo tuần đã gửi', async () => {
    const { data, error } = await cht.rpc('site_report_data', {
      p_site_id: f.siteId,
      p_kind: 'thang',
      p_date: f.today,
    });
    expect(error).toBeNull();
    const d = data as { weekly_reports: { highlights: string }[]; plan: unknown[] };
    expect(d.weekly_reports.map((w) => w.highlights)).toContain('Xong cốt thép móng M1–M6.');
    expect(d.plan.length).toBeGreaterThan(0);
  });
});
