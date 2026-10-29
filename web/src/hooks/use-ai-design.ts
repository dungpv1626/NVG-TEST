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

import { useEffect, useState } from 'react';
import { AI_PREVIEW_WIDTH, type AiFacadeBrief, type StyleCodeGroup } from '@nvg/shared/design';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { DesignApiError, designApi, designApiFile } from '@/lib/design-api';
import { toUserMessage } from '@/hooks/use-error-message';
import { svgUrlToPngBase64 } from '@/lib/rasterise';
import { supabase } from '@/lib/supabase';
import { parseRoomHits, type SheetRoomHit } from '@/lib/sheet-hits';

// ---------------------------------------------------------------------------
// Danh mục model
// ---------------------------------------------------------------------------

export interface AiModelOption {
  route: string;
  provider: string;
  label: string;
  /** Tên nhà cung cấp để gom nhóm thẻ model. Vắng ở máy chủ cũ — khi ấy dùng `provider`. */
  providerLabel?: string;
  /** Tên ngắn, nhãn phân loại, câu mô tả cho thẻ. Vắng ở máy chủ cũ hoặc cấu hình chưa khai. */
  short?: string | null;
  tag?: string | null;
  blurb?: string | null;
  model: string;
  maxDataClass: number;
  enabled: boolean;
  /** Vì sao không bấm được. Rỗng khi bấm được. */
  unavailableReason: string | null;
  /** Giá một tấm ảnh, USD. `null` = cấu hình chưa khai giá → hiện «Chưa đủ dữ liệu», không hiện 0. */
  imageUsd: number | null;
  /** Giá niêm yết mỗi triệu token vào/ra, USD. Vắng ở máy chủ cũ. */
  inputPer1mUsd?: number | null;
  outputPer1mUsd?: number | null;
  /** Giới hạn token ra của tuyến (`max_output_tokens`); `null` = không đặt. Vắng ở máy chủ cũ (T176). */
  maxOutputTokens?: number | null;
  /** `false` = khoá gói miễn phí, tiền thật bằng 0. Vắng ở máy chủ cũ = coi như có tính tiền. */
  billed?: boolean;
  /** Nhận «mức suy nghĩ» theo lượt không. */
  supportsEffort?: boolean;
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface AiModelCatalogue {
  text: AiModelOption[];
  image: AiModelOption[];
  defaults: { text: string | null; image: string | null };
  /** Nhà cung cấp không phát sinh hoá đơn — để tính tiền thật của từng dòng nhật ký. */
  freeProviders?: string[];
  /** Trần số lượt gọi mô hình của một phương án mặt bằng (lượt đầu + lượt sửa). Vắng ở máy chủ cũ. */
  limits?: {
    planCallsMax?: number;
    /**
     * Mức chi phí CHẶN THẬT của một lượt, USD (T164, `design_setting.ai_run_cost_cap_usd`) — `null` =
     * không giới hạn. Vắng ở máy chủ cũ.
     */
    runCostCapUsd?: number | null;
    /** Số token ra tối thiểu của một lời gọi khi bị hạ cho vừa mức (T176, `billing.call_cap`). Vắng ở máy chủ cũ. */
    callMinOutputTokens?: number | null;
    /** Số lời gọi tối đa của một lượt «Sửa lại» (T184) — mọi lời gọi là loại sửa rẻ. Vắng ở máy chủ cũ. */
    editCallsMax?: number;
  };
}

// ---------------------------------------------------------------------------
// Số token và chi phí của lượt gọi
// ---------------------------------------------------------------------------

/** Một lượt gọi AI nhìn từ màn hình — Worker trả kèm kết quả (`ai/call-log.ts::AiCallUsage`). */
export interface AiCallUsage {
  route: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  imageCount: number;
  latencyMs: number;
  status: 'ok' | 'rejected' | 'failed';
  billed: boolean;
  /** Tiền thật; `null` = tuyến chưa có giá (không phải 0). */
  costUsd: number | null;
  /** Giá niêm yết của lượng đã dùng; `null` = tuyến chưa có giá. */
  listCostUsd: number | null;
}

/** Một dòng nhật ký `design_ai_call`, đọc thẳng qua RLS. */
export interface AiCallLogRow {
  id: string;
  created_at: string;
  route: string;
  provider: string;
  model: string;
  purpose: string;
  input_tokens: number | null;
  output_tokens: number | null;
  image_count: number;
  latency_ms: number;
  status: 'ok' | 'rejected' | 'failed';
  error_code: string | null;
  /** Giá niêm yết lúc gọi (USD). Tiền thật = 0 khi `provider` là nhà cung cấp miễn phí. */
  cost_usd: string | number | null;
}

/**
 * Số lượt gọi AI gần nhất mà nhật ký của hồ sơ nạp về (Haan, 20/09/2026: «chỉ giữ lại 25 lượt gọi
 * gần nhất thôi»).
 *
 * ⚠️ Đây là giới hạn ĐỌC, không phải xoá: `design_ai_call` là sổ tiền, và mọi dòng vẫn nằm nguyên
 * trong CSDL. Cắt bớt trên màn hình thì xem lại được; xoá dòng thì không.
 */
export const AI_CALL_LOG_LIMIT = 25;

/**
 * Nhật ký lượt gọi AI của MỘT hồ sơ — gọi thẳng Supabase (CLAUDE.md 3.1): chỉ đọc một bảng,
 * quyền đã có RLS (`rls_design_readable`). Mới nhất lên đầu.
 */
export function useAiCallLog(projectId: string, options: { live?: boolean; limit?: number } = {}) {
  const limit = options.limit ?? AI_CALL_LOG_LIMIT;
  return useQuery<AiCallLogRow[], Error>({
    // Lượt chạy nền ghi từng dòng khi từng tầng xong — hỏi lại để con số chạy theo tiến độ.
    refetchInterval: options.live ? 5_000 : false,
    queryKey: ['design_ai_call', projectId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_ai_call')
        .select(
          'id, created_at, route, provider, model, purpose, input_tokens, output_tokens, image_count, latency_ms, status, error_code, cost_usd',
        )
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as AiCallLogRow[];
    },
    enabled: Boolean(projectId),
  });
}

/**
 * Lịch sử lượt chạy + lượt gọi của MỘT giai đoạn trên MỌI hồ sơ người dùng xem được (RLS quyết) — đầu
 * vào của chi phí ước tính trên nút (`ai/run-cost-estimate.ts`). Chỉ đọc hai bảng nhật ký, không gọi
 * mô hình nào. Lấy 40 lượt chạy gần nhất là đủ cho một con số trung bình.
 */
export interface AiCostHistory {
  runs: Array<{
    id: string;
    project_id: string;
    status: AiRunStatus;
    result: unknown;
    created_at: string;
    updated_at: string;
  }>;
  calls: Array<
    Pick<
      AiCallLogRow,
      'created_at' | 'route' | 'purpose' | 'status' | 'input_tokens' | 'output_tokens' | 'cost_usd'
    > & { project_id: string }
  >;
}

export function useAiCostHistory(stage: Exclude<AiStage, 'program'>, purposes: readonly string[]) {
  return useQuery<AiCostHistory, Error>({
    queryKey: ['design_ai_cost_history', stage, [...purposes].sort().join(',')],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const runs = await supabase
        .from('design_ai_run')
        .select('id, project_id, status, result, created_at, updated_at')
        .eq('stage', stage)
        .in('status', ['done', 'failed'])
        .order('created_at', { ascending: false })
        .limit(40);
      if (runs.error) throw new Error(runs.error.message);
      const rows = (runs.data ?? []) as AiCostHistory['runs'];
      if (rows.length === 0) return { runs: [], calls: [] };
      const oldest = rows[rows.length - 1]!.created_at;
      const calls = await supabase
        .from('design_ai_call')
        .select(
          'project_id, created_at, route, purpose, status, input_tokens, output_tokens, cost_usd',
        )
        .in('purpose', [...purposes])
        .gte('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (calls.error) throw new Error(calls.error.message);
      return { runs: rows, calls: (calls.data ?? []) as AiCostHistory['calls'] };
    },
  });
}

/**
 * Mã các lượt gọi CÓ bản ghi nguyên văn lời gọi (13/09/2026). Lượt chạy trước ngày ấy không có —
 * màn hình không hiện nút cho chúng, thay vì hiện rồi báo lỗi khi bấm (AFD 6.5).
 */
export function useAiCallPrompts(projectId: string, options: { live?: boolean } = {}) {
  return useQuery<Set<string>, Error>({
    refetchInterval: options.live ? 5_000 : false,
    queryKey: ['design_ai_call_prompts', projectId],
    queryFn: async () => {
      const data = await designApi<{ callIds: string[] }>(
        `/design/ai/calls/${encodeURIComponent(projectId)}/prompts`,
      );
      return new Set(data.callIds);
    },
    enabled: Boolean(projectId),
    retry: false,
  });
}

/** Tải nguyên văn lời gọi của một lượt về máy, dạng tệp chữ `.txt`. */
export function useDownloadAiCallPrompt() {
  return useMutation<void, Error, { projectId: string; callId: string }>({
    mutationFn: async ({ projectId, callId }) => {
      const response = await designApiFile(
        `/design/ai/calls/${encodeURIComponent(projectId)}/${encodeURIComponent(callId)}/prompt`,
      );
      await saveResponse(response, `prompt-${callId}.txt`);
    },
  });
}

/**
 * Nguyên văn lời gọi của một lượt, dạng chữ — cho báo cáo lượt chạy (07/10/2026). `null` khi lượt
 * ấy không có bản ghi (lượt trước 13/09/2026) hay máy chủ không trả được: báo cáo ghi «không có»,
 * không làm hỏng cả tệp vì một lượt.
 */
export async function fetchAiCallPrompt(projectId: string, callId: string): Promise<string | null> {
  try {
    const response = await designApiFile(
      `/design/ai/calls/${encodeURIComponent(projectId)}/${encodeURIComponent(callId)}/prompt`,
    );
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Tải cả phương án mặt bằng dạng DXF (mọi tầng trong một tệp, mm) — để người vẽ dựng tiếp trên CAD.
 * Xuất một chiều: không có đường nạp ngược tệp đã sửa (Q-45a).
 */
export function useDownloadAiPlanDxf() {
  return useMutation<void, Error, { projectId: string; artifactId: string }>({
    mutationFn: async ({ projectId, artifactId }) => {
      const response = await designApiFile(
        `/design/ai/plan/${encodeURIComponent(projectId)}/dxf?artifactId=${encodeURIComponent(artifactId)}`,
      );
      await saveResponse(response, 'mat-bang-ai.dxf');
    },
  });
}

/** Lưu thân phản hồi thành tệp, tên lấy từ `Content-Disposition` của Worker. */
async function saveResponse(response: Response, fallbackName: string): Promise<void> {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
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
  /** Tiện ích nằm trong phòng (tủ đồ, góc học tập…) — đã cộng vào diện tích. */
  includes?: string[];
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
  /**
   * `label` — nhãn CỐ ĐỊNH do máy chủ đánh («3», «3.1»): số theo thứ tự tạo trong cả hồ sơ, bản sửa mang số gốc + lần
   * sửa (11/10/2026). Vắng = máy chủ cũ; màn hình lùi về đánh số theo vị trí.
   */
  plans: Array<{ artifactId: string; createdAt: string; label?: string | null }>;
  /** Phương án đã CHỌN. Rỗng khi đã có phương án nhưng chưa ai chọn — bước mặt đứng chờ cái này. */
  planHeadArtifactId: string | null;
  facadeArtifactId: string | null;
  /**
   * Mọi bản mặt đứng còn hiện, mới nhất trước (20/09/2026). Vắng ở máy chủ cũ — khi ấy màn hình chỉ
   * có bản hiệu lực, đúng như trước.
   */
  /**
   * `planRef` — phương án mặt bằng bản ấy dựng trên (cạnh lineage, 10/10/2026); rỗng khi phương án
   * ấy đã ẩn hoặc máy chủ cũ chưa trả trường này.
   */
  facades?: Array<{
    artifactId: string;
    createdAt: string;
    planRef?: string | null;
    /** Nhãn cố định của bản mặt đứng, và của phương án nó dựng theo (có cả khi phương án ấy đã xoá khỏi dải). */
    label?: string | null;
    planLabel?: string | null;
  }>;
  /**
   * Mặt bằng mà mặt đứng hiện hành dựng theo (T59). Khác `planHeadArtifactId` = kỹ sư đã đổi phương án
   * sau khi dựng mặt đứng; mặt đứng cũ vẫn giữ, gắn nhãn «dựng theo phương án cũ».
   */
  facadePlanRef?: string | null;
  imageSetArtifactId: string | null;
  /** Các bộ ảnh phối cảnh còn hiện, mới nhất trước (T67 Đợt C). */
  imageSets?: Array<{
    artifactId: string;
    createdAt: string;
    /** Nhãn cố định của bộ ảnh, và của bản mặt đứng nó dựng theo. */
    label?: string | null;
    facadeLabel?: string | null;
  }>;
  /** Mặt đứng mà bộ ảnh hiện hành dựng theo — khác bản hiệu lực thì bộ ảnh đã cũ. */
  imageSetFacadeRef?: string | null;
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

/** Kiểm đầu bài trước khi xếp mặt bằng (T178): câu chặn + câu cảnh báo, không mở lượt, không gọi mô hình. */
export interface AiPlanPreflight {
  briefArtifactId: string | null;
  blocking: string | null;
  warnings: string[];
}

/** Đọc lại theo đầu bài đã xác nhận — xác nhận bản mới thì khoá đổi, câu kiểm đổi theo. */
export function useAiPlanPreflight(projectId: string, briefArtifactId: string | null) {
  return useQuery<AiPlanPreflight, Error>({
    queryKey: ['ai_plan_preflight', projectId, briefArtifactId],
    queryFn: () => designApi<AiPlanPreflight>(`/design/ai/plan/${projectId}/preflight`),
    enabled: Boolean(projectId) && Boolean(briefArtifactId),
    staleTime: 5 * 60_000,
  });
}

/** Đánh dấu trạng thái nhánh AI đã cũ — gọi sau mỗi bước sinh ra kết quả mới. */
export function useInvalidateAiDesign() {
  const queryClient = useQueryClient();
  return (projectId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['ai_design_state', projectId] });
    // Mỗi lượt chạy là một (hay vài) dòng chi phí mới — nhật ký phải thấy ngay.
    void queryClient.invalidateQueries({ queryKey: ['design_ai_call', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['design_ai_call_prompts', projectId] });
  };
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
export function useAiRun(runId: string | null, intervalMs = 3000) {
  return useQuery<AiRunView, Error>({
    queryKey: ['ai_design_run', runId],
    queryFn: () => designApi<AiRunView>(`/design/ai/runs/${runId}`),
    enabled: Boolean(runId),
    // Lượt chạy đồng bộ mở dòng theo dõi sau vài trăm mili giây — hỏi sớm quá thì 404. Không coi
    // 404 là dừng hỏi: cứ hỏi tiếp theo nhịp cho tới khi dòng xuất hiện.
    retry: false,
    refetchInterval: (query) =>
      TERMINAL.includes(query.state.data?.status ?? 'queued') ? false : intervalMs,
  });
}

/** Nút «Dừng» — đánh dấu lượt chạy đã dừng; máy chủ huỷ lời gọi mô hình trong ≤ 2 giây. */
export function useCancelAiRun() {
  return useMutation<{ stopped: boolean }, Error, { runId: string }>({
    mutationFn: ({ runId }) =>
      designApi<{ stopped: boolean }>(`/design/ai/runs/${runId}/cancel`, {}),
  });
}

/**
 * Khởi động một giai đoạn chạy nền. Trả mã lượt chạy để màn hình theo dõi tiến độ.
 *
 * `options` được RẢI PHẲNG vào thân lời gọi, không gửi lồng: mỗi giai đoạn có tham số riêng
 * (`count` và gói quy tắc ở bước mặt bằng, danh sách góc ở bước ảnh), và một lớp lồng chỉ thêm
 * một chỗ để gửi sai khoá mà Worker im lặng bỏ qua.
 */
export function useStartAiRun(stage: Exclude<AiStage, 'program'>) {
  const queryClient = useQueryClient();
  return useMutation<
    { runId: string },
    Error,
    { projectId: string; route: string; options?: Record<string, unknown> }
  >({
    mutationFn: ({ projectId, route, options }) =>
      designApi<{ runId: string }>(`/design/ai/${stage}/runs`, { projectId, route, ...options }),
    // Dải bốn bước đọc `runs` từ `/state`: không nạp lại thì nó ghi «Chưa chạy» suốt lượt đang chạy
    // (lượt chạy thật 23/10/2026). Lượt chốt (xong / hỏng) thì bước nạp lại lần nữa.
    onSuccess: (_out, { projectId }) =>
      void queryClient.invalidateQueries({ queryKey: ['ai_design_state', projectId] }),
  });
}

// ---------------------------------------------------------------------------
// Bước 2 — mặt bằng
// ---------------------------------------------------------------------------

/**
 * Sửa một phương án đã lưu bằng một câu yêu cầu (T53). Chạy nền như lượt xếp — trả mã lượt chạy; bản
 * sửa là phương án MỚI, bản gốc giữ nguyên.
 */
export function useEditAiPlan() {
  const queryClient = useQueryClient();
  return useMutation<
    { runId: string },
    Error,
    {
      projectId: string;
      artifactId: string;
      instruction: string;
      route: string;
      reasoningEffort: ReasoningEffort | null;
    }
  >({
    mutationFn: (body) => designApi<{ runId: string }>('/design/ai/plan/edit', body),
    onSuccess: (_out, { projectId }) =>
      void queryClient.invalidateQueries({ queryKey: ['ai_design_state', projectId] }),
  });
}

/** Hai gói quy tắc kỹ sư chọn áp — mặc định TẮT CẢ HAI (T20, 09/09/2026). */
export interface AiRulePackChoice {
  standards: boolean;
  experience: boolean;
}

export interface AiPlanIssue {
  code: string;
  level: 'blocking' | 'finding';
  ref?: string;
  message: string;
}

export interface AiPlanWarning {
  ruleId: string;
  severity: 'error' | 'warning';
  /** Văn bản quy chuẩn, nguyên văn — «cảnh báo» không có nghĩa gì nếu không nói theo văn bản nào. */
  source: string;
  message: string;
  spaceId: string;
  level: number;
}

/**
 * Điểm chất lượng của một phương án — ĐỌC LẠI từ artifact, Worker không chấm lại lúc đọc.
 *
 * Ba trường dễ bị đọc nhầm nhất, và cả ba là lý do panel điểm không phải một con số đơn:
 *
 *  · `points` **không phải trên 100**. Nó là điểm trên `scoredWeight` — phần trọng số thật sự
 *    chấm được. Tiêu chí thiếu đầu vào KHÔNG được chia lại trọng số cho tiêu chí khác
 *    (CLAUDE.md 5.2), nên hai phương án có `scoredWeight` khác nhau là hai con số không so
 *    trực tiếp được.
 *  · `reasonedWeight` là phần trọng số đã chấm mà **ngưỡng chưa ai đo** (`n = 0`). Màn hình
 *    phải nói ra (T31) — trộn im lặng vào một con số 100 là đúng thứ 5.2 cấm.
 *  · `scoreVersion` so với `currentVersion`: lệch nghĩa là điểm này chấm bằng thước CŨ. Không
 *    chấm lại được mà không đúc lại artifact, tức tốn một lượt gọi thật (T27).
 */
export interface AiPlanScoreView {
  scoreVersion: number;
  /** Phiên bản thước HÔM NAY. Khác `scoreVersion` thì hai con số không so được với nhau. */
  currentVersion: number;
  points: number;
  scoredWeight: number;
  reasonedWeight: number;
  /** Nguyên văn câu nói bộ đo dựa trên mấy hồ sơ — hiện lên màn hình, không rút gọn. */
  coSoDuLieu: string;
  groups: { code: string; vi: string; weight: number; scoredWeight: number; points: number }[];
  criteria: AiPlanScoreCriterion[];
}

export interface AiPlanScoreCriterion {
  code: string;
  group: string;
  vi: string;
  giaiThich: string | null;
  /** Giá trị đo được. Rỗng = không chấm được; lúc ấy đọc `why`, KHÔNG hiện 0. */
  value: number | null;
  score: number | null;
  /** Trọng số DANH NGHĨA — tiêu chí thiếu dữ liệu vẫn mang nó, chỉ không cộng vào điểm. */
  weight: number;
  n: number;
  /** Nguyên văn nhãn của bộ đo: «ĐO», «CHUNG», «ĐO 1,1; CHUNG 0,9»… */
  label: string;
  /** `gate` = cổng dữ liệu đã bảo đảm · `thieu_du_lieu` = phương án này không có đầu vào. */
  notScored: 'gate' | 'thieu_du_lieu' | null;
  why: string | null;
  /** Phần tử bị trừ điểm, theo mã phòng. */
  refs: string[];
}

export interface AiPlanLevelView {
  level: number;
  name: string;
  /** Tỷ lệ và hướng giấy do BỘ VẼ chọn theo kích thước nhà, không phải người dùng đặt. */
  scale: number;
  orientation: 'landscape' | 'portrait';
  notes: { code: string; message: string }[];
  rooms: number;
  /** Mã, loại, diện tích từng phòng (T53) — vắng ở Worker cũ. */
  roomList?: { id: string; type: string; area_m2: number }[];
  /** Phòng là một KHÔNG GIAN MỞ đã chia khu (T48). Rỗng ở artifact trước 16/09/2026. */
  openSpaces: { id: string; parts: { type: string; area_m2: number }[] }[];
  /** Mục này là tờ mặt bằng mái (Haan chốt 04/10/2026), không phải một tầng. Vắng ở Worker cũ. */
  roof?: boolean;
  /** Ý định bố cục mô hình khai, ĐÃ chuẩn hoá (T43). `null` ở artifact dựng theo cây (trước 14/09/2026). */
  intent: AiPlanIntentView | null;
  /** Tóm tắt bộ giải xếp phòng (T43). `null` ở artifact dựng theo cây. */
  arrange: AiPlanArrangeView | null;
}

/** Chín vùng của khối nhà, nhìn từ đường vào — cùng enum hợp đồng `ai-plan-intent`. */
export type AiPlanZone =
  | 'front_left'
  | 'front'
  | 'front_right'
  | 'left'
  | 'center'
  | 'right'
  | 'back_left'
  | 'back'
  | 'back_right';

export interface AiPlanIntentView {
  rooms: { id: string; zone: AiPlanZone; street_facing: boolean }[];
  relationships: { a: string; b: string; kind: 'adjacent' | 'near' | 'far' | 'open' }[];
  entry_room: string | null;
  garage_room: string | null;
}

export interface AiPlanArrangeView {
  /** Số cây ứng viên bộ giải dựng được. */
  candidates: number;
  /** Số cây qua trọn bộ kiểm. */
  passed: number;
  /** Độ khớp ý định của cây được chọn, 0–1. */
  intent_fit: number;
  parti: string;
  /** `0` = giữ trọn vùng mô hình khai; `1`, `2` = đã nới vùng để xếp được. */
  relaxed: number;
}

export interface AiPlanReview {
  artifactId: string;
  createdAt: string;
  variantId: string;
  variantLabel: string;
  strategy: string | null;
  rationale: string;
  generator: {
    provider: string;
    model: string;
    prompt_version: string;
    repaired?: boolean;
    walls_derived?: boolean;
    /**
     * `intent` = mô hình khai ý định bố cục, chương trình xếp phòng (T43, 14/09/2026) · `tree` = mô
     * hình khai cây chia theo tầng (T37). Vắng ở artifact trước 13/09/2026.
     */
    layout?: 'tree' | 'intent';
    /** Tầng đã phải lấy mẫu lại (T39). */
    resampled_levels?: number[];
    /** Có mặt khi phương án là bản sửa theo yêu cầu kỹ sư (T53). */
    edit?: { instruction: string; base_ref: string; ops: Record<string, unknown>[] } | null;
  };
  wallsDerived: boolean;
  levels: AiPlanLevelView[];
  roomLabels: Record<string, string>;
  blocking: AiPlanIssue[];
  findings: AiPlanIssue[];
  rulePacks: AiRulePackChoice;
  warnings: AiPlanWarning[];
  checkedRules: string[];
  uncheckedRules: Array<{ ruleId: string; predicate: string; source: string }>;
  /** Rỗng với artifact đúc trước 12/09/2026 — lúc ấy chưa có thước chấm nào. */
  score: AiPlanScoreView | null;
  /** Ngưỡng nhận của luồng tự động, % (T53). Vắng ở Worker cũ; `null` = không có ngưỡng. */
  acceptPercent?: number | null;
  /** Mã nhóm dưới sàn nhóm (T96): có thì phương án DƯỚI ngưỡng dù tổng vượt. Vắng ở Worker cũ. */
  belowGroups?: string[];
  /** Sửa được bằng ô yêu cầu không — cần cây chia đã lưu (T53). */
  editable?: boolean;
}

/**
 * Đọc lại một phương án: kiểm, cảnh báo, ghi chú bộ vẽ — Worker tính LÚC ĐỌC.
 *
 * Gói quy tắc là tham số của lời gọi, không phải thuộc tính của phương án: cảnh báo là lăng
 * kính người đọc chọn (T20). Đổi ô tích là đổi khoá truy vấn, nên danh sách cảnh báo tự nạp lại.
 */
export function useAiPlanReview(
  projectId: string,
  artifactId: string | null,
  packs: AiRulePackChoice,
) {
  return useQuery<AiPlanReview, Error>({
    queryKey: ['ai_plan_review', projectId, artifactId, packs.standards, packs.experience],
    queryFn: () =>
      designApi<AiPlanReview>(
        `/design/ai/plan/${projectId}/review?artifactId=${encodeURIComponent(artifactId!)}` +
          `${packs.standards ? '&standards=1' : ''}${packs.experience ? '&experience=1' : ''}`,
      ),
    enabled: Boolean(projectId && artifactId),
  });
}

export interface AiPlanSheetState {
  /** Địa chỉ blob để gắn vào `<img>`. `null` khi chưa có hoặc đang nạp. */
  url: string | null;
  /** Vùng bấm từng phòng đọc từ tờ vẽ (`parseRoomHits`) — rỗng với tờ mặt đứng hoặc Worker cũ. */
  hits: SheetRoomHit[];
  scale: number | null;
  orientation: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Tờ mặt bằng một tầng, dạng ảnh.
 *
 * Hai điều cố ý ở đây. **Một**: tờ vẽ hiện qua `<img src=blob:>`, không bao giờ nhúng thẳng SVG
 * vào trang — tên phòng do mô hình sinh là nội dung không tin được, và trong `<img>` thì kịch
 * bản nhúng trong tệp không chạy (CLAUDE.md 8.2, điểm 5). **Hai**: không dùng TanStack Query —
 * giá trị ở đây là một blob phải THU HỒI khi rời màn hình, còn bộ đệm của Query thì giữ lại giá
 * trị cũ và biến mỗi lần mở tab thành một tờ vẽ rò trong bộ nhớ.
 */
export function useAiPlanSheet(
  projectId: string,
  artifactId: string | null,
  level: number,
): AiPlanSheetState {
  return useSheetBlob(
    projectId && artifactId
      ? `/design/ai/plan/${projectId}/sheet?artifactId=${encodeURIComponent(artifactId)}&level=${level}`
      : null,
    'Không dựng được tờ mặt bằng.',
  );
}

/**
 * Tải một tờ vẽ SVG thành `blob:` kèm tỷ lệ và hướng giấy máy chủ đã chọn — dùng chung cho tờ mặt
 * bằng và tờ mặt đứng (T59). Xem ghi chú của `useAiPlanSheet` về `<img>` và việc thu hồi blob.
 */
function useSheetBlob(path: string | null, fallbackError: string): AiPlanSheetState {
  const [state, setState] = useState<AiPlanSheetState>({
    url: null,
    hits: [],
    scale: null,
    orientation: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!path) {
      setState({
        url: null,
        hits: [],
        scale: null,
        orientation: null,
        loading: false,
        error: null,
      });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, hits: [], scale: null, orientation: null, loading: true, error: null });

    void designApiFile(path)
      .then(async (response) => {
        const blob = await response.blob();
        const hits = parseRoomHits(await blob.text());
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const scale = Number(response.headers.get('X-Sheet-Scale'));
        setState({
          url: objectUrl,
          hits,
          scale: Number.isFinite(scale) && scale > 0 ? scale : null,
          orientation: response.headers.get('X-Sheet-Orientation'),
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          url: null,
          hits: [],
          scale: null,
          orientation: null,
          loading: false,
          error: error instanceof Error ? error.message : fallbackError,
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, fallbackError]);

  return state;
}

// ---------------------------------------------------------------------------
// Bước 2 — mặt đứng (T59)
// ---------------------------------------------------------------------------

/** Ý tưởng mặt đứng như `GET /design/ai/facade/:projectId` trả — nhãn đã dịch ở máy chủ. */
export interface AiFacadeView {
  artifactId: string;
  createdAt: string;
  /** Phương án mặt bằng mà mặt đứng này dựng theo. */
  planRef: string;
  style: string;
  /**
   * Bảng vật liệu: mái, từng vùng, kiểu cửa, lan can — nhãn tiếng Việt từ danh mục. `fromBrief` = dòng
   * kỹ sư đã chọn trong phiếu yêu cầu (chương trình áp thẳng); còn lại là AI đề xuất.
   */
  legend: Array<{ key: string; label: string; value: string; fromBrief?: boolean }>;
  /** Phiếu yêu cầu mà ý tưởng này theo — rỗng khi dựng trước khi có phiếu. */
  briefRef?: string | null;
  palette: { primary_hex: string; secondary_hex: string; accent_hex?: string | null };
  roofType: string;
  pitchDeg: number | null;
  gate: { type: string; w: number | null; h: number | null } | null;
  fenceH: number | null;
  openings: number;
  balconies: number;
  elements: string[];
  rationale: string;
  generator: { provider: string; model: string; route: string; repaired?: boolean };
  /** Cảnh báo lúc ghép — mã AI chọn ngoài phong cách đầu bài (T175). Vắng ở máy chủ cũ. */
  warnings?: Array<{ code: string; message: string }>;
  /**
   * Điểm «giống cách NVG vẽ đến đâu» (T63). Vắng ở máy chủ cũ và ở bản mặt đứng dựng trước khi có
   * thước — khi ấy màn hình không hiện panel điểm, không hiện 0.
   */
  score?: AiFacadeScore;
  /** Bản KỸ SƯ CHẤM LẠI gần nhất của đúng bản vẽ này (T63). `null` khi chưa ai chấm. */
  review?: AiFacadeReviewView | null;
}

/** Bảng điểm kỹ sư chấm tay, kèm điểm đã áp bảng ấy (`ai/facade/review.ts`). */
export interface AiFacadeReviewView {
  artifactId: string;
  reviewedAt: string;
  note: string | null;
  machinePercent: number | null;
  criteria: Array<{ code: string; score: number | null; note: string | null }>;
  score: AiFacadeScore & {
    /** Mã tiêu chí kỹ sư đã chấm; và trong số đó, những mã chấm KHÁC máy. */
    reviewed: string[];
    changed: string[];
    /** Bảng chấm dựng trên bản thước cũ — hai thang điểm không so thẳng được. */
    staleRuler: boolean;
  };
}

/** Điểm mặt đứng — cùng hình dạng `FacadeScore` của Worker (`ai/facade/score.ts`). */
export interface AiFacadeScore {
  scoreVersion: number;
  coSoDuLieu: string;
  points: number;
  scoredWeight: number;
  /** % trên phần chấm được — con số đem so với `acceptPercent`. */
  percent: number | null;
  acceptPercent: number | null;
  groups: Array<{ code: string; vi: string; weight: number; scoredWeight: number; points: number }>;
  criteria: Array<{
    code: string;
    group: string;
    vi: string;
    giaiThich: string | null;
    value: number | null;
    score: number | null;
    weight: number;
    n: number;
    label: string;
    /** Mô hình quyết được tiêu chí này không — `false` = do mặt bằng, phiếu, hoặc quy ước cấu tạo. */
    doAi: boolean;
    why: string | null;
    /** Chi tiết làm mất điểm (T175 — «còn thiếu: phào chỉ…»). Vắng ở máy chủ cũ. */
    detail?: string;
  }>;
}

export function useAiFacade(projectId: string, artifactId: string | null) {
  return useQuery<AiFacadeView, Error>({
    queryKey: ['ai_facade', projectId, artifactId],
    queryFn: () =>
      designApi<AiFacadeView>(
        `/design/ai/facade/${projectId}?artifactId=${encodeURIComponent(artifactId!)}`,
      ),
    enabled: Boolean(projectId && artifactId),
  });
}

/** Tờ mặt đứng mặt tiền, dạng ảnh — cùng cách với tờ mặt bằng (qua `<img src=blob:>`). */
export function useAiFacadeSheet(projectId: string, artifactId: string | null): AiPlanSheetState {
  return useSheetBlob(
    projectId && artifactId
      ? `/design/ai/facade/${projectId}/sheet?artifactId=${encodeURIComponent(artifactId)}`
      : null,
    'Không dựng được tờ mặt đứng.',
  );
}

// ── Ảnh mặt đứng có vật liệu (T59 Đợt E) ──────────────────────────────────────────────────────

/**
 * Ảnh mặt đứng có vật liệu đã vẽ (nếu có) cho một ý tưởng — cùng khuôn `useAiPlanSheetImage`: blob phải
 * thu hồi, 404 là «chưa vẽ» chứ không phải lỗi, mọi mã khác phải nói ra (tránh trả tiền vẽ lại một
 * tấm đã có).
 */
export function useAiFacadeImage(
  projectId: string,
  artifactId: string | null,
  reloadKey: number,
): AiPlanSheetImageState {
  const [state, setState] = useState<AiPlanSheetImageState>({
    url: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!projectId || !artifactId) {
      setState({ url: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, error: null });
    void designApiFile(
      `/design/ai/facade/${projectId}/image?artifactId=${encodeURIComponent(artifactId)}`,
    )
      .then(async (response) => {
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof DesignApiError ? error.status : undefined;
        if (status === 404) {
          setState({ url: null, loading: false, error: null });
          return;
        }
        setState({ url: null, loading: false, error: toUserMessage(error) });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, artifactId, reloadKey]);

  return state;
}

export interface DrawnFacadeImage {
  imageArtifactId: string;
  mime: string;
  /** Câu in ĐÈ LÊN PIXEL — do máy chủ đưa (`kb/`). */
  watermark: string;
  promptVersion: string;
  usage: AiCallUsage | null;
}

/**
 * Vẽ ảnh mặt đứng có vật liệu: tải ảnh neo (không khung tên), rasterise ở trình duyệt, gửi lên máy
 * chủ. Cùng khuôn `useDrawAiPlanSheetImage`. ⚠️ Lượt này TIÊU TIỀN THẬT.
 */
export function useDrawAiFacadeImage() {
  return useMutation<
    DrawnFacadeImage,
    Error,
    { projectId: string; artifactId: string; route: string }
  >({
    mutationFn: async ({ projectId, artifactId, route }) => {
      const response = await designApiFile(
        `/design/ai/facade/${projectId}/anchor?artifactId=${encodeURIComponent(artifactId)}`,
        // Bỏ qua bộ đệm: tấm này đi thẳng ra nhà cung cấp và tốn tiền.
        true,
      );
      const width = Number(response.headers.get('X-Anchor-Width'));
      const height = Number(response.headers.get('X-Anchor-Height'));
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Máy chủ không khai cỡ ảnh neo. Mở lại trang rồi thử lại.');
      }
      const url = URL.createObjectURL(await response.blob());
      try {
        const anchorBase64 = await svgUrlToPngBase64(url, width, height);
        return await designApi<DrawnFacadeImage>(`/design/ai/facade/${projectId}/image`, {
          artifactId,
          route,
          anchorBase64,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  });
}

// ── Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2) ─────────────────────────────────────────────

export interface FacadeOption {
  code: string;
  label: string;
}

/** Một phong cách của bộ đặc trưng — phần màn hình cần (T175). */
export interface FacadeStyleView {
  code: string;
  label: string;
  description: string;
  /** `de_xuat` = bản đề xuất, chờ kiến trúc sư NVO duyệt. */
  status: string;
  must: string[];
  prefer: string[];
  avoid: string[];
  /** Mã hợp phong cách theo nhóm của danh mục; nhóm vắng = không giới hạn. */
  allowed: Partial<Record<StyleCodeGroup, string[]>>;
}

/** Danh mục cho các ô chọn của phiếu — đọc từ `kb/facade_vocabulary.yaml` qua Worker. */
export interface FacadeVocabularyView {
  roofTypes: FacadeOption[];
  roofMaterials: FacadeOption[];
  materials: FacadeOption[];
  colours: Array<FacadeOption & { hex: string }>;
  railings: FacadeOption[];
  doorMaterials: FacadeOption[];
  doorTypes: FacadeOption[];
  glassTypes: FacadeOption[];
  garageDoorTypes: FacadeOption[];
  fenceTypes: FacadeOption[];
  gateTypes: FacadeOption[];
  elements: FacadeOption[];
  /**
   * Bộ đặc trưng phong cách (`kb/style_catalogue.yaml`, T175) — phiếu lọc ô chọn theo phong cách. Vắng
   * ở Worker cũ hơn T175: phiếu hiện mọi lựa chọn như trước.
   */
  styles?: FacadeStyleView[];
  /** Giá trị dùng khi kỹ sư để trống — hiện làm chữ gợi ý. */
  defaults: {
    groundRaiseCm: number | null;
    parapetCm: number | null;
    doorHeightCm: number | null;
    /** Chiều cao lan can của quy ước cấu tạo — gợi ý khi kỹ sư để trống. */
    railingHCm: number | null;
  };
}

export function useFacadeVocabulary() {
  return useQuery<FacadeVocabularyView, Error>({
    queryKey: ['ai_facade_vocabulary'],
    queryFn: () => designApi<FacadeVocabularyView>('/design/ai/facade/vocabulary'),
    staleTime: 10 * 60_000,
  });
}

/** Phiếu hiện hành + những gì phiếu cần biết từ mặt bằng đang chọn (bề rộng cửa chỉ đọc). */
export interface FacadeBriefState {
  artifactId: string | null;
  savedAt: string | null;
  brief: AiFacadeBrief | null;
  plan: {
    artifactId: string;
    mainDoorW: number | null;
    sideDoorWs: number[];
    garageW: number | null;
    frontYard: boolean;
    balconies: number;
  } | null;
}

export function useFacadeBrief(projectId: string) {
  return useQuery<FacadeBriefState, Error>({
    queryKey: ['ai_facade_brief', projectId],
    queryFn: () => designApi<FacadeBriefState>(`/design/ai/facade/brief/${projectId}`),
    enabled: Boolean(projectId),
  });
}

/**
 * Lưu yêu cầu mặt đứng — từ T114 là một phiên bản ĐẦU BÀI mới, Worker xác nhận luôn. Không gọi AI.
 * Làm mới cả danh sách phiên bản đầu bài: bước Đầu bài phải thấy ngay phiên bản vừa sinh.
 */
export function useSaveFacadeBrief() {
  const queryClient = useQueryClient();
  return useMutation<
    { artifactId: string | null; unchanged?: boolean },
    Error,
    { projectId: string; brief: AiFacadeBrief }
  >({
    mutationFn: ({ projectId, brief }) =>
      designApi<{ artifactId: string | null; unchanged?: boolean }>(
        `/design/ai/facade/brief/${projectId}`,
        { brief },
      ),
    onSuccess: (_out, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['ai_facade_brief', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['design_briefs'] });
    },
  });
}

/** Tải mặt đứng dạng DXF — xuất một chiều. */
export function useDownloadAiFacadeDxf() {
  return useMutation<void, Error, { projectId: string; artifactId: string }>({
    mutationFn: async ({ projectId, artifactId }) => {
      const response = await designApiFile(
        `/design/ai/facade/${encodeURIComponent(projectId)}/dxf?artifactId=${encodeURIComponent(artifactId)}`,
      );
      await saveResponse(response, 'mat-dung-ai.dxf');
    },
  });
}

export interface AiPlanSheetImageState {
  /** `blob:` để hiển thị — CHƯA đóng dấu; chỗ gọi phải in nhãn trước khi cho xem hoặc tải. */
  url: string | null;
  loading: boolean;
  /** `null` khi tầng chưa có tờ ảnh nào — đó là trạng thái BÌNH THƯỜNG, không phải hỏng hóc. */
  error: string | null;
}

/**
 * Tờ mặt bằng CÓ NỘI THẤT do mô hình ảnh vẽ, nếu tầng này đã vẽ (T57).
 *
 * Cùng khuôn `useAiPlanSheet` và cùng lý do không dùng TanStack Query: giá trị là một blob phải
 * THU HỒI khi rời màn hình.
 *
 * Tầng chưa vẽ thì máy chủ trả 404 — và ở đây đó KHÔNG phải lỗi để kêu lên, chỉ là «chưa có».
 * Chỗ gọi phân biệt bằng `url === null && error === null`.
 */
export function useAiPlanSheetImage(
  projectId: string,
  artifactId: string | null,
  level: number,
  /** Đổi giá trị này để tải lại sau khi vừa vẽ xong một tờ mới. */
  reloadKey: number,
): AiPlanSheetImageState {
  const [state, setState] = useState<AiPlanSheetImageState>({
    url: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!projectId || !artifactId) {
      setState({ url: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, error: null });

    void designApiFile(
      `/design/ai/plan/${projectId}/sheet-image?artifactId=${encodeURIComponent(artifactId)}&level=${level}`,
    )
      .then(async (response) => {
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Nuốt ĐÚNG 404: đường này chỉ hỏi «đã có tờ ảnh chưa», và câu trả lời «chưa» không phải
        // chuyện để báo cho người dùng. Lỗi của việc VẼ thì đi theo mutation bên dưới.
        //
        // ⚠️ Mọi mã khác phải nói ra. Bản trước nuốt tất: một lỗi 502 của kho ảnh hiện y hệt «tầng
        // này chưa vẽ», nên người dùng bấm vẽ lại và trả tiền cho một tấm đã có sẵn.
        const status = error instanceof DesignApiError ? error.status : undefined;
        if (status === 404) {
          setState({ url: null, loading: false, error: null });
          return;
        }
        setState({ url: null, loading: false, error: toUserMessage(error) });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, artifactId, level, reloadKey]);

  return state;
}

export interface DrawnSheetImage {
  imageArtifactId: string;
  level: number;
  mime: string;
  /** Câu in ĐÈ LÊN PIXEL — do máy chủ đưa (`kb/`), không viết cứng ở trình duyệt. */
  watermark: string;
  promptVersion: string;
  usage: AiCallUsage | null;
}

/**
 * Vẽ tờ mặt bằng có nội thất: tải ảnh neo, rasterise ở trình duyệt, gửi lên máy chủ (T57).
 *
 * Ba bước trong MỘT mutation, có chủ đích: hai bước đầu vô nghĩa nếu đứng riêng, và tách chúng ra
 * thì màn hình phải tự ghép lại trạng thái «đang tải neo» với «đang vẽ» — trong khi người bấm chỉ
 * thấy một việc.
 *
 * ⚠️ Lượt này TIÊU TIỀN THẬT. Chỗ gọi phải hiện giá trước khi bấm và hỏi lại khi vẽ lại nhiều lần.
 */
export function useDrawAiPlanSheetImage() {
  return useMutation<
    DrawnSheetImage,
    Error,
    { projectId: string; artifactId: string; level: number; route: string }
  >({
    mutationFn: async ({ projectId, artifactId, level, route }) => {
      const response = await designApiFile(
        `/design/ai/plan/${projectId}/anchor?artifactId=${encodeURIComponent(artifactId)}&level=${level}`,
        // Bỏ qua bộ đệm: tấm này đi thẳng ra nhà cung cấp và tốn tiền, nên nó phải là tờ mà máy
        // chủ dựng NGAY BÂY GIỜ. Xem chú thích ở `designApiFile`.
        true,
      );
      // Cỡ ảnh do MÁY CHỦ khai — không đọc `naturalWidth`, xem `lib/rasterise.ts`.
      const width = Number(response.headers.get('X-Anchor-Width'));
      const height = Number(response.headers.get('X-Anchor-Height'));
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Máy chủ không khai cỡ ảnh neo. Mở lại trang rồi thử lại.');
      }
      const url = URL.createObjectURL(await response.blob());
      try {
        const anchorBase64 = await svgUrlToPngBase64(url, width, height);
        return await designApi<DrawnSheetImage>(`/design/ai/plan/${projectId}/sheet-image`, {
          artifactId,
          level,
          route,
          anchorBase64,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  });
}

/** Chọn một phương án làm bản đang hiệu lực — bước mặt đứng đọc bản này. */
export function useChooseAiPlan() {
  const queryClient = useQueryClient();
  return useMutation<{ artifactId: string }, Error, { projectId: string; artifactId: string }>({
    mutationFn: (body) => designApi<{ artifactId: string }>('/design/ai/plan/choose', body),
    onSuccess: (_data, variables) =>
      void queryClient.invalidateQueries({
        queryKey: ['ai_design_state', variables.projectId],
      }),
  });
}

/**
 * Chọn lại một bản mặt đứng làm bản hiệu lực (20/09/2026).
 *
 * Lượt chạy mới tự đặt mốc, nên tuyến này là đường QUAY LẠI: dựng bản thứ hai rồi thấy bản đầu đẹp
 * hơn thì chọn lại, không phải trả tiền một lượt chạy nữa để có thứ mình đã có.
 */
export function useChooseAiFacade() {
  const queryClient = useQueryClient();
  return useMutation<{ artifactId: string }, Error, { projectId: string; artifactId: string }>({
    mutationFn: (body) => designApi<{ artifactId: string }>('/design/ai/facade/choose', body),
    onSuccess: (_data, variables) =>
      void queryClient.invalidateQueries({
        queryKey: ['ai_design_state', variables.projectId],
      }),
  });
}

/**
 * KỸ SƯ CHẤM LẠI một bản mặt đứng (T63) — không gọi mô hình, không tốn tiền.
 *
 * Tiêu chí KHÔNG gửi lên nghĩa là «để nguyên điểm máy», khác hẳn chấm 0 — nên phía gọi chỉ đưa
 * những tiêu chí kỹ sư thật sự đã chấm.
 */
export function useSaveFacadeReview() {
  const queryClient = useQueryClient();
  return useMutation<
    { artifactId: string },
    Error,
    {
      projectId: string;
      artifactId: string;
      review: {
        criteria: Array<{ code: string; score: number | null; note: string | null }>;
        note: string | null;
      };
    }
  >({
    mutationFn: ({ projectId, ...body }) =>
      designApi<{ artifactId: string }>(`/design/ai/facade/review/${projectId}`, body),
    onSuccess: (_data, variables) =>
      void queryClient.invalidateQueries({
        queryKey: ['ai_facade', variables.projectId, variables.artifactId],
      }),
  });
}

/**
 * Thôi hiện một artifact trong dải chọn: bỏ NGAY khỏi `/state` đang giữ, rồi mới nạp lại. Haan 11/10/2026: «sau khi
 * xoá 1 phương án thì phải re-load lại web thì phương án đó mới biến mất» — hộp thoại đóng lúc lệnh xoá xong, còn
 * `/state` trên bản demo mất 1,8 giây trung vị, 4,1 giây p90 (xem tuyến `/state`), nên phương án đã xoá nằm trên dải
 * suốt quãng ấy. Đưa trở lại (`hidden: false`) thì không đoán chỗ — chờ nạp lại.
 */
function hideFromState(
  queryClient: QueryClient,
  variables: { projectId: string; artifactId: string; hidden?: boolean },
  list: 'plans' | 'facades' | 'imageSets',
): void {
  const key = ['ai_design_state', variables.projectId];
  if (variables.hidden !== false) {
    queryClient.setQueryData<AiDesignState>(key, (state) => {
      if (!state) return state;
      const items = state[list] as Array<{ artifactId: string }> | undefined;
      if (!items) return state;
      return { ...state, [list]: items.filter((item) => item.artifactId !== variables.artifactId) };
    });
  }
  void queryClient.invalidateQueries({ queryKey: key });
}

/** Xoá một bản mặt đứng khỏi dải chọn — THÔI HIỆN, cùng khuôn với `useHideAiPlan`. */
export function useHideAiFacade() {
  const queryClient = useQueryClient();
  return useMutation<
    { artifactId: string; hidden: boolean },
    Error,
    { projectId: string; artifactId: string; hidden?: boolean }
  >({
    mutationFn: (body) =>
      designApi<{ artifactId: string; hidden: boolean }>('/design/ai/facade/hide', body),
    onSuccess: (_data, variables) => hideFromState(queryClient, variables, 'facades'),
  });
}

/**
 * Xoá một phương án khỏi dải chọn — THÔI HIỆN, không xoá dữ liệu (18/09/2026).
 *
 * `hidden: false` đưa phương án trở lại; màn hình chưa dùng đường ấy, nhưng tuyến có sẵn nên một
 * phương án xoá nhầm không cần đến người sửa cơ sở dữ liệu.
 */
export function useHideAiPlan() {
  const queryClient = useQueryClient();
  return useMutation<
    { artifactId: string; hidden: boolean },
    Error,
    { projectId: string; artifactId: string; hidden?: boolean }
  >({
    mutationFn: (body) =>
      designApi<{ artifactId: string; hidden: boolean }>('/design/ai/plan/hide', body),
    onSuccess: (_data, variables) => hideFromState(queryClient, variables, 'plans'),
  });
}

// ---------------------------------------------------------------------------
// Bước 3 — phối cảnh (T67)
// ---------------------------------------------------------------------------

export interface AiImageSetImage {
  view: string;
  /** Nhãn tiếng Việt của góc — do Worker đọc từ `kb/`, màn hình không viết cứng danh sách. */
  label: string;
  anchor: boolean;
  width: number | null;
  height: number | null;
}

export interface AiImageSetView {
  artifactId: string;
  createdAt: string;
  facadeRef: string;
  planRef: string;
  peopleAndVehicles: boolean | null;
  images: AiImageSetImage[];
  /** Góc không vẽ được, kèm lý do tiếng Việt — KHÔNG lặng lẽ hiện ít ảnh hơn. */
  missing: Array<{ view: string; label: string; reason: string }>;
  /** Câu in ĐÈ LÊN PIXEL — do máy chủ đưa (`kb/`). */
  watermark: string;
}

export function useAiImageSet(projectId: string, artifactId: string | null) {
  return useQuery<AiImageSetView, Error>({
    queryKey: ['ai_image_set', projectId, artifactId],
    queryFn: () =>
      designApi<AiImageSetView>(
        `/design/ai/perspective/${projectId}?artifactId=${encodeURIComponent(artifactId!)}`,
      ),
    enabled: Boolean(projectId && artifactId),
  });
}

/** Byte của MỘT góc, tải qua tuyến có kiểm quyền — kho không đọc thẳng được. */
export function useAiImageSetView(
  projectId: string,
  artifactId: string | null,
  view: string | null,
): AiPlanSheetImageState {
  const [state, setState] = useState<AiPlanSheetImageState>({
    url: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!projectId || !artifactId || !view) {
      setState({ url: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, error: null });
    void designApiFile(
      `/design/ai/perspective/${projectId}/view/${encodeURIComponent(view)}?artifactId=${encodeURIComponent(artifactId)}`,
    )
      .then(async (response) => {
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof DesignApiError ? error.status : undefined;
        if (status === 404) {
          setState({ url: null, loading: false, error: null });
          return;
        }
        setState({ url: null, loading: false, error: toUserMessage(error) });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, artifactId, view]);

  return state;
}

export type AiCoverKind = 'perspective' | 'furnished_plan' | 'plan';

export interface AiCoverImage {
  url: string | null;
  kind: AiCoverKind | null;
  loading: boolean;
}

/** Góc phối cảnh làm ảnh bìa: tấm gốc của bộ — luôn có khi bộ ảnh có (bốn góc kia dựng theo nó). */
const AI_COVER_PERSPECTIVE_VIEW = 'front_day';
/**
 * Bề ngang ảnh bìa — khung thẻ 3:2 rộng tới ~600px; đủ nét trên màn hình mật độ cao. Máy chủ thu nhỏ
 * về đúng số này (`?w=`, WebP — `workers/src/design/ai/image-preview.ts`, chỉ nhận số trong
 * `PREVIEW_WIDTHS`): ảnh gốc 1,3–3 MB PNG còn vài chục KB. Một hằng số chung cho hai bên.
 */
const AI_COVER_WIDTH = AI_PREVIEW_WIDTH;
/** Số ảnh bìa nhớ trong phiên — đủ cho một danh sách, không giữ mãi trong bộ nhớ. */
const AI_COVER_CACHE_MAX = 48;

/**
 * Ảnh bìa đã dựng, nhớ TRONG BỘ NHỚ của phiên (không ghi xuống máy — CLAUDE.md 6.5 mục 3: dữ liệu
 * theo quyền từng người không nằm lại trên máy sau đăng xuất). Khoá là mã artifact — băm nội dung,
 * bất biến — nên một ảnh đã dựng không bao giờ cũ: quay lại danh sách là ảnh hiện ngay.
 */
const coverCache = new Map<string, { url: string; kind: AiCoverKind }>();

function rememberCover(key: string, value: { url: string; kind: AiCoverKind }): void {
  coverCache.set(key, value);
  while (coverCache.size > AI_COVER_CACHE_MAX) {
    const oldest = coverCache.keys().next().value as string;
    const evicted = coverCache.get(oldest);
    coverCache.delete(oldest);
    if (evicted?.url.startsWith('blob:')) URL.revokeObjectURL(evicted.url);
  }
}

/**
 * Ảnh bìa của thẻ hồ sơ AI Design (Haan, 08/10/2026): ảnh phối cảnh → mặt bằng tầng 1 có nội thất
 * → tờ mặt bằng tầng 1 (vector). Lấy tấm có thứ hạng cao nhất trong số tấm có.
 *
 * Thứ tự tải theo cái `state` ĐÃ biết. Có bộ ảnh phối cảnh thì CHỈ tải tấm phối cảnh, hỏng mới lùi:
 * tấm ấy là PNG cỡ gốc ~2,7 MB, và tấm mặt bằng nội thất (1,3–2,4 MB) tải song song bên cạnh chỉ
 * giành băng thông với nó để rồi bị bỏ (đo trên bản demo 08/10/2026 — Worker trả trong 0,4 s, phần
 * còn lại của ~4 s là đường tải về). Không có phối cảnh thì hai tấm mặt bằng tải SONG SONG: `state`
 * không nói đã vẽ tấm nội thất chưa, và hỏi lần lượt thì hồ sơ chỉ có mặt bằng thô phải chờ một
 * lượt 404 (~0,8 s) rồi mới tới lượt mình. Ảnh hiện khi mọi tấm XẾP TRÊN nó đã trả lời.
 * Tấm nào hỏng (404 hay lỗi khác — đây là ảnh minh hoạ, không phải chỗ báo lỗi) thì coi như không có.
 *
 * Hai tấm đầu do mô hình ảnh vẽ nên PHẢI đóng dấu lên pixel như ở màn hình chi tiết; canvas không
 * in được dấu thì bỏ tấm ấy, không hiện ảnh AI trần — thẻ không có chỗ cho dòng nhãn thay thế. Dấu
 * in trên bản đã thu nhỏ: nhanh hơn và nhẹ hơn hẳn bản cỡ gốc.
 */
export function useAiCoverImage(
  projectId: string,
  state: AiDesignState | undefined,
  enabled: boolean,
): AiCoverImage {
  const imageSet = state?.imageSetArtifactId ?? state?.imageSets?.[0]?.artifactId ?? null;
  const plan = state?.planHeadArtifactId ?? state?.plans.at(-1)?.artifactId ?? null;
  const cacheKey = `${projectId}|${imageSet ?? ''}|${plan ?? ''}`;
  const [cover, setCover] = useState<AiCoverImage>(() => {
    const hit = coverCache.get(cacheKey);
    return hit ? { ...hit, loading: false } : { url: null, kind: null, loading: false };
  });

  useEffect(() => {
    const hit = coverCache.get(cacheKey);
    if (hit) {
      setCover({ ...hit, loading: false });
      return;
    }
    if (!enabled || !projectId || (!imageSet && !plan)) {
      setCover({ url: null, kind: null, loading: false });
      return;
    }
    let cancelled = false;
    // Blob gốc chỉ sống tới khi đóng dấu xong (dấu cho ra data URL mới); blob của tờ vector thì
    // chính là ảnh bìa — giữ lại nếu được chọn, thu hồi nếu không.
    const blobs: string[] = [];
    let kept: string | null = null;
    setCover({ url: null, kind: null, loading: true });

    const fetchBlob = async (path: string): Promise<string | null> => {
      try {
        const response = await designApiFile(path);
        const url = URL.createObjectURL(await response.blob());
        blobs.push(url);
        return url;
      } catch {
        return null;
      }
    };

    const ref = plan ? encodeURIComponent(plan) : null;
    // Mỗi tấm một hàm tải, gọi khi tới lượt; `started` giữ lời hứa để không tải một tấm hai lần.
    const candidates: Array<{ kind: AiCoverKind; load: () => Promise<string | null> }> = [];
    if (imageSet) {
      candidates.push({
        kind: 'perspective',
        load: () =>
          fetchBlob(
            `/design/ai/perspective/${projectId}/view/${AI_COVER_PERSPECTIVE_VIEW}?artifactId=${encodeURIComponent(imageSet)}&w=${AI_COVER_WIDTH}`,
          ),
      });
    }
    if (ref) {
      candidates.push(
        {
          kind: 'furnished_plan',
          load: () =>
            fetchBlob(
              `/design/ai/plan/${projectId}/sheet-image?artifactId=${ref}&level=1&w=${AI_COVER_WIDTH}`,
            ),
        },
        {
          kind: 'plan',
          load: () => fetchBlob(`/design/ai/plan/${projectId}/sheet?artifactId=${ref}&level=1`),
        },
      );
    }
    const started = new Map<AiCoverKind, Promise<string | null>>();
    const start = (candidate: (typeof candidates)[number]): Promise<string | null> => {
      let pending = started.get(candidate.kind);
      if (!pending) {
        pending = candidate.load();
        started.set(candidate.kind, pending);
      }
      return pending;
    };

    void (async () => {
      for (const [index, candidate] of candidates.entries()) {
        // Tấm phối cảnh tải MỘT MÌNH; tới hai tấm mặt bằng thì khởi động cả hai cùng lúc.
        if (candidate.kind !== 'perspective') {
          for (const rest of candidates.slice(index)) void start(rest);
        }
        const url = await start(candidate);
        if (cancelled) return;
        if (url) {
          kept = url;
          rememberCover(cacheKey, { url, kind: candidate.kind });
          setCover({ url, kind: candidate.kind, loading: false });
          return;
        }
      }
      setCover({ url: null, kind: null, loading: false });
    })();

    return () => {
      cancelled = true;
      // Đợi các tấm còn đang tải xong rồi mới thu hồi — tấm về muộn vẫn tạo blob.
      void Promise.allSettled(started.values()).then(() => {
        for (const url of blobs) if (url !== kept) URL.revokeObjectURL(url);
      });
    };
  }, [projectId, imageSet, plan, enabled, cacheKey]);

  return cover;
}

/**
 * Tải một tờ neo SVG rồi đổi sang PNG base64.
 *
 * Cỡ ảnh lấy từ HEADER máy chủ khai, KHÔNG từ `naturalWidth`: máy chủ sẽ dựng lại đúng tờ ấy và
 * đối chiếu cỡ khung, nên hai bên phải nói cùng một con số. Đoán sai ở đây thì lượt chạy bị từ
 * chối — may là từ chối, vì nếu lọt qua thì mô hình nhận một tờ đã bị bóp.
 */
async function rasteriseAnchor(path: string): Promise<string> {
  // Bỏ qua bộ đệm: tấm này đi thẳng ra nhà cung cấp và tốn tiền.
  const response = await designApiFile(path, true);
  const width = Number(response.headers.get('X-Anchor-Width'));
  const height = Number(response.headers.get('X-Anchor-Height'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Máy chủ không khai cỡ ảnh neo. Mở lại trang rồi thử lại.');
  }
  const url = URL.createObjectURL(await response.blob());
  try {
    return await svgUrlToPngBase64(url, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Khởi động lượt dựng bộ ảnh phối cảnh.
 *
 * Khác `useStartAiRun`: tờ neo phải rasterise ở TRÌNH DUYỆT trước (Worker không có canvas), nên
 * hook tải HAI tờ — mặt đứng (không khung tên) và mặt bằng mái — đổi sang PNG, rồi mới gửi. Tờ mái
 * là thứ giữ cho góc nghiêng và góc trên cao đúng chiều sâu nhà; thiếu nó thì hai góc ấy không
 * chạy. ⚠️ Lượt này TIÊU TIỀN THẬT — mỗi góc một lượt gọi.
 */
export function useStartPerspectiveRun() {
  return useMutation<
    { runId: string; views: string[]; skipped: Array<{ view: string; reason: string }> },
    Error,
    | { projectId: string; artifactId: string; route: string; peopleAndVehicles: boolean }
    | { projectId: string; uploadId: string; route: string; peopleAndVehicles: boolean }
  >({
    mutationFn: async (input) => {
      const { projectId, route, peopleAndVehicles } = input;
      // Mặt đứng kỹ sư tải lên (T114 Đợt 4b): ảnh neo là chính tệp đã lưu, máy chủ tự đọc — không
      // rasterise gì ở trình duyệt.
      if ('uploadId' in input) {
        return await designApi(`/design/ai/perspective/runs`, {
          projectId,
          uploadId: input.uploadId,
          route,
          peopleAndVehicles,
        });
      }
      const artifactId = input.artifactId;
      const anchors = [
        {
          kind: 'elevation',
          base64: await rasteriseAnchor(
            `/design/ai/facade/${projectId}/anchor?artifactId=${encodeURIComponent(artifactId)}`,
          ),
        },
        {
          kind: 'roof_plan',
          base64: await rasteriseAnchor(
            `/design/ai/perspective/${projectId}/roof-anchor?artifactId=${encodeURIComponent(artifactId)}`,
          ),
        },
      ];
      return await designApi(`/design/ai/perspective/runs`, {
        projectId,
        artifactId,
        route,
        peopleAndVehicles,
        anchors,
      });
    },
  });
}

/** Chọn một bộ ảnh làm bộ hiệu lực — đường QUAY LẠI, không phải trả tiền lượt chạy nữa. */
export function useChooseAiImageSet() {
  const queryClient = useQueryClient();
  return useMutation<{ artifactId: string }, Error, { projectId: string; artifactId: string }>({
    mutationFn: (body) => designApi<{ artifactId: string }>('/design/ai/perspective/choose', body),
    onSuccess: (_data, variables) =>
      void queryClient.invalidateQueries({ queryKey: ['ai_design_state', variables.projectId] }),
  });
}

/** Thôi hiện một bộ ảnh trong dải chọn — KHÔNG xoá dữ liệu. */
export function useHideAiImageSet() {
  const queryClient = useQueryClient();
  return useMutation<
    { artifactId: string; hidden: boolean },
    Error,
    { projectId: string; artifactId: string; hidden?: boolean }
  >({
    mutationFn: (body) =>
      designApi<{ artifactId: string; hidden: boolean }>('/design/ai/perspective/hide', body),
    onSuccess: (_data, variables) => hideFromState(queryClient, variables, 'imageSets'),
  });
}

/**
 * Vẽ lại ĐÚNG MỘT góc. ⚠️ Một lượt gọi tính tiền — nhưng chỉ một, bốn tấm kia giữ nguyên byte cũ.
 *
 * `front_day` không đi đường này: nó là tấm gốc của cả bộ, máy chủ từ chối kèm lý do.
 */
export function useRedrawPerspectiveView() {
  const queryClient = useQueryClient();
  return useMutation<
    { artifactId: string; view: string },
    Error,
    { projectId: string; artifactId: string; view: string; route: string }
  >({
    mutationFn: (body) =>
      designApi<{ artifactId: string; view: string }>('/design/ai/perspective/redraw', body),
    onSuccess: (_data, variables) =>
      void queryClient.invalidateQueries({ queryKey: ['ai_design_state', variables.projectId] }),
  });
}

// ---------------------------------------------------------------------------
// Bản vẽ kỹ sư tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4)
// ---------------------------------------------------------------------------

export type UploadedDrawingKind = 'plan' | 'facade';

export interface UploadedDrawingItem {
  uploadId: string;
  createdAt: string;
  drawing: UploadedDrawingKind;
  /** Tầng của mặt bằng; `null` với mặt đứng. */
  level: number | null;
  note: string | null;
  width: number;
  height: number;
  /** Tấm mới nhất mô hình đã vẽ từ bản này — `null` khi chưa vẽ. */
  imageArtifactId: string | null;
}

export function useUploadedDrawings(projectId: string, drawing: UploadedDrawingKind) {
  return useQuery<{ items: UploadedDrawingItem[] }, Error>({
    queryKey: ['ai_uploaded_drawings', projectId, drawing],
    queryFn: () =>
      designApi<{ items: UploadedDrawingItem[] }>(
        `/design/ai/uploads/${projectId}?drawing=${drawing}`,
      ),
    enabled: Boolean(projectId),
  });
}

/** Tải lên một bản đã chuẩn hoá ở trình duyệt (`lib/drawing-upload.ts`). Không gọi AI. */
export function useUploadDrawing() {
  const queryClient = useQueryClient();
  return useMutation<
    { uploadId: string },
    Error,
    {
      projectId: string;
      drawing: UploadedDrawingKind;
      level: number | null;
      note: string | null;
      identityCleared: boolean;
      imageBase64: string;
    }
  >({
    mutationFn: ({ projectId, ...body }) =>
      designApi<{ uploadId: string }>(`/design/ai/uploads/${projectId}`, body),
    onSuccess: (_out, { projectId, drawing }) => {
      void queryClient.invalidateQueries({
        queryKey: ['ai_uploaded_drawings', projectId, drawing],
      });
    },
  });
}

/** Vẽ ảnh TỪ một bản đã tải. ⚠️ Tiêu tiền thật — chỗ gọi hiện giá và hỏi lại khi vẽ lại. */
export function useDrawFromUpload() {
  const queryClient = useQueryClient();
  return useMutation<
    Omit<DrawnSheetImage, 'level'>,
    Error,
    { projectId: string; uploadId: string; drawing: UploadedDrawingKind; route: string }
  >({
    mutationFn: ({ projectId, uploadId, route }) =>
      designApi<Omit<DrawnSheetImage, 'level'>>(
        `/design/ai/uploads/${projectId}/${uploadId}/image`,
        { route },
      ),
    onSuccess: (_out, { projectId, drawing }) => {
      void queryClient.invalidateQueries({
        queryKey: ['ai_uploaded_drawings', projectId, drawing],
      });
    },
  });
}

/**
 * Một tệp ảnh của Worker (đòi đăng nhập) → địa chỉ `blob:` để đặt vào `<img>`. `path = null` thì
 * không tải. 404 nghĩa là «chưa có» — không phải lỗi để báo; mã khác thì báo (cùng lý do
 * `useAiPlanSheetImage`: nuốt hết thì lỗi kho trông y hệt «chưa vẽ»).
 */
export function useDesignImage(path: string | null): AiPlanSheetImageState {
  const [state, setState] = useState<AiPlanSheetImageState>({
    url: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!path) {
      setState({ url: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, error: null });
    void designApiFile(path)
      .then(async (response) => {
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof DesignApiError ? error.status : undefined;
        setState({
          url: null,
          loading: false,
          error: status === 404 ? null : toUserMessage(error),
        });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return state;
}
