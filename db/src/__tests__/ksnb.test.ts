/**
 * Kiểm soát nội bộ (KSNB, 0167–0168) — XEM mọi pháp nhân, mọi phân hệ; KHÔNG ghi, KHÔNG phê duyệt.
 *
 * Vai trò «xem mọi pháp nhân» đầu tiên không phải cấp quản lý. Trước 0168, hai bảng cho ghi chỉ vì
 * `sees_all_companies` (danh mục kiểm tra nghiệm thu, phân công người vào công trình); phía giao
 * diện `useIsResponsible` cũng lấy cờ đó làm «quản lý mọi hồ sơ». Các phép thử dưới đây thử ghi
 * trên các bảng và hàm chính — thêm chỗ ghi mới dựa vào `sees_all_companies` mà quên vai trò chỉ
 * xem thì một phép thử ở đây phải đỏ.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('Kiểm soát nội bộ — chỉ xem (0168)', () => {
  let ksnb: SupabaseClient;
  let nvcOpp: string;
  let nvoOpp: string;
  let nvcCompany: string;

  async function newOpportunity(client: SupabaseClient, companyCode: string): Promise<string> {
    const { data: company } = await client
      .from('companies')
      .select('id')
      .eq('code', companyCode)
      .single();
    const { data: customer } = await client.from('customers').select('id').limit(1).single();
    const { data: me } = await client.rpc('auth_user_id');
    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: companyCode,
      p_record_type: 'CH',
    });
    const { data, error } = await client
      .from('opportunities')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer!.id,
        name: `${TEST_PREFIX} KSNB ${companyCode} ${Date.now()}`,
        owner_id: me,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  beforeAll(async () => {
    ksnb = await signInAs(ACCOUNTS.ksnb);
    const kdNvc = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    nvcOpp = await newOpportunity(kdNvc, 'NVC');
    nvoOpp = await newOpportunity(kdNvo, 'NVO');
    const { data } = await ksnb.from('companies').select('id').eq('code', 'NVC').single();
    nvcCompany = data!.id as string;
  });

  it('xem được hồ sơ của mọi pháp nhân và nhật ký kiểm toán', async () => {
    const { data } = await ksnb.from('opportunities').select('id').in('id', [nvcOpp, nvoOpp]);
    expect((data ?? []).map((r) => r.id).sort()).toEqual([nvcOpp, nvoOpp].sort());

    const { error: auditError } = await ksnb.from('audit_logs').select('id').limit(1);
    expect(auditError).toBeNull();

    const { data: finance } = await ksnb.rpc('rls_sees_finance');
    expect(finance).toBe(true);
    const { data: profit } = await ksnb.rpc('rls_sees_sensitive', { kind: 'profit' });
    expect(profit).toBe(true);
  });

  it('không xem lương và hồ sơ cá nhân', async () => {
    const { data: salary } = await ksnb.rpc('rls_sees_sensitive', { kind: 'salary' });
    expect(salary).toBe(false);
    const { data: personal } = await ksnb.rpc('rls_sees_sensitive', { kind: 'personal' });
    expect(personal).toBe(false);
  });

  it('không tạo, sửa, chuyển bước hồ sơ', async () => {
    const { error: create } = await ksnb.from('opportunities').insert({
      code: `${TEST_PREFIX}-KSNB`,
      company_id: nvcCompany,
      name: `${TEST_PREFIX} KSNB tự tạo`,
    });
    expect(create?.code).toBe('42501');

    const { data: edited } = await ksnb
      .from('opportunities')
      .update({ notes: 'KSNB sửa' })
      .eq('id', nvcOpp)
      .select('id');
    expect(edited ?? []).toHaveLength(0);

    const { error: move } = await ksnb.rpc('move_opportunity_stage', {
      p_opportunity_id: nvcOpp,
      p_to_stage: 'xac_minh',
    });
    expect(move).toBeTruthy();
  });

  it('không ghi được hai bảng trước đây chỉ đòi «xem mọi pháp nhân»', async () => {
    const { error: checklist } = await ksnb.from('acceptance_checklists').insert({
      company_id: nvcCompany,
      name: `${TEST_PREFIX} KSNB danh mục`,
      // Mục hợp lệ — mảng rỗng bị ràng buộc dữ liệu chặn trước khi tới RLS, phép thử sẽ đạt
      // vì lý do khác (đã gặp khi đo bằng cách nới chính sách).
      items: [{ key: 'cao_do', label: 'Kiểm tra cao độ', requires_photo: false }],
    });
    expect(checklist?.code).toBe('42501');

    const { data: site } = await ksnb.from('construction_sites').select('id').limit(1).single();
    const { data: me } = await ksnb.rpc('auth_user_id');
    const { error: assign } = await ksnb
      .from('user_site_assignments')
      .insert({ user_id: me, construction_site_id: site!.id });
    expect(assign?.code).toBe('42501');
  });

  it('không phê duyệt: Hộp thư rỗng, gọi thẳng hàm duyệt bị từ chối', async () => {
    const { data: inbox } = await ksnb.rpc('my_pending_approvals');
    expect(inbox ?? []).toHaveLength(0);

    const { data: pending } = await ksnb
      .from('approvals')
      .select('id')
      .eq('status', 'pending_approval')
      .limit(1);
    if ((pending ?? []).length > 0) {
      const { error } = await ksnb.rpc('decide_approval', {
        p_approval_id: pending![0]!.id,
        p_decision: 'approved',
      });
      expect(error).toBeTruthy();
    }
  });

  it('Tổng quan điều hành: Kiểm soát nội bộ và lãnh đạo xem được, vai trò khác bị từ chối (0169)', async () => {
    const args = { p_stale_days: 3, p_hr_notice_days: 30 };
    const { data, error } = await ksnb.rpc('exec_overview', args);
    expect(error).toBeNull();
    const keys = (data as { key: string }[]).map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'approvals_stale',
        'payments_stuck',
        'receivables_overdue',
        'payables_overdue',
        'contracts_overdue',
        'sites_late',
        'sites_over_budget',
        'rentals_overdue',
        'hr_documents',
        'survey_waived',
      ]),
    );
    // Không duyệt được nên ô phê duyệt không dẫn tới Hộp thư.
    const approvals = (data as { key: string; link: string | null }[]).find(
      (r) => r.key === 'approvals_stale',
    );
    expect(approvals!.link).toBeNull();

    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: forTgd } = await tgd.rpc('exec_overview', args);
    expect(
      (forTgd as { key: string; link: string | null }[]).find((r) => r.key === 'approvals_stale')!
        .link,
    ).toBe('/viec-can-lam');

    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { error: denied } = await kd.rpc('exec_overview', args);
    expect(denied?.message).toContain('Ban Giám đốc và Kiểm soát nội bộ');
  });
});
