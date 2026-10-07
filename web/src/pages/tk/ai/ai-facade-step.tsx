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

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, Maximize2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/states';
import { formatDateTime } from '@nvg/shared';
import {
  useAiFacade,
  useAiFacadeSheet,
  useAiRun,
  useChooseAiFacade,
  useDownloadAiFacadeDxf,
  useHideAiFacade,
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
import { FacadeBriefForm, useFacadeBriefController } from './ai-facade-brief-form';
import { FacadeImagePanel } from './ai-facade-image';
import { FacadeScorePanel } from './ai-facade-score';
import { SheetSizeControl, sheetWidthStyle, useSheetSize } from './sheet-size';
import { SheetViewer } from './sheet-zoom';

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
  briefLink,
}: {
  projectId: string;
  readOnly: boolean;
  state: AiDesignState;
  /** Lối sang đầu bài của hồ sơ để sửa phiếu mặt đứng — trang ngoài dựng (`tk/ai/` không nhập router). */
  briefLink?: React.ReactNode;
}): React.ReactElement {
  const ai = useAiChoice('text', false);
  const [effort, setEffort] = useState<ReasoningEffort | null>(null);
  const [runId, setRunId] = useState<string | null>(state.runs.facade?.id ?? null);
  const start = useStartAiRun('facade');
  // Phiếu yêu cầu của kỹ sư (Đợt F2) — trạng thái ở đây vì nút chạy phải lưu phiếu trước khi chạy.
  const brief = useFacadeBriefController(projectId);
  const run = useAiRun(runId, 2000);
  // Bản đang MỞ để xem — mặc định là bản hiệu lực. Tách khỏi mốc để kỹ sư mở lại bản cũ mà so mà
  // không phải đổi mốc: đổi mốc là đổi thứ bước Phối cảnh và ảnh mặt đứng đọc.
  const [open, setOpen] = useState<string | null>(null);
  const choose = useChooseAiFacade();
  const hide = useHideAiFacade();
  /** Bản đang chờ xác nhận xoá khỏi dải — `null` = không hỏi gì. */
  const [askHide, setAskHide] = useState<{ artifactId: string; name: string } | null>(null);
  const invalidate = useInvalidateAiDesign();
  const running = run.data?.status === 'queued' || run.data?.status === 'running';

  // Lượt chạy chốt xong thì `/state` đã cũ — nạp lại để mặt đứng mới hiện ra.
  useEffect(() => {
    if (run.data?.status === 'done' || run.data?.status === 'failed') invalidate(projectId);
  }, [run.data?.status, projectId, invalidate]);

  const blocked = !state.planHeadArtifactId;
  const stale = facadeIsStale(state);
  const versions = state.facades ?? [];
  // Mốc thắng khi chưa ai bấm chọn bản nào, và cũng khi bản đang mở vừa bị xoá khỏi dải.
  const shown =
    (open && versions.some((v) => v.artifactId === open) ? open : null) ?? state.facadeArtifactId;
  const shownIsHead = shown === state.facadeArtifactId;
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

  // Hai cột như bước mặt bằng (07/10/2026): trái là phiếu yêu cầu + thiết lập + nút chính, phải là
  // các bản đã dựng và tờ mặt đứng.
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Panel
          title="Dựng mặt đứng"
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
              Chưa chọn phương án mặt bằng. Mở bước «Mặt bằng từng tầng», chọn một phương án rồi
              quay lại đây.
            </p>
          ) : (
            !readOnly && (
              <div className="space-y-4">
                {/* Model và mức suy nghĩ cùng một hàng, hai ô dạng viên (07/10/2026). */}
                <div className="flex items-end gap-2 *:first:min-w-0 *:last:shrink-0">
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
                </div>
                <details className="text-fg-subtle">
                  <summary className="cursor-pointer select-none hover:text-fg">
                    Cách AI dựng mặt đứng
                  </summary>
                  <p className="mt-2">
                    Khung nhà, cao độ các tầng, cửa, cửa sổ và ban công lấy nguyên từ phương án mặt
                    bằng đang chọn — AI không được dời hay thêm bớt. AI chọn mái, vật liệu, màu,
                    cổng, tường rào và các mảng trang trí; chương trình kiểm và dựng tờ mặt đứng. Ý
                    tưởng không dùng được thì AI được gọi lại một lần kèm lý do — lượt ấy cũng tính
                    tiền.
                  </p>
                </details>
                <Button
                  variant="primary"
                  className="w-full"
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
            )
          )}
          {start.isError && (
            <p className="mt-3 text-status-overdue">{toUserMessage(start.error)}</p>
          )}
        </Panel>

        {run.data && (
          <AiRunProgress
            projectId={projectId}
            run={run.data}
            purposePrefix="facade"
            reportTitle="Báo cáo lượt dựng mặt đứng"
            reportExtra={
              failedIssues.length > 0
                ? ['## Ý tưởng chưa dùng được', '', ...failedIssues.map((i) => `- ${i}`)].join('\n')
                : undefined
            }
            onRetry={readOnly ? undefined : () => void onRun()}
            retryDisabled={start.isPending || !ai.choice.route}
            runningLabel="Đang dựng mặt đứng"
            doneLabel={failedIssues.length > 0 ? 'Ý tưởng chưa dùng được' : 'Đã dựng xong'}
            failedLabel="Chưa dựng được mặt đứng"
            readOnly={readOnly}
          />
        )}
        {/* Phiếu yêu cầu mặt đứng là một phần của ĐẦU BÀI hồ sơ — ở đây chỉ xem (Haan, 07/10/2026).
            Sửa ở đầu bài của hồ sơ thiết kế, mục «Mặt đứng». Đứng SAU khung «Dựng mặt đứng»: phiếu
            dài vài màn hình, đặt trước thì nút chính bị đẩy xuống tận đáy cột. */}
        <FacadeBriefForm controller={brief} readOnly />
        {!readOnly && (
          <p className="text-fg-subtle">
            Yêu cầu mặt đứng là một phần của đầu bài, chỉ xem ở đây. {briefLink}
          </p>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        {!shown && (
          <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-tk-line2 bg-tk-panel p-8 text-center">
            <div className="max-w-sm">
              <Building2 className="mx-auto size-10 text-tk-t3" aria-hidden />
              <p className="mt-3 font-medium">
                {running ? 'AI đang dựng mặt đứng' : 'Chưa có mặt đứng'}
              </p>
              <p className="mt-1 text-fg-subtle">
                {running
                  ? 'Tờ mặt đứng hiện ở đây ngay khi dựng xong.'
                  : blocked
                    ? 'Chọn một phương án mặt bằng ở bước trước, rồi quay lại đây.'
                    : 'Xem lại yêu cầu mặt đứng ở cột bên trái (sửa ở đầu bài), rồi bấm «Dựng ý tưởng mặt đứng».'}
              </p>
            </div>
          </div>
        )}

        {/* Dải các bản đã dựng (20/09/2026). Một lượt chạy mới KHÔNG còn đẩy bản cũ ra khỏi tầm mắt:
          artifact vốn bất biến nên bản cũ chưa bao giờ mất, chỉ là màn hình không có đường mở lại. */}
        {versions.length > 1 && (
          <Panel title="Các bản mặt đứng đã dựng">
            <ul className="flex flex-wrap gap-2">
              {versions.map((version, index) => {
                const isOpen = version.artifactId === shown;
                const isHead = version.artifactId === state.facadeArtifactId;
                const name = `Mặt đứng ${versions.length - index}`;
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
            {!readOnly && !shownIsHead && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void choose
                      .mutateAsync({ projectId, artifactId: shown! })
                      .then(() => setOpen(null))
                      .catch(() => undefined)
                  }
                  disabled={choose.isPending}
                >
                  {choose.isPending ? 'Đang lưu…' : 'Chọn bản này làm bản hiệu lực'}
                </Button>
              </div>
            )}
            {choose.isError && (
              <p className="mt-2 text-status-overdue">{toUserMessage(choose.error)}</p>
            )}
            {hide.isError && (
              <p className="mt-2 text-status-overdue">{toUserMessage(hide.error)}</p>
            )}
          </Panel>
        )}

        {askHide && (
          <ConfirmDialog
            title={`Xoá ${askHide.name} khỏi danh sách?`}
            confirmLabel="Xoá khỏi danh sách"
            cancelLabel="Không xoá"
            onCancel={() => setAskHide(null)}
            onConfirm={() => {
              hide.mutate({ projectId, artifactId: askHide.artifactId });
              if (askHide.artifactId === open) setOpen(null);
              setAskHide(null);
            }}
          >
            <p>
              Bản mặt đứng thôi hiện ở đây. Dữ liệu vẫn còn trong hồ sơ, nên tờ vẽ đã tải, ảnh dựng
              từ nó và nhật ký chi phí của lượt gọi vẫn truy được.
            </p>
            {askHide.artifactId === state.facadeArtifactId && (
              <p className="mt-1">
                Đây đang là bản hiệu lực — xoá xong bước Phối cảnh cần chọn lại một bản mặt đứng.
              </p>
            )}
          </ConfirmDialog>
        )}

        {shown && (
          <FacadeDetail
            projectId={projectId}
            artifactId={shown}
            /* Nhãn «phương án mặt bằng cũ» chỉ đo được cho bản HIỆU LỰC: `/state` trả `plan_ref` của
             riêng bản ấy. Bản cũ mở ra để so thì không khẳng định gì về chuyện đó. */
            stale={shownIsHead && stale}
            readOnly={readOnly}
          />
        )}
      </div>
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
  const sheetSize = useSheetSize();
  const [viewing, setViewing] = useState(false);
  const closeViewer = useCallback(() => setViewing(false), []);

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
      {/* Điểm nằm SAU bảng ý tưởng, trước tờ vẽ: đọc bản vẽ khai gì rồi mới đọc con số. Đặt con số
          lên đầu làm nó đọc như lời phán cuối cùng — cùng lý do panel điểm của bước Mặt bằng. */}
      {facade.data?.score && (
        <FacadeScorePanel
          score={facade.data.score}
          review={facade.data.review}
          projectId={projectId}
          artifactId={artifactId}
          readOnly={readOnly}
        />
      )}

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
        {/* Cỡ xem áp cho CẢ tờ vector ở đây lẫn ảnh có vật liệu bên dưới. */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SheetSizeControl />
        </div>
        {sheet.url && (
          <img
            src={sheet.url}
            alt="Tờ mặt đứng mặt tiền"
            style={sheetWidthStyle(sheetSize)}
            onClick={() => setViewing(true)}
            className="w-full cursor-zoom-in rounded-md border border-tk-line bg-white"
          />
        )}
        {sheet.url && (
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-tk-line px-3 hover:bg-tk-hover sm:min-h-8"
          >
            <Maximize2 className="size-4" aria-hidden />
            Xem toàn màn hình
          </button>
        )}
        {viewing && sheet.url && (
          <SheetViewer
            src={sheet.url}
            alt="Tờ mặt đứng mặt tiền"
            title="Tờ mặt đứng mặt tiền"
            onClose={closeViewer}
          />
        )}
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
