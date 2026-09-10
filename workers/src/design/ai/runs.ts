/**
 * Bảng tiến độ của các lượt chạy nền nhánh AI — `design_ai_run` (migration 0123).
 *
 * ── Vì sao có bảng này, khi Cloudflare Workflow đã có trạng thái riêng ──────────────
 *
 * Trạng thái của Workflow trả lời được đúng một câu: instance đang chạy hay đã xong. Màn hình
 * cần ba thứ khác mà nó không biết:
 *
 *  · **bước NGHIỆP VỤ nào đang chạy** — «đang xếp phương án B», không phải «đang ở bước 4»;
 *  · **quyền đọc** — `design_ai_run` đi qua `rls_design_readable` nên trình duyệt đọc trực tiếp
 *    được; trạng thái Workflow thì phải có khoá tài khoản Cloudflare mới đọc được;
 *  · **kết quả dở dang** — ba phương án xong hai thì hai phương án ấy hiện được ngay.
 *
 * Ghi thì CHỈ Worker ghi (bảng không có policy INSERT/UPDATE cho `authenticated`): đây là nhật
 * ký máy, người dùng không sửa được.
 *
 * ── Tranh chấp ghi, và cách giải ────────────────────────────────────────────────────
 *
 * Ba phương án chạy SONG SONG, nên ba bước cùng cập nhật một cột `jsonb`. Đọc–sửa–ghi thuần sẽ
 * mất cập nhật, và mất cập nhật ở đây hiện ra thành «2/6» tụt về «1/6» trước mắt người dùng.
 * Nên mỗi bản ghi mang số hiệu `progress.rev`, và mỗi lần ghi là một phép so-và-đặt: ghi kèm
 * điều kiện `rev` chưa đổi, không trúng dòng nào thì đọc lại và thử lại.
 *
 * Hết lượt thử thì BỎ QUA, không ném: đây là nhật ký tiến độ, nó không được phép làm hỏng một
 * bước nghiệp vụ đã chạy xong và đã tốn tiền.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiCallScope } from './call-log';

export type AiRunStage = 'program' | 'plan' | 'facade' | 'images';
export type AiRunStatus = 'queued' | 'running' | 'done' | 'failed';
export type AiRunStepStatus = 'pending' | 'running' | 'done' | 'failed';

/** Số lần thử lại phép so-và-đặt trước khi bỏ qua một lần cập nhật tiến độ. */
const CAS_ATTEMPTS = 6;

export interface AiRunStepSpec {
  /** Mã bước, ổn định và đọc được trong nhật ký: `plan:AI-A:propose`. */
  id: string;
  /** Nhãn tiếng Việt hiện trên màn hình. */
  label: string;
}

export interface AiRunStep extends AiRunStepSpec {
  status: AiRunStepStatus;
  started_at?: string | null;
  ended_at?: string | null;
  error?: string | null;
}

export interface AiRunProgress {
  /** Số hiệu bản ghi, tăng mỗi lần ghi — điều kiện của phép so-và-đặt. */
  rev: number;
  steps: AiRunStep[];
  /** Số bước đã xong. `total` đổi được: một lượt sửa là một bước phát sinh thật. */
  done: number;
  total: number;
  /** Kết quả dở dang — hiện được ngay, không chờ cả lượt xong. */
  partial?: Record<string, unknown>;
}

export interface CreateRunInput {
  stage: AiRunStage;
  steps: readonly AiRunStepSpec[];
  /** Mã instance Workflow, nếu đã biết trước khi tạo dòng. */
  workflowId?: string | null;
}

