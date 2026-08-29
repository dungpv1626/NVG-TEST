/**
 * Truy hồi ba tầng và bước chú giải — migration `0099_kb_retrieval.sql`.
 *
 * Nguồn: `doc/design/06-knowledge-base.md` mục 6.3 và 6.1 (Bước 3).
 *
 * Bốn thứ chỉ chứng minh được trên CSDL thật:
 *  1. **Bộ lọc tầng 1+2 loại đúng cái cần loại** — hạng C, chất lượng thấp, lô lệch kích thước.
 *  2. **Truy hồi đi qua RLS.** Hàm là SECURITY INVOKER; đặt nhầm DEFINER sẽ mở đường đọc tri
 *     thức của tenant khác mà không có triệu chứng nào.
 *  3. **Chú giải và vector ghi cùng lúc**, nên không lệch nhau được.
 *  4. **Cột lọc mới suy từ payload** — cùng lý lẽ với các cột sinh đã có.
 *
 * Chạy: `npx vitest run --project logic db/src/__tests__/kb-retrieval.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

let counter = 0;
const nextCode = () => `${TEST_PREFIX} KBR-${Date.now()}-${counter++}`;

/** Vector 1536 chiều "cắm cờ" ở một trục — đủ để phân biệt gần/xa mà không cần gọi mô hình. */
function unitVector(axis: number): string {
  const values = new Array(1536).fill(0);
  values[axis] = 1;
  return `[${values.join(',')}]`;
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0.0',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    project_code: nextCode(),
    tier: 'A',
    quality_score: 0.84,
    building_type: 'nha_pho',
    site: { width_m: 5, depth_m: 18 },
    floors: 3,
    family_archetype: '3_the_he',
    style: 'hien_dai',
    floor_plans: [
      {
        level: 1,
        rooms: [
          {
            type: 'living',
            polygon: [
              [0, 0],
              [5, 0],
              [5, 6],
              [0, 6],
            ],
            area_m2: 30,
          },
        ],
      },
    ],
    adjacency_graph: [{ a: 'living_1', b: 'kitchen_1', kind: 'adjacent' }],
    slicing_tree: { split: 'H', ratio_hint: 0.4, a: { room: 'living' }, b: { room: 'bedroom' } },
    has_brief: true,
    ...overrides,
  };
}

