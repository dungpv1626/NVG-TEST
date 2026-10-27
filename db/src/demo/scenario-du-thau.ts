/**
 * Bộ hồ sơ dự thầu DEMO của NVC — câu 19 (anh Dũng 27/10/2026: «đề xuất một bộ hồ sơ dự thầu demo, sau sẽ thay đổi,
 * nhưng phải chi tiết để NVG nắm được quy trình chuẩn»).
 *
 * Một gói thầu đi ĐỦ các bước của quy trình chuẩn (doc/QUY_TRINH_DU_THAU.md), dừng ở «Đã nộp thầu — chờ kết quả» để
 * xem lại từng bước trên màn hình:
 *   1. Tiếp nhận hồ sơ mời thầu — thông tin gói, hạn nộp, bảo đảm dự thầu, hình thức.
 *   2. Làm rõ hồ sơ mời thầu — câu hỏi NVG gửi chủ đầu tư, văn bản làm rõ của chủ đầu tư, gia hạn nộp thầu.
 *   3. Khảo sát hiện trạng — điều kiện thi công, rủi ro.
 *   4. Bóc tách khối lượng — 24 dòng theo hạng mục, đối chiếu BOQ của chủ đầu tư.
 *   5. Lập dự toán và giá dự thầu — chi phí theo nhóm, cơ cấu giá, Tổng Giám đốc duyệt giá.
 *   6. Hồ sơ năng lực — giấy tờ pháp lý, chứng chỉ, báo cáo tài chính 3 năm, thiết bị — gắn vào gói.
 *   7. Bảo lãnh dự thầu — 1 % giá gói thầu, hiệu lực quá hạn nộp ≥ 30 ngày.
 *   8. Danh mục hồ sơ dự thầu theo nhóm (pháp lý, năng lực, kinh nghiệm, nhân sự, thiết bị, biện pháp, tiến độ, an
 *      toàn, giá) — đánh dấu hoàn thành rồi nộp.
 * Tên công ty, số liệu là ví dụ — NVG thay bằng hồ sơ thật khi có. Ghi qua đúng hàm nghiệp vụ, đúng tài khoản vai trò.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, check, companyId, day, nextCode, one, signIn, userId } from './client';
import { clean } from './names';

export const BID_DEMO_CUSTOMER = clean('Công ty TNHH Điện tử Thành Công Việt Nam');
export const BID_DEMO_PROJECT = clean(
  'Gói thầu số 03: Thi công xây dựng nhà xưởng sản xuất số 2 — KCN Thăng Long II',
);

/** Giấy tờ năng lực demo (gỡ theo tên bằng `--remove`). */
export const BID_DEMO_CAPABILITY_TITLES = [
  clean('Giấy chứng nhận đăng ký doanh nghiệp — thay đổi lần 5'),
  clean('Chứng chỉ năng lực hoạt động xây dựng hạng II — thi công công trình công nghiệp'),
  clean('Chứng nhận hệ thống quản lý chất lượng ISO 9001:2015'),
  clean('Báo cáo tài chính đã kiểm toán năm 2023'),
  clean('Báo cáo tài chính đã kiểm toán năm 2024'),
  clean('Báo cáo tài chính đã kiểm toán năm 2025'),
  clean('Giấy chứng nhận kiểm định cần trục bánh lốp 25 tấn'),
] as const;

