/**
 * Tiện ích cho bộ test RLS.
 *
 * Nguyên tắc: test PHẢI đăng nhập bằng tài khoản thật với anon key, KHÔNG dùng
 * service_role — service_role vượt qua RLS nên test bằng nó không chứng minh được gì.
 */

import '../env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SEED_PASSWORD } from '../seed/data';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

export const hasCredentials = Boolean(url && anonKey);

/** Client chưa đăng nhập — dùng để khẳng định vai trò `anon` không đọc được gì. */
export function anonClient(): SupabaseClient {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Client đã đăng nhập, dùng lại theo email.
 *
 * Supabase Auth giới hạn số lần đăng nhập trong một khoảng thời gian ngắn. Mỗi test gọi
 * `signInAs` một lần mới là chạm trần rất nhanh ("Request rate limit reached") và cả bộ test
 * đỏ vì lý do không liên quan gì tới phân quyền. Phiên đăng nhập không mang trạng thái riêng
 * của từng test nên dùng chung an toàn.
 */
const sessions = new Map<string, Promise<SupabaseClient>>();

/** Đăng nhập bằng tài khoản seed và trả về client đã xác thực. */
export function signInAs(email: string): Promise<SupabaseClient> {
  const existing = sessions.get(email);
  if (existing) return existing;

  const session = (async () => {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });
    if (error) {
      // Xóa khỏi bộ nhớ đệm để lần gọi sau thử lại được, thay vì hỏng vĩnh viễn.
      sessions.delete(email);
      throw new Error(
        `Không đăng nhập được ${email}: ${error.message}. Đã chạy "npm run db:seed" chưa?`,
      );
    }
    return client;
  })();

  sessions.set(email, session);
  return session;
}

/** Email tài khoản seed, gom lại để test không rải chuỗi khắp nơi. */
export const ACCOUNTS = {
  tgd: 'tgd@nhavietgroup.test',
  cfo: 'cfo@nhavietgroup.test',
  admin: 'admin@nhavietgroup.test',
  kinhDoanhNvc: 'kinhdoanh.nvc@nhavietgroup.test',
  kinhDoanhNvo: 'kinhdoanh.nvo@nhavietgroup.test',
  dauThauNvc: 'dauthau.nvc@nhavietgroup.test',
  congTruongNvc: 'congtruong.nvc@nhavietgroup.test',
  /** Vai trò `CHT` — chỉ huy trưởng, chỉ thấy công trình được phân công (mẫu RLS E, 0115). */
  chiHuyTruongNvc: 'chihuytruong.nvc@nhavietgroup.test',
  /** Đợt 2 (2A): Thi công NVO — Trưởng phòng (`TC`) và chỉ huy trưởng (`CHT`). */
  congTruongNvo: 'congtruong.nvo@nhavietgroup.test',
  chiHuyTruongNvo: 'chihuytruong.nvo@nhavietgroup.test',
  thietKeNvo: 'thietke.nvo@nhavietgroup.test',
  ketCauNvo: 'ketcau.nvo@nhavietgroup.test',
  muaHang: 'muahang@nhavietgroup.test',
  kho: 'kho@nhavietgroup.test',
  /** Vai trò `SX` — Xưởng sản xuất – Cho thuê (NVS), thêm 02/09/2026 theo khảo sát Xưởng. */
  xuongNvs: 'sanxuat.nvs@nhavietgroup.test',
  ketoan: 'ketoan@nhavietgroup.test',
  nhanSu: 'nhansu@nhavietgroup.test',
  /** Vai trò `KSNB` — Kiểm soát nội bộ, chỉ xem mọi pháp nhân (0167, 0168). */
  ksnb: 'ksnb@nhavietgroup.test',
} as const;

/**
 * Năm dùng cho mọi kỳ chấm công trong test — NS-04.
 *
 * Kỳ chấm công là duy nhất theo (pháp nhân, năm, tháng, khối) nên test KHÔNG được dùng năm
 * thật: chạy hai lần là đụng kỳ của lần trước, và tệ hơn là đụng kỳ do người dùng tạo trên
 * cơ sở dữ liệu phát triển. Một năm ở xa tương lai vừa tránh va chạm vừa cho phép dọn dẹp
 * bằng đúng một điều kiện `year >= TEST_YEAR`.
 */
export const TEST_TIMESHEET_YEAR = 2090;

