/**
 * Nắn thẳng trang giấy trong ảnh chụp: 4 góc người dùng kéo → một trang chữ nhật khổ A4.
 *
 * Chạy hẳn trên trình duyệt, bằng toán thuần trên `ImageData` (không thư viện nhận mép ~8 MB —
 * anh Dũng chọn «kéo 4 góc bằng tay», 22/10/2026). Ảnh gốc không rời máy.
 *
 * Cách làm: tính ma trận chiếu H biến khung đích (0..W, 0..H) về tứ giác nguồn, rồi với từng
 * điểm ảnh đích lấy mẫu song tuyến ở điểm nguồn tương ứng — ánh xạ ngược nên không có lỗ.
 */

export interface Point {
  x: number;
  y: number;
}

/** Thứ tự cố định: trên-trái, trên-phải, dưới-phải, dưới-trái. */
export type Quad = [Point, Point, Point, Point];

/** Tỉ lệ khổ A4 (cạnh dài / cạnh ngắn). */
export const A4_RATIO = Math.SQRT2;

/** Cạnh dài tối đa của trang đã nắn — đủ đọc chữ ký, dấu; PDF ~300–500 KB mỗi trang. */
export const MAX_PAGE_SIDE = 2000;

/** Tứ giác mặc định: cả ảnh, thụt vào một chút để người dùng thấy rõ 4 góc mà kéo. */
export function defaultQuad(width: number, height: number, inset = 0.04): Quad {
  const dx = width * inset;
  const dy = height * inset;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

/** Giải hệ tuyến tính n×n bằng khử Gauss có chọn trụ. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) throw new Error('Bốn góc thẳng hàng — không nắn được.');
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Ma trận chiếu 3×3 (theo hàng, h33 = 1) biến 4 điểm `from` thành 4 điểm `to`. */
export function homography(from: Quad, to: Quad): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(a, b), 1];
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6]! * p.x + h[7]! * p.y + h[8]!;
  return {
    x: (h[0]! * p.x + h[1]! * p.y + h[2]!) / w,
    y: (h[3]! * p.x + h[4]! * p.y + h[5]!) / w,
  };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Cỡ trang đích: khổ A4, đứng hay ngang theo tứ giác đã kéo; cạnh dài không quá `maxSide` và
 * không phóng to hơn độ phân giải thật của tứ giác (phóng to chỉ làm nặng tệp).
 */
export function pageSize(quad: Quad, maxSide = MAX_PAGE_SIDE): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  const long = Math.min(maxSide, Math.max(w, h));
  const short = long / A4_RATIO;
  return w > h
    ? { width: Math.round(long), height: Math.round(short) }
    : { width: Math.round(short), height: Math.round(long) };
}

/** `ImageData` trống; ngoài trình duyệt (phép thử chạy trên jsdom, không có canvas) dựng đối tượng cùng dạng. */
export function createImageData(width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') return new ImageData(width, height);
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

/**
 * Nắn tứ giác `quad` của ảnh nguồn thành trang `width × height` (lấy mẫu song tuyến). `keep` (theo
 * toạ độ nguồn) trả `false` cho điểm ngoài tờ giấy — điểm đó thành trắng.
 */
export function warpQuad(
  src: ImageData,
  quad: Quad,
  width: number,
  height: number,
  keep?: (x: number, y: number) => boolean,
): ImageData {
  const target: Quad = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const h = homography(target, quad);
  const out = createImageData(width, height);
  const s = src.data;
  const d = out.data;
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Lấy mẫu ở tâm điểm ảnh đích.
      const p = applyHomography(h, { x: x + 0.5, y: y + 0.5 });
      if (keep && !keep(p.x, p.y)) {
        const o = (y * width + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255;
        continue;
      }
      const fx = Math.min(Math.max(p.x - 0.5, 0), sw - 1);
      const fy = Math.min(Math.max(p.y - 0.5, 0), sh - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c]! * (1 - ax) + s[i10 + c]! * ax;
        const bottom = s[i01 + c]! * (1 - ax) + s[i11 + c]! * ax;
        d[o + c] = top * (1 - ay) + bottom * ay;
      }
      d[o + 3] = 255;
    }
  }
  return out;
}

/** Xoay tứ giác theo ảnh vừa xoay 90° chiều kim đồng hồ (ảnh cũ cao `height`). */
export function rotateQuadClockwise(quad: Quad, height: number): Quad {
  const r = (p: Point): Point => ({ x: height - p.y, y: p.x });
  // Góc trên-trái mới là góc dưới-trái cũ.
  return [r(quad[3]), r(quad[0]), r(quad[1]), r(quad[2])];
}
