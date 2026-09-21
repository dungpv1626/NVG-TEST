/**
 * Bước 3 của tab AI Design — bộ ảnh phối cảnh (T67, 20/09/2026).
 *
 * Năm điều màn hình BẮT BUỘC nói ra, cả năm đều là ràng buộc chứ không phải trang trí:
 *
 *  · **Nhãn hai lớp** — in lên pixel (`stampWatermark`) VÀ một dòng chữ trong trang. Canvas hỏng
 *    thì dòng chữ là lớp còn lại; đây là ảnh đi ra khỏi công ty tới tay khách.
 *  · **Giá trước khi bấm, và bấm một lần là NHIỀU lượt gọi.** Hai bước trước mỗi lần bấm là một
 *    lượt; ở đây một lần bấm dựng cả bộ, nên không được để người dùng suy ra từ thói quen cũ.
 *  · **Vẽ lại MỘT góc chỉ tốn một lượt** — và `front_day` không đi đường ấy được, vì bốn góc kia
 *    dựng theo nó (Đợt C). Nút của tấm gốc phải NÓI LÝ DO, không phải biến mất.
 *  · **Góc thiếu nói rõ lý do.** Hợp đồng cấm lặng lẽ trả về ít ảnh hơn, và màn hình là chỗ lời
 *    cấm ấy có tác dụng.
 *  · **Ảnh không đo được.** Không chấm điểm bộ ảnh như mặt bằng và mặt đứng — không có thước nào
 *    đo được một tấm ảnh, và bịa ra một con số là tệ hơn không có.
 */

