/**
 * Hai luồng nghiệp vụ trọng yếu của Giai đoạn 1 — chạy TRỌN, trên cơ sở dữ liệu thật.
 *
 * PRD Mục 7 định nghĩa nghiệm thu Giai đoạn 1 KHÔNG bằng số tính năng đã lập trình xong, mà
 * bằng việc "một cơ hội chạy trọn CRM → DA/TK → HD trên dữ liệu thật, có lịch sử phiên bản
 * dự toán và người phê duyệt truy vết được". Bộ test RLS chứng minh từng hàng rào đứng vững;
 * hai bài dưới đây chứng minh CÁC HÀNG RÀO ĐÓ GHÉP LẠI VẪN ĐI QUA ĐƯỢC — hai chuyện khác nhau,
 * và chuyện thứ hai chỉ lộ ra khi đi hết một lượt.
 *
 * Mỗi bước gọi ĐÚNG hàm mà giao diện gọi, đăng nhập bằng ĐÚNG vai trò làm việc đó ngoài đời.
 * Không dùng `service_role`: một luồng chỉ chạy được khi vượt RLS thì nó không chạy được thật.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

async function companyId(client: SupabaseClient, code: string): Promise<string> {
  const { data } = await client.from('companies').select('id').eq('code', code).single();
  return (data as { id: string }).id;
}

async function anyCustomer(client: SupabaseClient): Promise<string> {
  const { data } = await client.from('customers').select('id').limit(1).maybeSingle();
  if (!data) throw new Error('Cần ít nhất một khách hàng trong dữ liệu mẫu.');
  return (data as { id: string }).id;
}

async function nextCode(
  client: SupabaseClient,
  company: string,
  recordType: string,
): Promise<string> {
  const { data } = await client.rpc('next_record_code', {
    p_company_code: company,
    p_record_type: recordType,
  });
  return data as string;
}

async function currentUser(client: SupabaseClient): Promise<string> {
  const { data } = await client.rpc('auth_user_id');
  return data as string;
}

/** Ném lỗi kèm tên bước — đọc log là biết luồng đứt ở đâu, không phải dò từng dòng. */
function check(step: string, error: { message: string } | null): void {
  if (error) throw new Error(`${step}: ${error.message}`);
}