const CAPABILITY: {
  title: string;
  category: string;
  issuer: string;
  years: number;
  fiscal?: number;
}[] = [
  {
    title: BID_DEMO_CAPABILITY_TITLES[0],
    category: 'phap_ly',
    issuer: 'Sở Tài chính tỉnh Hưng Yên',
    years: 0,
  },
  {
    title: BID_DEMO_CAPABILITY_TITLES[1],
    category: 'chung_chi',
    issuer: 'Sở Xây dựng tỉnh Hưng Yên',
    years: 5,
  },
  {
    title: BID_DEMO_CAPABILITY_TITLES[2],
    category: 'chung_chi',
    issuer: 'Tổ chức chứng nhận (ví dụ)',
    years: 3,
  },
  {
    title: BID_DEMO_CAPABILITY_TITLES[3],
    category: 'bao_cao_tai_chinh',
    issuer: 'Công ty kiểm toán (ví dụ)',
    years: 0,
    fiscal: 2023,
  },
  {
    title: BID_DEMO_CAPABILITY_TITLES[4],
    category: 'bao_cao_tai_chinh',
    issuer: 'Công ty kiểm toán (ví dụ)',
    years: 0,
    fiscal: 2024,
  },
  {
    title: BID_DEMO_CAPABILITY_TITLES[5],
    category: 'bao_cao_tai_chinh',
    issuer: 'Công ty kiểm toán (ví dụ)',
    years: 0,
    fiscal: 2025,
  },
  {
    title: BID_DEMO_CAPABILITY_TITLES[6],
    category: 'thiet_bi',
    issuer: 'Trung tâm kiểm định (ví dụ)',
    years: 1,
  },
];

/** Bóc tách khối lượng theo hạng mục — đơn vị và khối lượng hợp lý cho nhà xưởng 3.600 m² khung thép. */
const BOQ: [string, string, number][] = [
  ['A. Phần móng — Đào đất hố móng bằng máy', 'm3', 1_850],
  ['A. Phần móng — Cọc bê tông ly tâm D400, dài 18 m', 'm', 6_480],
  ['A. Phần móng — Bê tông lót móng M100', 'm3', 64],
  ['A. Phần móng — Bê tông đài, giằng móng M300', 'm3', 610],
  ['A. Phần móng — Cốt thép đài, giằng móng', 'tấn', 58.5],
  ['A. Phần móng — Bu lông neo chân cột M30 kèm dưỡng', 'bộ', 96],
  ['B. San nền, hạ tầng — Đắp cát nền, lu lèn K95', 'm3', 2_900],
  ['B. San nền, hạ tầng — Cống thoát nước D600', 'm', 380],
  ['B. San nền, hạ tầng — Hố ga thu nước', 'cái', 24],
  ['C. Kết cấu thép — Gia công cột, kèo thép tổ hợp', 'tấn', 168],
  ['C. Kết cấu thép — Xà gồ thép mạ kẽm Z200', 'tấn', 41],
  ['C. Kết cấu thép — Giằng mái, giằng cột', 'tấn', 9.6],
  ['C. Kết cấu thép — Sơn chống gỉ và sơn phủ', 'm2', 7_400],
  ['C. Kết cấu thép — Lắp dựng kết cấu thép', 'tấn', 218.6],
  ['D. Mái, bao che — Tôn mái 0,47 mm kèm bông thuỷ tinh', 'm2', 3_950],
  ['D. Mái, bao che — Tôn vách 0,45 mm', 'm2', 2_150],
  ['D. Mái, bao che — Máng xối inox, ống thoát D110', 'm', 260],
  ['D. Mái, bao che — Tường xây chân vách cao 1,2 m', 'm3', 96],
  ['D. Mái, bao che — Cửa cuốn công nghiệp 5 x 5 m', 'bộ', 6],
  ['E. Nền xưởng — Bê tông nền M300 dày 200 mm', 'm3', 720],
  ['E. Nền xưởng — Lưới thép nền D10a200 hai lớp', 'tấn', 54],
  ['E. Nền xưởng — Phủ sàn hardener', 'm2', 3_600],
  ['F. Cơ điện — Hệ thống chống sét, tiếp địa', 'trọn gói', 1],
  ['F. Cơ điện — Điện chiếu sáng nhà xưởng', 'trọn gói', 1],
];

