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
import {
  attachContractDocument,
  ACCOUNTS,
  hasCredentials,
  signInAs,
  TEST_PREFIX,
  markSurveyReportApproved,
} from './helpers';

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
    // Từ 0175: sang Báo giá cần báo cáo khảo sát được Ban Giám đốc duyệt.
    await markSurveyReportApproved(id);
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

  it('Báo giá cần khảo sát; báo giá được lập TRONG bước Báo giá, Đàm phán mới cần báo giá đã gửi', async () => {
    const id = await newOpportunity();
    await move(id, 'xac_minh');

    const survey = async () =>
      (await readiness(id, 'bao_gia')).find((r) => r.requirement === 'survey_done')!;
    const before = await survey();
    expect(before.met).toBe(false);

    const { error: blocked } = await move(id, 'bao_gia');
    expect(blocked?.message).toContain('Cần:');
    expect(blocked?.message).toContain(before.label);

    // Khảo sát xong là đủ — chưa cần có báo giá (0161: đòi báo giá để VÀO bước Báo giá là ngược).
    await surveyed(id);
    expect((await survey()).met).toBe(true);
    const { error } = await move(id, 'bao_gia');
    expect(error).toBeNull();

    // Báo giá còn nháp, chưa gửi khách → chưa sang Đàm phán được.
    const { error: quoteError } = await kd
      .from('quotes')
      .insert({ company_id: companyId, opportunity_id: id, total_value: 280_000_000 });
    expect(quoteError).toBeNull();
    const { error: notSent } = await move(id, 'dam_phan');
    expect(notSent?.message).toContain('Cần:');
  });

  it('không ghi được «đã khảo sát» vào một ngày chưa tới (0161)', async () => {
    const id = await newOpportunity();
    const future = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const { error } = await kd
      .from('site_surveys')
      .insert({ opportunity_id: id, surveyed_at: future, needs: 'Ghi trước' });
    expect(error?.message).toContain('tương lai');

    // Lịch hẹn ở tương lai thì vẫn bình thường.
    const { error: scheduled } = await kd
      .from('site_surveys')
      .insert({ opportunity_id: id, scheduled_at: future });
    expect(scheduled).toBeNull();
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
    // 0184: chưa sang Báo giá thì không lập được báo giá — kể cả lập trước cho «đủ điều kiện».
    const { error: early } = await kd
      .from('quotes')
      .insert({ company_id: companyId, opportunity_id: id, total_value: 150_000_000 });
    expect(early?.message).toContain('chưa sang bước Báo giá');

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
    // Đã khảo sát nhưng báo cáo chưa được Ban Giám đốc duyệt — vẫn chưa sang Báo giá (0175).
    const { error: notApproved } = await move(id, 'bao_gia');
    expect(notApproved?.message).toContain('Ban Giám đốc');
    await markSurveyReportApproved(id);
    const { error } = await move(id, 'bao_gia');
    expect(error).toBeNull();
    // Sang Báo giá rồi thì lập được.
    await addQuote(id);
  });

  it('bỏ qua khảo sát phải có lý do; lý do lưu trên cơ hội, không sửa thẳng được', async () => {
    const id = await newOpportunity({ classification: 'M3', project_type: 'Nhà phố' });

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

describeDb('Báo giá → Đàm phán: biết chờ ai, giá tới tay khách thì tự sang Đàm phán (0162)', () => {
  it('gửi duyệt → biết đang chờ ai → duyệt thì báo người phụ trách → gửi khách thì sang Đàm phán', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const { data: customer } = await kd.from('customers').select('id').limit(1).single();
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: myself } = await kd.from('users').select('full_name').eq('id', me).single();
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
        name: `${TEST_PREFIX} Báo giá sang Đàm phán ${Date.now()}`,
        owner_id: me,
        classification: 'M3',
        project_type: 'Nhà phố',
      })
      .select('id')
      .single();
    const id = opp!.id as string;
    const move = (stage: string) =>
      kd.rpc('move_opportunity_stage', { p_opportunity_id: id, p_to_stage: stage });
    await move('xac_minh');
    await kd.from('site_surveys').insert({
      opportunity_id: id,
      surveyed_at: new Date().toISOString(),
      needs: 'Nhà phố 4 tầng',
    });
    await markSurveyReportApproved(id);
    expect((await move('bao_gia')).error).toBeNull();

    const { data: quote } = await kd
      .from('quotes')
      .insert({ company_id: company!.id, opportunity_id: id, total_value: 120_000_000 })
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

    // Người gửi thấy hồ sơ đang chờ ai — và không có chính mình trong đó.
    const { data: waiting, error: waitingError } = await kd.rpc('approval_waiting_on', {
      p_approval_id: approval!.id,
    });
    expect(waitingError).toBeNull();
    const w = (waiting as { role_labels: string[]; user_names: string[] }[])[0]!;
    expect(w.user_names.length).toBeGreaterThan(0);
    expect(w.user_names).not.toContain(myself!.full_name);

    // «Thúc» (0165): chỉ người gửi; người giữ nhận thông báo; không thúc liên tiếp được.
    const { error: notMine } = await tgd.rpc('nudge_approval', { p_approval_id: approval!.id });
    expect(notMine?.message).toContain('người gửi');
    const { error: nudged } = await kd.rpc('nudge_approval', { p_approval_id: approval!.id });
    expect(nudged).toBeNull();
    const { error: again } = await kd.rpc('nudge_approval', { p_approval_id: approval!.id });
    expect(again?.message).toContain('thúc lại');
    const { data: nudgeNotes } = await tgd
      .from('notifications')
      .select('id')
      .eq('related_entity_id', approval!.id)
      .eq('type', 'approval_nudge');
    expect(nudgeNotes!.length).toBe(1);
    const { data: reminders } = await kd
      .from('approval_reminders')
      .select('id')
      .eq('approval_id', approval!.id);
    expect(reminders).toHaveLength(1);

    const { error: decided } = await tgd.rpc('decide_approval', {
      p_approval_id: approval!.id,
      p_decision: 'approved',
    });
    expect(decided).toBeNull();

    // Người phụ trách được báo để gửi khách.
    const { data: notes } = await kd
      .from('notifications')
      .select('type, action_url')
      .eq('related_entity_id', id)
      .eq('type', 'quote_approved');
    expect(notes!.length).toBe(1);
    expect(notes![0]!.action_url).toContain('tab=bao-gia');

    // Gửi khách → cơ hội tự sang Đàm phán, lịch sử ghi vì sao.
    expect((await kd.rpc('send_quote_to_customer', { p_quote_id: quote!.id })).error).toBeNull();
    const { data: after } = await kd.from('opportunities').select('stage').eq('id', id).single();
    expect(after!.stage).toBe('dam_phan');
    const { data: history } = await kd
      .from('opportunity_stage_history')
      .select('to_stage, note')
      .eq('opportunity_id', id)
      .order('changed_at');
    expect(history!.at(-1)!.to_stage).toBe('dam_phan');
    expect(history!.at(-1)!.note).toContain('đã gửi khách');
  });

  it('lập phiên bản mới thì phê duyệt đang chờ của bản cũ đóng lại, rời Hộp thư người duyệt', async () => {
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
        name: `${TEST_PREFIX} Phiên bản thay thế ${Date.now()}`,
        owner_id: me,
        // 0184: chỉ lập báo giá ở bước Báo giá / Đàm phán.
        stage: 'bao_gia',
      })
      .select('id')
      .single();
    const newQuote = async (value: number) =>
      (
        await kd
          .from('quotes')
          .insert({ company_id: company!.id, opportunity_id: opp!.id, total_value: value })
          .select('id')
          .single()
      ).data!.id as string;

    const v1 = await newQuote(700_000_000);
    expect((await kd.rpc('request_quote_approval', { p_quote_id: v1 })).error).toBeNull();
    const { data: a1 } = await kd
      .from('approvals')
      .select('id')
      .eq('entity_type', 'quotes')
      .eq('entity_id', v1)
      .single();

    await newQuote(650_000_000);

    const { data: closed } = await kd
      .from('approvals')
      .select('status, final_decision')
      .eq('id', a1!.id)
      .single();
    expect(closed).toMatchObject({ status: 'completed', final_decision: 'rejected' });
    const { data: old } = await kd.from('quotes').select('status').eq('id', v1).single();
    expect(old!.status).toBe('draft');

    const { data: inbox } = await tgd.rpc('my_pending_approvals');
    expect((inbox ?? []).some((r: { id: string }) => r.id === a1!.id)).toBe(false);

    // Không báo «bị từ chối» cho một bản chẳng ai từ chối.
    const { data: notes } = await kd
      .from('notifications')
      .select('id')
      .eq('related_entity_id', opp!.id)
      .eq('type', 'quote_rejected');
    expect(notes).toHaveLength(0);
  });
});