describeDb('Golden Path 1 — NVC: Cơ hội → Gói thầu → Dự toán → Hợp đồng → Công trình → Mua hàng → Kho', () => {
  it('chạy trọn luồng và truy ngược được từ hợp đồng về tận cơ hội gốc', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const dauThau = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);

    const nvc = await companyId(kinhDoanh, 'NVC');
    const customer = await anyCustomer(kinhDoanh);
    const stamp = Date.now();

    // --- Bước 1. Kinh doanh tiếp nhận cơ hội (CRM-02) -----------------------------------
    const { data: opportunity, error: oppError } = await kinhDoanh
      .from('opportunities')
      .insert({
        code: await nextCode(kinhDoanh, 'NVC', 'CH'),
        company_id: nvc,
        customer_id: customer,
        name: `${TEST_PREFIX} GP1 Nhà xưởng Long An ${stamp}`,
        owner_id: await currentUser(kinhDoanh),
        estimated_value: 4_500_000_000,
      })
      .select('id')
      .single();
    check('tạo cơ hội', oppError);
    const opportunityId = (opportunity as { id: string }).id;

    // Đi qua phễu bán hàng đúng thứ tự PRD CRM-02 thay vì nhảy thẳng — mỗi bước ghi một dòng
    // lịch sử, và chính chuỗi đó là căn cứ tính tỷ lệ chuyển đổi ở BC-03.
    for (const stage of ['xac_minh', 'khao_sat', 'bao_gia', 'dam_phan']) {
      const { error } = await kinhDoanh.rpc('move_opportunity_stage', {
        p_opportunity_id: opportunityId,
        p_to_stage: stage,
        p_note: null,
      });
      check(`chuyển cơ hội sang ${stage}`, error);
    }

    // --- Bước 2. Đấu thầu lập gói thầu, LIÊN KẾT về cơ hội (DA-01) ----------------------
    const { data: project, error: projectError } = await dauThau
      .from('bidding_projects')
      .insert({
        code: await nextCode(dauThau, 'NVC', 'DA'),
        company_id: nvc,
        opportunity_id: opportunityId,
        customer_id: customer,
        name: `${TEST_PREFIX} GP1 Gói thầu nhà xưởng ${stamp}`,
        responsible_user_id: await currentUser(dauThau),
        estimated_value: 4_500_000_000,
      })
      .select('id')
      .single();
    check('tạo gói thầu', projectError);
    const projectId = (project as { id: string }).id;

    // --- Bước 3. Bóc khối lượng (DA-04) ------------------------------------------------
    const { error: boqError } = await dauThau.from('boq_items').insert([
      {
        company_id: nvc,
        bidding_project_id: projectId,
        position: 1,
        name: 'Bê tông móng M300',
        unit: 'm3',
        quantity: 120,
      },
      {
        company_id: nvc,
        bidding_project_id: projectId,
        position: 2,
        name: 'Kèo thép mái',
        unit: 'tấn',
        quantity: 45,
      },
    ]);
    check('bóc khối lượng', boqError);

    // --- Bước 4. Lập dự toán và giá dự thầu (DA-06, DA-07) ------------------------------
    const { data: estimate, error: estimateError } = await dauThau
      .from('estimates')
      .insert({
        code: await nextCode(dauThau, 'NVC', 'DT'),
        company_id: nvc,
        bidding_project_id: projectId,
        bid_price: 4_200_000_000,
        basis_notes: `${TEST_PREFIX} đơn giá tháng 8/2026`,
        prepared_by: await currentUser(dauThau),
      })
      .select('id, version')
      .single();
    check('lập dự toán', estimateError);
    const estimateId = (estimate as { id: string; version: number }).id;
    expect((estimate as { version: number }).version).toBe(1);

    check(
      'ghi dòng dự toán',
      (
        await dauThau.rpc('save_estimate_items', {
          p_estimate_id: estimateId,
          p_items: [
            { cost_group: 'vat_tu', description: 'Bê tông', unit: 'm3', quantity: 120, unit_price: 1_400_000 },
            { cost_group: 'nhan_cong', description: 'Nhân công', unit: 'công', quantity: 900, unit_price: 400_000 },
          ],
        })
      ).error,
    );
    check(
      'ghi cơ cấu giá',
      (
        await dauThau.rpc('save_estimate_costs', {
          p_estimate_id: estimateId,
          p_direct_cost: 3_000_000_000,
          p_overhead_cost: 400_000_000,
          p_contingency_cost: 200_000_000,
          p_finance_cost: 0,
          p_tax_amount: 0,
          p_profit_amount: 600_000_000,
          p_profit_margin_percent: 14,
        })
      ).error,
    );

    // --- Bước 5. Duyệt giá theo hạn mức (DA-07, NEN-02) ---------------------------------
    const { data: approvalId, error: requestError } = await dauThau.rpc(
      'request_estimate_approval',
      { p_estimate_id: estimateId },
    );
    check('gửi duyệt giá', requestError);

    // 4,2 tỷ vượt hạn mức của người lập giá — phải là người khác duyệt, đúng tinh thần
    // PRD 2.3 (tách người thực hiện và người phê duyệt).
    const { error: selfApprove } = await dauThau.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: null,
    });
    expect(selfApprove, 'người lập giá tự duyệt được thì hạn mức vô nghĩa').toBeTruthy();

    check(
      'Tổng Giám đốc duyệt giá',
      (
        await tgd.rpc('decide_approval', {
          p_approval_id: approvalId,
          p_decision: 'approved',
          p_note: 'Giá phù hợp mặt bằng thị trường.',
        })
      ).error,
    );

    // --- Bước 6. Nộp thầu và ghi kết quả trúng thầu (DA-08) -----------------------------
    check(
      'thêm hồ sơ dự thầu',
      (
        await dauThau.from('bid_documents').insert({
          company_id: nvc,
          bidding_project_id: projectId,
          category: 'bang_gia',
          name: 'Bảng giá dự thầu',
          is_required: false,
        })
      ).error,
    );
    check('nộp thầu', (await dauThau.rpc('submit_bid', { p_bidding_project_id: projectId })).error);
    check(
      'ghi kết quả trúng thầu',
      (
        await dauThau.rpc('record_bid_result', {
          p_bidding_project_id: projectId,
          p_won: true,
        })
      ).error,
    );

    // --- Bước 7. Soạn hợp đồng TỪ gói thầu, không nhập lại (HD-01) ----------------------
    const { data: contractId, error: contractError } = await dauThau.rpc(
      'create_contract_from_source',
      {
        p_source_type: 'bidding_projects',
        p_source_id: projectId,
        p_type: 'thi_cong',
        p_title: `${TEST_PREFIX} GP1 Hợp đồng thi công nhà xưởng`,
      },
    );
    check('soạn hợp đồng', contractError);

    // Giá trị và khách hàng phải TỰ ĐIỀN từ bản dự toán đã duyệt — đây là điều PRD Mục 2.3
    // gọi là "một nguồn dữ liệu duy nhất", và là thứ dễ mất nhất khi nối module.
    const { data: drafted } = await dauThau
      .from('contracts')
      .select('value, customer_id, estimate_id, stage')
      .eq('id', contractId)
      .single();
    expect(Number(drafted!.value)).toBe(4_200_000_000);
    expect(drafted!.customer_id).toBe(customer);
    expect(drafted!.estimate_id).toBe(estimateId);
    expect(drafted!.stage).toBe('nhap');

    // --- Bước 8. Trình ký, duyệt, ghi nhận đã ký (HD-02, HD-05) -------------------------
    for (const termType of ['pham_vi', 'gia_tri', 'tien_do_thanh_toan']) {
      check(
        `thêm điều khoản ${termType}`,
        (
          await dauThau.from('contract_terms').insert({
            company_id: nvc,
            contract_id: contractId,
            term_type: termType,
            description: `${TEST_PREFIX} điều khoản ${termType}`,
          })
        ).error,
      );
    }
    check(
      'đặt ngày bắt đầu hợp đồng',
      (await dauThau.from('contracts').update({ start_date: '2026-09-15' }).eq('id', contractId))
        .error,
    );

    const { data: contractApprovalId, error: submitError } = await dauThau.rpc(
      'submit_contract_approval',
      { p_contract_id: contractId },
    );
    check('trình ký hợp đồng', submitError);
    check(
      'phê duyệt hợp đồng',
      (
        await tgd.rpc('decide_approval', {
          p_approval_id: contractApprovalId,
          p_decision: 'approved',
          p_note: 'Đồng ý ký.',
        })
      ).error,
    );
    check(
      'ghi nhận đã ký',
      (
        await dauThau.rpc('sign_contract', {
          p_contract_id: contractId,
          p_contract_number: `HĐ-GP1-${stamp}`,
          p_signed_date: '2026-09-20',
        })
      ).error,
    );

    // --- Bước 9. Ngân sách thi công sinh từ dự toán đã duyệt (DA-09) --------------------
    const { data: budgetRows, error: budgetError } = await dauThau.rpc('generate_project_budget', {
      p_bidding_project_id: projectId,
    });
    check('lập ngân sách thi công', budgetError);
    expect(budgetRows).toBeGreaterThan(0);

    // --- Bước 10. Mở công trình từ hợp đồng đã ký (TC-01) -------------------------------
    // Đây là mắt xích nối Giai đoạn 1 sang Giai đoạn 2: từ đây trở đi mọi chi phí thực tế
    // đều gắn vào mã công trình, không hạch toán lại thủ công (KT-05).
    const { data: siteId, error: siteError } = await dauThau.rpc('open_site_from_contract', {
      p_contract_id: contractId,
      p_site_address: 'KCN Long Hậu, Long An',
    });
    check('mở công trình', siteError);
    expect(siteId).toBeTruthy();

    // Ngân sách đã duyệt đi theo công trình, không phải lập lại một bảng Excel ở công trường
    // (vướng mắc khảo sát #7 — "số liệu giữa các bộ phận không khớp nhau").
    const { data: budgetLines } = await tgd
      .from('project_budgets')
      .select('id, construction_site_id, cost_code, cost_group')
      .eq('bidding_project_id', projectId);
    expect(budgetLines!.length).toBeGreaterThan(0);
    expect(
      budgetLines!.every((b) => b.construction_site_id === siteId),
      'còn dòng ngân sách chưa gắn vào công trình thì TC-05 so thiếu chi phí',
    ).toBe(true);

    // --- Bước 11. Ban công trường nhận việc (TC-02) -------------------------------------
    const chiHuy = await signInAs(ACCOUNTS.congTruongNvc);

    const { error: logError } = await chiHuy.from('site_logs').insert({
      company_id: nvc,
      construction_site_id: siteId as string,
      log_date: new Date().toISOString().slice(0, 10),
      log_type: 'tien_do',
      content: `${TEST_PREFIX} Nhận mặt bằng, dựng lán trại, tập kết thép hình.`,
      workforce_count: 18,
      logged_by: await currentUser(chiHuy),
    });
    check('ghi nhật ký công trường', logError);

    // TC-05: chỉ huy trưởng theo được ngân sách của công trình mình — nhưng KHÔNG thấy dòng
    // lợi nhuận mục tiêu. Đó là ranh giới Mẫu D, và nó phải đứng vững cả ở đường vòng này.
    const { data: budgetStatus, error: statusError } = await chiHuy.rpc(
      'construction_budget_status',
      { p_site_id: siteId as string },
    );
    check('xem ngân sách công trình', statusError);
    expect((budgetStatus as { cost_group: string }[]).length).toBeGreaterThan(0);
    expect(
      (budgetStatus as { cost_group: string }[]).some((r) => r.cost_group === 'loi_nhuan'),
      'chỉ huy trưởng không được thấy lợi nhuận mục tiêu của công trình',
    ).toBe(false);

    const { data: bossView } = await tgd.rpc('construction_budget_status', {
      p_site_id: siteId as string,
    });
    expect(
      (bossView as { cost_group: string }[]).some((r) => r.cost_group === 'loi_nhuan'),
    ).toBe(true);

    // --- Bước 12. Nghiệm thu đợt 1 với chủ đầu tư (TC-04) -------------------------------
    const { error: stageError } = await chiHuy.rpc('move_site_stage', {
      p_site_id: siteId as string,
      p_stage: 'dang_thi_cong',
    });
    check('chuyển công trình sang Đang thi công', stageError);

    const { data: acceptanceId, error: acceptanceError } = await chiHuy.rpc('record_acceptance', {
      p_site_id: siteId as string,
      p_acceptance_type: 'khach_hang',
      p_stage_name: 'Đợt 1 — phần móng',
      p_value: 1_200_000_000,
      p_counterpart_signed_by: 'Đại diện chủ đầu tư',
    });
    check('lập biên bản nghiệm thu', acceptanceError);

    // Biên bản nghiệm thu chủ đầu tư là căn cứ thu tiền — Kế toán phải BIẾT mà không cần ai
    // nhắn Zalo (TC-04, PRD Mục 7 tiêu chí 4).
    const ketoan = await signInAs(ACCOUNTS.ketoan);
    const { data: billingNotice } = await ketoan
      .from('notifications')
      .select('id, related_entity_id')
      .eq('type', 'acceptance_billing')
      .eq('related_entity_id', acceptanceId as string);
    expect(billingNotice!.length).toBe(1);

    // --- Bước 13. Công trường đề nghị mua vật tư → giao nhận (MH-01 → MH-07) ------------
    // Đây là nửa còn lại của tiêu chí Giai đoạn 2: chi phí thực tế của công trình phải tự
    // chảy về từ chứng từ mua hàng, không ai gõ lại vào một bảng riêng (PRD Mục 7, KT-05).
    const vatTuLine = budgetLines!.find((b) => b.cost_group === 'vat_tu')!;
    const budgetBefore = budgetLines!.find((b) => b.id === vatTuLine.id)!;
    expect(budgetBefore).toBeTruthy();

    const { data: requestRow, error: prCreateError } = await chiHuy
      .from('purchase_requests')
      .insert({
        company_id: nvc,
        title: `${TEST_PREFIX} Thép hình cho phần khung ${stamp}`,
        construction_site_id: siteId as string,
        cost_code: vatTuLine.cost_code,
        needed_date: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
        delivery_location: 'KCN Long Hậu, Long An',
      })
      .select('id, requested_by')
      .single();
    check('công trường gửi đề nghị mua', prCreateError);
    const purchaseRequestId = (requestRow as { id: string }).id;

    const { error: prItemError } = await chiHuy.from('purchase_request_items').insert({
      purchase_request_id: purchaseRequestId,
      position: 1,
      item_code: 'THEP-H200',
      name: 'Thép hình H200',
      unit: 'kg',
      quantity: 5000,
      estimated_unit_price: 21_000,
    });
    check('thêm dòng đề nghị mua', prItemError);

    const { data: prApprovalId, error: prSubmitError } = await chiHuy.rpc(
      'submit_purchase_request_approval',
      { p_request_id: purchaseRequestId },
    );
    check('gửi phê duyệt đề nghị mua', prSubmitError);

    const { error: prDecideError } = await tgd.rpc('decide_approval', {
      p_approval_id: prApprovalId as string,
      p_decision: 'approved',
      p_note: 'Đồng ý mua theo tiến độ dựng khung.',
    });
    check('phê duyệt đề nghị mua', prDecideError);

    const muaHang = await signInAs(ACCOUNTS.muaHang);

    // Hai nhà cung cấp, và nhà cung cấp được chọn KHÔNG phải nhà rẻ nhất — đúng tình huống
    // MH-04 mô tả. Điều bắt buộc là nêu được căn cứ.
    const supplierIds: string[] = [];
    for (const [index, supplier] of [
      { name: 'Thép Nam Việt', unitPrice: 20_500 },
      { name: 'Thép Đại Phát', unitPrice: 21_500, deliveryDays: 3 },
    ].entries()) {
      const { data: supplierRow, error: supplierError } = await muaHang
        .from('suppliers')
        .insert({
          code: `NCC-GP1-${stamp}-${index}`,
          name: `${TEST_PREFIX} ${supplier.name} ${stamp}`,
          category: 'Thép xây dựng',
          supplier_class: 'chinh',
        })
        .select('id')
        .single();
      check('lập nhà cung cấp', supplierError);
      supplierIds.push((supplierRow as { id: string }).id);

      const { data: quoteRow, error: quoteError } = await muaHang
        .from('quotations')
        .insert({
          company_id: nvc,
          purchase_request_id: purchaseRequestId,
          supplier_id: (supplierRow as { id: string }).id,
          status: 'da_nhan',
          quoted_date: new Date().toISOString().slice(0, 10),
          tax_rate_bp: 1000,
          delivery_days: supplier.deliveryDays ?? 14,
          warranty_months: 12,
        })
        .select('id')
        .single();
      check('nhập báo giá', quoteError);

      const { error: quoteItemError } = await muaHang.from('quotation_items').insert({
        quotation_id: (quoteRow as { id: string }).id,
        item_code: 'THEP-H200',
        name: 'Thép hình H200',
        unit: 'kg',
        quantity: 5000,
        unit_price: supplier.unitPrice,
      });
      check('nhập dòng báo giá', quoteItemError);
    }

    const { data: comparison, error: compareError } = await muaHang.rpc('compare_quotations', {
      p_request_id: purchaseRequestId,
    });
    check('so sánh báo giá', compareError);
    const compareRows = comparison as {
      quotation_id: string;
      supplier_id: string;
      landed_total: string;
      cost_rank: number;
    }[];
    expect(compareRows).toHaveLength(2);
    expect(compareRows[0]!.cost_rank).toBe(1);

    const pricier = compareRows.find((r) => r.cost_rank === 2)!;
    const { error: noReasonError } = await muaHang.rpc('select_quotation', {
      p_quotation_id: pricier.quotation_id,
    });
    expect(
      noReasonError,
      'chọn nhà cung cấp đắt hơn mà không nêu căn cứ phải bị chặn (MH-04)',
    ).toBeTruthy();

    const { error: selectError } = await muaHang.rpc('select_quotation', {
      p_quotation_id: pricier.quotation_id,
      p_reason: 'Giao trong 3 ngày, kịp mốc dựng khung; hai lần trước giao đúng quy cách.',
    });
    check('chọn nhà cung cấp', selectError);

    const { data: orderId, error: orderError } = await muaHang.rpc('create_purchase_order', {
      p_quotation_id: pricier.quotation_id,
    });
    check('lập đơn đặt hàng', orderError);

    // Tiền vừa được hứa chi đã nằm ở phần ĐÃ CAM KẾT — TC-05 cảnh báo được trước khi hoá
    // đơn về, chứ không phải sau.
    const { data: committedView } = await chiHuy.rpc('construction_budget_status', {
      p_site_id: siteId as string,
    });
    const committedRow = (committedView as { cost_code: string; committed_amount: string }[]).find(
      (r) => r.cost_code === vatTuLine.cost_code,
    )!;
    expect(BigInt(committedRow.committed_amount)).toBe(BigInt(pricier.landed_total));

    const { data: orderItem } = await muaHang
      .from('purchase_order_items')
      .select('id, quantity')
      .eq('purchase_order_id', orderId as string)
      .single();

    const { error: deliveryError } = await muaHang.rpc('record_delivery', {
      p_purchase_order_id: orderId as string,
      p_delivered_date: new Date().toISOString().slice(0, 10),
      p_items: [
        {
          purchase_order_item_id: (orderItem as { id: string }).id,
          quantity_ok: Number((orderItem as { quantity: string }).quantity),
        },
      ],
      p_delivery_note_number: `PGH-${stamp}`,
      p_invoice_number: `HĐ-${stamp}`,
      p_has_quality_certificate: true,
    });
    check('ghi nhận giao nhận', deliveryError);

    // Hàng về đủ: cam kết chuyển hết sang chi phí thực tế của đúng mã chi phí đó.
    const { data: actualView } = await chiHuy.rpc('construction_budget_status', {
      p_site_id: siteId as string,
    });
    const actualRow = (
      actualView as { cost_code: string; actual_amount: string; committed_amount: string }[]
    ).find((r) => r.cost_code === vatTuLine.cost_code)!;
    expect(BigInt(actualRow.committed_amount)).toBe(0n);
    expect(BigInt(actualRow.actual_amount)).toBe(BigInt(pricier.landed_total));

    // MH-08: bộ chứng từ tới Kế toán bằng thông báo dẫn thẳng tới đơn hàng, không nhập lại.
    const { data: docNotice } = await ketoan
      .from('notifications')
      .select('id')
      .eq('type', 'purchase_order_delivered')
      .eq('related_entity_id', orderId as string);
    expect(docNotice!.length).toBe(1);

    // --- Bước 14. Hàng về kho, không nhập lại số liệu (MH-07 → KHO-03) ------------------
    // Đây là mắt xích cuối của chuỗi: số lượng, đơn giá và chứng từ đã có ở phiếu giao nhận,
    // Kho chỉ chọn kho nhận. Nhập lại bằng tay là đúng vướng mắc khảo sát #4.
    const khoNhanVien = await signInAs(ACCOUNTS.kho);

    const { data: warehouseRow, error: warehouseError } = await khoNhanVien
      .from('warehouses')
      .insert({
        company_id: nvc,
        code: `KHO-GP1-${stamp}`,
        name: `${TEST_PREFIX} Kho vật tư Golden Path ${stamp}`,
        warehouse_type: 'vat_tu_xay_dung',
      })
      .select('id')
      .single();
    check('lập kho', warehouseError);
    const warehouseId = (warehouseRow as { id: string }).id;

    // Mã vật tư trên đơn hàng phải có trong danh mục kho — KHO-02 sống hay chết ở chỗ này.
    const { data: materialRow, error: materialError } = await khoNhanVien
      .from('materials')
      .insert({
        code: 'THEP-H200',
        group_code: 'THEP',
        name: `${TEST_PREFIX} Thép hình H200`,
        unit: 'kg',
      })
      .select('id')
      .single();
    // Mã này có thể đã tồn tại từ lần chạy trước; chỉ dừng lại nếu lỗi vì lý do khác.
    const materialId =
      materialError === null
        ? (materialRow as { id: string }).id
        : ((
            await khoNhanVien.from('materials').select('id').eq('code', 'THEP-H200').single()
          ).data as { id: string }).id;
    expect(materialId).toBeTruthy();

    const { data: deliveryRow } = await muaHang
      .from('deliveries')
      .select('id')
      .eq('purchase_order_id', orderId as string)
      .single();

    const { data: receiptId, error: receiptError } = await khoNhanVien.rpc(
      'receive_from_delivery',
      {
        p_delivery_id: (deliveryRow as { id: string }).id,
        p_warehouse_id: warehouseId,
      },
    );
    check('nhập kho từ phiếu giao nhận', receiptError);

    // Tồn kho bằng đúng số lượng ĐẠT của phiếu giao nhận — không phải số đặt hàng.
    const { data: stock } = await khoNhanVien
      .from('inventory_items')
      .select('quantity_on_hand, average_cost')
      .eq('warehouse_id', warehouseId)
      .eq('material_id', materialId)
      .single();
    expect(Number((stock as { quantity_on_hand: string }).quantity_on_hand)).toBe(5000);

    // Phiếu nhập truy ngược được về phiếu giao nhận và đơn hàng sinh ra nó (PRD Mục 7).
    const { data: receipt } = await khoNhanVien
      .from('stock_movements')
      .select('code, movement_type, delivery_id, purchase_order_id')
      .eq('id', receiptId as string)
      .single();
    expect((receipt as { movement_type: string }).movement_type).toBe('nhap');
    expect((receipt as { purchase_order_id: string }).purchase_order_id).toBe(orderId as string);

    // Gọi lại lần nữa (bấm hai lần, hoặc mất sóng rồi gửi lại) KHÔNG cộng tồn lần thứ hai.
    const { error: duplicateError } = await khoNhanVien.rpc('receive_from_delivery', {
      p_delivery_id: (deliveryRow as { id: string }).id,
      p_warehouse_id: warehouseId,
    });
    expect(duplicateError, 'nhập kho hai lần cùng một phiếu giao nhận phải bị chặn').toBeTruthy();

    // Xuất thẳng cho công trình — chi phí gắn mã công trình ngay khi phát sinh (KT-05).
    const { error: issueError } = await khoNhanVien.rpc('issue_stock', {
      p_warehouse_id: warehouseId,
      p_items: [{ material_id: materialId, quantity: 2000 }],
      p_issue_reason: 'cong_trinh',
      p_construction_site_id: siteId as string,
    });
    check('xuất vật tư cho công trình', issueError);

    const { data: stockAfter } = await khoNhanVien
      .from('inventory_items')
      .select('quantity_on_hand')
      .eq('warehouse_id', warehouseId)
      .eq('material_id', materialId)
      .single();
    expect(Number((stockAfter as { quantity_on_hand: string }).quantity_on_hand)).toBe(3000);

    // --- Nghiệm thu: TRUY NGƯỢC từ hợp đồng về tận đầu nguồn ----------------------------
    // Đây là tiêu chí số 3 của Definition of Done: đứng ở hợp đồng phải trả lời được nó ra
    // đời từ cơ hội nào, theo bản dự toán nào, ai duyệt và duyệt lúc nào — không cần hỏi ai.
    const { data: signed } = await tgd
      .from('contracts')
      .select('stage, contract_number, signed_at, source_type, source_id, estimate_id')
      .eq('id', contractId)
      .single();
    expect(signed!.stage).toBe('da_ky');
    expect(signed!.contract_number).toBe(`HĐ-GP1-${stamp}`);
    expect(signed!.signed_at).not.toBeNull();
    expect(signed!.source_type).toBe('bidding_projects');
    expect(signed!.source_id).toBe(projectId);

    const { data: sourceProject } = await tgd
      .from('bidding_projects')
      .select('opportunity_id, stage')
      .eq('id', signed!.source_id)
      .single();
    expect(sourceProject!.opportunity_id).toBe(opportunityId);
    expect(sourceProject!.stage).toBe('trung_thau');

    const { data: usedEstimate } = await tgd
      .from('estimates')
      .select('id, version, is_current_version, status, approved_at')
      .eq('id', signed!.estimate_id)
      .single();
    expect(usedEstimate!.is_current_version).toBe(true);
    expect(usedEstimate!.status).toBe('completed');
    expect(usedEstimate!.approved_at).not.toBeNull();

    // Ai duyệt, lúc nào, căn cứ gì — đọc từ bảng LỊCH SỬ phê duyệt, nơi mỗi lượt quyết định
    // là một dòng không ghi đè (Backend Schema 2.3). Nếu chỉ có cột `final_decision` trên hồ
    // sơ thì lần duyệt lại sau này sẽ xóa mất dấu vết lần trước.
    const { data: decisions, error: decisionError } = await tgd
      .from('approval_decisions')
      .select('approval_id, decision, note, decided_by, decided_at')
      .in('approval_id', [approvalId, contractApprovalId]);
    check('đọc lịch sử phê duyệt', decisionError);
    expect(decisions).toHaveLength(2);

    const boss = await currentUser(tgd);
    for (const d of decisions!) {
      expect(d.decision).toBe('approved');
      expect(d.decided_at).not.toBeNull();
      expect(d.decided_by).toBe(boss);
      expect(d.note, 'căn cứ phê duyệt để trống thì không truy được lý do (DA-07)').toBeTruthy();
    }

    // Lịch sử giai đoạn cơ hội còn nguyên — phễu bán hàng dựng lại được (CRM-09).
    const { data: history } = await tgd
      .from('opportunity_stage_history')
      .select('to_stage')
      .eq('opportunity_id', opportunityId)
      .order('changed_at');
    expect(history!.map((h) => h.to_stage)).toEqual([
      'tiep_nhan',
      'xac_minh',
      'khao_sat',
      'bao_gia',
      'dam_phan',
    ]);
  }, 120_000);
});

