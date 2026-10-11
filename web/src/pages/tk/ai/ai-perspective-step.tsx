/**
 * Bước 3 của tab AI Design — bộ ảnh phối cảnh (T67, 20/09/2026).
 *
 * Năm điều màn hình BẮT BUỘC nói ra, cả năm đều là ràng buộc chứ không phải trang trí:
 *
 *  · **Không in dấu lên ảnh** (Haan, 11/10/2026 — gỡ dấu T117 còn giữ): ảnh hiện và tải về đúng như mô hình trả.
 *  · **Giá trước khi bấm, và bấm một lần là NHIỀU lượt gọi.** Hai bước trước mỗi lần bấm là một
 *    lượt; ở đây một lần bấm dựng cả bộ, nên không được để người dùng suy ra từ thói quen cũ.
 *  · **Vẽ lại MỘT góc chỉ tốn một lượt** — và `front_day` không đi đường ấy được, vì bốn góc kia
 *    dựng theo nó (Đợt C). Nút của tấm gốc phải NÓI LÝ DO, không phải biến mất.
 *  · **Góc thiếu nói rõ lý do.** Hợp đồng cấm lặng lẽ trả về ít ảnh hơn, và màn hình là chỗ lời
 *    cấm ấy có tác dụng.
 *  · **Ảnh không đo được.** Không chấm điểm bộ ảnh như mặt bằng và mặt đứng — không có thước nào
 *    đo được một tấm ảnh, và bịa ra một con số là tệ hơn không có.
 *
 * Nguồn của bộ ảnh chọn NGAY ở bước này (Haan, 10/10/2026): «Dựng trên mặt bằng» và «Dựng trên mặt
 * đứng». Ô mặt đứng chỉ liệt kê các bản dựng trên phương án đã chọn — mặt đứng mang cửa, ban công
 * của đúng một mặt bằng, chọn chéo là trộn hai ngôi nhà. Hai ô đặt chính MỐC hiệu lực (`/plan/choose`,
 * `/facade/choose`) như ô ở bước Mặt đứng, nên nhãn «theo phương án cũ / mặt đứng cũ» của cả ba
 * bước vẫn nói đúng một điều.
 */