describeDb(
  'Đàm phán → Hợp đồng → Công trình: biết còn thiếu gì, ai giữ, ai được báo (0163, 0164)',
  () => {
    it('điều kiện gửi phê duyệt khớp hàm chặn; duyệt xong báo người chịu trách nhiệm', async () => {
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
          name: `${TEST_PREFIX} Hợp đồng còn thiếu gì ${Date.now()}`,
          owner_id: me,
          classification: 'M4',
          project_type: 'Nhà xưởng công nghiệp',
        })
        .select('id')
        .single();
      const oppId = opp!.id as string;
      await kd.rpc('move_opportunity_stage', { p_opportunity_id: oppId, p_to_stage: 'xac_minh' });
      await kd.from('site_surveys').insert({
        opportunity_id: oppId,
        surveyed_at: new Date().toISOString(),
        needs: 'Nhà xưởng 1.200 m²',
      });
      await markSurveyReportApproved(oppId);
      await kd.rpc('move_opportunity_stage', { p_opportunity_id: oppId, p_to_stage: 'bao_gia' });
      const { data: quote } = await kd
        .from('quotes')
        .insert({ company_id: company!.id, opportunity_id: oppId, total_value: 1_200_000_000 })
        .select('id')
        .single();
      await kd.rpc('request_quote_approval', { p_quote_id: quote!.id });
      const { data: qa } = await kd
        .from('approvals')
        .select('id')
        .eq('entity_type', 'quotes')
        .eq('entity_id', quote!.id)
        .single();
      expect(
        (await tgd.rpc('decide_approval', { p_approval_id: qa!.id, p_decision: 'approved' })).error,
      ).toBeNull();
      expect((await kd.rpc('send_quote_to_customer', { p_quote_id: quote!.id })).error).toBeNull();

      const { data: contractId, error: draftError } = await kd.rpc('create_contract_from_source', {
        p_source_type: 'opportunities',
        p_source_id: oppId,
        p_type: 'thi_cong',
        p_title: null,
      });
      expect(draftError).toBeNull();

      const readiness = async () => {
        const { data } = await kd.rpc('stage_readiness', {
          p_entity_type: 'contract',
          p_id: contractId,
        });
        return (
          data as { for_stage: string; requirement: string; met: boolean; label: string }[]
        ).filter((r) => r.for_stage === 'cho_duyet');
      };
      const before = await readiness();
      const terms = before.find((r) => r.requirement === 'terms_complete')!;
      expect(terms.met).toBe(false);
      expect(terms.label).toContain('phạm vi công việc');

      // Màn hình nói «chưa đủ» thì CSDL cũng chặn — cùng một điều kiện.
      const { error: blocked } = await kd.rpc('submit_contract_approval', {
        p_contract_id: contractId,
      });
      expect(blocked?.message).toContain('điều khoản');

      expect(terms.label).not.toContain('giá trị');
      // Giá trị hợp đồng chỉ là `contracts.value` (0234) — không cần dòng điều khoản «giá trị».
      for (const t of ['pham_vi', 'tien_do_thanh_toan']) {
        const { error } = await kd.from('contract_terms').insert({
          contract_id: contractId,
          company_id: company!.id,
          term_type: t,
          description: `Điều khoản ${t}`,
        });
        expect(error).toBeNull();
      }
      // Pháp nhân có mẫu Word (bộ mẫu 0185) thì gửi duyệt phải kèm văn bản đã lập (0176).
      await attachContractDocument(kd, contractId as string, company!.id as string);
      expect((await readiness()).every((r) => r.met)).toBe(true);
      expect(
        (await kd.rpc('submit_contract_approval', { p_contract_id: contractId })).error,
      ).toBeNull();

      const { data: ca } = await kd
        .from('approvals')
        .select('id')
        .eq('entity_type', 'contracts')
        .eq('entity_id', contractId)
        .eq('status', 'pending_approval')
        .single();
      const { data: waiting } = await kd.rpc('approval_waiting_on', { p_approval_id: ca!.id });
      expect((waiting as { user_names: string[] }[])[0]!.user_names.length).toBeGreaterThan(0);

      expect(
        (await tgd.rpc('decide_approval', { p_approval_id: ca!.id, p_decision: 'approved' })).error,
      ).toBeNull();
      const { data: notes } = await kd
        .from('notifications')
        .select('type')
        .eq('related_entity_id', contractId)
        .eq('type', 'contract_approved');
      expect(notes).toHaveLength(1);

      // --- Ký → mở công trình (0164) --------------------------------------------------------
      expect(
        (
          await tgd.rpc('sign_contract', {
            p_contract_id: contractId,
            p_contract_number: `${Date.now()}/HĐ-THU`,
            p_signed_date: '2026-10-16',
          })
        ).error,
      ).toBeNull();
      // 0187: hợp đồng thi công từ cơ hội ký xong thì công trình TỰ mở ở bước Chuẩn bị — không
      // còn ai phải nhớ bấm «Mở công trình»; mở thêm lần nữa bị chặn (một hợp đồng một công trình).
      const { data: autoSite } = await tgd
        .from('construction_sites')
        .select('id, stage')
        .eq('contract_id', contractId)
        .single();
      expect(autoSite!.stage).toBe('chuan_bi');
      const siteId = autoSite!.id as string;
      const { error: openAgain } = await tgd.rpc('open_site_from_contract', {
        p_contract_id: contractId,
      });
      expect(openAgain?.message).toContain('đã có công trình');

      // Không tự lấy người Kinh doanh phụ trách hợp đồng làm chỉ huy công trình.
      const thiCong = await signInAs(ACCOUNTS.congTruongNvc);
      const { data: site } = await thiCong
        .from('construction_sites')
        .select('responsible_user_id')
        .eq('id', siteId)
        .single();
      expect(site!.responsible_user_id).toBeNull();

      const { error: notReady } = await thiCong.rpc('move_site_stage', {
        p_site_id: siteId,
        p_stage: 'dang_thi_cong',
      });
      expect(notReady?.message).toContain('chỉ huy trưởng');

      // Gán người Kinh doanh vẫn không tính là đã có chỉ huy trưởng; ô chọn cũng không có họ.
      await thiCong
        .from('construction_sites')
        .update({
          responsible_user_id: me,
          planned_start_date: '2026-10-20',
          planned_end_date: '2027-04-30',
        })
        .eq('id', siteId);
      const { data: candidates } = await thiCong.rpc('site_commander_candidates', {
        p_company_id: company!.id,
      });
      const ids = (candidates as { id: string }[]).map((c) => c.id);
      expect(ids).not.toContain(me);
      expect(
        (await thiCong.rpc('move_site_stage', { p_site_id: siteId, p_stage: 'dang_thi_cong' }))
          .error?.message,
      ).toContain('chỉ huy trưởng');

      await thiCong
        .from('construction_sites')
        .update({ responsible_user_id: ids[0] })
        .eq('id', siteId);
      expect(
        (await thiCong.rpc('move_site_stage', { p_site_id: siteId, p_stage: 'dang_thi_cong' }))
          .error,
      ).toBeNull();
    });
  },
);