/** Danh mục hồ sơ dự thầu theo nhóm — mỗi đầu mục là một việc phải xong trước khi nộp. */
const BID_DOCS: [string, string, boolean][] = [
  [
    'phap_ly',
    'Đơn dự thầu (đúng hình thức hồ sơ mời thầu quy định), có chữ ký người đại diện, đóng dấu',
    true,
  ],
  [
    'phap_ly',
    'Giấy ủy quyền ký hồ sơ dự thầu (nếu người ký không phải đại diện theo pháp luật)',
    false,
  ],
  ['phap_ly', 'Thỏa thuận liên danh (nếu dự thầu liên danh)', false],
  ['phap_ly', 'Bảo lãnh dự thầu bản gốc', true],
  ['nang_luc', 'Giấy chứng nhận đăng ký doanh nghiệp, chứng chỉ năng lực hoạt động xây dựng', true],
  ['nang_luc', 'Báo cáo tài chính đã kiểm toán 3 năm gần nhất, xác nhận không nợ thuế', true],
  ['kinh_nghiem', 'Kê khai hợp đồng tương tự kèm biên bản nghiệm thu, thanh lý', true],
  [
    'nhan_su',
    'Danh sách nhân sự chủ chốt: chỉ huy trưởng, kỹ sư kết cấu, kỹ sư điện, cán bộ an toàn — kèm bằng cấp, chứng chỉ',
    true,
  ],
  ['thiet_bi', 'Danh sách máy móc thiết bị chủ yếu kèm giấy tờ sở hữu / thuê và kiểm định', true],
  [
    'bien_phap_thi_cong',
    'Thuyết minh biện pháp thi công: móng, lắp dựng kết cấu thép, mái, nền xưởng',
    true,
  ],
  ['bien_phap_thi_cong', 'Bản vẽ biện pháp: tổng mặt bằng thi công, sơ đồ cẩu lắp', true],
  ['tien_do', 'Tiến độ thi công tổng thể (biểu đồ ngang) và biểu đồ nhân lực', true],
  ['an_toan', 'Biện pháp an toàn lao động, phòng chống cháy nổ, vệ sinh môi trường', true],
  ['bang_gia', 'Bảng tổng hợp giá dự thầu và bảng chi tiết đơn giá theo BOQ', true],
  ['bang_gia', 'Thư giảm giá (nếu có) — để riêng trong túi hồ sơ tài chính', false],
  ['bang_gia', 'Bảng phân tích đơn giá các công việc chính', true],
];

async function approve(
  approver: SupabaseClient,
  entityType: string,
  entityId: string,
  note: string,
) {
  const row = (await one(
    `tìm phê duyệt của ${entityType}`,
    approver
      .from('approvals')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'pending_approval')
      .single(),
  )) as { id: string };
  check(
    'duyệt giá dự thầu',
    await approver.rpc('decide_approval', {
      p_approval_id: row.id,
      p_decision: 'approved',
      p_note: note,
    }),
  );
}

