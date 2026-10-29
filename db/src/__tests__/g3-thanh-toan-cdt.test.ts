/**
 * G3 — hồ sơ thanh toán gửi chủ đầu tư, bảo lãnh hợp đồng, tiền giữ lại (migration 0248).
 *
 * Bất biến canh ở đây:
 *   · hồ sơ NVC gắn công trình phải qua bốn bước kiểm theo đúng thứ tự (công trường → Thi công → Dự án / QS → Kế
 *     toán) trước khi gửi / ghi công nợ; không bỏ qua bước; trả lại phải có lý do; một người không ký hai bước;
 *   · công nợ = số chủ đầu tư duyệt − giữ lại; tiền giữ lại là khoản phải thu RIÊNG, hai khoản cộng lại = số duyệt;
 *   · Thi công / chỉ huy trưởng không đọc hồ sơ thu (số tiền), chỉ huy trưởng công trình khác không thấy việc kiểm;
 *   · bảo lãnh: Thi công không thấy; tham số nhắc trống chỉ báo lúc hết hạn, một lần; có số thì báo trước.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/g3-thanh-toan-cdt.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const TAG = TEST_PREFIX + ' G3 thanh toán CĐT';

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

interface Fixture {
  contractId: string;
  siteA: string;
  siteB: string;
  accA: string;
  accB: string;
}

async function seed(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [kd] = await sql<
      { id: string }[]
    >`SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
    const [cht] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
    const [contract] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, contract_number, title, type, stage, value, responsible_user_id, signed_date)
      VALUES (${nvc!.id}, ${'NVC-HD-G3-' + stamp}, ${'G3/' + stamp + '/HĐTC'}, ${TAG + ' ' + stamp},
              'thi_cong', 'da_ky', 2000000000, ${kd!.id}, current_date)
      RETURNING id`;
    await sql`
      INSERT INTO contract_terms (company_id, contract_id, term_type, description, percent_value, position)
      VALUES (${nvc!.id}, ${contract!.id}, 'bao_hanh', ${TAG + ' Giữ lại 5% bảo hành 12 tháng'}, '5', '1')`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, contract_id, responsible_user_id,
                                      planned_start_date, planned_end_date)
      VALUES (${nvc!.id}, ${'NVC-CT-G3A-' + stamp}, ${TAG + ' A ' + stamp}, 'dang_thi_cong', ${contract!.id},
              ${cht!.id}, current_date, current_date + 90),
             (${nvc!.id}, ${'NVC-CT-G3B-' + stamp}, ${TAG + ' B ' + stamp}, 'dang_thi_cong', ${contract!.id},
              NULL, current_date, current_date + 90)
      RETURNING id`;
    const accs = await sql<{ id: string }[]>`
      INSERT INTO acceptance_records
        (company_id, construction_site_id, code, acceptance_type, status, stage_name, value, accepted_date, accepted_at, signed_at)
      VALUES
        (${nvc!.id}, ${sites[0]!.id}, ${'NVC-NT-G3A-' + stamp}, 'khach_hang', 'da_nghiem_thu', 'Kết cấu thép', 400000000, current_date, now(), now()),
        (${nvc!.id}, ${sites[1]!.id}, ${'NVC-NT-G3B-' + stamp}, 'khach_hang', 'da_nghiem_thu', 'Móng', 100000000, current_date, now(), now())
      RETURNING id`;
    return {
      contractId: contract!.id,
      siteA: sites[0]!.id,
      siteB: sites[1]!.id,
      accA: accs[0]!.id,
      accB: accs[1]!.id,
    };
  });
}

async function notificationsFor(email: string, type: string, entityId: string) {
  return withSql(
    (sql) => sql<{ message: string }[]>`
      SELECT n.message FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE u.email = ${email} AND n.type = ${type} AND n.related_entity_id = ${entityId}`,
  );
}

describeDb('G3 — hồ sơ thanh toán chủ đầu tư, bảo lãnh, giữ lại (0248)', () => {
  let fx: Fixture;
  let ketoan: SupabaseClient;
  let tc: SupabaseClient;
  let cht: SupabaseClient;
  let da: SupabaseClient;
  let kd: SupabaseClient;
  let admin: SupabaseClient;
  let requestId: string;
  /** Giá trị tham số trước khi chạy (dạng chữ jsonb, null = trống) — demo `mac-dinh` đặt 30, máy sạch để trống. */
  let savedParams: { param_key: string; value: string | null }[] = [];

  beforeAll(async () => {
    fx = await seed();
    savedParams = await withSql(
      (sql) => sql<{ param_key: string; value: string | null }[]>`
        SELECT param_key, value::text AS value FROM system_parameters
         WHERE param_key IN ('kt.guarantee_remind_days', 'kt.retention_remind_days')
           AND scope_type = 'global'`,
    );
    [ketoan, tc, cht, da, kd, admin] = await Promise.all([
      signInAs(ACCOUNTS.ketoan),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.dauThauNvc),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.admin),
    ]);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      for (const p of savedParams) {
        await sql`UPDATE system_parameters SET value = ${p.value}::jsonb
                   WHERE param_key = ${p.param_key} AND scope_type = 'global'`;
      }
      const ids = sql`SELECT id FROM contracts WHERE title LIKE ${TAG + '%'}`;
      await sql`DELETE FROM notifications WHERE related_entity_id IN (
        SELECT id FROM collection_requests WHERE contract_id IN (${ids})
        UNION SELECT id FROM contract_guarantees WHERE contract_id IN (${ids})
        UNION SELECT id FROM receivables_payables WHERE contract_id IN (${ids})
        UNION (${ids}))`;
      await sql`DELETE FROM collection_requests WHERE contract_id IN (${ids})`;
      await sql`DELETE FROM receivables_payables WHERE contract_id IN (${ids})`;
      await sql`DELETE FROM contract_guarantees WHERE contract_id IN (${ids})`;
      await sql`DELETE FROM warranties WHERE item LIKE ${TAG + '%'}`;
      await sql`DELETE FROM construction_sites WHERE name LIKE ${TAG + '%'}`;
      await sql`DELETE FROM contracts WHERE title LIKE ${TAG + '%'}`;
    });
  });

  it('hồ sơ NVC gắn công trình bắt buộc kiểm; chưa kiểm thì không gửi, không ghi công nợ', async () => {
    const created = await ketoan.rpc('create_collection_request', { p_acceptance_id: fx.accA });
    expect(created.error).toBeNull();
    requestId = created.data as string;
    const { data } = await ketoan
      .from('collection_requests')
      .select('check_required, check_status, amount')
      .eq('id', requestId)
      .single();
    expect((data as { check_required: boolean }).check_required).toBe(true);

    const send = await ketoan.rpc('send_collection_request', { p_id: requestId });
    expect(send.error!.message).toContain('bốn bước kiểm');
    const rec = await ketoan.rpc('record_collection_receivable', { p_id: requestId });
    expect(rec.error).not.toBeNull();

    // Không tự ghi bước kiểm bằng cập nhật thường.
    const forge = await ketoan
      .from('collection_requests')
      .update({ check_status: 'da_kiem' })
      .eq('id', requestId)
      .select('id');
    expect(forge.error).not.toBeNull();
  });

  it('đúng thứ tự: không bỏ qua bước công trường; trả lại phải có lý do', async () => {
    expect((await ketoan.rpc('start_collection_check', { p_id: requestId })).error).toBeNull();

    for (const c of [ketoan, da, kd]) {
      const skip = await c.rpc('decide_collection_check', { p_id: requestId, p_pass: true });
      expect(skip.error!.message).toContain('không bỏ qua bước');
    }

    // Chỉ huy trưởng thấy việc nhưng KHÔNG thấy số tiền / số hợp đồng; không đọc được bảng hồ sơ thu.
    const queue = await cht.rpc('my_collection_checks');
    expect(queue.error).toBeNull();
    const mine = (
      queue.data as { id: string; amount: number | null; contract_number: string | null }[]
    ).find((r) => r.id === requestId);
    expect(mine).toBeDefined();
    expect(mine!.amount).toBeNull();
    expect(mine!.contract_number).toBeNull();
    for (const c of [cht, tc]) {
      const { data } = await c.from('collection_requests').select('id, amount').eq('id', requestId);
      expect(data).toEqual([]);
    }

    expect(
      (
        await cht.rpc('decide_collection_check', {
          p_id: requestId,
          p_pass: true,
          p_note: 'Khớp biên bản',
        })
      ).error,
    ).toBeNull();
    // Chỉ huy trưởng không ký tiếp bước Thi công.
    expect(
      (await cht.rpc('decide_collection_check', { p_id: requestId, p_pass: true })).error,
    ).not.toBeNull();

    const noNote = await tc.rpc('decide_collection_check', { p_id: requestId, p_pass: false });
    expect(noNote.error!.message).toContain('lý do');
    const back = await tc.rpc('decide_collection_check', {
      p_id: requestId,
      p_pass: false,
      p_note: 'Khối lượng thép chưa trừ phần chủ đầu tư cấp',
    });
    expect(back.data).toBe('tra_lai');
  });

  it('vòng mới bắt đầu lại từ bước 1; người đã ký một bước không ký bước Kế toán', async () => {
    const edit = await ketoan
      .from('collection_requests')
      .update({ amount: 390_000_000 })
      .eq('id', requestId)
      .select('id')
      .single();
    expect(edit.error).toBeNull();
    expect((await ketoan.rpc('start_collection_check', { p_id: requestId })).data).toBe(2);

    // Đang kiểm thì nội dung khoá.
    const locked = await ketoan
      .from('collection_requests')
      .update({ amount: 1 })
      .eq('id', requestId)
      .select('id');
    expect(locked.error).not.toBeNull();

    expect(
      (await admin.rpc('decide_collection_check', { p_id: requestId, p_pass: true })).error,
    ).toBeNull();
    expect(
      (await tc.rpc('decide_collection_check', { p_id: requestId, p_pass: true })).error,
    ).toBeNull();
    expect(
      (await kd.rpc('decide_collection_check', { p_id: requestId, p_pass: true })).error,
    ).toBeNull();

    const twice = await admin.rpc('decide_collection_check', { p_id: requestId, p_pass: true });
    expect(twice.error!.message).toContain('người khác kiểm');

    const done = await ketoan.rpc('decide_collection_check', { p_id: requestId, p_pass: true });
    expect(done.data).toBe('da_kiem');

    const { data: checks } = await ketoan
      .from('collection_request_checks')
      .select('round_no, step_no, decision')
      .eq('collection_request_id', requestId)
      .eq('round_no', 2)
      .order('step_no');
    expect((checks as { step_no: number }[]).map((c) => c.step_no)).toEqual([1, 2, 3, 4]);
  });

  it('công nợ = số duyệt − giữ lại; tiền giữ lại là khoản phải thu riêng, hạn theo bảo hành', async () => {
    expect((await ketoan.rpc('send_collection_request', { p_id: requestId })).error).toBeNull();
    const early = await ketoan.rpc('record_collection_receivable', { p_id: requestId });
    expect(early.error!.message).toContain('chủ đầu tư duyệt');

    const path = `${requestId}/chu-dau-tu-duyet-${crypto.randomUUID()}.pdf`;
    const up = await ketoan.storage
      .from('collection-docs')
      .upload(path, new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    expect(up.error).toBeNull();
    const today = new Date().toISOString().slice(0, 10);
    const appr = await ketoan.rpc('record_collection_owner_approval', {
      p_id: requestId,
      p_approved_amount: 380_000_000,
      p_approved_date: today,
      p_scan_path: path,
    });
    expect(appr.error).toBeNull();
    expect(Number(appr.data)).toBe(19_000_000); // 5% theo điều khoản Bảo hành

    const rec = await ketoan.rpc('record_collection_receivable', {
      p_id: requestId,
      p_invoice_number: '0001234',
      p_invoice_date: today,
    });
    expect(rec.error).toBeNull();

    const rows = await withSql(
      (sql) => sql<{ amount: string; receivable_kind: string; invoice_number: string | null }[]>`
        SELECT amount::text, receivable_kind, invoice_number FROM receivables_payables
         WHERE contract_id = ${fx.contractId} AND deleted_at IS NULL ORDER BY receivable_kind`,
    );
    expect(rows.map((r) => [r.receivable_kind, Number(r.amount)])).toEqual([
      ['giu_lai', 19_000_000],
      ['thuong', 361_000_000],
    ]);
    // Cả tập đoàn: hai khoản cộng lại đúng bằng số duyệt, không đếm giữ lại hai lần.
    expect(rows.reduce((s, r) => s + Number(r.amount), 0)).toBe(380_000_000);
    expect(rows[1]!.invoice_number).toBe('0001234');

    // Khai bảo hành → hạn thu hồi tiền giữ lại theo ngày hết bảo hành muộn nhất.
    const due = await withSql(async (sql) => {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      await sql`
        INSERT INTO warranties (company_id, construction_site_id, item, start_date, warranty_until)
        VALUES (${nvc!.id}, ${fx.siteA}, ${TAG + ' Mái tôn'}, current_date, current_date + 365)`;
      return sql<{ due: string }[]>`
        SELECT (due_date - current_date)::text AS due FROM receivables_payables
         WHERE contract_id = ${fx.contractId} AND receivable_kind = 'giu_lai'`;
    });
    expect(Number(due[0]!.due)).toBe(365);

    const open = await kd.rpc('contract_open_retention_guarantees', {
      p_contract_id: fx.contractId,
    });
    expect(Number((open.data as { retention_outstanding: number }).retention_outstanding)).toBe(
      19_000_000,
    );
    const tcView = await tc.rpc('contract_open_retention_guarantees', {
      p_contract_id: fx.contractId,
    });
    expect(tcView.data).toBeNull();
  });

  it('chỉ huy trưởng công trình khác không thấy, không ký được việc kiểm', async () => {
    const created = await ketoan.rpc('create_collection_request', { p_acceptance_id: fx.accB });
    const otherId = created.data as string;
    expect((await ketoan.rpc('start_collection_check', { p_id: otherId })).error).toBeNull();
    const queue = await cht.rpc('my_collection_checks');
    expect((queue.data as { id: string }[]).some((r) => r.id === otherId)).toBe(false);
    const act = await cht.rpc('decide_collection_check', { p_id: otherId, p_pass: true });
    expect(act.error).not.toBeNull();
    // Trưởng phòng Thi công (không phạm vi hiện trường) thì ký được bước công trường.
    const queueTc = await tc.rpc('my_collection_checks');
    expect((queueTc.data as { id: string }[]).some((r) => r.id === otherId)).toBe(true);
  });

  it('bảo lãnh: Thi công không thấy; tham số trống chỉ báo khi hết hạn, một lần; có số thì báo trước', async () => {
    const inFive = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const ins = await ketoan
      .from('contract_guarantees')
      .insert({
        contract_id: fx.contractId,
        guarantee_type: 'thuc_hien',
        bank_name: 'Ngân hàng thử G3',
        guarantee_number: 'BL-G3-1',
        amount: 200_000_000,
        valid_from: new Date().toISOString().slice(0, 10),
        valid_to: inFive,
      })
      .select('id, direction, status')
      .single();
    expect(ins.error).toBeNull();
    const g = ins.data as { id: string; direction: string; status: string };
    expect(g.direction).toBe('nvg_phat_hanh');

    const { data: tcSees } = await tc
      .from('contract_guarantees')
      .select('id, amount')
      .eq('id', g.id);
    expect(tcSees).toEqual([]);
    const { data: chtSees } = await cht.from('contract_guarantees').select('id').eq('id', g.id);
    expect(chtSees).toEqual([]);
    const { data: kdSees } = await kd.from('contract_guarantees').select('id').eq('id', g.id);
    expect(kdSees).toHaveLength(1);
    const tcWrite = await tc.from('contract_guarantees').insert({
      contract_id: fx.contractId,
      guarantee_type: 'bao_hanh',
      bank_name: 'X',
      amount: 1,
      valid_to: inFive,
    });
    expect(tcWrite.error).not.toBeNull();

    // Tham số trống: còn 5 ngày → không báo.
    await withSql(async (sql) => {
      await sql`UPDATE system_parameters SET value = NULL
                 WHERE param_key = 'kt.guarantee_remind_days' AND scope_type = 'global'`;
      await sql`SELECT scan_contract_guarantee_reminders()`;
    });
    expect(await notificationsFor(ACCOUNTS.ketoan, 'contract_guarantee_expiry', g.id)).toHaveLength(
      0,
    );

    // Có số (30 ngày) → báo trước.
    await withSql(async (sql) => {
      await sql`UPDATE system_parameters SET value = '30'::jsonb
                 WHERE param_key = 'kt.guarantee_remind_days' AND scope_type = 'global'`;
      await sql`SELECT scan_contract_guarantee_reminders()`;
      await sql`UPDATE system_parameters SET value = NULL
                 WHERE param_key = 'kt.guarantee_remind_days' AND scope_type = 'global'`;
    });
    const before = await notificationsFor(ACCOUNTS.ketoan, 'contract_guarantee_expiry', g.id);
    expect(before).toHaveLength(1);
    expect(before[0]!.message).toContain('còn 5 ngày');

    // Đã hết hạn → báo một lần, ghi «Hết hạn»; quét lại không báo nữa.
    await withSql(async (sql) => {
      await sql`UPDATE contract_guarantees SET valid_from = current_date - 30, valid_to = current_date - 1
                 WHERE id = ${g.id}`;
      await sql`SELECT scan_contract_guarantee_reminders()`;
      await sql`SELECT scan_contract_guarantee_reminders()`;
    });
    const all = await notificationsFor(ACCOUNTS.ketoan, 'contract_guarantee_expiry', g.id);
    expect(all).toHaveLength(2);
    expect(all.some((n) => n.message.includes('đã hết hạn'))).toBe(true);
    expect(await notificationsFor(ACCOUNTS.cfo, 'contract_guarantee_expiry', g.id)).toHaveLength(2);
    const { data: after } = await ketoan
      .from('contract_guarantees')
      .select('status')
      .eq('id', g.id)
      .single();
    expect((after as { status: string }).status).toBe('het_han');

    // Không tự đổi trạng thái bằng cập nhật thường; ghi thu hồi qua hàm.
    const forge = await ketoan
      .from('contract_guarantees')
      .update({ status: 'da_thu_hoi' })
      .eq('id', g.id)
      .select('id');
    expect(forge.error).not.toBeNull();
    const close = await ketoan.rpc('close_contract_guarantee', {
      p_id: g.id,
      p_status: 'da_thu_hoi',
      p_closed_date: new Date().toISOString().slice(0, 10),
      p_note: 'Chủ đầu tư trả thư bảo lãnh',
    });
    expect(close.error).toBeNull();
  });

  it('hợp đồng quyết toán → báo thu hồi tiền giữ lại còn mở', async () => {
    await withSql(
      (sql) => sql`SELECT notify_retention_release(${fx.contractId}::uuid, 'đã quyết toán')`,
    );
    const n = await notificationsFor(ACCOUNTS.ketoan, 'retention_release', fx.contractId);
    expect(n.length).toBeGreaterThan(0);
    expect(n[0]!.message).toContain('19.000.000');
  });
});
