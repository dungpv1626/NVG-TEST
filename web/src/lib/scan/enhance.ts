/**
 * Làm rõ trang đã nắn — ba chế độ của bộ quét.
 *
 *  · «Màu gốc»: giữ nguyên (dấu đỏ, chữ ký xanh vẫn đúng màu).
 *  · «Tài liệu»: chia mỗi kênh màu cho nền giấy quanh nó — xoá bóng tay / bóng đèn và ánh màu
 *    của đèn, nền về trắng, chữ đậm lên, GIỮ MÀU dấu đỏ / chữ ký xanh (căn cứ của bản đã ký).
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
 * Nền giấy theo TỪNG KÊNH MÀU, ở lưới thô: trung bình từng ô → lấy ô sáng nhất trong vùng lân
 * cận (bỏ chữ: giữa các dòng, lề luôn có ô gần như toàn giấy) → làm mượt. Theo từng kênh nên khử
 * được cả ánh màu của đèn (giấy chụp dưới đèn trắng xanh ra xanh — ảnh thật anh Dũng 22/10/2026),
 * không chỉ bóng.
 */
function paperBackground(img: ImageData) {
  const { width: w, height: h, data: d } = img;
  const B = Math.max(6, Math.round(Math.max(w, h) / 100));
  const gw = Math.ceil(w / B);
  const gh = Math.ceil(h / B);
  const mean = new Float32Array(gw * gh * 3);
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let k = 0;
      for (let y = by * B; y < Math.min(h, (by + 1) * B); y += 2)
        for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x += 2) {
          const p = (y * w + x) * 4;
          r += d[p]!;
          g += d[p + 1]!;
          b += d[p + 2]!;
          k++;
        }
      const o = (by * gw + bx) * 3;
      mean[o] = r / k;
      mean[o + 1] = g / k;
      mean[o + 2] = b / k;
    }
  const pass = (src: Float32Array, radius: number, pick: 'max' | 'avg') => {
    const out = new Float32Array(src.length);
    for (let by = 0; by < gh; by++)
      for (let bx = 0; bx < gw; bx++) {
        let best = -1;
        let acc = [0, 0, 0];
        let k = 0;
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const x = bx + dx;
            const y = by + dy;
            if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
            const o = (y * gw + x) * 3;
            if (pick === 'avg') {
              acc = [acc[0]! + src[o]!, acc[1]! + src[o + 1]!, acc[2]! + src[o + 2]!];
              k++;
            } else {
              const lum = src[o]! + src[o + 1]! + src[o + 2]!;
              if (lum > best) {
                best = lum;
                acc = [src[o]!, src[o + 1]!, src[o + 2]!];
              }
            }
          }
        const o = (by * gw + bx) * 3;
        const div = pick === 'avg' ? k : 1;
        out[o] = acc[0]! / div;
        out[o + 1] = acc[1]! / div;
        out[o + 2] = acc[2]! / div;
      }
    return out;
  };
  const bg = pass(pass(mean, 1, 'max'), 1, 'avg');
  /** Nền tại (x, y), nội suy song tuyến giữa tâm các ô. */
  return (x: number, y: number, c: number) => {
    const fx = Math.min(Math.max(x / B - 0.5, 0), gw - 1);
    const fy = Math.min(Math.max(y / B - 0.5, 0), gh - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, gw - 1);
    const y1 = Math.min(y0 + 1, gh - 1);
    const ax = fx - x0;
    const ay = fy - y0;
    const at = (xx: number, yy: number) => bg[(yy * gw + xx) * 3 + c]!;
    return (
      (at(x0, y0) * (1 - ax) + at(x1, y0) * ax) * (1 - ay) +
      (at(x0, y1) * (1 - ax) + at(x1, y1) * ax) * ay
    );
  };
}

/** Nền tối hơn mức này không phải giấy (mặt bàn sót trong khung): không kéo sáng quá mức. */
const BG_FLOOR = 70;
/** Sau khi chia nền: dưới LO thành đen hẳn, trên HI thành trắng hẳn — chữ đậm, giấy trắng như máy scan. */
const LO = 55;
const HI = 215;
/** Sau khi kéo mức: cả ba kênh trên mức này thì coi là giấy. */
const PAPER_WHITE = 185;

/** «Tài liệu»: chia cho nền giấy từng kênh → giấy trắng, mất bóng và ánh màu; giữ màu dấu, chữ ký. */
function whitenBackground(img: ImageData) {
  const { width: w, height: h, data: d } = img;
  const bgAt = paperBackground(img);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = (d[p + c]! * 255) / Math.max(BG_FLOOR, bgAt(x, y, c));
        d[p + c] = ((v - LO) * 255) / (HI - LO);
      }
      // Cả ba kênh đều sáng = giấy còn ám màu (chỗ gập, bóng sắc) → trắng hẳn. Dấu đỏ, mực xanh
      // luôn có một kênh tối nên không bị xoá.
      if (Math.min(d[p]!, d[p + 1]!, d[p + 2]!) > PAPER_WHITE) d[p] = d[p + 1] = d[p + 2] = 255;
      d[p + 3] = 255;
    }
  }
}

/** Áp chế độ lên trang (sửa tại chỗ) và trả lại chính nó. */
export function enhance(img: ImageData, mode: ScanMode): ImageData {
  if (mode === 'color') return img;
  if (mode === 'document') {
    whitenBackground(img);
    return img;
  }
  writeGray(img, adaptiveThreshold(toGray(img), img.width, img.height));
  return img;
}
