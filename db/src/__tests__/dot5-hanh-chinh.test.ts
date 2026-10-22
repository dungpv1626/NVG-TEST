/**
 * Đợt 5 — 5F: Hành chính (migration 0206).
 *
 * Canh:
 *  1. Giấy tờ pháp nhân: Hành chính – Nhân sự lập / sửa; Kinh doanh không thấy, không lập; tệp
 *     đính kèm phải nằm ở thư mục của đúng giấy tờ; người ngoài không đọc được tệp.
 *  2. Nhắc hạn: đã hết hạn thì luôn báo (một lần); số ngày nhắc trước để TRỐNG thì giấy còn hạn
 *     không bị báo; đặt số ngày thì báo; gia hạn thì nhắc lại từ đầu.
 *  3. Tài sản cấp phát ký nhận: ký một lần, chữ ký phải ở thư mục đúng biên bản; Kinh doanh không
 *     tải chữ ký lên được.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/dot5-hanh-chinh.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const isoDate = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

describeDb('5F — giấy tờ pháp nhân + tài sản ký nhận (0206)', () => {
  let ns: SupabaseClient;
  let kd: SupabaseClient;
  let nvc: string;
  let nsUserId: string;

  beforeAll(async () => {
    ns = await signInAs(ACCOUNTS.nhanSu);
    kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    nvc = (await ns.from('companies').select('id').eq('code', 'NVC').single()).data!.id;
    nsUserId = (await ns.rpc('auth_user_id')).data as string;
  });

  afterAll(async () => {
    await sqlRun(async (sql) => {
      await sql`DELETE FROM notifications WHERE related_entity_id IN (
        SELECT id FROM company_documents WHERE title LIKE ${TEST_PREFIX + '%'})`;
      await sql`DELETE FROM company_documents WHERE title LIKE ${TEST_PREFIX + '%'}`;
      await sql`UPDATE system_parameters SET value = NULL
                WHERE param_key = 'hc.document_remind_days' AND scope_type = 'global'`;
    });
  });

  async function newDoc(title: string, expiry: string | null) {
    const r = await ns
      .from('company_documents')
      .insert({
        company_id: nvc,
        category: 'giay_phep',
        title: `${TEST_PREFIX} ${title}`,
        expiry_date: expiry,
        responsible_user_id: nsUserId,
      })
      .select('id, module')
      .single();
    if (r.error) throw new Error(r.error.message);
    return r.data as { id: string; module: string };
  }

  it('Hành chính lập giấy tờ; Kinh doanh không thấy, không lập', async () => {
    const doc = await newDoc('Giấy phép xây dựng thử', isoDate(200));
    expect(doc.module).toBe('NS');

    const seen = await kd.from('company_documents').select('id').eq('id', doc.id);
    expect(seen.data ?? []).toHaveLength(0);
    const ins = await kd.from('company_documents').insert({
      company_id: nvc,
      category: 'giay_phep',
      title: `${TEST_PREFIX} KD tự lập`,
    });
    expect(ins.error).toBeTruthy();
  });

  it('tệp đính kèm đúng thư mục giấy tờ; Kinh doanh không đọc được tệp', async () => {
    const doc = await newDoc('Bảo hiểm cháy nổ thử', isoDate(100));
    const path = `${nvc}/${doc.id}/${crypto.randomUUID()}.pdf`;
    const up = await ns.storage
      .from('company-docs')
      .upload(path, new Blob([PDF], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    expect(up.error).toBeNull();
    const ok = await ns
      .from('company_documents')
      .update({ file_path: path, file_name: 'bao-hiem.pdf' })
      .eq('id', doc.id)
      .select('file_path')
      .single();
    expect(ok.error).toBeNull();

    const wrong = await ns
      .from('company_documents')
      .update({ file_path: `${nvc}/${crypto.randomUUID()}/x.pdf` })
      .eq('id', doc.id)
      .select('id');
    expect(wrong.error?.message ?? '').toContain('không thuộc');

    const kdUrl = await kd.storage.from('company-docs').createSignedUrl(path, 60);
    expect(kdUrl.data?.signedUrl ?? null).toBeNull();
    const kdUp = await kd.storage
      .from('company-docs')
      .upload(`${nvc}/${doc.id}/kd.pdf`, new Blob([PDF], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    expect(kdUp.error).toBeTruthy();
  });

  it('nhắc hạn: hết hạn luôn báo một lần; số ngày nhắc TRỐNG thì giấy còn hạn không báo', async () => {
    const expired = await newDoc('Đăng kiểm xe tải thử', isoDate(-3));
    const soon = await newDoc('Giấy phép sắp hết thử', isoDate(10));

    const count = (id: string) =>
      sqlRun(
        async (sql) =>
          (
            await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications
              WHERE related_entity_id = ${id} AND type = 'company_document_expiry'`
          )[0]!.n,
      );

    await sqlRun((sql) => sql`SELECT scan_company_document_reminders()`);
    expect(await count(expired.id)).toBe(1);
    expect(await count(soon.id)).toBe(0);

    await sqlRun((sql) => sql`SELECT scan_company_document_reminders()`);
    expect(await count(expired.id)).toBe(1);

    await sqlRun(
      (sql) => sql`UPDATE system_parameters SET value = '30'::jsonb
                   WHERE param_key = 'hc.document_remind_days' AND scope_type = 'global'`,
    );
    await sqlRun((sql) => sql`SELECT scan_company_document_reminders()`);
    expect(await count(soon.id)).toBe(1);
    await sqlRun(
      (sql) => sql`UPDATE system_parameters SET value = NULL
                   WHERE param_key = 'hc.document_remind_days' AND scope_type = 'global'`,
    );

    // Gia hạn rồi lại hết hạn → báo lần nữa.
    await ns
      .from('company_documents')
      .update({ expiry_date: isoDate(-1) })
      .eq('id', expired.id);
    await sqlRun((sql) => sql`SELECT scan_company_document_reminders()`);
    expect(await count(expired.id)).toBe(2);
  });

  it('tài sản cấp phát: ký nhận một lần, chữ ký đúng thư mục; Kinh doanh không tải chữ ký lên', async () => {
    const asset = await ns
      .from('assets')
      .insert({ company_id: nvc, name: `${TEST_PREFIX} Máy tính xách tay 5F` })
      .select('id')
      .single();
    expect(asset.error).toBeNull();
    const emp = await ns
      .from('employees')
      .select('id')
      .eq('company_id', nvc)
      .neq('status', 'da_nghi')
      .is('deleted_at', null)
      .limit(1)
      .single();
    const ev = await ns.rpc('record_asset_event', {
      p_asset_id: asset.data!.id,
      p_type: 'cap_phat',
      p_event_date: isoDate(0),
      p_to_employee_id: emp.data!.id,
    });
    expect(ev.error).toBeNull();
    const eventId = ev.data as string;
    const path = `${nvc}/${asset.data!.id}/${eventId}/ky-nhan.png`;

    const kdUp = await kd.storage
      .from('asset-signatures')
      .upload(
        `${nvc}/${asset.data!.id}/${eventId}/kd.png`,
        new Blob([PNG], { type: 'image/png' }),
        {
          contentType: 'image/png',
        },
      );
    expect(kdUp.error).toBeTruthy();

    const up = await ns.storage
      .from('asset-signatures')
      .upload(path, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });
    expect(up.error).toBeNull();

    const wrong = await ns.rpc('sign_asset_event', {
      p_event_id: eventId,
      p_signer_name: 'Người nhận thử',
      p_signature_path: `${nvc}/${asset.data!.id}/${crypto.randomUUID()}/x.png`,
    });
    expect(wrong.error?.message ?? '').toContain('không thuộc');

    const kdSign = await kd.rpc('sign_asset_event', {
      p_event_id: eventId,
      p_signer_name: 'KD ký hộ',
      p_signature_path: path,
    });
    expect(kdSign.error).toBeTruthy();

    const signed = await ns.rpc('sign_asset_event', {
      p_event_id: eventId,
      p_signer_name: 'Người nhận thử',
      p_signature_path: path,
    });
    expect(signed.error).toBeNull();
    const again = await ns.rpc('sign_asset_event', {
      p_event_id: eventId,
      p_signer_name: 'Ký lại',
      p_signature_path: path,
    });
    expect(again.error?.message ?? '').toContain('đã ký');

    const row = await ns
      .from('asset_events')
      .select('receiver_signer_name, signed_at')
      .eq('id', eventId)
      .single();
    expect(row.data!.receiver_signer_name).toBe('Người nhận thử');
    expect(row.data!.signed_at).not.toBeNull();
  });
});
