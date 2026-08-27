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
  thietKeNvo: 'thietke.nvo@nhavietgroup.test',
  ketCauNvo: 'ketcau.nvo@nhavietgroup.test',
  muaHang: 'muahang@nhavietgroup.test',
  kho: 'kho@nhavietgroup.test',
  ketoan: 'ketoan@nhavietgroup.test',
  nhanSu: 'nhansu@nhavietgroup.test',
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
] as const;

/** Mã lỗi Postgres cho "insufficient_privilege" — RLS chặn thành công. */
export const PG_INSUFFICIENT_PRIVILEGE = '42501';

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
    // Xoá đề nghị mua kéo theo dòng đề nghị, báo giá và dòng báo giá (CASCADE).
    await sql`DELETE FROM purchase_requests WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM suppliers WHERE name LIKE ${TEST_PREFIX + '%'}`;
    // Xoá công trình kéo theo nhật ký, nghiệm thu, tổ đội, bảo hành và phản ánh bảo hành
    // (khoá ngoại CASCADE). Phải đứng TRƯỚC hợp đồng và gói thầu: khoá ngoại của công
    // trình tới hai hồ sơ đó là `ON DELETE SET NULL`, mà cột nguồn của công trình bị guard
    // chặn sửa — xoá công trình trước thì không còn dây nào để CSDL phải dọn.
    await sql`DELETE FROM construction_sites WHERE name LIKE ${'%' + TEST_PREFIX + '%'}`;
    // Xoá hợp đồng kéo theo điều khoản và phát sinh (khoá ngoại CASCADE).
    await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + '%'}`;
    // Xoá gói thầu kéo theo khối lượng, dự toán, hồ sơ thầu và ngân sách (khoá ngoại CASCADE).
    await sql`DELETE FROM bidding_projects WHERE name LIKE ${TEST_PREFIX + '%'}`;
    // Xoá dự án thiết kế kéo theo đầu bài, phiên bản, tiến độ bộ môn, yêu cầu thay đổi
    // và cả dự toán NVO (khoá ngoại CASCADE).
    await sql`DELETE FROM design_projects WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM unit_prices WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM opportunities WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM documents WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM customers WHERE name LIKE ${TEST_PREFIX + '%'}`;
  } finally {
    await sql.end();
  }
}
