/**
 * Bước 2 của tab AI Design — mặt đứng mặt tiền (T59, 19/09/2026).
 *
 * T16: mô hình chỉ TRANG TRÍ mặt đứng. Khung nhà, cao độ, cửa và ban công lấy từ phương án mặt bằng
 * đã chọn; mô hình chọn mái, vật liệu, màu, cổng, rào và các mảng trang trí. Màn hình phải nói ra ba
 * điều, cả ba đều là ràng buộc:
 *
 *  · **Mặt đứng dựng theo phương án nào.** Kỹ sư đổi phương án mặt bằng sau khi dựng thì mặt đứng cũ
 *    vẫn giữ (Haan chốt 19/09/2026) nhưng phải gắn nhãn «dựng theo phương án cũ» — cửa trên tờ ấy là
 *    cửa của một ngôi nhà khác.
 *  · **Tờ vẽ qua `<img>`**, không nhúng SVG: chữ trên tờ có phần do mô hình sinh (CLAUDE.md 8.3).
 *  · **Màu luôn kèm chữ** (CGD 6.8): ô màu kèm mã hex và tên vật liệu, không chỉ một ô tô màu.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import {
  useAiFacade,
  useAiFacadeSheet,
  useAiRun,
  useDownloadAiFacadeDxf,
  useInvalidateAiDesign,
  useStartAiRun,
  type AiDesignState,
  type AiFacadeView,
  type ReasoningEffort,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, ReasoningEffortPicker, useAiChoice } from './ai-model-picker';
import { AiRunProgress } from './ai-run-progress';
import { AiPlanLive } from './ai-live-call';
import { AiRunUsage } from './ai-usage';
import { FacadeBriefForm, useFacadeBriefController } from './ai-facade-brief-form';
import { FacadeImagePanel } from './ai-facade-image';

/** Mặt đứng hiện hành dựng theo một phương án mặt bằng KHÁC bản đang hiệu lực. */
export function facadeIsStale(state: AiDesignState): boolean {
  return Boolean(
    state.facadeArtifactId &&
    state.facadePlanRef &&
    state.planHeadArtifactId &&
    state.facadePlanRef !== state.planHeadArtifactId,
  );
}

export const STALE_FACADE = 'Mặt đứng đang dựng theo phương án mặt bằng cũ.';

