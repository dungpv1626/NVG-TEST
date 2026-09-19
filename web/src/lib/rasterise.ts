/**
 * Đổi một tờ SVG thành ảnh PNG — ở TRÌNH DUYỆT, bằng canvas (T57, 19/09/2026).
 *
 * ── Vì sao việc này nằm ở trình duyệt chứ không ở máy chủ ──────────────────────────────
 * Worker không có canvas, và repo không có `resvg`/`sharp`/`satori`. Thêm một bộ rasterise dạng
 * WebAssembly vào Worker là một thay đổi hạ tầng riêng; trong khi trình duyệt thì đã có sẵn tờ
 * SVG dưới dạng blob và đã dựng canvas ở `watermark.ts`.
 *
 * ⚠️ Cái giá của lựa chọn ấy phải nói ra: byte gửi lên máy chủ là byte KHÔNG TIN ĐƯỢC. Máy chủ
 * không có cách chứng minh tấm PNG nhận về đúng là tờ nó vừa phát ra ở `/anchor`. Ba thứ giảm
 * nhẹ nằm ở phía Worker (hạng dữ liệu khai cứng, trần kích thước, băm ảnh ghi vào artifact), và
 * đường thoát thật là rasterise ở máy chủ — chưa làm.
 *
 * ── Hai chỗ khác với trực giác ─────────────────────────────────────────────────────────
 *  · **Cỡ ảnh do máy chủ khai**, truyền vào đây, không đọc từ `naturalWidth`. Một SVG nạp trong
 *    `<img>` cho `naturalWidth` khác nhau tuỳ trình duyệt và tuỳ cách khai `width`, và đoán sai
 *    thì tấm PNG không còn đúng khung chuẩn mà mô hình ảnh nhận.
 *  · **Phông chữ ngoài KHÔNG nạp** bên trong `<img src=blob:…svg>`. Chữ trên ảnh neo rơi về phông
 *    hệ thống, nên tờ trông khác tờ trên màn hình. Không hỏng — dấu tiếng Việt vẫn hiện — nhưng
 *    đừng tưởng là lỗi.
 */

/** Quá hạn này mà ảnh chưa giải mã xong thì bỏ — không để lời hứa treo mãi, cùng `watermark.ts`. */
const DECODE_TIMEOUT_MS = 8000;

export class RasteriseError extends Error {}

/**
 * Tải một SVG rồi vẽ ra PNG, trả về chuỗi base64 KHÔNG có tiền tố `data:`.
 *
 * Không tiền tố vì đó là thứ Worker gửi thẳng cho nhà cung cấp (`GenerateImagePart.dataBase64`);
 * cắt tiền tố ở đây, một lần, thay vì để mỗi chỗ gọi tự nhớ cắt.
 */
export async function svgUrlToPngBase64(
  url: string,
  widthPx: number,
  heightPx: number,
): Promise<string> {
  const image = await decode(url);
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new RasteriseError('Trình duyệt không dựng được ảnh từ tờ mặt bằng.');
  // Nền trắng vẽ trước: canvas mặc định TRONG SUỐT, và một tờ mặt bằng nét đen trên nền trong
  // suốt khi đổi sang PNG sẽ ra đúng thế — nhà cung cấp nhận về một tấm gần như trống.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.drawImage(image, 0, 0, widthPx, heightPx);

  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:image/png') || comma < 0) {
    throw new RasteriseError('Trình duyệt không dựng được ảnh từ tờ mặt bằng.');
  }
  return dataUrl.slice(comma + 1);
}

function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const guard = window.setTimeout(
      () => reject(new RasteriseError('Dựng ảnh từ tờ mặt bằng quá lâu. Thử lại.')),
      DECODE_TIMEOUT_MS,
    );
    image.onload = () => {
      window.clearTimeout(guard);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(guard);
      reject(new RasteriseError('Không đọc được tờ mặt bằng để dựng ảnh.'));
    };
    image.src = url;
  });
}
