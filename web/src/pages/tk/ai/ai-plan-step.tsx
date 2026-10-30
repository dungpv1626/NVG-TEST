/**
 * Bước 2 của nhánh AI — mặt bằng từng tầng.
 *
 * «AI thiết kế, chương trình cầm bút» (T15): mô hình khai nội dung bản vẽ dạng dữ liệu, bộ vẽ
 * tất định trong Worker đặt lên giấy. Màn hình này là chỗ kiến trúc sư đọc kết quả đó, nên có
 * bốn thứ nó phải nói ra và cả bốn đều là ràng buộc:
 *
 *  · **Tờ vẽ hiện qua `<img>`, không bao giờ nhúng thẳng SVG.** Tên phòng do mô hình sinh là
 *    nội dung không tin được; trong `<img>` thì kịch bản nhúng trong tệp không chạy được
 *    (CLAUDE.md 8.2, điểm 5).
 *  · **Lỗi máy bắt được (đỏ) tách khỏi cảnh báo quy chuẩn (vàng).** Hai loại khác hẳn nhau: một
 *    bên là dữ liệu tự mâu thuẫn, một bên là lệch văn bản pháp quy. Gộp màu thì không ai biết
 *    phải sửa bản vẽ hay phải hỏi lại khách.
 *  · **Số quy tắc CHƯA đối chiếu được.** Danh sách cảnh báo rỗng KHÔNG có nghĩa là đạt quy
 *    chuẩn — giấu con số ấy là để người đọc tự kết luận sai.
 *  · **Tường do chương trình suy** (T19). Tờ vẽ dùng được, nhưng phần tường không phải của AI,
 *    và chỗ đó phải nhìn thấy.
 *
 * T21 (10/09/2026) từng đưa tờ do MÔ HÌNH ẢNH vẽ lên làm tờ chính và hạ tờ vector xuống làm bản
 * đối chiếu; **T22 (12/09/2026) đảo lại**. Lý do nằm ở chính mục tiêu của đợt ấy: một tấm ảnh
 * không bao giờ đo được, nên giữ nó làm tờ chính thì «nâng cao độ chính xác» không đạt được bằng
 * định nghĩa. Tờ ở đây dựng từ toạ độ mô hình khai, nên nó có tỷ lệ thật và mọi kích thước trên đó
 * đo được.
 *
 * **T57 (19/09/2026) KHÔNG đảo lại T22.** Nó thêm một panel RIÊNG ở dưới — ảnh mặt bằng có nội
 * thất để trình khách (`ai-plan-sheet-image.tsx`), vẽ từ ẢNH NEO là chính tờ vector này. Ranh giới
 * giữ T22 còn đúng nằm ở bố cục: tờ vector vẫn là tờ mặc định, vẫn là thứ tải về và xuất DXF, và
 * câu «mọi kích thước đo được» vẫn gắn với NÓ chứ không gắn với tấm ảnh.
 *
 * Điều thứ năm, thêm cùng Đợt C′: **panel điểm chất lượng** (`ai-plan-score.tsx`) nằm SAU danh
 * sách lỗi chặn, không nằm trên. Cổng dữ liệu và điểm là hai tầng kết luận khác nhau (T24) — một
 * phương án tự mâu thuẫn thì điểm của nó không nói gì, và đặt con số lên đầu làm nó đọc như lời
 * phán cuối cùng.
 */

import { formatDateTime, formatNumber } from '@nvg/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Info,
  LayoutGrid,
  Maximize2,
  Sparkles,
  X,
} from 'lucide-react';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/states';
import {
  useAiPlanReview,
  useAiPlanSheet,
  useAiModels,
  useAiRun,
  useChooseAiPlan,
  useDownloadAiPlanDxf,
  useEditAiPlan,
  useHideAiPlan,
  useInvalidateAiDesign,
  useStartAiRun,
  useAiPlanPreflight,
  type AiDesignState,
  type AiPlanIssue,
  type AiPlanLevelView,
  type AiPlanZone,
  type AiPlanReview,
  type AiRulePackChoice,
  type ReasoningEffort,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, ReasoningEffortPicker, useAiChoice } from './ai-model-picker';
import { RulePackPicker } from './ai-rule-pack-picker';
import { AiRunProgress } from './ai-run-progress';
import { PlanImagePanel } from './ai-plan-image';
import { SheetSizeControl, sheetWidthStyle, useSheetSize } from './sheet-size';
import { fileSlug, numberedNames } from './variant-name';
import { SheetViewer } from './sheet-zoom';
import { cn } from '@/lib/utils';
import {
  CostEstimateLine,
  costOnButton,
  estimateSource,
  useCostEstimate,
} from './ai-cost-estimate';
import { costCeiling, maxCallCost, type CostEstimate, type MaxCallCost } from './run-cost-estimate';
import { formatUsd } from './ai-usage';
import { AiPlanCompare, ScoreChip } from './ai-plan-compare';
import { PlanVerdict, planVerdict } from './ai-plan-verdict';
import { FullscreenFrame } from '@/components/ui/fullscreen-frame';
import { openWorkspaceTab, SplitWorkspace } from '@/components/ui/split-workspace';
import { PlanEditPanel } from './ai-plan-edit';
import { roomName } from './plan-deductions';
import { roomFixRequest, SheetRoomOverlay } from './sheet-room-overlay';
import { failureViews, type FailedVariant } from './plan-failure';

/** Kết quả một lượt chạy giai đoạn mặt bằng, đúng hình dạng Workflow ghi vào `design_ai_run`. */
interface PlanRunResult {
  plans: Array<{
    variantId: string;
    artifactId: string;
    wallsDerived: boolean;
    repaired: boolean;
    /** Tầng đã phải lấy mẫu lại (T39). Vắng ở lượt chạy trước 13/09/2026. */
    resampledLevels?: number[];
    findings: AiPlanIssue[];
    notes: Array<{ code: string; message: string }>;
  }>;
  failed: FailedVariant[];
}

const COUNTS = ['1', '2', '3'] as const;

/** Ảnh ở tab này là tờ MẶT BẰNG có đồ đạc (T57); ảnh nội thất từng phòng ở bước Mặt ngoài (B3b). */
const ROOM_RENDER_POINTER =
  'Ảnh nội thất từng phòng (góc nhìn trong phòng) vẽ ở bước Mặt ngoài, phần «Nội thất từng phòng».';

