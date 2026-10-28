/**
 * Che thông tin khách trên ảnh phiếu khảo sát giấy TRƯỚC khi gửi máy đọc (anh Dũng 28/10/2026).
 *
 * Phiếu trống in từ `survey-print.ts` dồn mọi thứ mang danh tính (cơ hội, khách hàng, người liên hệ,
 * điện thoại, địa chỉ, người khảo sát, chữ ký hai bên) vào MỘT khung đầu trang, kết thúc bằng một VẠCH
 * ĐEN dày ngang trang (viền in được cả khi tắt «in hình nền»). Ở đây tìm vạch đó trên ảnh trang và tô
 * trắng đặc mọi dòng phía trên nó. Không thấy vạch (phiếu in theo mẫu cũ, ảnh chụp lệch) thì che một
 * phần cố định phía trên trang đầu và nói rõ — người dùng xem ảnh đã che, chỉnh được phần che, rồi
 * mới gửi. Toán thuần trên mảng RGBA để kiểm được không cần trình duyệt.
 */

export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Phần che phía trên trang đầu khi không thấy vạch — đủ phủ khung đầu của mẫu phiếu cũ. */
export const FALLBACK_TOP_FRACTION = 0.45;
/** Đệm dưới vạch, theo chiều cao trang — ảnh nghiêng nhẹ thì đầu thấp của vạch vẫn nằm trong vùng che. */
const BAR_PAD = 0.012;

function dark(img: RgbaImage, x: number, y: number): boolean {
  const i = (y * img.width + x) * 4;
  const l = 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!;
  return l < 110;
}

/**
 * Vị trí (theo tỷ lệ chiều cao, tính tới hết vạch + đệm) của vạch đen đầu tiên ngang trang, hoặc
 * `null`. Một dòng là «dòng vạch» khi ≥ 50 % bề ngang giữa trang tối; vạch phải dày ≥ 0,5 % chiều
 * cao (viền bảng 1 px không tính), bắt đầu dưới 3 % trên cùng (mép tối của ảnh chụp không tính) và
 * nằm trong 70 % phía trên.
 */
export function findCutBar(img: RgbaImage): number | null {
  const { width, height } = img;
  if (width < 20 || height < 20) return null;
  const x0 = Math.floor(width * 0.05);
  const x1 = Math.ceil(width * 0.95);
  const step = Math.max(1, Math.floor(width / 400));
  const minRun = Math.max(3, Math.round(height * 0.005));
  const yStart = Math.ceil(height * 0.03);
  const yEnd = Math.floor(height * 0.7);
  let run = 0;
  for (let y = yStart; y < yEnd; y++) {
    let n = 0;
    let d = 0;
    for (let x = x0; x < x1; x += step) {
      n++;
      if (dark(img, x, y)) d++;
    }
    if (d / n >= 0.5) {
      run++;
      continue;
    }
    if (run >= minRun) return Math.min(1, y / height + BAR_PAD);
    run = 0;
  }
  return null;
}

/** Tô trắng đặc phần trên (`top`) và phần dưới (`bottom`) của ảnh, theo tỷ lệ chiều cao. Sửa tại chỗ. */
export function redactRows(img: RgbaImage, top: number, bottom: number): void {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const topRows = Math.round(clamp(top) * img.height);
  const bottomRows = Math.round(clamp(bottom) * img.height);
  const fill = (from: number, to: number) => {
    for (let y = from; y < to; y++) {
      const start = y * img.width * 4;
      img.data.fill(255, start, start + img.width * 4);
    }
  };
  fill(0, Math.min(img.height, topRows));
  fill(Math.max(0, img.height - bottomRows), img.height);
}

/** Phần che mặc định của một trang: thấy vạch thì tới hết vạch; trang đầu không thấy vạch thì che cố định. */
export function defaultRedaction(
  img: RgbaImage,
  pageIndex: number,
): { top: number; bottom: number; barFound: boolean } {
  const bar = findCutBar(img);
  if (bar !== null) return { top: bar, bottom: 0, barFound: true };
  return { top: pageIndex === 0 ? FALLBACK_TOP_FRACTION : 0, bottom: 0, barFound: false };
}
