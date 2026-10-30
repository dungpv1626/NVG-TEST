/**
 * Link khách xem «Bộ ý tưởng» AI Design (B5, migration 0259).
 *
 * Quy tắc phải đứng:
 *  - Link chỉ mở được SAU khi kiến trúc sư duyệt; Kinh doanh và lãnh đạo (chỉ ĐỌC thiết kế) không duyệt được,
 *    chỉ vai trò ghi được bộ môn kiến trúc (Thiết kế).
 *  - Hồ sơ gắn cơ hội chưa có báo cáo khảo sát ĐÃ DUYỆT thì không đề nghị được.
 *  - Hết hạn / thu hồi thì trang công khai không trả gì; hàm công khai chỉ khoá service gọi được.
 *  - Người pháp nhân khác không thấy, không duyệt được; trình duyệt không ghi thẳng bảng.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/concept-share.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, anonClient, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

type Sql = ReturnType<typeof import('../client').createConnection>['sql'];

async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

function fakeArtifactId(seed: string): string {
  let hex = '';
  for (let i = 0; hex.length < 64; i++) hex += (seed.charCodeAt(i % seed.length) + i).toString(16);
  return `sha256:${hex.slice(0, 64)}`;
}

interface PublicRow {
  status: string;
  project_id?: string;
  brief_artifact_id?: string;
  facade_artifact_id?: string;
}

async function publicView(token: string, count = true): Promise<PublicRow> {
  return withSql(async (sql) => {
    const [r] = await sql<{ r: PublicRow }[]>`
      SELECT public.design_concept_public(${token}, ${count}) AS r`;
    return r!.r;
  });
}

async function tokenOf(shareId: string): Promise<string> {
  return withSql(async (sql) => {
    const [r] = await sql<{ token: string }[]>`
      SELECT token FROM design_concept_shares WHERE id = ${shareId}`;
    return r!.token;
  });
}

describeDb('Link gửi khách xem bộ ý tưởng (0259)', () => {
  let thietKe: SupabaseClient;
  let kd: SupabaseClient;
  let tgd: SupabaseClient;
  let kdNvc: SupabaseClient;
  let fx: { projectId: string; opportunityId: string; briefId: string; facadeId: string };
  let shareId: string;

  beforeAll(async () => {
    [thietKe, kd, tgd, kdNvc] = await Promise.all([
      signInAs(ACCOUNTS.thietKeNvo),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.kinhDoanhNvc),
    ]);
    fx = await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvo] = await sql<{ id: string; tenant_id: string }[]>`
        SELECT id, tenant_id FROM companies WHERE code = 'NVO'`;
      const [kdUser] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvo}`;
      const [cu] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name, phone)
        VALUES (${'KH-YT-' + stamp}, ${TEST_PREFIX + ' Khách ý tưởng ' + stamp}, '0912000259')
        RETURNING id`;
      const [opp] = await sql<{ id: string }[]>`
        INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
        VALUES (${nvo!.id}, ${'NVO-CH-YT-' + stamp}, ${cu!.id},
                ${TEST_PREFIX + ' Cơ hội ý tưởng ' + stamp}, ${kdUser!.id}, 'khao_sat')
        RETURNING id`;
      const [p] = await sql<{ id: string }[]>`
        INSERT INTO design_projects (company_id, code, name, stage, opportunity_id, customer_id)
        VALUES (${nvo!.id}, ${'NVO-TK-2090-' + stamp.slice(-6)}, ${TEST_PREFIX + ' Bộ ý tưởng ' + stamp},
                'dau_bai', ${opp!.id}, ${cu!.id})
        RETURNING id`;
      const briefId = fakeArtifactId('brief' + stamp);
      const facadeId = fakeArtifactId('facade' + stamp);
      for (const [id, kind] of [
        [briefId, 'design_brief'],
        [facadeId, 'ai_facade_concept'],
      ] as const) {
        await sql`
          INSERT INTO design_artifact (id, tenant_id, company_id, project_id, discipline, kind, schema_version, payload_uri)
          VALUES (${id}, ${nvo!.tenant_id}, ${nvo!.id}, ${p!.id}, 'kien_truc', ${kind}, '1.0.0', ${'supabase://test/' + id})`;
        await sql`
          INSERT INTO design_head (tenant_id, project_id, discipline, kind, artifact_id)
          VALUES (${nvo!.tenant_id}, ${p!.id}, 'kien_truc', ${kind}, ${id})`;
      }
      return { projectId: p!.id, opportunityId: opp!.id, briefId, facadeId };
    });
  });

  it('cơ hội chưa có báo cáo khảo sát đã duyệt thì không đề nghị được', async () => {
    const ready = await kd.rpc('design_concept_share_readiness', { p_project_id: fx.projectId });
    expect(ready.error).toBeNull();
    expect(ready.data.can_request).toBe(false);
    expect(ready.data.reason).toMatch(/khảo sát/);

    const req = await kd.rpc('request_concept_share', { p_project_id: fx.projectId });
    expect(req.error?.message).toMatch(/khảo sát/);

    // Báo cáo còn chờ duyệt vẫn chưa đủ.
    await withSql(
      (sql) => sql`
        INSERT INTO site_surveys (opportunity_id, surveyed_at, report_status)
        VALUES (${fx.opportunityId}, now() - interval '1 hour', 'cho_duyet')`,
    );
    const again = await kd.rpc('request_concept_share', { p_project_id: fx.projectId });
    expect(again.error).not.toBeNull();
  });

  it('khảo sát đã duyệt: Kinh doanh đề nghị được; link chưa mở trước khi kiến trúc sư duyệt', async () => {
    await withSql(
      (sql) => sql`
        UPDATE site_surveys SET report_status = 'da_duyet', report_decided_at = now()
         WHERE opportunity_id = ${fx.opportunityId}`,
    );
    const req = await kd.rpc('request_concept_share', {
      p_project_id: fx.projectId,
      p_note: 'Khách hẹn xem tối thứ Bảy',
    });
    expect(req.error).toBeNull();
    shareId = req.data as string;

    // Trình duyệt không ghi thẳng bảng — kể cả kiến trúc sư.
    const direct = await thietKe.from('design_concept_shares').insert({
      company_id: '00000000-0000-0000-0000-000000000000',
      design_project_id: fx.projectId,
      requested_by: '00000000-0000-0000-0000-000000000000',
    });
    expect(direct.error).not.toBeNull();
    const upd = await thietKe
      .from('design_concept_shares')
      .update({ approved_at: new Date().toISOString() })
      .eq('id', shareId)
      .select('id');
    expect(upd.data ?? []).toHaveLength(0);

    expect((await publicView(await tokenOf(shareId))).status).toBe('not_found');

    // Kiến trúc sư được báo.
    const notes = await thietKe
      .from('notifications')
      .select('id')
      .eq('related_entity_id', shareId)
      .eq('type', 'concept_share_requested');
    expect(notes.data?.length).toBeGreaterThan(0);

    const list = await kd.rpc('design_concept_shares_for', { p_project_id: fx.projectId });
    const row = (
      list.data as Array<{ id: string; token: string | null; status: string; can_approve: boolean }>
    ).find((r) => r.id === shareId)!;
    expect(row.status).toBe('cho_duyet');
    expect(row.token).toBeNull();
    expect(row.can_approve).toBe(false);
  });

  it('Kinh doanh, Tổng Giám đốc (chỉ đọc thiết kế), người pháp nhân khác không duyệt được', async () => {
    for (const who of [kd, tgd, kdNvc]) {
      const r = await who.rpc('approve_concept_share', { p_share_id: shareId });
      expect(r.error).not.toBeNull();
    }
    const other = await kdNvc.rpc('design_concept_shares_for', { p_project_id: fx.projectId });
    expect(other.data ?? []).toHaveLength(0);
    const otherSelect = await kdNvc.from('design_concept_shares').select('id').eq('id', shareId);
    expect(otherSelect.data ?? []).toHaveLength(0);
    expect((await publicView(await tokenOf(shareId))).status).toBe('not_found');
  });

  it('kiến trúc sư duyệt: link mở 14 ngày, chụp bộ đang hiệu lực, đếm lượt xem, người đề nghị được báo', async () => {
    const list0 = await thietKe.rpc('design_concept_shares_for', { p_project_id: fx.projectId });
    expect(
      (list0.data as Array<{ id: string; can_approve: boolean }>).find((r) => r.id === shareId)!
        .can_approve,
    ).toBe(true);
    const ok = await thietKe.rpc('approve_concept_share', { p_share_id: shareId });
    expect(ok.error).toBeNull();
    const days = (Date.parse(ok.data as string) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);

    const token = await tokenOf(shareId);
    const pub = await publicView(token);
    expect(pub.status).toBe('ok');
    expect(pub.brief_artifact_id).toBe(fx.briefId);
    expect(pub.facade_artifact_id).toBe(fx.facadeId);
    await publicView(token, false); // lượt tải ảnh không tính
    await publicView(token);

    const list = await kd.rpc('design_concept_shares_for', { p_project_id: fx.projectId });
    const row = (
      list.data as Array<{
        id: string;
        token: string;
        status: string;
        view_count: number;
        can_send: boolean;
      }>
    ).find((r) => r.id === shareId)!;
    expect(row.status).toBe('da_duyet');
    expect(row.token).toBe(token);
    expect(row.view_count).toBe(2);
    expect(row.can_send).toBe(true);

    const notes = await kd
      .from('notifications')
      .select('id')
      .eq('related_entity_id', shareId)
      .eq('type', 'concept_share_approved');
    expect(notes.data?.length).toBe(1);

    // «Gửi qua Zalo» ghi lịch sử được cho link đã duyệt.
    const zalo = await kd.from('outbound_shares').insert({
      entity_type: 'design_concept_shares',
      entity_id: shareId,
      channel: 'zalo',
      via: 'zalo_web',
      recipient: '0912000259',
    });
    expect(zalo.error).toBeNull();
  });

  it('hàm công khai: trình duyệt (đăng nhập hay không) không gọi được', async () => {
    const token = await tokenOf(shareId);
    const byUser = await kd.rpc('design_concept_public', { p_token: token });
    expect(byUser.error).not.toBeNull();
    const byAnon = await anonClient().rpc('design_concept_public', { p_token: token });
    expect(byAnon.error).not.toBeNull();
  });

  it('thu hồi / hết hạn thì trang công khai không trả bộ ý tưởng', async () => {
    const token = await tokenOf(shareId);
    const rev = await kd.rpc('revoke_concept_share', { p_share_id: shareId });
    expect(rev.error).toBeNull();
    const after = await publicView(token);
    expect(after.status).toBe('expired');
    expect(after.project_id).toBeUndefined();
    // Đã thu hồi thì không duyệt / mở lại được.
    const reopen = await withSql(
      (sql) =>
        sql`UPDATE design_concept_shares SET revoked_at = NULL WHERE id = ${shareId} RETURNING revoked_at`,
    );
    expect(reopen[0]!.revoked_at).not.toBeNull();

    // Một link khác, duyệt rồi để hết hạn.
    const req = await thietKe.rpc('request_concept_share', { p_project_id: fx.projectId });
    expect(req.error).toBeNull();
    const second = req.data as string;
    expect((await thietKe.rpc('approve_concept_share', { p_share_id: second })).error).toBeNull();
    await withSql((sql) =>
      sql.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`
          UPDATE design_concept_shares
             SET approved_at = now() - interval '20 days', expires_at = now() - interval '6 days'
           WHERE id = ${second}`;
      }),
    );
    const expired = await publicView(await tokenOf(second));
    expect(expired.status).toBe('expired');
    const zalo = await kd.from('outbound_shares').insert({
      entity_type: 'design_concept_shares',
      entity_id: second,
      channel: 'zalo',
      via: 'zalo_web',
    });
    expect(zalo.error).not.toBeNull();
  });

  it('hồ sơ không gắn cơ hội: đề nghị được, vẫn phải chờ kiến trúc sư', async () => {
    const pid = await withSql(async (sql) => {
      const [nvo] = await sql<{ id: string; tenant_id: string }[]>`
        SELECT id, tenant_id FROM companies WHERE code = 'NVO'`;
      const [p] = await sql<{ id: string }[]>`
        INSERT INTO design_projects (company_id, code, name, stage)
        VALUES (${nvo!.id}, ${'NVO-TK-2091-' + String(Date.now()).slice(-6)},
                ${TEST_PREFIX + ' Ý tưởng không cơ hội'}, 'dau_bai')
        RETURNING id`;
      const id = fakeArtifactId('brief-free' + Date.now());
      await sql`
        INSERT INTO design_artifact (id, tenant_id, company_id, project_id, discipline, kind, schema_version, payload_uri)
        VALUES (${id}, ${nvo!.tenant_id}, ${nvo!.id}, ${p!.id}, 'kien_truc', 'design_brief', '1.0.0', 'supabase://test/x')`;
      await sql`
        INSERT INTO design_head (tenant_id, project_id, discipline, kind, artifact_id)
        VALUES (${nvo!.tenant_id}, ${p!.id}, 'kien_truc', 'design_brief', ${id})`;
      return p!.id;
    });
    const req = await kd.rpc('request_concept_share', { p_project_id: pid });
    expect(req.error).toBeNull();
    // Chỉ có đầu bài, chưa có ảnh nào: kiến trúc sư cũng chưa duyệt được.
    const ok = await thietKe.rpc('approve_concept_share', { p_share_id: req.data });
    expect(ok.error?.message).toMatch(/chưa có mặt đứng/);
  });
});