describeDb('Knowledge Base — truy hồi ba tầng', () => {
  let thietKe: SupabaseClient;
  let kinhDoanh: SupabaseClient;
  let kho: SupabaseClient;
  let admin: SupabaseClient;
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);
    kho = await signInAs(ACCOUNTS.kho);
    admin = await signInAs(ACCOUNTS.admin);
    tenantId = (await admin.from('tenants').select('id').eq('code', 'nvg').single()).data!.id;
    companyId = (await thietKe.from('companies').select('id').eq('code', 'NVO').single()).data!.id;
  });

  const insert = (over: Record<string, unknown> = {}) =>
    thietKe
      .from('kb_record')
      .insert({ tenant_id: tenantId, company_id: companyId, payload: payload(over) })
      .select('*')
      .single();

  const retrieve = (client: SupabaseClient, args: Record<string, unknown> = {}) =>
    client.rpc('kb_retrieve_candidates', {
      p_tenant_id: tenantId,
      p_building_type: 'nha_pho',
      p_limit: 200,
      ...args,
    });

  describe('cột lọc mới suy từ payload', () => {
    it('kích thước lô, hồ sơ gia đình và phong cách do CSDL điền', async () => {
      const { data, error } = await insert();
      expect(error).toBeNull();
      expect(data!.site_width_m).toBeCloseTo(5);
      expect(data!.site_depth_m).toBeCloseTo(18);
      expect(data!.family_archetype).toBe('3_the_he');
      expect(data!.style).toBe('hien_dai');
    });

    it('bản ghi chưa chú giải thì cờ hàng chờ là false', async () => {
      // Danh sách "còn phải chú giải" phải suy từ dữ liệu, không phải từ một cờ ai đó nhớ bật.
      const { data } = await insert();
      expect(data!.has_rationale).toBe(false);
    });
  });

  describe('tầng 1 — lọc cứng', () => {
    it('hạng C không bao giờ vào few-shot', async () => {
      const { data } = await insert({ tier: 'C' });
      const found = await retrieve(thietKe);
      expect(found.data!.some((r: { id: string }) => r.id === data!.id)).toBe(false);
    });

    it('bản ghi dưới ngưỡng chất lượng bị loại', async () => {
      const { data } = await insert({ quality_score: 0.3 });
      const found = await retrieve(thietKe, { p_min_quality: 0.5 });
      expect(found.data!.some((r: { id: string }) => r.id === data!.id)).toBe(false);
    });

    it('không có cây chia không gian thì không làm few-shot được', async () => {
      const { data } = await insert({ slicing_tree: null });
      const strict = await retrieve(thietKe, { p_require_tree: true });
      const loose = await retrieve(thietKe, { p_require_tree: false });
      expect(strict.data!.some((r: { id: string }) => r.id === data!.id)).toBe(false);
      expect(loose.data!.some((r: { id: string }) => r.id === data!.id)).toBe(true);
    });

    it('số tầng lệch quá một tầng thì loại', async () => {
      const { data } = await insert({ floors: 3 });
      const near = await retrieve(thietKe, { p_floors: 4 });
      const far = await retrieve(thietKe, { p_floors: 6 });
      expect(near.data!.some((r: { id: string }) => r.id === data!.id)).toBe(true);
      expect(far.data!.some((r: { id: string }) => r.id === data!.id)).toBe(false);
    });

    it('loại chính công trình đang xét — đánh giá leave-one-out', async () => {
      // Ở kho dưới 50 bộ, tách riêng bộ dự án mẫu sẽ ngốn quá nửa kho (mục 6.0c). Quên tham
      // số này là tự chấm điểm bằng chính đáp án.
      const { data } = await insert();
      const code = (data!.payload as { project_code: string }).project_code;
      const found = await retrieve(thietKe, { p_exclude_code: code });
      expect(found.data!.some((r: { id: string }) => r.id === data!.id)).toBe(false);
    });
  });

  describe('tầng 2 — lọc hình học', () => {
    it('lô rộng lệch quá 0,5 m thì loại', async () => {
      const { data } = await insert({ site: { width_m: 5, depth_m: 18 } });
      const near = await retrieve(thietKe, { p_width_m: 5.4 });
      const far = await retrieve(thietKe, { p_width_m: 8 });
      expect(near.data!.some((r: { id: string }) => r.id === data!.id)).toBe(true);
      expect(far.data!.some((r: { id: string }) => r.id === data!.id)).toBe(false);
    });

    it('lô sâu lệch quá 2 m thì loại', async () => {
      const { data } = await insert({ site: { width_m: 5, depth_m: 18 } });
      const far = await retrieve(thietKe, { p_depth_m: 25 });
      expect(far.data!.some((r: { id: string }) => r.id === data!.id)).toBe(false);
    });
  });

  describe('tầng 3 — khoảng cách vector', () => {
    it('bản ghi chưa có vector nhận độ tương đồng 0, không phải bị loại', async () => {
      // Chưa chú giải nghĩa là chưa có tín hiệu này, KHÔNG phải "khác hoàn toàn" — loại nó ra
      // sẽ làm truy hồi trống rỗng suốt giai đoạn đầu, khi cả kho đều chưa chú giải.
      const { data } = await insert();
      const found = await retrieve(thietKe, { p_query_embedding: unitVector(0) });
      const row = found.data!.find((r: { id: string }) => r.id === data!.id);
      expect(row).toBeDefined();
      expect(row.similarity).toBe(0);
      expect(row.embedding).toBeNull();
    });

    it('vector trùng hướng cho độ tương đồng 1, vuông góc cho 0', async () => {
      const near = await insert();
      const far = await insert();
      await thietKe.rpc('kb_apply_rationale', {
        p_id: near.data!.id,
        p_rationale: { stair_position: 'lay_sang_gieng_troi' },
        p_embedding: unitVector(0),
      });
      await thietKe.rpc('kb_apply_rationale', {
        p_id: far.data!.id,
        p_rationale: { stair_position: 'be_rong_lo' },
        p_embedding: unitVector(7),
      });

      const found = await retrieve(thietKe, { p_query_embedding: unitVector(0) });
      const rows = found.data! as { id: string; similarity: number }[];
      expect(rows.find((r) => r.id === near.data!.id)!.similarity).toBeCloseTo(1, 5);
      expect(rows.find((r) => r.id === far.data!.id)!.similarity).toBeCloseTo(0, 5);
    });
  });

  describe('truy hồi đi qua RLS', () => {
    it('người không có quyền đọc hồ sơ thiết kế KHÔNG thấy ứng viên nào', async () => {
      // Hàm là SECURITY INVOKER. Đặt nhầm DEFINER sẽ mở đường đọc tri thức của tenant khác,
      // và điều đó không có triệu chứng nào ngoài việc kết quả trông "đầy đủ hơn".
      await insert();
      const found = await retrieve(kho);
      expect(found.error).toBeNull();
      expect(found.data).toEqual([]);
    });

    it('Kinh doanh ĐỌC được hồ sơ kiến trúc — và đó là chủ ý', async () => {
      // Migration 0097 cấp `design.read.kien_truc` cho Kinh doanh để họ tra hồ sơ cũ khi tư
      // vấn khách. Test này chốt lại điều đó: một lần "siết quyền cho chắc" sẽ làm đỏ ở đây
      // thay vì âm thầm cắt mất một luồng nghiệp vụ.
      const { data } = await insert();
      const found = await retrieve(kinhDoanh);
      expect(found.data!.some((r: { id: string }) => r.id === data!.id)).toBe(true);
    });
  });

  describe('Bước 3 — chú giải của kiến trúc sư', () => {
    it('ghi chú giải và vector trong cùng một lần, cờ hàng chờ đổi theo', async () => {
      const { data } = await insert();
      const applied = await thietKe.rpc('kb_apply_rationale', {
        p_id: data!.id,
        p_rationale: { stair_position: 'lay_sang_gieng_troi', would_change: 'nới bếp' },
        p_embedding: unitVector(3),
      });
      expect(applied.error).toBeNull();

      const after = await thietKe
        .from('kb_record')
        .select('payload, has_rationale')
        .eq('id', data!.id)
        .single();
      expect(after.data!.has_rationale).toBe(true);
      expect((after.data!.payload as { rationale: { stair_position: string } }).rationale).toEqual({
        stair_position: 'lay_sang_gieng_troi',
        would_change: 'nới bếp',
      });
    });

    it('ghi luôn kết quả thực tế của công trình — câu hỏi thứ năm', async () => {
      // Câu "Khách có hài lòng không? Thi công có phát sinh gì?" thuộc trường `outcome` của
      // hợp đồng, không thuộc `rationale`. Ghi cùng một lần để hai phần không lệch nhau.
      const { data } = await insert();
      await thietKe.rpc('kb_apply_rationale', {
        p_id: data!.id,
        p_rationale: { stair_position: 'be_rong_lo' },
        p_embedding: null,
        p_outcome: { client_satisfied: true, construction_issues: ['lún nền nhẹ'] },
      });
      const after = await thietKe.from('kb_record').select('payload').eq('id', data!.id).single();
      expect((after.data!.payload as { outcome: { client_satisfied: boolean } }).outcome).toEqual({
        client_satisfied: true,
        construction_issues: ['lún nền nhẹ'],
      });
    });

    it('chú giải KHÔNG làm mất phần đã trích', async () => {
      const { data } = await insert();
      await thietKe.rpc('kb_apply_rationale', {
        p_id: data!.id,
        p_rationale: { stair_position: 'be_rong_lo' },
        p_embedding: null,
      });
      const after = await thietKe
        .from('kb_record')
        .select('payload, quality_score, has_slicing_tree')
        .eq('id', data!.id)
        .single();
      expect(after.data!.has_slicing_tree).toBe(true);
      expect(after.data!.quality_score).toBeCloseTo(0.84);
      expect((after.data!.payload as { floor_plans: unknown[] }).floor_plans).toHaveLength(1);
    });

    it('người không đủ quyền không sửa được, và không biết bản ghi có tồn tại hay không', async () => {
      // Trả lời khác nhau cho "không tồn tại" và "không đủ quyền" là cách để người ngoài
      // tenant dò xem bản ghi nào có thật.
      const { data } = await insert();
      const denied = await kinhDoanh.rpc('kb_apply_rationale', {
        p_id: data!.id,
        p_rationale: { stair_position: 'be_rong_lo' },
        p_embedding: null,
      });
      const missing = await kinhDoanh.rpc('kb_apply_rationale', {
        p_id: '00000000-0000-0000-0000-0000000000ff',
        p_rationale: null,
        p_embedding: null,
      });
      expect(denied.error).not.toBeNull();
      expect(denied.error!.message).toBe(missing.error!.message);
    });
  });
});
