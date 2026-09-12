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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { designApi, designApiFile } from '@/lib/design-api';

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
  /** Phương án đã CHỌN. Rỗng khi đã có phương án nhưng chưa ai chọn — bước mặt đứng chờ cái này. */
  planHeadArtifactId: string | null;
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

export interface AiPlanLevelView {
  level: number;
  name: string;
  /** Tỷ lệ và hướng giấy do BỘ VẼ chọn theo kích thước nhà, không phải người dùng đặt. */
  scale: number;
  orientation: 'landscape' | 'portrait';
  notes: { code: string; message: string }[];
  rooms: number;
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
  const [state, setState] = useState<AiPlanSheetState>({
    url: null,
    scale: null,
    orientation: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!projectId || !artifactId) {
      setState({ url: null, scale: null, orientation: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, scale: null, orientation: null, loading: true, error: null });

    void designApiFile(
      `/design/ai/plan/${projectId}/sheet?artifactId=${encodeURIComponent(artifactId)}&level=${level}`,
    )
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
          error: error instanceof Error ? error.message : 'Không dựng được tờ mặt bằng.',
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, artifactId, level]);

  return state;
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
