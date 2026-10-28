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
 * Tờ giấy chụp gần, tràn ra ngoài khung thì 4 góc là chỗ giấy chạm mép ảnh — phần ngoài khung
 * vốn đã không có trong ảnh.
 */

import { straightMids, type EdgeMids, type Point, type Quad } from './perspective';

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

/** Kết quả tìm giấy, theo toạ độ của chính ảnh đầu vào. */
export interface PaperDetection {
  quad: Quad;
  /** Điểm giữa 4 cạnh — lệch khỏi trung điểm khi thấy rõ mép giấy cong, không thì cạnh thẳng. */
  mids: EdgeMids;
  /**
   * 1 = điểm NGOÀI tờ giấy (mặt bàn): vùng tối, ít màu, thông ra mép ảnh. Tờ giấy tràn khung thì
   * 4 góc không cắt hết được mặt bàn — bộ quét tô trắng các điểm này. Chữ (lọt trong giấy) và dấu
   * đỏ / chữ ký xanh (có màu) không bao giờ thuộc vùng này.
   */
  outside: Uint8Array;
  width: number;
  height: number;
}

/**
 * Tìm 4 góc tờ giấy trong ảnh (nên là ảnh đã thu nhỏ, cạnh dài ~400–600 px). Trả toạ độ theo
 * chính ảnh đầu vào, hoặc `null` khi không chắc.
 */
export function detectPaperQuad(img: ImageData): Quad | null {
  return detectPaper(img)?.quad ?? null;
}

export function detectPaper(img: ImageData): PaperDetection | null {
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
  if (bestSize < 0.15 * n || bestSize > 0.985 * n) return null;

  // Giấy phải sáng HƠN HẲN phần còn lại (mặt bàn). Chỉ chênh nhẹ — giấy trắng trên bàn trắng, hay
  // nửa ảnh được chiếu sáng — thì vùng sáng không phải tờ giấy: không đoán. (Không loại vùng chạm
  // mép ảnh: chụp gần, tờ giấy tràn khung là chuyện thường — anh Dũng 22/10/2026.)
  let darkSum = 0;
  let darkN = 0;
  let lightSum = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] === bestLabel) lightSum += g[i]!;
    else if (g[i]! <= t) {
      darkSum += g[i]!;
      darkN++;
    }
  }
  const light = lightSum / bestSize;
  const dark = darkN ? darkSum / darkN : light;
  // Phần tối chỉ chênh vừa mà lại chiếm nhiều chỗ (nửa ảnh trong bóng) thì không phải mặt bàn.
  // Mặt bàn thật hoặc rất tối, hoặc chỉ là dải hẹp quanh tờ giấy chụp gần.
  if (light - dark < 60 || (dark > 0.6 * light && darkN > 0.25 * n)) return null;

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

  const paper = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null;
    return label[yi * w + xi] === bestLabel;
  };
  const mids = findEdgeMids(quad, paper);

  // Lùi vào trong ~1 % để không dính viền mặt bàn ở mép giấy. Lùi là phép co quanh tâm (affine),
  // nên điểm giữa co theo cùng cách vẫn là điểm giữa của cạnh đã lùi, độ cong giữ tỉ lệ.
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  const shrink = (p: Point): Point => ({
    x: p.x + (cx - p.x) * 0.01,
    y: p.y + (cy - p.y) * 0.01,
  });
  return {
    quad: quad.map(shrink) as Quad,
    mids: mids.map(shrink) as EdgeMids,
    outside: outsideMask(img, g, t),
    width: w,
    height: h,
  };
}

/** Khoảng dò mép quanh trung điểm, theo tỉ lệ chiều dài cạnh — giấy cong hơn mức này thì không bắt. */
export const EDGE_SEARCH_RATIO = 0.12;

/**
 * Điểm giữa thật của 4 cạnh: tại trung điểm mỗi dây cung, dò theo pháp tuyến ±`EDGE_SEARCH_RATIO`
 * chiều dài cạnh, tìm chỗ chuyển từ «ngoài giấy» sang «trong giấy». Chỉ nhận khi mép RÕ: phía ngoài
 * gần hết không phải giấy, phía trong gần hết là giấy, và phía ngoài có đủ điểm nằm trong ảnh. Không
 * rõ (bóng, chữ sát mép, tờ giấy tràn khung — mép nằm ngoài ảnh) thì giữ trung điểm thẳng, không
 * đoán. `paper` trả `null` cho điểm ngoài ảnh.
 */
