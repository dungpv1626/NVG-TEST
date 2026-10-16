/**
 * Hàng rào luồng (0155–0158) — hồ sơ đi đúng thứ tự, không ai tự duyệt hồ sơ của mình.
 *
 * Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3): Kinh doanh kéo được cơ hội từ «Tiếp nhận» thẳng
 * sang «Ký hợp đồng», và tự duyệt được báo giá của chính mình trong hạn mức 500 triệu. Các phép
 * thử dưới đây chứng minh hai đường đó đã đóng, và đường đúng vẫn mở.
 *
 * Phần hợp đồng (người soạn không tự ký, không tự mở công trình; hợp đồng đã ký đẩy cơ hội sang
 * «Ký hợp đồng») nằm ở `golden-path.test.ts` và nhóm HD của `rls.test.ts` — chạy trên luồng thật.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Readiness {
  for_stage: string;
  requirement: string;
  met: boolean;
  label: string;
  waivable: boolean;
}

describeDb('Luồng cơ hội — đi đúng thứ tự, có điều kiện (0155)', () => {
  let kd: SupabaseClient;
  let companyId: string;
  let customerId: string;

  beforeAll(async () => {
    kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const { data: customer } = await kd.from('customers').select('id').limit(1).single();
    companyId = company!.id as string;
    customerId = customer!.id as string;
  });

  /** Mặc định đã phân loại M2 + loại công trình — điều kiện rời «Xác minh» (0160). */
  async function newOpportunity(
    fields: Record<string, unknown> = {
      classification: 'M2',
      project_type: 'Nhà xưởng công nghiệp',
    },
  ): Promise<string> {
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: code } = await kd.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'CH',
    });
    const { data, error } = await kd
      .from('opportunities')
      .insert({
        code,
        company_id: companyId,
        customer_id: customerId,
        name: `${TEST_PREFIX} Luồng cơ hội ${Date.now()}`,
        owner_id: me,
        estimated_value: 300_000_000,
        ...fields,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  function move(id: string, stage: string, note: string | null = null) {
    return kd.rpc('move_opportunity_stage', {
      p_opportunity_id: id,
      p_to_stage: stage,
      p_note: note,
    });
  }

  async function surveyed(id: string) {
    const { error } = await kd.from('site_surveys').insert({
      opportunity_id: id,
      surveyed_at: new Date().toISOString(),
      needs: 'Khảo sát hiện trạng',
    });
    if (error) throw new Error(error.message);
  }

  async function readiness(id: string, stage: string): Promise<Readiness[]> {
    const { data, error } = await kd.rpc('stage_readiness', {
      p_entity_type: 'opportunity',
      p_id: id,
    });
    if (error) throw new Error(error.message);
    return (data as Readiness[]).filter((r) => r.for_stage === stage);
  }

  it('không nhảy cóc: Tiếp nhận không sang thẳng Báo giá, phải qua Xác minh', async () => {
    const id = await newOpportunity();

    const { error: skip } = await move(id, 'bao_gia');
    expect(skip?.message).toContain('từng giai đoạn');

    const { error } = await move(id, 'xac_minh');
    expect(error).toBeNull();
  });

  it('Báo giá cần đã lập báo giá — CSDL và màn hình đọc CÙNG một điều kiện', async () => {
    const id = await newOpportunity();
    await move(id, 'xac_minh');

    await surveyed(id);

    const pricing = async () =>
      (await readiness(id, 'bao_gia')).find((r) => r.requirement === 'pricing_started')!;
    const before = await pricing();
    expect(before.met).toBe(false);

    const { error: blocked } = await move(id, 'bao_gia');
    expect(blocked?.message).toContain('Cần:');
    expect(blocked?.message).toContain(before.label);

    const { error: quoteError } = await kd
      .from('quotes')
      .insert({ company_id: companyId, opportunity_id: id, total_value: 280_000_000 });
    expect(quoteError).toBeNull();

    expect((await pricing()).met).toBe(true);
    const { error } = await move(id, 'bao_gia');
    expect(error).toBeNull();

    // Báo giá còn nháp, chưa gửi khách → chưa sang Đàm phán được.
    const { error: notSent } = await move(id, 'dam_phan');
    expect(notSent?.message).toContain('Cần:');
  });

  it('lùi bước phải nêu lý do', async () => {
    const id = await newOpportunity();
    await move(id, 'xac_minh');
    await move(id, 'khao_sat');

    const { error: noReason } = await move(id, 'xac_minh');
    expect(noReason?.message).toContain('lý do');

    const { error } = await move(id, 'xac_minh', 'Khách đổi quy mô, cần xác minh lại nhu cầu');
    expect(error).toBeNull();

    const { data: history } = await kd
      .from('opportunity_stage_history')
      .select('to_stage, note')
      .eq('opportunity_id', id)
      .order('changed_at');
    expect(history!.at(-1)).toMatchObject({
      to_stage: 'xac_minh',
      note: 'Khách đổi quy mô, cần xác minh lại nhu cầu',
    });
  });

  it('«Ký hợp đồng» không chuyển tay được — chỉ hợp đồng đã ký đẩy sang', async () => {
    const id = await newOpportunity();
    const { error } = await move(id, 'ky_hop_dong');
    expect(error?.message).toContain('tự chuyển khi hợp đồng');
  });

  it('trình duyệt không gọi được hàm đồng bộ nội bộ để đẩy cơ hội tới bước cuối', async () => {
    const id = await newOpportunity();
    const { error } = await kd.rpc('_sync_opportunity_stage', {
      p_opportunity_id: id,
      p_to_stage: 'ky_hop_dong',
      p_note: 'giả mạo',
    });
    expect(error).toBeTruthy();

    const { data } = await kd.from('opportunities').select('stage').eq('id', id).single();
    expect(data!.stage).toBe('tiep_nhan');
  });
});

