/**
 * Đo độ nét ảnh chụp — báo «ảnh mờ, nên chụp lại» ngay lúc chụp.
 *
 * Ảnh rung / lệch nét thì không phần mềm nào phục hồi hết được chữ; cách chắc chắn là phát hiện
 * sớm để chụp lại tại chỗ, khi tờ giấy còn trên bàn (anh Dũng 22/10/2026). Thước đo: phương sai
 * toán tử Laplace trên ảnh xám cỡ cố định — mép chữ sắc cho giá trị lớn, ảnh nhòe cho giá trị
 * nhỏ. Đo ở cỡ cố định để ngưỡng không đổi theo độ phân giải máy ảnh.
 */

/** Cạnh dài của ảnh dùng để đo. */
export const SHARPNESS_SIDE = 1000;

/**
 * Dưới ngưỡng này coi là mờ. Hiệu chỉnh trên 3 trang hợp đồng thật (22/10/2026): ảnh nét
 * 3.400–4.600; nhòe nhẹ còn đọc được 400–1.100; nhòe rõ (rung tay) ~100.
 */
export const BLUR_THRESHOLD = 250;

/** Độ nét của ảnh xám `w × h` (đã thu về cạnh dài ~SHARPNESS_SIDE). */
export function sharpnessOf(gray: Uint8ClampedArray, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Độ nét của một ảnh màu (nên đã thu về cạnh dài ~SHARPNESS_SIDE). Kéo giãn tương phản về cùng
 * thang trước khi đo (phân vị 2 % → 0, 98 % → 255) — ảnh chụp tối / nhạt không bị coi là mờ.
 */
export function sharpnessOfImage(img: ImageData): number {
  const { width: w, height: h, data: d } = img;
  const g = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) {
    const v = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
    g[i] = v;
    hist[g[i]!]!++;
  }
  const at = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= q * g.length) return v;
    }
    return 255;
  };
  const lo = at(0.02);
  const hi = Math.max(lo + 1, at(0.98));
  for (let i = 0; i < g.length; i++) g[i] = ((g[i]! - lo) * 255) / (hi - lo);
  return sharpnessOf(g, w, h);
}

export function isBlurry(score: number): boolean {
  return score < BLUR_THRESHOLD;
}
