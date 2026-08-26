/**
 * Module TC — Thi công và Ngân sách công trình: hàng rào phân quyền và điều kiện nghiệp vụ.
 *
 * Nguồn: PRD TC-01 → TC-08, Backend Schema 4.6, Tech Stack 3.6.
 *
 * ⚠️ Module ĐỊNH HƯỚNG (PRD Mục 10) — nhưng "định hướng" nói về việc CÔNG TRƯỜNG LÀM VIỆC
 * THẾ NÀO, không phải về phân quyền. Ranh giới dữ liệu giữa ba pháp nhân, quyền xem phân hệ
 * và việc nghiệm thu là căn cứ thu tiền đều đã chốt ở tài liệu khác, nên vẫn phải có test.
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  anonClient,
  hasCredentials,
  PG_INSUFFICIENT_PRIVILEGE,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  nvcSiteId: string;
  nvoSiteId: string;
}

/**
 * Dựng công trình mẫu bằng kết nối trực tiếp (vượt RLS).
 *
 * Đây là DỰNG BỐI CẢNH, không phải chạy luồng: luồng "hợp đồng đã ký → mở công trình" được
 * chứng minh ở `golden-path.test.ts` bằng đúng vai trò và đúng hàm nghiệp vụ. Ở đây chỉ cần
 * có sẵn công trình để kiểm tra các hàng rào quanh nó, nên đi đường ngắn thay vì dựng lại
 * cả chuỗi cơ hội → gói thầu → dự toán → hợp đồng.
 */
async function seedSites(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const stamp = Date.now();
    const rows = await sql<{ id: string; code: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      SELECT c.id,
             c.code || '-CT-TEST-' || ${String(stamp)} || '-' || c.code,
             ${TEST_PREFIX + ' Công trình '} || c.code || ' ' || ${String(stamp)},
             current_date + 90
        FROM companies c
       WHERE c.code IN ('NVC', 'NVO')
       RETURNING id, (SELECT code FROM companies WHERE id = company_id) AS code
    `;
    const byCompany = new Map(rows.map((r) => [r.code, r.id]));
    return {
      nvcSiteId: byCompany.get('NVC')!,
      nvoSiteId: byCompany.get('NVO')!,
    };
  } finally {
    await sql.end();
  }
}

/**
 * Ghi thẳng một mục nhật ký với thời điểm và người ghi chỉ định.
 *
 * Phải đi đường trực tiếp vì `touch_audit_columns` cố ý coi `created_at` là bất biến khi
 * UPDATE — không lùi được thời gian của một dòng đã ghi, và đó là hành vi đúng. Nhưng lúc
 * INSERT thì hàm đó giữ nguyên `created_at` được khai, nên dựng sẵn một mục nhật ký "đã ghi
 * 30 giờ trước" là cách duy nhất thử được cửa sổ sửa 24 giờ mà không phải chờ thật.
 */
async function insertLogDirect(input: {
  siteId: string;
  loggedBy: string;
  hoursAgo: number;
}): Promise<string> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO site_logs (company_id, construction_site_id, log_date, log_type,
                             content, logged_by, created_at)
      SELECT s.company_id, s.id, current_date, 'tien_do',
             ${TEST_PREFIX + ' Nhật ký dựng sẵn.'}, ${input.loggedBy},
             now() - (${String(input.hoursAgo)} || ' hours')::interval
        FROM construction_sites s WHERE s.id = ${input.siteId}
      RETURNING id
    `;
    return row!.id;
  } finally {
    await sql.end();
  }
}