/** Bảng nghiệp vụ mà vai trò `anon` KHÔNG BAO GIỜ được đọc. */
export const PROTECTED_TABLES = [
  'companies',
  'users',
  'roles',
  'permissions',
  'user_companies',
  'approval_limits',
  'system_parameters',
  'sla_definitions',
  'user_site_assignments',
  'request_reminders',
  'rfis',
  'acceptance_checklists',
  'acceptance_checklist_results',
  'site_check_ins',
  'rental_returns',
  'rental_return_items',
  'scaffolding_ledger_entries',
] as const;

/** Mã lỗi Postgres cho "insufficient_privilege" — RLS chặn thành công. */
export const PG_INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Đánh dấu báo cáo khảo sát của một cơ hội là ĐÃ DUYỆT, chạy thẳng trên CSDL (không phiên đăng
 * nhập). Từ 0175, sang Báo giá cần báo cáo khảo sát được Ban Giám đốc duyệt; phép thử của các
 * luồng phía sau không kiểm lại bước duyệt đó — `survey-report.test.ts` kiểm riêng.
 */
export async function markSurveyReportApproved(opportunityId: string): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`
      UPDATE site_surveys SET report_status = 'da_duyet', report_decided_at = now()
      WHERE opportunity_id = ${opportunityId} AND deleted_at IS NULL AND surveyed_at IS NOT NULL`;
  } finally {
    await sql.end();
  }
}

/**
 * Lập một văn bản hợp đồng (0176): pháp nhân có mẫu Word đang dùng — từ 0185 cả ba pháp nhân đều
 * có bộ mẫu — thì gửi phê duyệt phải kèm văn bản. Tệp chỉ là đầu ZIP; nội dung không được kiểm.
 */
export async function attachContractDocument(
  client: SupabaseClient,
  contractId: string,
  companyId: string,
): Promise<void> {
  const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const path = `${contractId}/${crypto.randomUUID()}.docx`;
  const up = await client.storage
    .from('contract-documents')
    .upload(path, new Blob([new Uint8Array([80, 75, 3, 4])], { type }), { contentType: type });
  if (up.error) throw new Error(`Không tải được văn bản hợp đồng: ${up.error.message}`);
  const { error } = await client.from('contract_documents').insert({
    contract_id: contractId,
    company_id: companyId,
    storage_path: path,
    file_name: 'hop-dong.docx',
    filled_values: {},
  });
  if (error) throw new Error(`Không lưu được văn bản hợp đồng: ${error.message}`);
}

/**
 * Hợp đồng THI CÔNG ĐÃ KÝ cho một hồ sơ thiết kế, dựng thẳng bằng SQL. Từ 0217 (anh Dũng: «không
 * thi công trước hợp đồng») bàn giao thiết kế sang thi công bị chặn khi chưa có hợp đồng đã ký;
 * từ 0243 hợp đồng THIẾT KẾ đã ký không đủ — phải là hợp đồng thi công / trọn gói.
 */
