/**
 * Đầu bài có cấu trúc — migration `0101_tk_design_brief_structured.sql`.
 *
 * Nguồn: `doc/design/03-data-contracts.md` mục 3.1, `doc/design/08-milestones.md` Mốc 2.
 *
 * Bốn thứ chỉ chứng minh được trên CSDL thật:
 *
 *  1. **Cột sinh không lệch được với `structured`** — đây là cách bảng giữ một nguồn sự
 *     thật duy nhất; kiểm bằng TypeScript chỉ chứng minh mã nghĩ gì, không chứng minh
 *     Postgres làm gì.
 *  2. **Đóng băng sau khi xác nhận.** Artifact `design_brief` là mã băm nội dung của
 *     `structured`; sửa nó tại chỗ sau khi đúc làm CSDL và artifact nói khác nhau mà không
 *     có triệu chứng nào.
 *  3. **Bản nháp vẫn sửa được.** Đóng băng quá tay thì biểu mẫu ba mươi trường đẻ ra một
 *     phiên bản cho mỗi lần lưu, và từ bản thứ hai lại bắt buộc nêu lý do.
 *  4. **Hành vi TK-01 cũ không đổi** — điều kiện ra của Mốc 2 là "không module nào hỏng".
 *
 * Chạy: `npx vitest run --project logic db/src/__tests__/design-brief-structured.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

let counter = 0;

/** Đầu bài tối thiểu hợp lệ theo `contracts/design-brief.schema.json`. */
function structured(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0.0',
    building_type: 'nha_pho',
    locality: 'hung_yen',
    site: { width_m: 5, depth_m: 18 },
    floors: 3,
    completeness_score: 0.62,
    missing_fields: ['style', 'priorities'],
    ...overrides,
  };
}