/** Mở một lượt chạy ở trạng thái `queued` với đủ danh sách bước đã biết trước. */
export async function createRun(
  db: SupabaseClient,
  scope: AiCallScope,
  input: CreateRunInput,
): Promise<{ id: string; progress: AiRunProgress }> {
  const progress: AiRunProgress = {
    rev: 1,
    steps: input.steps.map((step) => ({ ...step, status: 'pending' })),
    done: 0,
    total: input.steps.length,
  };
  const { data, error } = await db
    .from('design_ai_run')
    .insert({
      tenant_id: scope.tenantId,
      company_id: scope.companyId,
      project_id: scope.projectId,
      discipline: scope.discipline,
      stage: input.stage,
      workflow_id: input.workflowId ?? null,
      status: 'queued',
      progress,
      created_by: scope.actorId,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, progress };
}

/** Gắn mã instance Workflow sau khi đã mở được instance. */
export async function attachWorkflow(
  db: SupabaseClient,
  runId: string,
  workflowId: string,
): Promise<void> {
  const { error } = await db
    .from('design_ai_run')
    .update({ workflow_id: workflowId, updated_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw new Error(error.message);
}

export interface MarkStepOptions {
  /** Nhãn cho bước chưa khai trước — bước phát sinh (lượt sửa) được THÊM vào danh sách. */
  label?: string;
  error?: string | null;
  /** Gộp thêm vào `progress.partial`. */
  partial?: Record<string, unknown>;
}

/**
 * Ghi trạng thái một bước. Tự nhận bước mới, tự cộng lại `done`, và không bao giờ ném.
 *
 * Gọi lại với cùng trạng thái là vô hại (bước đã `done` không tụt về `running`): Workflow có
 * thể chạy lại một `step.do` đã xong khi instance được dựng lại từ giữa.
 */
export async function markStep(
  db: SupabaseClient,
  runId: string,
  stepId: string,
  status: AiRunStepStatus,
  options: MarkStepOptions = {},
): Promise<void> {
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const current = await readProgress(db, runId);
    if (!current) return;

    const steps = [...current.progress.steps];
    const index = steps.findIndex((step) => step.id === stepId);
    const previous = index >= 0 ? steps[index]! : null;
    // Bước đã xong thì không hạ xuống `running`: một lần Workflow dựng lại từ giữa sẽ gọi lại
    // bước đã xong, và tiến độ không được đi lùi vì chuyện đó.
    if (previous?.status === 'done' && status !== 'failed') return;

    const next: AiRunStep = {
      id: stepId,
      label: options.label ?? previous?.label ?? stepId,
      status,
      started_at: status === 'running' ? now : (previous?.started_at ?? null),
      ended_at: status === 'done' || status === 'failed' ? now : null,
      error: options.error ?? null,
    };
    if (index >= 0) steps[index] = next;
    else steps.push(next);

    const progress: AiRunProgress = {
      rev: current.progress.rev + 1,
      steps,
      done: steps.filter((step) => step.status === 'done').length,
      total: steps.length,
      ...(options.partial || current.progress.partial
        ? { partial: { ...current.progress.partial, ...options.partial } }
        : {}),
    };

    const { data, error } = await db
      .from('design_ai_run')
      .update({
        progress,
        // Dòng chuyển sang `running` ngay khi bước đầu tiên bắt đầu; `queued` chỉ là khoảng
        // trước khi instance Workflow thật sự nhận việc.
        status: 'running',
        updated_at: now,
      })
      .eq('id', runId)
      .eq('progress->>rev', String(current.progress.rev))
      .in('status', ['queued', 'running'])
      .select('id');
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return;
    // Không trúng dòng nào: hoặc có lượt ghi khác đã chen vào (đọc lại rồi thử tiếp), hoặc
    // lượt chạy đã kết thúc (vòng sau sẽ thấy `status` chốt và cũng không ghi được) — cả hai
    // đều không phải lỗi.
  }
}

export interface FinishRunInput {
  status: Extract<AiRunStatus, 'done' | 'failed'>;
  /** Mã artifact đã đúc — để màn hình nhảy thẳng tới kết quả. */
  result?: unknown;
  error?: string | null;
  partial?: Record<string, unknown>;
}

/** Chốt một lượt chạy. Ghi thẳng, không so-và-đặt: lúc này không còn bước nào chạy song song. */
export async function finishRun(
  db: SupabaseClient,
  runId: string,
  input: FinishRunInput,
): Promise<void> {
  const current = await readProgress(db, runId);
  const now = new Date().toISOString();
  const steps = (current?.progress.steps ?? []).map((step) =>
    // Lượt chạy đã hỏng mà một bước còn treo ở `running` thì nó sẽ treo mãi trên màn hình.
    step.status === 'running'
      ? { ...step, status: 'failed' as const, ended_at: now, error: input.error ?? null }
      : step,
  );
  const progress: AiRunProgress = {
    rev: (current?.progress.rev ?? 0) + 1,
    steps,
    done: steps.filter((step) => step.status === 'done').length,
    total: steps.length,
    ...(input.partial || current?.progress.partial
      ? { partial: { ...current?.progress.partial, ...input.partial } }
      : {}),
  };

  const { error } = await db
    .from('design_ai_run')
    .update({
      status: input.status,
      progress,
      result: input.result ?? null,
      error: input.error ?? null,
      updated_at: now,
    })
    .eq('id', runId);
  if (error) throw new Error(error.message);
}

/**
 * Lượt chạy CÒN ĐANG CHẠY của một giai đoạn, nếu có.
 *
 * Dùng để trả 409 thay vì mở lượt thứ hai: hai lượt cùng giai đoạn chạy song song sẽ đúc ra hai
 * bộ artifact cho cùng một bước và nhân đôi tiền cho cùng một câu hỏi.
 */
export async function activeRun(
  db: SupabaseClient,
  projectId: string,
  stage: AiRunStage,
): Promise<{ id: string; createdAt: string } | null> {
  const { data, error } = await db
    .from('design_ai_run')
    .select('id, created_at')
    .eq('project_id', projectId)
    .eq('stage', stage)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id as string, createdAt: data.created_at as string };
}

async function readProgress(
  db: SupabaseClient,
  runId: string,
): Promise<{ status: AiRunStatus; progress: AiRunProgress } | null> {
  const { data, error } = await db
    .from('design_ai_run')
    .select('status, progress')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = (data.progress ?? {}) as Partial<AiRunProgress>;
  return {
    status: data.status as AiRunStatus,
    progress: {
      rev: typeof raw.rev === 'number' ? raw.rev : 0,
      steps: Array.isArray(raw.steps) ? raw.steps : [],
      done: typeof raw.done === 'number' ? raw.done : 0,
      total: typeof raw.total === 'number' ? raw.total : 0,
      ...(raw.partial ? { partial: raw.partial } : {}),
    },
  };
}
