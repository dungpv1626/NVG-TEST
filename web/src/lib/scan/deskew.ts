/**
 * Xoay thẳng trang theo DÒNG CHỮ — bước cuối để bản quét ra như máy scan.
 *
 * Tờ giấy chụp gần, tràn khung (thường gặp — ảnh thật anh Dũng 22/10/2026) thì máy không thấy mép
 * giấy để nắn, chữ còn nghiêng vài độ: nhìn là biết ảnh chụp. Cách đo: thử các góc nhỏ, chiếu các
 * điểm mực lên trục dọc theo từng góc; góc mà các dòng chữ nằm ngang thì lược đồ chiếu có đỉnh /
 * khe rõ nhất (phương sai lớn nhất). Trang không có chữ hoặc không rõ hơn góc 0 đủ nhiều thì giữ
 * nguyên — không xoay bừa.
 */

/** Dải góc thử (độ) và bước — ảnh chụp tay hiếm khi lệch quá 10°. */
const MAX_ANGLE = 10;
const STEP = 0.25;
/** Cạnh dài của ảnh dùng để đo — đo nhanh, góc đủ chính xác. */
const MEASURE_SIDE = 700;

function inkPoints(img: ImageData): { xs: Float32Array; ys: Float32Array; w: number; h: number } {
  const k = Math.min(1, MEASURE_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const xs: number[] = [];
  const ys: number[] = [];
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / k));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / k));
      const p = (sy * img.width + sx) * 4;
      const lum = 0.299 * d[p]! + 0.587 * d[p + 1]! + 0.114 * d[p + 2]!;
      if (lum < 110) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), w, h };
}

function profileScore(xs: Float32Array, ys: Float32Array, w: number, h: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const bins = new Float32Array(h * 2);
  const cx = w / 2;
  const cy = h / 2;
  for (let i = 0; i < xs.length; i++) {
    const y = -(xs[i]! - cx) * sin + (ys[i]! - cy) * cos + h;
    const b = Math.floor(y);
    if (b >= 0 && b < bins.length) bins[b]!++;
  }
  let sumSq = 0;
  for (const v of bins) sumSq += v * v;
  return sumSq;
}

/**
 * Góc nghiêng của dòng chữ (độ, dương = chữ dốc xuống bên phải); 0 khi không chắc. Xoay trang
 * NGƯỢC góc này (`rotateImage(img, -angle)`) thì chữ nằm ngang.
 */
export function deskewAngle(img: ImageData): number {
  const { xs, ys, w, h } = inkPoints(img);
  // Quá ít mực (trang trắng, chỉ một chữ ký) hoặc quá nhiều (ảnh tối) — không đo.
  const share = xs.length / (w * h);
  if (share < 0.005 || share > 0.35) return 0;
  const base = profileScore(xs, ys, w, h, 0);
  let best = 0;
  let bestScore = base;
  for (let deg = -MAX_ANGLE; deg <= MAX_ANGLE + 1e-9; deg += STEP) {
    const s = profileScore(xs, ys, w, h, deg);
    if (s > bestScore) {
      bestScore = s;
      best = deg;
    }
  }
  // Phải rõ hơn hẳn góc 0, và đủ lệch để đáng xoay.
  if (Math.abs(best) < 0.4 || bestScore < base * 1.1) return 0;
  return Math.round(best * 100) / 100;
}

/** Xoay ảnh quanh tâm `deg` độ (dương = chiều kim đồng hồ), giữ cỡ, phần trống tô trắng. */
export function rotateImage(
  img: ImageData,
  deg: number,
  create: (w: number, h: number) => ImageData,
) {
  const { width: w, height: h, data: s } = img;
  const out = create(w, h);
  const d = out.data;
  const rad = (deg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Ánh xạ ngược: điểm đích (x, y) lấy từ điểm nguồn xoay −deg.
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const fx = dx * cos + dy * sin + cx - 0.5;
      const fy = -dx * sin + dy * cos + cy - 0.5;
      const o = (y * w + x) * 4;
      if (fx < 0 || fy < 0 || fx > w - 1 || fy > h - 1) {
        d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const ax = fx - x0;
      const ay = fy - y0;
      for (let c = 0; c < 3; c++) {
        const top = s[(y0 * w + x0) * 4 + c]! * (1 - ax) + s[(y0 * w + x1) * 4 + c]! * ax;
        const bot = s[(y1 * w + x0) * 4 + c]! * (1 - ax) + s[(y1 * w + x1) * 4 + c]! * ax;
        d[o + c] = top * (1 - ay) + bot * ay;
      }
      d[o + 3] = 255;
    }
  }
  return out;
}
