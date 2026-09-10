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
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/states';
import {
  useAiPlanReview,
  useAiPlanSheet,
  useAiRun,
  useChooseAiPlan,
  useInvalidateAiDesign,
  useStartAiRun,
  type AiDesignState,
  type AiPlanIssue,
  type AiPlanReview,
  type AiRulePackChoice,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { RulePackPicker } from './ai-program-step';
import { AiRunProgress } from './ai-run-progress';

/** Kết quả một lượt chạy giai đoạn mặt bằng, đúng hình dạng Workflow ghi vào `design_ai_run`. */
interface PlanRunResult {
  plans: Array<{
    variantId: string;
    artifactId: string;
    wallsDerived: boolean;
    repaired: boolean;
    blocking: AiPlanIssue[];
    findings: AiPlanIssue[];
    notes: Array<{ code: string; message: string }>;
  }>;
  failed: Array<{ variantId: string; error: string }>;
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
  // Mặc định TẮT cả hai gói (T20). Ô tích này tác động cả hai chiều: gói đã tích được gửi cho mô
  // hình để làm theo, VÀ dùng để đối chiếu kết quả — nên đổi nó là đổi cả danh sách cảnh báo.
  const [packs, setPacks] = useState<AiRulePackChoice>({ standards: false, experience: false });
  const [count, setCount] = useState<(typeof COUNTS)[number]>('3');
  const [runId, setRunId] = useState<string | null>(state.runs.plan?.id ?? null);
  const [selected, setSelected] = useState<string | null>(state.planHeadArtifactId);
  const [level, setLevel] = useState(1);

  const start = useStartAiRun('plan');
  const run = useAiRun(runId);
  const choose = useChooseAiPlan();
  const invalidate = useInvalidateAiDesign();

  const blocked = !state.program;
  const runResult = (run.data?.result ?? null) as PlanRunResult | null;
  const running = run.data?.status === 'queued' || run.data?.status === 'running';

  // Lượt chạy vừa xong thì danh sách phương án ở `/state` đã cũ. Nạp lại đúng một lần cho mỗi
  // lần trạng thái chuyển sang chốt.
  useEffect(() => {
    if (run.data?.status === 'done' || run.data?.status === 'failed') invalidate(projectId);
  }, [run.data?.status, projectId, invalidate]);

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

  const onRun = () => {
    if (!ai.choice.route) return;
    void start
      .mutateAsync({
        projectId,
        route: ai.choice.route,
        options: { rulePacks: packs, count: Number(count) },
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
            Chưa có chương trình không gian. Chạy bước «Chương trình không gian» trước — mặt bằng
            phải xếp đúng danh mục phòng đã lập.
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
                Mỗi phương án là một lượt gọi mô hình riêng, chạy song song, và có thêm một lượt sửa
                nếu bộ kiểm báo lỗi. Bước này chưa có số đo; một lượt ở bước chương trình không gian
                mất 1,5&ndash;3 phút.
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

      {(runResult?.failed.length ?? 0) > 0 && (
        <Panel title="Phương án không xếp được">
          {/* Phương án hỏng KHÔNG bị nuốt: hai bản dùng được vẫn hơn không có gì, nhưng người
              dùng phải biết mình đang xem hai trong ba. */}
          <ul className="space-y-1">
            {runResult!.failed.map((item) => (
              <li key={item.variantId} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-overdue" aria-hidden />
                <span>
                  <b>{item.variantId}</b> — {item.error}
                </span>
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
              return (
                <li key={entry.artifactId}>
                  <button
                    type="button"
                    aria-pressed={isOpen}
                    onClick={() => setSelected(entry.artifactId)}
                    className={
                      isOpen
                        ? 'rounded-md border border-tk-bl-line bg-tk-bl-bg px-3 py-2 text-left'
                        : 'rounded-md border border-tk-line bg-tk-panel px-3 py-2 text-left'
                    }
                  >
                    <span className="block font-medium">
                      {entry.variantId ?? `Phương án ${entry.artifactId.slice(7, 13)}`}
                    </span>
                    {isHead && <Chip tone="gr">Đang hiệu lực</Chip>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
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
            {review.generator.repaired ? ' · đã sửa một lần' : ''}
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
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
            {/* T19 — câu này phải có mặt ở CẢ tờ vẽ và màn hình. Tờ vẽ đi ra ngoài (in, gửi
                khách) còn màn hình thì không, nên một chỗ là không đủ. */}
            <span>
              Tường trên tờ vẽ do <b>chương trình suy từ chữ nhật phòng</b>, không phải của AI: sau
              một lượt sửa mà tường khai vẫn không bao kín phòng. Bố cục vẫn là của AI.
            </span>
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
                Tải tờ tầng {level} (SVG)
              </a>
            )}
          </div>
        )}
        {chooseError && <p className="mt-2 text-status-overdue">{chooseError}</p>}
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
        {review.levels.length > 1 && (
          <div className="mb-3">
            <SegmentedControl
              options={levelOptions}
              value={String(level)}
              onChange={(value) => onLevel(Number(value))}
              getLabel={(value) =>
                review.levels.find((item) => String(item.level) === value)?.name ?? `Tầng ${value}`
              }
            />
          </div>
        )}
        {sheet.loading && <Skeleton className="h-96 w-full" />}
        {sheet.error && <p className="text-status-overdue">{sheet.error}</p>}
        {sheet.url && (
          // `<img>` chứ không phải SVG nhúng: xem ghi chú đầu tệp.
          <img
            src={sheet.url}
            alt={`Tờ mặt bằng ${current?.name ?? `tầng ${level}`} — đề xuất AI`}
            className="w-full rounded-md border border-tk-line bg-white"
          />
        )}
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

      <IssueList
        title="Lỗi bộ kiểm máy còn lại"
        issues={review.blocking}
        tone="overdue"
        empty="Bộ kiểm máy không còn lỗi chặn nào trên phương án này."
        note="Phương án vẫn được lưu để xem, nhưng những chỗ này là dữ liệu tự mâu thuẫn — tờ vẽ đang nói sai ở đó."
      />
      <IssueList
        title="Chỗ đáng ngờ"
        issues={review.findings}
        tone="pending"
        empty="Không có chỗ nào đáng ngờ."
      />

      <Panel title="Đối chiếu quy chuẩn">
        {!review.rulePacks.standards && !review.rulePacks.experience ? (
          <p className="text-fg-subtle">
            Chưa tích gói quy tắc nào, nên không đối chiếu gì. Tích «Quy chuẩn quốc gia» hoặc «Kinh
            nghiệm nghề» ở trên để xem chỗ lệch.
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
        {(review.rulePacks.standards || review.rulePacks.experience) && (
          <p className="mt-3 text-fg-subtle">
            Đã đối chiếu {review.checkedRules.length} quy tắc.{' '}
            <b>{review.uncheckedRules.length} quy tắc chưa đối chiếu được</b> vì chúng cần thứ mặt
            bằng chưa mô tả — khoảng lùi thực tế, chiều cao thông thuỷ, lối thoát hiểm. Danh sách
            cảnh báo rỗng không có nghĩa là đạt quy chuẩn.
          </p>
        )}
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
