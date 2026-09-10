/**
 * In nhãn cảnh báo lên ảnh do AI sinh — ở TRÌNH DUYỆT, bằng canvas.
 *
 * ── Vì sao đóng dấu ở đây chứ không ở máy chủ ──────────────────────────────────────────
 * Quyết định đã ghi trong hợp đồng `contracts/ai-image-set.schema.json` (trường
 * `watermark_applied`, khai `const false`): byte lưu trong kho KHÔNG đóng dấu, vì Worker không
 * có canvas và đóng dấu bằng Container thì phá tính độc lập của nhánh AI (CLAUDE.md 8.5b).
 * Nhãn do mã nguồn chèn, và trình duyệt in lên cả khi XEM lẫn khi TẢI VỀ.
 *
 * ── Vì sao tệp này nằm ở `lib/`, không ở `pages/tk/` ───────────────────────────────────
 * Hàm này vốn nằm trong `pages/tk/render-panel.tsx`. Tệp ấy thuộc BỘ GIẢI và nằm trong danh
 * sách đường dẫn cấm của `workers/src/design/__tests__/ai-independence.test.ts` — màn hình
 * nhánh AI import nó là test đỏ ngay, và đúng ra là thế: ngày dọn bộ giải, `render-panel.tsx`
 * biến mất và kéo theo nhãn cảnh báo của một nhánh chẳng liên quan.
 *
 * ── `stamped` không phải trang trí ────────────────────────────────────────────────────
 * Canvas hỏng được: trình duyệt không giải mã nổi ảnh, môi trường không có ảnh thật, ngữ cảnh
 * 2d không lấy được. Bản cũ im lặng trả về ảnh GỐC trong cả ba trường hợp — tức là một tấm ảnh
 * AI không nhãn, trông y hệt một tấm có nhãn với người gọi. Nay nó nói ra, để chỗ gọi còn dựng
 * lớp bảo vệ thứ hai bằng chữ trong DOM.
 */

export interface StampedImage {
  /** Ảnh để hiển thị và để tải về — đã đóng dấu nếu `stamped`. */
  url: string;
  /** Nhãn đã thật sự in lên pixel hay chưa. `false` thì chỗ gọi PHẢI hiện nhãn bằng chữ. */
  stamped: boolean;
}

/** Quá hạn này mà không có sự kiện nào về thì trả ảnh gốc — không để lời hứa treo mãi. */
const DECODE_TIMEOUT_MS = 1500;

export async function stampWatermark(dataUrl: string, text: string): Promise<StampedImage> {
  return new Promise((resolve) => {
    const img = new Image();
    const guard = window.setTimeout(
      () => resolve({ url: dataUrl, stamped: false }),
      DECODE_TIMEOUT_MS,
    );
    img.onload = () => {
      window.clearTimeout(guard);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ url: dataUrl, stamped: false });
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
      resolve({ url: canvas.toDataURL('image/png'), stamped: true });
    };
    img.onerror = () => {
      window.clearTimeout(guard);
      resolve({ url: dataUrl, stamped: false });
    };
    img.src = dataUrl;
  });
}
