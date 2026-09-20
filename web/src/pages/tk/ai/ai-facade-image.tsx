/**
 * Ảnh MẶT ĐỨNG CÓ VẬT LIỆU do mô hình ảnh vẽ (T59 Đợt E, 20/09/2026).
 *
 * Cùng khuôn với ảnh mặt bằng có nội thất (`ai-plan-sheet-image.tsx`, T57), và cùng ranh giới: tờ mặt
 * đứng vector ở panel TRÊN vẫn là tờ chính — đo được, xuất DXF. Tấm ở đây là tấm TRÌNH KHÁCH, vẽ lại
 * đúng tờ vector ấy (ảnh neo) với vật liệu và màu của ý tưởng đã lưu.
 *
 * Ba thứ màn hình BẮT BUỘC nói ra:
 *  · **Nhãn hai lớp** — in lên pixel (`stampWatermark`) VÀ một dòng chữ trong trang; canvas hỏng thì
 *    dòng chữ là lớp còn lại.
 *  · **Màu và vật liệu là hình dung**, không phải mẫu thật; kích thước không đo được trên ảnh.
 *  · **Giá trước khi bấm**, và hỏi lại khi vẽ lại nhiều lần.
 */

import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/states';
import { useAiFacadeImage, useDrawAiFacadeImage } from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { stampWatermark } from '@/lib/watermark';
import { Chip, Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { AiUsageLine } from './ai-usage';

/** Vẽ lại quá số lần này trong một phiên thì hỏi lại — mỗi lần là một lượt gọi tính tiền. */
const ASK_AGAIN_AFTER = 2;

export function FacadeImagePanel({
  projectId,
  artifactId,
  readOnly,
  stale,
}: {
  projectId: string;
  /** Ý tưởng mặt đứng đang xem. */
  artifactId: string;
  readOnly: boolean;
  /** Mặt đứng dựng theo phương án mặt bằng cũ — vẽ ảnh lúc này là trả tiền cho một ngôi nhà cũ. */
  stale: boolean;
}): React.ReactElement {
  const image = useAiChoice('image', false, 2, 'facade-image');
  const draw = useDrawAiFacadeImage();
  const [reloadKey, setReloadKey] = useState(0);
  const [drawn, setDrawn] = useState(0);
  const [asking, setAsking] = useState(false);
  const shown = useAiFacadeImage(projectId, artifactId, reloadKey);

  const [stamped, setStamped] = useState<{ url: string; stamped: boolean } | null>(null);
  useEffect(() => {
    if (!shown.url) {
      setStamped(null);
      return;
    }
    let cancelled = false;
    const stamp = draw.data?.watermark ?? AI_DISCLAIMERS.aiFacadeImageStamp;
    void stampWatermark(shown.url, stamp).then((result) => {
      if (!cancelled) setStamped(result);
    });
    return () => {
      cancelled = true;
    };
  }, [shown.url, draw.data?.watermark]);

  const run = () => {
    if (!image.choice.route) return;
    void draw
      .mutateAsync({ projectId, artifactId, route: image.choice.route })
      .then(() => {
        setDrawn((n) => n + 1);
        setReloadKey((key) => key + 1);
      })
      .catch(() => undefined);
  };
  const busy = draw.isPending;

  return (
    <Panel
      title="Ảnh mặt đứng có vật liệu"
      aside={<Chip tone="mute">Ảnh trình khách — không thay tờ vẽ</Chip>}
    >
      <p className="mb-3 text-fg-subtle">
        Mô hình ảnh vẽ lại chính tờ mặt đứng ở trên với vật liệu, màu, mái và cổng của ý tưởng đã
        lưu. Tờ vector ở trên vẫn là bản dùng để đo và để xuất DXF.
      </p>
      {stale && (
        <p className="mb-3 text-tk-am-fg">
          Mặt đứng đang dựng theo phương án mặt bằng cũ — dựng lại ý tưởng mặt đứng trước khi vẽ
          ảnh.
        </p>
      )}

      {!readOnly && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <AiModePicker
            kind="image"
            choice={image.choice}
            options={image.options}
            onMode={image.pickMode}
            onRoute={image.pickRoute}
            allowSolver={false}
            disabled={busy}
          />
          <Button
            onClick={() => (drawn >= ASK_AGAIN_AFTER ? setAsking(true) : run())}
            disabled={busy || stale || !image.choice.route}
          >
            <ImageIcon className="size-4" aria-hidden />
            {busy ? 'Đang vẽ…' : shown.url ? 'Vẽ lại ảnh mặt đứng' : 'Vẽ ảnh mặt đứng'}
          </Button>
        </div>
      )}

      {draw.isError && <p className="mb-3 text-status-overdue">{toUserMessage(draw.error)}</p>}
      <AiUsageLine usage={draw.data?.usage ?? null} className="mb-3" />

      {(busy || shown.loading) && <Skeleton className="h-96 w-full" />}
      {!busy && shown.error && <p className="mb-3 text-status-overdue">{shown.error}</p>}
      {!busy && !shown.loading && !shown.error && !shown.url && (
        <p className="text-fg-subtle">
          Chưa có ảnh mặt đứng. Chọn model rồi bấm vẽ — mỗi tấm là một lượt gọi tính tiền.
        </p>
      )}

      {!busy && stamped && (
        <>
          <img
            src={stamped.url}
            alt="Ảnh mặt đứng có vật liệu"
            className="w-full rounded-md border border-tk-line bg-white"
          />
          {/* Lớp nhãn thứ hai, bằng CHỮ — ở lại cả khi canvas hỏng. */}
          <p className="mt-3 text-status-overdue">{AI_DISCLAIMERS.aiFacadeImage}</p>
          {!stamped.stamped && (
            <p className="mt-1 text-status-overdue">
              Trình duyệt không in được nhãn lên ảnh. Tấm này chưa có dấu — đừng gửi đi khi chưa ghi
              rõ đây là ảnh minh hoạ.
            </p>
          )}
          <a
            href={stamped.url}
            download="mat-dung-vat-lieu.png"
            className="mt-3 inline-block underline"
          >
            Tải ảnh có nhãn
          </a>
        </>
      )}

      {asking && (
        <ConfirmDialog
          title="Vẽ lại ảnh mặt đứng?"
          confirmLabel="Vẽ lại"
          cancelLabel="Thôi"
          className="border-tk-line bg-tk-panel text-tk-tx"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            run();
          }}
        >
          <p>
            Đã vẽ {drawn} lần trong phiên làm việc. Mỗi lần vẽ là một lượt gọi tính tiền, và mô hình
            ảnh không tất định nên tấm mới sẽ khác tấm cũ chứ không đẹp hơn một cách chắc chắn.
          </p>
        </ConfirmDialog>
      )}
    </Panel>
  );
}