export async function loadBidDemo(): Promise<'created' | 'skipped'> {
  const dauThau = await signIn(ACCOUNTS.dauThauNvc);
  const kinhDoanh = await signIn(ACCOUNTS.kinhDoanhNvc);
  const tgd = await signIn(ACCOUNTS.tgd);
  const nvc = await companyId(dauThau, 'NVC');

  const existing = await dauThau
    .from('bidding_projects')
    .select('id')
    .eq('name', BID_DEMO_PROJECT)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.data) return 'skipped';

  // --- Bước 1: tiếp nhận hồ sơ mời thầu ---------------------------------------------------------------------------
  const customer = (await one(
    'ghi chủ đầu tư',
    kinhDoanh
      .from('customers')
      .insert({
        name: BID_DEMO_CUSTOMER,
        source: 'Mời thầu',
        contact_person: clean('Bà Nguyễn Thu Trang — Trưởng ban quản lý dự án'),
        address: clean('Lô H-4, KCN Thăng Long II, Yên Mỹ, Hưng Yên'),
        needs: clean('Mời thầu thi công nhà xưởng sản xuất số 2, 3.600 m² khung thép'),
      })
      .select('id')
      .single(),
  )) as { id: string };

  const project = (await one(
    'tiếp nhận hồ sơ mời thầu',
    dauThau
      .from('bidding_projects')
      .insert({
        code: await nextCode(dauThau, 'NVC', 'DA'),
        company_id: nvc,
        customer_id: customer.id,
        name: BID_DEMO_PROJECT,
        responsible_user_id: await userId(dauThau),
        estimated_value: 18_500_000_000,
        site_address: clean('Lô H-4, KCN Thăng Long II, Yên Mỹ, Hưng Yên'),
        submission_deadline: day(14),
        clarification_notes: clean(
          'Hồ sơ mời thầu: đấu thầu rộng rãi trong nước, một giai đoạn hai túi hồ sơ (kỹ thuật / tài chính). ' +
            'Hình thức hợp đồng trọn gói. Bảo đảm dự thầu 185.000.000 đồng, hiệu lực 120 ngày. Thời gian thi công ' +
            '180 ngày. Đánh giá kỹ thuật theo thang điểm (đạt ≥ 70/100), sau đó xét giá thấp nhất.',
        ),
        notes: clean(
          'Nhà xưởng khung thép tiền chế 3.600 m², nhịp 36 m, cao 10 m, cầu trục 5 tấn. Bản vẽ thiết kế kỹ thuật và BOQ ' +
            'do chủ đầu tư cung cấp — NVC thi công theo phương án của chủ đầu tư.',
        ),
      })
      .select('id')
      .single(),
  )) as { id: string };

  // --- Bước 2: làm rõ hồ sơ mời thầu, gia hạn ------------------------------------------------------------------------
  check(
    'gửi câu hỏi làm rõ',
    await dauThau.from('bid_clarifications').insert([
      {
        company_id: nvc,
        bidding_project_id: project.id,
        round_no: 1,
        direction: 'nvg_hoi',
        question: clean(
          'BOQ mục C1 ghi thép tổ hợp 168 tấn nhưng bản vẽ KC-05 thể hiện thêm vai cột cầu trục — xin làm rõ khối lượng vai cột đã gồm trong 168 tấn chưa.',
        ),
        asked_date: day(-6),
        due_date: day(-2),
        answer: clean(
          'Chủ đầu tư trả lời: đã gồm vai cột cầu trục trong 168 tấn; nhà thầu chào theo BOQ.',
        ),
        answered_date: day(-3),
      },
      {
        company_id: nvc,
        bidding_project_id: project.id,
        round_no: 1,
        direction: 'nvg_hoi',
        question: clean(
          'Nền xưởng yêu cầu tải trọng 3 tấn/m² hay 5 tấn/m²? Thuyết minh và bản vẽ KT-02 ghi khác nhau.',
        ),
        asked_date: day(-6),
        due_date: day(-2),
        answer: clean('Chủ đầu tư trả lời: tải trọng thiết kế 5 tấn/m², theo bản vẽ KT-02.'),
        answered_date: day(-3),
      },
      {
        company_id: nvc,
        bidding_project_id: project.id,
        round_no: 2,
        direction: 'cdt_hoi',
        question: clean(
          'Văn bản sửa đổi hồ sơ mời thầu số 01: bổ sung yêu cầu phủ sàn hardener toàn bộ nền xưởng; gia hạn thời điểm đóng thầu thêm 5 ngày.',
        ),
        asked_date: day(-2),
        answer: clean('NVC đã tiếp nhận, cập nhật BOQ mục E3 và dự toán.'),
        answered_date: day(-1),
      },
    ]),
  );
  check(
    'ghi gia hạn nộp thầu',
    await dauThau.rpc('extend_bid_deadline', {
      p_bidding_project_id: project.id,
      p_new_deadline: day(19),
      p_reason: clean(
        'Văn bản sửa đổi hồ sơ mời thầu số 01 của chủ đầu tư — gia hạn đóng thầu thêm 5 ngày.',
      ),
    }),
  );

  // --- Bước 3: khảo sát hiện trạng (gói thầu tự sang «Khảo sát hiện trạng», 0226) ------------------------------------
  check(
    'ghi kết quả khảo sát',
    await dauThau
      .from('bidding_projects')
      .update({
        survey_notes: clean(
          'Khảo sát ngày ' +
            day(-5).split('-').reverse().join('/') +
            ': mặt bằng đã san lấp, nền yếu phía Bắc (cần cọc theo thiết kế). ' +
            'Đường nội bộ KCN rộng 12 m, xe 30 tấn vào được; điện thi công đấu từ trạm KCN cách 80 m. ' +
            'Rủi ro: mùa mưa tháng 7–8 ảnh hưởng đào móng; nhà xưởng số 1 bên cạnh đang hoạt động — hạn chế giờ cẩu lắp, ' +
            'cần hàng rào tôn cao 2,5 m phía giáp nhà xưởng số 1.',
        ),
      })
      .eq('id', project.id),
  );

  // --- Bước 4: bóc tách khối lượng --------------------------------------------------------------------------------
  check(
    'bóc tách khối lượng',
    await dauThau.from('boq_items').insert(
      BOQ.map(([name, unit, quantity], i) => ({
        company_id: nvc,
        bidding_project_id: project.id,
        position: i + 1,
        name: clean(name),
        unit,
        quantity,
        drawing_ref: name.startsWith('C.')
          ? 'KC-01…KC-08'
          : name.startsWith('A.')
            ? 'KC-M01…M04'
            : null,
      })),
    ),
  );

  // --- Bước 5: dự toán, cơ cấu giá, duyệt giá -----------------------------------------------------------------------
  const estimate = (await one(
    'lập dự toán',
    dauThau
      .from('estimates')
      .insert({
        code: await nextCode(dauThau, 'NVC', 'DT'),
        company_id: nvc,
        bidding_project_id: project.id,
        bid_price: 17_960_000_000,
        basis_notes: clean(
          'Đơn giá vật liệu báo giá nhà cung cấp tháng 10/2026; định mức nội bộ NVC; nhân công theo giá thị trường Hưng Yên. ' +
            'Giá chào trọn gói, đã gồm thuế GTGT 8 %.',
        ),
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
          description: 'Thép kết cấu tổ hợp, xà gồ, giằng',
          unit: 'tấn',
          quantity: 218.6,
          unit_price: 27_800_000,
        },
        {
          cost_group: 'vat_tu',
          description: 'Bê tông thương phẩm M300',
          unit: 'm3',
          quantity: 1_330,
          unit_price: 1_480_000,
        },
        {
          cost_group: 'vat_tu',
          description: 'Cốt thép móng, nền',
          unit: 'tấn',
          quantity: 112.5,
          unit_price: 16_200_000,
        },
        {
          cost_group: 'vat_tu',
          description: 'Cọc ly tâm D400',
          unit: 'm',
          quantity: 6_480,
          unit_price: 265_000,
        },
        {
          cost_group: 'vat_tu',
          description: 'Tôn mái, tôn vách, bông thuỷ tinh',
          unit: 'm2',
          quantity: 6_100,
          unit_price: 215_000,
        },
        {
          cost_group: 'nhan_cong',
          description: 'Nhân công móng, nền, xây',
          unit: 'công',
          quantity: 5_200,
          unit_price: 470_000,
        },
        {
          cost_group: 'nhan_cong',
          description: 'Nhân công gia công, lắp dựng thép',
          unit: 'tấn',
          quantity: 218.6,
          unit_price: 3_900_000,
        },
        {
          cost_group: 'may_moc',
          description: 'Cần trục 25 tấn, máy ép cọc, máy đào',
          unit: 'ca',
          quantity: 210,
          unit_price: 6_200_000,
        },
        {
          cost_group: 'thau_phu',
          description: 'Cơ điện, chống sét (thầu phụ chuyên ngành)',
          unit: 'trọn gói',
          quantity: 1,
          unit_price: 690_000_000,
        },
        {
          cost_group: 'thau_phu',
          description: 'Phủ sàn hardener',
          unit: 'm2',
          quantity: 3_600,
          unit_price: 95_000,
        },
      ],
    }),
  );
  check(
    'ghi cơ cấu giá',
    await dauThau.rpc('save_estimate_costs', {
      p_estimate_id: estimate.id,
      p_direct_cost: 14_120_000_000,
      p_overhead_cost: 920_000_000,
      p_contingency_cost: 420_000_000,
      p_finance_cost: 110_000_000,
      p_tax_amount: 1_330_000_000,
      p_profit_amount: 1_060_000_000,
      p_profit_margin_percent: 6.4,
    }),
  );
  check(
    'gửi duyệt giá',
    await dauThau.rpc('request_estimate_approval', { p_estimate_id: estimate.id }),
  );
  await approve(
    tgd,
    'estimates',
    estimate.id,
    clean(
      'Đồng ý giá 17,96 tỷ. Nếu đối thủ chào thấp, được giảm tối đa 2 % qua thư giảm giá — trình lại trước khi nộp.',
    ),
  );

  // --- Bước 6: hồ sơ năng lực, gắn vào gói ---------------------------------------------------------------------------
  for (const c of CAPABILITY) {
    const doc = (await one(
      `ghi giấy tờ năng lực — ${c.title}`,
      dauThau
        .from('company_documents')
        .insert({
          company_id: nvc,
          category: c.category,
          title: c.title,
          issuer: clean(c.issuer),
          issued_date: c.fiscal ? `${c.fiscal + 1}-03-31` : day(-400),
          expiry_date: c.years > 0 ? day(c.years * 365 - 400) : null,
          fiscal_year: c.fiscal ?? null,
          responsible_user_id: await userId(dauThau),
          notes: clean('Giấy tờ minh hoạ cho quy trình đấu thầu — NVG thay bằng bản thật (câu 19).'),
        })
        .select('id')
        .single(),
    )) as { id: string };
    check(
      'gắn giấy tờ vào gói thầu',
      await dauThau.from('bid_capability_links').insert({
        company_id: nvc,
        bidding_project_id: project.id,
        company_document_id: doc.id,
      }),
    );
  }

  // --- Bước 7: bảo lãnh dự thầu -------------------------------------------------------------------------------------
  check(
    'ghi bảo lãnh dự thầu',
    await dauThau.from('bid_guarantees').insert({
      company_id: nvc,
      bidding_project_id: project.id,
      amount: 185_000_000,
      bank_name: clean('Ngân hàng TMCP (ví dụ) — Chi nhánh Hưng Yên'),
      guarantee_number: clean('BLDT-2026-0310'),
      issued_date: day(-1),
      expiry_date: day(19 + 120),
      notes: clean(
        '1 % giá gói thầu; hiệu lực 120 ngày kể từ thời điểm đóng thầu (đã tính cả gia hạn).',
      ),
    }),
  );

  // --- Bước 8: danh mục hồ sơ dự thầu, hoàn thành rồi nộp ------------------------------------------------------------
  check(
    'lập danh mục hồ sơ dự thầu',
    await dauThau.from('bid_documents').insert(
      BID_DOCS.map(([category, name, isRequired]) => ({
        company_id: nvc,
        bidding_project_id: project.id,
        category,
        name: clean(name),
        is_required: isRequired,
        submitted_at: isRequired ? new Date().toISOString() : null,
      })),
    ),
  );
  check('nộp thầu', await dauThau.rpc('submit_bid', { p_bidding_project_id: project.id }));

  return 'created';
}