export function AiPlanStep({
  projectId,
  readOnly,
  state,
}: {
  projectId: string;
  readOnly: boolean;
  state: AiDesignState;
}): React.ReactElement {
  const ai = useAiChoice('text', false);
  // Ô chọn model ẢNH không ở đây mà nằm trong panel «Ảnh mặt bằng có nội thất» (T57), cạnh đúng
  // cái nút tiêu tiền của nó. Đặt hai ô chọn model cạnh nhau ở đầu bước thì không ai biết ô nào
  // ăn vào việc nào — ô chữ quyết định lượt xếp phòng, ô ảnh quyết định một lượt vẽ hoàn toàn khác.
  // Mặc định TẮT cả hai gói (T20). Ô tích này tác động cả hai chiều: gói đã tích được gửi cho mô
  // hình để làm theo, VÀ dùng để đối chiếu kết quả — nên đổi nó là đổi cả danh sách cảnh báo.
  const [packs, setPacks] = useState<AiRulePackChoice>({ standards: false, experience: false });
  // Mặc định MỘT phương án (Haan, 13/09/2026) — mỗi phương án là cả loạt lượt gọi tính tiền.
  const [count, setCount] = useState<(typeof COUNTS)[number]>('1');
  const [effort, setEffort] = useState<ReasoningEffort | null>(null);
  const [runId, setRunId] = useState<string | null>(state.runs.plan?.id ?? null);
  const [selected, setSelected] = useState<string | null>(state.planHeadArtifactId);
  const [level, setLevel] = useState(1);

  const start = useStartAiRun('plan');
  // Hỏi mỗi 2 giây để bảng theo dõi trực tiếp (token, thời gian, nút Dừng) chạy theo lượt gọi.
  const run = useAiRun(runId, 2000);
  const choose = useChooseAiPlan();
  const editPlan = useEditAiPlan();
  // Lượt sửa vừa gửi — để ghi chú của nó (đã áp / chưa làm được) gắn đúng phương án nó đúc ra.
  const [editRunId, setEditRunId] = useState<string | null>(null);
  /** Câu «Nhờ AI sửa» điền sẵn vào ô «Yêu cầu sửa» (25/10/2026). */
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  useEffect(() => {
    if (prefill) openWorkspaceTab('danh-gia');
  }, [prefill]);
  // «Một phương án» (tờ vẽ đầy đủ) hay «So sánh» (các phương án đặt cạnh nhau) — Đợt 5B.
  const [view, setView] = useState<'mot' | 'so-sanh'>('mot');
  const cost = useCostEstimate('plan', ai.choice.route ?? null, ai.selected);
  const models = useAiModels();
  /** Trần số lượt gọi mô hình mỗi phương án (lượt đầu + lượt sửa) — máy chủ cũ không trả thì `null`. */
  const callsMax = models.data?.limits?.planCallsMax ?? null;
  /** Mức chi phí chặn thật của một lượt (T164); `undefined` = máy chủ cũ không nói. */
  const capUsd = models.data?.limits?.runCostCapUsd;
  /** Chi phí TỐI ĐA một lời gọi (T176) — cùng hàm Worker dùng để hạ giới hạn token ra. */
  const perCallMax = maxCallCost({
    inputPer1mUsd: ai.selected?.inputPer1mUsd,
    outputPer1mUsd: ai.selected?.outputPer1mUsd,
    maxOutputTokens: ai.selected?.maxOutputTokens,
    inputTokens: cost.maxInputTokens,
    capUsd,
    minOutputTokens: models.data?.limits?.callMinOutputTokens,
  });
  /** Đang hỏi lại trước khi chạy (23/10/2026): một lượt hỏng vẫn tốn 0,28–0,46 USD. */
  const [askRun, setAskRun] = useState(false);
  const hidePlan = useHideAiPlan();
  /** Phương án đang chờ xác nhận xoá khỏi danh sách — `null` = không hỏi gì. */
  const [askHide, setAskHide] = useState<{ artifactId: string; name: string } | null>(null);
  const invalidate = useInvalidateAiDesign();

  // Mặt bằng đọc ĐẦU BÀI + KHẢO SÁT, không đọc chương trình không gian (T45, 15/09/2026).
  const blocked = !state.briefArtifactId;
  // Đầu bài chắc chắn không xếp vừa khối nhà (T112, T178): khoá nút trước khi bấm — Worker cũng chặn ở tuyến khởi động.
  const preflight = useAiPlanPreflight(projectId, state.briefArtifactId);
  const infeasible = preflight.data?.blocking ?? null;
  const tightWarnings = preflight.data?.warnings ?? [];
  const runResult = (run.data?.result ?? null) as PlanRunResult | null;
  const running = run.data?.status === 'queued' || run.data?.status === 'running';

  // Lượt chạy vừa xong thì danh sách phương án ở `/state` đã cũ. Nạp lại đúng một lần cho mỗi
  // lần trạng thái chuyển sang chốt.
  useEffect(() => {
    if (run.data?.status === 'done' || run.data?.status === 'failed') invalidate(projectId);
  }, [run.data?.status, projectId, invalidate]);

  // «Phương án 1, 2, 3…» theo thứ tự tạo, hiện cũ trước (Haan, 07/10/2026).
  const names = useMemo(() => numberedNames(state.plans, 'Phương án'), [state.plans]);
  const entries = useMemo(
    () =>
      [...state.plans].sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.artifactId.localeCompare(b.artifactId),
      ),
    [state.plans],
  );

  // Phương án đang mở: ưu tiên bản đã chọn, rồi bản mới nhất. Không để rỗng khi đã có kết quả —
  // một màn hình trống trong lúc dữ liệu đã về đọc như là chưa chạy gì.
  useEffect(() => {
    if (entries.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!selected || !entries.some((entry) => entry.artifactId === selected)) {
      setSelected(state.planHeadArtifactId ?? entries[entries.length - 1]!.artifactId);
    }
  }, [entries, selected, state.planHeadArtifactId]);

  const review = useAiPlanReview(projectId, selected, packs);
  const levels = review.data?.levels ?? [];
  const currentLevel = levels.some((item) => item.level === level)
    ? level
    : (levels[0]?.level ?? 1);
  const sheet = useAiPlanSheet(projectId, selected, currentLevel);
  const dxf = useDownloadAiPlanDxf();

  const onEdit = (artifactId: string, instruction: string) => {
    if (!ai.choice.route) return;
    void editPlan
      .mutateAsync({
        projectId,
        artifactId,
        instruction,
        route: ai.choice.route,
        reasoningEffort: ai.selected?.supportsEffort === false ? null : effort,
      })
      .then((out) => {
        setEditRunId(out.runId);
        setRunId(out.runId);
      })
      .catch(() => undefined);
  };

  const onRun = () => {
    setAskRun(false);
    if (!ai.choice.route) return;
    void start
      .mutateAsync({
        projectId,
        route: ai.choice.route,
        options: {
          rulePacks: packs,
          count: Number(count),
          reasoningEffort: ai.selected?.supportsEffort === false ? null : effort,
        },
      })
      .then((out) => setRunId(out.runId))
      .catch(() => undefined);
  };

  const failedCount = runResult?.failed.length ?? 0;
  const savedCount = runResult?.plans.length ?? 0;

  const verdictInfo = review.data ? planVerdict(review.data) : null;
  const canFix = !readOnly && review.data?.editable !== false;

  const setup = (
    <div className="space-y-4">
      <Panel title="Xếp mặt bằng">
        {blocked ? (
          <p className="text-fg-subtle">
            Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước khi xếp mặt bằng.
          </p>
        ) : readOnly ? (
          <p className="text-fg-subtle">Hồ sơ chỉ xem — không xếp phương án mới.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-fg-subtle">
              AI chỉ dựa trên đầu bài và khảo sát: xếp phòng từng tầng; chương trình dựng tường, cửa
              và chấm điểm. Mỗi phương án mất vài phút.
            </p>
            {/* MỘT nút chính kèm chi phí (25/10/2026): kiến trúc sư không phải chọn model, mức suy nghĩ, gói
                quy tắc — các ô ấy gấp trong «Tùy chọn nâng cao», mặc định là cấu hình của công ty. */}
            <Button
              variant="primary"
              className="w-full"
              onClick={() => setAskRun(true)}
              disabled={running || start.isPending || !ai.choice.route || !!infeasible}
            >
              {start.isPending
                ? 'Đang gửi…'
                : running
                  ? 'Đang xếp…'
                  : `Xếp mặt bằng${costOnButton(cost.estimate, Number(count))}`}
            </Button>
            {infeasible && (
              <p role="alert" className="text-status-overdue">
                {infeasible}
              </p>
            )}
            {!infeasible && tightWarnings.length > 0 && (
              <ul className="space-y-1">
                {tightWarnings.map((text) => (
                  <li key={text} className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 size-4 shrink-0 text-status-pending"
                      aria-hidden
                    />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            )}
            <CostEstimateLine
              estimate={cost.estimate}
              loading={cost.loading}
              units={Number(count)}
              unitLabel="phương án"
              option={ai.selected}
            />
            <details className="rounded-field border border-tk-line p-3">
              <summary className="cursor-pointer text-sm font-medium select-none">
                Tùy chọn nâng cao
                <span className="font-normal text-fg-subtle">
                  {' '}
                  · {ai.selected?.short ?? ai.selected?.label ?? 'model của công ty'} · {count}{' '}
                  phương án
                </span>
              </summary>
              <div className="mt-3 space-y-4">
                <div className="flex items-start gap-2 *:first:min-w-0 *:last:shrink-0">
                  <AiModePicker
                    kind="text"
                    choice={ai.choice}
                    options={ai.options}
                    onMode={ai.pickMode}
                    onRoute={ai.pickRoute}
                    allowSolver={false}
                    disabled={running || start.isPending}
                    recommended={ai.defaultRoute}
                  />
                  <ReasoningEffortPicker
                    value={effort}
                    onChange={setEffort}
                    option={ai.selected}
                    disabled={running || start.isPending}
                  />
                </div>
                <label className="block">
                  <span className="mb-1 block text-fg-subtle">Số phương án</span>
                  <SegmentedControl
                    options={COUNTS}
                    value={count}
                    onChange={setCount}
                    getLabel={(option) => option}
                  />
                </label>
                <RulePackPicker value={packs} onChange={setPacks} disabled={running} />
                <p className="text-fg-subtle">
                  Phòng đầu bài có ghi diện tích tối thiểu thì phải đạt mức đó. Vẫn không xếp được
                  sau bốn lần thì phương án không được vẽ.
                </p>
              </div>
            </details>
          </div>
        )}
        {start.isError && <p className="mt-3 text-status-overdue">{toUserMessage(start.error)}</p>}
      </Panel>

      {run.data && (
        <AiRunProgress
          projectId={projectId}
          run={run.data}
          purposePrefix="plan_house"
          reportTitle="Báo cáo lượt xếp mặt bằng"
          reportExtra={failedVariantsMarkdown(runResult?.failed ?? [])}
          onRetry={readOnly ? undefined : () => setAskRun(true)}
          retryDisabled={start.isPending || !ai.choice.route}
          runningLabel="Đang xếp mặt bằng"
          doneLabel={
            failedCount > 0
              ? `Xếp được ${savedCount}/${savedCount + failedCount} phương án`
              : 'Đã xếp xong'
          }
          failedLabel="Chưa xếp được mặt bằng"
        />
      )}
      {!running && (runResult?.failed.length ?? 0) > 0 && (
        <PlanFailureReasons failed={runResult!.failed} roomLabels={state.roomLabels} />
      )}
      {entries.length > 0 && !running && (
        <NextHint onClick={() => openWorkspaceTab('danh-gia')}>
          Xem đánh giá và việc nên sửa
        </NextHint>
      )}
    </div>
  );

  const chooser =
    (view === 'mot' || entries.length < 2) && entries.length > 0 ? (
      <div
        role="group"
        aria-label="Phương án"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-tk-line bg-tk-panel p-2"
      >
        {entries.map((entry) => {
          const isOpen = entry.artifactId === selected;
          const isHead = entry.artifactId === state.planHeadArtifactId;
          const name = names.get(entry.artifactId)!;
          return (
            <div key={entry.artifactId} className="flex items-stretch">
              <button
                type="button"
                aria-pressed={isOpen}
                onClick={() => setSelected(entry.artifactId)}
                className={cn(
                  'group flex min-h-10 items-center gap-2 rounded-l-md border py-1.5 pr-3 pl-1.5 text-left',
                  'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                  readOnly && 'rounded-r-md',
                  isOpen
                    ? 'border-tk-bl-line bg-tk-bl-bg font-medium'
                    : 'border-transparent hover:bg-tk-hover',
                )}
              >
                <PlanThumb projectId={projectId} artifactId={entry.artifactId} />
                <span>
                  <span className="block">{name}</span>
                  <span className="block text-xs font-normal text-tk-t3">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </span>
                {isHead && <Chip tone="gr">Dùng cho mặt đứng</Chip>}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setAskHide({ artifactId: entry.artifactId, name })}
                  aria-label={`Xoá ${name} khỏi danh sách`}
                  title="Xoá khỏi danh sách"
                  className={cn(
                    'rounded-r-md border border-l-0 px-2 text-fg-subtle hover:text-status-overdue',
                    isOpen ? 'border-tk-bl-line bg-tk-bl-bg' : 'border-transparent',
                  )}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  const detailProps = review.data
    ? {
        review: review.data,
        name: names.get(review.data.artifactId) ?? 'Phương án',
        level: currentLevel,
        onLevel: setLevel,
        sheet,
        readOnly,
        isHead: review.data.artifactId === state.planHeadArtifactId,
        choosing: choose.isPending,
        onChoose: () =>
          void choose
            .mutateAsync({ projectId, artifactId: review.data!.artifactId })
            .catch(() => undefined),
        chooseError: choose.isError ? toUserMessage(choose.error) : null,
        downloadingDxf: dxf.isPending,
        onDownloadDxf: () =>
          void dxf
            .mutateAsync({ projectId, artifactId: review.data!.artifactId })
            .catch(() => undefined),
        dxfError: dxf.isError ? toUserMessage(dxf.error) : null,
        verdict: (
          <PlanVerdict
            review={review.data}
            canFix={canFix}
            onAskFix={(text) => setPrefill({ text, nonce: Date.now() })}
          />
        ),
        onAskRoom: canFix ? (text: string) => setPrefill({ text, nonce: Date.now() }) : undefined,
        editPanel: (
          <PlanEditPanel
            review={review.data}
            level={currentLevel}
            readOnly={readOnly}
            disabled={running || !ai.choice.route}
            pending={editPlan.isPending}
            error={editPlan.isError ? toUserMessage(editPlan.error) : null}
            notes={
              editRunId !== null && editRunId === runId
                ? (runResult?.plans.find((plan) => plan.artifactId === review.data!.artifactId)
                    ?.notes ?? [])
                : []
            }
            onSubmit={(instruction) => onEdit(review.data!.artifactId, instruction)}
            route={ai.choice.route ?? null}
            callsMax={models.data?.limits?.editCallsMax ?? null}
            option={ai.selected}
            prefill={prefill}
          />
        ),
      }
    : null;

  const drawing = (
    <div className="space-y-3">
      {entries.length > 1 && (
        <SegmentedControl
          options={['mot', 'so-sanh'] as const}
          value={view}
          onChange={setView}
          getLabel={(value) =>
            value === 'mot' ? 'Xem một phương án' : `So sánh ${entries.length} phương án`
          }
        />
      )}
      {view === 'so-sanh' && entries.length > 1 && (
        <AiPlanCompare
          projectId={projectId}
          entries={entries}
          names={names}
          packs={packs}
          levelCount={levels.filter((item) => !item.roof).length}
          planHeadArtifactId={state.planHeadArtifactId}
          readOnly={readOnly}
          choosing={choose.isPending}
          onOpen={(artifactId) => {
            setSelected(artifactId);
            setView('mot');
          }}
          onChoose={(artifactId) =>
            void choose.mutateAsync({ projectId, artifactId }).catch(() => undefined)
          }
        />
      )}
      {chooser}
      {entries.length === 0 && !review.isLoading && (
        <div className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-tk-line2 bg-tk-panel p-8 text-center">
          <div className="max-w-sm">
            <LayoutGrid className="mx-auto size-10 text-tk-t3" aria-hidden />
            <p className="mt-3 font-medium">
              {running ? 'AI đang xếp mặt bằng' : 'Chưa có phương án mặt bằng'}
            </p>
            <p className="mt-1 text-fg-subtle">
              {running
                ? 'Mỗi phương án mất vài phút. Bản vẽ hiện ở đây ngay khi xếp xong.'
                : blocked
                  ? 'Xác nhận đầu bài ở bước 1, rồi quay lại đây để xếp mặt bằng.'
                  : 'Bấm «Xếp mặt bằng» ở ngăn bên trái.'}
            </p>
          </div>
        </div>
      )}
      {(view === 'mot' || entries.length < 2) && review.isLoading && (
        <Skeleton className="h-96 w-full" />
      )}
      {(view === 'mot' || entries.length < 2) && review.isError && (
        <Panel title="Phương án">
          <p className="text-status-overdue">{toUserMessage(review.error)}</p>
        </Panel>
      )}
      {(view === 'mot' || entries.length < 2) && detailProps && (
        <PlanDetail {...detailProps} part="sheet" />
      )}
    </div>
  );

  // Khung hai ngăn (anh Dũng 25/10/2026 — như tab Soạn hợp đồng): bản vẽ LUÔN ở ngăn phải; trái là các tab xếp,
  // đánh giá, ảnh nội thất. Trước đó đánh giá và ô «Yêu cầu sửa» nằm dưới tờ vẽ — xem rồi phải cuộn xuống mới sửa.
  // «Toàn màn hình» (anh Dũng 27/10/2026): bản vẽ to hơn khi xem / bấm phòng để nhờ sửa.
  return (
    <FullscreenFrame idleClassName="lg:h-[calc(100dvh-15rem)] lg:min-h-[600px]">
      <SplitWorkspace
        storageKey="ai-mat-bang"
        defaultRatio={0.36}
        className="lg:min-h-0 lg:flex-1"
        tabs={[
          { id: 'xep', label: 'Xếp mặt bằng', side: 'left', content: setup },
          {
            id: 'danh-gia',
            label: 'Đánh giá',
            side: 'left',
            badge: verdictInfo
              ? verdictInfo.passed
                ? '✓'
                : verdictInfo.items.length || undefined
              : undefined,
            content: detailProps ? (
              <div className="space-y-4">
                <PlanDetail {...detailProps} part="review" />
              </div>
            ) : (
              <p className="text-fg-subtle">Chưa có phương án để đánh giá.</p>
            ),
          },
          {
            id: 'noi-that',
            label: 'Ảnh mặt bằng có đồ đạc',
            side: 'left',
            content: review.data ? (
              <div className="space-y-2">
                <p className="text-fg-subtle">{ROOM_RENDER_POINTER}</p>
                <PlanImagePanel
                  projectId={projectId}
                  review={review.data}
                  level={currentLevel}
                  readOnly={readOnly}
                  disabled={running}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-fg-subtle">{ROOM_RENDER_POINTER}</p>
                <p className="text-fg-subtle">
                  Đã có bản vẽ mặt bằng của kỹ sư? Vẽ ảnh mặt bằng có nội thất từ bản tải lên.
                </p>
                <PlanImagePanel
                  projectId={projectId}
                  review={null}
                  level={1}
                  readOnly={readOnly}
                  disabled={running}
                />
              </div>
            ),
          },
          { id: 'ban-ve', label: 'Bản vẽ', side: 'right', content: drawing },
        ]}
      />

      {askRun && (
        <ConfirmDialog
          title={`Xếp ${count === '1' ? 'một phương án' : `${count} phương án`} mặt bằng?`}
          confirmLabel="Xếp mặt bằng"
          cancelLabel="Chưa chạy"
          className="border-tk-line bg-tk-panel text-tk-tx"
          onCancel={() => setAskRun(false)}
          onConfirm={onRun}
        >
          <RunCostNotice
            estimate={cost.estimate}
            units={Number(count)}
            callsMax={callsMax}
            capUsd={capUsd}
            perCallMax={perCallMax}
            modelName={ai.selected?.short ?? ai.selected?.label ?? null}
          />
        </ConfirmDialog>
      )}

      {/* Hộp thoại NỔI giữa màn hình (Haan 18/09/2026) — hỏi lại trước khi xoá một phương án khỏi
          dải chọn. Không `window.confirm`: nút của hộp gốc theo tiếng của trình duyệt. */}
      {askHide && (
        <ConfirmDialog
          title={`Xoá «${askHide.name}» khỏi danh sách?`}
          confirmLabel={hidePlan.isPending ? 'Đang xoá…' : 'Xoá khỏi danh sách'}
          cancelLabel="Không xoá"
          pending={hidePlan.isPending}
          className="border-tk-line bg-tk-panel text-tk-tx"
          onCancel={() => setAskHide(null)}
          onConfirm={() => {
            const { artifactId } = askHide;
            hidePlan.mutate(
              { projectId, artifactId },
              {
                onSuccess: () => {
                  setAskHide(null);
                  if (selected === artifactId) setSelected(null);
                },
              },
            );
          }}
        >
          <p>
            Phương án thôi hiện ở đây. Dữ liệu vẫn còn trong hồ sơ, nên tờ vẽ đã tải, các bản sửa
            dựng từ nó và nhật ký chi phí của lượt gọi vẫn truy được.
          </p>
          {askHide.artifactId === state.planHeadArtifactId && (
            <p className="mt-1">
              Đây là phương án đang dùng cho mặt đứng — xoá xong cần chọn lại phương án khác để dựng
              mặt đứng.
            </p>
          )}
          {hidePlan.isError && (
            <p className="mt-1 text-status-overdue">{toUserMessage(hidePlan.error)}</p>
          )}
        </ConfirmDialog>
      )}
    </FullscreenFrame>
  );
}

/** Lời mời sang tab kế (thay cho việc phải tự mò tab). */
function NextHint({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <Button variant="secondary" onClick={onClick}>
        {children}
      </Button>
    </div>
  );
}

/**
 * Phương án chưa xếp được của lượt chạy, dạng Markdown cho báo cáo tải về (07/10/2026: ẩn khỏi màn
 * hình). Giữ đủ lý do theo từng tầng — người phát triển cần chúng để quyết chạy lại hay đổi model,
 * và không có tờ vẽ nào cho phương án ấy (T39).
 */
export function failedVariantsMarkdown(failed: PlanRunResult['failed']): string {
  if (failed.length === 0) return '';
  const out: string[] = ['## Phương án chưa xếp được', ''];
  const list = (items: string[]) => items.map((m) => `- ${m}`);
  for (const item of failed) {
    out.push(`### ${item.variantId}`, '', item.error, '');
    if (item.main) {
      out.push(`#### Lượt hỏng nhẹ nhất — lượt ${item.main.round}`, '');
      for (const level of item.main.levels) {
        out.push(
          `${level.level === 0 ? 'Cả nhà' : `Tầng ${level.level}`}:`,
          '',
          ...list(level.messages),
          '',
        );
      }
    }
    for (const reason of item.reasons ?? []) {
      out.push(`#### ${reason.level === 0 ? 'Cả nhà' : `Tầng ${reason.level}`}`, '');
      if (reason.firstMessages) {
        out.push(
          `Lượt đầu — ${reason.firstMessages.length} lỗi:`,
          '',
          ...list(reason.firstMessages),
          '',
        );
        out.push(`${retryLabel(reason.retry)} — ${reason.messages.length} lỗi:`, '');
      }
      if ((reason.attempts ?? 0) > 1) out.push(`Đã gọi mô hình ${reason.attempts} lượt.`, '');
      if (reason.retry === 'none') {
        out.push(
          'Không gọi lại mô hình: lỗi còn lại không nằm ở thứ AI khai, nên gọi lại cũng không gỡ được. Chạy lại để AI khai một ý định khác, hoặc giảm bớt yêu cầu diện tích trong đầu bài.',
          '',
        );
      }
      if (reason.retry === 'unchanged') {
        out.push('Dừng gọi lại: lượt sửa cuối trả về đúng bố cục lượt trước ở tầng đang lỗi.', '');
      }
      if (reason.retry === 'stuck') {
        out.push('Dừng gọi lại: ba lượt liền hỏng đúng cùng những lỗi dưới đây.', '');
      }
      out.push(...list(reason.messages), '');
      if ((reason.notes?.length ?? 0) > 0) {
        out.push('Chương trình đã tự sửa:', '', ...list(reason.notes!), '');
      }
    }
  }
  return out.join('\n');
}

/**
 * Lý do chưa xếp được, NGAY dưới thẻ tiến độ (lượt chạy thật 23/10/2026). Haan 07/10/2026 đã gỡ danh
 * sách bước và câu lỗi của bộ xếp khỏi màn hình («không có nhiều ý nghĩa» với người thiết kế); phần
 * này không đưa chúng trở lại — chỉ lý do CHÍNH bằng tên phòng, và gợi ý chỗ sửa đầu bài. Nguyên văn
 * từng lượt vẫn ở báo cáo `.md`.
 */
/**
 * Nội dung hộp hỏi lại trước khi xếp mặt bằng: ước tính, nguồn của số, và TRẦN khi phải gọi lại hết
 * lượt sửa. Không có số thì nói chưa đủ dữ liệu — không hiện 0 (CLAUDE.md 5.2).
 */
export function RunCostNotice({
  estimate,
  units,
  callsMax,
  capUsd,
  perCallMax,
  modelName,
}: {
  /** Chi phí tối đa một lời gọi (T176); vắng / `null` = không tính được. */
  perCallMax?: MaxCallCost | null;
  estimate: CostEstimate | null;
  units: number;
  callsMax: number | null;
  /** Mức chặn thật (T164): số = có mức, `null` = không giới hạn, vắng = máy chủ cũ không nói. */
  capUsd?: number | null;
  modelName: string | null;
}): React.ReactElement {
  const ceiling = costCeiling(estimate, callsMax, units, capUsd);
  return (
    <div className="space-y-2">
      <p>
        {modelName ? `Mô hình ${modelName}. ` : ''}
        {estimate
          ? `Chi phí ước tính ≈ ${formatUsd(estimate.perUnitUsd * units)} — ${estimateSource(estimate)}.`
          : 'Chưa đủ dữ liệu để ước tính chi phí — chưa có lượt nào ghi số token, hoặc mô hình này chưa khai giá niêm yết.'}
      </p>
      {callsMax !== null ? (
        <p>
          Bản đầu chưa qua kiểm thì chương trình gọi lại mô hình để sửa, tối đa {callsMax - 1} lượt
          sửa mỗi phương án ({callsMax} lượt gọi).
          {ceiling !== null
            ? ` Trần nếu phải dùng hết: ≈ ${formatUsd(ceiling)}${units > 1 ? ` cho ${units} phương án` : ''}.`
            : ' Chưa đủ dữ liệu để ước tính trần.'}
        </p>
      ) : (
        <p>
          Bản đầu chưa qua kiểm thì chương trình gọi lại mô hình để sửa — mỗi lượt sửa tính tiền
          thêm.
        </p>
      )}
      {perCallMax && (
        <p data-testid="per-call-max">
          Tối đa ≈ {formatUsd(perCallMax.usd)} mỗi lời gọi
          {perCallMax.lowered
            ? ' — giới hạn token ra đã hạ cho vừa mức chi phí của lượt'
            : ` — giới hạn ${perCallMax.outputTokens.toLocaleString('vi-VN')} token ra của mô hình này`}
          {perCallMax.inputKnown ? '' : ', chưa gồm phần token vào (chưa có lượt nào đo)'}.
        </p>
      )}
      {typeof capUsd === 'number' ? (
        <p className="font-medium">
          Mức chi phí tối đa của lượt: {formatUsd(capUsd)}. Trước mỗi lời gọi chương trình hạ giới
          hạn token ra cho vừa phần còn lại; không đủ cho một lời gọi thì dừng và báo lý do — Quản
          trị hệ thống đặt mức.
        </p>
      ) : capUsd === null ? (
        <p>Chưa đặt mức chi phí tối đa — lượt chạy không bị dừng theo số tiền.</p>
      ) : null}
      <p>Lượt không ra phương án vẫn tính tiền các lượt gọi đã dùng.</p>
    </div>
  );
}

function PlanFailureReasons({
  failed,
  roomLabels,
}: {
  failed: FailedVariant[];
  roomLabels: Record<string, string>;
}): React.ReactElement {
  const views = failureViews(failed, roomLabels);
  return (
    <section
      aria-label="Lý do chưa xếp được"
      className="space-y-3 rounded-lg border border-tk-line bg-tk-panel p-3"
    >
      {views.map((view) => (
        <div key={view.variantId} className="space-y-2">
          <p className="font-medium">
            {views.length > 1 ? `${view.variantId}: ` : ''}Vì sao chưa xếp được
          </p>
          <p className="text-xs text-fg-subtle">
            {view.round !== null
              ? `Lý do của lượt ${view.round}${view.attempts ? ` trên ${view.attempts}` : ''} — lượt gần đạt nhất; các lượt sau không khá hơn.`
              : view.attempts
                ? `Lý do của lượt cuối (đã gọi mô hình ${view.attempts} lượt).`
                : 'Lý do của lượt cuối.'}
          </p>
          {view.costStop && <p className="font-medium text-tk-am-fg">{view.costStop}</p>}
          {view.earlyStop && <p className="font-medium text-tk-am-fg">{view.earlyStop}</p>}
          {view.lastUnusable && (
            <p className="text-xs text-fg-subtle">
              Lượt cuối mô hình trả câu trả lời không dùng được; lý do của các lượt trước có trong
              báo cáo tải về.
            </p>
          )}
          {view.groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-medium text-tk-t2">{group.title}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {group.messages.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </div>
          ))}
          {view.hints.length > 0 && (
            <div className="rounded-md bg-tk-am-bg2 p-2.5">
              <p className="text-xs font-medium text-tk-am-fg">
                Gợi ý sửa đầu bài trước khi chạy lại
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-tk-am-fg2">
                {view.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function PlanDetail({
  review,
  name,
  level,
  onLevel,
  sheet,
  readOnly,
  isHead,
  choosing,
  onChoose,
  chooseError,
  downloadingDxf,
  onDownloadDxf,
  dxfError,
  editPanel,
  verdict,
  part,
  onAskRoom,
}: {
  /** Bấm một phòng trên tờ vẽ → điền sẵn ô «Yêu cầu sửa». Vắng = chỉ đánh dấu phòng có vấn đề, không bấm được. */
  onAskRoom?: (text: string) => void;
  /**
   * Phần dựng (25/10/2026, khung hai ngăn): `sheet` = tờ vẽ (ngăn phải, luôn hiện); `review` = đánh giá, yêu cầu
   * sửa và các mục gấp (tab «Đánh giá» bên trái).
   */
  part: 'sheet' | 'review';
  /** Khối «Đánh giá» bằng lời (`PlanVerdict`) — thay cho «Ba lý do trừ điểm lớn nhất». */
  verdict: React.ReactNode;
  review: AiPlanReview;
  /** Tên hiển thị «Phương án N». */
  name: string;
  level: number;
  onLevel: (level: number) => void;
  sheet: ReturnType<typeof useAiPlanSheet>;
  readOnly: boolean;
  isHead: boolean;
  choosing: boolean;
  onChoose: () => void;
  chooseError: string | null;
  downloadingDxf: boolean;
  onDownloadDxf: () => void;
  dxfError: string | null;
  /** Ô «Yêu cầu sửa» (T53, đặt lại ở Đợt 5B). */
  editPanel: React.ReactNode;
}): React.ReactElement {
  const current = review.levels.find((item) => item.level === level) ?? review.levels[0];
  const levelOptions = review.levels.map((item) => String(item.level));
  const sheetSize = useSheetSize();
  const [viewing, setViewing] = useState(false);
  const closeViewer = useCallback(() => setViewing(false), []);
  const slug = fileSlug(name);

  // Tờ vẽ đứng ĐẦU (Haan, 07/10/2026): người dùng đến bước này để xem bản vẽ. Phần giải thích,
  // ý định, lỗi và đối chiếu là các mục gấp bên dưới; lỗi chặn tự mở, và panel điểm vẫn đứng SAU
  // danh sách lỗi (T24).
  if (part === 'sheet') {
    // Phòng bị trừ điểm — đúng danh sách khối «Đánh giá» nêu (`planVerdict`), không chấm lại.
    const issues = new Map<string, string[]>();
    for (const item of planVerdict(review).items) {
      for (const id of item.refs) issues.set(id, [...(issues.get(id) ?? []), item.label]);
    }
    const nameOf = (id: string) => roomName(id, review.roomLabels);
    return (
      <section className="rounded-lg border border-tk-line bg-tk-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-tk-line p-3">
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="font-semibold">{name}</h2>
            {isHead && <Chip tone="gr">Dùng cho mặt đứng</Chip>}
            {/* Điểm và ngưỡng nhận ở đầu tờ vẽ (07/10/2026). */}
            {review.score && <ScoreChip review={review} />}
            {sheet.scale && (
              <Chip tone="mute">
                Tỷ lệ 1:{sheet.scale} · {sheet.orientation === 'portrait' ? 'tờ dọc' : 'tờ ngang'}
              </Chip>
            )}
          </div>
          {!readOnly && !isHead && (
            <Button variant="primary" onClick={onChoose} disabled={choosing}>
              {choosing ? 'Đang lưu…' : 'Dùng để dựng mặt đứng'}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 p-3 pb-0">
          {review.levels.length > 1 && (
            <SegmentedControl
              options={levelOptions}
              value={String(level)}
              onChange={(value) => onLevel(Number(value))}
              getLabel={(value) =>
                review.levels.find((item) => String(item.level) === value)?.name ?? `Tầng ${value}`
              }
            />
          )}
          {/* Cỡ xem áp cho CẢ tờ vector ở đây lẫn ảnh có nội thất bên dưới. */}
          <SheetSizeControl />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sheet.url && (
              <button
                type="button"
                onClick={() => setViewing(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-tk-line px-3 hover:bg-tk-hover sm:min-h-8"
              >
                <Maximize2 className="size-4" aria-hidden />
                Xem toàn màn hình
              </button>
            )}
            {sheet.url && (
              <a
                className="inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-tk-line px-3 hover:bg-tk-hover sm:min-h-8"
                href={sheet.url}
                download={`mat-bang-${slug}-tang-${level}.svg`}
              >
                <Download className="size-4" aria-hidden />
                Tải SVG tầng {level}
              </a>
            )}
            <Button variant="secondary" onClick={onDownloadDxf} disabled={downloadingDxf}>
              <Download className="size-4" aria-hidden />
              {downloadingDxf ? 'Đang tạo tệp…' : 'Tải DXF cả nhà'}
            </Button>
          </div>
        </div>

        <div className="p-3">
          {sheet.loading && <Skeleton className="h-96 w-full" />}
          {sheet.error && <p className="text-status-overdue">{sheet.error}</p>}
          {sheet.url && (
            <div className="relative w-full" style={sheetWidthStyle(sheetSize)}>
              {/* `<img>` chứ không phải SVG nhúng: xem ghi chú đầu tệp. */}
              <img
                src={sheet.url}
                alt={`Tờ mặt bằng ${current?.name ?? `tầng ${level}`}`}
                onClick={() => setViewing(true)}
                className="block w-full cursor-zoom-in rounded-md border border-tk-line bg-white"
              />
              <SheetRoomOverlay
                hits={sheet.hits}
                nameOf={nameOf}
                issues={issues}
                onPick={
                  onAskRoom
                    ? (id) => onAskRoom(roomFixRequest(nameOf(id), issues.get(id) ?? []))
                    : undefined
                }
              />
            </div>
          )}
          {sheet.url && sheet.hits.length > 0 && (onAskRoom || issues.size > 0) && (
            <p className="mt-2 text-sm text-fg-subtle">
              {onAskRoom && 'Bấm vào một phòng trên bản vẽ để nhờ AI sửa phòng đó. '}
              {issues.size > 0 && 'Viền cam đứt, dấu «!»: phòng có việc nên sửa (xem «Đánh giá»).'}
            </p>
          )}
          {viewing && sheet.url && (
            <SheetViewer
              src={sheet.url}
              alt={`Tờ mặt bằng ${current?.name ?? `tầng ${level}`}`}
              title={`${name} · ${current?.name ?? `Tầng ${level}`}`}
              onClose={closeViewer}
            />
          )}
          {chooseError && <p className="mt-2 text-status-overdue">{chooseError}</p>}
          {dxfError && (
            <p className="mt-2 text-status-overdue">Không tải được tệp DXF: {dxfError}</p>
          )}
          {/* Không gian mở (T48): tờ vẽ ghi mỗi khu một nhãn và ngăn bằng nét đứt; nói lại bằng chữ ở
              đây để người đọc màn hình không phải soi tờ vẽ mới biết phòng nào là ô gộp. */}
          {(current?.openSpaces ?? []).map((space) => (
            <p key={space.id} className="mt-3 text-fg-subtle">
              Không gian mở:{' '}
              {space.parts
                .map(
                  (part) =>
                    `${review.roomLabels[part.type] ?? part.type} ${formatNumber(part.area_m2)} m²`,
                )
                .join(' · ')}{' '}
              — ngăn nhau bằng ranh mềm, không có vách.
            </p>
          ))}
          {(current?.notes.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1">
              {/* Chỗ bộ vẽ tự xử lý (kẹp lỗ mở quá khổ, bỏ nhãn phòng quá nhỏ, hạ tỷ lệ). Không
                  phải lỗi, nhưng im lặng thì người đọc tưởng tờ vẽ nói đủ mọi thứ trong dữ liệu. */}
              {current!.notes.map((note, index) => (
                <li key={`${note.code}:${index}`} className="text-fg-subtle">
                  {note.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Kết luận bằng lời + việc nên sửa (25/10/2026), ngay trên ô «Yêu cầu sửa» mà nút «Nhờ AI sửa» điền vào. */}
      {verdict}

      {editPanel}

      <Fold title="Về phương án này">
        <p className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4" aria-hidden />
          {/* Phương án dựng từ câu trả lời ĐÃ GHI (T170, chỉ máy phát triển) — nói rõ, không giả là lượt mới. */}
          {review.generator.provider === 'replay'
            ? `Phát lại lượt ${review.generator.model.replace(/^replay:/, '')}`
            : `${review.generator.provider} · ${review.generator.model}`}
          {resampledLabel(review.generator)}
        </p>
        <p className="mt-2">{review.rationale}</p>
        {review.generator.edit && (
          <p className="mt-2">
            Bản sửa theo yêu cầu: <q>{review.generator.edit.instruction}</q>
          </p>
        )}
        {review.wallsDerived && (
          <p className="mt-3 flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            {/* T23 — câu này phải có mặt ở CẢ tờ vẽ và màn hình. Tờ vẽ đi ra ngoài (in, gửi
                khách) còn màn hình thì không, nên một chỗ là không đủ.

                Biểu tượng đổi từ tam giác cảnh báo sang chữ «i» ngày 12/09/2026: trước T23 đây là
                một lần cứu hộ, tức chuyện bất thường; nay nó là cách hệ thống làm việc ở mọi lượt.
                Để nguyên tam giác vàng thì mọi tờ vẽ đều trông như có vấn đề, và người dùng học
                cách bỏ qua nó — lúc ấy cảnh báo thật cũng mất tác dụng. */}
            {review.generator.layout === 'intent' ? (
              <span>
                <b>AI khai ý định bố cục, chương trình xếp phòng và dựng tường.</b> AI nói nhà có
                những phòng nào, rộng khoảng bao nhiêu, cạnh phòng nào, cửa chính ở đâu, và phác bố
                cục từng tầng trên lưới ô khoảng một mét; vị trí vách, kích thước lọt lòng, cửa, cửa
                sổ và bề dày tường do chương trình dựng theo quy ước cấu tạo của Nhà Việt Group.
                Danh sách phòng và bố cục phác là của AI; mọi đường nét trên tờ vẽ là của chương
                trình.
              </span>
            ) : (
              <span>
                <b>AI xếp phòng, chương trình dựng tường.</b> AI chia không gian và nối các phòng;
                kích thước lọt lòng, cửa, cửa sổ và bề dày tường do chương trình tính theo quy ước
                cấu tạo của Nhà Việt Group, nên đường nét trên tờ vẽ là của chương trình; bố cục là
                của AI.
              </span>
            )}
          </p>
        )}
      </Fold>

      {current?.intent && <IntentPanel level={current} labels={review.roomLabels} />}

      {/* Thứ tự cố ý: LỖI CHẶN trước, rồi điểm. Một phương án có dữ liệu tự mâu thuẫn thì điểm
          của nó không nói gì — cổng và điểm là hai tầng kết luận khác nhau (T24). */}
      <IssueList
        title="Lỗi bộ kiểm máy còn lại"
        issues={review.blocking}
        tone="overdue"
        empty="Bộ kiểm máy không còn lỗi chặn nào trên phương án này."
        note="Phương án xếp theo tầng không được lưu khi còn lỗi chặn. Lỗi ở đây chỉ gặp ở phương án dựng theo cách cũ — tờ vẽ đang nói sai ở đó."
      />
      <IssueList
        title="Chỗ đáng ngờ"
        issues={review.findings}
        tone="pending"
        empty="Không có chỗ nào đáng ngờ."
      />

      {/* «Điểm chất lượng» (`PlanScorePanel`) TẠM ẨN theo Haan 07/10/2026 — điểm tổng và ngưỡng vẫn ở
          chip đầu tờ vẽ. */}

      <Fold title="Đối chiếu thói quen thiết kế">
        {/*
         * Tiêu đề KHÔNG còn là «Đối chiếu quy chuẩn» (T30, 12/09/2026): nhánh AI không kiểm quy
         * chuẩn nào nữa, nên để nguyên chữ ấy là nói sai ngay trên nhãn panel. Câu `noCodeCheck`
         * ở dưới nói rõ điều đó, và nó do mã chèn — không tắt được từ giao diện (8.7).
         */}
        {!review.rulePacks.experience ? (
          <p className="text-fg-subtle">
            Chưa tích gói quy tắc nào, nên không đối chiếu gì. Tích «Kinh nghiệm nghề Nhà Việt
            Group» ở bước trước để xem chỗ lệch.
          </p>
        ) : review.warnings.length === 0 ? (
          <p>Không có cảnh báo trong số quy tắc đo được trên mặt bằng.</p>
        ) : (
          <ul className="space-y-2">
            {review.warnings.map((warning) => (
              <li
                key={`${warning.ruleId}-${warning.level}-${warning.spaceId}`}
                className="flex items-start gap-2"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
                <span>
                  Tầng {warning.level}: {warning.message}{' '}
                  <span className="text-fg-subtle">({warning.source})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {review.rulePacks.experience && (
          <p className="mt-3 text-fg-subtle">
            Đã đối chiếu {review.checkedRules.length} quy tắc.{' '}
            <b>{review.uncheckedRules.length} quy tắc chưa đối chiếu được</b> vì chúng cần thứ mặt
            bằng chưa mô tả — khoảng lùi thực tế, chiều cao thông thuỷ, lối thoát hiểm.
          </p>
        )}
        <p className="mt-3 font-medium">{AI_DISCLAIMERS.noCodeCheck}</p>
      </Fold>
    </>
  );
}

/**
 * Ảnh thu nhỏ tầng 1 trên thẻ chọn phương án — so nhanh các phương án mà không phải mở từng cái.
 * Dùng chính tờ vector (qua `<img>`), không gọi mô hình nào.
 */
function PlanThumb({
  projectId,
  artifactId,
}: {
  projectId: string;
  artifactId: string;
}): React.ReactElement {
  const sheet = useAiPlanSheet(projectId, artifactId, 1);
  return sheet.url ? (
    <img
      src={sheet.url}
      alt=""
      className="h-12 w-10 shrink-0 rounded-sm border border-tk-line bg-white object-cover object-left-top transition-[scale] duration-(--motion-base) ease-(--ease-out) motion-safe:group-hover:scale-105"
    />
  ) : (
    <span className="h-12 w-10 shrink-0 rounded-sm bg-tk-chip-mute" aria-hidden />
  );
}

/**
 * Mục gấp được — cùng khung với `Panel` nhưng mặc định đóng, để tờ vẽ không bị đẩy xuống dưới cả
 * màn hình chữ. Lỗi chặn thì tự mở: thứ cần đọc không được giấu.
 */
function Fold({
  title,
  aside,
  defaultOpen = false,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-tk-line bg-tk-panel open:pb-4 [&>summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 select-none lg:px-[18px]">
        <ChevronRight
          className="size-4 shrink-0 text-tk-t3 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <h2 className="mr-auto font-semibold">{title}</h2>
        {aside}
      </summary>
      <div className="px-4 lg:px-[18px]">{children}</div>
    </details>
  );
}

function IssueList({
  title,
  issues,
  tone,
  empty,
  note,
}: {
  title: string;
  issues: AiPlanIssue[];
  tone: 'overdue' | 'pending';
  empty: string;
  note?: string;
}): React.ReactElement {
  return (
    <Fold
      title={title}
      defaultOpen={tone === 'overdue' && issues.length > 0}
      aside={
        issues.length ? (
          <Chip tone={tone === 'overdue' ? 'rd' : 'am'}>{issues.length}</Chip>
        ) : (
          <Chip tone="gr">Không có</Chip>
        )
      }
    >
      {issues.length === 0 ? (
        <p className="text-fg-subtle">{empty}</p>
      ) : (
        <>
          {note && <p className="mb-2">{note}</p>}
          <ul className="space-y-1">
            {issues.map((issue, index) => (
              <li
                key={`${issue.code}-${issue.ref ?? index}`}
                className={tone === 'overdue' ? 'text-status-overdue' : 'text-status-pending'}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </Fold>
  );
}

/** Nhãn tiếng Việt của chín vùng, nhìn từ đường vào — đúng cách lời dẫn giải thích cho mô hình. */
const ZONE_LABEL: Record<AiPlanZone, string> = {
  front_left: 'Trước, bên trái',
  front: 'Trước, ở giữa',
  front_right: 'Trước, bên phải',
  left: 'Giữa nhà, bên trái',
  center: 'Chính giữa',
  right: 'Giữa nhà, bên phải',
  back_left: 'Sau, bên trái',
  back: 'Sau, ở giữa',
  back_right: 'Sau, bên phải',
};

const RELATION_LABEL: Record<'adjacent' | 'near' | 'far' | 'open', string> = {
  adjacent: 'chung vách với',
  near: 'gần',
  far: 'xa',
  open: 'thông với',
};

function retryLabel(
  retry: 'revise' | 'resample' | 'none' | 'unchanged' | 'stuck' | undefined,
): string {
  return retry === 'revise' || retry === 'unchanged' || retry === 'stuck'
    ? 'Lượt cuối — AI sửa ý định (gửi kèm ý định lượt trước)'
    : 'Lượt cuối — AI khai ý định mới';
}

/**
 * Ý định bố cục của AI cho một tầng (T43) — thứ DUY NHẤT trên mặt bằng thuộc về mô hình.
 *
 * Phải nhìn thấy được vì tờ vẽ không nói ra: một phòng mô hình đặt «trước, bên trái» mà tờ vẽ đặt ở
 * giữa là bộ giải đã nới vùng, và độ khớp ý đồ là con số nói lên điều đó. Mã phòng hiện kèm nhãn
 * tiếng Việt vì mã là thứ khớp được với tờ vẽ và nhật ký.
 */
function IntentPanel({
  level,
  labels,
}: {
  level: AiPlanLevelView;
  labels: Record<string, string>;
}): React.ReactElement {
  const intent = level.intent!;
  const arrange = level.arrange;
  const nameOf = (id: string) => {
    const match = /^(.*)_(\d+)$/.exec(id);
    const label = labels[match?.[1] ?? id];
    return label ? `${label} (${id})` : id;
  };
  const percent = (value: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 0 }).format(value);

  return (
    <Fold
      title="Ý định bố cục của AI"
      aside={arrange ? <Chip tone="mute">Khớp ý đồ {percent(arrange.intent_fit)}</Chip> : undefined}
    >
      {arrange && (
        <p className="mb-3 text-fg-subtle">
          Chương trình dựng {arrange.candidates} cách xếp từ ý định này, {arrange.passed} cách qua
          trọn bộ kiểm, chọn cách có điểm cao nhất.
          {arrange.relaxed > 0 &&
            ' Không cách nào giữ trọn mọi vùng AI khai qua được bộ kiểm, nên chương trình đã nới vùng của một số phòng — so bảng dưới với tờ vẽ để thấy chỗ lệch.'}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-fg-subtle">
              <th className="py-1 pr-4 font-medium">Phòng</th>
              <th className="py-1 pr-4 font-medium">Vùng AI khai</th>
              <th className="py-1 font-medium">Ra mặt đường</th>
            </tr>
          </thead>
          <tbody>
            {intent.rooms.map((room) => (
              <tr key={room.id} className="border-t border-tk-line">
                <td className="py-1 pr-4">
                  {nameOf(room.id)}
                  {room.id === intent.entry_room && ' · cửa chính'}
                  {room.id === intent.garage_room && ' · cửa xe'}
                </td>
                <td className="py-1 pr-4">{ZONE_LABEL[room.zone]}</td>
                <td className="py-1">{room.street_facing ? 'Có' : 'Không'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {intent.relationships.length > 0 && (
        <>
          <p className="mt-3 font-medium">Quan hệ giữa các phòng</p>
          <ul className="list-disc pl-5">
            {intent.relationships.map((rel) => (
              <li key={`${rel.a}-${rel.kind}-${rel.b}`}>
                {nameOf(rel.a)} {RELATION_LABEL[rel.kind]} {nameOf(rel.b)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Fold>
  );
}

/**
 * Chip «đã lấy mẫu lại tầng …» (T39). Artifact đúc trước 13/09/2026 không có `resampled_levels` mà
 * có cờ `repaired` của lượt VÁ cũ — nói đúng tên của việc đã xảy ra với chính artifact đang xem.
 */
function resampledLabel(generator: AiPlanReview['generator']): string {
  const levels = generator.resampled_levels ?? [];
  if (levels.length) return ` · đã xếp lại tầng ${levels.join(', ')}`;
  return generator.repaired && generator.layout !== 'tree' ? ' · đã sửa một lần' : '';
}