export function AiFacadeStep({
  projectId,
  readOnly,
  state,
}: {
  projectId: string;
  readOnly: boolean;
  state: AiDesignState;
}): React.ReactElement {
  const ai = useAiChoice('text', false);
  const [effort, setEffort] = useState<ReasoningEffort | null>(null);
  const [runId, setRunId] = useState<string | null>(state.runs.facade?.id ?? null);
  const start = useStartAiRun('facade');
  // Phiếu yêu cầu của kỹ sư (Đợt F2) — trạng thái ở đây vì nút chạy phải lưu phiếu trước khi chạy.
  const brief = useFacadeBriefController(projectId);
  const run = useAiRun(runId, 2000);
  const invalidate = useInvalidateAiDesign();
  const running = run.data?.status === 'queued' || run.data?.status === 'running';

  // Lượt chạy chốt xong thì `/state` đã cũ — nạp lại để mặt đứng mới hiện ra.
  useEffect(() => {
    if (run.data?.status === 'done' || run.data?.status === 'failed') invalidate(projectId);
  }, [run.data?.status, projectId, invalidate]);

  const blocked = !state.planHeadArtifactId;
  const stale = facadeIsStale(state);
  const failedIssues =
    run.data?.status === 'failed'
      ? ((run.data.result as { issues?: string[] } | null)?.issues ?? [])
      : [];

  const onRun = async () => {
    if (!ai.choice.route) return;
    // Phiếu còn thay đổi chưa lưu: lưu trước — lượt chạy đọc bản ĐÃ LƯU, không đọc nháp trong trình
    // duyệt. Lưu hỏng thì dừng: chạy với phiếu cũ là trả tiền cho một yêu cầu kỹ sư không còn muốn.
    if (brief.dirty && !(await brief.save())) return;
    void start
      .mutateAsync({
        projectId,
        route: ai.choice.route,
        options: { reasoningEffort: ai.selected?.supportsEffort === false ? null : effort },
      })
      .then((out) => setRunId(out.runId))
      .catch(() => undefined);
  };

  return (
    <div className="space-y-4">
      <FacadeBriefForm controller={brief} readOnly={readOnly} />
      <Panel
        title="Mặt đứng mặt tiền"
        aside={
          state.facadeArtifactId ? (
            stale ? (
              <Chip tone="am">Theo phương án cũ</Chip>
            ) : (
              <Chip tone="gr">Đã có</Chip>
            )
          ) : (
            <Chip tone="am">Chưa có</Chip>
          )
        }
      >
        {blocked ? (
          <p className="text-fg-subtle">
            Chưa chọn phương án mặt bằng. Mở bước «1. Mặt bằng từng tầng», chọn một phương án rồi
            quay lại đây.
          </p>
        ) : (
          !readOnly && (
            <div className="space-y-3">
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
                <Button
                  variant="primary"
                  onClick={() => void onRun()}
                  disabled={running || start.isPending || brief.saving || !ai.choice.route}
                >
                  {start.isPending
                    ? 'Đang gửi…'
                    : state.facadeArtifactId
                      ? 'Dựng lại ý tưởng mặt đứng'
                      : 'Dựng ý tưởng mặt đứng'}
                </Button>
              </div>
              {/* Lượt gọi TÍNH TIỀN — nói thẳng ra trước khi bấm, như ở bước mặt bằng. */}
              <p className="text-fg-subtle">
                Một lượt gọi mô hình cho một ý tưởng, theo phiếu yêu cầu ở trên. Khung nhà, cao độ
                các tầng, cửa, cửa sổ và ban công lấy nguyên từ phương án mặt bằng đang chọn — AI
                không được dời hay thêm bớt. AI chọn mái, vật liệu, màu, cổng, tường rào và các mảng
                trang trí; chương trình kiểm và dựng tờ mặt đứng. Ý tưởng không dùng được thì AI
                được gọi lại một lần kèm lý do — lượt ấy cũng tính tiền.
              </p>
            </div>
          )
        )}
        {start.isError && <p className="mt-3 text-status-overdue">{toUserMessage(start.error)}</p>}
      </Panel>

      {run.data && (
        <AiRunProgress
          run={run.data}
          onRetry={readOnly ? undefined : () => void onRun()}
          retryDisabled={start.isPending || !ai.choice.route}
        />
      )}
      {run.data && <AiPlanLive projectId={projectId} run={run.data} />}
      {run.data && (
        <AiRunUsage
          projectId={projectId}
          purposePrefix="facade"
          startedAt={run.data.createdAt}
          endedAt={running ? null : run.data.updatedAt}
        />
      )}
      {failedIssues.length > 0 && (
        <Panel title="Ý tưởng chưa dùng được">
          <ul className="list-disc space-y-1 pl-5 text-fg-subtle">
            {failedIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Panel>
      )}

      {state.facadeArtifactId && (
        <FacadeDetail
          projectId={projectId}
          artifactId={state.facadeArtifactId}
          stale={stale}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function FacadeDetail({
  projectId,
  artifactId,
  stale,
  readOnly,
}: {
  projectId: string;
  artifactId: string;
  stale: boolean;
  readOnly: boolean;
}): React.ReactElement {
  const facade = useAiFacade(projectId, artifactId);
  const sheet = useAiFacadeSheet(projectId, artifactId);
  const dxf = useDownloadAiFacadeDxf();

  return (
    <>
      {stale && (
        <p className="flex items-start gap-2 rounded-md border border-tk-am-line bg-tk-am-bg p-3 text-tk-am-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <b>{STALE_FACADE}</b> Phương án mặt bằng đã đổi sau khi dựng mặt đứng này, nên cửa và
            ban công trên tờ có thể không khớp. Bấm «Dựng lại ý tưởng mặt đứng» để dựng theo phương
            án đang hiệu lực.
          </span>
        </p>
      )}

      {facade.isLoading && <Skeleton className="h-40 w-full" />}
      {facade.isError && <p className="text-status-overdue">{toUserMessage(facade.error)}</p>}
      {facade.data && <FacadeIdea view={facade.data} />}

      <Panel
        title="Tờ mặt đứng"
        aside={
          sheet.scale ? (
            <Chip tone="mute">
              Tỷ lệ 1:{sheet.scale} · {sheet.orientation === 'portrait' ? 'tờ dọc' : 'tờ ngang'}
            </Chip>
          ) : undefined
        }
      >
        {!readOnly && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {sheet.url && (
              <a className="underline" href={sheet.url} download="mat-dung-mat-tien.svg">
                Tải tờ mặt đứng (SVG)
              </a>
            )}
            <Button
              variant="secondary"
              onClick={() => dxf.mutate({ projectId, artifactId })}
              disabled={dxf.isPending}
            >
              {dxf.isPending ? 'Đang tạo tệp…' : 'Tải DXF mặt đứng'}
            </Button>
          </div>
        )}
        {dxf.isError && (
          <p className="mb-3 text-status-overdue">Không tải được tệp DXF: {dxf.error.message}</p>
        )}
        {sheet.loading && <Skeleton className="h-96 w-full" />}
        {sheet.error && <p className="text-status-overdue">{sheet.error}</p>}
        {sheet.url && (
          <img
            src={sheet.url}
            alt="Tờ mặt đứng mặt tiền"
            className="w-full rounded-md border border-tk-line bg-white"
          />
        )}
        <p className="mt-3 text-fg-subtle">
          Tờ vẽ dựng từ toạ độ của mặt bằng và của ý tưởng, nên mọi kích thước trên đây đo được. Tờ
          đơn sắc — vật liệu và màu ghi bằng chữ ở cột khung tên và ở bảng bên trên.
        </p>
      </Panel>

      {/* Ảnh có vật liệu (Đợt E) — NGAY DƯỚI tờ vector, không thay nó. */}
      <FacadeImagePanel
        projectId={projectId}
        artifactId={artifactId}
        readOnly={readOnly}
        stale={stale}
      />
    </>
  );
}

/** «Ô văng × 4, Bồn cây × 2» — gộp tên lặp lại, giữ thứ tự xuất hiện. */
function countLabels(labels: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => (count > 1 ? `${label} × ${count}` : label))
    .join(', ');
}

function FacadeIdea({ view }: { view: AiFacadeView }): React.ReactElement {
  const swatches: Array<{ label: string; hex: string }> = [
    { label: 'Màu chính', hex: view.palette.primary_hex },
    { label: 'Màu phụ', hex: view.palette.secondary_hex },
    ...(view.palette.accent_hex ? [{ label: 'Màu nhấn', hex: view.palette.accent_hex }] : []),
  ];
  return (
    <Panel
      title="Ý tưởng mặt đứng"
      aside={view.generator.repaired ? <Chip tone="mute">AI đã sửa một lần</Chip> : undefined}
    >
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4" aria-hidden />
        {view.generator.provider} · {view.generator.model}
      </p>
      <p className="mt-2">{view.rationale}</p>

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {view.legend.map((row) => (
          <div key={row.key}>
            <dt className="text-fg-subtle">{row.label}</dt>
            <dd>
              {row.value}{' '}
              {/* Nguồn của từng dòng luôn ghi bằng chữ — người đọc phải biết đâu là quyết định của
                  kỹ sư, đâu là đề xuất của máy (PRD 2.3). */}
              <span className="text-xs text-fg-subtle">
                {row.fromBrief ? '· theo yêu cầu kỹ sư' : '· AI đề xuất'}
              </span>
            </dd>
          </div>
        ))}
        {view.pitchDeg !== null && (
          <div>
            <dt className="text-fg-subtle">Độ dốc mái</dt>
            <dd>{view.pitchDeg}°</dd>
          </div>
        )}
        {view.gate && (
          <div>
            <dt className="text-fg-subtle">Kiểu cổng, kích thước</dt>
            <dd>
              {view.gate.type}
              {view.gate.w && view.gate.h ? ` · rộng ${view.gate.w} cm, cao ${view.gate.h} cm` : ''}
            </dd>
          </div>
        )}
        {view.fenceH !== null && (
          <div>
            <dt className="text-fg-subtle">Tường rào cao</dt>
            <dd>{view.fenceH} cm</dd>
          </div>
        )}
        {view.elements.length > 0 && (
          <div>
            <dt className="text-fg-subtle">Mảng trang trí</dt>
            <dd>{countLabels(view.elements)}</dd>
          </div>
        )}
        <div>
          <dt className="text-fg-subtle">Lấy từ mặt bằng (không đổi)</dt>
          <dd>
            {view.openings} lỗ mở · {view.balconies} ban công
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <p className="text-fg-subtle">Bảng màu</p>
        <ul className="mt-1 flex flex-wrap gap-3">
          {swatches.map((swatch) => (
            <li key={swatch.label} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block size-6 rounded border border-tk-line"
                style={{ backgroundColor: swatch.hex }}
              />
              {/* Màu luôn kèm CHỮ (CGD 6.8). */}
              <span>
                {swatch.label} <span className="font-mono text-fg-subtle">{swatch.hex}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
