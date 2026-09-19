/**
 * Bảng tiến độ lượt chạy nền (`ai/runs.ts`) — trên một client Supabase GIẢ.
 *
 * Vì sao đáng viết phép thử cho một bảng chỉ để hiển thị: ba phương án chạy SONG SONG và cùng
 * ghi vào một cột `jsonb`. Đọc–sửa–ghi thuần sẽ mất cập nhật, và mất cập nhật ở đây hiện ra
 * thành «2/6» tụt về «1/6» ngay trước mắt người dùng — thứ không có lỗi nào báo, không có nhật
 * ký nào ghi, và làm người ta bấm lại một lượt chạy tốn tiền.
 *
 * Client giả kể lại đúng phần PostgREST mà `runs.ts` dùng, kể cả bộ lọc theo `progress->>rev`
 * — chính là điều kiện của phép so-và-đặt.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { activeRun, createRun, finishRun, markStep, type AiRunProgress } from '../ai/runs';
import type { AiCallScope } from '../ai/call-log';

const SCOPE: AiCallScope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  discipline: 'kien_truc',
  actorId: null,
};

const STEPS = [
  { id: 'plan:AI-A:propose', label: 'Xếp phương án AI-A' },
  { id: 'plan:AI-B:propose', label: 'Xếp phương án AI-B' },
];

type Row = Record<string, unknown>;

interface FakeDb {
  client: SupabaseClient;
  rows: Row[];
  /** Chạy đúng một lần trước lần UPDATE kế tiếp — dùng để dựng cảnh có kẻ chen ngang. */
  interfere?: () => void;
}

/**
 * Client giả: đủ `insert / select / update` + `eq / in / order / limit` cho `runs.ts`.
 *
 * Viết tay thay vì dùng thư viện mô phỏng vì thứ cần kể lại chính xác là ngữ nghĩa của bộ lọc
 * `progress->>rev` — nếu bộ lọc ấy được cài sai ở đây thì phép thử sẽ xanh trong khi mã thật
 * mất cập nhật.
 */
function fakeDb(): FakeDb {
  const db: FakeDb = { rows: [], client: null as unknown as SupabaseClient };

  const builder = (table: string) => {
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const filters: Array<(row: Row) => boolean> = [];

    const matching = () => db.rows.filter((row) => filters.every((f) => f(row)));

    const run = (): { data: unknown; error: null } => {
      if (table !== 'design_ai_run') throw new Error(`Bảng lạ: ${table}`);
      if (mode === 'insert') {
        const row = { id: `run-${db.rows.length + 1}`, ...payload };
        db.rows.push(row);
        return { data: [row], error: null };
      }
      if (mode === 'update') {
        if (db.interfere) {
          const once = db.interfere;
          db.interfere = undefined;
          once();
        }
        const hit = matching();
        for (const row of hit) Object.assign(row, payload);
        return { data: hit, error: null };
      }
      return { data: matching(), error: null };
    };

    const api = {
      insert(values: Row) {
        mode = 'insert';
        payload = values;
        return api;
      },
      update(values: Row) {
        mode = 'update';
        payload = values;
        return api;
      },
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => String(valueAt(row, column)) === String(value));
        return api;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.map(String).includes(String(row[column])));
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      single() {
        const { data } = run();
        return Promise.resolve({ data: (data as Row[])[0] ?? null, error: null });
      },
      maybeSingle() {
        const { data } = run();
        return Promise.resolve({ data: (data as Row[])[0] ?? null, error: null });
      },
      then(resolve: (value: { data: unknown; error: null }) => unknown) {
        return Promise.resolve(run()).then(resolve);
      },
    };
    return api;
  };

  db.client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return db;
}

/** `progress->>rev` của PostgREST: đọc một khoá bên trong cột jsonb. */
function valueAt(row: Row, column: string): unknown {
  if (!column.includes('->')) return row[column];
  const [base, key] = column.split('->>');
  const value = row[base!] as Record<string, unknown> | undefined;
  return value?.[key!];
}

const progressOf = (db: FakeDb): AiRunProgress => db.rows[0]!.progress as AiRunProgress;

describe('Mở một lượt chạy', () => {
  it('khai đủ bước ở trạng thái chờ, và số hiệu bắt đầu từ 1', async () => {
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });

    expect(run.progress.total).toBe(2);
    expect(run.progress.done).toBe(0);
    expect(run.progress.rev).toBe(1);
    expect(progressOf(db).steps.map((s) => s.status)).toEqual(['pending', 'pending']);
    expect(db.rows[0]!.status).toBe('queued');
  });
});

