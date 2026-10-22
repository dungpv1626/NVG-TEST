/**
 * Làm rõ trang đã nắn — ba chế độ của bộ quét.
 *
 *  · «Màu gốc»: giữ nguyên (dấu đỏ, chữ ký xanh vẫn đúng màu).
 *  · «Tài liệu»: chia mỗi điểm cho độ sáng nền giấy quanh nó — xoá bóng tay / bóng đèn, nền về
 *    trắng, GIỮ MÀU (dấu đỏ, chữ ký xanh vẫn đúng màu — căn cứ của bản đã ký).
 *  · «Đen trắng»: ngưỡng thích nghi theo vùng (Bradley) — chữ rõ cả khi một nửa trang có bóng
 *    tay hay bóng đèn, điều mà một ngưỡng chung cho cả trang không làm được.
 */

export type ScanMode = 'color' | 'document' | 'bw';

export const SCAN_MODE_LABELS: Readonly<Record<ScanMode, string>> = {
  color: 'Màu gốc',
  document: 'Tài liệu',
  bw: 'Đen trắng',
};

function toGray(img: ImageData): Uint8ClampedArray {
  const d = img.data;
  const g = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * d[p]! + 0.587 * d[p + 1]! + 0.114 * d[p + 2]!;
  }
  return g;
}

function writeGray(img: ImageData, g: Uint8ClampedArray) {
  const d = img.data;
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    d[p] = d[p + 1] = d[p + 2] = g[i]!;
    d[p + 3] = 255;
  }
}

/** Bảng tích phân (w+1)×(h+1) của ảnh xám — tổng một ô chữ nhật bất kỳ trong O(1). */
function integralOf(g: Uint8ClampedArray, w: number, h: number): Float64Array {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x]!;
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1]! + row;
    }
  }
  return integral;
}

/** Trung bình xám trong ô vuông cạnh 2·half+1 quanh (x, y). */
function localMean(
  integral: Float64Array,
  w: number,
  h: number,
  x: number,
  y: number,
  half: number,
) {
  const x0 = Math.max(0, x - half);
  const x1 = Math.min(w, x + half + 1);
  const y0 = Math.max(0, y - half);
  const y1 = Math.min(h, y + half + 1);
  const sum =
    integral[y1 * (w + 1) + x1]! -
    integral[y0 * (w + 1) + x1]! -
    integral[y1 * (w + 1) + x0]! +
    integral[y0 * (w + 1) + x0]!;
  return sum / ((x1 - x0) * (y1 - y0));
}

/** Ngưỡng Bradley: điểm tối hơn trung bình vùng quanh nó `t` phần thì là mực. */
function adaptiveThreshold(g: Uint8ClampedArray, w: number, h: number, t = 0.15) {
  const integral = integralOf(g, w, h);
  const half = Math.max(4, Math.round(Math.max(w, h) / 32));
  const out = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mean = localMean(integral, w, h, x, y, half);
      out[y * w + x] = g[y * w + x]! < mean * (1 - t) ? 0 : 255;
    }
  }
  return out;
}

/**
 * Xoá bóng, giữ màu: nền giấy ước bằng trung bình xám vùng rộng (mực thưa nên kéo nền xuống ít);
 * mỗi kênh màu nhân 255 / nền, rồi kéo nhẹ cho nền thật trắng và mực đậm lên.
 */
function whitenBackground(img: ImageData, g: Uint8ClampedArray) {
  const { width: w, height: h, data: d } = img;
  const integral = integralOf(g, w, h);
  const half = Math.max(8, Math.round(Math.max(w, h) / 16));
  const LO = 20;
  const HI = 235;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 255 / Math.max(16, localMean(integral, w, h, x, y, half));
      const p = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        d[p + c] = ((d[p + c]! * k - LO) * 255) / (HI - LO);
      }
      d[p + 3] = 255;
    }
  }
}

/** Áp chế độ lên trang (sửa tại chỗ) và trả lại chính nó. */
export function enhance(img: ImageData, mode: ScanMode): ImageData {
  if (mode === 'color') return img;
  const g = toGray(img);
  if (mode === 'document') {
    whitenBackground(img, g);
    return img;
  }
  writeGray(img, adaptiveThreshold(g, img.width, img.height));
  return img;
}