describeDb('Golden Path 2 — NVO: Cơ hội → Dự án thiết kế → Phương án → Bản vẽ → Dự toán → Hợp đồng', () => {
  it('chạy trọn luồng thiết kế và hợp đồng dùng đúng bản dự toán đã duyệt', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    const tgd = await signInAs(ACCOUNTS.tgd);

    const nvo = await companyId(kinhDoanh, 'NVO');
    const customer = await anyCustomer(kinhDoanh);
    const stamp = Date.now();

    // --- Bước 1. Cơ hội nhà ở dân dụng --------------------------------------------------
    const { data: opportunity, error: oppError } = await kinhDoanh
      .from('opportunities')
      .insert({
        code: await nextCode(kinhDoanh, 'NVO', 'CH'),
        company_id: nvo,
        customer_id: customer,
        name: `${TEST_PREFIX} GP2 Nhà phố 3 tầng ${stamp}`,
        owner_id: await currentUser(kinhDoanh),
        estimated_value: 2_800_000_000,
      })
      .select('id')
      .single();
    check('tạo cơ hội', oppError);
    const opportunityId = (opportunity as { id: string }).id;

    // --- Bước 2. Dự án thiết kế, LIÊN KẾT về cơ hội (TK-01) -----------------------------
    const { data: project, error: projectError } = await thietKe
      .from('design_projects')
      .insert({
        code: await nextCode(thietKe, 'NVO', 'TK'),
        company_id: nvo,
        opportunity_id: opportunityId,
        customer_id: customer,
        name: `${TEST_PREFIX} GP2 Thiết kế nhà phố ${stamp}`,
        responsible_user_id: await currentUser(thietKe),
      })
      .select('id')
      .single();
    check('tạo dự án thiết kế', projectError);
    const projectId = (project as { id: string }).id;

    /** Một bản vẽ có tệp thật trong kho hồ sơ — không có tệp thì không phát hành được. */
    async function publishDrawing(discipline: string): Promise<string> {
      const { data: doc, error: docError } = await thietKe
        .from('documents')
        .insert({
          company_id: nvo,
          title: `${TEST_PREFIX} GP2 Bản vẽ ${discipline} ${stamp}`,
          category: 'ban_ve',
          related_entity_type: 'design_projects',
          related_entity_id: projectId,
        })
        .select('id')
        .single();
      check(`tạo hồ sơ bản vẽ ${discipline}`, docError);

      const { data: documentVersionId, error: fileError } = await thietKe.rpc(
        'publish_document_version',
        {
          p_document_id: (doc as { id: string }).id,
          p_file_url: `test/gp2-${discipline}-${stamp}.pdf`,
          p_file_name: `${discipline}.pdf`,
          p_change_reason: 'Bản đầu tiên',
        },
      );
      check(`nạp tệp bản vẽ ${discipline}`, fileError);

      const { data: version, error: versionError } = await thietKe
        .from('design_versions')
        .insert({
          company_id: nvo,
          design_project_id: projectId,
          discipline,
          title: `${TEST_PREFIX} GP2 ${discipline}`,
          document_id: (doc as { id: string }).id,
          document_version_id: documentVersionId,
        })
        .select('id')
        .single();
      check(`tạo phiên bản ${discipline}`, versionError);

      const versionId = (version as { id: string }).id;
      check(
        `phát hành ${discipline}`,
        (await thietKe.rpc('publish_design_version', { p_version_id: versionId })).error,
      );
      return versionId;
    }

    // --- Bước 3. Phương án kiến trúc và khách hàng duyệt (TK-03) ------------------------
    const conceptId = await publishDrawing('phuong_an');

    // Gửi khách xem là một BƯỚC có thật, không phải hệ quả của việc phát hành: hồ sơ phải
    // chuyển sang "Chờ khách duyệt" trước khi ghi nhận ý kiến khách hàng (TK-03).
    check(
      'gửi phương án cho khách',
      (
        await thietKe.rpc('move_design_stage', {
          p_design_project_id: projectId,
          p_stage: 'cho_khach_duyet',
        })
      ).error,
    );

    check(
      'ghi nhận khách duyệt phương án',
      (
        await thietKe.rpc('record_design_review', {
          p_version_id: conceptId,
          p_reviewer_type: 'khach_hang',
          p_decision: 'duyet',
          p_comments: 'Đồng ý mặt bằng và mặt đứng.',
          p_reviewer_name: 'Chủ nhà',
        })
      ).error,
    );

    // Khách duyệt phương án thì hồ sơ kỹ thuật mới được mở — không ai vẽ kết cấu cho một
    // phương án chưa chốt (TK-03).
    const { data: afterApproval } = await thietKe
      .from('design_projects')
      .select('stage')
      .eq('id', projectId)
      .single();
    expect(afterApproval!.stage).toBe('ho_so_ky_thuat');

    // --- Bước 4. Ba bộ môn ra bản vẽ (TK-04, TK-05) -------------------------------------
    const me = await currentUser(thietKe);
    for (const discipline of ['kien_truc', 'ket_cau', 'dien_nuoc']) {
      await publishDrawing(discipline);
      check(
        `ghi tiến độ ${discipline}`,
        (
          await thietKe.from('design_discipline_tasks').insert({
            company_id: nvo,
            design_project_id: projectId,
            discipline,
            assignee_id: me,
            status: 'hoan_thanh',
            progress_percent: 100,
          })
        ).error,
      );
    }

    const { data: sync } = await thietKe.rpc('check_design_sync', {
      p_design_project_id: projectId,
    });
    const blocking = ((sync ?? []) as { blocking: boolean }[]).filter((f) => f.blocking);
    expect(blocking, 'ba bộ môn xong mà vẫn còn xung đột chặn thì luồng đứt ở đây').toHaveLength(0);

    // --- Bước 5. Dự toán dùng CHUNG cơ chế của Module DA (TK-07) ------------------------
    const { data: estimate, error: estimateError } = await thietKe
      .from('estimates')
      .insert({
        code: await nextCode(thietKe, 'NVO', 'DT'),
        company_id: nvo,
        design_project_id: projectId,
        bid_price: 2_600_000_000,
        basis_notes: `${TEST_PREFIX} suất đầu tư nhà phố`,
        prepared_by: me,
      })
      .select('id')
      .single();
    check('lập dự toán thiết kế', estimateError);
    const estimateId = (estimate as { id: string }).id;

    check(
      'ghi cơ cấu giá',
      (
        await thietKe.rpc('save_estimate_costs', {
          p_estimate_id: estimateId,
          p_direct_cost: 1_900_000_000,
          p_overhead_cost: 250_000_000,
          p_contingency_cost: 100_000_000,
          p_finance_cost: 0,
          p_tax_amount: 0,
          p_profit_amount: 350_000_000,
          p_profit_margin_percent: 13,
        })
      ).error,
    );

    const { data: approvalId, error: requestError } = await thietKe.rpc(
      'request_estimate_approval',
      { p_estimate_id: estimateId },
    );
    check('gửi duyệt giá', requestError);
    check(
      'Tổng Giám đốc duyệt giá',
      (
        await tgd.rpc('decide_approval', {
          p_approval_id: approvalId,
          p_decision: 'approved',
          p_note: 'Duyệt theo suất đầu tư đã thống nhất.',
        })
      ).error,
    );

    // --- Bước 6. Hợp đồng thiết kế – thi công trọn gói (HD-01) --------------------------
    const { data: contractId, error: contractError } = await thietKe.rpc(
      'create_contract_from_source',
      {
        p_source_type: 'design_projects',
        p_source_id: projectId,
        p_type: 'thiet_ke',
        p_title: `${TEST_PREFIX} GP2 Hợp đồng thiết kế nhà phố`,
      },
    );
    check('soạn hợp đồng', contractError);

    const { data: drafted } = await thietKe
      .from('contracts')
      .select('value, customer_id, estimate_id, source_type, source_id')
      .eq('id', contractId)
      .single();
    expect(Number(drafted!.value)).toBe(2_600_000_000);
    expect(drafted!.customer_id).toBe(customer);
    expect(drafted!.estimate_id).toBe(estimateId);
    expect(drafted!.source_type).toBe('design_projects');

    // --- Nghiệm thu: truy ngược hợp đồng → dự án thiết kế → cơ hội ----------------------
    const { data: sourceDesign } = await tgd
      .from('design_projects')
      .select('opportunity_id')
      .eq('id', drafted!.source_id)
      .single();
    expect(sourceDesign!.opportunity_id).toBe(opportunityId);

    // Bản vẽ đang hiệu lực của mỗi bộ môn đúng MỘT bản — vướng mắc khảo sát "không chắc file
    // đang dùng có phải bản mới nhất" chỉ coi là giải quyết khi khẳng định được điều này.
    const { data: current } = await tgd
      .from('design_versions')
      .select('discipline, version, is_current_version')
      .eq('design_project_id', projectId)
      .eq('is_current_version', true);
    expect(current!.map((v) => v.discipline).sort()).toEqual(
      ['dien_nuoc', 'ket_cau', 'kien_truc', 'phuong_an'].sort(),
    );
  }, 120_000);
});