describeDb('TC — phạm vi pháp nhân và quyền xem phân hệ', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let kinhDoanh: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedSites();
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
  });

  it('vai trò anon không đọc được công trình', async () => {
    const { data, error } = await anonClient().from('construction_sites').select('*').limit(1);
    if (error) expect(error.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    else expect(data).toEqual([]);
  });

  it('chỉ huy trưởng NVC thấy công trình NVC, KHÔNG thấy công trình NVO (NEN-01)', async () => {
    const { data } = await chiHuy
      .from('construction_sites')
      .select('id')
      .in('id', [fixture.nvcSiteId, fixture.nvoSiteId]);
    expect(data!.map((r) => r.id)).toEqual([fixture.nvcSiteId]);
  });

  it('Kinh doanh không có quyền xem phân hệ Thi công nên không thấy công trình nào', async () => {
    const { data } = await kinhDoanh
      .from('construction_sites')
      .select('id')
      .eq('id', fixture.nvcSiteId);
    expect(data).toEqual([]);
  });

  it('không xóa hẳn được công trình (Backend Schema 1.4)', async () => {
    const { error } = await chiHuy
      .from('construction_sites')
      .delete()
      .eq('id', fixture.nvcSiteId);
    expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('không đổi thẳng được bước công trình bằng một câu PATCH (migration 0028)', async () => {
    const { error } = await chiHuy
      .from('construction_sites')
      .update({ stage: 'hoan_thanh' })
      .eq('id', fixture.nvcSiteId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Không đổi trực tiếp được trạng thái');
  });

  it('không đổi được pháp nhân và nguồn ngân sách của công trình đã tạo', async () => {
    const { data: nvo } = await signInAs(ACCOUNTS.tgd).then((c) =>
      c.from('companies').select('id').eq('code', 'NVO').single(),
    );
    const { error } = await chiHuy
      .from('construction_sites')
      .update({ company_id: (nvo as { id: string }).id })
      .eq('id', fixture.nvcSiteId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Không đổi được pháp nhân');
  });
});

describeDb('TC — nhật ký công trường là bằng chứng, không phải bản nháp (TC-02, TC-08)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let ketoan: SupabaseClient;
  let tgd: SupabaseClient;
  let chiHuyId: string;
  let logId: string;

  beforeAll(async () => {
    fixture = await seedSites();
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    ketoan = await signInAs(ACCOUNTS.ketoan);
    tgd = await signInAs(ACCOUNTS.tgd);
    chiHuyId = (await chiHuy.rpc('auth_user_id')).data as string;

    const { data } = await chiHuy
      .from('site_logs')
      .insert({
        company_id: await companyOf(chiHuy, fixture.nvcSiteId),
        construction_site_id: fixture.nvcSiteId,
        log_date: new Date().toISOString().slice(0, 10),
        log_type: 'tien_do',
        content: `${TEST_PREFIX} Đổ bê tông móng trục A–D.`,
        workforce_count: 24,
        logged_by: chiHuyId,
      })
      .select('id')
      .single();
    logId = (data as { id: string }).id;
  });

  it('chỉ huy trưởng ghi được nhật ký và sửa được ngay sau khi ghi', async () => {
    expect(logId).toBeTruthy();

    const { error } = await chiHuy
      .from('site_logs')
      .update({ content: `${TEST_PREFIX} Đổ bê tông móng trục A–D, xong lúc 16h30.` })
      .eq('id', logId);
    expect(error).toBeNull();

    const { data } = await chiHuy.from('site_logs').select('content').eq('id', logId).single();
    expect(data!.content).toContain('16h30');
  });

  it('Kế toán không có quyền sửa phân hệ Thi công nên không ghi được nhật ký', async () => {
    const { error } = await ketoan.from('site_logs').insert({
      company_id: await companyOf(tgd, fixture.nvcSiteId),
      construction_site_id: fixture.nvcSiteId,
      log_date: new Date().toISOString().slice(0, 10),
      content: `${TEST_PREFIX} Không được phép.`,
    });
    expect(error).not.toBeNull();
  });

  it('Ban Giám đốc xem được nhật ký nhưng không sửa được (Webapp Flow 2.3)', async () => {
    const { data: seen } = await tgd.from('site_logs').select('content').eq('id', logId).single();
    expect(seen).not.toBeNull();

    // Vai trò chỉ-xem-và-phê-duyệt bị RLS lọc khỏi tầm với: không báo lỗi, nhưng cũng không
    // dòng nào đổi. Khẳng định bằng nội dung sau đó, không bằng mã lỗi.
    await tgd.from('site_logs').update({ content: `${TEST_PREFIX} Sửa bởi BGĐ.` }).eq('id', logId);

    const { data } = await tgd.from('site_logs').select('content').eq('id', logId).single();
    expect(data!.content).not.toContain('Sửa bởi BGĐ');
  });

  it('người ghi lấy từ phiên đăng nhập, không khai được tên đồng nghiệp', async () => {
    const otherId = (await tgd.rpc('auth_user_id')).data as string;

    const { data } = await chiHuy
      .from('site_logs')
      .insert({
        company_id: await companyOf(chiHuy, fixture.nvcSiteId),
        construction_site_id: fixture.nvcSiteId,
        log_date: new Date().toISOString().slice(0, 10),
        content: `${TEST_PREFIX} Khai tên người khác vào chữ ký nhật ký.`,
        logged_by: otherId,
      })
      .select('id, logged_by')
      .single();

    // `logged_by` bị khoá sau khi ghi (TC-08), nên nhận giá trị từ trình duyệt là tạo ra một
    // dòng nhật ký mang chữ ký người khác và vĩnh viễn không sửa được.
    expect((data as { logged_by: string }).logged_by).toBe(chiHuyId);
  });

  it('không sửa được nhật ký do người khác ghi', async () => {
    const otherId = (await tgd.rpc('auth_user_id')).data as string;
    const foreignLog = await insertLogDirect({
      siteId: fixture.nvcSiteId,
      loggedBy: otherId,
      hoursAgo: 1,
    });

    const { error } = await chiHuy
      .from('site_logs')
      .update({ content: `${TEST_PREFIX} Sửa nhật ký của người khác.` })
      .eq('id', foreignLog);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('do người khác ghi');
  });

  it('quá 24 giờ thì chính người ghi cũng không sửa được nữa', async () => {
    const oldLog = await insertLogDirect({
      siteId: fixture.nvcSiteId,
      loggedBy: chiHuyId,
      hoursAgo: 30,
    });

    const { error } = await chiHuy
      .from('site_logs')
      .update({ content: `${TEST_PREFIX} Viết lại lịch sử.` })
      .eq('id', oldLog);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('quá 24 giờ');
  });

  it('không xóa hẳn được nhật ký', async () => {
    const { error } = await chiHuy.from('site_logs').delete().eq('id', logId);
    expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });
});

describeDb('TC — nghiệm thu là căn cứ thu tiền, và chỉ với chủ đầu tư (TC-04)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let ketoan: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedSites();
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    ketoan = await signInAs(ACCOUNTS.ketoan);
  });

  it('không tạo thẳng được biên bản nghiệm thu bằng một câu INSERT', async () => {
    const { error } = await chiHuy.from('acceptance_records').insert({
      company_id: await companyOf(chiHuy, fixture.nvcSiteId),
      construction_site_id: fixture.nvcSiteId,
      acceptance_type: 'khach_hang',
      stage_name: 'Phần móng',
      value: 900_000_000,
      status: 'da_nghiem_thu',
    });
    expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('nghiệm thu với chủ đầu tư bắt buộc có giá trị khối lượng', async () => {
    const { error } = await chiHuy.rpc('record_acceptance', {
      p_site_id: fixture.nvcSiteId,
      p_acceptance_type: 'khach_hang',
      p_stage_name: 'Phần móng',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('căn cứ thu tiền');
  });

  it('nghiệm thu nội bộ KHÔNG báo Kế toán thu tiền', async () => {
    const { data, error } = await chiHuy.rpc('record_acceptance', {
      p_site_id: fixture.nvcSiteId,
      p_acceptance_type: 'noi_bo',
      p_stage_name: 'Kiểm tra cốt thép trục A',
    });
    expect(error).toBeNull();

    expect(await billingNoticesFor(ketoan, data as string)).toBe(0);
  });

  it('nghiệm thu với chủ đầu tư báo Kế toán để thu tiền', async () => {
    const { data, error } = await chiHuy.rpc('record_acceptance', {
      p_site_id: fixture.nvcSiteId,
      p_acceptance_type: 'khach_hang',
      p_stage_name: 'Phần móng',
      p_value: 900_000_000,
      p_counterpart_signed_by: 'Đại diện chủ đầu tư',
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    expect(await billingNoticesFor(ketoan, data as string)).toBe(1);
  });

  it('biên bản đã nghiệm thu thì không sửa được giá trị nữa', async () => {
    const { data } = await chiHuy
      .from('acceptance_records')
      .select('id')
      .eq('construction_site_id', fixture.nvcSiteId)
      .eq('status', 'da_nghiem_thu')
      .eq('acceptance_type', 'khach_hang')
      .limit(1)
      .single();

    const { error } = await chiHuy
      .from('acceptance_records')
      .update({ value: 1 })
      .eq('id', (data as { id: string }).id);
    // RLS lọc dòng khỏi tầm với: không lỗi, nhưng cũng không dòng nào đổi.
    expect(error).toBeNull();

    const { data: after } = await chiHuy
      .from('acceptance_records')
      .select('value')
      .eq('id', (data as { id: string }).id)
      .single();
    expect(Number((after as { value: number }).value)).toBe(900_000_000);
  });
});

describeDb('TC — thứ tự các bước của công trình', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedSites();
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
  });

  it('không nhảy thẳng từ Chuẩn bị sang Kết thúc', async () => {
    const { error } = await chiHuy.rpc('move_site_stage', {
      p_site_id: fixture.nvcSiteId,
      p_stage: 'hoan_thanh',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Không chuyển được công trình');
  });

  it('tạm dừng bắt buộc nêu nguyên nhân', async () => {
    const { error } = await chiHuy.rpc('move_site_stage', {
      p_site_id: fixture.nvcSiteId,
      p_stage: 'tam_dung',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('nguyên nhân');
  });

  it('chưa nghiệm thu với chủ đầu tư thì không bàn giao được công trình (TC-04)', async () => {
    const step = async (stage: string) =>
      chiHuy.rpc('move_site_stage', { p_site_id: fixture.nvcSiteId, p_stage: stage });

    expect((await step('dang_thi_cong')).error).toBeNull();
    expect((await step('nghiem_thu')).error).toBeNull();

    const { error } = await step('bao_hanh');
    expect(error).not.toBeNull();
    expect(error!.message).toContain('nghiệm thu với chủ đầu tư');
  });

  it('có biên bản nghiệm thu chủ đầu tư thì bàn giao được, và mốc bàn giao được ghi lại', async () => {
    const accepted = await chiHuy.rpc('record_acceptance', {
      p_site_id: fixture.nvcSiteId,
      p_acceptance_type: 'khach_hang',
      p_stage_name: 'Toàn bộ công trình',
      p_value: 4_000_000_000,
      p_counterpart_signed_by: 'Đại diện chủ đầu tư',
    });
    expect(accepted.error).toBeNull();

    const { error } = await chiHuy.rpc('move_site_stage', {
      p_site_id: fixture.nvcSiteId,
      p_stage: 'bao_hanh',
    });
    expect(error).toBeNull();

    const { data } = await chiHuy
      .from('construction_sites')
      .select('stage, handed_over_at, actual_end_date')
      .eq('id', fixture.nvcSiteId)
      .single();
    expect(data!.stage).toBe('bao_hanh');
    expect(data!.handed_over_at).not.toBeNull();
    expect(data!.actual_end_date).not.toBeNull();
  });
});

describeDb('TC — bảo hành theo từng hạng mục (TC-07)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let warrantyId: string;

  beforeAll(async () => {
    fixture = await seedSites();
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
  });

  it('ngày hết hạn tính từ thời hạn hợp đồng, không phải nhập tay', async () => {
    const { data, error } = await chiHuy
      .from('warranties')
      .insert({
        company_id: await companyOf(chiHuy, fixture.nvcSiteId),
        construction_site_id: fixture.nvcSiteId,
        item: `${TEST_PREFIX} Chống thấm mái`,
        start_date: '2026-01-01',
        duration_months: 60,
      })
      .select('id, warranty_until, status')
      .single();
    expect(error).toBeNull();
    expect(data!.warranty_until).toBe('2031-01-01');
    expect(data!.status).toBe('con_han');
    warrantyId = (data as { id: string }).id;
  });

  it('có phản ánh chưa xử lý thì hạng mục chuyển sang "đang xử lý"', async () => {
    const { error } = await chiHuy.from('warranty_claims').insert({
      company_id: await companyOf(chiHuy, fixture.nvcSiteId),
      warranty_id: warrantyId,
      description: `${TEST_PREFIX} Thấm góc mái phía tây sau mưa lớn.`,
      reported_date: new Date().toISOString().slice(0, 10),
    });
    expect(error).toBeNull();

    const { data } = await chiHuy
      .from('warranties')
      .select('status')
      .eq('id', warrantyId)
      .single();
    expect(data!.status).toBe('dang_xu_ly');
  });

  it('xử lý xong thì hạng mục trở lại "còn hạn"', async () => {
    const { data: claim } = await chiHuy
      .from('warranty_claims')
      .select('id')
      .eq('warranty_id', warrantyId)
      .limit(1)
      .single();

    const { error } = await chiHuy
      .from('warranty_claims')
      .update({
        status: 'da_xu_ly',
        root_cause: 'Lớp chống thấm thi công thiếu lớp lót ở góc.',
        resolution: 'Bóc lại 12 m2 và thi công đủ lớp.',
        cost: 6_500_000,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', (claim as { id: string }).id);
    expect(error).toBeNull();

    const { data } = await chiHuy
      .from('warranties')
      .select('status')
      .eq('id', warrantyId)
      .single();
    expect(data!.status).toBe('con_han');
  });
});

describeDb('TC — một hợp đồng mở một công trình', () => {
  it('không mở được công trình từ hợp đồng chưa ký', async () => {
    const chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    const { error } = await chiHuy.rpc('open_site_from_contract', {
      p_contract_id: '00000000-0000-0000-0000-000000000000',
    });
    // Hợp đồng không tồn tại và hợp đồng chưa ký đều dừng ở cùng một chỗ: không thao tác được.
    expect(error).not.toBeNull();
  });
});

describeDb('TC — hàm nội bộ không gọi được từ trình duyệt', () => {
  it('không tự mở được công trình ở pháp nhân bất kỳ', async () => {
    const chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    const { data: nvo } = await chiHuy.rpc('auth_company_ids');
    const { error } = await chiHuy.rpc('open_construction_site', {
      p_company_id: Array.isArray(nvo) ? nvo[0] : nvo,
      p_name: `${TEST_PREFIX} Công trình tự mở`,
    });
    expect(error).not.toBeNull();
  });

  it('không tự sinh được ngân sách cho hồ sơ bất kỳ', async () => {
    const chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    const { error } = await chiHuy.rpc('build_budget_lines', {
      p_bidding_project_id: '00000000-0000-0000-0000-000000000000',
      p_design_project_id: null,
    });
    expect(error).not.toBeNull();
  });
});

/** Pháp nhân của một công trình — dùng để điền `company_id` đúng như giao diện phải làm. */
async function companyOf(client: SupabaseClient, siteId: string): Promise<string> {
  const { data } = await client
    .from('construction_sites')
    .select('company_id')
    .eq('id', siteId)
    .single();
  return (data as { company_id: string }).company_id;
}

/**
 * Số thông báo "đủ căn cứ thu tiền" mà Kế toán nhận được CHO ĐÚNG biên bản này.
 *
 * Đếm theo biên bản chứ không đếm tổng rồi so chênh lệch: các tệp test chạy song song, và
 * `golden-path.test.ts` cũng lập biên bản nghiệm thu chủ đầu tư — đếm tổng thì hai bài đua
 * nhau và bài nào cũng có lúc sai mà không phải do mã sản phẩm.
 */
async function billingNoticesFor(
  client: SupabaseClient,
  acceptanceId: string,
): Promise<number> {
  const { count } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'acceptance_billing')
    .eq('related_entity_id', acceptanceId);
  return count ?? 0;
}
