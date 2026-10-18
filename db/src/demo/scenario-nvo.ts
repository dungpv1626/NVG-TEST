/**
 * Kịch bản NVO — một hồ sơ thiết kế nhà phố đi hết quy trình của phòng Thiết kế (08/10/2026, Haan:
 * làm tài liệu hướng dẫn phòng thiết kế trên bản demo).
 *
 * Chuỗi lệnh chép từ `__tests__/golden-path.test.ts` (GP2) và `tk-tc-lam-ro.test.ts`: cùng hàm
 * nghiệp vụ, cùng vai trò. Dừng ở trạng thái đáng xem khi hướng dẫn:
 *
 *  · đầu bài đã xác nhận (qua Worker, đúng nút «Xác nhận đầu bài»), một biên bản khảo sát;
 *  · hai vòng phương án: bản 1 khách góp ý, bản 2 khách duyệt → mở Hồ sơ kỹ thuật;
 *  · ba bộ môn xong, bản vẽ đã phát hành; dự toán đã duyệt; hợp đồng soạn từ hồ sơ;
 *  · đã bàn giao thi công → công trình; chỉ huy trưởng được điều động sang NVO và phân công;
 *  · ba yêu cầu làm rõ: một đã trả lời, một dẫn tới yêu cầu thay đổi đã thực hiện bằng bản điện
 *    nước điều chỉnh sau bàn giao, một còn chờ trả lời.
 */

import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DB_TARGET } from '../env';
import { ACCOUNTS, check, companyId, day, nextCode, one, signIn, userId } from './client';
import { clean } from './names';

export const NVO_CUSTOMER = clean('Anh Nguyễn Văn Tâm');
export const NVO_OPPORTUNITY = clean('Nhà phố 4 tầng 5 × 18 m — ngõ 75 Tân Mai, Hoàng Mai');
const SITE_ADDRESS = clean('Số 12, ngõ 75 Tân Mai, Hoàng Mai, Hà Nội');
const ADMIN = 'admin@nhavietgroup.test';
/** Bộ trả lời đầu bài có cấu trúc — nhà ống 5 × 18 m, gia đình ba thế hệ (tệp đi kèm). */
const brief: unknown = JSON.parse(
  readFileSync(new URL('./nvo-dau-bai.json', import.meta.url), 'utf8'),
);
const KET_CAU = 'ketcau.nvo@nhavietgroup.test';

/** Địa chỉ Worker «nvg-api» của đích đang nạp — xác nhận đầu bài đi qua Worker. */
function designApiUrl(): string {
  return (
    process.env.DESIGN_API_URL ??
    (DB_TARGET === 'demo' ? 'https://nvg-api.automkt.workers.dev' : 'http://localhost:8788')
  );
}