import { useEffect, useState } from 'react';
import { Images, X } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FIELD_BOX } from '@/components/ui/field-box';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/states';
import {
  useAiImageSet,
  useAiImageSetView,
  useAiRun,
  useChooseAiFacade,
  useChooseAiImageSet,
  useChooseAiPlan,
  useHideAiImageSet,
  useInvalidateAiDesign,
  useRedrawPerspectiveView,
  useStartPerspectiveRun,
  useUploadedDrawings,
  type AiDesignState,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { AiRunProgress } from './ai-run-progress';
import { facadeIsStale } from './ai-facade-step';
import { numberedNames } from './variant-name';

/** Tấm gốc của bộ — bốn góc còn lại dựng theo nó, nên nó không vẽ lại lẻ được. */
const ANCHOR_VIEW = 'front_day';

export function AiPerspectiveStep({
  projectId,
  readOnly,
  state,
}: {
  projectId: string;
  readOnly: boolean;
  state: AiDesignState;
}): React.ReactElement {
  const image = useAiChoice('image', false, 2, 'perspective');
  const [runId, setRunId] = useState<string | null>(state.runs.images?.id ?? null);
  const [people, setPeople] = useState(true);
  const [asking, setAsking] = useState(false);
  const start = useStartPerspectiveRun();
  const run = useAiRun(runId, 2000);
  const invalidate = useInvalidateAiDesign();
  const choose = useChooseAiImageSet();
  const hide = useHideAiImageSet();
  const redraw = useRedrawPerspectiveView();
  const choosePlan = useChooseAiPlan();
  const chooseFacade = useChooseAiFacade();
  /** Bộ đang MỞ để xem — tách khỏi bộ HIỆU LỰC, cùng lý do với bước Mặt đứng (T64). */
  const [open, setOpen] = useState<string | null>(null);
  const [askHide, setAskHide] = useState<{ artifactId: string; name: string } | null>(null);
  const running = run.data?.status === 'queued' || run.data?.status === 'running';

  const versions = state.imageSets ?? [];
  const shown =
    (open && versions.some((v) => v.artifactId === open) ? open : null) ?? state.imageSetArtifactId;
  const shownIsHead = shown === state.imageSetArtifactId;
  const set = useAiImageSet(projectId, shown);

  // Lượt chạy chốt xong thì `/state` đã cũ — nạp lại để bộ ảnh mới hiện ra.
  useEffect(() => {
    if (run.data?.status === 'done' || run.data?.status === 'failed') invalidate(projectId);
  }, [run.data?.status, projectId, invalidate]);

  const stale = facadeIsStale(state);
  // Nguồn ý tưởng AI: phương án mặt bằng → các bản mặt đứng dựng trên nó.
  const plans = state.plans ?? [];
  const planNames = numberedNames(plans, 'Phương án');
  const facades = (state.facades ?? []).map((f) => ({
    ...f,
    // Máy chủ cũ chưa trả `planRef` từng bản — bản hiệu lực thì vẫn biết qua `facadePlanRef`.
    planRef:
      f.planRef ?? (f.artifactId === state.facadeArtifactId ? (state.facadePlanRef ?? null) : null),
  }));
  const facadeNames = numberedNames(facades, 'Mặt đứng');
  const basePlan = state.planHeadArtifactId;
  const facadesOfPlan = facades.filter((f) => basePlan && f.planRef === basePlan);
  const baseFacade =
    state.facadeArtifactId && facadesOfPlan.some((f) => f.artifactId === state.facadeArtifactId)
      ? state.facadeArtifactId
      : null;
  const switching = choosePlan.isPending || chooseFacade.isPending;
  const sourceError = choosePlan.error ?? chooseFacade.error;

  /** Đổi phương án làm nền: đặt mốc mặt bằng, rồi mốc mặt đứng sang bản mới nhất của phương án ấy. */
  const pickPlan = (planId: string) => {
    const ofPlan = facades
      .filter((f) => f.planRef === planId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const keep = ofPlan.find((f) => f.artifactId === state.facadeArtifactId);
    const next = keep ?? ofPlan[0];
    void choosePlan
      .mutateAsync({ projectId, artifactId: planId })
      .then(() =>
        next && next.artifactId !== state.facadeArtifactId
          ? chooseFacade.mutateAsync({ projectId, artifactId: next.artifactId })
          : undefined,
      )
      .catch(() => undefined);
  };
  const pickFacade = (facadeId: string) => {
    void chooseFacade.mutateAsync({ projectId, artifactId: facadeId }).catch(() => undefined);
  };
  // Bộ ảnh dựng theo một mặt đứng KHÁC bản đang hiệu lực: kỹ sư đã dựng lại mặt đứng sau đó.
  const setIsOld = Boolean(
    state.imageSetFacadeRef &&
    state.facadeArtifactId &&
    state.imageSetFacadeRef !== state.facadeArtifactId,
  );
  // Nguồn mặt đứng (T114 Đợt 4b): ý tưởng AI, hoặc bản vẽ kỹ sư tải lên ở bước Mặt đứng. Mặc định
  // theo cái đang có — ý tưởng AI trước, vì nó đo được.
  const uploads = useUploadedDrawings(projectId, 'facade');
  const uploadItems = uploads.data?.items ?? [];
  const [source, setSource] = useState<'ai' | 'upload' | null>(null);
  const activeSource: 'ai' | 'upload' =
    source ?? (state.facadeArtifactId || !uploadItems.length ? 'ai' : 'upload');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const pickedUpload =
    uploadItems.find((item) => item.uploadId === uploadId) ?? uploadItems[0] ?? null;

  const blocked =
    activeSource === 'upload'
      ? pickedUpload
        ? null
        : 'Chưa có bản vẽ mặt đứng nào được tải lên. Tải ở cuối bước «Mặt đứng» rồi quay lại đây.'
      : !state.facadeArtifactId
        ? 'Chưa có ý tưởng mặt đứng. Mở bước «Mặt đứng», dựng một ý tưởng (hoặc tải bản vẽ của kỹ sư) rồi quay lại đây.'
        : // Chỉ chặn khi BIẾT CHẮC: máy chủ cũ không nói bản nào dựng trên phương án nào, khi ấy
          // bản hiệu lực vẫn dựng được — máy chủ tự lấy mặt bằng từ chính bản ấy.
          basePlan && facadesOfPlan.length === 0 && facades.some((f) => f.planRef)
          ? `${planNames.get(basePlan) ?? 'Phương án này'} chưa có mặt đứng. Chọn phương án khác, hoặc dựng mặt đứng cho phương án này ở bước «Mặt đứng».`
          : stale
            ? `Chọn một bản mặt đứng của ${planNames.get(basePlan ?? '') ?? 'phương án đã chọn'}.`
            : null;

  const onRun = () => {
    if (!image.choice.route) return;
    const base = { projectId, route: image.choice.route, peopleAndVehicles: people };
    const input =
      activeSource === 'upload'
        ? pickedUpload && { ...base, uploadId: pickedUpload.uploadId }
        : state.facadeArtifactId && { ...base, artifactId: state.facadeArtifactId };
    if (!input) return;
    void start
      .mutateAsync(input)
      .then((out) => setRunId(out.runId))
      .catch(() => undefined);
  };

  // Hai cột như hai bước trước (07/10/2026): trái là thiết lập + nút chính, phải là ảnh.
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Panel
          title="Dựng phối cảnh"
          aside={
            state.imageSetArtifactId ? (
              setIsOld ? (
                <Chip tone="am">Theo mặt đứng cũ</Chip>
              ) : (
                <Chip tone="gr">Đã có</Chip>
              )
            ) : (
              <Chip tone="am">Chưa có</Chip>
            )
          }
        >
          {!readOnly &&
            (state.facadeArtifactId || facades.length > 0 || uploadItems.length > 0) && (
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-fg-subtle">Dựng từ mặt đứng</p>
                  <SegmentedControl
                    options={['ai', 'upload']}
                    value={activeSource}
                    onChange={(value) => setSource(value as 'ai' | 'upload')}
                    getLabel={(value) =>
                      value === 'ai' ? 'Ý tưởng mặt đứng của AI' : 'Bản vẽ kỹ sư tải lên'
                    }
                    disabled={running}
                  />
                </div>
                {activeSource === 'ai' && facades.length > 0 && (
                  <>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-xs font-medium text-fg-subtle">
                        Dựng trên mặt bằng
                      </span>
                      <select
                        value={basePlan ?? ''}
                        onChange={(event) => event.target.value && pickPlan(event.target.value)}
                        disabled={running || switching}
                        className={FIELD_BOX}
                      >
                        {!basePlan && (
                          <option value="" disabled>
                            Chọn một phương án
                          </option>
                        )}
                        {[...plans]
                          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                          .map((plan) => (
                            <option key={plan.artifactId} value={plan.artifactId}>
                              {planNames.get(plan.artifactId)}
                              {facades.some((f) => f.planRef === plan.artifactId)
                                ? ''
                                : ' — chưa có mặt đứng'}
                            </option>
                          ))}
                      </select>
                    </label>
                    {facadesOfPlan.length > 0 && (
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs font-medium text-fg-subtle">
                          Dựng trên mặt đứng
                        </span>
                        <select
                          value={baseFacade ?? ''}
                          onChange={(event) => event.target.value && pickFacade(event.target.value)}
                          disabled={running || switching}
                          className={FIELD_BOX}
                        >
                          {!baseFacade && (
                            <option value="" disabled>
                              Chọn một bản mặt đứng
                            </option>
                          )}
                          {[...facadesOfPlan]
                            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                            .map((facade) => (
                              <option key={facade.artifactId} value={facade.artifactId}>
                                {`${facadeNames.get(facade.artifactId) ?? 'Mặt đứng'} — ${formatDateTime(facade.createdAt)}`}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
                {activeSource === 'upload' && uploadItems.length > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-fg-subtle">Bản vẽ</span>
                    <select
                      value={pickedUpload?.uploadId ?? ''}
                      onChange={(event) => setUploadId(event.target.value)}
                      disabled={running}
                      className={FIELD_BOX}
                    >
                      {uploadItems.map((item) => (
                        <option key={item.uploadId} value={item.uploadId}>
                          {`Tải lên ${formatDateTime(item.createdAt)}${item.note ? ` · ${item.note}` : ''}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

          {readOnly && activeSource === 'ai' && basePlan && (
            <p className="mb-3">
              <span className="text-fg-subtle">Dựng trên: </span>
              <b>{planNames.get(basePlan) ?? 'phương án đã chọn'}</b>
              {baseFacade && (
                <>
                  {' · '}
                  <b>{facadeNames.get(baseFacade)}</b>
                </>
              )}
            </p>
          )}
          {sourceError && <p className="mb-3 text-status-overdue">{toUserMessage(sourceError)}</p>}
          {blocked ? (
            <p className="text-fg-subtle">{blocked}</p>
          ) : (
            !readOnly && (
              <div className="space-y-4">
                <AiModePicker
                  kind="image"
                  choice={image.choice}
                  options={image.options}
                  onMode={image.pickMode}
                  onRoute={image.pickRoute}
                  allowSolver={false}
                  disabled={running}
                />

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={people}
                    onChange={(event) => setPeople(event.target.checked)}
                    disabled={running}
                    className="size-4"
                  />
                  <span>Thêm người, ô tô và xe máy vào ảnh</span>
                </label>

                <details className="text-fg-subtle">
                  <summary className="cursor-pointer select-none hover:text-fg">
                    Cách AI dựng phối cảnh
                  </summary>
                  <p className="mt-2">
                    Mô hình ảnh vẽ tấm mặt tiền ban ngày từ chính tờ mặt đứng vector, rồi dựng những
                    góc còn lại từ tấm ấy. Góc nghiêng và góc trên cao nhận thêm tờ mặt bằng mái, vì
                    tờ mặt đứng không nói được nhà sâu bao nhiêu. Nhờ vậy cả bộ là cùng một ngôi
                    nhà. Ảnh chỉ để trình khách — số đo đúng nằm ở tờ mặt bằng và tờ mặt đứng.
                  </p>
                </details>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => (state.imageSetArtifactId ? setAsking(true) : onRun())}
                  disabled={running || start.isPending || switching || !image.choice.route}
                >
                  <Images className="size-4" aria-hidden />
                  {running || start.isPending
                    ? 'Đang dựng…'
                    : state.imageSetArtifactId
                      ? 'Dựng lại cả bộ'
                      : 'Dựng bộ ảnh'}
                </Button>
              </div>
            )
          )}

          {start.isError && (
            <p className="mt-3 text-status-overdue">{toUserMessage(start.error)}</p>
          )}
          {run.data && (
            <div className="mt-3">
              <AiRunProgress
                projectId={projectId}
                run={run.data}
                purposePrefix="perspective_"
                reportTitle="Báo cáo lượt dựng phối cảnh"
                readOnly={readOnly}
                runningLabel="Đang dựng bộ ảnh"
                doneLabel="Đã dựng xong"
                failedLabel="Chưa dựng được bộ ảnh"
              />
            </div>
          )}

          {/* Nút «Dừng lượt chạy» (20/09/2026) nay nằm trong khối tiến độ, dùng chung ba bước. */}
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        {!shown && (
          <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-tk-line2 bg-tk-panel p-8 text-center">
            <div className="max-w-sm">
              <Images className="mx-auto size-10 text-tk-t3" aria-hidden />
              <p className="mt-3 font-medium">
                {running ? 'AI đang dựng bộ ảnh' : 'Chưa có bộ ảnh phối cảnh'}
              </p>
              <p className="mt-1 text-fg-subtle">
                {running
                  ? 'Các góc hiện ở đây ngay khi dựng xong.'
                  : blocked
                    ? 'Cần có mặt đứng trước — xem lý do ở cột bên trái.'
                    : 'Chọn mô hình ảnh ở cột bên trái, rồi bấm «Dựng bộ ảnh».'}
              </p>
            </div>
          </div>
        )}

        {/* Dải các bộ đã dựng — cùng khuôn bước Mặt đứng. Một lượt chạy mới KHÔNG đẩy bộ cũ ra khỏi
          tầm mắt: artifact vốn bất biến nên bộ cũ chưa bao giờ mất. */}
        {versions.length > 1 && (
          <Panel title="Các bộ ảnh đã dựng">
            <ul className="flex flex-wrap gap-2">
              {versions.map((version, index) => {
                const isOpen = version.artifactId === shown;
                const isHead = version.artifactId === state.imageSetArtifactId;
                const name = `Bộ ảnh ${versions.length - index}`;
                return (
                  <li key={version.artifactId} className="flex items-stretch">
                    <button
                      type="button"
                      aria-pressed={isOpen}
                      onClick={() => setOpen(version.artifactId)}
                      className={
                        isOpen
                          ? 'rounded-l-md border border-tk-bl-line bg-tk-bl-bg px-3 py-2 text-left'
                          : 'rounded-l-md border border-tk-line bg-tk-panel px-3 py-2 text-left'
                      }
                    >
                      <span className="block font-medium">{name}</span>
                      <span className="block text-xs text-tk-t3">
                        {formatDateTime(version.createdAt)}
                      </span>
                      {isHead && <Chip tone="gr">Đang hiệu lực</Chip>}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setAskHide({ artifactId: version.artifactId, name })}
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
            {!readOnly && !shownIsHead && shown && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void choose
                      .mutateAsync({ projectId, artifactId: shown })
                      .then(() => setOpen(null))
                      .catch(() => undefined)
                  }
                  disabled={choose.isPending}
                >
                  {choose.isPending ? 'Đang lưu…' : 'Chọn bộ này làm bộ hiệu lực'}
                </Button>
              </div>
            )}
            {choose.isError && (
              <p className="mt-3 text-status-overdue">{toUserMessage(choose.error)}</p>
            )}
          </Panel>
        )}

        {set.isLoading && shown && <Skeleton className="h-96 w-full" />}
        {set.data && (
          <ImageSetPanel
            projectId={projectId}
            set={set.data}
            readOnly={readOnly}
            route={image.choice.route}
            old={setIsOld && shownIsHead}
            onRedraw={(view) => {
              if (!image.choice.route || !shown) return;
              void redraw
                .mutateAsync({ projectId, artifactId: shown, view, route: image.choice.route })
                // Bộ mới là artifact MỚI: mở nó ra thay vì giữ bộ vừa bị thay thế.
                .then((out) => setOpen(out.artifactId))
                .catch(() => undefined);
            }}
            redrawing={redraw.isPending ? (redraw.variables?.view ?? null) : null}
            redrawError={redraw.isError ? toUserMessage(redraw.error) : null}
          />
        )}

        {asking && (
          <ConfirmDialog
            title="Dựng lại cả bộ ảnh phối cảnh?"
            confirmLabel="Dựng lại cả bộ"
            cancelLabel="Thôi"
            className="border-tk-line bg-tk-panel text-tk-tx"
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              setAsking(false);
              onRun();
            }}
          >
            <p>
              Hồ sơ đã có một bộ ảnh, và bộ cũ vẫn giữ lại để so. Dựng lại là một lượt gọi tính tiền
              cho MỖI góc; chỉ một góc chưa ưng thì vẽ lại riêng góc ấy rẻ hơn hẳn. Mô hình ảnh
              không tất định nên bộ mới sẽ khác bộ cũ chứ không đẹp hơn một cách chắc chắn.
            </p>
          </ConfirmDialog>
        )}

        {askHide && (
          <ConfirmDialog
            title={`Xoá ${askHide.name} khỏi danh sách?`}
            confirmLabel="Xoá khỏi danh sách"
            cancelLabel="Thôi"
            className="border-tk-line bg-tk-panel text-tk-tx"
            onCancel={() => setAskHide(null)}
            onConfirm={() => {
              const target = askHide.artifactId;
              setAskHide(null);
              void hide
                .mutateAsync({ projectId, artifactId: target })
                .then(() => setOpen(null))
                .catch(() => undefined);
            }}
          >
            <p>
              Bộ ảnh chỉ thôi hiện trong danh sách, dữ liệu không mất: nhật ký chi phí và những ảnh
              đã tải về vẫn còn.
            </p>
          </ConfirmDialog>
        )}
      </div>
    </div>
  );
}

/** Lưới ảnh của một bộ, cộng danh sách góc thiếu kèm lý do. */
function ImageSetPanel({
  projectId,
  set,
  readOnly,
  route,
  old,
  onRedraw,
  redrawing,
  redrawError,
}: {
  projectId: string;
  set: NonNullable<ReturnType<typeof useAiImageSet>['data']>;
  readOnly: boolean;
  /** Model vẽ ảnh đang chọn ở trên — vẽ lại một góc dùng chính nó. */
  route: string | null;
  /** Bộ này dựng theo một mặt đứng đã bị thay — ảnh nói về ngôi nhà cũ. */
  old: boolean;
  onRedraw: (view: string) => void;
  /** Góc đang vẽ lại, `null` khi không có. */
  redrawing: string | null;
  redrawError: string | null;
}): React.ReactElement {
  return (
    <Panel title="Ảnh trình khách">
      {old && (
        <p className="mb-3 text-tk-am-fg">
          Bộ ảnh này dựng theo một ý tưởng mặt đứng đã bị thay. Vật liệu và màu trên ảnh là của bản
          mặt đứng cũ — dựng lại cả bộ nếu muốn khớp bản đang hiệu lực.
        </p>
      )}
      {redrawError && <p className="mb-3 text-status-overdue">{redrawError}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {set.images.map((image) => (
          <PerspectiveImage
            key={image.view}
            projectId={projectId}
            artifactId={set.artifactId}
            view={image.view}
            label={image.label}
            readOnly={readOnly}
            canRedraw={Boolean(route) && redrawing === null}
            redrawing={redrawing === image.view}
            onRedraw={() => onRedraw(image.view)}
          />
        ))}
      </div>

      {set.missing.length > 0 && (
        <div className="mt-4">
          <p className="font-medium">Góc chưa có ảnh</p>
          <ul className="mt-1 space-y-1">
            {set.missing.map((gap) => (
              <li key={gap.view} className="text-fg-subtle">
                {gap.label} — {gap.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function PerspectiveImage({
  projectId,
  artifactId,
  view,
  label,
  readOnly,
  canRedraw,
  redrawing,
  onRedraw,
}: {
  projectId: string;
  artifactId: string;
  view: string;
  label: string;
  readOnly: boolean;
  canRedraw: boolean;
  redrawing: boolean;
  onRedraw: () => void;
}): React.ReactElement {
  const shown = useAiImageSetView(projectId, artifactId, view);

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        {view === ANCHOR_VIEW && <Chip tone="bl">Tấm gốc của bộ</Chip>}
      </figcaption>
      {(shown.loading || redrawing) && <Skeleton className="h-56 w-full" />}
      {shown.error && <p className="text-status-overdue">{shown.error}</p>}
      {!redrawing && shown.url && (
        <>
          <img
            src={shown.url}
            alt={`Ảnh phối cảnh — ${label}`}
            className="w-full rounded-md border border-tk-line bg-white"
          />
          <div className="flex flex-wrap items-center gap-3">
            <a href={shown.url} download={`phoi-canh-${view}.png`} className="underline">
              Tải ảnh
            </a>
            {!readOnly &&
              // Tấm gốc KHÔNG vẽ lại lẻ được — bốn góc kia dựng theo nó. Nói lý do thay vì ẩn nút
              // đi: ẩn thì người dùng đi tìm, và câu trả lời «vì sao» không nằm ở đâu cả.
              (view === ANCHOR_VIEW ? (
                <span className="text-fg-subtle">Tấm gốc của bộ — đổi nó là dựng lại cả bộ.</span>
              ) : (
                <button
                  type="button"
                  onClick={onRedraw}
                  disabled={!canRedraw}
                  className="underline disabled:opacity-50"
                >
                  Vẽ lại góc này (một lượt gọi)
                </button>
              ))}
          </div>
        </>
      )}
    </figure>
  );
}
