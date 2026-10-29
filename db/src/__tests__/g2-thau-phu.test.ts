/**
 * Nhà thầu phụ / tổ đội trọn vòng (G2 — A4 + T5, migration 0246).
 *
 * Hàng rào phải đứng:
 *  - Chọn thầu phụ đi qua phê duyệt theo hạn mức; một báo giá / không chọn giá thấp nhất phải có lý do.
 *  - Đề nghị thanh toán cho tổ đội không gắn đợt khối lượng hoặc biên bản nghiệm thu bị chặn.
 *  - Không đề nghị quá số của đợt (sau giữ lại bảo hành, trừ phần đã đề nghị).
 *  - Dòng chưa nghiệm thu bị loại kèm lý do, không lên tiền.
 *  - Đợt đã ký và xác nhận thì bất biến.
 *  - Chỉ huy trưởng công trình khác không thấy gì.
 *  - Tỷ lệ giữ lại bảo hành chụp lúc ký, đổi sau không hồi tố.
 *  - Khoán gọn: một dòng trọn gói, kỳ này ghi tỷ lệ hoàn thành.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/g2-thau-phu.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  hasCredentials,
  signAcceptanceWithPaper,
  signInAs,
  TEST_PREFIX,
} from './helpers';

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

const COST_CODE = 'TP-G2';

async function signPeriod(client: SupabaseClient, siteId: string, periodId: string) {
  const path = `${siteId}/${periodId}/ban-giay-${crypto.randomUUID()}.pdf`;
  const up = await client.storage
    .from('subcontract-docs')
    .upload(path, new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
    });
  if (up.error) return { data: null, error: up.error };
  return client.rpc('sign_subcontract_period', {
    p_period_id: periodId,
    p_crew_name: 'Tổ trưởng Nguyễn Văn Thợ',
    p_paper_scan_path: path,
  });
}

async function acceptance(client: SupabaseClient, siteId: string, subId: string, value: number) {
  const { data, error } = await client.rpc('record_acceptance', {
    p_site_id: siteId,
    p_acceptance_type: 'thau_phu',
    p_stage_name: `${TEST_PREFIX} Nghiệm thu tổ đội`,
    p_value: value,
    p_subcontractor_id: subId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

describeDb('Nhà thầu phụ trọn vòng (0246)', () => {
  const stamp = String(Date.now());
  let cht: SupabaseClient;
  let tp: SupabaseClient;
  let tgd: SupabaseClient;
  let siteA = '';
  let siteB = '';
  let subDonGia = '';
  let subKhoanGon = '';
  let line1 = '';
  let line2 = '';
  let period1 = '';
  let accSigned = '';
  let paymentId = '';
  let periodB = '';
  let subB = '';

  beforeAll(async () => {
    [cht, tp, tgd] = await Promise.all([
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.tgd),
    ]);
    await withSql(async (sql) => {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [u] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
      const sites = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id)
        VALUES
          (${nvc!.id}, ${'NVC-CT-G2A-' + stamp}, ${TEST_PREFIX + ' G2 A ' + stamp}, 'dang_thi_cong', current_date + 90, ${u!.id}),
          (${nvc!.id}, ${'NVC-CT-G2B-' + stamp}, ${TEST_PREFIX + ' G2 B ' + stamp}, 'dang_thi_cong', current_date + 90, NULL)
        RETURNING id`;
      siteA = sites[0]!.id;
      siteB = sites[1]!.id;
      await sql`
        INSERT INTO project_budgets (company_id, construction_site_id, cost_group, cost_code, name, budgeted_amount)
        VALUES (${nvc!.id}, ${siteA}, 'thau_phu', ${COST_CODE}, 'Nhân công thầu phụ', 500000000),
               (${nvc!.id}, ${siteB}, 'thau_phu', ${COST_CODE}, 'Nhân công thầu phụ', 500000000)`;
      // Công trình B: một tổ đội có đợt đã lập — chỉ để kiểm phạm vi chỉ huy trưởng.
      const [sb] = await sql<{ id: string }[]>`
        INSERT INTO subcontractors (company_id, construction_site_id, name, scope_of_work, retention_rate)
        VALUES (${nvc!.id}, ${siteB}, ${TEST_PREFIX + ' Tổ B'}, 'Xây', 5) RETURNING id`;
      await sql`INSERT INTO subcontract_lines (company_id, construction_site_id, subcontractor_id, item, unit, contract_quantity, unit_price)
                VALUES (${nvc!.id}, ${siteB}, ${sb!.id}, 'Xây', 'm2', 10, 100000)`;
      subB = sb!.id;
    });
    // Mã đợt cấp theo phiên đăng nhập — lập bằng Trưởng phòng Thi công (thấy mọi công trình).
    const { data: pb, error } = await tp
      .from('subcontract_periods')
      .insert({ subcontractor_id: subB, construction_site_id: siteB })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    periodB = pb!.id;
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM payment_requests WHERE subcontractor_id IN (
        SELECT id FROM subcontractors WHERE construction_site_id IN ${sql([siteA, siteB])})`;
      await sql`DELETE FROM approvals WHERE entity_type = 'subcontract_selections' AND entity_id IN (
        SELECT id FROM subcontract_selections WHERE construction_site_id IN ${sql([siteA, siteB])})`;
      await sql`DELETE FROM construction_sites WHERE id IN ${sql([siteA, siteB])}`;
    });
  });

  it('chọn thầu phụ: chọn giá không thấp nhất phải có lý do; vượt hạn mức Thi công thì Thi công không duyệt được', async () => {
    const { data: sel, error } = await cht
      .from('subcontract_selections')
      .insert({
        construction_site_id: siteA,
        work_package: `${TEST_PREFIX} Xây trát tầng 1`,
        cost_code: COST_CODE,
      })
      .select('id, company_id, code, status')
      .single();
    expect(error).toBeNull();
    expect(sel!.status).toBe('nhap');
    const offers = await cht
      .from('subcontract_offers')
      .insert([
        {
          selection_id: sel!.id,
          crew_name: `${TEST_PREFIX} Tổ Hùng`,
          offered_value: 60_000_000,
          retention_rate: 5,
        },
        { selection_id: sel!.id, crew_name: `${TEST_PREFIX} Tổ Dũng`, offered_value: 70_000_000 },
      ])
      .select('id, crew_name, offered_value');
    expect(offers.error).toBeNull();
    const cheap = offers.data!.find((o) => o.offered_value === 60_000_000)!;
    const dear = offers.data!.find((o) => o.offered_value === 70_000_000)!;

    const noReason = await cht.rpc('submit_subcontract_selection', {
      p_selection_id: sel!.id,
      p_offer_id: dear.id,
    });
    expect(noReason.error?.message).toMatch(/không phải giá thấp nhất/);

    const sent = await cht.rpc('submit_subcontract_selection', {
      p_selection_id: sel!.id,
      p_offer_id: cheap.id,
    });
    expect(sent.error).toBeNull();
    const approvalId = sent.data as string;

    // Đã gửi thì không sửa báo giá được nữa.
    const late = await cht
      .from('subcontract_offers')
      .update({ offered_value: 1 })
      .eq('id', cheap.id)
      .select('id');
    expect(late.data ?? []).toEqual([]);

    // 60 triệu > hạn mức 50 triệu của Trưởng phòng Thi công.
    const tooBig = await tp.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
    });
    expect(tooBig.error?.message).toMatch(/vượt hạn mức/);

    const ok = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
    });
    expect(ok.error).toBeNull();

    const { data: after } = await cht
      .from('subcontract_selections')
      .select('status, subcontractor_id')
      .eq('id', sel!.id)
      .single();
    expect(after!.status).toBe('da_duyet');
    const { data: sc } = await cht
      .from('subcontractors')
      .select('id, name, pricing_method, retention_rate, cost_code, contract_value')
      .eq('id', after!.subcontractor_id)
      .single();
    expect(sc!.name).toContain('Tổ Hùng');
    expect(Number(sc!.retention_rate)).toBe(5);
    expect(sc!.cost_code).toBe(COST_CODE);
    subDonGia = sc!.id;
  });

  it('một báo giá vẫn đi duyệt nhưng phải ghi lý do; trong hạn mức thì Thi công duyệt — khoán gọn tự có dòng trọn gói', async () => {
    const { data: sel } = await cht
      .from('subcontract_selections')
      .insert({
        construction_site_id: siteA,
        work_package: `${TEST_PREFIX} Chống thấm mái`,
        cost_code: COST_CODE,
      })
      .select('id')
      .single();
    const { data: offer } = await cht
      .from('subcontract_offers')
      .insert({
        selection_id: sel!.id,
        crew_name: `${TEST_PREFIX} Tổ chống thấm`,
        offered_value: 30_000_000,
        pricing_method: 'khoan_gon',
      })
      .select('id')
      .single();
    const noReason = await cht.rpc('submit_subcontract_selection', {
      p_selection_id: sel!.id,
      p_offer_id: offer!.id,
    });
    expect(noReason.error?.message).toMatch(/Chỉ có một báo giá/);
    const sent = await cht.rpc('submit_subcontract_selection', {
      p_selection_id: sel!.id,
      p_offer_id: offer!.id,
      p_reason: 'Tổ duy nhất có chứng chỉ chống thấm trong khu vực',
    });
    expect(sent.error).toBeNull();
    const ok = await tp.rpc('decide_approval', {
      p_approval_id: sent.data,
      p_decision: 'approved',
    });
    expect(ok.error).toBeNull();

    const { data: s } = await cht
      .from('subcontract_selections')
      .select('subcontractor_id')
      .eq('id', sel!.id)
      .single();
    subKhoanGon = s!.subcontractor_id as string;
    const { data: lines } = await cht
      .from('subcontract_lines')
      .select('contract_quantity, unit_price, amount')
      .eq('subcontractor_id', subKhoanGon);
    expect(lines).toHaveLength(1);
    expect(Number(lines![0]!.contract_quantity)).toBe(1);
    expect(Number(lines![0]!.amount)).toBe(30_000_000);
  });

  it('bảng đơn giá; đề nghị thanh toán cho tổ đội không có căn cứ bị chặn', async () => {
    const { data, error } = await cht
      .from('subcontract_lines')
      .insert([
        {
          subcontractor_id: subDonGia,
          position: 1,
          item: 'Xây tường',
          unit: 'm2',
          contract_quantity: 100,
          unit_price: 200_000,
        },
        {
          subcontractor_id: subDonGia,
          position: 2,
          item: 'Trát tường',
          unit: 'm2',
          contract_quantity: 200,
          unit_price: 100_000,
        },
      ])
      .select('id, item, amount');
    expect(error).toBeNull();
    line1 = data!.find((l) => l.item === 'Xây tường')!.id;
    line2 = data!.find((l) => l.item === 'Trát tường')!.id;

    const { data: nvc } = await cht
      .from('subcontractors')
      .select('company_id')
      .eq('id', subDonGia)
      .single();
    const blocked = await cht.from('payment_requests').insert({
      company_id: nvc!.company_id,
      title: `${TEST_PREFIX} Trả tổ theo tin nhắn`,
      amount: 5_000_000,
      payee_name: 'Tổ Hùng',
      subcontractor_id: subDonGia,
    });
    expect(blocked.error?.message).toMatch(/phải gắn đợt xác nhận khối lượng/);
  });

  it('đợt khối lượng: dòng chưa nghiệm thu bị loại kèm lý do; ký chụp tỷ lệ giữ lại; chưa xác nhận thì chưa lập đề nghị', async () => {
    accSigned = await acceptance(cht, siteA, subDonGia, 8_000_000);
    const signed = await signAcceptanceWithPaper(cht, siteA, accSigned, 'Tổ trưởng');
    expect(signed.error).toBeNull();
    const accUnsigned = await acceptance(cht, siteA, subDonGia, 5_000_000);

    const { data: p, error } = await cht
      .from('subcontract_periods')
      .insert({ subcontractor_id: subDonGia, construction_site_id: siteA })
      .select('id, period_no, status')
      .single();
    expect(error).toBeNull();
    expect(p!.period_no).toBe(1);
    period1 = p!.id;

    const lines = await cht
      .from('subcontract_period_lines')
      .insert([
        { period_id: period1, line_id: line1, quantity: 40, acceptance_record_id: accSigned },
        { period_id: period1, line_id: line2, quantity: 50, acceptance_record_id: accUnsigned },
      ])
      .select('line_id, amount, excluded, exclusion_reason');
    expect(lines.error).toBeNull();
    const counted = lines.data!.find((l) => l.line_id === line1)!;
    const dropped = lines.data!.find((l) => l.line_id === line2)!;
    expect(Number(counted.amount)).toBe(8_000_000);
    expect(dropped.excluded).toBe(true);
    expect(dropped.exclusion_reason).toMatch(/chưa ký hai bên/);
    expect(Number(dropped.amount)).toBe(0);

    const s = await signPeriod(cht, siteA, period1);
    expect(s.error).toBeNull();
    expect(Number(s.data)).toBe(7_600_000); // 8 triệu − 5 % giữ lại

    const early = await cht.rpc('create_payment_request_from_period', { p_period_id: period1 });
    expect(early.error?.message).toMatch(/chưa được xác nhận/);

    // Người lập không tự xác nhận.
    const self = await cht.rpc('confirm_subcontract_period', {
      p_period_id: period1,
      p_approve: true,
      p_quality: 4,
    });
    expect(self.error).not.toBeNull();

    const ok = await tp.rpc('confirm_subcontract_period', {
      p_period_id: period1,
      p_approve: true,
      p_quality: 4,
      p_safety: 5,
      p_note: 'Đạt',
    });
    expect(ok.error).toBeNull();
  });

  it('đợt đã ký và xác nhận thì bất biến — cả với kết nối trực tiếp', async () => {
    const line = await cht
      .from('subcontract_period_lines')
      .update({ quantity: 99 })
      .eq('period_id', period1)
      .select('id');
    expect(line.data ?? []).toEqual([]);
    await expect(
      withSql((sql) => sql`UPDATE subcontract_periods SET notes = 'sửa lén' WHERE id = ${period1}`),
    ).rejects.toThrow(/không sửa được/);
    await expect(
      withSql(
        (sql) =>
          sql`UPDATE subcontract_period_lines SET quantity = 99 WHERE period_id = ${period1}`,
      ),
    ).rejects.toThrow(/đã ký/);
  });

  it('đổi tỷ lệ giữ lại sau khi ký không hồi tố đợt cũ', async () => {
    const upd = await cht.from('subcontractors').update({ retention_rate: 10 }).eq('id', subDonGia);
    expect(upd.error).toBeNull();
    const { data } = await cht.rpc('subcontract_period_document', { p_period_id: period1 });
    const doc = data as {
      net_amount: number;
      retention_rate_applied: number;
      quality_rating: number;
    };
    expect(Number(doc.retention_rate_applied)).toBe(5);
    expect(Number(doc.net_amount)).toBe(7_600_000);
    expect(doc.quality_rating).toBe(4);
  });

  it('lập đề nghị từ đợt đã xác nhận; không vượt số còn lại của đợt', async () => {
    const { data, error } = await cht.rpc('create_payment_request_from_period', {
      p_period_id: period1,
    });
    expect(error).toBeNull();
    paymentId = data as string;
    const { data: pr } = await cht
      .from('payment_requests')
      .select('amount, subcontractor_id, payee_name')
      .eq('id', paymentId)
      .single();
    expect(Number(pr!.amount)).toBe(7_600_000);
    expect(pr!.subcontractor_id).toBe(subDonGia);

    const again = await cht.rpc('create_payment_request_from_period', { p_period_id: period1 });
    expect(again.error?.message).toMatch(/đủ số tiền/);

    const { data: sc } = await cht
      .from('subcontractors')
      .select('company_id')
      .eq('id', subDonGia)
      .single();
    const over = await cht.from('payment_requests').insert({
      company_id: sc!.company_id,
      title: `${TEST_PREFIX} Trả thêm`,
      amount: 1,
      payee_name: 'Tổ Hùng',
      subcontract_period_id: period1,
    });
    expect(over.error?.message).toMatch(/vượt số còn được đề nghị/);

    // Biên bản đã nằm trong đợt thì không trả lần hai theo biên bản.
    const dup = await cht.from('payment_requests').insert({
      company_id: sc!.company_id,
      title: `${TEST_PREFIX} Trả theo biên bản`,
      amount: 1_000_000,
      payee_name: 'Tổ Hùng',
      acceptance_record_id: accSigned,
    });
    expect(dup.error?.message).toMatch(/đã nằm trong đợt/);
  });

  it('khoán gọn: kỳ này ghi tỷ lệ hoàn thành; chỉ một dòng trọn gói; sổ theo dõi khớp', async () => {
    const { data: line } = await cht
      .from('subcontract_lines')
      .select('id')
      .eq('subcontractor_id', subKhoanGon)
      .single();
    const extra = await cht.from('subcontract_lines').insert({
      subcontractor_id: subKhoanGon,
      item: 'Thêm',
      unit: 'gói',
      contract_quantity: 1,
      unit_price: 1,
    });
    expect(extra.error?.message).toMatch(/một dòng trọn gói/);

    const acc = await acceptance(cht, siteA, subKhoanGon, 12_000_000);
    expect((await signAcceptanceWithPaper(cht, siteA, acc, 'Tổ trưởng')).error).toBeNull();
    const { data: p } = await cht
      .from('subcontract_periods')
      .insert({ subcontractor_id: subKhoanGon, construction_site_id: siteA })
      .select('id')
      .single();
    const pl = await cht
      .from('subcontract_period_lines')
      .insert({ period_id: p!.id, line_id: line!.id, quantity: 0.4, acceptance_record_id: acc })
      .select('amount')
      .single();
    expect(Number(pl.data!.amount)).toBe(12_000_000);
    expect((await signPeriod(cht, siteA, p!.id)).error).toBeNull();
    expect(
      (
        await tp.rpc('confirm_subcontract_period', {
          p_period_id: p!.id,
          p_approve: true,
          p_quality: 5,
        })
      ).error,
    ).toBeNull();

    const { data: ledger } = await cht.rpc('subcontractor_ledger', { p_site_id: siteA });
    const rows = ledger as {
      subcontractor_id: string;
      contract_value: number;
      confirmed_net: number;
      requested: number;
      remaining_contract: number;
      retention_held: number;
    }[];
    const kg = rows.find((r) => r.subcontractor_id === subKhoanGon)!;
    expect(Number(kg.contract_value)).toBe(30_000_000);
    expect(Number(kg.confirmed_net)).toBe(12_000_000);
    expect(Number(kg.remaining_contract)).toBe(18_000_000);
    const dg = rows.find((r) => r.subcontractor_id === subDonGia)!;
    expect(Number(dg.contract_value)).toBe(40_000_000);
    expect(Number(dg.retention_held)).toBe(400_000);
    expect(Number(dg.requested)).toBe(7_600_000);
  });

  it('chuỗi hồ sơ từ đề nghị thanh toán đi ngược tới đợt, tổ đội, công trình', async () => {
    const { data, error } = await cht.rpc('record_chain', {
      p_entity_type: 'payment_request',
      p_id: paymentId,
    });
    expect(error).toBeNull();
    const kinds = (data as { kind: string; id: string }[]).map((r) => r.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['site', 'subcontractor', 'subcontract_period', 'payment_request']),
    );
  });

  it('chỉ huy trưởng công trình khác không thấy tổ đội, đợt, sổ theo dõi', async () => {
    const periods = await cht
      .from('subcontract_periods')
      .select('id')
      .eq('construction_site_id', siteB);
    expect(periods.data ?? []).toEqual([]);
    const lines = await cht
      .from('subcontract_lines')
      .select('id')
      .eq('construction_site_id', siteB);
    expect(lines.data ?? []).toEqual([]);
    const { data: ledger } = await cht.rpc('subcontractor_ledger', { p_site_id: siteB });
    expect(ledger ?? []).toEqual([]);
    const doc = await cht.rpc('subcontract_period_document', { p_period_id: periodB });
    expect(doc.error).not.toBeNull();
    const sel = await cht.from('subcontract_selections').insert({
      construction_site_id: siteB,
      work_package: `${TEST_PREFIX} Lén`,
      cost_code: COST_CODE,
    });
    expect(sel.error).not.toBeNull();
    // Trưởng phòng Thi công (không giới hạn công trình) thì thấy.
    const tpSees = await tp
      .from('subcontract_periods')
      .select('id')
      .eq('construction_site_id', siteB);
    expect(tpSees.data ?? []).toHaveLength(1);
  });
});
