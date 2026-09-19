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

import { formatNumber } from '@nvg/shared';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, Sparkles, X } from 'lucide-react';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/states';
import {
  useAiPlanReview,
  useAiPlanSheet,
  useAiRun,
  useChooseAiPlan,
  useDownloadAiPlanDxf,
  useEditAiPlan,
  useHideAiPlan,
  useInvalidateAiDesign,
  useStartAiRun,
  type AiDesignState,
  type AiPlanIssue,
  type AiPlanLevelView,
  type AiPlanZone,
  type AiModelOption,
  type AiPlanReview,
  type AiRulePackChoice,
  type ReasoningEffort,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, ReasoningEffortPicker, useAiChoice } from './ai-model-picker';
import { AiRunUsage } from './ai-usage';
import { PlanScorePanel } from './ai-plan-score';
import { RulePackPicker } from './ai-program-step';
import { AiRunProgress } from './ai-run-progress';
import { AiPlanLive } from './ai-live-call';
import { PlanEditPanel } from './ai-plan-edit';
import { PlanSheetImagePanel } from './ai-plan-sheet-image';

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
  failed: Array<{
    variantId: string;
    error: string;
    /** Lý do theo từng tầng; tầng `0` là lỗi LIÊN TẦNG. Vắng ở lượt chạy trước 13/09/2026. */
    reasons?: Array<{
      level: number;
      messages: string[];
      /** Lỗi của lượt đầu khi tầng đã được gọi lần hai (V-26). */
      firstMessages?: string[];
      /** `none` chỉ còn ở lượt chạy trước 15/09/2026: lý do nằm ở diện tích hay khối xây (T43). */
      retry?: 'revise' | 'resample' | 'none';
      /** Số lượt gọi mô hình đã dùng khi bác (T45). Vắng ở lượt chạy trước 15/09/2026. */
      attempts?: number;
      /** Chỗ chương trình đã tự sửa ở lượt cuối. */
      notes?: string[];
    }>;
  }>;
}

