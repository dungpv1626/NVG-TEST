/**
 * Kịch bản NVC — nhà xưởng từ cơ hội tới lãi/lỗ (luồng M2-1), cộng một ngày của chỉ huy trưởng.
 *
 * Chuỗi lệnh chép từ `__tests__/golden-path.test.ts` (GP1) và `kt.test.ts`: cùng hàm nghiệp vụ,
 * cùng vai trò, nên dữ liệu ra đúng như người dùng thật tạo. Khác ở chỗ tên thật, số liệu hợp
 * lý cho một nhà xưởng 2.400 m², và dừng ở những trạng thái đáng xem khi trình diễn:
 *
 *  · đề nghị vật tư 1 — đã về kho và xuất cho công trình (chi phí thực tế có số);
 *  · đề nghị vật tư 2 — đang chờ phê duyệt (Request Tracker hiện «Chờ N ngày», «Thúc»);
 *  · đề nghị vật tư 3 — đã duyệt, chờ Mua hàng lập đơn;
 *  · nghiệm thu đợt 1 với chủ đầu tư → Kế toán lập công nợ → đã thu một phần;
 *  · thanh toán tổ đội đợt 1 đã chi; một đề nghị thanh toán khác đang chờ Giám đốc Tài chính;
 *  · 10 ngày nhật ký công trường.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, check, companyId, day, nextCode, one, signIn, userId } from './client';
import { clean } from './names';

export const NVC_OPPORTUNITY = clean('Nhà xưởng sản xuất linh kiện 2.400 m² — KCN Phố Nối A');

const SITE_ADDRESS = clean('Lô C7, KCN Phố Nối A, Văn Lâm, Hưng Yên');

interface BudgetLine {
  id: string;
  cost_code: string;
  cost_group: string;
  name: string;
}

async function approveBy(
  approver: SupabaseClient,
  approvalId: string,
  note: string,
  step: string,
): Promise<void> {
  check(
    step,
    await approver.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: note,
    }),
  );
}

async function pendingApproval(client: SupabaseClient, entityType: string, entityId: string) {
  const row = await one(
    `tìm phê duyệt của ${entityType}`,
    client
      .from('approvals')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'pending_approval')
      .single(),
  );
  return (row as { id: string }).id;
}

async function draftSiteRequest(
  chiHuy: SupabaseClient,
  input: {
    company: string;
    siteId: string;
    costCode: string;
    title: string;
    neededInDays: number;
    urgent?: boolean;
    items: { code: string; name: string; unit: string; quantity: number; price: number }[];
  },
): Promise<string> {
  const row = await one(
    `lập đề nghị «${input.title}»`,
    chiHuy
      .from('purchase_requests')
      .insert({
        company_id: input.company,
        title: clean(input.title),
        construction_site_id: input.siteId,
        cost_code: input.costCode,
        urgency: input.urgent ? 'gap' : 'thuong',
        needed_date: day(input.neededInDays),
        delivery_location: SITE_ADDRESS,
      })
      .select('id')
      .single(),
  );
  const id = (row as { id: string }).id;
  check(
    'thêm dòng đề nghị',
    await chiHuy.from('purchase_request_items').insert(
      input.items.map((item, index) => ({
        purchase_request_id: id,
        position: index + 1,
        item_code: item.code,
        name: clean(item.name),
        unit: item.unit,
        quantity: item.quantity,
        estimated_unit_price: item.price,
      })),
    ),
  );
  return id;
}

export async function loadNvc(): Promise<'created' | 'skipped'> {
  const kinhDoanh = await signIn(ACCOUNTS.kinhDoanhNvc);
  const existing = await kinhDoanh
    .from('opportunities')
    .select('id')
    .eq('name', NVC_OPPORTUNITY)
    .maybeSingle();
  if (existing.data) return 'skipped';

  const dauThau = await signIn(ACCOUNTS.dauThauNvc);
  const tgd = await signIn(ACCOUNTS.tgd);
  const cfo = await signIn(ACCOUNTS.cfo);
  const truongPhong = await signIn(ACCOUNTS.truongPhongTc);
  const chiHuy = await signIn(ACCOUNTS.chiHuyTruong);
  const muaHang = await signIn(ACCOUNTS.muaHang);
  const kho = await signIn(ACCOUNTS.kho);
  const ketoan = await signIn(ACCOUNTS.ketoan);

  const nvc = await companyId(kinhDoanh, 'NVC');
  const chiHuyId = await userId(chiHuy);

  // --- Khách hàng và cơ hội (CRM) -----------------------------------------------------------
  const customer = (await one(
    'lập khách hàng',
    kinhDoanh
      .from('customers')
      .insert({
        name: clean('Công ty TNHH Cơ khí Chính xác Hưng Thịnh'),
        source: 'Môi giới bất động sản công nghiệp',
        contact_person: clean('Ông Phạm Quốc Hưng — Giám đốc'),
        phone: '0912 468 357',
        address: clean('Đường D2, KCN Phố Nối A, Văn Lâm, Hưng Yên'),
        tax_code: '0901234567',
        needs: clean('Nhà xưởng kết cấu thép 2.400 m², khởi công quý IV/2026'),
      })
      .select('id')
      .single(),
  )) as { id: string };

  const opportunity = (await one(
    'lập cơ hội',
    kinhDoanh
      .from('opportunities')
      .insert({
        code: await nextCode(kinhDoanh, 'NVC', 'CH'),
        company_id: nvc,
        customer_id: customer.id,
        name: NVC_OPPORTUNITY,
        owner_id: await userId(kinhDoanh),
        estimated_value: 6_800_000_000,
      })
      .select('id')
      .single(),
  )) as { id: string };

  for (const stage of ['xac_minh', 'khao_sat', 'bao_gia', 'dam_phan']) {
    check(
      `chuyển cơ hội sang ${stage}`,
      await kinhDoanh.rpc('move_opportunity_stage', {
        p_opportunity_id: opportunity.id,
        p_to_stage: stage,
        p_note: null,
      }),
    );
  }

  // --- Gói thầu, bóc khối lượng, dự toán, duyệt giá (DA) ------------------------------------
  const project = (await one(
    'lập gói thầu',
    dauThau
      .from('bidding_projects')
      .insert({
        code: await nextCode(dauThau, 'NVC', 'DA'),
        company_id: nvc,
        opportunity_id: opportunity.id,
        customer_id: customer.id,
        name: clean('Gói thầu thi công nhà xưởng Hưng Thịnh — KCN Phố Nối A'),
        responsible_user_id: await userId(dauThau),
        estimated_value: 6_800_000_000,
      })
      .select('id')
      .single(),
  )) as { id: string };

  check(
    'bóc khối lượng',
    await dauThau.from('boq_items').insert(
      [
        { name: 'Bê tông móng, giằng móng M300', unit: 'm3', quantity: 420 },
        { name: 'Thép kết cấu khung kèo, xà gồ', unit: 'tấn', quantity: 62 },
        { name: 'Tôn lợp mái, tôn vách', unit: 'm2', quantity: 3_900 },
        { name: 'Nền bê tông cốt thép chịu lực', unit: 'm2', quantity: 2_400 },
      ].map((item, i) => ({
        company_id: nvc,
        bidding_project_id: project.id,
        position: i + 1,
        ...item,
      })),
    ),
  );

  const estimate = (await one(
    'lập dự toán',
    dauThau
      .from('estimates')
      .insert({
        code: await nextCode(dauThau, 'NVC', 'DT'),
        company_id: nvc,
        bidding_project_id: project.id,
        bid_price: 6_500_000_000,
        basis_notes: clean('Đơn giá vật liệu tháng 9/2026, định mức nội bộ NVC'),
        prepared_by: await userId(dauThau),
      })
      .select('id')
      .single(),
  )) as { id: string };

  check(
    'ghi dòng dự toán',
    await dauThau.rpc('save_estimate_items', {
      p_estimate_id: estimate.id,
      p_items: [
        {
          cost_group: 'vat_tu',
          description: 'Thép kết cấu',
          unit: 'tấn',
          quantity: 62,
          unit_price: 28_500_000,
        },
        {
          cost_group: 'vat_tu',
          description: 'Bê tông thương phẩm',
          unit: 'm3',
          quantity: 800,
          unit_price: 1_450_000,
        },
        {
          cost_group: 'nhan_cong',
          description: 'Nhân công lắp dựng, xây dựng',
          unit: 'công',
          quantity: 3_600,
          unit_price: 480_000,
        },
        {
          cost_group: 'may_moc',
          description: 'Cẩu lắp, máy thi công',
          unit: 'ca',
          quantity: 60,
          unit_price: 5_500_000,
        },
      ],
    }),
  );
  check(
    'ghi cơ cấu giá',
    await dauThau.rpc('save_estimate_costs', {
      p_estimate_id: estimate.id,
      p_direct_cost: 5_205_000_000,
      p_overhead_cost: 420_000_000,
      p_contingency_cost: 205_000_000,
      p_finance_cost: 0,
      p_tax_amount: 0,
      p_profit_amount: 670_000_000,
      p_profit_margin_percent: 10.3,
    }),
  );
  const estimateApproval = check(
    'gửi duyệt giá',
    await dauThau.rpc('request_estimate_approval', { p_estimate_id: estimate.id }),
  ) as string;
  await approveBy(
    tgd,
    estimateApproval,
    'Giá dự thầu phù hợp, giữ biên lợi nhuận trên 10%.',
    'duyệt giá',
  );

  check(
    'thêm hồ sơ dự thầu',
    await dauThau.from('bid_documents').insert({
      company_id: nvc,
      bidding_project_id: project.id,
      category: 'bang_gia',
      name: 'Bảng giá dự thầu',
      is_required: false,
    }),
  );
  check('nộp thầu', await dauThau.rpc('submit_bid', { p_bidding_project_id: project.id }));
  check(
    'ghi trúng thầu',
    await dauThau.rpc('record_bid_result', { p_bidding_project_id: project.id, p_won: true }),
  );

  // --- Hợp đồng (HD) -----------------------------------------------------------------------
  const contractId = check(
    'soạn hợp đồng',
    await dauThau.rpc('create_contract_from_source', {
      p_source_type: 'bidding_projects',
      p_source_id: project.id,
      p_type: 'thi_cong',
      p_title: clean('Hợp đồng thi công nhà xưởng Hưng Thịnh'),
    }),
  ) as string;
  for (const [termType, description] of [
    ['pham_vi', 'Thi công trọn gói phần móng, khung thép, mái, nền nhà xưởng 2.400 m²'],
    ['gia_tri', 'Giá trị hợp đồng 6.500.000.000 đồng, chưa gồm thuế giá trị gia tăng'],
    ['tien_do_thanh_toan', 'Tạm ứng 20%; thanh toán theo từng đợt nghiệm thu, giữ lại 5% bảo hành'],
  ] as const) {
    check(
      `điều khoản ${termType}`,
      await dauThau.from('contract_terms').insert({
        company_id: nvc,
        contract_id: contractId,
        term_type: termType,
        description: clean(description),
      }),
    );
  }
  check(
    'ngày bắt đầu hợp đồng',
    await dauThau
      .from('contracts')
      .update({ start_date: day(-24) })
      .eq('id', contractId),
  );
  const contractApproval = check(
    'trình ký hợp đồng',
    await dauThau.rpc('submit_contract_approval', { p_contract_id: contractId }),
  ) as string;
  await approveBy(tgd, contractApproval, 'Đồng ý ký.', 'duyệt hợp đồng');
  check(
    'ghi nhận đã ký',
    await dauThau.rpc('sign_contract', {
      p_contract_id: contractId,
      p_contract_number: '27/2026/HĐTC/NVC-HT',
      p_signed_date: day(-26),
    }),
  );

  // --- Ngân sách và công trình (TC) --------------------------------------------------------
  check(
    'lập ngân sách thi công',
    await dauThau.rpc('generate_project_budget', { p_bidding_project_id: project.id }),
  );
  const siteId = check(
    'mở công trình',
    await dauThau.rpc('open_site_from_contract', {
      p_contract_id: contractId,
      p_name: clean('Nhà xưởng Hưng Thịnh — KCN Phố Nối A'),
      p_site_address: SITE_ADDRESS,
      p_responsible_user_id: chiHuyId,
      p_planned_start_date: day(-22),
      p_planned_end_date: day(120),
    }),
  ) as string;
  check(
    'bắt đầu thi công',
    await truongPhong.rpc('move_site_stage', { p_site_id: siteId, p_stage: 'dang_thi_cong' }),
  );

  const budget = (await one(
    'đọc ngân sách',
    tgd
      .from('project_budgets')
      .select('id, cost_code, cost_group, name')
      .eq('construction_site_id', siteId),
  )) as BudgetLine[];
  const vatTu = budget.find((b) => b.cost_group === 'vat_tu');
  const nhanCong = budget.find((b) => b.cost_group === 'nhan_cong');
  if (!vatTu || !nhanCong) throw new Error('Ngân sách thiếu dòng vật tư hoặc nhân công.');

  // --- Nhật ký 10 ngày của chỉ huy trưởng (TC-05) -----------------------------------------
  const logs: [number, string, number, string, string][] = [
    [-10, 'tien_do', 22, 'Nắng', 'Đào đất hố móng trục A–C, vận chuyển đất thừa ra bãi tập kết.'],
    [-9, 'tien_do', 26, 'Nắng', 'Đổ bê tông lót móng trục A–C. Lắp dựng cốp pha móng M1–M6.'],
    [
      -8,
      'khoi_luong',
      28,
      'Có mưa rào chiều',
      'Gia công cốt thép móng M1–M12, nghỉ đổ bê tông buổi chiều do mưa.',
    ],
    [
      -7,
      'tien_do',
      30,
      'Nắng',
      'Đổ bê tông móng M1–M6, 48 m³. Đúc 9 viên lập phương kiểm tra cường độ.',
    ],
    [
      -6,
      'vuong_mac',
      25,
      'Âm u',
      'Thép D20 về thiếu 1,2 tấn so với đơn hàng; đã báo Mua hàng bổ sung.',
    ],
    [-5, 'tien_do', 31, 'Nắng', 'Đổ bê tông móng M7–M12. Bắt đầu lấp đất hố móng trục A.'],
    [
      -4,
      'an_toan',
      29,
      'Nắng',
      'Kiểm tra an toàn đầu tuần: bổ sung lan can hố móng trục D, nhắc công nhân đội mũ bảo hộ.',
    ],
    [-3, 'tien_do', 33, 'Nắng', 'Thi công giằng móng trục A–B. Tập kết thép hình cho khung kèo.'],
    [-2, 'khoi_luong', 34, 'Nắng nóng', 'Hoàn thành giằng móng trục A–B, 18,5 m³ bê tông.'],
    [
      -1,
      'tien_do',
      35,
      'Nắng',
      'Lắp đặt bu lông neo chân cột, căn chỉnh cao độ theo bản vẽ KC-03 R2.',
    ],
  ];
  for (const [offset, type, workforce, weather, content] of logs) {
    check(
      `nhật ký ${day(offset)}`,
      await chiHuy.from('site_logs').insert({
        company_id: nvc,
        construction_site_id: siteId,
        log_date: day(offset),
        log_type: type,
        content: clean(content),
        workforce_count: workforce,
        weather: clean(weather),
        logged_by: chiHuyId,
      }),
    );
  }

  // --- Đề nghị vật tư 1: đã về kho, đã xuất cho công trình (MH → KHO) ----------------------
  const pr1 = await draftSiteRequest(chiHuy, {
    company: nvc,
    siteId,
    costCode: vatTu.cost_code,
    title: 'Thép hình H200 cho khung kèo nhịp 1–4',
    neededInDays: 5,
    items: [
      {
        code: 'THEP-HINH-H200',
        name: 'Thép hình H200x200',
        unit: 'kg',
        quantity: 18_000,
        price: 21_500,
      },
    ],
  });
  const pr1Approval = check(
    'gửi duyệt đề nghị 1',
    await chiHuy.rpc('submit_purchase_request_approval', { p_request_id: pr1 }),
  ) as string;
  await approveBy(tgd, pr1Approval, 'Đồng ý mua theo tiến độ dựng khung.', 'duyệt đề nghị 1');

  const quotes: string[] = [];
  for (const supplier of [
    { name: 'Công ty CP Thép Nam Việt', price: 20_900, days: 10, cls: 'chinh' },
    { name: 'Công ty TNHH Thép Đại Phát', price: 21_300, days: 3, cls: 'chinh' },
  ]) {
    const s = (await one(
      'lập nhà cung cấp',
      muaHang
        .from('suppliers')
        .insert({
          name: clean(supplier.name),
          category: 'Thép xây dựng',
          supplier_class: supplier.cls,
          phone: '024 3868 2211',
        })
        .select('id')
        .single(),
    )) as { id: string };
    const q = (await one(
      'nhập báo giá',
      muaHang
        .from('quotations')
        .insert({
          company_id: nvc,
          purchase_request_id: pr1,
          supplier_id: s.id,
          status: 'da_nhan',
          quoted_date: day(-4),
          tax_rate_bp: 1000,
          delivery_days: supplier.days,
          warranty_months: 12,
        })
        .select('id')
        .single(),
    )) as { id: string };
    check(
      'dòng báo giá',
      await muaHang.from('quotation_items').insert({
        quotation_id: q.id,
        item_code: 'THEP-HINH-H200',
        name: 'Thép hình H200x200',
        unit: 'kg',
        quantity: 18_000,
        unit_price: supplier.price,
      }),
    );
    quotes.push(q.id);
  }
  check(
    'chọn nhà cung cấp',
    await muaHang.rpc('select_quotation', {
      p_quotation_id: quotes[1],
      p_reason: clean('Giao trong 3 ngày, kịp mốc dựng khung; hai đơn trước giao đúng quy cách.'),
    }),
  );
  const orderId = check(
    'lập đơn đặt hàng',
    await muaHang.rpc('create_purchase_order', { p_quotation_id: quotes[1] }),
  ) as string;
  const orderItem = (await one(
    'đọc dòng đơn hàng',
    muaHang
      .from('purchase_order_items')
      .select('id, quantity')
      .eq('purchase_order_id', orderId)
      .single(),
  )) as { id: string; quantity: string };
  check(
    'ghi nhận giao nhận',
    await muaHang.rpc('record_delivery', {
      p_purchase_order_id: orderId,
      p_delivered_date: day(-2),
      p_items: [{ purchase_order_item_id: orderItem.id, quantity_ok: Number(orderItem.quantity) }],
      p_delivery_note_number: 'PGH-DP-0918',
      p_invoice_number: '0004517',
      p_has_quality_certificate: true,
    }),
  );

  const warehouse = (await one(
    'lập kho',
    kho
      .from('warehouses')
      .insert({
        company_id: nvc,
        code: 'NVC-KHO-PNA',
        name: clean('Kho công trình Phố Nối A'),
        warehouse_type: 'kho_cong_trinh',
        construction_site_id: siteId,
      })
      .select('id')
      .single(),
  )) as { id: string };
  const existingMaterial = await kho
    .from('materials')
    .select('id')
    .eq('code', 'THEP-HINH-H200')
    .maybeSingle();
  const materialId =
    (existingMaterial.data as { id: string } | null)?.id ??
    (
      (await one(
        'lập vật tư',
        kho
          .from('materials')
          .insert({
            code: 'THEP-HINH-H200',
            group_code: 'THEP',
            name: 'Thép hình H200x200',
            specification: 'SS400, cây 12 m',
            unit: 'kg',
          })
          .select('id')
          .single(),
      )) as { id: string }
    ).id;
  const delivery = (await one(
    'đọc phiếu giao nhận',
    muaHang.from('deliveries').select('id').eq('purchase_order_id', orderId).single(),
  )) as { id: string };
  check(
    'nhập kho từ phiếu giao nhận',
    await kho.rpc('receive_from_delivery', {
      p_delivery_id: delivery.id,
      p_warehouse_id: warehouse.id,
    }),
  );
  check(
    'xuất vật tư cho công trình',
    await kho.rpc('issue_stock', {
      p_warehouse_id: warehouse.id,
      p_items: [{ material_id: materialId, quantity: 12_000 }],
      p_issue_reason: 'cong_trinh',
      p_construction_site_id: siteId,
    }),
  );

  // --- Đề nghị vật tư 2: đang chờ phê duyệt — Request Tracker, «Thúc» -----------------------
  const pr2 = await draftSiteRequest(chiHuy, {
    company: nvc,
    siteId,
    costCode: vatTu.cost_code,
    title: 'Xi măng PCB40 cho nền nhà xưởng',
    neededInDays: 4,
    urgent: true,
    items: [
      {
        code: 'XM-PCB40-BAO50KG',
        name: 'Xi măng PCB40 bao 50 kg',
        unit: 'bao',
        quantity: 1_200,
        price: 95_000,
      },
    ],
  });
  check(
    'gửi duyệt đề nghị 2',
    await chiHuy.rpc('submit_purchase_request_approval', { p_request_id: pr2 }),
  );

  // --- Đề nghị vật tư 3: đã duyệt, chờ Mua hàng lập đơn -------------------------------------
  const pr3 = await draftSiteRequest(chiHuy, {
    company: nvc,
    siteId,
    costCode: vatTu.cost_code,
    title: 'Cốp pha phủ phim cho giằng móng trục C–D',
    neededInDays: 7,
    items: [
      {
        code: 'CCDC-COPPHA-PHIM18',
        name: 'Cốp pha phủ phim 18 mm',
        unit: 'tấm',
        quantity: 400,
        price: 380_000,
      },
    ],
  });
  const pr3Approval = check(
    'gửi duyệt đề nghị 3',
    await chiHuy.rpc('submit_purchase_request_approval', { p_request_id: pr3 }),
  ) as string;
  await approveBy(
    cfo,
    pr3Approval,
    'Đồng ý, ưu tiên nhà cung cấp giao tại công trường.',
    'duyệt đề nghị 3',
  );

  // --- Nghiệm thu đợt 1 với chủ đầu tư, công nợ, thu tiền (TC-04, KT-04) --------------------
  const acceptanceId = check(
    'nghiệm thu đợt 1',
    await chiHuy.rpc('record_acceptance', {
      p_site_id: siteId,
      p_acceptance_type: 'khach_hang',
      p_stage_name: clean('Đợt 1 — phần móng và giằng móng'),
      p_value: 1_300_000_000,
      p_counterpart_signed_by: clean('Ông Phạm Quốc Hưng — đại diện chủ đầu tư'),
    }),
  ) as string;

  const receivable = (await one(
    'lập công nợ phải thu',
    ketoan
      .from('receivables_payables')
      .insert({
        company_id: nvc,
        direction: 'phai_thu',
        party_type: 'khach_hang',
        customer_id: customer.id,
        contract_id: contractId,
        description: clean('Thanh toán đợt 1 theo biên bản nghiệm thu phần móng'),
        amount: '1300000000',
        due_date: day(10),
      })
      .select('id')
      .single(),
  )) as { id: string };
  check(
    'thu tiền đợt 1',
    await ketoan.rpc('record_receivable_settlement', {
      p_receivable_id: receivable.id,
      p_settled_date: day(-1),
      p_amount: 800_000_000,
      p_method: 'chuyen_khoan',
      p_reference: 'UNC-HT-0927',
    }),
  );
  void acceptanceId;

  // --- Thanh toán tổ đội (KT-01, KT-02) -----------------------------------------------------
  const crew = (await one(
    'lập tổ đội thầu phụ',
    muaHang
      .from('suppliers')
      .insert({
        name: clean('Công ty TNHH Xây dựng Hùng Cường'),
        category: 'Nhân công xây dựng, cốp pha',
        supplier_class: 'chinh',
      })
      .select('id')
      .single(),
  )) as { id: string };

  async function draftPayment(title: string, amount: number): Promise<string> {
    const row = (await one(
      `lập đề nghị chi «${title}»`,
      ketoan
        .from('payment_requests')
        .insert({
          company_id: nvc,
          request_type: 'thanh_toan',
          title: clean(title),
          amount: String(amount),
          origin_module: 'TC',
          department: 'Ban công trường',
          supplier_id: crew.id,
          due_date: day(5),
        })
        .select('id')
        .single(),
    )) as { id: string };
    check(
      'phân bổ chi phí',
      await ketoan.from('payment_request_allocations').insert({
        payment_request_id: row.id,
        construction_site_id: siteId,
        cost_code: nhanCong!.cost_code,
        cost_group: 'nhan_cong',
        amount: String(amount),
      }),
    );
    check('gửi đề nghị chi', await ketoan.rpc('submit_payment_request', { p_request_id: row.id }));
    check(
      'công trường xác nhận khối lượng',
      await chiHuy.rpc('advance_payment_step', { p_request_id: row.id, p_decision: 'approved' }),
    );
    check(
      'kế toán kiểm chứng từ',
      await ketoan.rpc('advance_payment_step', { p_request_id: row.id, p_decision: 'approved' }),
    );
    return row.id;
  }

  const pay1 = await draftPayment('Thanh toán đợt 1 tổ đội Hùng Cường — phần móng', 420_000_000);
  check(
    'CFO kiểm',
    await cfo.rpc('advance_payment_step', { p_request_id: pay1, p_decision: 'approved' }),
  );
  // 420 triệu vượt hạn mức chi của Giám đốc Tài chính (200 triệu) — Tổng Giám đốc duyệt.
  await approveBy(
    tgd,
    await pendingApproval(tgd, 'payment_requests', pay1),
    'Đủ chứng từ, dòng tiền tuần này đáp ứng.',
    'duyệt chi',
  );
  check(
    'ghi nhận đã chi',
    await ketoan.rpc('record_payment', {
      p_request_id: pay1,
      p_paid_date: day(-1),
      p_method: 'chuyen_khoan',
      p_reference: 'UNC-HC-0928',
    }),
  );

  // Đợt 2 dừng ở bước Giám đốc Tài chính — có việc thật trong Hộp thư Phê duyệt khi demo.
  await draftPayment('Tạm ứng đợt 2 tổ đội Hùng Cường — giằng móng', 180_000_000);

  return 'created';
}
