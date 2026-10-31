/**
 * Ảnh NỘI THẤT TỪNG PHÒNG vẽ thẳng từ đầu bài, không cần mặt bằng (B3b «bộ ý tưởng cho khách», anh Dũng
 * 30/10/2026) — phần «Nội thất từng phòng» của bước Mặt ngoài.
 *
 * Kiến trúc sư chọn MỘT phòng trong danh sách phòng đầu bài khai → «Vẽ ảnh phòng · ≈ X USD». Ảnh là HÌNH DUNG
 * không gian theo phong cách đầu bài — không đo được, không phải bố trí của một mặt bằng thật; ảnh hiện
 * NGUYÊN BẢN, không in dấu (T154). Khung hai ngăn như hai phần kia: trái thiết lập + nút chính, phải bộ ảnh.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BedDouble, Image as ImageIcon, Images } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FIELD_BOX } from '@/components/ui/field-box';
import { FullscreenFrame } from '@/components/ui/fullscreen-frame';
import { SplitWorkspace } from '@/components/ui/split-workspace';
import { Skeleton } from '@/components/ui/states';
import {
  useAiRoomImageCostHistory,
  useAiRoomImages,
  useAiRoomImageUrl,
  useDrawAiRoomImage,
  type AiBriefRoom,
  type AiRoomImageItem,
  type AiRoomSharedPalette,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { cn } from '@/lib/utils';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { AiUsageLine, formatUsd } from './ai-usage';
import { roomsToDrawAll, roomTitle } from './room-image-batch';
import { roomImageEstimate } from './room-image-cost';

/** Vẽ quá số tấm này trong một phiên thì hỏi lại — mỗi tấm là một lượt gọi tính tiền. */
const ASK_AGAIN_AFTER = 3;

