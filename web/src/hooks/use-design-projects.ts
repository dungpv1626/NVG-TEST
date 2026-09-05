/**
 * Truy vấn và thao tác trên dự án thiết kế (Module TK).
 *
 * Mọi bước có điều kiện đi qua hàm CSDL chứ không UPDATE thẳng: phát hành bản vẽ phải hạ
 * bản cũ và gửi thông báo trong cùng giao dịch (TK-05), bàn giao phải qua kiểm tra đồng bộ
 * (TK-08), khách duyệt phải ghi lịch sử và đóng dấu lên phiên bản cùng lúc (TK-03).
 * Đặt các quy tắc đó ở trình duyệt thì gọi thẳng PostgREST là đi vòng qua được.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DesignDiscipline,
  DesignReviewDecision,
  DesignReviewerType,
  DesignStage,
  DesignSyncFinding,
  DisciplineTaskStatus,
  MoneyValue,
} from '@nvg/shared';
import type { DesignBriefDraft } from '@nvg/shared/design';
import { designApi, designApiFile } from '@/lib/design-api';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export interface DesignProjectRecord {
  id: string;
  code: string;
  company_id: string;
  name: string;
  stage: DesignStage;
  handover_deadline: string | null;
  handed_over_at: string | null;
  responsible_user_id: string | null;
  created_at: string;
  customer: { id: string; name: string } | null;
  responsible: { full_name: string } | null;
}

const PROJECT_SELECT =
  'id, code, company_id, name, stage, handover_deadline, handed_over_at, ' +
  'responsible_user_id, created_at, ' +
  'customer:customers!design_projects_customer_id_customers_id_fk(id, name), ' +
  'responsible:users!design_projects_responsible_user_id_users_id_fk(full_name)';

/**
 * `enabled` để Dashboard tắt hẳn truy vấn của module người dùng không có quyền xem: RLS vẫn
 * trả về rỗng nên không lộ gì, nhưng gọi một truy vấn chắc chắn rỗng ở mọi lần mở màn hình
 * chủ là lãng phí thật (Webapp Flow 6.5 — không hiển thị thứ người dùng không có quyền).
 */