import { useEffect, useState } from 'react';
import { Images, Square, X } from 'lucide-react';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/states';
import {
  useAiImageSet,
  useAiImageSetView,
  useAiRun,
  useChooseAiImageSet,
  useHideAiImageSet,
  useCancelAiRun,
  useInvalidateAiDesign,
  useRedrawPerspectiveView,
  useStartPerspectiveRun,
  type AiDesignState,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { stampWatermark } from '@/lib/watermark';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { AiRunProgress } from './ai-run-progress';
import { facadeIsStale, STALE_FACADE } from './ai-facade-step';

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
  const cancel = useCancelAiRun();
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
  // Bộ ảnh dựng theo một mặt đứng KHÁC bản đang hiệu lực: kỹ sư đã dựng lại mặt đứng sau đó.
  const setIsOld = Boolean(
    state.imageSetFacadeRef &&
    state.facadeArtifactId &&
    state.imageSetFacadeRef !== state.facadeArtifactId,
  );
  const blocked = !state.facadeArtifactId
    ? 'Chưa có ý tưởng mặt đứng. Mở bước «2. Mặt đứng», dựng một ý tưởng rồi quay lại đây.'
    : stale
      ? `${STALE_FACADE} Dựng lại mặt đứng theo phương án đang chọn trước khi vẽ phối cảnh.`
      : null;

  const onRun = () => {
    if (!image.choice.route || !state.facadeArtifactId) return;
    void start
      .mutateAsync({
        projectId,
        artifactId: state.facadeArtifactId,
        route: image.choice.route,
        peopleAndVehicles: people,
      })
      .then((out) => setRunId(out.runId))
      .catch(() => undefined);
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Bộ ảnh phối cảnh"
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
        <p className="mb-3 text-fg-subtle">
          Mô hình ảnh vẽ tấm mặt tiền ban ngày từ chính tờ mặt đứng vector, rồi dựng những góc còn
          lại từ tấm ấy. Góc nghiêng và góc trên cao nhận thêm tờ mặt bằng mái, vì tờ mặt đứng không
          nói được nhà sâu bao nhiêu. Nhờ vậy cả bộ là cùng một ngôi nhà. Ảnh chỉ để trình khách —
          số đo đúng nằm ở tờ mặt bằng và tờ mặt đứng.
        </p>

        {blocked ? (
          <p className="text-fg-subtle">{blocked}</p>
        ) : (
          !readOnly && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <AiModePicker
                  kind="image"
                  choice={image.choice}
                  options={image.options}
                  onMode={image.pickMode}
                  onRoute={image.pickRoute}
                  allowSolver={false}
                  disabled={running}
                />
                <Button
                  onClick={() => (state.imageSetArtifactId ? setAsking(true) : onRun())}
                  disabled={running || start.isPending || !image.choice.route}
                >
                  <Images className="size-4" aria-hidden />
                  {running || start.isPending
                    ? 'Đang dựng…'
                    : state.imageSetArtifactId
                      ? 'Dựng lại cả bộ'
                      : 'Dựng bộ ảnh'}
                </Button>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={people}
                  onChange={(event) => setPeople(event.target.checked)}
                  disabled={running}
                  className="size-4"
                />
                <span>
                  Thêm người, ô tô và xe máy vào ảnh
                  <span className="ml-2 text-fg-subtle">
                    Số xe lấy theo đầu bài. Cây cối luôn có, không chịu ô này.
                  </span>
                </span>
              </label>

              {/* Bấm một lần là NHIỀU lượt gọi — hai bước trước mỗi lần bấm là một lượt, nên chỗ
                  khác biệt này phải nói ra chứ không để người dùng suy từ thói quen cũ. */}
              <p className="text-fg-subtle">
                Mỗi góc là một lượt gọi tính tiền, và một lần bấm dựng cả bộ. Chỉ một góc chưa ưng
                thì vẽ lại riêng góc ấy ở dưới — rẻ hơn hẳn.
              </p>
            </div>
          )
        )}

        {start.isError && <p className="mt-3 text-status-overdue">{toUserMessage(start.error)}</p>}
        {run.data && <AiRunProgress run={run.data} />}

        {/* Nút Dừng (20/09/2026, Haan: «cứ chạy mãi… thêm nút stop để phòng những case như này»).
            Hai ca nó gỡ, và ca thứ hai mới là ca hay gặp:
             · lượt đang chạy thật mà kỹ sư đổi ý — máy chủ huỷ lời gọi trong khoảng 2 giây;
             · instance Workflow đã CHẾT mà dòng tiến độ còn kẹt ở «đang chạy» — hay gặp nhất khi
               `wrangler dev` nạp lại giữa chừng. Không có nút này thì thanh chờ quay mãi và lượt
               sau bị chặn bởi chính dòng thây ma ấy. Tuyến huỷ đặt thẳng trạng thái nên nó gỡ
               được cả ca này, không cần instance còn sống. */}
        {running && !readOnly && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                if (!runId) return;
                void cancel
                  .mutateAsync({ runId })
                  .then(() => void run.refetch())
                  .catch(() => undefined);
              }}
              disabled={cancel.isPending}
            >
              <Square className="size-4" aria-hidden />
              {cancel.isPending ? 'Đang dừng…' : 'Dừng lượt chạy'}
            </Button>
            <p className="text-fg-subtle">
              Dừng thì huỷ lời gọi đang chạy và không mở lượt gọi mới. Những góc đã vẽ xong trước đó
              vẫn tính tiền, và bộ ảnh chưa lưu nên chúng không giữ lại được.
            </p>
          </div>
        )}
        {cancel.isError && (
          <p className="mt-3 text-status-overdue">{toUserMessage(cancel.error)}</p>
        )}
      </Panel>

      {/* Dải các bộ đã dựng — cùng khuôn bước Mặt đứng. Một lượt chạy mới KHÔNG đẩy bộ cũ ra khỏi
          tầm mắt: artifact vốn bất biến nên bộ cũ chưa bao giờ mất. */}
      {versions.length > 1 && (
        <Panel title="Các bộ ảnh đã dựng">
          <ul className="flex flex-wrap gap-2">
            {versions.map((version, index) => {
              const isOpen = version.artifactId === shown;
              const isHead = version.artifactId === state.imageSetArtifactId;
              const name = `Bộ ${versions.length - index}`;
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
              <p className="text-fg-subtle">
                Mở một bộ cũ ra xem không đổi bộ hiệu lực. Bấm nút này mới đổi.
              </p>
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
            cho MỖI góc; chỉ một góc chưa ưng thì vẽ lại riêng góc ấy rẻ hơn hẳn. Mô hình ảnh không
            tất định nên bộ mới sẽ khác bộ cũ chứ không đẹp hơn một cách chắc chắn.
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
            Bộ ảnh chỉ thôi hiện trong danh sách, dữ liệu không mất: nhật ký chi phí và những ảnh đã
            tải về vẫn còn.
          </p>
        </ConfirmDialog>
      )}
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
    <Panel
      title="Ảnh trình khách"
      aside={<Chip tone="mute">Ảnh minh hoạ — không thay bản vẽ</Chip>}
    >
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
            watermark={set.watermark}
            readOnly={readOnly}
            canRedraw={Boolean(route) && redrawing === null}
            redrawing={redrawing === image.view}
            onRedraw={() => onRedraw(image.view)}
          />
        ))}
      </div>

      {/* Lớp nhãn thứ hai, bằng CHỮ — ở lại cả khi canvas hỏng. */}
      <p className="mt-4 text-status-overdue">{AI_DISCLAIMERS.aiImageSet}</p>

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
  watermark,
  readOnly,
  canRedraw,
  redrawing,
  onRedraw,
}: {
  projectId: string;
  artifactId: string;
  view: string;
  label: string;
  watermark: string;
  readOnly: boolean;
  canRedraw: boolean;
  redrawing: boolean;
  onRedraw: () => void;
}): React.ReactElement {
  const shown = useAiImageSetView(projectId, artifactId, view);
  const [stamped, setStamped] = useState<{ url: string; stamped: boolean } | null>(null);

  useEffect(() => {
    if (!shown.url) {
      setStamped(null);
      return;
    }
    let cancelled = false;
    void stampWatermark(shown.url, watermark || AI_DISCLAIMERS.aiImageSetStamp).then((result) => {
      if (!cancelled) setStamped(result);
    });
    return () => {
      cancelled = true;
    };
  }, [shown.url, watermark]);

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        {view === ANCHOR_VIEW && <Chip tone="bl">Tấm gốc của bộ</Chip>}
      </figcaption>
      {(shown.loading || redrawing) && <Skeleton className="h-56 w-full" />}
      {shown.error && <p className="text-status-overdue">{shown.error}</p>}
      {!redrawing && stamped && (
        <>
          <img
            src={stamped.url}
            alt={`Ảnh phối cảnh — ${label}`}
            className="w-full rounded-md border border-tk-line bg-white"
          />
          {!stamped.stamped && (
            <p className="text-status-overdue">
              Trình duyệt không in được nhãn lên ảnh. Tấm này chưa có dấu — đừng gửi đi khi chưa ghi
              rõ đây là ảnh minh hoạ.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <a href={stamped.url} download={`phoi-canh-${view}.png`} className="underline">
              Tải ảnh có nhãn
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
