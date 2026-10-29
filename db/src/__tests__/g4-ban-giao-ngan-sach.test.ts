/**
 * Gói bàn giao, điều kiện khởi công, lãi lúc nhận việc, điều chỉnh ngân sách, vượt ngân sách
 * (G4 — A2 + A3, migration 0249).
 *
 * Hàng rào phải đứng:
 *  - Mục bàn giao tự nối hồ sơ có sẵn; giao / nhận ghi người và giờ; báo thiếu thì bộ phận giao được báo.
 *  - Thi công không thấy giá trị hợp đồng / dự toán trong gói bàn giao; tệp mục nhạy cảm bị che.
 *  - Chưa đủ điều kiện khởi công bắt buộc thì không sang «Đang thi công».
 *  - Lãi dự kiến lúc nhận việc bất biến; điều chỉnh có duyệt thêm phiên bản ghi tên người duyệt.
 *  - Sau khởi công sửa ngân sách phải qua «Điều chỉnh ngân sách».
 *  - Đề nghị mua vượt phần còn lại của dòng ngân sách sang duyệt «Vượt ngân sách» (không bị chặn);
 *    dung sai để trống = không dung sai; đề nghị gửi trước giữ chỗ.
 *  - Chọn thầu phụ được duyệt thì cam kết ngân sách.
 *  - Chỉ huy trưởng công trình khác không thấy gì.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/g4-ban-giao-ngan-sach.test.ts`
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

interface ChecklistRow {
  id: string;
  item_key: string;
  status: string;
  attachment_path: string | null;
  given_by_name: string | null;
  given_at: string | null;
  received_by_name: string | null;
  received_at: string | null;
  issue_note: string | null;
  auto_available: boolean;
  auto_label: string | null;
  can_give: boolean;
  can_receive: boolean;
  can_confirm: boolean;
}

async function checklist(client: SupabaseClient, siteId: string, kind: 'ban_giao' | 'khoi_cong') {
  const { data, error } = await client.rpc('site_checklist', { p_site_id: siteId, p_kind: kind });
  expect(error).toBeNull();
  return (data ?? []) as ChecklistRow[];
}

const CONTRACT_VALUE = 1_234_567_000;

describeDb('Bàn giao, khởi công, ngân sách có duyệt (0249)', () => {
  const stamp = String(Date.now());
  let cht: SupabaseClient;
  let tp: SupabaseClient;
  let tgd: SupabaseClient;
  let dauThau: SupabaseClient;
  let muaHang: SupabaseClient;
  let nvcId = '';
  let prepSite = ''; // Chuẩn bị, chỉ huy trưởng NVC phụ trách
  let otherSite = ''; // Chuẩn bị, không ai phụ trách
  let runSite = ''; // Đang thi công — ngân sách / mua hàng
  let contractId = '';
  const prIds: string[] = [];

  beforeAll(async () => {
    [cht, tp, tgd, dauThau, muaHang] = await Promise.all([
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.dauThauNvc),
      signInAs(ACCOUNTS.muaHang),
    ]);
    await withSql(async (sql) => {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = nvc!.id;
      const [chtUser] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date, start_date, end_date)
        VALUES (${nvcId}, ${'NVC-HD-G4-' + stamp}, ${TEST_PREFIX + ' Hợp đồng G4 ' + stamp}, 'thi_cong', 'da_ky',
                ${CONTRACT_VALUE}, current_date, current_date + 5, current_date + 120)
        RETURNING id`;
      contractId = c!.id;
      await sql`INSERT INTO contract_terms (company_id, contract_id, term_type, description)
                VALUES (${nvcId}, ${contractId}, 'pham_vi', 'Thi công phần thô nhà xưởng')`;
      const sites = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, contract_id, responsible_user_id,
                                        planned_start_date, planned_end_date, stage)
        VALUES
          (${nvcId}, ${'NVC-CT-G4A-' + stamp}, ${TEST_PREFIX + ' G4 A ' + stamp}, ${contractId}, ${chtUser!.id},
           current_date + 5, current_date + 120, 'chuan_bi'),
          (${nvcId}, ${'NVC-CT-G4B-' + stamp}, ${TEST_PREFIX + ' G4 B ' + stamp}, NULL, NULL,
           current_date + 5, current_date + 120, 'chuan_bi'),
          (${nvcId}, ${'NVC-CT-G4C-' + stamp}, ${TEST_PREFIX + ' G4 C ' + stamp}, ${contractId}, ${chtUser!.id},
           current_date - 10, current_date + 120, 'dang_thi_cong')
        RETURNING id`;
      prepSite = sites[0]!.id;
      otherSite = sites[1]!.id;
      runSite = sites[2]!.id;
      await sql`
        INSERT INTO project_budgets (company_id, construction_site_id, cost_group, cost_code, name, budgeted_amount)
        VALUES (${nvcId}, ${prepSite}, 'vat_tu', 'VT-G4', 'Vật tư chính', 900000000),
               (${nvcId}, ${runSite}, 'vat_tu', 'VT-G4', 'Vật tư chính', 100000000),
               (${nvcId}, ${runSite}, 'thau_phu', 'TP-G4', 'Nhân công thầu phụ', 500000000)`;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`UPDATE system_parameters SET value = NULL
                 WHERE param_key = 'tc.over_budget_tolerance_percent' AND scope_type = 'company' AND scope_id = ${nvcId}`;
      await sql`DELETE FROM approvals WHERE entity_type = 'purchase_requests' AND entity_id = ANY(${prIds})`;
      await sql`DELETE FROM purchase_requests WHERE id = ANY(${prIds})`;
      await sql`DELETE FROM approvals WHERE entity_type IN ('budget_adjustments', 'subcontract_selections')
                  AND entity_id IN (SELECT id FROM budget_adjustments WHERE construction_site_id IN ${sql([prepSite, otherSite, runSite])}
                                    UNION SELECT id FROM subcontract_selections WHERE construction_site_id IN ${sql([prepSite, otherSite, runSite])})`;
      await sql`DELETE FROM construction_sites WHERE id IN ${sql([prepSite, otherSite, runSite])}`;
      await sql`DELETE FROM contracts WHERE id = ${contractId}`;
    });
  });

  // ---------------------------------------------------------------------------------------------
  it('công trình mới có danh mục bàn giao + khởi công chụp từ mẫu pháp nhân, hợp đồng tự nối', async () => {
    const items = await checklist(tp, prepSite, 'ban_giao');
    const keys = items.map((i) => i.item_key);
    expect(keys).toEqual(
      expect.arrayContaining(['hop_dong', 'ban_ve', 'du_toan', 'cam_ket', 'rui_ro']),
    );
    const hd = items.find((i) => i.item_key === 'hop_dong')!;
    expect(hd.auto_available).toBe(true);
    expect(hd.auto_label).toContain('NVC-HD-G4-' + stamp);
    expect(hd.auto_label).toContain('đã ghi phạm vi công việc');
    // Dự toán: ngân sách đã có số → «có», không nói số.
    const dt = items.find((i) => i.item_key === 'du_toan')!;
    expect(dt.auto_available).toBe(true);

    const start = await checklist(cht, prepSite, 'khoi_cong');
    const required = await withSql(
      (sql) => sql<{ item_key: string }[]>`
        SELECT item_key FROM site_checklist_items
         WHERE construction_site_id = ${prepSite} AND kind = 'khoi_cong' AND is_required ORDER BY item_key`,
    );
    expect(required.map((r) => r.item_key)).toEqual(['an_toan', 'phap_ly']);
    expect(start.every((i) => i.status === 'chua_dat' && i.can_confirm)).toBe(true);
  });

  it('Thi công không thấy giá trị hợp đồng / dự toán; tệp của mục nhạy cảm bị che', async () => {
    const dt = (await checklist(dauThau, prepSite, 'ban_giao')).find(
      (i) => i.item_key === 'du_toan',
    )!;
    expect(dt.can_give).toBe(true);
    const path = `${prepSite}/${dt.id}/du-toan-${stamp}.pdf`;
    const up = await dauThau.storage
      .from('site-handover-files')
      .upload(path, new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    expect(up.error).toBeNull();
    const give = await dauThau.rpc('give_handover_item', {
      p_item_id: dt.id,
      p_note: 'Dự toán đã duyệt bản 2',
      p_attachment_path: path,
    });
    expect(give.error).toBeNull();

    for (const client of [tp, cht]) {
      const rows = await checklist(client, prepSite, 'ban_giao');
      const text = JSON.stringify(rows);
      expect(text).not.toContain(String(CONTRACT_VALUE));
      expect(text).not.toContain('1.234.567');
      expect(text).not.toContain('900000000');
      expect(rows.find((i) => i.item_key === 'du_toan')!.attachment_path).toBeNull();
      const dl = await client.storage.from('site-handover-files').download(path);
      expect(dl.error).not.toBeNull();
    }
    // Người xem được giá vốn (Tổng Giám đốc) mở được tệp.
    const forTgd = (await checklist(tgd, prepSite, 'ban_giao')).find(
      (i) => i.item_key === 'du_toan',
    )!;
    expect(forTgd.attachment_path).toBe(path);
  });

  it('giao / nhận ghi người và giờ; báo thiếu cần ý kiến và báo cho bộ phận giao; giao sai bộ phận bị chặn', async () => {
    const rows = await checklist(dauThau, prepSite, 'ban_giao');
    const ruiRo = rows.find((i) => i.item_key === 'rui_ro')!;
    const camKet = rows.find((i) => i.item_key === 'cam_ket')!;
    expect(camKet.can_give).toBe(false); // Kinh doanh giao, không phải Dự án.

    const empty = await dauThau.rpc('give_handover_item', { p_item_id: ruiRo.id });
    expect(empty.error?.message).toMatch(/Đính kèm tệp, dán đường dẫn hoặc ghi rõ/);
    const wrongDept = await dauThau.rpc('give_handover_item', {
      p_item_id: camKet.id,
      p_note: 'x',
    });
    expect(wrongDept.error?.message).toMatch(/Không giao được/);

    expect(
      (
        await dauThau.rpc('give_handover_item', {
          p_item_id: ruiRo.id,
          p_note: 'Hàng xóm phía Đông khó tính',
        })
      ).error,
    ).toBeNull();
    // Chỉ huy trưởng không phải người nhận bàn giao.
    const chtReceive = await cht.rpc('receive_handover_item', {
      p_item_id: ruiRo.id,
      p_accept: true,
    });
    expect(chtReceive.error?.message).toMatch(/Trưởng phòng Thi công/);

    expect(
      (await tp.rpc('receive_handover_item', { p_item_id: ruiRo.id, p_accept: true })).error,
    ).toBeNull();
    const after = (await checklist(tp, prepSite, 'ban_giao')).find((i) => i.item_key === 'rui_ro')!;
    expect(after.status).toBe('da_nhan');
    expect(after.given_by_name).toBeTruthy();
    expect(after.given_at).toBeTruthy();
    expect(after.received_by_name).toBeTruthy();
    expect(after.received_at).toBeTruthy();

    const noNote = await tp.rpc('receive_handover_item', { p_item_id: camKet.id, p_accept: false });
    expect(noNote.error?.message).toMatch(/Ghi rõ thiếu gì/);
    expect(
      (
        await tp.rpc('receive_handover_item', {
          p_item_id: camKet.id,
          p_accept: false,
          p_note: 'Chưa có danh sách cam kết vật tư thay thế',
        })
      ).error,
    ).toBeNull();
    const notified = await withSql(
      (sql) => sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications n
          JOIN user_companies uc ON uc.user_id = n.user_id AND uc.company_id = ${nvcId}
          JOIN roles r ON r.id = uc.role_id
         WHERE n.type = 'site_handover_issue' AND n.related_entity_id = ${prepSite} AND r.code = 'KD'`,
    );
    expect(notified[0]!.n).toBeGreaterThan(0);
    const events = await withSql(
      (sql) => sql<{ action: string }[]>`
        SELECT e.action FROM site_checklist_events e JOIN site_checklist_items i ON i.id = e.item_id
         WHERE i.construction_site_id = ${prepSite} ORDER BY e.created_at`,
    );
    expect(events.map((e) => e.action)).toEqual(['giao', 'giao', 'nhan', 'bao_thieu']);
  });

  it('chưa đủ điều kiện khởi công bắt buộc thì không sang Đang thi công; đủ thì khởi công và chụp lãi lúc nhận việc', async () => {
    const blocked = await cht.rpc('move_site_stage', {
      p_site_id: prepSite,
      p_stage: 'dang_thi_cong',
    });
    expect(blocked.error?.message).toMatch(/điều kiện khởi công/);

    const items = await checklist(cht, prepSite, 'khoi_cong');
    const phapLy = items.find((i) => i.item_key === 'phap_ly')!;
    const anToan = items.find((i) => i.item_key === 'an_toan')!;
    const noEvidence = await cht.rpc('confirm_start_condition', {
      p_item_id: phapLy.id,
      p_done: true,
    });
    expect(noEvidence.error?.message).toMatch(/Ghi căn cứ/);
    expect(
      (
        await cht.rpc('confirm_start_condition', {
          p_item_id: phapLy.id,
          p_done: true,
          p_note: 'Biên bản bàn giao mặt bằng ngày 01/11',
        })
      ).error,
    ).toBeNull();
    const stillBlocked = await cht.rpc('move_site_stage', {
      p_site_id: prepSite,
      p_stage: 'dang_thi_cong',
    });
    expect(stillBlocked.error?.message).toMatch(/Phương án an toàn/);
    expect(
      (
        await cht.rpc('confirm_start_condition', {
          p_item_id: anToan.id,
          p_done: true,
          p_link_url: 'https://drive.example/an-toan.pdf',
        })
      ).error,
    ).toBeNull();
    expect(
      (await cht.rpc('move_site_stage', { p_site_id: prepSite, p_stage: 'dang_thi_cong' })).error,
    ).toBeNull();

    // Lãi dự kiến lúc nhận việc: phiên bản 1, giá bán − ngân sách.
    const { data: base } = await tgd
      .from('site_profit_baselines')
      .select('version, reason_kind, selling_price, approved_budget, expected_profit, approved_by')
      .eq('construction_site_id', prepSite);
    expect(base).toHaveLength(1);
    expect(base![0]!.reason_kind).toBe('khoi_cong');
    expect(Number(base![0]!.selling_price)).toBe(CONTRACT_VALUE);
    expect(Number(base![0]!.approved_budget)).toBe(900_000_000);
    expect(Number(base![0]!.expected_profit)).toBe(CONTRACT_VALUE - 900_000_000);
    expect(base![0]!.approved_by).toBeTruthy();
    // Thi công không đọc được lãi (Mẫu D).
    const { data: forTc } = await tp
      .from('site_profit_baselines')
      .select('id')
      .eq('construction_site_id', prepSite);
    expect(forTc ?? []).toEqual([]);
  });

  it('lãi lúc nhận việc bất biến', async () => {
    await expect(
      withSql(
        (sql) =>
          sql`UPDATE site_profit_baselines SET expected_profit = 1 WHERE construction_site_id = ${prepSite}`,
      ),
    ).rejects.toThrow(/không sửa, không xoá/);
  });

  it('sau khởi công sửa ngân sách phải gửi điều chỉnh có duyệt; duyệt xong thêm phiên bản lãi', async () => {
    const { data: line } = await tp
      .from('project_budgets')
      .select('id, budgeted_amount')
      .eq('construction_site_id', prepSite)
      .single();
    const direct = await tp.rpc('save_site_budget_line', {
      p_site_id: prepSite,
      p_line_id: line!.id,
      p_cost_group: 'vat_tu',
      p_cost_code: 'VT-G4',
      p_name: 'Vật tư chính',
      p_budgeted_amount: 950_000_000,
    });
    expect(direct.error?.message).toMatch(/Điều chỉnh ngân sách/);
    const viaRest = await tp
      .from('project_budgets')
      .update({ budgeted_amount: 1 })
      .eq('id', line!.id)
      .select('id');
    // Không có quyền sửa thẳng qua REST (không lỗi thì cũng không dòng nào đổi).
    expect(viaRest.error !== null || (viaRest.data ?? []).length === 0).toBe(true);

    const missing = await cht.rpc('request_budget_adjustment', {
      p_site_id: prepSite,
      p_line_id: line!.id,
      p_action: 'sua',
      p_cost_group: 'vat_tu',
      p_cost_code: 'VT-G4',
      p_name: 'Vật tư chính',
      p_new_amount: 920_000_000,
      p_reason: 'Giá thép tăng',
      p_cause: '',
      p_responsibility: 'Cung ứng',
      p_impact: 'Lãi giảm',
    });
    expect(missing.error?.message).toMatch(/bốn ý/);

    const req = await cht.rpc('request_budget_adjustment', {
      p_site_id: prepSite,
      p_line_id: line!.id,
      p_action: 'sua',
      p_cost_group: 'vat_tu',
      p_cost_code: 'VT-G4',
      p_name: 'Vật tư chính',
      p_new_amount: 920_000_000,
      p_reason: 'Giá thép tăng',
      p_cause: 'Thị trường thép tháng 11',
      p_responsibility: 'Cung ứng theo dõi giá',
      p_impact: 'Lãi dự kiến giảm 20 triệu đồng',
    });
    expect(req.error).toBeNull();
    const { data: adj } = await tp
      .from('budget_adjustments')
      .select('status, approval_id, old_amount, new_amount, delta')
      .eq('id', req.data as string)
      .single();
    expect(adj!.status).toBe('cho_duyet');
    expect(Number(adj!.delta)).toBe(20_000_000);
    // Ngân sách chưa đổi khi chưa duyệt.
    const { data: same } = await tp
      .from('project_budgets')
      .select('budgeted_amount')
      .eq('id', line!.id)
      .single();
    expect(Number(same!.budgeted_amount)).toBe(900_000_000);

    const { data: appr } = await tgd
      .from('approvals')
      .select('subject, amount')
      .eq('id', adj!.approval_id)
      .single();
    expect(appr!.subject).toBe('budget_adjustment');
    // Trưởng phòng Thi công duyệt trong hạn mức 50 triệu.
    expect(
      (await tp.rpc('decide_approval', { p_approval_id: adj!.approval_id, p_decision: 'approved' }))
        .error,
    ).toBeNull();
    const { data: changed } = await tp
      .from('project_budgets')
      .select('budgeted_amount')
      .eq('id', line!.id)
      .single();
    expect(Number(changed!.budgeted_amount)).toBe(920_000_000);
    const { data: versions } = await tgd
      .from('site_profit_baselines')
      .select('version, reason_kind, approved_budget, approved_by')
      .eq('construction_site_id', prepSite)
      .order('version');
    expect(versions!.map((v) => v.reason_kind)).toEqual(['khoi_cong', 'dieu_chinh_ngan_sach']);
    expect(Number(versions![1]!.approved_budget)).toBe(920_000_000);
    expect(versions![1]!.approved_by).toBeTruthy();

    // «Lúc nhận việc» đứng cạnh dự báo ở trang lãi / lỗ.
    const { data: pl } = await tgd.rpc('site_profit_loss_list', { p_company_id: nvcId });
    const row = (pl as Record<string, unknown>[]).find((r) => r.construction_site_id === prepSite)!;
    expect(Number(row.baseline_version)).toBe(2);
    expect(Number(row.first_baseline_profit)).toBe(CONTRACT_VALUE - 900_000_000);
    expect(Number(row.baseline_profit)).toBe(CONTRACT_VALUE - 920_000_000);
  });

  async function purchaseRequest(label: string, amount: number): Promise<string> {
    const id = await withSql(async (sql) => {
      const [mh] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.muaHang}`;
      const [pr] = await sql<{ id: string }[]>`
        INSERT INTO purchase_requests (company_id, code, title, construction_site_id, stage, needed_date, cost_code, requested_by)
        VALUES (${nvcId}, ${'PR-G4-' + label + '-' + stamp}, ${TEST_PREFIX + ' G4 mua ' + label},
                ${runSite}, 'nhap', current_date + 7, 'VT-G4', ${mh!.id})
        RETURNING id`;
      await sql`INSERT INTO purchase_request_items (purchase_request_id, position, name, unit, quantity, estimated_unit_price)
                VALUES (${pr!.id}, 1, 'Thép', 'kg', 1, ${amount})`;
      return pr!.id;
    });
    prIds.push(id);
    const sent = await muaHang.rpc('submit_purchase_request_approval', { p_request_id: id });
    expect(sent.error).toBeNull();
    return sent.data as string;
  }

  it('đề nghị mua vượt ngân sách còn lại sang duyệt «Vượt ngân sách», không bị chặn; dung sai trống = không dung sai', async () => {
    // Dòng VT-G4 của công trình đang chạy: 100 triệu, chưa cam kết.
    const fits = await purchaseRequest('A', 60_000_000);
    const over = await purchaseRequest('B', 45_000_000); // 60 + 45 > 100: đề nghị A giữ chỗ trước.
    const { data: rows } = await tgd
      .from('approvals')
      .select('id, subject, title')
      .in('id', [fits, over]);
    const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));
    expect(byId[fits]!.subject).toBe('purchase_request');
    expect(byId[over]!.subject).toBe('over_budget');
    expect(byId[over]!.title).toMatch(/^Vượt ngân sách — /);

    const { data: brief } = await tp.rpc('approval_budget_brief', { p_approval_id: over });
    const b = (brief as Record<string, unknown>[])[0]!;
    expect(Number(b.budgeted)).toBe(100_000_000);
    expect(Number(b.reserved)).toBe(60_000_000);
    expect(Number(b.remaining)).toBe(40_000_000);
    expect(Number(b.overrun)).toBe(5_000_000);
    expect(b.tolerance_percent).toBeNull();

    // Mua hàng duyệt được đề nghị mua thường nhưng không duyệt được hồ sơ vượt ngân sách.
    const mhTry = await muaHang.rpc('decide_approval', {
      p_approval_id: over,
      p_decision: 'approved',
    });
    expect(mhTry.error).not.toBeNull();
    expect(
      (await tp.rpc('decide_approval', { p_approval_id: over, p_decision: 'approved' })).error,
    ).toBeNull();

    // Vượt 1 đồng cũng phải duyệt khi dung sai để trống.
    const oneDong = await purchaseRequest('C', 1);
    const { data: c } = await tgd.from('approvals').select('subject').eq('id', oneDong).single();
    expect(c!.subject).toBe('over_budget');

    // Đặt dung sai 10 % (10 triệu trên dòng 100 triệu): đang vượt 5 triệu + 1 đồng, thêm 4 triệu vẫn
    // trong dung sai nên đi duyệt thường.
    await withSql(
      (sql) => sql`UPDATE system_parameters SET value = '10'::jsonb
                    WHERE param_key = 'tc.over_budget_tolerance_percent' AND scope_type = 'company' AND scope_id = ${nvcId}`,
    );
    const within = await purchaseRequest('D', 4_000_000);
    const { data: d } = await tgd.from('approvals').select('subject').eq('id', within).single();
    expect(d!.subject).toBe('purchase_request');
    await withSql(
      (sql) => sql`UPDATE system_parameters SET value = NULL
                    WHERE param_key = 'tc.over_budget_tolerance_percent' AND scope_type = 'company' AND scope_id = ${nvcId}`,
    );
  });

  it('chọn thầu phụ được duyệt thì cam kết ngân sách; vượt ngân sách cũng sang duyệt «Vượt ngân sách»', async () => {
    async function selection(value: number) {
      const { data: sel, error } = await cht
        .from('subcontract_selections')
        .insert({
          construction_site_id: runSite,
          work_package: `${TEST_PREFIX} G4 gói ${value}`,
          cost_code: 'TP-G4',
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      const { data: offer } = await cht
        .from('subcontract_offers')
        .insert({
          selection_id: sel!.id,
          crew_name: `${TEST_PREFIX} Tổ ${value}`,
          offered_value: value,
        })
        .select('id')
        .single();
      const sent = await cht.rpc('submit_subcontract_selection', {
        p_selection_id: sel!.id,
        p_offer_id: offer!.id,
        p_reason: 'Tổ quen việc, chỉ một báo giá',
      });
      expect(sent.error).toBeNull();
      return { selectionId: sel!.id, approvalId: sent.data as string };
    }

    const small = await selection(30_000_000);
    expect(
      (await tp.rpc('decide_approval', { p_approval_id: small.approvalId, p_decision: 'approved' }))
        .error,
    ).toBeNull();
    const { data: line } = await tp
      .from('project_budgets')
      .select('committed_amount')
      .eq('construction_site_id', runSite)
      .eq('cost_code', 'TP-G4')
      .single();
    expect(Number(line!.committed_amount)).toBe(30_000_000);
    const { data: sel } = await cht
      .from('subcontract_selections')
      .select('subcontractor_id')
      .eq('id', small.selectionId)
      .single();
    const [sub] = await withSql(
      (sql) => sql<{ committed_to_budget: string }[]>`
        SELECT committed_to_budget FROM subcontractors WHERE id = ${sel!.subcontractor_id}`,
    );
    expect(Number(sub!.committed_to_budget)).toBe(30_000_000);

    const big = await selection(480_000_000); // còn 470 triệu
    const { data: appr } = await tgd
      .from('approvals')
      .select('subject')
      .eq('id', big.approvalId)
      .single();
    expect(appr!.subject).toBe('over_budget');
  });

  it('chỉ huy trưởng công trình khác không thấy gì', async () => {
    expect(await checklist(cht, otherSite, 'khoi_cong')).toEqual([]);
    expect(await checklist(cht, otherSite, 'ban_giao')).toEqual([]);
    const itemId = (
      await withSql(
        (sql) => sql<{ id: string }[]>`
          SELECT id FROM site_checklist_items WHERE construction_site_id = ${otherSite} AND item_key = 'phap_ly'`,
      )
    )[0]!.id;
    const tick = await cht.rpc('confirm_start_condition', {
      p_item_id: itemId,
      p_done: true,
      p_note: 'x',
    });
    expect(tick.error).not.toBeNull();
    const { data: direct } = await cht
      .from('site_checklist_items')
      .select('id')
      .eq('construction_site_id', otherSite);
    expect(direct ?? []).toEqual([]);
    const adj = await cht.rpc('request_budget_adjustment', {
      p_site_id: otherSite,
      p_line_id: null,
      p_action: 'them',
      p_cost_group: 'vat_tu',
      p_cost_code: 'X',
      p_name: 'x',
      p_new_amount: 1,
      p_reason: 'a',
      p_cause: 'b',
      p_responsibility: 'c',
      p_impact: 'd',
    });
    expect(adj.error).not.toBeNull();
  });
});
