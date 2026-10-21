/**
 * Nạp dữ liệu khởi tạo cho môi trường DEV/STAGING.
 *
 * Idempotent: chạy lại nhiều lần cho kết quả giống nhau, không nhân bản dữ liệu.
 * Điều này quan trọng vì seed sẽ được chạy lại mỗi khi bổ sung module mới
 * (BUILD_PLAN.md — "seed data tiến hoá song song mọi phase").
 *
 * Tạo cả tài khoản đăng nhập trong Supabase Auth để có thể thử phân quyền thật:
 * Backend Schema 3.1 quy định KHÔNG có luồng tự đăng ký công khai — tài khoản do
 * quản trị viên cấp, nên seed đóng vai trò quản trị viên đó.
 */

import '../env';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { eq, sql as sqlOp } from 'drizzle-orm';
import { DEFAULT_AGING_BUCKETS, DEFAULT_APPROVAL_LIMITS, MILESTONE_SET_SEEDS } from '@nvg/shared';
import { createConnection } from '../client';
import {
  agingBuckets,
  approvalLimits,
  companies,
  customers,
  permissions,
  roleCapabilities,
  roles,
  tenants,
  userCompanies,
  users,
} from '../schema/index';
import {
  COMPANY_SEED,
  ROLE_CAPABILITY_SEED,
  SAMPLE_CUSTOMER_SEED,
  ROLE_SEED,
  SEED_PASSWORD,
  USER_SEED,
} from './data';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}.`);
  return v;
}

/** Một dòng `manifest.json` do convert.py sinh. */
interface ContractTemplateAsset {
  file: string;
  code: string;
  title: string;
  contract_type: string;
  tags: Record<string, unknown>;
  payment_milestones: unknown[];
  sha: string;
}

async function main() {
  // Chặn chạy nhầm trên production — seed dùng mật khẩu dùng chung, đã biết trước.
  if (process.env.NODE_ENV === 'production' || process.env.NVG_ENV === 'production') {
    throw new Error('Seed KHÔNG được chạy trên production (mật khẩu seed là công khai).');
  }

  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { sql, db } = createConnection();

  try {
    // --- Pháp nhân ---------------------------------------------------------
    //
    // `companies.tenant_id` NOT NULL từ migration 0095. Tenant `nvg` do chính migration đó
    // tạo, nên ở đây chỉ đọc lại — seed KHÔNG tạo tenant mới.
    const [nvgTenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.code, 'nvg'));
    if (!nvgTenant) {
      throw new Error('Chưa có tenant "nvg" — chạy `npm run db:migrate` trước khi seed.');
    }

    for (const c of COMPANY_SEED) {
      await db
        .insert(companies)
        .values({
          tenantId: nvgTenant.id,
          code: c.code,
          legalName: c.legalName,
          shortName: c.shortName,
          taxCode: c.taxCode,
          address: c.address,
          phone: c.phone ?? null,
          email: c.email ?? null,
          legalRepresentative: c.legalRepresentative,
          isTransactional: c.isTransactional,
          displayOrder: c.displayOrder,
        })
        .onConflictDoUpdate({
          target: companies.code,
          set: {
            legalName: c.legalName,
            shortName: c.shortName,
            // Chỉ điền khi đang trống: Quản trị có thể đã sửa trên giao diện (mẫu hợp đồng, 0171).
            taxCode: sqlOp`coalesce(${companies.taxCode}, excluded.tax_code)`,
            address: sqlOp`coalesce(${companies.address}, excluded.address)`,
            phone: sqlOp`coalesce(${companies.phone}, excluded.phone)`,
            email: sqlOp`coalesce(${companies.email}, excluded.email)`,
            // «Bùi Văn Thi» từng là giá trị GIẢ ĐỊNH cho cả ba pháp nhân — chỉ thay khi ô còn trống hoặc còn
            // đúng giá trị giả định đó; người Quản trị đã sửa trên giao diện thì giữ.
            legalRepresentative: sqlOp`case when ${companies.legalRepresentative} is null
              or ${companies.legalRepresentative} = 'Bùi Văn Thi'
              then excluded.legal_representative else ${companies.legalRepresentative} end`,
            isTransactional: c.isTransactional,
            displayOrder: c.displayOrder,
            updatedAt: sqlOp`now()`,
          },
        });
    }
    console.log(`Pháp nhân: ${COMPANY_SEED.length}`);

    // --- Vai trò và quyền --------------------------------------------------
    for (const r of ROLE_SEED) {
      const [role] = await db
        .insert(roles)
        .values({
          code: r.code,
          label: r.label,
          description: r.description,
          seesAllCompanies: r.seesAllCompanies,
          defaultRoute: r.defaultRoute,
          siteScoped: r.siteScoped ?? false,
        })
        .onConflictDoUpdate({
          target: roles.code,
          set: {
            label: r.label,
            description: r.description,
            seesAllCompanies: r.seesAllCompanies,
            defaultRoute: r.defaultRoute,
            siteScoped: r.siteScoped ?? false,
            updatedAt: sqlOp`now()`,
          },
        })
        .returning({ id: roles.id });

      for (const [moduleCode, perms] of Object.entries(r.permissions)) {
        const set = new Set(perms);
        await db
          .insert(permissions)
          .values({
            roleId: role!.id,
            moduleCode,
            canView: set.has('view'),
            canCreate: set.has('create'),
            canEdit: set.has('edit'),
            canDelete: set.has('delete'),
            canApprove: set.has('approve'),
          })
          .onConflictDoUpdate({
            target: [permissions.roleId, permissions.moduleCode],
            set: {
              canView: set.has('view'),
              canCreate: set.has('create'),
              canEdit: set.has('edit'),
              canDelete: set.has('delete'),
              canApprove: set.has('approve'),
              updatedAt: sqlOp`now()`,
            },
          });
      }
    }
    console.log(`Vai trò: ${ROLE_SEED.length}`);

    // --- Tra cứu id --------------------------------------------------------
    const companyRows = await db.select({ id: companies.id, code: companies.code }).from(companies);
    const companyByCode = new Map(companyRows.map((c) => [c.code, c.id]));
    const roleRows = await db.select({ id: roles.id, code: roles.code }).from(roles);
    const roleByCode = new Map(roleRows.map((r) => [r.code as string, r.id]));

    // --- Quyền chuỗi Module Thiết kế ----------------------------------------
    let capabilityCount = 0;
    for (const [roleCode, caps] of Object.entries(ROLE_CAPABILITY_SEED)) {
      const roleId = roleByCode.get(roleCode);
      if (!roleId) continue;
      for (const capability of caps) {
        await db.insert(roleCapabilities).values({ roleId, capability }).onConflictDoNothing();
        capabilityCount++;
      }
    }
    console.log(`Quyền chuỗi Module Thiết kế: ${capabilityCount}`);

    // --- Hạn mức phê duyệt -------------------------------------------------
    for (const limit of DEFAULT_APPROVAL_LIMITS) {
      const roleId = roleByCode.get(limit.role);
      if (!roleId) continue;
      await db
        .insert(approvalLimits)
        .values({
          roleId,
          subject: limit.subject,
          maxAmount: limit.maxAmount,
          step: limit.step,
          companyId: null,
        })
        .onConflictDoNothing();
    }
    console.log(`Hạn mức phê duyệt: ${DEFAULT_APPROVAL_LIMITS.length}`);

    // --- Khung tuổi nợ (KT-04) --------------------------------------------
    // Cùng tinh thần với hạn mức phê duyệt: đây là GIÁ TRỊ KHỞI TẠO, NVG sửa lại trong Quản
    // trị hệ thống khi ban hành mốc chính thức. `company_id` rỗng = áp dụng cho mọi pháp nhân.
    for (const [index, bucket] of DEFAULT_AGING_BUCKETS.entries()) {
      await db
        .insert(agingBuckets)
        .values({
          companyId: null,
          code: bucket.code,
          label: bucket.label,
          position: index + 1,
          fromDays: bucket.fromDays,
          toDays: bucket.toDays,
        })
        .onConflictDoNothing();
    }
    console.log(`Khung tuổi nợ: ${DEFAULT_AGING_BUCKETS.length}`);

    // --- Người dùng + tài khoản đăng nhập ----------------------------------
    let created = 0;
    let reused = 0;

    for (const u of USER_SEED) {
      // Tài khoản Supabase Auth. `createUser` báo lỗi nếu email đã tồn tại —
      // khi đó tra lại id để seed giữ tính idempotent.
      let authUserId: string | undefined;
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: SEED_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.fullName },
      });

      if (error) {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        authUserId = list?.users.find((x) => x.email === u.email)?.id;
        if (!authUserId) throw new Error(`Không tạo được tài khoản ${u.email}: ${error.message}`);
        reused++;
      } else {
        authUserId = data.user?.id;
        created++;
      }

      const [row] = await db
        .insert(users)
        .values({
          authUserId,
          email: u.email,
          fullName: u.fullName,
          jobTitle: u.jobTitle,
          department: u.department,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            authUserId,
            fullName: u.fullName,
            jobTitle: u.jobTitle,
            department: u.department,
            updatedAt: sqlOp`now()`,
          },
        })
        .returning({ id: users.id });

      for (const a of u.assignments) {
        const companyId = companyByCode.get(a.company);
        const roleId = roleByCode.get(a.role);
        if (!companyId || !roleId) continue;
        await db
          .insert(userCompanies)
          .values({ userId: row!.id, companyId, roleId, isPrimary: a.isPrimary ?? false })
          .onConflictDoNothing();
      }
    }
    console.log(`Người dùng: ${USER_SEED.length} (tạo mới ${created}, dùng lại ${reused})`);

    const assignmentRows = await db
      .select({ count: sqlOp<number>`count(*)::int` })
      .from(userCompanies);
    console.log(`Gán vai trò theo pháp nhân: ${assignmentRows[0]?.count ?? 0}`);

    // --- Khách hàng mẫu ------------------------------------------------------
    // Idempotent theo tên. Mã để trống: trigger cấp `KH-{5 số}` (0132).
    let customerCreated = 0;
    for (const c of SAMPLE_CUSTOMER_SEED) {
      const existing = await db
        .select({ id: customers.id })
        .from(customers)
        .where(sqlOp`${customers.name} = ${c.name}`)
        .limit(1);
      if (existing.length > 0) continue;
      await db.insert(customers).values({ code: '', name: c.name, source: c.source });
      customerCreated++;
    }
    console.log(`Khách hàng mẫu: ${SAMPLE_CUSTOMER_SEED.length} (tạo mới ${customerCreated})`);

    // --- Bộ mốc thi công (Đợt 2 — 2A, 0182) ------------------------------------
    // Danh mục kiểm tra từng mốc + bộ mốc mặc định của pháp nhân. Chạy lại thì cập nhật nội dung;
    // công trình đã áp mốc giữ nhãn đã chụp, biên bản đã ký không đổi (0136).
    for (const set of MILESTONE_SET_SEEDS) {
      const companyId = companyByCode.get(set.company);
      if (!companyId) continue;
      const steps = [];
      for (const step of set.steps) {
        const rows = await db.execute<{ id: string }>(sqlOp`
          INSERT INTO public.acceptance_checklists (company_id, name, acceptance_type, items)
          VALUES (${companyId}, ${step.checklistName}, 'noi_bo', ${JSON.stringify(step.items)}::jsonb)
          ON CONFLICT (company_id, name)
          DO UPDATE SET items = EXCLUDED.items, acceptance_type = 'noi_bo', is_active = true,
                        deleted_at = NULL
          RETURNING id`);
        steps.push({
          key: step.key,
          label: step.label,
          checklist_id: rows[0]!.id,
          requires_technical_check: step.requiresTechnicalCheck,
        });
      }
      await db.execute(sqlOp`
        INSERT INTO public.milestone_templates (company_id, name, is_default, steps)
        VALUES (${companyId}, ${set.name}, true, ${JSON.stringify(steps)}::jsonb)
        ON CONFLICT (company_id, name)
        DO UPDATE SET steps = EXCLUDED.steps, is_default = true, is_active = true, deleted_at = NULL`);
    }
    console.log(`Bộ mốc thi công: ${MILESTONE_SET_SEEDS.length}`);

    // --- Bộ mẫu hợp đồng ba pháp nhân (0185) -------------------------------------
    // Tệp sinh bằng db/seed-assets/contract-templates/convert.py từ bộ dự thảo anh Dũng gửi
    // 21/10/2026. Tên tệp lưu theo băm nội dung: chạy lại với cùng tệp thì chỉ cập nhật các đợt
    // gợi ý; tệp đổi thì ngừng dùng bản cũ, nạp bản mới (tệp + chỗ trống của mẫu bất biến, 0171).
    let templateCount = 0;
    for (const code of ['NVC', 'NVO', 'NVS']) {
      const companyId = companyByCode.get(code);
      if (!companyId) continue;
      const dir = new URL(`../../seed-assets/contract-templates/${code}/`, import.meta.url);
      const manifest = JSON.parse(
        readFileSync(new URL('manifest.json', dir), 'utf8'),
      ) as ContractTemplateAsset[];
      for (const m of manifest) {
        const path = `${companyId}/bo-mau-${m.sha}.docx`;
        const active = await db.execute<{ id: string; storage_path: string }>(sqlOp`
          SELECT id, storage_path FROM public.contract_templates
          WHERE company_id = ${companyId} AND title = ${m.title} AND is_active`);
        const same = active.find((r) => r.storage_path === path);
        if (same) {
          await db.execute(sqlOp`
            UPDATE public.contract_templates
            SET payment_milestones = ${JSON.stringify(m.payment_milestones)}::jsonb
            WHERE id = ${same.id}`);
          templateCount++;
          continue;
        }
        const upload = await admin.storage
          .from('contract-templates')
          .upload(path, readFileSync(new URL(m.file, dir)), {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true,
          });
        if (upload.error) throw new Error(`Không tải được mẫu ${m.code}: ${upload.error.message}`);
        await db.execute(sqlOp`
          UPDATE public.contract_templates SET is_active = false
          WHERE company_id = ${companyId} AND title = ${m.title} AND is_active`);
        await db.execute(sqlOp`
          INSERT INTO public.contract_templates
            (company_id, title, contract_type, storage_path, file_name, tags, payment_milestones, notes)
          VALUES (${companyId}, ${m.title}, ${m.contract_type}::public.contract_type, ${path},
                  ${m.file}, ${JSON.stringify(m.tags)}::jsonb,
                  ${JSON.stringify(m.payment_milestones)}::jsonb,
                  ${'Bộ mẫu dự thảo NVG (21/10/2026) — dùng như chính thức, chờ pháp chế rà soát.'})`);
        templateCount++;
      }
    }
    console.log(`Mẫu hợp đồng: ${templateCount}`);
    console.log(`\nMật khẩu đăng nhập thử: ${SEED_PASSWORD}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('Seed thất bại:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
