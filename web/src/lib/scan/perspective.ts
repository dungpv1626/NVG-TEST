/**
 * Nắn thẳng trang giấy trong ảnh chụp: 4 góc người dùng kéo → một trang chữ nhật khổ A4.
 *
 * Chạy hẳn trên trình duyệt, bằng toán thuần trên `ImageData` (không thư viện nhận mép ~8 MB —
 * anh Dũng chọn «kéo 4 góc bằng tay», 22/10/2026). Ảnh gốc không rời máy.
 *
 * Cách làm: tính ma trận chiếu H biến khung đích (0..W, 0..H) về tứ giác nguồn, rồi với từng
 * điểm ảnh đích lấy mẫu song tuyến ở điểm nguồn tương ứng — ánh xạ ngược nên không có lỗ.
 *
 * Giấy cong (gáy sổ, tờ gấp đôi mở ra): mỗi cạnh có thêm một ĐIỂM GIỮA; cạnh là đường cong bậc
 * hai qua hai góc và điểm giữa đó (anh Dũng đồng ý 28/10/2026). Xem `warpQuad`.
 */

export interface Point {
  x: number;
  y: number;
}

/** Thứ tự cố định: trên-trái, trên-phải, dưới-phải, dưới-trái. */
export type Quad = [Point, Point, Point, Point];

/**
 * Điểm giữa của 4 cạnh, theo thứ tự cạnh trên (góc 0–1), phải (1–2), dưới (2–3), trái (3–0).
 * Điểm giữa nằm đúng trung điểm đoạn thẳng = cạnh thẳng.
 */
export type EdgeMids = [Point, Point, Point, Point];

/** Dưới ngưỡng này (px ảnh nguồn) coi cạnh là thẳng — kéo tay lệch nửa điểm ảnh không phải cong. */
export const STRAIGHT_EDGE_PX = 0.5;

/** Trung điểm đoạn thẳng của từng cạnh — 4 cạnh thẳng. */
export function straightMids(quad: Quad): EdgeMids {
  return quad.map((p, i) => {
    const n = quad[(i + 1) % 4]!;
    return { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 };
  }) as EdgeMids;
}

/** Độ lệch của từng điểm giữa so với trung điểm đoạn thẳng; cạnh gần thẳng ra (0, 0). */
export function edgeBends(quad: Quad, mids: EdgeMids, tolerance = STRAIGHT_EDGE_PX): EdgeMids {
  return straightMids(quad).map((m, i) => {
    const dx = mids[i]!.x - m.x;
    const dy = mids[i]!.y - m.y;
    return Math.hypot(dx, dy) < tolerance ? { x: 0, y: 0 } : { x: dx, y: dy };
  }) as EdgeMids;
}

export function hasBentEdge(quad: Quad, mids: EdgeMids): boolean {
  return edgeBends(quad, mids).some((d) => d.x !== 0 || d.y !== 0);
}

/**
 * Kéo góc xong thì điểm giữa giữ NGUYÊN độ lệch so với trung điểm mới — chỗ cong của tờ giấy
 * không đổi khi chỉ chỉnh lại góc; cạnh đang thẳng thì vẫn thẳng.
 */
export function followCorners(oldQuad: Quad, mids: EdgeMids, newQuad: Quad): EdgeMids {
  const before = straightMids(oldQuad);
  const after = straightMids(newQuad);
  return after.map((m, i) => ({
    x: m.x + mids[i]!.x - before[i]!.x,
    y: m.y + mids[i]!.y - before[i]!.y,
  })) as EdgeMids;
}

/** Điểm điều khiển của đường cong bậc hai đi qua `a`, `b` và qua `mid` tại t = 0,5. */
export function bezierControl(a: Point, b: Point, mid: Point): Point {
  return { x: 2 * mid.x - (a.x + b.x) / 2, y: 2 * mid.y - (a.y + b.y) / 2 };
}

/** Tỉ lệ khổ A4 (cạnh dài / cạnh ngắn). */
export const A4_RATIO = Math.SQRT2;