export function useDesignProjects(options: { enabled?: boolean } = {}) {
  const scope = useCompanyScope();

  return useQuery<DesignProjectRecord[], Error>({
    queryKey: ['design_projects', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('design_projects').select(PROJECT_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DesignProjectRecord[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export interface DesignProjectDetailRecord extends DesignProjectRecord {
  opportunity_id: string | null;
  site_address: string | null;
  stopped_reason: string | null;
  notes: string | null;
  updated_at: string;
  opportunity: { id: string; code: string; name: string } | null;
}

export function useDesignProject(id: string | undefined) {
  return useQuery<DesignProjectDetailRecord | null, Error>({
    queryKey: ['design_projects', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_projects')
        .select(
          `${PROJECT_SELECT}, opportunity_id, site_address, stopped_reason, notes, updated_at, ` +
            'opportunity:opportunities!design_projects_opportunity_id_opportunities_id_fk(id, code, name)',
        )
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as DesignProjectDetailRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface NewDesignProjectInput {
  code: string;
  companyId: string;
  name: string;
  customerId: string | null;
  opportunityId: string | null;
  responsibleUserId: string | null;
  handoverDeadline: string | null;
  siteAddress: string | null;
  notes: string | null;
}

export function useCreateDesignProject() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, NewDesignProjectInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('design_projects')
        .insert({
          code: input.code,
          company_id: input.companyId,
          name: input.name,
          customer_id: input.customerId,
          opportunity_id: input.opportunityId,
          responsible_user_id: input.responsibleUserId,
          handover_deadline: input.handoverDeadline,
          site_address: input.siteAddress,
          notes: input.notes,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_projects'] });
    },
  });
}

/**
 * Cập nhật các trường mô tả của dự án thiết kế.
 *
 * Nhận đúng danh sách cột được phép sửa thay vì một `Record` mở: `stage` và `handed_over_at`
 * chỉ đổi qua hàm nghiệp vụ, để không nơi nào lỡ tay đẩy dự án sang bước khác mà bỏ qua các
 * điều kiện kèm theo.
 */
export function useUpdateDesignProject() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        name: string;
        customer_id: string | null;
        responsible_user_id: string | null;
        handover_deadline: string | null;
        site_address: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      // `.select().single()` bắt buộc: thiếu nó thì RLS chặn mà PostgREST vẫn báo thành công.
      const { error } = await supabase
        .from('design_projects')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_projects'] });
    },
  });
}

/** Chuyển bước dự án thiết kế. Dừng thiết kế thì CSDL bắt buộc nêu nguyên nhân. */
export function useMoveDesignStage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { projectId: string; stage: DesignStage; reason?: string }>({
    mutationFn: async ({ projectId, stage, reason }) => {
      const { error } = await supabase.rpc('move_design_stage', {
        p_design_project_id: projectId,
        p_stage: stage,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_projects'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Đầu bài thiết kế (TK-01)
// ---------------------------------------------------------------------------

export interface DesignBriefRecord {
  id: string;
  version: number;
  is_current_version: boolean;
  design_task: string | null;
  functional_needs: string | null;
  budget_amount: MoneyValue | null;
  budget_note: string | null;
  style_note: string | null;
  site_condition: string | null;
  legal_documents: string | null;
  change_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
  author: { full_name: string } | null;

  // --- Đầu bài có cấu trúc (Lớp 1, TK-10 — migration 0101) --------------------
  /** Payload theo `contracts/design-brief.schema.json`. */
  structured: DesignBriefDraft;
  /** Cột SINH từ `structured`. Postgres trả `numeric` dạng chuỗi. */
  completeness_score: string | null;
  missing_fields: string[] | null;
  artifact_id: string | null;
  site_source_survey_id: string | null;
}

const BRIEF_SELECT =
  'id, version, is_current_version, design_task, functional_needs, budget_amount, budget_note, ' +
  'style_note, site_condition, legal_documents, change_reason, confirmed_at, created_at, ' +
  'structured, completeness_score, missing_fields, artifact_id, site_source_survey_id, ' +
  'author:users!design_briefs_created_by_users_id_fk(full_name)';

/** Toàn bộ phiên bản đầu bài, mới nhất trước — bản đang hiệu lực nằm đầu danh sách. */
export function useDesignBriefs(projectId: string | undefined) {
  return useQuery<DesignBriefRecord[], Error>({
    queryKey: ['design_briefs', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_briefs')
        .select(BRIEF_SELECT)
        .eq('design_project_id', projectId!)
        .is('deleted_at', null)
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DesignBriefRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export interface NewDesignBriefInput {
  projectId: string;
  companyId: string;
  designTask: string | null;
  functionalNeeds: string | null;
  budgetAmount: string | null;
  budgetNote: string | null;
  styleNote: string | null;
  siteCondition: string | null;
  legalDocuments: string | null;
  changeReason: string | null;
  /** Phần có cấu trúc theo hợp đồng `DesignBrief`. */
  structured: DesignBriefDraft;
  /** Biên bản khảo sát đã dùng để điền kích thước lô, nếu có. */
  siteSourceSurveyId?: string | null;
}

/**
 * Lưu đầu bài = tạo PHIÊN BẢN MỚI, không ghi đè bản cũ (TK-01).
 * Trigger CSDL cấp số phiên bản và hạ bản trước xuống.
 */
export function useSaveDesignBrief() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, NewDesignBriefInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('design_briefs')
        .insert({
          design_project_id: input.projectId,
          company_id: input.companyId,
          design_task: input.designTask,
          functional_needs: input.functionalNeeds,
          budget_amount: input.budgetAmount,
          budget_note: input.budgetNote,
          style_note: input.styleNote,
          site_condition: input.siteCondition,
          legal_documents: input.legalDocuments,
          change_reason: input.changeReason,
          structured: input.structured,
          site_source_survey_id: input.siteSourceSurveyId ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_briefs'] });
    },
  });
}

/**
 * Lưu nháp đầu bài đang hiệu lực — SỬA TẠI CHỖ, không đẻ phiên bản mới.
 *
 * Chỉ dùng khi bản đó CHƯA xác nhận. Biểu mẫu có cấu trúc dài gấp ba lần bản chữ tự do cũ;
 * bắt nêu nguyên nhân điều chỉnh cho từng lần lưu dở thì không ai dùng nổi. Sau khi xác
 * nhận, trigger `design_briefs_freeze_after_confirm` chặn mọi thay đổi nội dung — muốn đổi
 * thì lập phiên bản mới như cũ.
 */
export function useSaveBriefDraft() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      briefId: string;
      structured: DesignBriefDraft;
      legacy: Record<string, string | null>;
      siteSourceSurveyId?: string | null;
    }
  >({
    mutationFn: async ({ briefId, structured, legacy, siteSourceSurveyId }) => {
      const { error } = await supabase
        .from('design_briefs')
        .update({ structured, ...legacy, site_source_survey_id: siteSourceSurveyId ?? null })
        .eq('id', briefId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_briefs'] });
    },
  });
}

export interface ConfirmBriefResult {
  artifactId: string;
  completenessScore: number;
  missingFields: string[];
  issues: { code: string; severity: string; message: string; paths: string[] }[];
}

/**
 * Xác nhận đầu bài — đi qua Worker vì bước này đúc artifact bất biến.
 *
 * Đây là một trong ba trường hợp CLAUDE.md 3.1 cho phép có endpoint Workers: ghi
 * `design_artifact` + cạnh lineage + `design_head` phải toàn vẹn cùng lúc. Worker cũng
 * TÍNH LẠI độ đầy đủ và bỏ con số trình duyệt gửi lên.
 */
export function useConfirmBriefArtifact() {
  const queryClient = useQueryClient();

  return useMutation<ConfirmBriefResult, Error, { briefId: string }>({
    mutationFn: ({ briefId }) =>
      designApi<ConfirmBriefResult>('/design/brief/confirm', { briefId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_briefs'] });
    },
  });
}

/** Một không gian của chương trình không gian (hợp đồng `SpaceProgram`). */
export interface ProgramSpace {
  id: string;
  type: string;
  floor: number;
  min_area_m2: number;
  target_area_m2?: number | null;
  max_area_m2?: number | null;
  priority?: number;
  needs_daylight?: boolean;
  needs_facade?: boolean;
  needs_ventilation?: boolean;
}

export interface SpaceProgramPayload {
  spaces: ProgramSpace[];
  adjacency?: { a: string; b: string; kind: string; weight?: number }[];
  floor_allocation?: {
    floor: number;
    usable_area_m2?: number | null;
    allocated_area_m2?: number | null;
  }[];
  reference_projects?: string[];
  priors_applied?: boolean;
}

export interface ProgramView {
  program: SpaceProgramPayload;
  /** Mã phòng → tên tiếng Việt, do máy chủ gửi kèm từ `kb/room_vocabulary.yaml`. */
  roomLabels: Record<string, string>;
  warnings: string[];
  unresolvedNeeds: string[];
  briefArtifactId: string;
  headArtifactId: string | null;
  /** Bản đang xem có đúng là bản đã chốt cho các lớp sau dùng không. */
  matchesHead: boolean;
}

/**
 * Chương trình không gian của đầu bài đang hiệu lực.
 *
 * Qua Worker chứ không gọi thẳng Supabase: nội dung artifact nằm trong kho tệp mà trình duyệt
 * không có quyền đọc, và bản thân việc soạn chương trình cần rule pack cùng chuẩn diện tích
 * chỉ có ở phía máy chủ.
 *
 * `retry: false` vì phần lớn lỗi ở đây là trạng thái nghiệp vụ đọc được (chưa xác nhận đầu
 * bài, đầu bài chưa đủ) — thử lại ba lần chỉ làm người dùng chờ lâu hơn để nhận cùng câu.
 */
export function useSpaceProgram(projectId: string, enabled = true) {
  return useQuery<ProgramView, Error>({
    queryKey: ['design_space_program', projectId],
    queryFn: () => designApi<ProgramView>(`/design/program/${projectId}`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

export interface GenerateProgramResult {
  artifactId: string;
  reused: boolean;
  program: SpaceProgramPayload;
  roomLabels: Record<string, string>;
  warnings: string[];
  unresolvedNeeds: string[];
}

/** Chốt chương trình không gian — đúc artifact và chuyển bản đang hiệu lực. */
export function useGenerateSpaceProgram() {
  const queryClient = useQueryClient();

  return useMutation<GenerateProgramResult, Error, { projectId: string }>({
    mutationFn: ({ projectId }) =>
      designApi<GenerateProgramResult>('/design/program/generate', { projectId }),
    onSuccess: (_result, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['design_space_program', projectId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Phương án mặt bằng — Lớp 3 (TK-12, TK-13)
// ---------------------------------------------------------------------------

export interface VariantRoom {
  id: string;
  type: string;
  label: string;
  area_m2: number;
  has_daylight: boolean;
}

export interface VariantLevel {
  level: number;
  height_m: number | null;
  area_m2: number;
  rooms: VariantRoom[];
}

export interface VariantSummary {
  levels: VariantLevel[];
  total_area_m2: number;
  bedrooms: number;
  circulation_share: number;
  altar_level: number | null;
  garage_level: number | null;
  constraint_status: 'pass' | 'warning' | 'infeasible';
  violations: { rule_id: string; severity: 'error' | 'warning'; message: string }[];
}

export interface FloorPlanVariant {
  variantId: string;
  label: string;
  intentArtifactId: string;
  artifactId: string;
  createdAt: string;
  isHead: boolean;
  status: 'ok' | 'infeasible';
  summary: VariantSummary | null;
  /** Hình học đã giải — chỉ để HIỂN THỊ; trình duyệt không dựng gì thêm (CLAUDE.md 8.2 #5). */
  floorPlan: unknown;
  infeasibility: { message: string; conflictRules: string[] } | null;
}

export interface FloorPlanGeneration {
  programArtifactId: string;
  createdAt: string;
  variants: FloorPlanVariant[];
}

export interface FloorPlanVariantsView {
  programArtifactId: string;
  headArtifactId: string | null;
  variants: FloorPlanVariant[];
  /** Các đợt phương án của chương trình không gian trước — bản cũ còn nguyên để so sánh. */
  previous: FloorPlanGeneration[];
}

/**
 * Các phương án đã sinh cho chương trình không gian đang hiệu lực.
 *
 * `retry: false` cùng lý do với `useSpaceProgram`: "chưa chốt chương trình không gian" là
 * trạng thái nghiệp vụ, không phải lỗi mạng.
 */
export function useFloorPlanVariants(projectId: string, enabled = true) {
  return useQuery<FloorPlanVariantsView, Error>({
    queryKey: ['design_floor_plan_variants', projectId],
    queryFn: () => designApi<FloorPlanVariantsView>(`/design/floor-plan/${projectId}`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

/** Sinh (hoặc sinh lại) ba phương án. Đồng bộ — kết quả về trong vài giây. */
export function useGenerateFloorPlans() {
  const queryClient = useQueryClient();
  return useMutation<FloorPlanVariantsView, Error, { projectId: string }>({
    mutationFn: ({ projectId }) =>
      designApi<FloorPlanVariantsView>('/design/floor-plan/generate', { projectId }),
    onSuccess: (view, { projectId }) => {
      queryClient.setQueryData(['design_floor_plan_variants', projectId], view);
    },
  });
}

/** Chọn một phương án làm bản đang hiệu lực cho các bước sau (bản vẽ, khối 3D, thống kê). */
export function useChooseFloorPlan() {
  const queryClient = useQueryClient();
  return useMutation<FloorPlanVariantsView, Error, { projectId: string; artifactId: string }>({
    mutationFn: ({ projectId, artifactId }) =>
      designApi<FloorPlanVariantsView>('/design/floor-plan/choose', { projectId, artifactId }),
    onSuccess: (view, { projectId }) => {
      queryClient.setQueryData(['design_floor_plan_variants', projectId], view);
    },
  });
}

/**
 * Tờ bản vẽ (SVG) của một tầng, do Container dựng — trình duyệt chỉ hiển thị.
 *
 * `artifactId` rỗng = bản đang hiệu lực. Khoá truy vấn mang cả ba tham số để đổi tầng hay đổi
 * phương án là một tờ khác, không phải tờ cũ hiện nhầm.
 */
export function useFloorPlanSheet(projectId: string, artifactId: string | null, level: number) {
  return useQuery<string, Error>({
    queryKey: ['design_floor_plan_sheet', projectId, artifactId, level],
    queryFn: async () => {
      const query = new URLSearchParams({ level: String(level) });
      if (artifactId) query.set('artifact', artifactId);
      const response = await designApiFile(`/design/floor-plan/${projectId}/svg?${query}`);
      return await response.text();
    },
    enabled: Boolean(projectId) && level >= 1,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export interface ScheduleOpeningRow {
  code: string;
  w_m: number;
  h_m: number;
  count: number;
  material?: string | null;
}

export interface SchedulesView {
  schedules: {
    doors: ScheduleOpeningRow[];
    windows: ScheduleOpeningRow[];
    areas: { level: number; room_type: string; area_m2: number }[];
    materials: {
      code: string;
      name: string;
      area_m2?: number | null;
      volume_m3?: number | null;
      count?: number | null;
    }[];
    disclaimer: string;
  };
  roomLabels: Record<string, string>;
}

/** Bảng thống kê của một phương án — tính lại từ mặt bằng, nên đổi mặt bằng là bảng đổi theo. */
export function useFloorPlanSchedules(projectId: string, artifactId: string | null) {
  return useQuery<SchedulesView, Error>({
    queryKey: ['design_floor_plan_schedules', projectId, artifactId],
    queryFn: () =>
      designApi<SchedulesView>(
        `/design/floor-plan/${projectId}/schedules${artifactId ? `?artifact=${artifactId}` : ''}`,
      ),
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/** Tải bảng thống kê dạng XLSX. */
export async function downloadFloorPlanXlsx(
  projectId: string,
  artifactId: string | null,
): Promise<void> {
  const query = artifactId ? `?artifact=${artifactId}` : '';
  const response = await designApiFile(`/design/floor-plan/${projectId}/xlsx${query}`);
  const name =
    /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
    'thong-ke.xlsx';
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Khối ba chiều sơ bộ (glTF nhị phân) của một phương án — trả về URL đối tượng trong bộ nhớ để
 * three.js nạp. Thu hồi URL khi truy vấn bị dọn.
 */
export function useMassingModel(projectId: string, artifactId: string | null) {
  return useQuery<string, Error>({
    queryKey: ['design_floor_plan_glb', projectId, artifactId],
    queryFn: async () => {
      const query = artifactId ? `?artifact=${artifactId}` : '';
      const response = await designApiFile(`/design/floor-plan/${projectId}/glb${query}`);
      return URL.createObjectURL(await response.blob());
    },
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/** Tải tệp DXF của một tầng về máy — cùng tờ với SVG đang xem. */
export async function downloadFloorPlanDxf(
  projectId: string,
  artifactId: string | null,
  level: number,
): Promise<void> {
  const query = new URLSearchParams({ level: String(level) });
  if (artifactId) query.set('artifact', artifactId);
  const response = await designApiFile(`/design/floor-plan/${projectId}/dxf?${query}`);
  const name =
    /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
    `mat-bang-tang-${level}.dxf`;
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Một mục cấu hình của engine thiết kế (`design_setting`).
 *
 * Đọc thẳng Supabase: RLS đã giới hạn theo tenant của người dùng nên không cần truyền
 * `tenant_id` từ trình duyệt. Ngưỡng độ đầy đủ KHÔNG được viết cứng ở `web/`.
 */
export function useDesignSetting(key: string) {
  return useQuery<unknown, Error>({
    queryKey: ['design_setting', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_setting')
        .select('value')
        .eq('key', key)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.value ?? null;
    },
  });
}

/** Xác nhận đầu bài đang hiệu lực — căn cứ đối chiếu khi khách nói "tôi đâu yêu cầu thế này". */
export function useConfirmDesignBrief() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { briefId: string; userId: string }>({
    mutationFn: async ({ briefId, userId }) => {
      const { error } = await supabase
        .from('design_briefs')
        .update({ confirmed_at: new Date().toISOString(), confirmed_by: userId })
        .eq('id', briefId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_briefs'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Phiên bản phương án và bản vẽ (TK-03, TK-05)
// ---------------------------------------------------------------------------

export interface DesignVersionRecord {
  id: string;
  discipline: DesignDiscipline;
  version: number;
  is_current_version: boolean;
  title: string;
  change_reason: string | null;
  published_at: string | null;
  customer_approved_at: string | null;
  created_at: string;
  document_id: string | null;
  document_version_id: string | null;
  publisher: { full_name: string } | null;
}

const VERSION_SELECT =
  'id, discipline, version, is_current_version, title, change_reason, published_at, ' +
  'customer_approved_at, created_at, document_id, document_version_id, ' +
  'publisher:users!design_versions_published_by_users_id_fk(full_name)';

export function useDesignVersions(projectId: string | undefined) {
  return useQuery<DesignVersionRecord[], Error>({
    queryKey: ['design_versions', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_versions')
        .select(VERSION_SELECT)
        .eq('design_project_id', projectId!)
        .is('deleted_at', null)
        .order('discipline')
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DesignVersionRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export interface NewDesignVersionInput {
  projectId: string;
  companyId: string;
  discipline: DesignDiscipline;
  title: string;
  fileUrl: string;
  fileName: string;
  changeReason: string | null;
  notes: string | null;
}

/**
 * Tạo một phiên bản NHÁP kèm tệp trong kho hồ sơ dùng chung (NEN-05, NEN-06).
 *
 * Hai bước: tạo/tìm tài liệu logic của bộ môn, rồi phát hành một phiên bản tệp vào đó. Bản
 * vẽ KHÔNG lưu đường dẫn riêng trong `design_versions` — nếu lưu riêng thì phiên bản tệp có
 * hai nơi quản lý và sớm muộn lệch nhau.
 */
export function useCreateDesignVersion() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, NewDesignVersionInput>({
    mutationFn: async (input) => {
      const { data: existing, error: findError } = await supabase
        .from('documents')
        .select('id')
        .eq('related_entity_type', 'design_projects')
        .eq('related_entity_id', input.projectId)
        .eq('category', `ban_ve_${input.discipline}`)
        .is('deleted_at', null)
        .maybeSingle();
      if (findError) throw findError;

      let documentId = (existing as { id: string } | null)?.id;

      if (!documentId) {
        const { data: created, error: docError } = await supabase
          .from('documents')
          .insert({
            company_id: input.companyId,
            title: input.title,
            category: `ban_ve_${input.discipline}`,
            related_entity_type: 'design_projects',
            related_entity_id: input.projectId,
          })
          .select('id')
          .single();
        if (docError) throw docError;
        documentId = (created as { id: string }).id;
      }

      const { data: documentVersionId, error: versionError } = await supabase.rpc(
        'publish_document_version',
        {
          p_document_id: documentId,
          p_file_url: input.fileUrl,
          p_file_name: input.fileName,
          p_change_reason: input.changeReason ?? 'Bản đầu tiên',
        },
      );
      if (versionError) throw versionError;

      const { data, error } = await supabase
        .from('design_versions')
        .insert({
          design_project_id: input.projectId,
          company_id: input.companyId,
          discipline: input.discipline,
          title: input.title,
          document_id: documentId,
          document_version_id: documentVersionId,
          change_reason: input.changeReason,
          notes: input.notes,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_versions'] });
    },
  });
}

/**
 * Phát hành phiên bản (TK-05) — trả về số người đã được thông báo.
 *
 * Con số đó hiện thẳng trong thông báo thành công: "đã thông báo N người" là bằng chứng
 * việc phát hành đã tới được các bộ phận, thay vì một chữ "Đã lưu" không nói lên điều gì.
 */
export function usePublishDesignVersion() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { versionId: string }>({
    mutationFn: async ({ versionId }) => {
      const { data, error } = await supabase.rpc('publish_design_version', {
        p_version_id: versionId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_versions'] });
      void queryClient.invalidateQueries({ queryKey: ['design_sync'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Vòng góp ý và duyệt của khách hàng (TK-03)
// ---------------------------------------------------------------------------

export interface DesignReviewRecord {
  id: string;
  reviewer_type: DesignReviewerType;
  decision: DesignReviewDecision;
  reviewer_name: string | null;
  comments: string;
  reviewed_at: string;
  recorder: { full_name: string } | null;
}

export function useDesignReviews(versionIds: string[]) {
  const key = [...versionIds].sort().join(',');

  return useQuery<Record<string, DesignReviewRecord[]>, Error>({
    queryKey: ['design_reviews', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_reviews')
        .select(
          'id, design_version_id, reviewer_type, decision, reviewer_name, comments, reviewed_at, ' +
            'recorder:users!design_reviews_recorded_by_users_id_fk(full_name)',
        )
        .in('design_version_id', versionIds)
        .order('reviewed_at', { ascending: false });
      if (error) throw new Error(error.message);

      const grouped: Record<string, DesignReviewRecord[]> = {};
      for (const row of (data ?? []) as unknown as (DesignReviewRecord & {
        design_version_id: string;
      })[]) {
        (grouped[row.design_version_id] ??= []).push(row);
      }
      return grouped;
    },
    enabled: versionIds.length > 0,
  });
}

export function useRecordDesignReview() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      versionId: string;
      reviewerType: DesignReviewerType;
      decision: DesignReviewDecision;
      comments: string;
      reviewerName?: string;
    }
  >({
    mutationFn: async ({ versionId, reviewerType, decision, comments, reviewerName }) => {
      const { error } = await supabase.rpc('record_design_review', {
        p_version_id: versionId,
        p_reviewer_type: reviewerType,
        p_decision: decision,
        p_comments: comments,
        p_reviewer_name: reviewerName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['design_versions'] });
      void queryClient.invalidateQueries({ queryKey: ['design_projects'] });
      void queryClient.invalidateQueries({ queryKey: ['design_sync'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Tiến độ từng bộ môn và kiểm tra đồng bộ (TK-04)
// ---------------------------------------------------------------------------

export interface DisciplineTaskRecord {
  id: string;
  discipline: DesignDiscipline;
  assignee_id: string | null;
  status: DisciplineTaskStatus;
  progress_percent: number;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  conflict_notes: string | null;
  notes: string | null;
  assignee: { full_name: string } | null;
}

export function useDisciplineTasks(projectId: string | undefined) {
  return useQuery<DisciplineTaskRecord[], Error>({
    queryKey: ['design_discipline_tasks', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_discipline_tasks')
        .select(
          'id, discipline, assignee_id, status, progress_percent, start_date, due_date, ' +
            'completed_at, conflict_notes, notes, ' +
            'assignee:users!design_discipline_tasks_assignee_id_users_id_fk(full_name)',
        )
        .eq('design_project_id', projectId!)
        .is('deleted_at', null)
        .order('discipline');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DisciplineTaskRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export function useSaveDisciplineTask() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id?: string;
      projectId: string;
      companyId: string;
      discipline: DesignDiscipline;
      changes: Partial<{
        assignee_id: string | null;
        status: DisciplineTaskStatus;
        progress_percent: number;
        start_date: string | null;
        due_date: string | null;
        completed_at: string | null;
        conflict_notes: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, projectId, companyId, discipline, changes }) => {
      if (id) {
        const { error } = await supabase
          .from('design_discipline_tasks')
          .update(changes)
          .eq('id', id)
          .select('id')
          .single();
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('design_discipline_tasks')
        .insert({
          design_project_id: projectId,
          company_id: companyId,
          discipline,
          ...changes,
        })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_discipline_tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['design_sync'] });
    },
  });
}

/**
 * Kết quả kiểm tra đồng bộ đa bộ môn (TK-04, TK-08).
 *
 * Cùng một hàm CSDL với bước chặn trước khi bàn giao — nên màn hình không bao giờ báo "đã
 * đồng bộ" trong khi nút bàn giao vẫn từ chối.
 */
export function useDesignSync(projectId: string | undefined) {
  return useQuery<DesignSyncFinding[], Error>({
    queryKey: ['design_sync', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_design_sync', {
        p_design_project_id: projectId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DesignSyncFinding[];
    },
    enabled: Boolean(projectId),
  });
}

/** Bàn giao hồ sơ thi công (TK-08) — trả về số người đã được thông báo. */
export function useHandoverToConstruction() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { data, error } = await supabase.rpc('handover_design_to_construction', {
        p_design_project_id: projectId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_projects'] });
      void queryClient.invalidateQueries({ queryKey: ['design_sync'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Yêu cầu thay đổi thiết kế (TK-06)
// ---------------------------------------------------------------------------

export interface ChangeRequestRecord {
  id: string;
  code: string | null;
  title: string;
  origin: string;
  requester_name: string | null;
  requested_at: string;
  content: string;
  reason: string;
  status: string;
  schedule_impact_days: number | null;
  cost_impact: MoneyValue | null;
  affected_drawing_count: number | null;
  impact_notes: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  requester: { full_name: string } | null;
}

export function useChangeRequests(projectId: string | undefined) {
  return useQuery<ChangeRequestRecord[], Error>({
    queryKey: ['change_requests', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('change_requests')
        .select(
          'id, code, title, origin, requester_name, requested_at, content, reason, status, ' +
            'schedule_impact_days, cost_impact, affected_drawing_count, impact_notes, ' +
            'decided_at, decision_notes, ' +
            'requester:users!change_requests_requested_by_users_id_fk(full_name)',
        )
        .eq('design_project_id', projectId!)
        .is('deleted_at', null)
        .order('requested_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ChangeRequestRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export function useSaveChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id?: string;
      projectId: string;
      companyId: string;
      values: Record<string, unknown>;
    }
  >({
    mutationFn: async ({ id, projectId, companyId, values }) => {
      if (id) {
        const { error } = await supabase
          .from('change_requests')
          .update(values)
          .eq('id', id)
          .select('id')
          .single();
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('change_requests')
        .insert({ design_project_id: projectId, company_id: companyId, ...values })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['change_requests'] });
      void queryClient.invalidateQueries({ queryKey: ['design_sync'] });
    },
  });
}