describeDb('Đầu bài có cấu trúc (TK-10)', () => {
  let thietKe: SupabaseClient;
  let kinhDoanh: SupabaseClient;
  let companyId: string;
  let projectId: string;

  beforeAll(async () => {
    thietKe = await signInAs(ACCOUNTS.thietKeNvo);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvo);
    companyId = (await thietKe.from('companies').select('id').eq('code', 'NVO').single()).data!.id;
  });

  /** Mỗi phép thử một dự án riêng: chỉ mục "một đầu bài hiệu lực" tính theo dự án. */
  async function newProject(): Promise<string> {
    const { data, error } = await thietKe
      .from('design_projects')
      .insert({
        company_id: companyId,
        code: `${TEST_PREFIX} DB-${Date.now()}-${counter++}`,
        name: `${TEST_PREFIX} Nhà anh A`,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  const insert = (project: string, extra: Record<string, unknown> = {}) =>
    thietKe
      .from('design_briefs')
      .insert({
        company_id: companyId,
        design_project_id: project,
        structured: structured(),
        ...extra,
      })
      .select('*')
      .single();

  beforeAll(async () => {
    projectId = await newProject();
  });

  describe('một nguồn sự thật — cột sinh suy từ structured', () => {
    it('điểm và danh sách còn thiếu do CSDL trích, không do người ghi cấp', async () => {
      const { data, error } = await insert(projectId);
      expect(error).toBeNull();
      expect(Number(data!.completeness_score)).toBeCloseTo(0.62);
      expect(data!.missing_fields).toEqual(['style', 'priorities']);
    });

    it('ghi thẳng vào cột sinh bị CSDL từ chối', async () => {
      // Đây là thứ làm "một nguồn sự thật" thành ràng buộc chứ không phải quy ước.
      const project = await newProject();
      const { error } = await insert(project, { completeness_score: 0.99 });
      expect(error).not.toBeNull();
    });

    it('payload chưa có điểm thì cột để rỗng, không đổ lỗi ép kiểu', async () => {
      const project = await newProject();
      const { data, error } = await insert(project, {
        structured: { schema_version: '1.0.0', building_type: 'nha_pho' },
      });
      expect(error).toBeNull();
      expect(data!.completeness_score).toBeNull();
      expect(data!.missing_fields).toEqual([]);
    });

    it('structured phải là đối tượng', async () => {
      const project = await newProject();
      const { error } = await insert(project, { structured: [1, 2] });
      expect(error).not.toBeNull();
    });
  });

  describe('bản nháp sửa được, bản đã xác nhận thì không', () => {
    it('sửa structured của bản chưa xác nhận — được', async () => {
      // Biểu mẫu ba mươi trường mà mỗi lần lưu đẻ một phiên bản kèm lý do thì không ai dùng nổi.
      const project = await newProject();
      const { data } = await insert(project);
      const updated = await thietKe
        .from('design_briefs')
        .update({ structured: structured({ completeness_score: 0.85, floors: 4 }) })
        .eq('id', data!.id)
        .select('completeness_score, structured')
        .single();

      expect(updated.error).toBeNull();
      expect(Number(updated.data!.completeness_score)).toBeCloseTo(0.85);
    });

    it('xác nhận đầu bài — được', async () => {
      const project = await newProject();
      const { data } = await insert(project);
      const confirmed = await thietKe
        .from('design_briefs')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', data!.id)
        .select('id')
        .single();
      expect(confirmed.error).toBeNull();
    });

    it('sửa structured SAU khi xác nhận — bị chặn, kèm câu tiếng Việt đọc được', async () => {
      const project = await newProject();
      const { data } = await insert(project);
      await thietKe
        .from('design_briefs')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', data!.id);

      const { error } = await thietKe
        .from('design_briefs')
        .update({ structured: structured({ floors: 5 }) })
        .eq('id', data!.id)
        .select('id')
        .single();

      expect(error).not.toBeNull();
      expect(error!.message).toContain('Điều chỉnh đầu bài');
    });

    it('ô chữ tự do cũng đóng băng sau khi xác nhận', async () => {
      const project = await newProject();
      const { data } = await insert(project);
      await thietKe
        .from('design_briefs')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', data!.id);

      const { error } = await thietKe
        .from('design_briefs')
        .update({ design_task: 'sửa sau khi đã xác nhận' })
        .eq('id', data!.id)
        .select('id')
        .single();
      expect(error).not.toBeNull();
    });

    it('mã artifact vẫn ghi được sau khi xác nhận', async () => {
      // Worker đúc artifact XONG mới ghi mã ngược lại. Đóng băng cột này là tự khoá chính mình.
      const project = await newProject();
      const { data } = await insert(project);
      await thietKe
        .from('design_briefs')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', data!.id);

      const { error } = await thietKe
        .from('design_briefs')
        .update({ artifact_id: null })
        .eq('id', data!.id)
        .select('id')
        .single();
      expect(error).toBeNull();
    });
  });

  describe('hành vi TK-01 cũ không đổi', () => {
    it('vẫn cấp phiên bản và vẫn đòi nguyên nhân từ bản thứ hai', async () => {
      const project = await newProject();
      const first = await insert(project);
      expect(first.data!.version).toBe(1);

      const noReason = await insert(project);
      expect(noReason.error!.message).toContain('nguyên nhân');

      const second = await insert(project, { change_reason: 'Khách bổ sung phòng thờ' });
      expect(second.data!.version).toBe(2);
    });

    it('bản cũ vẫn khoá lại, kể cả phần có cấu trúc', async () => {
      const project = await newProject();
      const first = await insert(project);
      await insert(project, { change_reason: 'Đổi số tầng' });

      const { data } = await thietKe
        .from('design_briefs')
        .update({ structured: structured({ floors: 9 }) })
        .eq('id', first.data!.id)
        .select('id');
      expect(data).toEqual([]);
    });

    it('vẫn không đặt tay được cờ bản đang hiệu lực', async () => {
      const project = await newProject();
      const { data } = await insert(project);
      const { error } = await thietKe
        .from('design_briefs')
        .update({ is_current_version: false })
        .eq('id', data!.id)
        .select('id')
        .single();
      expect(error).not.toBeNull();
    });
  });

  describe('phân quyền không đổi', () => {
    it('Kinh doanh KHÔNG lập được đầu bài', async () => {
      const { error } = await kinhDoanh
        .from('design_briefs')
        .insert({
          company_id: companyId,
          design_project_id: projectId,
          structured: structured(),
        })
        .select('id')
        .single();
      expect(error).not.toBeNull();
    });
  });
});
