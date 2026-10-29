/**
 * T1 + T2 (doc/KE_HOACH_THI_CONG_THEO_KHAO_SAT.md, migration 0241).
 *
 * T1 — đề xuất phát sinh từ công trường:
 *   · chỉ huy trưởng lập trên công trình được giao; Kinh doanh (người chịu trách nhiệm hợp đồng) được báo;
 *   · «khẩn cấp — đã làm trước»: chỉ huy trưởng KHÔNG tự cho phép, không ghi tên sếp thay sếp; Trưởng
 *     phòng Thi công tự ghi nhận được;
 *   · văn phòng chuyển thành phát sinh hợp đồng, liên kết hai chiều; luồng phát sinh có sẵn đi tới «đã thực
 *     hiện» (khách xác nhận, phụ lục);
 *   · Thi công KHÔNG đọc được tiền: không đọc phát sinh / hợp đồng, hàm trạng thái không trả số tiền;
 *   · chỉ huy trưởng công trình khác không thấy gì.
 * T2 — tồn tại:
 *   · ghi được với tổ đội của công trình; tổ đội công trình khác bị chặn;
 *   · đóng phải có ảnh sau sửa, máy ghi người + giờ đóng; đã đóng thì bất biến;
 *   · quá hạn hiện trên bảng theo dõi của Trưởng phòng.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-phat-sinh-ton-tai.test.ts --pool=forks --poolOptions.forks.maxForks=1`
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

interface Fixture {
  companyId: string;
  contractId: string;
  siteId: string;
  otherSiteId: string;
  crewId: string;
  otherCrewId: string;
  chtId: string;
  tpId: string;
  kdId: string;
}

const MONEY = 50_000_000;

describeDb('T1 + T2 — phát sinh từ công trường, tồn tại (0241)', () => {
  let f: Fixture;
  let cht: SupabaseClient;
  let tp: SupabaseClient;
  let kd: SupabaseClient;
  let tgd: SupabaseClient;
  let proposalId = '';
  let amendmentId = '';

  beforeAll(async () => {
    [cht, tp, kd, tgd] = await Promise.all([
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.tgd),
    ]);
    f = await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const ids = async (email: string) =>
        (await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`)[0]!.id;
      const chtId = await ids(ACCOUNTS.chiHuyTruongNvc);
      const tpId = await ids(ACCOUNTS.congTruongNvc);
      const kdId = await ids(ACCOUNTS.kinhDoanhNvc);
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date, responsible_user_id)
        VALUES (${nvc!.id}, ${'NVC-HD-PSCT-' + stamp}, ${TEST_PREFIX + ' Phát sinh công trường ' + stamp},
                'thi_cong', 'da_ky', 2000000000, current_date - 30, ${kdId})
        RETURNING id`;
      const sites = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id, contract_id)
        VALUES
          (${nvc!.id}, ${'NVC-CT-PS-A-' + stamp}, ${TEST_PREFIX + ' Phát sinh A ' + stamp}, 'dang_thi_cong',
           current_date + 60, ${chtId}, ${c!.id}),
          (${nvc!.id}, ${'NVC-CT-PS-B-' + stamp}, ${TEST_PREFIX + ' Phát sinh B ' + stamp}, 'dang_thi_cong',
           current_date + 60, ${tpId}, NULL)
        RETURNING id`;
      const crews = await sql<{ id: string }[]>`
        INSERT INTO subcontractors (company_id, construction_site_id, name, scope_of_work)
        VALUES (${nvc!.id}, ${sites[0]!.id}, ${TEST_PREFIX + ' Tổ nề A'}, 'Xây, trát'),
               (${nvc!.id}, ${sites[1]!.id}, ${TEST_PREFIX + ' Tổ nề B'}, 'Xây, trát')
        RETURNING id`;
      return {
        companyId: nvc!.id,
        contractId: c!.id,
        siteId: sites[0]!.id,
        otherSiteId: sites[1]!.id,
        crewId: crews[0]!.id,
        otherCrewId: crews[1]!.id,
        chtId,
        tpId,
        kdId,
      };
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM request_reminders WHERE construction_site_id IN (${f.siteId}, ${f.otherSiteId})`;
      await sql`DELETE FROM site_change_proposals WHERE construction_site_id IN (${f.siteId}, ${f.otherSiteId})`;
      await sql`DELETE FROM approvals WHERE entity_type = 'contract_amendments' AND entity_id IN (
                  SELECT id FROM contract_amendments WHERE contract_id = ${f.contractId})`;
      await sql`DELETE FROM construction_sites WHERE id IN (${f.siteId}, ${f.otherSiteId})`;
      await sql`DELETE FROM contracts WHERE id = ${f.contractId}`;
    });
  });

  const photo = (siteId: string) => `${siteId}/phat-sinh/${crypto.randomUUID()}.jpg`;

  function insertProposal(
    client: SupabaseClient,
    siteId: string,
    extra: Record<string, unknown> = {},
  ) {
    return client
      .from('site_change_proposals')
      .insert({
        construction_site_id: siteId,
        company_id: f.companyId,
        cause: 'hien_truong',
        description: `${TEST_PREFIX} Nền đất yếu khu móng trục A, phải gia cố cọc tre.`,
        location: 'Móng trục A1–A4',
        measurements: 'Lún 12 cm sau khi đào',
        estimated_quantity: 35.5,
        quantity_unit: 'm3',
        schedule_impact_days: 4,
        photo_paths: [photo(siteId)],
        ...extra,
      })
      .select('id, code, status, contract_id, emergency_authorized_by')
      .single();
  }

  // ---------------------------------------------------------------- T1
  it('chỉ huy trưởng lập đề xuất trên công trình được giao; Kinh doanh được báo', async () => {
    const { data, error } = await insertProposal(cht, f.siteId, { status: 'da_chuyen' });
    expect(error).toBeNull();
    expect(data!.code).toMatch(/^NVC-DXPS-\d{4}-\d+$/);
    expect(data!.status).toBe('da_gui');
    expect(data!.contract_id).toBe(f.contractId);
    proposalId = data!.id as string;

    const { count } = await kd
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'site_change_proposed')
      .eq('related_entity_id', proposalId);
    expect(count).toBe(1);

    // Văn phòng đọc được đề xuất qua hợp đồng (Kinh doanh không xem phân hệ Thi công).
    const { data: seen } = await kd.from('site_change_proposals').select('id').eq('id', proposalId);
    expect(seen).toHaveLength(1);
  });

  it('chỉ huy trưởng không lập được, không thấy gì ở công trình không được giao', async () => {
    const denied = await insertProposal(cht, f.otherSiteId);
    expect(denied.error).not.toBeNull();

    const other = await insertProposal(tp, f.otherSiteId);
    expect(other.error).toBeNull();

    const { data: rows } = await cht
      .from('site_change_proposals')
      .select('id')
      .eq('construction_site_id', f.otherSiteId);
    expect(rows).toEqual([]);
    const { data: states } = await cht.rpc('site_change_proposal_states', {
      p_site_id: f.otherSiteId,
    });
    expect(states).toEqual([]);
    const { data: tracker } = await cht.rpc('site_request_tracker', {
      p_site_id: f.otherSiteId,
      p_mine_only: false,
    });
    expect(tracker).toEqual([]);
  });

  it('khẩn cấp: chỉ huy trưởng không tự cho phép, không ghi tên sếp thay; Trưởng phòng tự ghi nhận được', async () => {
    const self = await insertProposal(cht, f.siteId, {
      is_emergency: true,
      emergency_authorized_by: f.chtId,
    });
    expect(self.error?.message).toMatch(/không tự cho phép/);

    const forBoss = await insertProposal(cht, f.siteId, {
      is_emergency: true,
      emergency_authorized_by: f.tpId,
    });
    expect(forBoss.error?.message).toMatch(/tự ghi nhận/);

    const askSelf = await insertProposal(cht, f.siteId, {
      is_emergency: true,
      emergency_requested_to: f.chtId,
    });
    expect(askSelf.error?.message).toMatch(/Trưởng phòng Thi công hoặc Ban Giám đốc/);

    const asked = await insertProposal(cht, f.siteId, {
      is_emergency: true,
      emergency_requested_to: f.tpId,
    });
    expect(asked.error).toBeNull();
    const id = asked.data!.id as string;

    const viaRpc = await cht.rpc('authorize_site_change_emergency', { p_proposal_id: id });
    expect(viaRpc.error?.message).toMatch(/không tự cho phép/);
    const viaUpdate = await cht
      .from('site_change_proposals')
      .update({ emergency_authorized_by: f.chtId })
      .eq('id', id)
      .select('id');
    expect(viaUpdate.error).not.toBeNull();

    const { count: asks } = await tp
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'site_change_emergency_request')
      .eq('related_entity_id', id);
    expect(asks).toBe(1);

    const ok = await tp.rpc('authorize_site_change_emergency', {
      p_proposal_id: id,
      p_note: 'Gọi điện cho phép đổ bê tông lót trước',
    });
    expect(ok.error).toBeNull();
    const row = await withSql(
      (sql) => sql<{ emergency_authorized_by: string; emergency_authorized_at: Date | null }[]>`
        SELECT emergency_authorized_by, emergency_authorized_at FROM site_change_proposals WHERE id = ${id}`,
    );
    expect(row[0]!.emergency_authorized_by).toBe(f.tpId);
    expect(row[0]!.emergency_authorized_at).not.toBeNull();
  });

  it('văn phòng chuyển thành phát sinh, liên kết hai chiều; công trường không tự đổi trạng thái', async () => {
    const forged = await cht
      .from('site_change_proposals')
      .update({ status: 'tu_choi' })
      .eq('id', proposalId)
      .select('id');
    expect(forged.error).not.toBeNull();

    const tcConvert = await tp.rpc('convert_site_change_proposal', { p_proposal_id: proposalId });
    expect(tcConvert.error).not.toBeNull();

    const { data, error } = await kd.rpc('convert_site_change_proposal', {
      p_proposal_id: proposalId,
      p_title: `${TEST_PREFIX} Gia cố móng trục A`,
    });
    expect(error).toBeNull();
    amendmentId = data as string;

    const { data: a } = await kd
      .from('contract_amendments')
      .select('site_change_proposal_id, stage, content, schedule_impact_days')
      .eq('id', amendmentId)
      .single();
    expect(a!.site_change_proposal_id).toBe(proposalId);
    expect(a!.stage).toBe('de_xuat');
    expect(a!.content).toContain('35.5 m3');
    expect(a!.schedule_impact_days).toBe('4');

    const { data: p } = await cht
      .from('site_change_proposals')
      .select('status, amendment_id')
      .eq('id', proposalId)
      .single();
    expect(p).toEqual({ status: 'da_chuyen', amendment_id: amendmentId });

    // Đã chuyển thì nội dung khoá.
    const edit = await cht
      .from('site_change_proposals')
      .update({ description: 'sửa sau' })
      .eq('id', proposalId)
      .select('id');
    expect(edit.data ?? []).toEqual([]);
  });

  it('Thi công không đọc được tiền; trạng thái đi theo luồng phát sinh tới «đã thực hiện»', async () => {
    // Kinh doanh lập báo giá phát sinh.
    expect(
      (
        await kd
          .from('contract_amendments')
          .update({ value_change: MONEY, quote_sent_at: new Date().toISOString() })
          .eq('id', amendmentId)
          .select('id')
          .single()
      ).error,
    ).toBeNull();

    for (const client of [cht, tp]) {
      const { data: am } = await client.from('contract_amendments').select('id, value_change');
      expect(am ?? []).toEqual([]);
      const { data: c } = await client.from('contracts').select('id, value').eq('id', f.contractId);
      expect(c ?? []).toEqual([]);
    }

    const states = async () => {
      const { data, error } = await cht.rpc('site_change_proposal_states', { p_site_id: f.siteId });
      expect(error).toBeNull();
      const row = (data as Record<string, unknown>[]).find((r) => r.proposal_id === proposalId)!;
      // Không cột nào mang tiền.
      expect(JSON.stringify(row)).not.toContain(String(MONEY));
      expect(Object.keys(row).some((k) => /value|amount|price|gia/.test(k))).toBe(false);
      return row;
    };
    expect((await states()).display_status).toBe('dang_bao_gia');
    const { data: tracked } = await cht.rpc('site_request_tracker', {
      p_site_id: f.siteId,
      p_mine_only: false,
    });
    const tr = (tracked as Record<string, unknown>[]).find((r) => r.entity_id === proposalId)!;
    expect(tr.holder_kind).toBe('office');
    expect(tr.holder_ids).toEqual([f.kdId]);
    expect(JSON.stringify(tr)).not.toContain(String(MONEY));

    const { data: approvalId, error: submitError } = await kd.rpc('submit_amendment_approval', {
      p_amendment_id: amendmentId,
    });
    expect(submitError).toBeNull();
    expect((await states()).display_status).toBe('cho_duyet');

    expect(
      (
        await tgd.rpc('decide_approval', {
          p_approval_id: approvalId as string,
          p_decision: 'approved',
        })
      ).error,
    ).toBeNull();
    expect((await states()).display_status).toBe('cho_khach');

    expect(
      (
        await kd.rpc('confirm_amendment_by_customer', {
          p_amendment_id: amendmentId,
          p_confirmed_by: 'Ông Chủ đầu tư',
        })
      ).error,
    ).toBeNull();
    expect((await kd.rpc('execute_amendment', { p_amendment_id: amendmentId })).error).toBeNull();
    const done = await states();
    expect(done.display_status).toBe('hoan_tat');
    expect(done.is_closed).toBe(true);

    const { count } = await cht
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'site_change_progress')
      .eq('related_entity_id', proposalId);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  // ---------------------------------------------------------------- T2
  let issueId = '';

  it('tồn tại: ghi được với tổ đội của công trình, tổ đội công trình khác bị chặn', async () => {
    const wrong = await cht
      .from('site_issues')
      .insert({
        construction_site_id: f.siteId,
        company_id: f.companyId,
        description: `${TEST_PREFIX} Trát nứt chân tường`,
        subcontractor_id: f.otherCrewId,
      })
      .select('id');
    expect(wrong.error?.message).toMatch(/tổ đội của công trình này/);

    const { data, error } = await cht
      .from('site_issues')
      .insert({
        construction_site_id: f.siteId,
        company_id: f.companyId,
        work_item: 'Tường tầng 1',
        description: `${TEST_PREFIX} Trát nứt chân tường`,
        subcontractor_id: f.crewId,
        before_photo_paths: [photo(f.siteId)],
        status: 'da_dong',
      })
      .select('id, code, status, due_date, closed_at')
      .single();
    expect(error).toBeNull();
    expect(data!.code).toMatch(/^NVC-TT-\d{4}-\d+$/);
    expect(data!.status).toBe('dang_mo');
    expect(data!.closed_at).toBeNull();
    expect(data!.due_date).toBeNull();
    issueId = data!.id as string;
  });

  it('đóng tồn tại phải có ảnh sau sửa; máy ghi người + giờ đóng; đã đóng thì bất biến', async () => {
    const noPhoto = await cht
      .from('site_issues')
      .update({ status: 'da_dong', close_note: 'Đã trát lại' })
      .eq('id', issueId)
      .select('id');
    expect(noPhoto.error?.message).toMatch(/ảnh sau khi khắc phục/);

    const closed = await cht
      .from('site_issues')
      .update({ status: 'da_dong', after_photo_paths: [photo(f.siteId)], closed_by: f.tpId })
      .eq('id', issueId)
      .select('status, closed_at, closed_by')
      .single();
    expect(closed.error).toBeNull();
    expect(closed.data!.closed_by).toBe(f.chtId);
    expect(closed.data!.closed_at).not.toBeNull();

    for (const change of [
      { description: 'sửa lại' },
      { status: 'dang_mo' },
      { deleted_at: new Date().toISOString() },
    ]) {
      const r = await tp.from('site_issues').update(change).eq('id', issueId).select('id');
      expect(r.error?.message ?? '').toMatch(/đã đóng/);
    }
  });

  it('tồn tại quá hạn hiện trên bảng theo dõi; chỉ huy trưởng công trình khác không thấy', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const late = await tp
      .from('site_issues')
      .insert({
        construction_site_id: f.siteId,
        company_id: f.companyId,
        description: `${TEST_PREFIX} Chống thấm sê nô chưa đạt`,
        assigned_user_id: f.chtId,
        due_date: yesterday,
      })
      .select('id')
      .single();
    expect(late.error).toBeNull();

    const { data: board } = await tp.rpc('tc_site_board');
    const row = (board as Record<string, unknown>[]).find((r) => r.site_id === f.siteId)!;
    expect(row.open_issues).toBe(1);
    expect(row.overdue_issues).toBe(1);

    const hidden = await tp
      .from('site_issues')
      .insert({
        construction_site_id: f.otherSiteId,
        company_id: f.companyId,
        description: `${TEST_PREFIX} Tồn tại công trình B`,
      })
      .select('id')
      .single();
    expect(hidden.error).toBeNull();
    const { data: seen } = await cht
      .from('site_issues')
      .select('id')
      .eq('construction_site_id', f.otherSiteId);
    expect(seen).toEqual([]);
  });
});