describeDb('Việc của từng bước cơ hội — phân loại, khảo sát (0160)', () => {
  let kd: SupabaseClient;
  let companyId: string;
  let customerId: string;

  beforeAll(async () => {
    kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const { data: customer } = await kd.from('customers').select('id').limit(1).single();
    companyId = company!.id as string;
    customerId = customer!.id as string;
  });

  function move(id: string, stage: string) {
    return kd.rpc('move_opportunity_stage', { p_opportunity_id: id, p_to_stage: stage });
  }

  /** Cơ hội mới, đã sang «Xác minh». */
  async function newOpportunity(fields: Record<string, unknown> = {}): Promise<string> {
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: code } = await kd.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'CH',
    });
    const { data, error } = await kd
      .from('opportunities')
      .insert({
        code,
        company_id: companyId,
        customer_id: customerId,
        name: `${TEST_PREFIX} Việc từng bước ${Date.now()}`,
        owner_id: me,
        ...fields,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    const { error: moveError } = await move(id, 'xac_minh');
    if (moveError) throw new Error(moveError.message);
    return id;
  }

  async function addQuote(id: string) {
    const { error } = await kd
      .from('quotes')
      .insert({ company_id: companyId, opportunity_id: id, total_value: 150_000_000 });
    if (error) throw new Error(error.message);
  }

  it('chưa phân loại thì không rời Xác minh; M1 — Lưu trữ đứng lại', async () => {
    const id = await newOpportunity();
    const { error: none } = await move(id, 'khao_sat');
    expect(none?.message).toContain('phân loại');

    // Có phân loại mà thiếu loại công trình vẫn chưa đủ.
    await kd.from('opportunities').update({ classification: 'M2' }).eq('id', id);
    const { error: noType } = await move(id, 'khao_sat');
    expect(noType?.message).toContain('Cần:');

    await kd
      .from('opportunities')
      .update({ classification: 'M1', project_type: 'Nhà phố' })
      .eq('id', id);
    const { error: m1 } = await move(id, 'khao_sat');
    expect(m1?.message).toContain('M1');

    await kd.from('opportunities').update({ classification: 'M2' }).eq('id', id);
    const { error } = await move(id, 'khao_sat');
    expect(error).toBeNull();
  });

  it('chưa khảo sát thì không sang Báo giá — kể cả khi đã đi qua bước Khảo sát', async () => {
    const id = await newOpportunity({ classification: 'M3', project_type: 'Nhà phố' });
    await move(id, 'khao_sat');
    await addQuote(id);

    const { error: blocked } = await move(id, 'bao_gia');
    expect(blocked?.message).toContain('khảo sát');

    // Biên bản chỉ có lịch hẹn, chưa khảo sát thật — vẫn chưa đạt.
    await kd.from('site_surveys').insert({
      opportunity_id: id,
      scheduled_at: new Date().toISOString(),
    });
    const { error: onlyScheduled } = await move(id, 'bao_gia');
    expect(onlyScheduled?.message).toContain('khảo sát');

    await kd.from('site_surveys').insert({
      opportunity_id: id,
      surveyed_at: new Date().toISOString(),
      needs: 'Nhà phố 4 tầng',
    });
    const { error } = await move(id, 'bao_gia');
    expect(error).toBeNull();
  });

  it('bỏ qua khảo sát phải có lý do; lý do lưu trên cơ hội, không sửa thẳng được', async () => {
    const id = await newOpportunity({ classification: 'M3', project_type: 'Nhà phố' });
    await addQuote(id);

    const { error: noReason } = await kd.rpc('waive_opportunity_survey', {
      p_opportunity_id: id,
      p_reason: '  ',
    });
    expect(noReason?.message).toContain('lý do');

    // Trình duyệt không tự ghi cột miễn khảo sát.
    const { error: direct } = await kd
      .from('opportunities')
      .update({ survey_waived_reason: 'tự ghi' })
      .eq('id', id);
    expect(direct?.message).toContain('Không đổi trực tiếp');

    // Người không phụ trách cơ hội không miễn được.
    const other = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { error: notOwner } = await other.rpc('waive_opportunity_survey', {
      p_opportunity_id: id,
      p_reason: 'Không phải hồ sơ của mình',
    });
    expect(notOwner).toBeTruthy();

    const { error: waived } = await kd.rpc('waive_opportunity_survey', {
      p_opportunity_id: id,
      p_reason: 'Khách gửi hồ sơ thiết kế và hiện trạng đầy đủ',
    });
    expect(waived).toBeNull();

    const { error } = await move(id, 'bao_gia');
    expect(error).toBeNull();

    const { data } = await kd
      .from('opportunities')
      .select('survey_waived_reason, survey_waived_at')
      .eq('id', id)
      .single();
    expect(data!.survey_waived_reason).toBe('Khách gửi hồ sơ thiết kế và hiện trạng đầy đủ');
    expect(data!.survey_waived_at).toBeTruthy();
  });
});

