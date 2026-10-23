/**
 * Tờ mặt bằng CÓ NỘI THẤT do mô hình ảnh vẽ (T57, 19/09/2026).
 *
 * ── Chỗ này KHÔNG đảo T22, và ranh giới ấy nằm ngay trong bố cục màn hình ──────────────
 * T21 (10/09) đưa tờ do mô hình ảnh vẽ lên làm tờ CHÍNH; T22 (12/09) đảo lại vì một tấm ảnh không
 * bao giờ đo được. Lý do ấy vẫn đúng, nên tờ SVG vector ở panel TRÊN vẫn là tờ chính, vẫn hiện
 * mặc định, vẫn là thứ tải về và xuất DXF. Tấm ở đây là tấm TRÌNH KHÁCH — có đồ đạc, vật liệu,
 * cây cối — và nó đứng DƯỚI, trong một panel riêng, đúng vai trò ấy.
 *
 * Khác T21 ở một điểm kỹ thuật, và đó là lý do việc này được làm lại: lượt vẽ gửi kèm **ảnh neo**
 * — chính tờ vector, rasterise ở trình duyệt. T21 chỉ gửi chữ, nên mô hình vẽ một ngôi nhà khác.
 *
 * ── Ba thứ màn hình BẮT BUỘC phải nói ra ──────────────────────────────────────────────
 *  · **Không in dấu lên ảnh** (Haan, 11/10/2026 — gỡ dấu «Ảnh minh hoạ do AI vẽ — không đo được» mà T117 còn
 *    giữ). Ảnh hiện và tải về đúng như mô hình trả; panel vẫn đứng dưới tờ vector, đúng vai tấm trình khách.
 *  · **Không đo được.** Tờ này in số mét vuông và chuỗi kích thước do MÔ HÌNH viết, nên nó trông
 *    như bản vẽ kỹ thuật mà không phải. Số đúng ở panel trên.
 *  · **Giá trước khi bấm.** Mỗi lần bấm là một lần tiêu tiền thật, và không gì chặn bấm mười lần.
 *
 * ── Tầng vẽ là lựa chọn RIÊNG của panel này (19/09/2026) ───────────────────────────────
 * Panel nhận tầng đang xem ở trên làm giá trị khởi đầu và đi theo nó khi người dùng đổi tab, nhưng
 * có ô chọn tầng riêng: vẽ ảnh cho tầng 2 không bắt buộc phải rời tờ vector tầng 1 đang đọc dở.
 */

import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/states';
import {
  useAiPlanSheetImage,
  useDrawAiPlanSheetImage,
  type AiPlanReview,
} from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Panel } from '../tk-ui';
import { AiModePicker, useAiChoice } from './ai-model-picker';
import { AiUsageLine } from './ai-usage';
import { sheetMaxPx, useSheetSize } from './sheet-size';

/** Vẽ lại quá số lần này cho cùng một tầng thì hỏi lại — mỗi lần là 0,067–0,19 USD. */
const ASK_AGAIN_AFTER = 2;

/**
 * Khung xem đi theo cỡ chọn ở tờ vector bên trên (`sheet-size.tsx`) — trước 20/09/2026 panel này
 * có bộ chọn «Vừa · Cỡ gốc» RIÊNG, nên trên cùng màn hình có hai nút «Vừa» nghĩa khác nhau.
 *
 * Nhưng cỡ ấy còn bị chặn thêm bằng cỡ GỐC của tấm ảnh. Mô hình trả ảnh cỡ 1024–1536 px; khung
 * panel trên màn hình rộng còn rộng hơn thế, nên `w-full` KÉO GIÃN ảnh lên quá cỡ gốc — chữ trên
 * tờ nhoè ra mà không thêm một chi tiết nào. Đó mới là chỗ «nét hơn» đến từ, không phải từ việc
 * thu nhỏ. Tờ vector không cần chặn này: SVG phóng bao nhiêu cũng sắc nét.
 */