const COUNTS = ['1', '2', '3'] as const;

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
  const editPlan = useEditAiPlan();
  /** Lượt chạy đang theo dõi là lượt SỬA — xong thì mở ngay phương án sửa (T53). */
  const [editRunId, setEditRunId] = useState<string | null>(null);
  // Hỏi mỗi 2 giây để bảng theo dõi trực tiếp (token, thời gian, nút Dừng) chạy theo lượt gọi.
  const run = useAiRun(runId, 2000);
  const choose = useChooseAiPlan();
  const hidePlan = useHideAiPlan();
  /** Phương án đang chờ xác nhận xoá khỏi danh sách — `null` = không hỏi gì. */
  const [askHide, setAskHide] = useState<{ artifactId: string; name: string } | null>(null);
  const invalidate = useInvalidateAiDesign();

  // Mặt bằng đọc ĐẦU BÀI + KHẢO SÁT, không đọc chương trình không gian (T45, 15/09/2026).
  const blocked = !state.briefArtifactId;
  const runResult = (run.data?.result ?? null) as PlanRunResult | null;
  const running = run.data?.status === 'queued' || run.data?.status === 'running';

  // Lượt chạy vừa xong thì danh sách phương án ở `/state` đã cũ. Nạp lại đúng một lần cho mỗi
  // lần trạng thái chuyển sang chốt.
  useEffect(() => {
    if (run.data?.status === 'done' || run.data?.status === 'failed') invalidate(projectId);
  }, [run.data?.status, projectId, invalidate]);

  // Lượt sửa xong: mở bản sửa, đừng để kỹ sư đi tìm nó trong danh sách phương án.
  const editedId =
    runId !== null && runId === editRunId && run.data?.status === 'done'
      ? (runResult?.plans[0]?.artifactId ?? null)
      : null;
  useEffect(() => {
    if (editedId && state.plans.some((plan) => plan.artifactId === editedId)) {
      setSelected(editedId);
      setEditRunId(null);
    }
  }, [editedId, state.plans]);

  const entries = useMemo(() => {
    const variantOf = new Map((runResult?.plans ?? []).map((p) => [p.artifactId, p.variantId]));
    return state.plans.map((plan) => ({
      artifactId: plan.artifactId,
      createdAt: plan.createdAt,
      variantId: variantOf.get(plan.artifactId) ?? null,
    }));
  }, [state.plans, runResult]);

  // Phương án đang mở: ưu tiên bản đã chọn, rồi bản mới nhất. Không để rỗng khi đã có kết quả —
  // một màn hình trống trong lúc dữ liệu đã về đọc như là chưa chạy gì.
  useEffect(() => {
    if (entries.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!selected || !entries.some((entry) => entry.artifactId === selected)) {
      setSelected(state.planHeadArtifactId ?? entries[0]!.artifactId);
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

  return (
    <div className="space-y-4">
      <Panel
        title="Mặt bằng từng tầng"
        aside={
          state.plans.length ? (
            <Chip tone="gr">{state.plans.length} phương án</Chip>
          ) : (
            <Chip tone="am">Chưa có</Chip>
          )
        }
      >
        {blocked ? (
          <p className="text-fg-subtle">
            Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước khi xếp mặt bằng.
          </p>
        ) : (
          !readOnly && (
            <div className="space-y-3">
              <RulePackPicker value={packs} onChange={setPacks} disabled={running} />
              <div className="flex flex-wrap items-end gap-3">
                <AiModePicker
                  kind="text"
                  choice={ai.choice}
                  options={ai.options}
                  onMode={ai.pickMode}
                  onRoute={ai.pickRoute}
                  allowSolver={false}
                  disabled={running || start.isPending}
                />
                <ReasoningEffortPicker
                  value={effort}
                  onChange={setEffort}
                  option={ai.selected}
                  disabled={running || start.isPending}
                />
                <label className="block">
                  <span className="block text-fg-subtle">Số phương án</span>
                  <SegmentedControl
                    options={COUNTS}
                    value={count}
                    onChange={setCount}
                    getLabel={(option) => option}
                  />
                </label>
                <Button
                  variant="primary"
                  onClick={onRun}
                  disabled={running || start.isPending || !ai.choice.route}
                >
                  {start.isPending ? 'Đang gửi…' : 'Xếp mặt bằng'}
                </Button>
              </div>
              {/* Mỗi phương án là một lượt gọi TÍNH TIỀN, nói thẳng ra trước khi bấm. Không hứa
                  một con số thời gian cho bước này vì chưa đo (CLAUDE.md 5.2) — chỉ nêu con số
                  đã đo được ở bước trước để người dùng có mốc so sánh. */}
              <p className="text-fg-subtle">
                Mỗi phương án là một lượt gọi mô hình cho cả nhà, chỉ dựa trên đầu bài và khảo sát —
                không dùng chương trình không gian. AI khai danh sách phòng từng tầng, diện tích mục
                tiêu, cạnh phòng nào, cửa chính ở đâu, và phác mỗi tầng trên lưới ô khoảng một mét;
                chương trình kiểm theo đầu bài, nắn bản phác, căn vách, đặt cửa và dựng tường. Phòng
                đầu bài có ghi diện tích tối thiểu thì phải đạt mức đó. Không xếp được thì AI được
                gọi lại để sửa, tối đa ba lần — mỗi lần là một lượt tính tiền. Vẫn không xếp được
                thì phương án được đánh dấu chưa xếp được và không vẽ.
              </p>
            </div>
          )
        )}
        {start.isError && <p className="mt-3 text-status-overdue">{toUserMessage(start.error)}</p>}
      </Panel>

      {run.data && (
        <AiRunProgress
          run={run.data}
          onRetry={readOnly ? undefined : onRun}
          retryDisabled={start.isPending || !ai.choice.route}
        />
      )}
      {run.data && <AiPlanLive projectId={projectId} run={run.data} />}
      {run.data && (
        <AiRunUsage
          projectId={projectId}
          purposePrefix="plan_house"
          startedAt={run.data.createdAt}
          endedAt={running ? null : run.data.updatedAt}
        />
      )}

      {(runResult?.failed.length ?? 0) > 0 && (
        <Panel title="Phương án chưa xếp được">
          {/* Phương án hỏng KHÔNG bị nuốt: hai bản dùng được vẫn hơn không có gì, nhưng người
              dùng phải biết mình đang xem hai trong ba. Và không có tờ vẽ nào cho phương án ấy
              (T39) — nên lý do theo từng tầng là tất cả những gì người dùng có để quyết chạy lại
              hay đổi model. */}
          <ul className="space-y-3">
            {runResult!.failed.map((item) => (
              <li key={item.variantId} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-overdue" aria-hidden />
                <div>
                  <p>
                    <b>{item.variantId}</b> — {item.error}
                  </p>
                  {(item.reasons ?? []).map((reason) => (
                    <div key={reason.level} className="mt-1">
                      <p className="font-medium">
                        {reason.level === 0 ? 'Cả nhà' : `Tầng ${reason.level}`}
                      </p>
                      {reason.firstMessages && (
                        <>
                          <p className="text-fg-subtle">
                            Lượt đầu — {reason.firstMessages.length} lỗi:
                          </p>
                          <ul className="list-disc pl-5 text-fg-subtle">
                            {reason.firstMessages.map((message) => (
                              <li key={message}>{message}</li>
                            ))}
                          </ul>
                          <p className="mt-1 text-fg-subtle">
                            {retryLabel(reason.retry)} — {reason.messages.length} lỗi:
                          </p>
                        </>
                      )}
                      {(reason.attempts ?? 0) > 1 && (
                        <p className="text-fg-subtle">
                          Đã gọi mô hình {reason.attempts} lượt cho phương án này.
                        </p>
                      )}
                      {reason.retry === 'none' && (
                        <p className="text-fg-subtle">
                          Không gọi lại mô hình: lỗi nằm ở hình học — bộ xếp đã thử mọi cách chia,
                          kể cả bỏ bản phác và vùng AI khai, và lỗi ấy không nằm ở thứ AI vẽ nên gọi
                          lại cũng không gỡ được. Chạy lại để AI khai một ý định khác, hoặc giảm bớt
                          yêu cầu diện tích trong đầu bài.
                        </p>
                      )}
                      <ul className="list-disc pl-5 text-fg-subtle">
                        {reason.messages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                      {(reason.notes?.length ?? 0) > 0 && (
                        <>
                          <p className="mt-1 text-fg-subtle">Chương trình đã tự sửa:</p>
                          <ul className="list-disc pl-5 text-fg-subtle">
                            {reason.notes!.map((note) => (
                              <li key={note}>{note}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {entries.length > 0 && (
        <Panel title="Phương án">
          <ul className="flex flex-wrap gap-2">
            {entries.map((entry) => {
              const isOpen = entry.artifactId === selected;
              const isHead = entry.artifactId === state.planHeadArtifactId;
              const name = entry.variantId ?? `Phương án ${entry.artifactId.slice(7, 13)}`;
              return (
                <li key={entry.artifactId} className="flex items-stretch">
                  <button
                    type="button"
                    aria-pressed={isOpen}
                    onClick={() => setSelected(entry.artifactId)}
                    className={
                      isOpen
                        ? 'rounded-l-md border border-tk-bl-line bg-tk-bl-bg px-3 py-2 text-left'
                        : 'rounded-l-md border border-tk-line bg-tk-panel px-3 py-2 text-left'
                    }
                  >
                    <span className="block font-medium">{name}</span>
                    {isHead && <Chip tone="gr">Đang hiệu lực</Chip>}
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setAskHide({ artifactId: entry.artifactId, name })}
                      aria-label={`Xoá ${name} khỏi danh sách`}
                      title="Xoá khỏi danh sách"
                      className="rounded-r-md border border-l-0 border-tk-line bg-tk-panel px-2 text-fg-subtle hover:text-status-overdue"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
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
              Đây đang là phương án hiệu lực — xoá xong bước mặt đứng cần chọn lại phương án.
            </p>
          )}
          {hidePlan.isError && (
            <p className="mt-1 text-status-overdue">{toUserMessage(hidePlan.error)}</p>
          )}
        </ConfirmDialog>
      )}

      {review.isLoading && <Skeleton className="h-72 w-full" />}
      {review.isError && (
        <Panel title="Phương án">
          <p className="text-status-overdue">{toUserMessage(review.error)}</p>
        </Panel>
      )}

      {review.data && (
        <PlanDetail
          review={review.data}
          level={currentLevel}
          onLevel={setLevel}
          sheet={sheet}
          readOnly={readOnly}
          isHead={review.data.artifactId === state.planHeadArtifactId}
          choosing={choose.isPending}
          onChoose={() =>
            void choose
              .mutateAsync({ projectId, artifactId: review.data!.artifactId })
              .catch(() => undefined)
          }
          chooseError={choose.isError ? toUserMessage(choose.error) : null}
          downloadingDxf={dxf.isPending}
          onDownloadDxf={() =>
            void dxf
              .mutateAsync({ projectId, artifactId: review.data!.artifactId })
              .catch(() => undefined)
          }
          dxfError={dxf.isError ? toUserMessage(dxf.error) : null}
          sheetImagePanel={
            <PlanSheetImagePanel
              review={review.data}
              level={currentLevel}
              projectId={projectId}
              readOnly={readOnly}
              disabled={running}
            />
          }
          editPanel={
            <PlanEditPanel
              review={review.data}
              level={currentLevel}
              readOnly={readOnly}
              disabled={running || !ai.choice.route}
              pending={editPlan.isPending}
              error={editPlan.isError ? toUserMessage(editPlan.error) : null}
              notes={
                runResult?.plans.find((plan) => plan.artifactId === review.data!.artifactId)
                  ?.notes ?? []
              }
              onSubmit={(instruction) => onEdit(review.data!.artifactId, instruction)}
            />
          }
        />
      )}
    </div>
  );
}

function PlanDetail({
  review,
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
  sheetImagePanel,
  editPanel,
}: {
  review: AiPlanReview;
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
  /** Ô yêu cầu sửa (T53) — ngay dưới tờ vẽ: xem bản vẽ xong gõ luôn. */
  /** Panel ảnh nội thất (T57) — nằm NGAY DƯỚI tờ vector, trước ô yêu cầu sửa. */
  sheetImagePanel: React.ReactNode;
  editPanel: React.ReactNode;
}): React.ReactElement {
  const current = review.levels.find((item) => item.level === level) ?? review.levels[0];
  const levelOptions = review.levels.map((item) => String(item.level));

  return (
    <>
      <Panel
        title={review.variantLabel}
        aside={
          <Chip tone="mute">
            {review.variantId}
            {resampledLabel(review.generator)}
          </Chip>
        }
      >
        <p className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4" aria-hidden />
          {review.generator.provider} · {review.generator.model}
        </p>
        <p className="mt-2">{review.rationale}</p>
        {review.wallsDerived && (
          <p className="mt-3 flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
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
        {!readOnly && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={onChoose} disabled={choosing || isHead}>
              {isHead ? 'Đang hiệu lực' : choosing ? 'Đang lưu…' : 'Chọn phương án này'}
            </Button>
            {sheet.url && (
              <a
                className="underline"
                href={sheet.url}
                download={`mat-bang-${review.variantId}-tang-${level}.svg`}
              >
                Tải tờ mặt bằng tầng {level} (SVG)
              </a>
            )}
            <Button variant="secondary" onClick={onDownloadDxf} disabled={downloadingDxf}>
              {downloadingDxf ? 'Đang tạo tệp…' : 'Tải DXF cả nhà'}
            </Button>
          </div>
        )}
        {chooseError && <p className="mt-2 text-status-overdue">{chooseError}</p>}
        {dxfError && <p className="mt-2 text-status-overdue">Không tải được tệp DXF: {dxfError}</p>}
      </Panel>

      <Panel
        title="Tờ mặt bằng"
        aside={
          sheet.scale ? (
            <Chip tone="mute">
              Tỷ lệ 1:{sheet.scale} · {sheet.orientation === 'portrait' ? 'tờ dọc' : 'tờ ngang'}
            </Chip>
          ) : undefined
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
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
        </div>

        {sheet.loading && <Skeleton className="h-96 w-full" />}
        {sheet.error && <p className="text-status-overdue">{sheet.error}</p>}
        {sheet.url && (
          // `<img>` chứ không phải SVG nhúng: xem ghi chú đầu tệp.
          <img
            src={sheet.url}
            alt={`Tờ mặt bằng ${current?.name ?? `tầng ${level}`}`}
            className="w-full rounded-md border border-tk-line bg-white"
          />
        )}
        <p className="mt-3 text-fg-subtle">
          {review.generator.layout === 'intent'
            ? 'Tờ vẽ dựng từ toạ độ chương trình xếp, nên mọi kích thước trên đây đo được.'
            : 'Tờ vẽ dựng từ chính toạ độ mô hình khai, nên mọi kích thước trên đây đo được.'}
        </p>
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
            {current!.notes.map((note) => (
              <li key={note.code} className="text-fg-subtle">
                {note.message}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {sheetImagePanel}

      {editPanel}

      {current?.intent && <IntentPanel level={current} labels={review.roomLabels} />}

      {/* Thứ tự cố ý: LỖI CHẶN trước, rồi điểm. Một phương án có dữ liệu tự mâu thuẫn thì điểm
          của nó không nói gì — cổng và điểm là hai tầng kết luận khác nhau (T24), và đặt điểm lên
          trên thì con số đọc như lời phán cuối cùng. */}
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

      <PlanScorePanel score={review.score} />

      <Panel title="Đối chiếu thói quen thiết kế">
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
      </Panel>
    </>
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
    <Panel
      title={title}
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
    </Panel>
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

function retryLabel(retry: 'revise' | 'resample' | 'none' | undefined): string {
  return retry === 'revise'
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
    <Panel
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
    </Panel>
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