/** Cạnh dài tối đa của trang đã nắn — ~250 dpi trên khổ A4, gần máy scan (300 dpi). */
export const MAX_PAGE_SIDE = 3000;

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
 * toạ độ nguồn) trả `false` cho điểm ngoài tờ giấy — điểm đó thành trắng. `rotateDeg` xoay trang
 * quanh tâm (cùng quy ước `rotateImage`) NGAY trong lần lấy mẫu này: nắn rồi mới xoay là lấy mẫu
 * hai lần, chữ nhòe thêm một lần (bản quét thật anh Dũng 22/10/2026).
 *
 * `mids` (điểm giữa 4 cạnh) uốn trang theo mép giấy cong, vẫn trong cùng lần lấy mẫu đó. Chọn
 * PHỐI CẢNH + HIỆU CHỈNH CONG thay vì Coons thuần trên 4 đường cong: Coons thuần nội suy song
 * tuyến giữa các cạnh nên bỏ mất phần co theo khoảng cách của phép chiếu — chụp xiên thì dòng
 * chữ phía xa bị kéo giãn, và ngay cả khi 4 cạnh thẳng ảnh cũng không còn như phép cũ. Ở đây
 * điểm nguồn = H(điểm đích) + mặt Coons của ĐỘ LỆCH cạnh: cạnh cong bậc hai lệch khỏi dây cung
 * đúng 4s(1 − s)·δ (δ = điểm giữa − trung điểm dây cung), góc có độ lệch 0 nên phần hiệu chỉnh
 * góc của Coons triệt tiêu. Tham số s trên mỗi cạnh lấy theo phép chiếu (không theo u, v đều),
 * nên dọc cạnh điểm lấy mẫu rơi ĐÚNG lên đường cong mà vẫn giữ phần co phối cảnh. Cạnh thẳng
 * (độ lệch < `STRAIGHT_EDGE_PX`) thì bỏ hẳn bước hiệu chỉnh: kết quả trùng từng điểm ảnh với
 * phép phối cảnh cũ.
 */
export function warpQuad(
  src: ImageData,
  quad: Quad,
  width: number,
  height: number,
  keep?: (x: number, y: number) => boolean,
  rotateDeg = 0,
  mids?: EdgeMids,
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
  const rad = (rotateDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const cx = width / 2;
  const cy = height / 2;
  const bent = mids !== undefined && hasBentEdge(quad, mids);
  const [bTop, bRight, bBottom, bLeft] = edgeBends(quad, bent && mids ? mids : straightMids(quad));
  // Trọng số thuần nhất của phép chiếu ở 4 góc đích: điểm t trên cạnh đích rơi vào tham số
  // s = t·w₁ / ((1 − t)·w₀ + t·w₁) trên dây cung nguồn.
  const wAt = (x: number, y: number) => h[6]! * x + h[7]! * y + h[8]!;
  const w0 = wAt(0, 0);
  const w1 = wAt(width, 0);
  const w2 = wAt(width, height);
  const w3 = wAt(0, height);
  const param = (t: number, wa: number, wb: number) => (t * wb) / ((1 - t) * wa + t * wb);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Lấy mẫu ở tâm điểm ảnh đích; có xoay thì đổi về toạ độ trang chưa xoay trước.
      let tx = x + 0.5;
      let ty = y + 0.5;
      if (rotateDeg) {
        const dx = tx - cx;
        const dy = ty - cy;
        tx = dx * cos + dy * sin + cx;
        ty = -dx * sin + dy * cos + cy;
      }
      const o = (y * width + x) * 4;
      if (rotateDeg && (tx < 0 || ty < 0 || tx > width || ty > height)) {
        d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255;
        continue;
      }
      const p = applyHomography(h, { x: tx, y: ty });
      if (bent) {
        // Mặt Coons của độ lệch: mỗi cạnh góp phần lệch của nó, nhạt dần về cạnh đối diện.
        const u = tx / width;
        const v = ty / height;
        const sT = param(u, w0, w1);
        const sB = param(u, w3, w2);
        const sL = param(v, w0, w3);
        const sR = param(v, w1, w2);
        const kT = 4 * sT * (1 - sT) * (1 - v);
        const kB = 4 * sB * (1 - sB) * v;
        const kL = 4 * sL * (1 - sL) * (1 - u);
        const kR = 4 * sR * (1 - sR) * u;
        p.x += kT * bTop.x + kB * bBottom.x + kL * bLeft.x + kR * bRight.x;
        p.y += kT * bTop.y + kB * bBottom.y + kL * bLeft.y + kR * bRight.y;
      }
      if (keep && !keep(p.x, p.y)) {
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

/**
 * Xoay tứ giác theo ảnh vừa xoay 90° chiều kim đồng hồ (ảnh cũ cao `height`). Dùng được cho cả
 * `EdgeMids`: cạnh trên mới là cạnh trái cũ, cùng quy luật dời chỉ số như góc.
 */
export function rotateQuadClockwise(quad: Quad, height: number): Quad {
  const r = (p: Point): Point => ({ x: height - p.y, y: p.x });
  // Góc trên-trái mới là góc dưới-trái cũ.
  return [r(quad[3]), r(quad[0]), r(quad[1]), r(quad[2])];
}