export function findEdgeMids(
  quad: Quad,
  paper: (x: number, y: number) => boolean | null,
): EdgeMids {
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  return straightMids(quad).map((m, i) => {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // Pháp tuyến hướng RA NGOÀI tờ giấy (ra xa tâm tứ giác).
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * (m.x - cx) + ny * (m.y - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const reach = Math.max(4, Math.round(EDGE_SEARCH_RATIO * len));
    // Mẫu từ ngoài vào trong: k = +reach (ngoài cùng) → −reach (trong cùng), bước 1 điểm ảnh.
    const samples: (boolean | null)[] = [];
    for (let k = reach; k >= -reach; k--) samples.push(paper(m.x + nx * k, m.y + ny * k));
    // Chỗ chuyển e: mẫu [0, e) là phía ngoài, [e, cuối] là phía trong. Chọn e khớp nhất.
    let best = -1;
    let bestScore = -1;
    let outsideKnown = 0;
    const insideTotal = samples.filter((v) => v === true).length;
    let outsideHits = 0;
    let insideHits = insideTotal;
    for (let e = 0; e <= samples.length; e++) {
      const score = outsideHits + insideHits;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
      const v = samples[e];
      if (v === false) outsideHits++;
      if (v === true) insideHits--;
    }
    for (let k = 0; k < best; k++) if (samples[k] !== null) outsideKnown++;
    const known = samples.filter((v) => v !== null).length;
    const insideCount = samples.length - best;
    const clear =
      outsideKnown >= 3 &&
      insideCount >= 3 &&
      bestScore >= 0.92 * known &&
      samples.slice(best).every((v) => v !== null);
    if (!clear) return m;
    // Mẫu thứ e ứng với k = reach − e; mép nằm giữa mẫu ngoài cuối và mẫu trong đầu.
    const offset = reach - best + 0.5;
    // Lệch dưới 1,5 điểm ảnh (ở cỡ dò ~480 px) là nhiễu răng cưa của mặt nạ, không phải cong.
    if (Math.abs(offset) < 1.5) return m;
    return { x: m.x + nx * offset, y: m.y + ny * offset };
  }) as EdgeMids;
}

/** Mặt bàn: điểm tối + ít màu, nối liền ra mép ảnh; nới thêm để mất viền tối ở mép giấy. */
function outsideMask(img: ImageData, g: Uint8ClampedArray, t: number): Uint8Array {
  const { width: w, height: h, data: d } = img;
  const n = w * h;
  const candidate = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const max = Math.max(d[p]!, d[p + 1]!, d[p + 2]!);
    const min = Math.min(d[p]!, d[p + 1]!, d[p + 2]!);
    // Rất tối (vải, bàn sẫm màu) hoặc ít màu thì là mặt bàn. Có màu thì chỉ coi là mặt bàn khi
    // xanh trội (vải jean, bàn xanh — ảnh thật 22/10/2026); dấu đỏ chạm mép ảnh vẫn giữ. Chữ ký
    // mực xanh nằm lọt trong giấy, không thông ra mép ảnh nên không bị tô.
    const blueish = d[p + 2]! >= d[p]! && d[p + 2]! >= d[p + 1]!;
    candidate[i] =
      g[i]! <= t && (max < 90 || blueish || (max - min) / Math.max(1, max) < 0.35) ? 1 : 0;
  }
  const out = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (i: number) => {
    if (candidate[i] && !out[i]) {
      out[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < n - w) seed(i + w);
  }
  // Nới 2 lần một điểm (~8 điểm ảnh ở cỡ trang): bỏ viền tối mờ ở ranh giấy / mặt bàn.
  let grown = out;
  for (let pass = 0; pass < 2; pass++) {
    const src = grown;
    grown = src.slice();
    for (let i = 0; i < n; i++) {
      if (!src[i]) continue;
      const x = i % w;
      if (x > 0) grown[i - 1] = 1;
      if (x < w - 1) grown[i + 1] = 1;
      if (i >= w) grown[i - w] = 1;
      if (i < n - w) grown[i + w] = 1;
    }
  }
  return grown;
}