export async function createSignedBuildContract(
  companyId: string,
  designProjectId: string,
): Promise<string> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage, source_type, source_id, signed_date)
      VALUES (${companyId}, ${'HDTEST-' + crypto.randomUUID().slice(0, 8)},
              ${TEST_PREFIX + ' Hợp đồng thi công đã ký'}, 'thi_cong', 'da_ky', 'design_projects',
              ${designProjectId}, current_date)
      RETURNING id`;
    return row!.id;
  } finally {
    await sql.end();
  }
}

/** Tiền tố đặt cho mọi bản ghi do test tạo ra, để dọn sạch được sau khi chạy. */
export const TEST_PREFIX = '[TEST]';

/**
 * Xóa CỨNG các bản ghi do test tạo ra, qua kết nối trực tiếp (bỏ qua RLS).
 *
 * Cần thiết vì bản thân RLS chặn xóa cứng từ trình duyệt, và một số bản ghi sau khi
 * bàn giao thì chính người tạo cũng không sửa được nữa — nếu chỉ xóa mềm bằng tài khoản
 * thường thì dữ liệu test sẽ tích tụ trong cơ sở dữ liệu phát triển.
 */
export async function cleanupTestData(): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    // `approvals` cố ý không có khóa ngoại tới hồ sơ nguồn (một bảng phục vụ nhiều module),
    // nên xóa cơ hội KHÔNG tự dọn được các dòng phê duyệt — phải xóa tường minh.
    // Tiêu đề được sinh từ tên cơ hội nên vẫn mang tiền tố test.
    // Dùng LIKE '%…%' chứ không phải tiền tố: tiêu đề hồ sơ phê duyệt do CSDL sinh ra có
    // dạng "Giá dự thầu NVC-DA-… — [TEST] …", tiền tố test nằm ở GIỮA chuỗi.
    await sql`DELETE FROM approvals WHERE title LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM complaints WHERE title LIKE ${TEST_PREFIX + '%'}`;
    /*
     * Kế toán: xoá theo đúng chiều phụ thuộc.
     *   `advances` tham chiếu `payment_requests` với ON DELETE RESTRICT (cố ý — một khoản nợ
     *   không được mồ côi khỏi phiếu chi sinh ra nó), nên phải xoá trước.
     *   Xoá `payment_requests` kéo theo dòng phân bổ và lịch sử bước (CASCADE); xoá công nợ
     *   kéo theo chứng từ thu/trả.
     *   Công nợ phải đứng TRƯỚC `customers` và `suppliers` — khoá ngoại của nó là RESTRICT.
     */
    await sql`DELETE FROM advances WHERE payment_request_id IN (
      SELECT id FROM payment_requests WHERE title LIKE ${'%' + TEST_PREFIX + '%'}
    )`;
    await sql`DELETE FROM advances WHERE purpose LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM payment_requests WHERE title LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM receivables_payables WHERE description LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM cash_flow_plans WHERE notes LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM accounting_periods WHERE notes LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM aging_buckets WHERE label LIKE ${'%' + TEST_PREFIX + '%'}`;
    /*
     * Nhân sự: xoá theo đúng chiều phụ thuộc.
     *   `timesheets` tham chiếu kỳ chấm công và hồ sơ nhân sự với ON DELETE RESTRICT (cố ý —
     *   một bảng công đã chốt không được mồ côi khỏi kỳ sinh ra nó), nên xoá trước cả hai.
     *   Xoá kỳ kéo theo ngày công, xoá nhân sự kéo theo hợp đồng lao động, giấy tờ, đơn nghỉ,
     *   thưởng – phạt và checklist (CASCADE).
     *   `assets` phải đứng trước nhân sự: dòng checklist trỏ tới tài sản, và biên bản tài sản
     *   trỏ tới người giữ.
     */
    await sql`DELETE FROM timesheets WHERE year >= 2090`;
    await sql`DELETE FROM timesheet_periods WHERE year >= 2090`;
    await sql`DELETE FROM asset_events WHERE asset_id IN (
      SELECT id FROM assets WHERE name LIKE ${TEST_PREFIX + '%'}
    )`;
    await sql`DELETE FROM assets WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM recruitment_candidates WHERE full_name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM recruitment_positions WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM labor_workers WHERE full_name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM employees WHERE full_name LIKE ${TEST_PREFIX + '%'}`;
    // Kho: phiếu và đợt kiểm kê phải xoá TRƯỚC kho (khoá ngoại tới kho là ON DELETE
    // RESTRICT — một phiếu nhập không được mồ côi khỏi cái kho nó ghi vào).
    await sql`DELETE FROM stock_movements WHERE warehouse_id IN (
      SELECT id FROM warehouses WHERE name LIKE ${'%' + TEST_PREFIX + '%'}
    )`;
    await sql`DELETE FROM stocktakes WHERE warehouse_id IN (
      SELECT id FROM warehouses WHERE name LIKE ${'%' + TEST_PREFIX + '%'}
    )`;
    // SX: hợp đồng thuê kéo theo dòng thuê (CASCADE); phải xoá TRƯỚC vật tư
    // (`rental_agreement_items.material_id` là RESTRICT) và trước khách hàng
    // (`rental_agreements.customer_id` là RESTRICT).
    await sql`DELETE FROM rental_agreements WHERE customer_id IN (
      SELECT id FROM customers WHERE name LIKE ${TEST_PREFIX + '%'}
    )`;
    // Công nợ sinh từ biên bản thu hồi đã ký / tất toán (0145) không mang tiền tố test trong
    // mô tả; khoá ngoại tới khách hàng là RESTRICT nên phải xoá trước khách hàng.
    await sql`DELETE FROM receivables_payables WHERE customer_id IN (
      SELECT id FROM customers WHERE name LIKE ${TEST_PREFIX + '%'}
    )`;
    await sql`DELETE FROM production_orders WHERE product LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM scaffolding_assets WHERE asset_code LIKE ${'TEST-%'}`;
    // Xoá kho kéo theo dòng tồn (CASCADE); xoá vật tư phải sau cùng vì cả hai bảng trên
    // đều tham chiếu nó với ON DELETE RESTRICT.
    await sql`DELETE FROM warehouses WHERE name LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM materials WHERE name LIKE ${'%' + TEST_PREFIX + '%'}`;
    // Đơn đặt hàng phải xoá TRƯỚC đề nghị mua: khoá ngoại giữa hai bảng là ON DELETE
    // RESTRICT, cố ý — một đơn hàng không được mồ côi khỏi đề nghị đã duyệt sinh ra nó.
    // Xoá đơn hàng kéo theo dòng đơn hàng, phiếu giao nhận và dòng kiểm đếm (CASCADE).
    await sql`DELETE FROM purchase_orders WHERE purchase_request_id IN (
      SELECT id FROM purchase_requests WHERE title LIKE ${TEST_PREFIX + '%'}
    )`;
    await sql`DELETE FROM acceptance_checklists WHERE name LIKE ${TEST_PREFIX + '%'}`;
    // Lịch sử «Thúc» trỏ tới đề nghị theo kiểu đa hình, không có khoá ngoại tới nó (0134).
    await sql`DELETE FROM request_reminders WHERE entity_type = 'purchase_requests' AND entity_id IN (
      SELECT id FROM purchase_requests WHERE title LIKE ${TEST_PREFIX + '%'}
    )`;
    // Xoá đề nghị mua kéo theo dòng đề nghị, báo giá và dòng báo giá (CASCADE).
    await sql`DELETE FROM purchase_requests WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM suppliers WHERE name LIKE ${TEST_PREFIX + '%'}`;
    // Xoá công trình kéo theo nhật ký, nghiệm thu, tổ đội, bảo hành và phản ánh bảo hành
    // (khoá ngoại CASCADE). Phải đứng TRƯỚC hợp đồng và gói thầu: khoá ngoại của công
    // trình tới hai hồ sơ đó là `ON DELETE SET NULL`, mà cột nguồn của công trình bị guard
    // chặn sửa — xoá công trình trước thì không còn dây nào để CSDL phải dọn.
    // Điểm danh là bằng chứng bất biến (0139) và không CASCADE theo công trình: gỡ trước, tắt
    // riêng trigger chặn xoá — chỉ trong câu lệnh này (replica cũng tắt trigger khoá ngoại).
    // Yêu cầu làm rõ khoá xoá công trình (ON DELETE RESTRICT, 0154) — gỡ trước, kèm lịch sử thúc.
    await sql`DELETE FROM request_reminders WHERE entity_type = 'rfis' AND entity_id IN (
      SELECT r.id FROM rfis r JOIN construction_sites s ON s.id = r.construction_site_id
       WHERE s.name LIKE ${'%' + TEST_PREFIX + '%'}
    )`;
    await sql`DELETE FROM rfis WHERE construction_site_id IN (
      SELECT id FROM construction_sites WHERE name LIKE ${'%' + TEST_PREFIX + '%'}
    )`;
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`DELETE FROM site_check_ins WHERE construction_site_id IN (
        SELECT id FROM construction_sites WHERE name LIKE ${'%' + TEST_PREFIX + '%'}
      )`;
    });
    await sql`DELETE FROM construction_sites WHERE name LIKE ${'%' + TEST_PREFIX + '%'}`;
    // Xoá hợp đồng kéo theo điều khoản và phát sinh (khoá ngoại CASCADE).
    await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + '%'}`;
    // Mẫu hợp đồng (0171) — sau hợp đồng: văn bản đã điền trỏ tới mẫu (ON DELETE SET NULL).
    await sql`DELETE FROM contract_templates WHERE title LIKE ${TEST_PREFIX + '%'}`;
    // Xoá gói thầu kéo theo khối lượng, dự toán, hồ sơ thầu và ngân sách (khoá ngoại CASCADE).
    await sql`DELETE FROM bidding_projects WHERE name LIKE ${TEST_PREFIX + '%'}`;
    // Lịch sử chuyển bước (0225) không có khoá ngoại tới hồ sơ (một bảng cho ba loại) — dọn dòng mồ côi.
    await sql`DELETE FROM stage_transitions st WHERE NOT EXISTS (
      SELECT 1 FROM contracts c WHERE c.id = st.entity_id
      UNION ALL SELECT 1 FROM bidding_projects b WHERE b.id = st.entity_id
      UNION ALL SELECT 1 FROM construction_sites s WHERE s.id = st.entity_id
    )`;
    // Module Thiết kế AI: `design_head.artifact_id` cố ý là ON DELETE RESTRICT (không xoá
    // được artifact đang là bản hiệu lực). Xoá dự án cha thì hai bảng cùng bị cascade, và thứ
    // tự Postgres chọn có thể chạm RESTRICT trước — nên hạ con trỏ xuống trước, tường minh.
    await sql`
      DELETE FROM design_head
       WHERE project_id IN (SELECT id FROM design_projects WHERE name LIKE ${TEST_PREFIX + '%'})
    `;
    // Xoá dự án thiết kế kéo theo đầu bài, phiên bản, tiến độ bộ môn, yêu cầu thay đổi,
    // artifact của Module Thiết kế AI và cả dự toán NVO (khoá ngoại CASCADE).
    // `kb_record.project_code` là cột SINH từ payload, nên lọc theo nó vẫn đúng tiền tố test.
    // Phải xoá TRƯỚC `design_projects`: khoá ngoại là ON DELETE SET NULL nên xoá dự án không
    // dọn được bản ghi, nó chỉ mồ côi đi.
    await sql`DELETE FROM kb_record WHERE project_code LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM design_projects WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM unit_prices WHERE name LIKE ${TEST_PREFIX + '%'}`;
    // Đầu mối trước cơ hội / khách hàng: nhật ký chăm sóc đi theo (CASCADE) từ cả ba phía.
    await sql`DELETE FROM leads WHERE full_name LIKE ${TEST_PREFIX + '%'}`;
    // Mẫu công trình (ảnh, lượt xem link đi theo — CASCADE). Mẫu đã xoá mềm vẫn mang tiền tố.
    await sql`DELETE FROM showcase_shares WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM showcase_items WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM opportunities WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM documents WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM customers WHERE name LIKE ${TEST_PREFIX + '%'}`;

    /*
     * `notifications` cùng hình dạng với `approvals` ở trên: một bảng phục vụ mọi module nên
     * `related_entity_id` KHÔNG có khóa ngoại, và vì vậy xoá hồ sơ nguồn không dọn theo dòng
     * thông báo nào. Khác `approvals` ở chỗ tiêu đề không mang tiền tố test — thông báo do
     * trigger sinh ra từ mã hồ sơ, nên lọc theo `[TEST]` bắt hụt gần hết.
     *
     * Đã đo trên CSDL phát triển trước khi thêm bước này: 10.469 thông báo, trong đó 9.691
     * (93%) trỏ tới bản ghi không còn tồn tại. Người mở chuông thông báo thấy một bức tường
     * thông báo mà bấm vào cái nào cũng không ra hồ sơ.
     *
     * Lọc theo "bản ghi đích không còn tồn tại" chứ không theo tiền tố: đó đúng là cách chúng
     * chết. Xoá MỀM không lọt lưới này — dòng bị xoá mềm vẫn còn trong bảng, chỉ có
     * `deleted_at`, nên thông báo về nó vẫn giữ nguyên.
     */
    const entityTypes = await sql<{ related_entity_type: string }[]>`
      SELECT DISTINCT n.related_entity_type
      FROM notifications n
      JOIN information_schema.tables t
        ON t.table_schema = 'public' AND t.table_name = n.related_entity_type
      WHERE n.related_entity_type IS NOT NULL`;

    for (const { related_entity_type: entity } of entityTypes) {
      // Tên bảng đã được đối chiếu với `information_schema` ở truy vấn trên nên nội suy an toàn.
      await sql.unsafe(
        `DELETE FROM notifications n
         WHERE n.related_entity_type = '${entity}'
           AND n.related_entity_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM "${entity}" x WHERE x.id = n.related_entity_id)`,
      );
    }
  } finally {
    await sql.end();
  }
}

/**
 * Ký hai bên một biên bản nghiệm thu bằng BẢN GIẤY quét (0192) — tải một PDF nhỏ vào kho
 * `acceptance-docs` rồi gọi `sign_acceptance_record`. Kế toán chỉ được báo sau bước này.
 */
export async function signAcceptanceWithPaper(
  client: SupabaseClient,
  siteId: string,
  acceptanceId: string,
  counterpart = 'Đại diện chủ đầu tư',
) {
  const path = `${siteId}/${acceptanceId}/ban-giay-${crypto.randomUUID()}.pdf`;
  const up = await client.storage
    .from('acceptance-docs')
    .upload(path, new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
    });
  if (up.error) return { error: up.error };
  return client.rpc('sign_acceptance_record', {
    p_acceptance_id: acceptanceId,
    p_counterpart_name: counterpart,
    p_paper_scan_path: path,
  });
}
