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
import { createClient } from '@supabase/supabase-js';
import { eq, sql as sqlOp } from 'drizzle-orm';
import { DEFAULT_APPROVAL_LIMITS } from '@nvg/shared';
import { createConnection } from '../client';
import { approvalLimits, companies, permissions, roles, userCompanies, users } from '../schema/index';
import { COMPANY_SEED, ROLE_SEED, SEED_PASSWORD, USER_SEED } from './data';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}.`);
  return v;
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
    for (const c of COMPANY_SEED) {
      await db
        .insert(companies)
        .values({
          code: c.code,
          legalName: c.legalName,
          shortName: c.shortName,
          taxCode: c.taxCode,
          address: c.address,
          legalRepresentative: c.legalRepresentative,
          isTransactional: c.isTransactional,
          displayOrder: c.displayOrder,
        })
        .onConflictDoUpdate({
          target: companies.code,
          set: {
            legalName: c.legalName,
            shortName: c.shortName,
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
        })
        .onConflictDoUpdate({
          target: roles.code,
          set: {
            label: r.label,
            description: r.description,
            seesAllCompanies: r.seesAllCompanies,
            defaultRoute: r.defaultRoute,
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
    console.log(`\nMật khẩu đăng nhập thử: ${SEED_PASSWORD}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('Seed thất bại:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