async function confirmBrief(client: SupabaseClient, briefId: string): Promise<void> {
  const { data } = await client.auth.getSession();
  const response = await fetch(`${designApiUrl()}/design/brief/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ briefId }),
  });
  if (!response.ok) {
    throw new Error(`xác nhận đầu bài: ${response.status} ${await response.text()}`);
  }
}

export async function loadNvo(): Promise<'created' | 'skipped'> {
  const kinhDoanh = await signIn(ACCOUNTS.kinhDoanhNvo);
  const existing = await kinhDoanh
    .from('opportunities')
    .select('id')
    .eq('name', NVO_OPPORTUNITY)
    .maybeSingle();
  if (existing.data) return 'skipped';

  const thietKe = await signIn(ACCOUNTS.thietKeNvo);
  const ketCau = await signIn(KET_CAU);
  const tgd = await signIn(ACCOUNTS.tgd);
  const admin = await signIn(ADMIN);
  const chiHuy = await signIn(ACCOUNTS.chiHuyTruong);

  const nvo = await companyId(kinhDoanh, 'NVO');
  const thietKeId = await userId(thietKe);
  const ketCauId = await userId(ketCau);
  const chiHuyId = await userId(chiHuy);

  // --- Khách hàng và cơ hội (Kinh doanh) -------------------------------------------------------
  const customer = (await one(
    'lập khách hàng',
    kinhDoanh
      .from('customers')
      .insert({
        name: NVO_CUSTOMER,
        source: 'Khách cũ giới thiệu',
        contact_person: NVO_CUSTOMER,
        phone: '0983 215 647',
        address: SITE_ADDRESS,
        needs: clean(
          'Xây mới nhà phố 4 tầng cho gia đình ba thế hệ, thiết kế và thi công trọn gói',
        ),
      })
      .select('id')
      .single(),
  )) as { id: string };

  const opportunity = (await one(
    'lập cơ hội',
    kinhDoanh
      .from('opportunities')
      .insert({
        code: await nextCode(kinhDoanh, 'NVO', 'CH'),
        company_id: nvo,
        customer_id: customer.id,
        name: NVO_OPPORTUNITY,
        owner_id: await userId(kinhDoanh),
        estimated_value: 3_200_000_000,
      })
      .select('id')
      .single(),
  )) as { id: string };

  // --- Hồ sơ thiết kế (TK-01) ------------------------------------------------------------------
  const project = (await one(
    'lập hồ sơ thiết kế',
    thietKe
      .from('design_projects')
      .insert({
        code: await nextCode(thietKe, 'NVO', 'TK'),
        company_id: nvo,
        opportunity_id: opportunity.id,
        customer_id: customer.id,
        name: NVO_OPPORTUNITY,
        responsible_user_id: thietKeId,
        site_address: SITE_ADDRESS,
        handover_deadline: day(21),
      })
      .select('id')
      .single(),
  )) as { id: string };

  // --- Khảo sát hiện trạng (TK-02) -------------------------------------------------------------
  const survey = (await one(
    'ghi biên bản khảo sát',
    thietKe
      .from('design_surveys')
      .insert({
        design_project_id: project.id,
        company_id: nvo,
        surveyed_by: thietKeId,
        surveyed_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
        land_width: 5,
        land_depth: 18,
        land_area: 90,
        orientation: 'Đông Nam',
        measurement_notes: clean(
          'Đo thực tế: mặt tiền 5,02 m, mặt hậu 4,98 m, sâu 18,05 m — lấy tròn 5 × 18 m. Nền hiện trạng cao hơn mặt ngõ 15 cm.',
        ),
        surrounding_notes: clean(
          'Trái: nhà 4 tầng xây sát ranh, tường riêng. Phải: nhà 3 tầng, tường riêng. Sau: nhà 2 tầng, sát ranh. Ngõ trước rộng 6 m, ô tô vào được.',
        ),
        usage_notes: clean(
          'Nhà cũ cấp 4 sẽ phá dỡ. Gia đình 5 người, ba thế hệ; bà nội 70 tuổi ngại leo nhiều tầng.',
        ),
      })
      .select('id')
      .single(),
  )) as { id: string };

  // --- Đầu bài (TK-01, TK-10) — lưu rồi xác nhận qua Worker ------------------------------------
  const briefRow = (await one(
    'lưu đầu bài',
    thietKe
      .from('design_briefs')
      .insert({
        design_project_id: project.id,
        company_id: nvo,
        design_task: clean(
          'Thiết kế nhà ống 4 tầng trên lô 5 × 18 m ở Hoàng Mai, Hà Nội cho gia đình ba thế hệ (5 người); để được 1 ô tô và 2 xe máy trong nhà.',
        ),
        functional_needs: clean(
          'Tầng 1 để ô tô ngay mặt tiền, phòng khách nhỏ phía sau gara, bếp và bàn ăn ở cuối nhà gần giếng trời. Phòng bà nội ở tầng 2, có WC riêng. Bố mẹ và con trai tầng 3, con gái và phòng thờ tầng 4, sân thượng phía sau để phơi đồ và trồng cây.',
        ),
        style_note: clean(
          'Hiện đại, mặt tiền đơn giản, nhiều kính có lam che nắng hướng Đông Nam.',
        ),
        site_condition: clean('Lô chữ nhật 5 × 18 m, ba mặt giáp nhà hàng xóm, mặt tiền ngõ 6 m.'),
        legal_documents: clean('Có sổ đỏ; xin phép xây dựng theo quy định Hà Nội.'),
        structured: brief,
        site_source_survey_id: survey.id,
      })
      .select('id')
      .single(),
  )) as { id: string };
  await confirmBrief(thietKe, briefRow.id);

  check(
    'bắt đầu dựng phương án',
    await thietKe.rpc('move_design_stage', {
      p_design_project_id: project.id,
      p_stage: 'phuong_an',
    }),
  );

  // --- Bản vẽ: một hồ sơ tài liệu cho mỗi bộ môn, mỗi lần phát hành một phiên bản ---------------
  const documents = new Map<string, string>();
  async function drawing(input: {
    discipline: 'phuong_an' | 'kien_truc' | 'ket_cau' | 'dien_nuoc';
    title: string;
    fileName: string;
    changeReason?: string;
    changeRequestId?: string;
    publish?: boolean;
  }): Promise<string> {
    let documentId = documents.get(input.discipline);
    if (!documentId) {
      const doc = (await one(
        `lập hồ sơ bản vẽ ${input.discipline}`,
        thietKe
          .from('documents')
          .insert({
            company_id: nvo,
            title: clean(input.title),
            category: `ban_ve_${input.discipline}`,
            related_entity_type: 'design_projects',
            related_entity_id: project.id,
          })
          .select('id')
          .single(),
      )) as { id: string };
      documentId = doc.id;
      documents.set(input.discipline, documentId);
    }
    const documentVersionId = check(
      `nạp tệp ${input.fileName}`,
      await thietKe.rpc('publish_document_version', {
        p_document_id: documentId,
        p_file_url: `thiet-ke/${project.id}/${input.fileName}`,
        p_file_name: input.fileName,
        p_change_reason: input.changeReason ?? 'Bản đầu tiên',
      }),
    );
    const version = (await one(
      `lập phiên bản ${input.title}`,
      thietKe
        .from('design_versions')
        .insert({
          company_id: nvo,
          design_project_id: project.id,
          discipline: input.discipline,
          title: clean(input.title),
          document_id: documentId,
          document_version_id: documentVersionId,
          change_reason: input.changeReason ? clean(input.changeReason) : null,
          change_request_id: input.changeRequestId ?? null,
        })
        .select('id')
        .single(),
    )) as { id: string };
    if (input.publish !== false) {
      check(
        `phát hành ${input.title}`,
        await thietKe.rpc('publish_design_version', { p_version_id: version.id }),
      );
    }
    return version.id;
  }

  // --- Phương án và trình khách (TK-03): bản 1 góp ý, bản 2 duyệt -------------------------------
  const optionA = await drawing({
    discipline: 'phuong_an',
    title: 'Phương án kiến trúc — mặt bằng 4 tầng, mặt đứng, phối cảnh',
    fileName: 'PA-01.pdf',
  });
  check(
    'gửi khách duyệt phương án',
    await thietKe.rpc('move_design_stage', {
      p_design_project_id: project.id,
      p_stage: 'cho_khach_duyet',
    }),
  );
  check(
    'ghi góp ý của khách',
    await thietKe.rpc('record_design_review', {
      p_version_id: optionA,
      p_reviewer_type: 'khach_hang',
      p_decision: 'gop_y',
      p_comments: clean(
        'Muốn phòng bà nội rộng hơn và có cửa sổ ra giếng trời; mặt tiền bớt kính tầng 2.',
      ),
      p_reviewer_name: NVO_CUSTOMER,
    }),
  );
  const optionB = await drawing({
    discipline: 'phuong_an',
    title: 'Phương án kiến trúc — điều chỉnh theo góp ý',
    fileName: 'PA-02.pdf',
    changeReason:
      'Mở rộng phòng bà nội 1,2 m², thêm cửa sổ ra giếng trời; giảm kính mặt tiền tầng 2',
  });
  check(
    'khách duyệt phương án',
    await thietKe.rpc('record_design_review', {
      p_version_id: optionB,
      p_reviewer_type: 'khach_hang',
      p_decision: 'duyet',
      p_comments: clean('Đồng ý mặt bằng và mặt đứng bản 2.'),
      p_reviewer_name: NVO_CUSTOMER,
    }),
  );

  // --- Hồ sơ kỹ thuật ba bộ môn (TK-04, TK-05) -------------------------------------------------
  const tasks: {
    discipline: 'kien_truc' | 'ket_cau' | 'dien_nuoc';
    who: SupabaseClient;
    id: string;
    file: string;
    title: string;
  }[] = [
    {
      discipline: 'kien_truc',
      who: thietKe,
      id: thietKeId,
      file: 'KT-01.pdf',
      title: 'Hồ sơ kiến trúc thi công',
    },
    {
      discipline: 'ket_cau',
      who: ketCau,
      id: ketCauId,
      file: 'KC-01.pdf',
      title: 'Hồ sơ kết cấu thi công',
    },
    {
      discipline: 'dien_nuoc',
      who: thietKe,
      id: thietKeId,
      file: 'DN-01.pdf',
      title: 'Hồ sơ điện nước thi công',
    },
  ];
  for (const task of tasks) {
    check(
      `phân công bộ môn ${task.discipline}`,
      await thietKe.from('design_discipline_tasks').insert({
        company_id: nvo,
        design_project_id: project.id,
        discipline: task.discipline,
        assignee_id: task.id,
        status: 'hoan_thanh',
        progress_percent: 100,
        start_date: day(-4),
        due_date: day(10),
      }),
    );
    await drawing({ discipline: task.discipline, title: task.title, fileName: task.file });
  }

  // --- Dự toán (TK-07) và hợp đồng ------------------------------------------------------------
  check(
    'chuyển sang lập dự toán',
    await thietKe.rpc('move_design_stage', { p_design_project_id: project.id, p_stage: 'du_toan' }),
  );
  const estimate = (await one(
    'lập dự toán',
    thietKe
      .from('estimates')
      .insert({
        code: await nextCode(thietKe, 'NVO', 'DT'),
        company_id: nvo,
        design_project_id: project.id,
        bid_price: 3_050_000_000,
        basis_notes: clean('Suất đầu tư nhà phố 4 tầng hoàn thiện khá, 330 m² sàn'),
        prepared_by: thietKeId,
      })
      .select('id')
      .single(),
  )) as { id: string };
  check(
    'ghi cơ cấu giá',
    await thietKe.rpc('save_estimate_costs', {
      p_estimate_id: estimate.id,
      p_direct_cost: 2_250_000_000,
      p_overhead_cost: 280_000_000,
      p_contingency_cost: 120_000_000,
      p_finance_cost: 0,
      p_tax_amount: 0,
      p_profit_amount: 400_000_000,
      p_profit_margin_percent: 13,
    }),
  );
  const approvalId = check(
    'gửi duyệt dự toán',
    await thietKe.rpc('request_estimate_approval', { p_estimate_id: estimate.id }),
  );
  check(
    'Tổng Giám đốc duyệt dự toán',
    await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: clean('Duyệt theo suất đầu tư đã thống nhất với khách.'),
    }),
  );
  const contractId = check(
    'soạn hợp đồng',
    await thietKe.rpc('create_contract_from_source', {
      p_source_type: 'design_projects',
      p_source_id: project.id,
      p_type: 'thiet_ke',
      p_title: clean('Hợp đồng thiết kế và thi công trọn gói nhà phố Tân Mai'),
    }),
  ) as string;

  // Ký hợp đồng TRƯỚC khi bàn giao thi công: bàn giao gắn công trình vào hợp đồng đã ký (0158);
  // chưa ký thì công trình chạy không hợp đồng và báo cáo lãi/lỗ không đối soát được.
  const nvoId = (await one(
    'tìm pháp nhân NVO',
    thietKe.from('design_projects').select('company_id').eq('id', project.id).single(),
  )) as { company_id: string };
  for (const [termType, description] of [
    ['pham_vi', 'Thiết kế kiến trúc, kết cấu, điện nước và thi công trọn gói nhà phố 4 tầng'],
    ['gia_tri', 'Giá trị theo dự toán đã duyệt, chưa gồm thuế giá trị gia tăng'],
    [
      'tien_do_thanh_toan',
      'Tạm ứng 30%; thanh toán theo từng đợt nghiệm thu phần thô và hoàn thiện',
    ],
  ] as const) {
    check(
      `điều khoản ${termType}`,
      await thietKe.from('contract_terms').insert({
        company_id: nvoId.company_id,
        contract_id: contractId,
        term_type: termType,
        description: clean(description),
      }),
    );
  }
  const contractApproval = check(
    'trình ký hợp đồng',
    await thietKe.rpc('submit_contract_approval', { p_contract_id: contractId }),
  ) as string;
  check(
    'Tổng Giám đốc duyệt hợp đồng',
    await tgd.rpc('decide_approval', {
      p_approval_id: contractApproval,
      p_decision: 'approved',
      p_note: clean('Đồng ý ký.'),
    }),
  );
  check(
    'ghi nhận đã ký',
    await tgd.rpc('sign_contract', {
      p_contract_id: contractId,
      p_contract_number: '15/2026/HĐTK-TC/NVO',
      p_signed_date: day(-2),
    }),
  );

  // --- Bàn giao thi công (TK-08) → công trình ---------------------------------------------------
  check(
    'bàn giao thi công',
    await thietKe.rpc('handover_design_to_construction', { p_design_project_id: project.id }),
  );
  const site = (await one(
    'tìm công trình vừa mở',
    thietKe.from('design_projects').select('construction_site_id').eq('id', project.id).single(),
  )) as { construction_site_id: string };
  const siteId = site.construction_site_id;

  // Quản trị viên điều động chỉ huy trưởng sang NVO và phân công vào công trình — NVO chưa có tài
  // khoản công trường nào trong bộ tài khoản seed.
  const chtRole = (await one(
    'tìm vai trò CHT',
    admin.from('roles').select('id').eq('code', 'CHT').single(),
  )) as { id: string };
  const already = await admin
    .from('user_companies')
    .select('id')
    .eq('user_id', chiHuyId)
    .eq('company_id', nvo)
    .is('deleted_at', null)
    .maybeSingle();
  if (!already.data) {
    check(
      'điều động chỉ huy trưởng sang NVO',
      await admin.from('user_companies').insert({
        user_id: chiHuyId,
        company_id: nvo,
        role_id: chtRole.id,
        is_primary: false,
      }),
    );
  }
  check(
    'phân công chỉ huy trưởng vào công trình',
    await admin
      .from('user_site_assignments')
      .insert({ user_id: chiHuyId, construction_site_id: siteId, assigned_from: day(-1) }),
  );

  // --- Yêu cầu làm rõ (TK-08, TC-15) và bản điều chỉnh sau bàn giao -----------------------------
  async function rfi(input: {
    title: string;
    question: string;
    location: string;
    measurements?: string;
    dueInDays: number;
  }) {
    return (await one(
      `gửi yêu cầu làm rõ «${input.title}»`,
      chiHuy
        .from('rfis')
        .insert({
          construction_site_id: siteId,
          title: clean(input.title),
          question: clean(input.question),
          location: clean(input.location),
          measurements: input.measurements ? clean(input.measurements) : null,
          route: 'thiet_ke',
          due_date: day(input.dueInDays),
        })
        .select('id')
        .single(),
    )) as { id: string };
  }

  const rfiLevel = await rfi({
    title: 'Cốt sàn tầng 1 so với mặt ngõ',
    question:
      'Bản kiến trúc ghi cốt ±0,00 cao hơn mặt ngõ 45 cm, mặt cắt ghi 40 cm. Thi công theo số nào? Bậc tam cấp mấy bậc?',
    location: 'Tầng 1, mặt tiền',
    measurements: 'Mặt ngõ hiện trạng thấp hơn nền cũ 15 cm',
    dueInDays: 1,
  });
  check(
    'trả lời yêu cầu làm rõ cốt sàn',
    await thietKe.rpc('answer_rfi', {
      p_rfi_id: rfiLevel.id,
      p_answer: clean(
        'Lấy +0,45 m so với mặt ngõ như bản kiến trúc; mặt cắt ghi nhầm. Bậc tam cấp 3 bậc, mỗi bậc 15 cm.',
      ),
    }),
  );

  const rfiShaft = await rfi({
    title: 'Hộp kỹ thuật tầng 3 vướng dầm D3',
    question:
      'Hộp kỹ thuật cạnh WC tầng 3 trùng vị trí dầm D3 trục 2. Dời hộp sang trái được không?',
    location: 'Tầng 3, trục 2',
    measurements: 'Dầm D3 rộng 220 mm, mép hộp kỹ thuật chồng lên dầm 180 mm',
    dueInDays: 2,
  });
  check(
    'trả lời yêu cầu làm rõ hộp kỹ thuật',
    await thietKe.rpc('answer_rfi', {
      p_rfi_id: rfiShaft.id,
      p_answer: clean(
        'Dời hộp kỹ thuật sang trái 300 mm. Bản điện nước điều chỉnh phát hành theo yêu cầu thay đổi, chờ bản mới rồi thi công phần ống đứng.',
      ),
    }),
  );
  const changeRequest = (await one(
    'ghi yêu cầu thay đổi',
    thietKe
      .from('change_requests')
      .insert({
        design_project_id: project.id,
        company_id: nvo,
        title: clean('Dời hộp kỹ thuật tầng 3 sang trái 300 mm'),
        origin: 'cong_truong',
        requester_name: clean('Chỉ huy trưởng công trình'),
        content: clean('Dời hộp kỹ thuật cạnh WC tầng 3 sang trái 300 mm để tránh dầm D3 trục 2.'),
        reason: clean('Xung đột kết cấu phát hiện tại công trường'),
        schedule_impact_days: 1,
        cost_impact: 0,
        affected_drawing_count: 2,
      })
      .select('id')
      .single(),
  )) as { id: string };
  check(
    'chấp thuận yêu cầu thay đổi',
    await thietKe
      .from('change_requests')
      .update({
        status: 'chap_thuan',
        decided_at: new Date().toISOString(),
        decided_by: thietKeId,
      })
      .eq('id', changeRequest.id),
  );
  await drawing({
    discipline: 'dien_nuoc',
    title: 'Hồ sơ điện nước thi công — điều chỉnh hộp kỹ thuật tầng 3',
    fileName: 'DN-02.pdf',
    changeReason: 'Dời hộp kỹ thuật tầng 3 sang trái 300 mm tránh dầm D3',
    changeRequestId: changeRequest.id,
  });

  await rfi({
    title: 'Chiều cao lan can sân thượng',
    question:
      'Bản kiến trúc ghi lan can sân thượng cao 1,1 m tính từ mặt sàn hoàn thiện hay từ mặt sàn bê tông?',
    location: 'Sân thượng, tầng 4',
    dueInDays: 3,
  });

  return 'created';
}
