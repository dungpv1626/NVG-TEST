/**
 * Phối cảnh tham khảo (TK-16) — hai tầng, cùng một khung hình.
 *
 *  · Tầng 1, luôn có: ảnh KHỐI chụp từ trình xem ba chiều ("Chụp ảnh khối").
 *  · Tầng 2, khi tuyến `layer5_render` bật và có khoá: mô hình sinh ảnh dựng ảnh TỪ chính ảnh
 *    khối đó. Tuyến tắt hay hết hạn mức thì màn hình nói lý do và giữ ảnh khối — AI là phụ trợ,
 *    không chặn luồng chính.
 *
 * Màn hình KHÔNG nêu tên nhà cung cấp: đó là dữ liệu trong config/models.yaml (đã đổi hai lần),
 * còn người dùng thì không quyết định được gì từ cái tên ấy.
 *
 * Ba khung hình — ngày, đêm, góc nghiêng — gọi SONG SONG, mỗi khung một lời gọi. Gộp làm một
 * lời gọi thì người dùng chờ ba lần lâu hơn mới thấy tấm đầu tiên, và một khung hỏng là mất cả
 * ba. Danh sách khung hình lấy từ máy chủ (`kb/render_prompts.yaml`), không viết cứng ở đây.
 *
 * Nhãn "Ảnh tham khảo ý tưởng — chưa phải phương án thi công" được VẼ LÊN ẢNH bằng mã ở đây
 * trước khi hiển thị (canvas), không phải một dòng chữ bên cạnh mà người dùng có thể cắt bỏ khi
 * chụp màn hình. Nhãn lấy từ máy chủ (kb/render_prompts.yaml), không viết cứng ở trình duyệt.
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useRenderFromMassing,
  useRenderViews,
  type RenderOutcome,
  type RenderViewInfo,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { SectionHelp } from '@/components/ui/section-help';
import { DESIGN_HELP } from './help-texts';
import { stampWatermark } from '@/lib/watermark';
import type { MassingShots } from './massing-viewer';

/** Nhãn dự phòng khi chưa gọi máy chủ — cùng chuỗi với kb/render_prompts.yaml. */
const FALLBACK_WATERMARK = 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công';

/** Góc máy dùng cho ô "Ảnh khối" bên trái, và là góc mặc định khi khung hình khai góc lạ. */
const DEFAULT_CAMERA = 'eye_level';

/** Kết quả của một khung hình: ảnh đã đóng dấu, hoặc lý do đọc được. */
interface ViewState {
  image?: string;
  notice?: string;
  pending?: boolean;
}

export function RenderPanel({
  projectId,
  shots,
  style,
  variantLabel,
}: {
  projectId: string;
  /** Ảnh khối theo góc máy, do trình xem ba chiều chụp; rỗng khi chưa chụp. */
  shots: MassingShots | null;
  style: string | null;
  variantLabel: string;
}): React.ReactElement {
  const render = useRenderFromMassing();
  const views = useRenderViews();
  const [massingStamped, setMassingStamped] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ViewState>>({});
  const [error, setError] = useState<string | null>(null);
  const [stampedFor, setStampedFor] = useState<string | null>(null);

  const cover = shots?.[DEFAULT_CAMERA] ?? (shots ? Object.values(shots)[0] : undefined);

  // Ảnh khối vừa chụp: đóng dấu ngay, không chờ máy chủ; kết quả cũ bỏ đi vì nó thuộc góc khác.
  if (cover && stampedFor !== cover) {
    setStampedFor(cover);
    setResults({});
    setError(null);
    void stampWatermark(cover, FALLBACK_WATERMARK).then((out) => setMassingStamped(out.url));
  }

  async function runView(view: RenderViewInfo, image: string) {
    setResults((current) => ({ ...current, [view.id]: { pending: true } }));
    try {
      const outcome: RenderOutcome = await render.mutateAsync({
        projectId,
        image,
        style,
        view: view.id,
      });
      if (outcome.status === 'rendered') {
        const raw = `data:${outcome.mimeType};base64,${outcome.dataBase64}`;
        const stamped = (await stampWatermark(raw, outcome.watermark)).url;
        setResults((current) => ({ ...current, [view.id]: { image: stamped } }));
      } else {
        setResults((current) => ({ ...current, [view.id]: { notice: outcome.reason } }));
      }
    } catch (e) {
      setResults((current) => ({ ...current, [view.id]: { notice: toUserMessage(e) } }));
    }
  }

  async function run() {
    if (!shots) return;
    setError(null);
    const list = views.data ?? [];
    if (list.length === 0) {
      setError('Chưa lấy được danh sách khung hình phối cảnh. Tải lại trang rồi thử lại.');
      return;
    }
    // Song song: ba khung hình độc lập nhau, và tấm nào xong trước thì hiện trước.
    await Promise.all(
      list.map((view) => runView(view, shots[view.camera] ?? shots[DEFAULT_CAMERA] ?? cover!)),
    );
  }

  const busy = Object.values(results).some((r) => r.pending);

  return (
    <section className="rounded border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1 font-medium">
            Phối cảnh tham khảo — {variantLabel}
            <SectionHelp {...DESIGN_HELP.render} />
          </h3>
          <p className="text-fg-subtle">
            Chụp ảnh khối ở mục Khối ba chiều rồi dựng ảnh. Ảnh trả lời câu hỏi thẩm mỹ, không thay
            cho mặt bằng; nhãn cảnh báo in thẳng lên ảnh.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void run()} disabled={!shots || busy}>
          <Sparkles className="size-4" />
          {busy ? 'Đang dựng ảnh…' : 'Dựng ảnh phối cảnh'}
        </Button>
      </div>
      {error && <p className="mt-2 text-status-overdue">{error}</p>}

      {!shots ? (
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
          {(views.data ?? []).map((view) => {
            const state = results[view.id];
            return (
              <figure key={view.id}>
                <figcaption className="mb-1 text-fg-subtle">{view.vi}</figcaption>
                {state?.image ? (
                  <img
                    src={state.image}
                    alt={`Ảnh phối cảnh tham khảo — ${view.vi} — có nhãn cảnh báo`}
                    className="w-full rounded border border-border"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded border border-dashed border-border p-3 text-center text-fg-subtle">
                    {state?.pending ? 'Đang dựng…' : (state?.notice ?? 'Chưa dựng')}
                  </div>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
