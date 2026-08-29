/**
 * Knowledge Base — phân quyền và tính toàn vẹn của bản ghi hồ sơ đã số hoá.
 *
 * Nguồn: `doc/design/06-knowledge-base.md` mục 6.0 và 6.2. Migration `0098_kb_records.sql`.
 *
 * Hai thứ chỉ chứng minh được trên CSDL thật:
 *  1. **Cột sinh không lệch được với `payload`.** Đây là cách bảng này giữ một nguồn sự thật
 *     duy nhất; kiểm bằng mã TypeScript chỉ chứng minh mã nghĩ gì, không chứng minh Postgres
 *     làm gì.
 *  2. **Chiều bộ môn của phân quyền.** Người thiết kế có `design.write.kien_truc` nhưng KHÔNG
 *     có `design.write.ket_cau` — ranh giới đó nằm trong policy, không nằm ở tầng ứng dụng.
 *
 * Chạy: `npx vitest run --project logic db/src/__tests__/kb-records.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  hasCredentials,
  PG_INSUFFICIENT_PRIVILEGE,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

let counter = 0;
const nextCode = () => `${TEST_PREFIX} KB-${Date.now()}-${counter++}`;

/** Bản ghi tối thiểu hợp lệ theo `contracts/kb-record.schema.json`. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0.0',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    project_code: nextCode(),
    tier: 'A',
    quality_score: 0.84,
    building_type: 'nha_pho',
    site: { width_m: 5, depth_m: 16 },
    floors: 2,
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
    slicing_tree: { split: 'H', ratio_hint: 0.4, a: { room: 'living' }, b: { room: 'bedroom' } },
    has_brief: true,
    ...overrides,
  };
}

describeDb('Knowledge Base — bản ghi hồ sơ đã số hoá', () => {
  let thietKe: SupabaseClient;
  let kinhDoanh: SupabaseClient;
  let admin: SupabaseClient;

  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);
    admin = await signInAs(ACCOUNTS.admin);

    tenantId = (await admin.from('tenants').select('id').eq('code', 'nvg').single()).data!.id;
    companyId = (await thietKe.from('companies').select('id').eq('code', 'NVO').single()).data!.id;
  });

  const insert = (client: SupabaseClient, extra: Record<string, unknown> = {}) =>
    client
      .from('kb_record')
      .insert({ tenant_id: tenantId, company_id: companyId, payload: payload(), ...extra })
      .select('*')
      .single();

  describe('một nguồn sự thật — cột lọc suy từ payload', () => {
    it('cột lọc được CSDL điền từ payload, không do người ghi cấp', async () => {
      const { data, error } = await insert(thietKe);
      expect(error).toBeNull();
      expect(data!.building_type).toBe('nha_pho');
      expect(data!.floors).toBe(2);
      expect(data!.quality_score).toBeCloseTo(0.84);
      expect(data!.tier).toBe('A');
      expect(data!.has_brief).toBe(true);
    });

    it('ghi thẳng vào cột sinh bị CSDL từ chối', async () => {
      // Đây là điều làm cho "một nguồn sự thật" thành ràng buộc chứ không phải quy ước: kể cả
      // khi ai đó cố tình ghi một `building_type` khác payload, Postgres cũng không cho.
      const { error } = await insert(thietKe, { building_type: 'biet_thu' });
      expect(error).not.toBeNull();
    });

    it('sửa payload thì cột lọc đổi theo', async () => {
      const { data } = await insert(thietKe);
      const updated = await thietKe
        .from('kb_record')
        .update({ payload: { ...(data!.payload as object), quality_score: 0.5 } })
        .eq('id', data!.id)
        .select('quality_score')
        .single();
      expect(updated.data!.quality_score).toBeCloseTo(0.5);
    });

    it('không dựng được cây chia không gian thì cờ few-shot là false', async () => {
      // Bản ghi vẫn dùng cho thống kê, nhưng KHÔNG được đưa vào prompt Layer 3a làm few-shot.
      const { data } = await insert(thietKe, { payload: payload({ slicing_tree: null }) });
      expect(data!.has_slicing_tree).toBe(false);
    });

    it('có cây chia không gian thì cờ few-shot là true', async () => {
      const { data } = await insert(thietKe);
      expect(data!.has_slicing_tree).toBe(true);
    });
  });

  describe('phân quyền — tenant và bộ môn', () => {
    it('người thiết kế ghi được bản ghi kiến trúc', async () => {
      const { error } = await insert(thietKe);
      expect(error).toBeNull();
    });

    it('người thiết kế KHÔNG ghi được bản ghi kết cấu', async () => {
      // Phòng Thiết kế có `design.write.kien_truc` nhưng không có `design.write.ket_cau` —
      // ranh giới bộ môn là ràng buộc pháp lý, không phải tuỳ chọn cấu hình.
      const { error } = await insert(thietKe, { discipline: 'ket_cau' });
      expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('Kinh doanh đọc được bản ghi kiến trúc', async () => {
      const { data } = await insert(thietKe);
      const seen = await kinhDoanh.from('kb_record').select('id').eq('id', data!.id).maybeSingle();
      expect(seen.data?.id).toBe(data!.id);
    });

    it('Kinh doanh KHÔNG ghi được', async () => {
      const { error } = await insert(kinhDoanh);
      expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('Quản trị hệ thống đọc được nhưng KHÔNG ghi được', async () => {
      // Cố ý: số hoá hồ sơ là việc chuyên môn, không phải việc quản trị hệ thống.
      const { data } = await insert(thietKe);
      const seen = await admin.from('kb_record').select('id').eq('id', data!.id).maybeSingle();
      expect(seen.data?.id).toBe(data!.id);
      const written = await insert(admin);
      expect(written.error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('bộ môn `phuong_an` bị chặn — nó là giai đoạn, không phải bộ môn kỹ thuật', async () => {
      const { error } = await insert(thietKe, { discipline: 'phuong_an' });
      expect(error).not.toBeNull();
    });
  });

  describe('vòng đời — sửa được, không xoá cứng được', () => {
    it('bổ sung được chú giải của kiến trúc sư vào bản ghi đã trích', async () => {
      // Bước 3 của pipeline. Khác `design_artifact`: bản ghi Knowledge Base KHÔNG bất biến.
      const { data } = await insert(thietKe);
      const updated = await thietKe
        .from('kb_record')
        .update({
          payload: {
            ...(data!.payload as object),
            rationale: { stair_position: 'lay_sang_gieng_troi' },
          },
        })
        .eq('id', data!.id)
        .select('payload')
        .single();
      expect(
        (updated.data!.payload as { rationale: { stair_position: string } }).rationale
          .stair_position,
      ).toBe('lay_sang_gieng_troi');
    });

    it('KHÔNG xoá cứng được — số hoá một bộ hồ sơ tốn công người', async () => {
      const { data } = await insert(thietKe);
      await thietKe.from('kb_record').delete().eq('id', data!.id);
      const still = await thietKe.from('kb_record').select('id').eq('id', data!.id).maybeSingle();
      expect(still.data?.id).toBe(data!.id);
    });

    it('xoá mềm rồi thì số hoá lại cùng mã công trình được', async () => {
      // Chỉ mục duy nhất là MỘT PHẦN (`WHERE deleted_at IS NULL`) đúng vì lý do này.
      const shared = payload();
      const first = await insert(thietKe, { payload: shared });
      expect(first.error).toBeNull();

      const duplicate = await insert(thietKe, { payload: shared });
      expect(duplicate.error, 'trùng mã khi bản cũ còn hiệu lực phải bị chặn').not.toBeNull();

      await thietKe
        .from('kb_record')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', first.data!.id);

      const redone = await insert(thietKe, { payload: shared });
      expect(redone.error).toBeNull();
    });
  });
});
