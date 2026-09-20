/**
 * Rào chắn của `ArtifactRepository.write`: mã artifact là băm NỘI DUNG, nên hai hồ sơ khác nhau có
 * cùng nội dung sẽ ra cùng một mã.
 *
 * Bộ kiểm này sinh ra từ một lượt đo đột biến (`scripts/mutation-proof.ts`, 20/09/2026): gỡ rào
 * chắn ra thì 1.599 bài kiểm vẫn xanh. Mà đây không phải chuyện giả tưởng — phiếu yêu cầu mặt
 * đứng để trống của hai hồ sơ chưa chọn mặt bằng ra đúng một payload như nhau.
 *
 * Nếu dùng lại dòng của hồ sơ khác: `design_head` của hồ sơ này trỏ sang artifact hồ sơ kia,
 * `get(id, projectId)` trả `null`, màn hình hiện như chưa lưu bao giờ, và lượt chạy nền dừng với
 * câu «không tìm thấy phiếu». Chính sách RLS `design_head_insert` cấm đúng điều này, nhưng kho ghi
 * bằng `service_role` nên đi lọt — chặn phải nằm trong mã.
 *
 * Chạy bằng client Supabase GIẢ: không mạng, không CSDL.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignEnv } from '../env';

const state = vi.hoisted(() => ({
  /** Bảng `design_artifact` giả, khoá theo MÃ artifact — tra đúng mã mà truy vấn hỏi. */
  rows: new Map<string, { id: string; payload_uri: string; project_id: string }>(),
  inserted: [] as Record<string, unknown>[],
  putKeys: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        // Tra theo ĐÚNG mã được hỏi: trả bừa một dòng cho mọi mã thì phép thử không còn chứng minh
        // được rằng hai hồ sơ có cùng nội dung thật sự ra cùng một mã băm.
        eq: (column: string, value: string) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: column === 'id' ? (state.rows.get(value) ?? null) : null,
              error: null,
            }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        if (table === 'design_artifact') {
          state.inserted.push(row);
          state.rows.set(row.id as string, {
            id: row.id as string,
            payload_uri: row.payload_uri as string,
            project_id: row.project_id as string,
          });
        }
        return Promise.resolve({ error: null });
      },
      upsert: () => Promise.resolve({ error: null }),
    }),
  }),
}));

vi.mock('../artifact-store', () => ({
  createArtifactStore: () => ({
    put: (key: string) => {
      state.putKeys.push(key);
      return Promise.resolve(`supabase://design/${key}`);
    },
    get: () => Promise.resolve(null),
  }),
}));

const { ArtifactRepository } = await import('../artifacts');

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'khoá-giả',
} as unknown as DesignEnv;

const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';

const scopeOf = (projectId: string) => ({
  tenantId: '33333333-3333-4333-8333-333333333333',
  companyId: '44444444-4444-4444-8444-444444444444',
  projectId,
  discipline: 'kien_truc' as const,
  actorId: '55555555-5555-4555-8555-555555555555',
});

/** Phiếu yêu cầu mặt đứng để TRỐNG — payload giống hệt nhau giữa hai hồ sơ. */
const BRIEF = {
  schema_version: '1.0.0',
  saved_at: '2026-09-20T02:00:00.000Z',
  plan_ref: null,
  style: null,
  ground_raise_cm: null,
  roof: { type: null, material: null, colour: null, pitch_deg: null, parapet_cm: null },
  palette: { primary: null, secondary: null, accent: null },
  surfaces: {
    body: { material: null, colour: null },
    base: { material: null, colour: null },
    accent: { material: null, colour: null },
    trim: { material: null, colour: null },
  },
  main_door: { material: null, colour: null, type: null, h_cm: null },
  side_door: { material: null, colour: null, type: null, h_cm: null },
  window: { material: null, colour: null, glass: null },
  garage_door: { material: null, colour: null, type: null },
  balcony: { railing: null, colour: null },
  gate: { wanted: null, type: null, material: null, colour: null, h_cm: null },
  fence: { type: null, material: null, colour: null, h_cm: null },
  decorations: [],
  notes: null,
};

beforeEach(() => {
  state.rows.clear();
  state.inserted = [];
  state.putKeys = [];
});

describe('Ghi artifact — cùng mã băm, khác hồ sơ', () => {
  it('dòng đã có thuộc hồ sơ KHÁC thì dừng, nói rõ, và không ghi đè gì', async () => {
    const repo = new ArtifactRepository(ENV);
    const first = await repo.write({
      scope: scopeOf(PROJECT_A),
      kind: 'ai_facade_brief',
      payload: BRIEF,
    });
    expect(state.inserted).toHaveLength(1);
    expect(state.rows.has(first.id)).toBe(true);

    // Hồ sơ B lưu đúng nội dung ấy. Không dựng sẵn dòng nào: mã phải TRÙNG do băm nội dung.
    await expect(
      repo.write({ scope: scopeOf(PROJECT_B), kind: 'ai_facade_brief', payload: BRIEF }),
    ).rejects.toThrow(/hồ sơ thiết kế khác/);
    expect(state.inserted).toHaveLength(1);
  });

  it('cùng hồ sơ ghi lại đúng nội dung cũ thì vẫn dùng lại dòng cũ, không ném lỗi', async () => {
    const repo = new ArtifactRepository(ENV);
    const first = await repo.write({
      scope: scopeOf(PROJECT_A),
      kind: 'ai_facade_brief',
      payload: BRIEF,
    });
    const again = await repo.write({
      scope: scopeOf(PROJECT_A),
      kind: 'ai_facade_brief',
      payload: BRIEF,
    });
    expect(again.id).toBe(first.id);
    expect(again.reused).toBe(true);
    expect(state.inserted).toHaveLength(1);
  });
});
