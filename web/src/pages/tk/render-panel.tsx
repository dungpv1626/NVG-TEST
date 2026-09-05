/**
 * Phối cảnh tham khảo (TK-16) — hai tầng, cùng một khung hình.
 *
 *  · Tầng 1, luôn có: ảnh KHỐI chụp từ trình xem ba chiều ("Chụp ảnh khối").
 *  · Tầng 2, khi tuyến `layer5_render` bật và có khoá trả phí: Gemini dựng ảnh từ chính ảnh
 *    khối đó. Tuyến tắt hay hết hạn mức thì màn hình nói lý do và giữ ảnh khối — AI là phụ trợ,
 *    không chặn luồng chính.
 *
 * Nhãn "Ảnh tham khảo ý tưởng — chưa phải phương án thi công" được VẼ LÊN ẢNH bằng mã ở đây
 * trước khi hiển thị (canvas), không phải một dòng chữ bên cạnh mà người dùng có thể cắt bỏ khi
 * chụp màn hình. Nhãn lấy từ máy chủ (kb/render_prompts.yaml), không viết cứng ở trình duyệt.
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRenderFromMassing, type RenderOutcome } from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';

/** Nhãn dự phòng khi chưa gọi máy chủ — cùng chuỗi với kb/render_prompts.yaml. */
const FALLBACK_WATERMARK = 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công';

/** Vẽ nhãn lên góc dưới ảnh, trả về data URL mới. Không có ngữ cảnh canvas thì trả về ảnh gốc. */
export async function stampWatermark(dataUrl: string, text: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    // Không có sự kiện nào về (trình duyệt không giải mã được, hay môi trường không có ảnh
    // thật) thì trả ảnh gốc sau một nhịp — không để lời hứa treo mãi.
    const guard = window.setTimeout(() => resolve(dataUrl), 1500);
    img.onload = () => {
      window.clearTimeout(guard);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const size = Math.max(14, Math.round(canvas.width / 48));
      ctx.font = `600 ${size}px "Be Vietnam Pro", Inter, Arial, sans-serif`;
      const pad = Math.round(size * 0.6);
      const width = ctx.measureText(text).width + pad * 2;
      ctx.fillStyle = 'rgba(23, 43, 77, 0.78)';
      ctx.fillRect(0, canvas.height - size - pad * 2, width, size + pad * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, pad, canvas.height - (size + pad * 2) / 2);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      window.clearTimeout(guard);
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

export function RenderPanel({
  projectId,
  snapshot,
  style,
  variantLabel,
}: {
  projectId: string;
  /** Ảnh khối (data URL PNG) do trình xem ba chiều chụp; rỗng khi chưa chụp. */
  snapshot: string | null;
  style: string | null;
  variantLabel: string;
}): React.ReactElement {
  const render = useRenderFromMassing();
  const [massingStamped, setMassingStamped] = useState<string | null>(null);
  const [rendered, setRendered] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stampedFor, setStampedFor] = useState<string | null>(null);

  // Ảnh khối vừa chụp: đóng dấu ngay, không chờ máy chủ.
  if (snapshot && stampedFor !== snapshot) {
    setStampedFor(snapshot);
    setRendered(null);
    setNotice(null);
    void stampWatermark(snapshot, FALLBACK_WATERMARK).then(setMassingStamped);
  }

  async function run() {
    if (!snapshot) return;
    setError(null);
    setNotice(null);
    try {
      const outcome: RenderOutcome = await render.mutateAsync({
        projectId,
        image: snapshot,
        style,
      });
      if (outcome.status === 'rendered') {
        const raw = `data:${outcome.mimeType};base64,${outcome.dataBase64}`;
        setRendered(await stampWatermark(raw, outcome.watermark));
      } else {
        setRendered(null);
        setNotice(outcome.reason);
      }
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  return (
    <section className="rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Phối cảnh tham khảo — {variantLabel}</h3>
          <p className="text-fg-subtle">
            Chụp ảnh khối ở mục Khối ba chiều rồi dựng ảnh. Ảnh trả lời câu hỏi thẩm mỹ, không thay
            cho mặt bằng; nhãn cảnh báo in thẳng lên ảnh.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void run()}
          disabled={!snapshot || render.isPending}
        >
          <Sparkles className="size-4" />
          {render.isPending ? 'Đang dựng ảnh…' : 'Dựng ảnh phối cảnh'}
        </Button>
      </div>
      {error && <p className="mt-2 text-status-overdue">{error}</p>}
      {notice && <p className="mt-2 text-status-pending">{notice}</p>}

      {!snapshot ? (
        <p className="mt-3 rounded border border-border bg-surface-sunken p-4 text-fg-subtle">
          Chưa có ảnh khối. Xoay khối ba chiều tới góc nhìn muốn dựng rồi bấm "Chụp ảnh khối".
        </p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <figure>
            <figcaption className="mb-1 text-fg-subtle">Ảnh khối (luôn có)</figcaption>
            {massingStamped ? (
              <img
                src={massingStamped}
                alt="Ảnh khối sơ bộ có nhãn cảnh báo"
                className="w-full rounded border border-border"
              />
            ) : (
              <div className="aspect-video animate-pulse rounded bg-surface-sunken" aria-hidden />
            )}
          </figure>
          <figure>
            <figcaption className="mb-1 text-fg-subtle">Ảnh phối cảnh (Gemini)</figcaption>
            {rendered ? (
              <img
                src={rendered}
                alt="Ảnh phối cảnh tham khảo có nhãn cảnh báo"
                className="w-full rounded border border-border"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded border border-dashed border-border text-fg-subtle">
                {render.isPending ? 'Đang dựng…' : 'Chưa dựng'}
              </div>
            )}
          </figure>
        </div>
      )}
    </section>
  );
}