describeDb('Không tự phê duyệt hồ sơ của chính mình (0156)', () => {
  it('Kinh doanh gửi báo giá thì không tự duyệt được, dù trong hạn mức của mình', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
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
        name: `${TEST_PREFIX} Tự duyệt ${Date.now()}`,
        owner_id: me,
        estimated_value: 100_000_000,
      })
      .select('id')
      .single();
    const { data: quote } = await kd
      .from('quotes')
      .insert({ company_id: company!.id, opportunity_id: opp!.id, total_value: 100_000_000 })
      .select('id')
      .single();

    const { error: submitError } = await kd.rpc('request_quote_approval', {
      p_quote_id: quote!.id,
    });
    expect(submitError).toBeNull();

    const { data: approval } = await kd
      .from('approvals')
      .select('id')
      .eq('entity_type', 'quotes')
      .eq('entity_id', quote!.id)
      .eq('status', 'pending_approval')
      .single();

    // Hồ sơ của mình không nằm trong hộp thư của mình.
    const { data: inbox } = await kd.rpc('my_pending_approvals');
    expect((inbox ?? []).some((r: { id: string }) => r.id === approval!.id)).toBe(false);

    const { error: self } = await kd.rpc('decide_approval', {
      p_approval_id: approval!.id,
      p_decision: 'approved',
    });
    expect(self?.message).toContain('chính mình');

    // Người khác có hạn mức thì duyệt bình thường.
    const { error } = await tgd.rpc('decide_approval', {
      p_approval_id: approval!.id,
      p_decision: 'approved',
      p_note: 'Đồng ý giá.',
    });
    expect(error).toBeNull();
  });
});
