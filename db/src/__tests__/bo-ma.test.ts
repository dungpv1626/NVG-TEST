/**
 * Bộ mã thống nhất — migration 0132, `doc/BO_MA.md`.
 *
 * Canh ba điều mà giao diện không tự giữ được:
 *  1. Người dùng gửi mã gì thì CSDL cũng ghi đè bằng mã do nó cấp.
 *  2. Khách hàng và nhà cung cấp mang mã danh mục phẳng, không pháp nhân.
 *  3. Tài sản mang mã giao dịch có pháp nhân — trước 0132, tài sản tạo không mã thì kẹt «Chưa
 *     có mã» vĩnh viễn vì cột mã bị khoá sau khi tạo.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, cleanupTestData, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('bộ mã thống nhất (0132)', () => {
  afterAll(async () => {
    await cleanupTestData();
  });

  it('khách hàng: bỏ qua mã người dùng gửi, cấp KH-{5 số}', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data, error } = await kd
      .from('customers')
      .insert({ code: 'NVC-KH-2099-9999', name: `${TEST_PREFIX} Khách mã ${Date.now()}` })
      .select('code')
      .single();
    expect(error).toBeNull();
    expect(data!.code).toMatch(/^KH-\d{5,}$/);
  });

  it('nhà cung cấp: không cần gửi mã, cấp NCC-{5 số}', async () => {
    const mh = await signInAs(ACCOUNTS.muaHang);
    const { data, error } = await mh
      .from('suppliers')
      .insert({ name: `${TEST_PREFIX} NCC mã ${Date.now()}` })
      .select('code')
      .single();
    expect(error).toBeNull();
    expect(data!.code).toMatch(/^NCC-\d{5,}$/);
  });

  it('hai lượt tạo cùng lúc không nhận trùng mã', async () => {
    const mh = await signInAs(ACCOUNTS.muaHang);
    const results = await Promise.all(
      [1, 2].map((n) =>
        mh
          .from('suppliers')
          .insert({ name: `${TEST_PREFIX} NCC song song ${n} ${Date.now()}` })
          .select('code')
          .single(),
      ),
    );
    expect(results.map((r) => r.error)).toEqual([null, null]);
    const codes = results.map((r) => r.data!.code);
    expect(new Set(codes).size).toBe(2);
  });

  it('tài sản: cấp {PHÁP NHÂN}-TS-{NĂM}-{4 số} theo pháp nhân của dòng', async () => {
    const ns = await signInAs(ACCOUNTS.nhanSu);
    const { data: nvc } = await ns.from('companies').select('id').eq('code', 'NVC').single();
    const { data, error } = await ns
      .from('assets')
      .insert({
        company_id: nvc!.id,
        code: 'TU-DAT-MA',
        name: `${TEST_PREFIX} Tài sản mã ${Date.now()}`,
      })
      .select('code')
      .single();
    expect(error).toBeNull();
    expect(data!.code).toMatch(/^NVC-TS-\d{4}-\d{4,}$/);
  });

  it('mã đã cấp vẫn bị khoá, không sửa được', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: created } = await kd
      .from('customers')
      .insert({ name: `${TEST_PREFIX} Khách khoá mã ${Date.now()}` })
      .select('id, code')
      .single();
    const { error } = await kd
      .from('customers')
      .update({ code: 'KH-99999' })
      .eq('id', created!.id)
      .select('id')
      .single();
    expect(error).toBeTruthy();
  });

  it('trình duyệt không gọi thẳng được bộ cấp số nội bộ', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const catalog = await kd.rpc('issue_catalog_code', { p_record_type: 'KH' });
    const record = await kd.rpc('issue_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'TS',
    });
    expect(catalog.error).toBeTruthy();
    expect(record.error).toBeTruthy();
  });
});
