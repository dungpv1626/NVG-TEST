/**
 * Hook của NHÁNH THIẾT KẾ BẰNG AI — tệp riêng, không nằm trong `use-design-projects.ts`.
 *
 * Vì sao tách. Nhánh AI thay thế bộ giải nội bộ (T15–T19, 09/09/2026); khi nó làm tốt, bộ giải
 * và toàn bộ hook của bộ giải trong `use-design-projects.ts` sẽ bị xoá. Để hook của nhánh AI
 * lẫn trong đó thì ngày dọn phải bới từng hàm ra. Ở đây thì xoá tệp kia là xong.
 *
 * Có kiểm thử canh chiều ngược lại: `workers/src/design/__tests__/ai-independence.test.ts`
 * đỏ nếu tệp này import từ `use-design-projects` hay từ panel nào của bộ giải.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { designApi } from '@/lib/design-api';

// ---------------------------------------------------------------------------
// Danh mục model
// ---------------------------------------------------------------------------

export interface AiModelOption {
  route: string;
  provider: string;
  label: string;
  model: string;
  maxDataClass: number;
  enabled: boolean;
  /** Vì sao không bấm được. Rỗng khi bấm được. */
  unavailableReason: string | null;
}

export interface AiModelCatalogue {
  text: AiModelOption[];
  image: AiModelOption[];
  defaults: { text: string | null; image: string | null };
}

/**
 * Danh mục model cho ô chọn — đọc từ `config/models.yaml` qua Worker, không lộ khoá.
 *
 * Người dùng chọn TÊN TUYẾN, không gõ tên mô hình: trình duyệt không có cách nào gửi xuống
 * một tên mô hình tự do.
 */
export function useAiModels() {
  return useQuery<AiModelCatalogue, Error>({
    queryKey: ['design_ai_models'],
    queryFn: () => designApi<AiModelCatalogue>('/design/ai/models'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Trạng thái toàn nhánh
// ---------------------------------------------------------------------------

export type AiStage = 'program' | 'plan' | 'facade' | 'images';
export type AiRunStatus = 'queued' | 'running' | 'done' | 'failed';

export interface AiRunStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: string | null;
  endedAt?: string | null;
  error?: string | null;
}

export interface AiRunProgress {
  steps?: AiRunStep[];
  done?: number;
  total?: number;
  /** Kết quả dở dang hiện được ngay, không phải chờ cả lượt xong (ví dụ 3/5 ảnh đã dựng). */
  partial?: Record<string, unknown>;
}

export interface AiRunView {
  id: string;
  stage: AiStage;
  status: AiRunStatus;
  progress: AiRunProgress;
  result: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiSpaceProgramSpace {
  id: string;
  type: string;
  level: number;
  target_area_m2: number;
  ensuite_of?: string | null;
  why?: string | null;
}

export interface AiSpaceProgramView {
  schema_version: string;
  brief_ref: string;
  spaces: AiSpaceProgramSpace[];
  rationale: string;
  assumptions?: string[];
  generator: {
    kind: 'ai';
    provider: string;
    model: string;
    route: string;
    prompt_version: string;
    repaired?: boolean;
  };
}

export interface AiDesignState {
  briefArtifactId: string | null;
  program: { artifactId: string; payload: AiSpaceProgramView } | null;
  plans: Array<{ artifactId: string; createdAt: string }>;
  facadeArtifactId: string | null;
  imageSetArtifactId: string | null;
  runs: Partial<Record<AiStage, AiRunView>>;
  roomLabels: Record<string, string>;
}

/** Trạng thái cả bốn bước trong một lượt gọi — dải bước trên màn hình phải nhất quán. */
export function useAiDesignState(projectId: string, enabled = true) {
  return useQuery<AiDesignState, Error>({
    queryKey: ['ai_design_state', projectId],
    queryFn: () => designApi<AiDesignState>(`/design/ai/state/${projectId}`),
    enabled: enabled && Boolean(projectId),
  });
}

/** Đánh dấu trạng thái nhánh AI đã cũ — gọi sau mỗi bước sinh ra kết quả mới. */
export function useInvalidateAiDesign() {
  const queryClient = useQueryClient();
  return (projectId: string) =>
    void queryClient.invalidateQueries({ queryKey: ['ai_design_state', projectId] });
}

// ---------------------------------------------------------------------------
// Theo dõi lượt chạy nền
// ---------------------------------------------------------------------------

const TERMINAL: AiRunStatus[] = ['done', 'failed'];

/**
 * Theo dõi một lượt chạy nền, hỏi lại mỗi 3 giây cho tới khi kết thúc.
 *
 * Dừng hỏi khi trạng thái đã chốt: một lượt `done` không đổi nữa, và hỏi tiếp chỉ tốn lượt
 * gọi. Ba giây là mức đủ để dải bước nhúc nhích trước mắt người dùng mà không thành một vòng
 * lặp mạng.
 */
export function useAiRun(runId: string | null) {
  return useQuery<AiRunView, Error>({
    queryKey: ['ai_design_run', runId],
    queryFn: () => designApi<AiRunView>(`/design/ai/runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: (query) =>
      TERMINAL.includes(query.state.data?.status ?? 'queued') ? false : 3000,
  });
}

/** Khởi động một giai đoạn chạy nền. Trả mã lượt chạy để màn hình theo dõi tiến độ. */
export function useStartAiRun(stage: Exclude<AiStage, 'program'>) {
  return useMutation<
    { runId: string },
    Error,
    { projectId: string; route: string; options?: Record<string, unknown> }
  >({
    mutationFn: (body) => designApi<{ runId: string }>(`/design/ai/${stage}/runs`, body),
  });
}