describe('Ghi trạng thái từng bước', () => {
  it('bước chạy xong thì cộng vào `done`, và dòng chuyển sang đang chạy', async () => {
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });

    await markStep(db.client, run.id, STEPS[0]!.id, 'running');
    expect(db.rows[0]!.status).toBe('running');
    expect(progressOf(db).done).toBe(0);

    await markStep(db.client, run.id, STEPS[0]!.id, 'done');
    expect(progressOf(db).done).toBe(1);
    expect(progressOf(db).steps[0]!.ended_at).toBeTruthy();
  });

  it('bước PHÁT SINH được thêm vào danh sách, và tổng tăng theo', async () => {
    // Lượt sửa là việc có thật, không phải một bước bị bỏ qua: «3/4» thành «3/5» nói đúng hơn
    // là giữ nguyên tổng rồi âm thầm chạy thêm một lượt gọi tính tiền.
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });

    await markStep(db.client, run.id, 'plan:AI-A:repair', 'running', {
      label: 'Sửa phương án AI-A',
    });
    expect(progressOf(db).total).toBe(3);
    expect(progressOf(db).steps[2]!.label).toBe('Sửa phương án AI-A');
  });

  it('bước đã xong KHÔNG tụt về đang chạy khi Workflow dựng lại từ giữa', async () => {
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });
    await markStep(db.client, run.id, STEPS[0]!.id, 'done');
    const rev = progressOf(db).rev;

    await markStep(db.client, run.id, STEPS[0]!.id, 'running');
    expect(progressOf(db).steps[0]!.status).toBe('done');
    expect(progressOf(db).rev).toBe(rev);
  });

  it('có kẻ chen ngang thì đọc lại và ghi tiếp, không mất cập nhật', async () => {
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });
    await markStep(db.client, run.id, STEPS[0]!.id, 'done');

    // Một phương án khác ghi xong ngay giữa lúc phương án này đọc và ghi.
    db.interfere = () => {
      const progress = progressOf(db);
      db.rows[0]!.progress = {
        ...progress,
        rev: progress.rev + 1,
        steps: progress.steps.map((step) =>
          step.id === STEPS[1]!.id ? { ...step, status: 'done' as const } : step,
        ),
        done: progress.done + 1,
      };
    };

    await markStep(db.client, run.id, 'plan:AI-C:write', 'done', { label: 'Lưu phương án AI-C' });

    const final = progressOf(db);
    expect(final.done).toBe(3);
    expect(final.steps.map((s) => s.id)).toContain(STEPS[1]!.id);
    expect(final.steps.map((s) => s.id)).toContain('plan:AI-C:write');
  });

  it('lượt chạy đã chốt thì không ghi thêm tiến độ được', async () => {
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });
    await finishRun(db.client, run.id, { status: 'done', result: { plans: [] } });

    await markStep(db.client, run.id, STEPS[0]!.id, 'done');
    expect(db.rows[0]!.status).toBe('done');
    expect(progressOf(db).done).toBe(0);
  });
});

describe('Chốt một lượt chạy', () => {
  it('bước còn treo ở đang chạy bị đánh dấu hỏng, không treo mãi trên màn hình', async () => {
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });
    await markStep(db.client, run.id, STEPS[0]!.id, 'running');

    await finishRun(db.client, run.id, { status: 'failed', error: 'Hết hạn mức.' });

    expect(db.rows[0]!.status).toBe('failed');
    expect(progressOf(db).steps[0]!.status).toBe('failed');
    expect(progressOf(db).steps[0]!.error).toBe('Hết hạn mức.');
  });
});

describe('Chặn lượt chạy thứ hai của cùng giai đoạn', () => {
  it('thấy lượt đang chạy thì trả về nó', async () => {
    const db = fakeDb();
    const run = await createRun(db.client, SCOPE, { stage: 'plan', steps: STEPS });

    expect(await activeRun(db.client, SCOPE.projectId, 'plan')).toMatchObject({ id: run.id });

    await finishRun(db.client, run.id, { status: 'done' });
    expect(await activeRun(db.client, SCOPE.projectId, 'plan')).toBeNull();
  });
});
