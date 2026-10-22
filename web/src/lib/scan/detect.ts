/**
 * Tự tìm mép tờ giấy trong ảnh chụp — gợi ý 4 góc để người dùng chỉ phải kiểm lại.
 *
 * Không dùng thư viện nhận mép (~8 MB, anh Dũng không chọn). Giấy gần như luôn SÁNG hơn mặt bàn,
 * nên: thu nhỏ ảnh → ngưỡng Otsu tách sáng / tối → vùng sáng liền nhau lớn nhất là tờ giấy →
 * 4 góc là 4 điểm cực của vùng đó theo hai đường chéo (min / max của x+y và x−y), đúng với tờ
 * giấy nghiêng tới ~40°. Không chắc chắn (vùng quá nhỏ, chiếm cả ảnh, hoặc hình không giống tứ
 * giác) thì trả `null` — nơi gọi quay về 4 góc mặc định và nói người dùng tự kéo. Chữ và dấu
 * trên giấy là lỗ tối bên trong vùng, không làm vỡ vùng; bóng tay làm tối một nửa trang vẫn
 * sáng hơn mặt bàn tối, nhưng giấy đặt trên bàn trắng thì không tách được — khi đó trả `null`.
 */

import type { Quad } from './perspective';

/** Ngưỡng Otsu trên lược đồ xám. */
function otsu(g: Uint8ClampedArray): number {
  const hist = new Float64Array(256);
  for (const v of g) hist[v]!++;
  const total = g.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Diện tích tứ giác (công thức dây giày). */
function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i]!;
    const n = q[(i + 1) % 4]!;
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Tứ giác lồi, đi cùng một chiều — không bị xoắn / gập. */
function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Tìm 4 góc tờ giấy trong ảnh (nên là ảnh đã thu nhỏ, cạnh dài ~400–600 px). Trả toạ độ theo
 * chính ảnh đầu vào, hoặc `null` khi không chắc.
 */
export function detectPaperQuad(img: ImageData): Quad | null {
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  const g = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = 0.299 * d[p]! + 0.587 * d[p + 1]! + 0.114 * d[p + 2]!;
  }
  const t = otsu(g);

  // Vùng sáng liền nhau lớn nhất (4 láng giềng).
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] !== 0 || g[start]! <= t) continue;
    next++;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    label[start] = next;
    while (top > 0) {
      const i = stack[--top]!;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      const neighbours = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const j of neighbours) {
        if (j >= 0 && label[j] === 0 && g[j]! > t) {
          label[j] = next;
          stack[top++] = j;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = next;
    }
  }
  if (bestSize < 0.15 * n || bestSize > 0.97 * n) return null;

  // Tờ giấy nằm TRONG khung thì vùng sáng chỉ chạm mép ảnh ở vài chỗ. Chạm quá một phần tư chu vi
  // là vùng sáng của cả ảnh (bàn trắng, nửa ảnh được chiếu sáng) — không đoán.
  let onBorder = 0;
  for (let x = 0; x < w; x++) {
    if (label[x] === bestLabel) onBorder++;
    if (label[(h - 1) * w + x] === bestLabel) onBorder++;
  }
  for (let y = 1; y < h - 1; y++) {
    if (label[y * w] === bestLabel) onBorder++;
    if (label[y * w + w - 1] === bestLabel) onBorder++;
  }
  if (onBorder > 0.25 * 2 * (w + h)) return null;

  // Điểm cực theo hai đường chéo.
  let tl = { x: 0, y: 0, v: Infinity };
  let br = { x: 0, y: 0, v: -Infinity };
  let tr = { x: 0, y: 0, v: -Infinity };
  let bl = { x: 0, y: 0, v: Infinity };
  for (let i = 0; i < n; i++) {
    if (label[i] !== bestLabel) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x + y < tl.v) tl = { x, y, v: x + y };
    if (x + y > br.v) br = { x: x + 1, y: y + 1, v: x + y };
    if (x - y > tr.v) tr = { x: x + 1, y, v: x - y };
    if (x - y < bl.v) bl = { x, y: y + 1, v: x - y };
  }
  const quad: Quad = [tl, tr, br, bl].map(({ x, y }) => ({ x, y })) as Quad;
  if (!isConvex(quad)) return null;
  // Vùng sáng phải gần trùng tứ giác — không thì đó không phải một tờ giấy (ví dụ cả khung cửa sổ).
  const area = quadArea(quad);
  if (area < 0.25 * n || bestSize < 0.8 * area) return null;

  // Lùi vào trong ~1 % để không dính viền mặt bàn ở mép giấy.
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  return quad.map((p) => ({ x: p.x + (cx - p.x) * 0.01, y: p.y + (cy - p.y) * 0.01 })) as Quad;
}
