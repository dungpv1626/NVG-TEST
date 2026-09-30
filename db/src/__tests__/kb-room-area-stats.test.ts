/**
 * Thống kê thực nghiệm diện tích phòng — migration `0102_kb_room_area_stats.sql`.
 *
 * Nguồn: `doc/design/06-knowledge-base.md` mục 6.0(b) và 6.4.
 *
 * Ba thứ chỉ chứng minh được trên CSDL thật:
 *  1. **Ngưỡng số công trình do CSDL cưỡng chế**, không phải do lớp gọi nhớ kiểm. Ngưỡng bị
 *     bỏ qua nghĩa là một trung vị dựa trên hai căn nhà được đem ra dùng như "gu NVG".
 *  2. **Thống kê đi qua RLS.** Hàm là SECURITY INVOKER; đặt nhầm DEFINER sẽ mở đường đọc số
 *     liệu của tenant khác qua một hàm trông vô hại.
 *  3. **Một bản ghi cũ lệch định dạng không làm đổ cả truy vấn** — kéo theo Lớp 2 hỏng vì
 *     một hồ sơ số hoá từ năm ngoái.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kb-room-area-stats.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

let counter = 0;
const nextCode = () => `${TEST_PREFIX} KBS-${Date.now()}-${counter++}`;

/** Một công trình với `areas` phòng khách — số phòng do phép thử quyết định. */
function payload(areas: number[], over: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0.0',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    project_code: nextCode(),
    tier: 'A',
    quality_score: 0.8,
    building_type: 'nha_pho',
    site: { width_m: 5, depth_m: 18 },
    floors: 3,
    family_archetype: 'hat_nhan',
    style: 'hien_dai',
    floor_plans: [
      {
        level: 1,
        rooms: areas.map((area_m2) => ({
          type: 'living',
          polygon: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          area_m2,
        })),
      },
    ],
    has_brief: true,
    ...over,
  };
}

describeDb('Thống kê thực nghiệm diện tích phòng', () => {
  let thietKe: SupabaseClient;
  let kho: SupabaseClient;
  let admin: SupabaseClient;
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    kho = await signInAs(ACCOUNTS.kho);
    admin = await signInAs(ACCOUNTS.admin);
    tenantId = (await admin.from('tenants').select('id').eq('code', 'nvg').single()).data!.id;
    companyId = (await thietKe.from('companies').select('id').eq('code', 'NVO').single()).data!.id;
  });

  const insert = (areas: number[], over: Record<string, unknown> = {}) =>
    thietKe
      .from('kb_record')
      .insert({ tenant_id: tenantId, company_id: companyId, payload: payload(areas, over) })
      .select('id')
      .single();

  const stats = (client: SupabaseClient, args: Record<string, unknown> = {}) =>
    client.rpc('kb_room_area_stats', {
      p_tenant_id: tenantId,
      p_building_type: 'nha_pho',
      p_width_min: 4.5,
      p_width_max: 6,
      p_floors_min: 2,
      p_floors_max: 4,
      p_min_samples: 15,
      ...args,
    });

  it('kho chưa đủ công trình thì trả về RỖNG, không trả một trung vị mỏng', async () => {
    await insert([30, 32, 28]);
    const { data, error } = await stats(thietKe);
    expect(error).toBeNull();
    expect(
      (data ?? []).find((r: { room_type: string }) => r.room_type === 'living'),
    ).toBeUndefined();
  });

  it('nhiều phòng trong MỘT công trình không vượt được ngưỡng', async () => {
    // Ngưỡng đếm công trình. Đếm phòng thì một căn nhà mười lăm phòng ngủ tự nó thành
    // "phân bố" — đúng cái mục 6.0(b) gọi là trùng hợp.
    await insert(Array.from({ length: 20 }, (_, i) => 20 + i));
    const { data } = await stats(thietKe, { p_min_samples: 15 });
    expect((data ?? []).length).toBe(0);
  });

  it('đủ công trình thì trả trung vị và tứ phân vị', async () => {
    // Ba công trình, ngưỡng ba: 10 · 20 · 30 → trung vị 20.
    const codes = [10, 20, 30];
    for (const area of codes) await insert([area]);
    const { data } = await stats(thietKe, { p_min_samples: 3 });
    const living = (data ?? []).find((r: { room_type: string }) => r.room_type === 'living');
    expect(living).toBeDefined();
    expect(Number(living.project_count)).toBeGreaterThanOrEqual(3);
    expect(Number(living.median_m2)).toBeGreaterThan(0);
    expect(Number(living.p25_m2)).toBeLessThanOrEqual(Number(living.median_m2));
    expect(Number(living.median_m2)).toBeLessThanOrEqual(Number(living.p75_m2));
  });

  it('công trình ngoài dải bề rộng lô không tham gia', async () => {
    const { data: wide } = await insert([99], { site: { width_m: 12, depth_m: 20 } });
    expect(wide).not.toBeNull();
    const { data } = await stats(thietKe, { p_min_samples: 1 });
    const living = (data ?? []).find((r: { room_type: string }) => r.room_type === 'living');
    // 99 m² là con số không thể lẫn: nó chỉ vào được kết quả nếu bộ lọc bề rộng lô hỏng.
    expect(Number(living?.p75_m2 ?? 0)).toBeLessThan(99);
  });

  it('bản ghi đã xoá mềm không tham gia', async () => {
    const { data: row } = await insert([777]);
    await thietKe
      .from('kb_record')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', row!.id);
    const { data } = await stats(thietKe, { p_min_samples: 1 });
    const living = (data ?? []).find((r: { room_type: string }) => r.room_type === 'living');
    expect(Number(living?.p75_m2 ?? 0)).toBeLessThan(777);
  });

  it('bản ghi thiếu kích thước lô không làm đổ truy vấn', async () => {
    await insert([25], { site: { depth_m: 18 } as unknown as Record<string, number> });
    const { error } = await stats(thietKe, { p_min_samples: 1 });
    expect(error).toBeNull();
  });

  it('vai trò không có quyền Thiết kế không đọc được thống kê', async () => {
    await insert([21]);
    const { data, error } = await stats(kho, { p_min_samples: 1 });
    // RLS của `kb_record` lọc sạch dòng trước khi hàm gộp — nên kết quả rỗng, không phải lỗi.
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });
});