/**
 * Tiêu chí nghiệm thu số 4 của Giai đoạn 1: "Sửa bản vẽ nguồn → hệ thống cảnh báo BOQ đang
 * bóc theo bản cũ".
 *
 * Đây là vướng mắc khảo sát được nhắc nhiều nhất: người bóc khối lượng không có cách nào biết
 * bản vẽ mình đang cầm đã bị thay. Cảnh báo chỉ đáng tin nếu nó suy ra từ DỮ LIỆU (dòng khối
 * lượng trỏ vào đúng phiên bản tệp đã dùng), chứ không phải từ việc ai đó nhớ ra phải báo.
 */
describeDb('Nghiệm thu Giai đoạn 1 — cảnh báo khối lượng bóc theo bản vẽ cũ (DA-04)', () => {
  it('phát hành bản vẽ mới thì dòng khối lượng cũ tự lộ ra là đã lỗi thời', async () => {
    const dauThau = await signInAs(ACCOUNTS.dauThauNvc);
    const nvc = await companyId(dauThau, 'NVC');
    const stamp = Date.now();

    const { data: project, error: projectError } = await dauThau
      .from('bidding_projects')
      .insert({
        code: await nextCode(dauThau, 'NVC', 'DA'),
        company_id: nvc,
        name: `${TEST_PREFIX} GP Bản vẽ đổi ${stamp}`,
        responsible_user_id: await currentUser(dauThau),
      })
      .select('id')
      .single();
    check('tạo gói thầu', projectError);
    const projectId = (project as { id: string }).id;

    const { data: doc, error: docError } = await dauThau
      .from('documents')
      .insert({
        company_id: nvc,
        title: `${TEST_PREFIX} Mặt bằng kết cấu ${stamp}`,
        category: 'ban_ve',
        related_entity_type: 'bidding_projects',
        related_entity_id: projectId,
      })
      .select('id')
      .single();
    check('tạo hồ sơ bản vẽ', docError);
    const documentId = (doc as { id: string }).id;

    const { data: firstVersion, error: firstError } = await dauThau.rpc(
      'publish_document_version',
      {
        p_document_id: documentId,
        p_file_url: `test/kc-v1-${stamp}.pdf`,
        p_file_name: 'kc-v1.pdf',
        p_change_reason: 'Bản phát hành cho bóc khối lượng',
      },
    );
    check('phát hành bản vẽ lần 1', firstError);

    // Bóc khối lượng THEO bản vẽ đó — ghi lại đúng phiên bản đã dùng, không chỉ ghi tên tệp.
    const { data: item, error: itemError } = await dauThau
      .from('boq_items')
      .insert({
        company_id: nvc,
        bidding_project_id: projectId,
        position: 1,
        name: 'Cột thép H350',
        unit: 'tấn',
        quantity: 32,
        drawing_ref: 'KC-01',
        drawing_document_id: documentId,
        drawing_version_id: firstVersion,
      })
      .select('id')
      .single();
    check('bóc khối lượng theo bản vẽ', itemError);
    const itemId = (item as { id: string }).id;

    // Trước khi bản vẽ đổi: dòng khối lượng đang khớp bản đang hiệu lực.
    const readBack = async () => {
      const { data } = await dauThau
        .from('boq_items')
        .select(
          'id, drawing_ref, ' +
            'drawing_version:document_versions!boq_items_drawing_version_id_document_versions_id_fk(version, is_current_version)',
        )
        .eq('id', itemId)
        .single();
      return data as unknown as {
        drawing_version: { version: number; is_current_version: boolean };
      };
    };

    expect((await readBack()).drawing_version.is_current_version).toBe(true);

    // Chủ đầu tư gửi bản vẽ điều chỉnh.
    check(
      'phát hành bản vẽ lần 2',
      (
        await dauThau.rpc('publish_document_version', {
          p_document_id: documentId,
          p_file_url: `test/kc-v2-${stamp}.pdf`,
          p_file_name: 'kc-v2.pdf',
          p_change_reason: 'Chủ đầu tư đổi bước cột',
        })
      ).error,
    );

    // Dòng khối lượng KHÔNG bị sửa và cũng không bị xóa — nó vẫn là con số đã bóc theo bản
    // cũ. Cái đổi là bản cũ nay không còn hiệu lực, và đó chính là dấu hiệu để cảnh báo.
    const after = await readBack();
    expect(after.drawing_version.version).toBe(1);
    expect(
      after.drawing_version.is_current_version,
      'bản vẽ đã có bản mới mà dòng khối lượng vẫn báo đang khớp thì cảnh báo không bao giờ hiện',
    ).toBe(false);
  }, 60_000);
});
