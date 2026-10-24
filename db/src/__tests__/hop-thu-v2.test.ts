/**
 * Hộp thư phê duyệt v2 — ô «Tôi đã gửi» và «Đã xử lý» (0221, `my_approval_box`).
 *
 * Hàm chỉ đọc, chạy bằng quyền người gọi: người gửi thấy hồ sơ mình gửi, người duyệt thấy hồ sơ
 * mình đã quyết, người thứ ba KHÔNG thấy gì của hai người kia — kể cả khi gọi đúng ô.
 */

import { describe, expect, it } from 'vitest';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('Hộp thư phê duyệt — Tôi đã gửi / Đã xử lý (0221)', () => {
  it('người gửi thấy ở «Tôi đã gửi», người duyệt thấy ở «Đã xử lý», người khác không thấy', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const thiCong = await signInAs(ACCOUNTS.congTruongNvc);
    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const { data: customer } = await kd.from('customers').select('id').limit(1).single();
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: code } = await kd.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'CH',
    });
    const { data: opp } = await kd
      .from('opportunities')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer!.id,
        name: `${TEST_PREFIX} Hộp thư v2 ${Date.now()}`,
        owner_id: me,
        stage: 'bao_gia',
        estimated_value: 100_000_000,
      })
      .select('id')
      .single();
    const { data: quote } = await kd
      .from('quotes')
      .insert({ company_id: company!.id, opportunity_id: opp!.id, total_value: 100_000_000 })
      .select('id')
      .single();
    expect((await kd.rpc('request_quote_approval', { p_quote_id: quote!.id })).error).toBeNull();
    const { data: approval } = await kd
      .from('approvals')
      .select('id')
      .eq('entity_type', 'quotes')
      .eq('entity_id', quote!.id)
      .eq('status', 'pending_approval')
      .single();
    const has = (rows: unknown, id: string) =>
      ((rows ?? []) as { id: string }[]).some((r) => r.id === id);

    // Người gửi: có trong «Tôi đã gửi», đang chờ, chưa có quyết định của chính mình.
    const sent = await kd.rpc('my_approval_box', { p_box: 'sent' });
    expect(sent.error).toBeNull();
    const row = (sent.data as { id: string; status: string; due_at: string | null }[]).find(
      (r) => r.id === approval!.id,
    );
    expect(row?.status).toBe('pending_approval');

    // Người duyệt chưa quyết thì chưa có trong «Đã xử lý».
    expect(has((await tgd.rpc('my_approval_box', { p_box: 'decided' })).data, approval!.id)).toBe(
      false,
    );
    expect(
      (await tgd.rpc('decide_approval', { p_approval_id: approval!.id, p_decision: 'approved' }))
        .error,
    ).toBeNull();
    const decided = (await tgd.rpc('my_approval_box', { p_box: 'decided' })).data as {
      id: string;
      my_decision: string;
    }[];
    expect(decided.find((r) => r.id === approval!.id)?.my_decision).toBe('approved');

    // Người thứ ba (Thi công, không gửi, không duyệt): không thấy ở ô nào.
    expect(has((await thiCong.rpc('my_approval_box', { p_box: 'sent' })).data, approval!.id)).toBe(
      false,
    );
    expect(
      has((await thiCong.rpc('my_approval_box', { p_box: 'decided' })).data, approval!.id),
    ).toBe(false);
    // Người gửi không thấy hồ sơ ở «Đã xử lý» của mình — mình không quyết nó.
    expect(has((await kd.rpc('my_approval_box', { p_box: 'decided' })).data, approval!.id)).toBe(
      false,
    );
  });

  it('ô lạ trả rỗng, không lỗi', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data, error } = await kd.rpc('my_approval_box', { p_box: 'khac' });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
