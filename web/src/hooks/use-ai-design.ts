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
import type { AiFacadeBrief } from '@nvg/shared/design';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DesignApiError, designApi, designApiFile } from '@/lib/design-api';
import { toUserMessage } from '@/hooks/use-error-message';
import { svgUrlToPngBase64 } from '@/lib/rasterise';
import { supabase } from '@/lib/supabase';

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
  /** Giá một tấm ảnh, USD. `null` = cấu hình chưa khai giá → hiện «Chưa đủ dữ liệu», không hiện 0. */
  imageUsd: number | null;
  /** Giá niêm yết mỗi triệu token vào/ra, USD. Vắng ở máy chủ cũ. */
  inputPer1mUsd?: number | null;
  outputPer1mUsd?: number | null;
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
 * Nhật ký lượt gọi AI của MỘT hồ sơ — gọi thẳng Supabase (CLAUDE.md 3.1): chỉ đọc một bảng,
 * quyền đã có RLS (`rls_design_readable`). Mới nhất lên đầu; giới hạn 500 dòng để một hồ sơ
 * chạy thử nhiều lần không kéo cả bảng về trình duyệt.
 */
export function useAiCallLog(projectId: string, options: { live?: boolean } = {}) {
  return useQuery<AiCallLogRow[], Error>({
    // Lượt chạy nền ghi từng dòng khi từng tầng xong — hỏi lại để con số chạy theo tiến độ.
    refetchInterval: options.live ? 5_000 : false,
    queryKey: ['design_ai_call', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_ai_call')
        .select(
          'id, created_at, route, provider, model, purpose, input_tokens, output_tokens, image_count, latency_ms, status, error_code, cost_usd',
        )
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as AiCallLogRow[];
    },
    enabled: Boolean(projectId),
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
  plans: Array<{ artifactId: string; createdAt: string }>;
  /** Phương án đã CHỌN. Rỗng khi đã có phương án nhưng chưa ai chọn — bước mặt đứng chờ cái này. */
  planHeadArtifactId: string | null;
  facadeArtifactId: string | null;
  /**
   * Mặt bằng mà mặt đứng hiện hành dựng theo (T59). Khác `planHeadArtifactId` = kỹ sư đã đổi phương án
   * sau khi dựng mặt đứng; mặt đứng cũ vẫn giữ, gắn nhãn «dựng theo phương án cũ».
   */
  facadePlanRef?: string | null;
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
  return useMutation<
    { runId: string },
    Error,
    { projectId: string; route: string; options?: Record<string, unknown> }
  >({
    mutationFn: ({ projectId, route, options }) =>
      designApi<{ runId: string }>(`/design/ai/${stage}/runs`, { projectId, route, ...options }),
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
    scale: null,
    orientation: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!path) {
      setState({ url: null, scale: null, orientation: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, scale: null, orientation: null, loading: true, error: null });

    void designApiFile(path)
      .then(async (response) => {
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const scale = Number(response.headers.get('X-Sheet-Scale'));
        setState({
          url: objectUrl,
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
  /** Giá trị dùng khi kỹ sư để trống — hiện làm chữ gợi ý. */
  defaults: {
    groundRaiseCm: number | null;
    parapetCm: number | null;
    doorHeightCm: number | null;
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

/** Lưu phiếu — một bản mới mỗi lần lưu. Không gọi AI. */
export function useSaveFacadeBrief() {
  const queryClient = useQueryClient();
  return useMutation<{ artifactId: string }, Error, { projectId: string; brief: AiFacadeBrief }>({
    mutationFn: ({ projectId, brief }) =>
      designApi<{ artifactId: string }>(`/design/ai/facade/brief/${projectId}`, { brief }),
    onSuccess: (_out, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['ai_facade_brief', projectId] });
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
    onSuccess: (_data, variables) =>
      void queryClient.invalidateQueries({
        queryKey: ['ai_design_state', variables.projectId],
      }),
  });
}