export function PlanSheetImagePanel({
  review,
  level,
  projectId,
  readOnly,
  disabled,
  bare = false,
}: {
  review: AiPlanReview;
  /** Tầng đang xem ở panel tờ vector — chỉ là giá trị KHỞI ĐẦU cho ô chọn tầng của panel này. */
  level: number;
  projectId: string;
  readOnly: boolean;
  /** Đang có lượt chạy khác — không cho bấm chồng lên. */
  disabled: boolean;
  /** Nhúng trong khung gộp «Ảnh mặt bằng có nội thất» (07/10/2026): không tự vẽ khung. */
  bare?: boolean;
}): React.ReactElement {
  const image = useAiChoice('image', false, 2, 'plan-sheet');
  const draw = useDrawAiPlanSheetImage();
  /** Đổi để tải lại tờ sau khi vừa vẽ xong. */
  const [reloadKey, setReloadKey] = useState(0);
  /** Số lần đã bấm vẽ trong phiên này, theo tầng — chỉ để biết lúc nào nên hỏi lại. */
  const [drawn, setDrawn] = useState<Record<number, number>>({});
  const [asking, setAsking] = useState(false);

  /** Tầng panel này đang vẽ/xem. Theo tầng ở trên khi người dùng đổi tab, rồi tách ra khi họ chọn. */
  const [picked, setPicked] = useState(level);
  useEffect(() => setPicked(level), [level]);
  const current = review.levels.find((item) => item.level === picked) ?? review.levels[0];
  const drawLevel = current?.level ?? level;
  const levelName = current?.name ?? `Tầng ${drawLevel}`;

  const size = useSheetSize();
  /** Cỡ thật của tấm ảnh, đọc khi trình duyệt giải mã xong — để không bao giờ phóng quá cỡ ấy. */
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  const sheet = useAiPlanSheetImage(projectId, review.artifactId, drawLevel, reloadKey);

  // Ảnh do mô hình ảnh vẽ hiện NGUYÊN BẢN, không in dấu lên pixel (Haan, 11/10/2026 — gỡ dấu T117 giữ lại).
  useEffect(() => {
    if (!sheet.url) setNatural(null);
  }, [sheet.url]);

  const run = () => {
    if (!image.choice.route) return;
    void draw
      .mutateAsync({
        projectId,
        artifactId: review.artifactId,
        level: drawLevel,
        route: image.choice.route,
      })
      .then(() => {
        setDrawn((prev) => ({ ...prev, [drawLevel]: (prev[drawLevel] ?? 0) + 1 }));
        setReloadKey((key) => key + 1);
      })
      .catch(() => undefined);
  };

  const onClick = () => {
    if ((drawn[drawLevel] ?? 0) >= ASK_AGAIN_AFTER) setAsking(true);
    else run();
  };

  const busy = draw.isPending;
  const capPx = sheetMaxPx(size);
  const maxWidth = natural
    ? `${capPx === null ? natural.width : Math.min(natural.width, capPx)}px`
    : capPx === null
      ? undefined
      : `${capPx}px`;

  const body = (
    <>
      {!readOnly && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <AiModePicker
            kind="image"
            choice={image.choice}
            recommended={image.defaultRoute}
            options={image.options}
            onMode={image.pickMode}
            onRoute={image.pickRoute}
            allowSolver={false}
            disabled={busy || disabled}
          />
          {review.levels.length > 1 && (
            <div className="max-w-full overflow-x-auto">
              <p className="mb-1 text-xs font-medium text-fg-subtle">Tầng vẽ</p>
              <SegmentedControl
                options={review.levels.map((item) => String(item.level))}
                value={String(drawLevel)}
                onChange={(value) => setPicked(Number(value))}
                getLabel={(value) =>
                  review.levels.find((item) => String(item.level) === value)?.name ??
                  `Tầng ${value}`
                }
                disabled={busy || disabled}
              />
            </div>
          )}
          <Button onClick={onClick} disabled={busy || disabled || !image.choice.route}>
            <ImageIcon className="size-4" aria-hidden />
            {busy ? 'Đang vẽ…' : `Vẽ ảnh nội thất ${levelName.toLocaleLowerCase('vi-VN')}`}
          </Button>
        </div>
      )}

      {draw.isError && <p className="mb-3 text-status-overdue">{toUserMessage(draw.error)}</p>}

      {/* Tiền của chính lượt vừa bấm. Bảng chi phí của bước mặt bằng (`AiRunUsage`) chỉ cộng
          những dòng nằm trong khoảng thời gian một LƯỢT CHẠY NỀN, mà lượt vẽ này không thuộc lượt
          chạy nào — nên không nói ở đây thì con số không hiện ở đâu cả. */}
      <AiUsageLine usage={draw.data?.usage ?? null} className="mb-3" />

      {(busy || sheet.loading) && <Skeleton className="h-96 w-full" />}

      {/* Lỗi ĐỌC tờ đã vẽ — khác lỗi vẽ ở trên. Phải hiện, vì im lặng ở đây trông y hệt «chưa vẽ»
          và người dùng sẽ bấm vẽ lại, tức trả tiền cho một tấm đã có. */}
      {!busy && sheet.error && <p className="mb-3 text-status-overdue">{sheet.error}</p>}

      {!busy && !sheet.loading && !sheet.error && !sheet.url && (
        <p className="text-fg-subtle">{levelName} chưa có ảnh nội thất.</p>
      )}

      {!busy && sheet.url && (
        <>
          <img
            src={sheet.url}
            alt={`Ảnh mặt bằng có nội thất — ${levelName}`}
            style={{ maxWidth }}
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="w-full rounded-md border border-tk-line bg-white"
          />
          <a
            href={sheet.url}
            download={`mat-bang-noi-that-tang-${drawLevel}.png`}
            className="mt-3 inline-block underline"
          >
            Tải ảnh
          </a>
        </>
      )}

      {asking && (
        <ConfirmDialog
          title={`Vẽ lại ảnh ${levelName.toLocaleLowerCase('vi-VN')}?`}
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
            Đã vẽ {drawn[drawLevel] ?? 0} lần cho tầng này trong phiên làm việc. Mỗi lần vẽ là một
            lượt gọi tính tiền, và mô hình ảnh không tất định nên tấm mới sẽ khác tấm cũ chứ không
            đẹp hơn một cách chắc chắn.
          </p>
        </ConfirmDialog>
      )}
    </>
  );

  return bare ? <div>{body}</div> : <Panel title="Ảnh mặt bằng có nội thất">{body}</Panel>;
}
