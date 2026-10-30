/**
 * Ảnh NỘI THẤT TỪNG PHÒNG vẽ thẳng từ đầu bài, không cần mặt bằng (B3b «bộ ý tưởng cho khách», anh Dũng
 * 30/10/2026) — phần «Nội thất từng phòng» của bước Mặt ngoài.
 *
 * Kiến trúc sư chọn MỘT phòng trong danh sách phòng đầu bài khai → «Vẽ ảnh phòng · ≈ X USD». Ảnh là HÌNH DUNG
 * không gian theo phong cách đầu bài — không đo được, không phải bố trí của một mặt bằng thật; ảnh hiện
 * NGUYÊN BẢN, không in dấu (T154). Khung hai ngăn như hai phần kia: trái thiết lập + nút chính, phải bộ ảnh.
 */

import { useMemo, useState } from 'react';
import { BedDouble, Image as ImageIcon } from 'lucide-react';
import { formatDateTime, formatNumber } from '@nvg/shared';
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
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { AiUsageLine, formatUsd } from './ai-usage';
import { roomImageEstimate } from './room-image-cost';

/** Vẽ quá số tấm này trong một phiên thì hỏi lại — mỗi tấm là một lượt gọi tính tiền. */
const ASK_AGAIN_AFTER = 3;

/** «Phòng ngủ · tầng 2 · khoảng 14,3 m²». */
export function roomTitle(room: Pick<AiBriefRoom, 'label' | 'floor' | 'areaM2'>): string {
  return [
    room.label,
    room.floor !== null ? `tầng ${room.floor}` : null,
    room.areaM2 !== null ? `khoảng ${formatNumber(room.areaM2, 1)} m²` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

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

  const run = () => {
    if (!picked || !image.choice.route) return;
    void draw
      .mutateAsync({ projectId, roomKey: picked.key, route: image.choice.route })
      .then(() => setDrawn((n) => n + 1))
      .catch(() => undefined);
  };
  const busy = draw.isPending;

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
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-fg-subtle">Phòng cần vẽ</span>
              <select
                value={picked?.key ?? ''}
                onChange={(event) => setRoomKey(event.target.value)}
                disabled={busy || readOnly}
                className={FIELD_BOX}
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
                  {busy
                    ? 'Đang vẽ…'
                    : `Vẽ ảnh phòng${estimate && !simulated ? ` · ≈ ${formatUsd(estimate.perImageUsd)}` : ''}`}
                </Button>
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