describeDb('Không tự phê duyệt hồ sơ của chính mình (0156)', () => {
  it('Kinh doanh gửi báo giá thì không tự duyệt được (từ 29/10/2026 Kinh doanh không còn hạn mức duyệt báo giá)', async () => {
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
        // 0184: chỉ lập báo giá ở bước Báo giá / Đàm phán.
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
    // Báo giá do Ban Giám đốc / Tổng Giám đốc duyệt (anh Dũng 29/10/2026) — Kinh doanh bị chặn vì
    // không có hạn mức; chặn tự duyệt (0156) vẫn còn và phủ các loại phê duyệt khác trong tệp này.
    expect(self).not.toBeNull();

    // Người khác có hạn mức thì duyệt bình thường.
    const { error } = await tgd.rpc('decide_approval', {
      p_approval_id: approval!.id,
      p_decision: 'approved',
      p_note: 'Đồng ý giá.',
    });
    expect(error).toBeNull();
  });

  it('hồ sơ do Tổng Giám đốc gửi: tự duyệt được và có trong hộp thư của mình (0218)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const { data: customer } = await kd.from('customers').select('id').limit(1).single();
    const { data: kdId } = await kd.rpc('auth_user_id');
    const { data: me } = await tgd.rpc('auth_user_id');
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
        name: `${TEST_PREFIX} TGĐ tự duyệt ${Date.now()}`,
        owner_id: kdId,
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

    // Tổng Giám đốc không lập báo giá CRM; quy tắc cần thử là «người gửi = người duyệt», nên đặt
    // người gửi là Tổng Giám đốc thẳng trong CSDL.
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await sql`UPDATE approvals SET requested_by = ${me as string} WHERE id = ${approval!.id}`;
    } finally {
      await sql.end();
    }

    const { data: inbox } = await tgd.rpc('my_pending_approvals');
    expect(
      (inbox ?? []).some((r: { id: string }) => r.id === approval!.id),
      'hồ sơ Tổng Giám đốc tự gửi phải nằm trong hộp thư của chính Tổng Giám đốc',
    ).toBe(true);

    const { data: waiting } = await tgd.rpc('approval_waiting_on', {
      p_approval_id: approval!.id,
    });
    const ids = (waiting as Array<{ user_ids: string[] }> | null)?.[0]?.user_ids ?? [];
    expect(ids, '«Đang chờ» phải kể cả chính Tổng Giám đốc').toContain(me);

    const { error } = await tgd.rpc('decide_approval', {
      p_approval_id: approval!.id,
      p_decision: 'approved',
      p_note: 'Tự duyệt.',
    });
    expect(error).toBeNull();
  });
});
