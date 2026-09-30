/**
 * TC-10 — theo dõi đề nghị từ công trường và «Thúc» (migration 0134).
 *
 * Ba thứ phải đứng vững:
 *  1. Mẫu E: chỉ huy trưởng chỉ thấy — và chỉ thúc được — đề nghị của công trình được giao.
 *     Kèm lỗ cũ đã vá: `purchase_requests` từng chỉ là Mẫu A.
 *  2. «Thúc» tới đúng người đang giữ, ghi lại lịch sử, và không thúc dồn được.
 *  3. Hạn cam kết chỉ có khi đã khai `sla_definitions` — không tự dựng một con số.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-tracker.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

const COST_CODE = 'VT-TRACK-01';

interface TrackerRow {
  entity_id: string;
  stage: string;
  holder_kind: string | null;
  holder_ids: string[];
  holder_label: string | null;
  waiting_since: string | null;
  due_at: string | null;
  nudge_count: number;
  next_nudge_at: string | null;
}

interface Fixture {
  companyId: string;
  siteA: string;
  siteB: string;
}

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Hai công trình NVC có ngân sách, CHT được giao công trình A. Dựng bối cảnh, vượt RLS. */
async function seedFixture(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      VALUES
        (${nvc!.id}, ${'NVC-CT-TRACK-A-' + stamp}, ${TEST_PREFIX + ' Công trình A ' + stamp}, current_date + 90),
        (${nvc!.id}, ${'NVC-CT-TRACK-B-' + stamp}, ${TEST_PREFIX + ' Công trình B ' + stamp}, current_date + 90)
      RETURNING id`;
    // Mỗi công trình một gói thầu làm hồ sơ cha của ngân sách: mã chi phí là duy nhất theo
    // hồ sơ cha (`project_budgets_cost_code`).
    for (const [i, s] of sites.entries()) {
      const [bidding] = await sql<{ id: string }[]>`
        INSERT INTO bidding_projects (company_id, code, name, stage)
        VALUES (${nvc!.id}, ${`NVC-DA-TRACK-${i}-${stamp}`},
                ${`${TEST_PREFIX} Gói thầu nền theo dõi ${i} ${stamp}`}, 'da_duyet_gia')
        RETURNING id`;
      await sql`
        INSERT INTO project_budgets (company_id, bidding_project_id, construction_site_id,
                                     cost_group, cost_code, name, budgeted_amount)
        VALUES (${nvc!.id}, ${bidding!.id}, ${s.id}, 'vat_tu', ${COST_CODE},
                ${TEST_PREFIX + ' Vật tư theo dõi'}, 1000000000)`;
    }
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${sites[0]!.id}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvc}`;
    return { companyId: nvc!.id, siteA: sites[0]!.id, siteB: sites[1]!.id };
  });
}

/** Lập một đề nghị vật tư 20 triệu cho công trình; `submit` thì gửi phê duyệt luôn. */
async function createSiteRequest(
  client: SupabaseClient,
  fixture: Fixture,
  siteId: string,
  submit: boolean,
): Promise<string> {
  const { data, error } = await client
    .from('purchase_requests')
    .insert({
      company_id: fixture.companyId,
      title: `${TEST_PREFIX} Thép sàn tầng 2 ${Date.now()}`,
      construction_site_id: siteId,
      cost_code: COST_CODE,
      needed_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      delivery_location: 'Công trường',
    })
    .select('id')
    .single();
  if (error) throw new Error(`Không tạo được đề nghị: ${error.message}`);
  const id = (data as { id: string }).id;
  const { error: itemError } = await client.from('purchase_request_items').insert({
    purchase_request_id: id,
    position: 1,
    item_code: 'VT-TRACK',
    name: 'Thép D16',
    unit: 'kg',
    quantity: 1000,
    estimated_unit_price: 20_000,
  });
  if (itemError) throw new Error(`Không thêm được dòng: ${itemError.message}`);
  if (submit) {
    const { error: submitError } = await client.rpc('submit_purchase_request_approval', {
      p_request_id: id,
    });
    if (submitError) throw new Error(`Không gửi phê duyệt được: ${submitError.message}`);
  }
  return id;
}

async function trackerRow(client: SupabaseClient, id: string): Promise<TrackerRow | undefined> {
  const { data, error } = await client.rpc('site_request_tracker');
  if (error) throw new Error(error.message);
  return (data as TrackerRow[]).find((r) => r.entity_id === id);
}

async function setNudgeInterval(value: number | null): Promise<void> {
  await withSql(
    (sql) => sql`
      UPDATE system_parameters SET value = ${value === null ? null : JSON.stringify(value)}::jsonb
      WHERE param_key = 'request_nudge_min_interval_hours'`,
  );
}