export function AiRoomImageStep({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}): React.ReactElement {
  const data = useAiRoomImages(projectId);
  const image = useAiChoice('image', false, 2, 'room-image');
  const draw = useDrawAiRoomImage();
  const history = useAiRoomImageCostHistory();
  const [roomKey, setRoomKey] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(0);
  const [asking, setAsking] = useState(false);
  /** «Vẽ tất cả phòng chính»: hộp hỏi lại, tiến độ k/N, câu dừng khi một tấm hỏng. */
  const [askingAll, setAskingAll] = useState(false);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rooms = data.data?.rooms ?? [];
  const picked = rooms.find((r) => r.key === roomKey) ?? rooms[0] ?? null;
  const simulated = data.data?.simulated ?? false;
  const estimate = useMemo(
    () =>
      roomImageEstimate(
        history.data ?? [],
        image.choice.route,
        image.selected?.route === image.choice.route ? image.selected?.imageUsd : null,
      ),
    [history.data, image.choice.route, image.selected],
  );

  const toDrawAll = useMemo(
    () => roomsToDrawAll(rooms, data.data?.images ?? []),
    [rooms, data.data?.images],
  );

  /**
   * Vẽ lần lượt từng phòng bằng CHÍNH lời gọi của nút một phòng (cùng trần mỗi lời gọi, cùng sổ
   * `design_ai_call`) — tuần tự, dừng ở tấm hỏng đầu tiên, không tự thử lại (mỗi lần thử là một lượt tính tiền).
   */
  const runAll = async () => {
    const route = image.choice.route;
    if (!route || toDrawAll.length === 0) return;
    const list = toDrawAll;
    setBatchNote(null);
    setBatch({ done: 0, total: list.length });
    let done = 0;
    for (const room of list) {
      if (!alive.current) return;
      try {
        await draw.mutateAsync({ projectId, roomKey: room.key, route });
      } catch (error) {
        if (!alive.current) return;
        setBatchNote(
          `Đã dừng ở ${roomTitle(room)} (tấm ${done + 1}/${list.length}): ${toUserMessage(error)} Đã vẽ xong ${done} tấm; bấm lại để vẽ tiếp các phòng còn thiếu.`,
        );
        setBatch(null);
        return;
      }
      done += 1;
      if (!alive.current) return;
      setDrawn((n) => n + 1);
      setBatch({ done, total: list.length });
    }
    setBatch(null);
    setBatchNote(`Đã vẽ xong ${done} tấm.`);
  };

  const run = () => {
    if (!picked || !image.choice.route) return;
    void draw
      .mutateAsync({ projectId, roomKey: picked.key, route: image.choice.route })
      .then(() => setDrawn((n) => n + 1))
      .catch(() => undefined);
  };
  const busy = draw.isPending || batch !== null;

  const setup = (
    <div className="min-w-0 space-y-4">
      <Panel title="Vẽ ảnh phòng" aside={simulated ? <Chip tone="am">Giả lập</Chip> : undefined}>
        {data.isLoading && <Skeleton className="h-24 w-full" />}
        {data.isError && <p className="text-status-overdue">{toUserMessage(data.error)}</p>}
        {data.data && !data.data.briefArtifactId && (
          <p className="text-fg-subtle">
            Chưa có đầu bài đã xác nhận. Xác nhận đầu bài ở hồ sơ thiết kế rồi quay lại đây.
          </p>
        )}
        {data.data?.briefArtifactId && rooms.length === 0 && (
          <p className="text-fg-subtle">
            Đầu bài chưa khai phòng nào vẽ được ảnh nội thất (phòng khách, bếp, phòng ngủ, phòng
            thờ…). Bổ sung danh sách không gian ở đầu bài rồi quay lại đây.
          </p>
        )}
        {rooms.length > 0 && (
          <div className="space-y-4">
            <p className="text-fg-subtle">
              Dựng từ đầu bài (chưa cần mặt bằng) — phương án ý tưởng. Ảnh hình dung không gian theo
              phong cách và nếp sinh hoạt đã khai, không đo được trên ảnh.
            </p>
            {data.data?.sharedPalette && (
              <SharedPaletteNote
                palette={data.data.sharedPalette}
                withReference={(data.data.referenceRoutes ?? []).includes(image.choice.route ?? '')}
              />
            )}
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-fg-subtle">Phòng cần vẽ</span>
              <select
                value={picked?.key ?? ''}
                onChange={(event) => setRoomKey(event.target.value)}
                disabled={busy || readOnly}
                className={cn(FIELD_BOX, 'w-full max-w-full min-w-0 truncate')}
              >
                {rooms.map((room) => (
                  <option key={room.key} value={room.key}>
                    {roomTitle(room)}
                  </option>
                ))}
              </select>
            </label>
            {!readOnly && (
              <>
                <details className="rounded-field border border-tk-line p-3">
                  <summary className="cursor-pointer text-sm font-medium select-none">
                    Tùy chọn nâng cao
                    <span className="font-normal text-fg-subtle">
                      {' '}
                      · {image.selected?.short ?? image.selected?.label ?? 'model của công ty'}
                    </span>
                  </summary>
                  <div className="mt-3">
                    <AiModePicker
                      kind="image"
                      choice={image.choice}
                      recommended={image.defaultRoute}
                      options={image.options}
                      onMode={image.pickMode}
                      onRoute={image.pickRoute}
                      allowSolver={false}
                      disabled={busy}
                    />
                  </div>
                </details>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => (drawn >= ASK_AGAIN_AFTER ? setAsking(true) : run())}
                  disabled={busy || !picked || !image.choice.route}
                >
                  <ImageIcon className="size-4" aria-hidden />
                  {busy && !batch
                    ? 'Đang vẽ…'
                    : `Vẽ ảnh phòng${estimate && !simulated ? ` · ≈ ${formatUsd(estimate.perImageUsd)}` : ''}`}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setAskingAll(true)}
                  disabled={busy || toDrawAll.length === 0 || !image.choice.route}
                >
                  <Images className="size-4" aria-hidden />
                  {batch
                    ? `Đang vẽ ${batch.done + 1}/${batch.total}`
                    : toDrawAll.length === 0
                      ? 'Vẽ tất cả phòng chính · đã đủ ảnh'
                      : `Vẽ tất cả phòng chính · ${toDrawAll.length} ảnh`}
                </Button>
                {batchNote && (
                  <p
                    className={
                      batchNote.startsWith('Đã dừng') ? 'text-status-overdue' : 'text-fg-subtle'
                    }
                  >
                    {batchNote}
                  </p>
                )}
                <p className="text-sm text-fg-subtle" data-testid="cost-estimate">
                  <span className="font-medium text-fg">Chi phí ước tính: </span>
                  {simulated
                    ? '0 USD — dịch vụ đang chạy giả lập, ảnh là tấm mẫu.'
                    : history.isLoading
                      ? 'đang tính…'
                      : estimate
                        ? estimate.basis === 'history'
                          ? `≈ ${formatUsd(estimate.perImageUsd)} mỗi ảnh — trung bình ${estimate.samples} lượt trước bằng mô hình này, theo giá niêm yết, chưa gồm thuế.`
                          : `≈ ${formatUsd(estimate.perImageUsd)} mỗi ảnh — theo bảng giá niêm yết của mô hình này (chưa có lượt nào để đo).`
                        : 'Chưa đủ dữ liệu — mô hình này chưa khai giá niêm yết và chưa có lượt nào.'}
                </p>
              </>
            )}
          </div>
        )}
        {draw.isError && <p className="mt-3 text-status-overdue">{toUserMessage(draw.error)}</p>}
        <AiUsageLine usage={draw.data?.usage ?? null} className="mt-3" />
      </Panel>
    </div>
  );

  const images = data.data?.images ?? [];
  const gallery = (
    <div className="min-w-0 space-y-4">
      {busy && <Skeleton className="h-72 w-full" />}
      {!busy && images.length === 0 && (
        <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-tk-line2 bg-tk-panel p-8 text-center">
          <div className="max-w-sm">
            <BedDouble className="mx-auto size-10 text-tk-t3" aria-hidden />
            <p className="mt-3 font-medium">Chưa có ảnh phòng</p>
            <p className="mt-1 text-fg-subtle">
              Chọn một phòng ở ngăn «Vẽ ảnh phòng» rồi bấm «Vẽ ảnh phòng».
            </p>
          </div>
        </div>
      )}
      {images.length > 0 && (
        <Panel title="Ảnh phòng đã vẽ">
          <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {images.map((item) => (
              <RoomImageCard
                key={item.artifactId}
                projectId={projectId}
                item={item}
                room={rooms.find((r) => r.key === item.roomKey) ?? null}
              />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );

  return (
    <>
      <FullscreenFrame idleClassName="lg:h-[calc(100dvh-15rem)] lg:min-h-[600px]">
        <SplitWorkspace
          storageKey="ai-noi-that"
          defaultRatio={0.34}
          className="lg:min-h-0 lg:flex-1"
          tabs={[
            { id: 've-anh-phong', label: 'Vẽ ảnh phòng', side: 'left', content: setup },
            { id: 'anh-phong', label: 'Ảnh phòng', side: 'right', content: gallery },
          ]}
        />
      </FullscreenFrame>
      {askingAll && (
        <ConfirmDialog
          title={`Vẽ ${toDrawAll.length} ảnh phòng?`}
          confirmLabel={`Vẽ ${toDrawAll.length} ảnh`}
          cancelLabel="Thôi"
          className="border-tk-line bg-tk-panel text-tk-tx"
          onCancel={() => setAskingAll(false)}
          onConfirm={() => {
            setAskingAll(false);
            void runAll();
          }}
        >
          <p>
            Mỗi phòng chính của đầu bài một tấm:{' '}
            {toDrawAll.map((room) => roomTitle(room)).join('; ')}. Loại phòng lặp lại (WC, ban công,
            sân thượng…) chỉ vẽ một tấm; phòng đã có ảnh thì bỏ qua.
          </p>
          <p className="mt-2 font-medium">
            {simulated
              ? '0 USD — dịch vụ đang chạy giả lập, ảnh là tấm mẫu.'
              : estimate
                ? `≈ ${toDrawAll.length} ảnh × ${formatUsd(estimate.perImageUsd)} ≈ ${formatUsd(estimate.perImageUsd * toDrawAll.length)}`
                : 'Chi phí: chưa đủ dữ liệu để ước tính — mô hình này chưa khai giá niêm yết và chưa có lượt nào.'}
          </p>
          <p className="mt-2">
            Vẽ lần lượt từng tấm; một tấm hỏng thì dừng ngay và báo, không tự thử lại.
          </p>
        </ConfirmDialog>
      )}
      {asking && (
        <ConfirmDialog
          title="Vẽ thêm ảnh phòng?"
          confirmLabel="Vẽ"
          cancelLabel="Thôi"
          className="border-tk-line bg-tk-panel text-tk-tx"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            run();
          }}
        >
          <p>
            Đã vẽ {drawn} tấm trong phiên làm việc. Mỗi tấm là một lượt gọi tính tiền, và mô hình
            ảnh không tất định nên tấm mới sẽ khác tấm cũ chứ không đẹp hơn một cách chắc chắn.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

/**
 * «Dùng chung vật liệu và màu với mặt đứng» (9.18.0, «Cách 3»): bảng suy từ ý tưởng mặt đứng hiện hành, để các
 * phòng trông như cùng một nhà. Màu luôn kèm chữ (không dùng màu làm cách duy nhất).
 */
export function SharedPaletteNote({
  palette,
  withReference,
}: {
  palette: AiRoomSharedPalette;
  withReference: boolean;
}): React.ReactElement {
  return (
    <div
      className="space-y-2 rounded-field border border-tk-line p-3 text-sm"
      data-testid="shared-palette"
    >
      <p className="font-medium">Dùng chung vật liệu và màu với mặt đứng</p>
      {palette.colours.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {palette.colours.map((c) => (
            <li key={c.role} className="inline-flex items-center gap-1.5">
              {c.hex && (
                <span
                  className="inline-block size-3.5 rounded-sm border border-tk-line"
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                />
              )}
              <span>
                {c.roleLabel}: {c.label ?? c.hex}
              </span>
            </li>
          ))}
        </ul>
      )}
      {palette.materials.length > 0 && (
        <p className="text-fg-subtle">Vật liệu: {palette.materials.join(', ')}.</p>
      )}
      {palette.reference && (
        <p className="text-fg-subtle">
          {withReference
            ? `Kèm ảnh «${palette.reference.viewLabel ?? 'Mặt đứng'}» làm mẫu màu và vật liệu.`
            : 'Model đang chọn chỉ nhận chữ — không kèm ảnh mặt ngoài làm mẫu.'}
        </p>
      )}
    </div>
  );
}

function RoomImageCard({
  projectId,
  item,
  room,
}: {
  projectId: string;
  item: AiRoomImageItem;
  room: AiBriefRoom | null;
}): React.ReactElement {
  const shown = useAiRoomImageUrl(projectId, item.artifactId);
  const title = room ? roomTitle(room) : item.roomType;
  return (
    <li className="min-w-0 space-y-2">
      <p className="text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-fg-subtle"> · {formatDateTime(item.createdAt)}</span>
        {item.provider === 'gia_lap' && <span className="text-fg-subtle"> · ảnh mẫu giả lập</span>}
      </p>
      {shown.loading && <Skeleton className="h-56 w-full" />}
      {shown.error && <p className="text-status-overdue">{shown.error}</p>}
      {shown.url && (
        <>
          <img
            src={shown.url}
            alt={`Ảnh nội thất ${title}`}
            className="w-full rounded-md border border-tk-line bg-white"
          />
          <a href={shown.url} download="anh-noi-that.png" className="inline-block underline">
            Tải ảnh
          </a>
        </>
      )}
    </li>
  );
}