describeDb('TC-10 — theo dõi đề nghị từ công trường và «Thúc»', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient; // CHT — chỉ công trình A
  let vanPhong: SupabaseClient; // TC — toàn pháp nhân
  let muaHang: SupabaseClient;
  let chiHuyId: string;
  let requestA: string; // CHT gửi, đang chờ duyệt
  let requestB: string; // văn phòng gửi cho công trình B
  let draftA: string; // CHT lập, chưa gửi

  beforeAll(async () => {
    fixture = await seedFixture();
    chiHuy = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    vanPhong = await signInAs(ACCOUNTS.congTruongNvc);
    muaHang = await signInAs(ACCOUNTS.muaHang);
    chiHuyId = (await chiHuy.rpc('auth_user_id')).data as string;
    requestA = await createSiteRequest(chiHuy, fixture, fixture.siteA, true);
    requestB = await createSiteRequest(vanPhong, fixture, fixture.siteB, true);
    draftA = await createSiteRequest(chiHuy, fixture, fixture.siteA, false);
    await setNudgeInterval(4);
  });

  afterAll(async () => {
    await setNudgeInterval(4);
    await withSql((sql) => sql`DELETE FROM sla_definitions WHERE label LIKE ${TEST_PREFIX + '%'}`);
  });

  it('CHT thấy đề nghị công trình được giao, KHÔNG thấy công trình khác — cả ở bảng gốc', async () => {
    expect(await trackerRow(chiHuy, requestA)).toBeDefined();
    expect(await trackerRow(chiHuy, requestB)).toBeUndefined();

    // Lỗ Mẫu E cũ: trước 0134 CHT đọc được đề nghị mua của mọi công trình cùng pháp nhân.
    const { data } = await chiHuy.from('purchase_requests').select('id').eq('id', requestB);
    expect(data).toEqual([]);
  });

  it('văn phòng thi công (không giới hạn công trình) thấy cả hai', async () => {
    expect(await trackerRow(vanPhong, requestA)).toBeDefined();
    expect(await trackerRow(vanPhong, requestB)).toBeDefined();
  });

  it('chờ duyệt thì người giữ là người có hạn mức đủ, không gồm chính người gửi', async () => {
    const row = await trackerRow(chiHuy, requestA);
    expect(row!.stage).toBe('cho_duyet');
    expect(row!.holder_kind).toBe('approver');
    expect(row!.holder_ids.length).toBeGreaterThan(0);
    expect(row!.holder_ids).not.toContain(chiHuyId);
    expect(row!.waiting_since).not.toBeNull();
  });

  it('chưa khai thời hạn cam kết thì KHÔNG có hạn — không tự dựng con số', async () => {
    expect((await trackerRow(chiHuy, requestA))!.due_at).toBeNull();
  });

  it('khai thời hạn rồi thì hạn = lúc bắt đầu chờ + số giờ đã khai', async () => {
    await withSql(
      (sql) => sql`
        INSERT INTO sla_definitions (request_type, target_hours, label)
        VALUES ('purchase_request', 24, ${TEST_PREFIX + ' Hạn duyệt đề nghị mua'})`,
    );
    const row = await trackerRow(chiHuy, requestA);
    const expected = new Date(row!.waiting_since!).getTime() + 24 * 3_600_000;
    expect(new Date(row!.due_at!).getTime()).toBe(expected);
  });

  it('CHT thúc được: ghi lịch sử và báo đúng người đang giữ', async () => {
    const { data: id, error } = await chiHuy.rpc('nudge_request', {
      p_entity_type: 'purchase_requests',
      p_entity_id: requestA,
      p_note: 'Cần gấp để đổ sàn thứ Hai',
    });
    expect(error).toBeNull();
    expect(id).toBeTruthy();

    const { data: reminders } = await chiHuy
      .from('request_reminders')
      .select('entity_id, notified_user_ids, nudged_by')
      .eq('entity_id', requestA);
    expect(reminders).toHaveLength(1);
    expect(reminders![0]!.nudged_by).toBe(chiHuyId);

    const holders = (await trackerRow(chiHuy, requestA))!.holder_ids;
    const notified = await withSql(
      (sql) => sql<{ user_id: string }[]>`
        SELECT user_id FROM notifications
        WHERE type = 'request_nudge' AND related_entity_id = ${requestA}`,
    );
    expect(notified.map((n) => n.user_id).sort()).toEqual([...holders].sort());
  });

  it('thúc lại ngay thì bị chặn, kèm giờ thúc lại được', async () => {
    const { error } = await chiHuy.rpc('nudge_request', {
      p_entity_type: 'purchase_requests',
      p_entity_id: requestA,
    });
    expect(error!.message).toContain('thúc lại được sau');
  });

  it('quản trị viên đặt giãn cách về 0 thì không giới hạn nữa', async () => {
    await setNudgeInterval(0);
    const { error } = await chiHuy.rpc('nudge_request', {
      p_entity_type: 'purchase_requests',
      p_entity_id: requestA,
    });
    expect(error).toBeNull();
    expect((await trackerRow(chiHuy, requestA))!.nudge_count).toBe(2);
    await setNudgeInterval(4);
  });

  it('đề nghị còn nháp thì không có ai ở văn phòng để thúc', async () => {
    const { error } = await chiHuy.rpc('nudge_request', {
      p_entity_type: 'purchase_requests',
      p_entity_id: draftA,
    });
    expect(error!.message).toContain('không có ai để thúc');
  });

  it('CHT KHÔNG thúc được đề nghị của công trình không được giao', async () => {
    const { error } = await chiHuy.rpc('nudge_request', {
      p_entity_type: 'purchase_requests',
      p_entity_id: requestB,
    });
    expect(error!.message).toContain('Không tìm thấy đề nghị');
  });

  it('Mua hàng (người đang giữ, không phải người gửi) KHÔNG tự thúc được', async () => {
    const { error } = await muaHang.rpc('nudge_request', {
      p_entity_type: 'purchase_requests',
      p_entity_id: requestB,
    });
    expect(error!.message).toContain('Chỉ người gửi đề nghị');
  });

  it('không ghi thẳng được vào lịch sử thúc từ trình duyệt', async () => {
    const { error } = await chiHuy.from('request_reminders').insert({
      company_id: fixture.companyId,
      construction_site_id: fixture.siteA,
      entity_type: 'purchase_requests',
      entity_id: requestA,
      stage_at_nudge: 'cho_duyet',
      holder_kind: 'approver',
    });
    expect(error).toBeTruthy();
  });
});
