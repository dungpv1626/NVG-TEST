import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { A4_POINTS, buildPdf } from '../build-pdf';
import { detectPaper, detectPaperQuad } from '../detect';
import { enhance } from '../enhance';
import {
  applyHomography,
  createImageData,
  defaultQuad,
  homography,
  pageSize,
  rotateQuadClockwise,
  warpQuad,
  type Quad,
} from '../perspective';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('nắn thẳng trang giấy', () => {
  it('ma trận chiếu biến đúng 4 góc nguồn về 4 góc đích', () => {
    const from: Quad = [
      { x: 30, y: 20 },
      { x: 410, y: 60 },
      { x: 380, y: 590 },
      { x: 10, y: 540 },
    ];
    const to: Quad = [
      { x: 0, y: 0 },
      { x: 595, y: 0 },
      { x: 595, y: 842 },
      { x: 0, y: 842 },
    ];
    const h = homography(from, to);
    from.forEach((p, i) => {
      const q = applyHomography(h, p);
      close(q.x, to[i]!.x);
      close(q.y, to[i]!.y);
    });
  });

  it('bốn góc thẳng hàng thì báo lỗi, không ra trang méo', () => {
    const line: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => homography(line, defaultQuad(10, 10, 0))).toThrow();
  });

  it('cỡ trang theo khổ A4, đứng hay ngang theo tứ giác, không vượt cạnh tối đa', () => {
    const portrait = pageSize(defaultQuad(3000, 4000, 0));
    expect(portrait.height).toBe(2000);
    expect(Math.abs(portrait.height / portrait.width - Math.SQRT2)).toBeLessThan(0.01);
    const landscape = pageSize(defaultQuad(800, 500, 0));
    expect(landscape.width).toBe(800);
    expect(landscape.width).toBeGreaterThan(landscape.height);
  });

  it('nắn một ô sáng nằm lệch trong ảnh thành cả trang sáng', () => {
    const src = createImageData(100, 100);
    // Ô trắng (40..80, 30..90) trên nền đen.
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) {
        const v = x >= 40 && x < 80 && y >= 30 && y < 90 ? 255 : 0;
        const i = (y * 100 + x) * 4;
        src.data[i] = src.data[i + 1] = src.data[i + 2] = v;
        src.data[i + 3] = 255;
      }
    const quad: Quad = [
      { x: 41, y: 31 },
      { x: 79, y: 31 },
      { x: 79, y: 89 },
      { x: 41, y: 89 },
    ];
    const out = warpQuad(src, quad, 20, 28);
    const lum = Array.from({ length: 20 * 28 }, (_, i) => out.data[i * 4]!);
    expect(Math.min(...lum)).toBeGreaterThan(200);
  });

  it('xoay tứ giác cùng ảnh 90° vẫn giữ đúng thứ tự góc', () => {
    const q = rotateQuadClockwise(defaultQuad(200, 100, 0), 100);
    expect(q[0]).toEqual({ x: 0, y: 0 });
    expect(q[1]).toEqual({ x: 100, y: 0 });
    expect(q[2]).toEqual({ x: 100, y: 200 });
  });
});

describe('làm rõ chữ', () => {
  it('«Đen trắng» tách được chữ khỏi nền dù nửa trang có bóng', () => {
    const w = 200;
    const h = 100;
    const img = createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const paper = x < 100 ? 230 : 120; // nửa phải bị bóng
        const ink = (x % 50 >= 20 && x % 50 < 24) || (y >= 48 && y < 52);
        const v = ink ? paper - 90 : paper;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    enhance(img, 'bw');
    const at = (x: number, y: number) => img.data[(y * w + x) * 4]!;
    expect(at(10, 10)).toBe(255); // giấy sáng
    expect(at(160, 10)).toBe(255); // giấy trong bóng vẫn trắng
    expect(at(21, 10)).toBe(0); // chữ ở chỗ sáng
    expect(at(171, 10)).toBe(0); // chữ ở chỗ bóng
  });

  it('«Tài liệu» xoá bóng, nền giấy về trắng, giữ màu dấu đỏ', () => {
    const w = 200;
    const h = 100;
    const img = createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = x < 100 ? 1 : 0.55; // nửa phải bị bóng
        const i = (y * w + x) * 4;
        const ink = x % 50 >= 20 && x % 50 < 24;
        const stamp = x >= 60 && x < 64 && y >= 60 && y < 64;
        const [r, g, b] = stamp ? [200, 40, 40] : ink ? [50, 50, 50] : [225, 220, 210];
        img.data[i] = r * k;
        img.data[i + 1] = g * k;
        img.data[i + 2] = b * k;
        img.data[i + 3] = 255;
      }
    enhance(img, 'document');
    const px = (x: number, y: number) =>
      Array.from(img.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
    expect(Math.min(...px(10, 10))).toBeGreaterThan(240); // giấy sáng
    expect(Math.min(...px(160, 10))).toBeGreaterThan(240); // giấy trong bóng cũng trắng
    expect(Math.max(...px(171, 10))).toBeLessThan(90); // chữ trong bóng vẫn đậm
    const [r, g, b] = px(61, 61);
    expect(r).toBeGreaterThan(g! + 100); // dấu vẫn đỏ
    expect(r).toBeGreaterThan(b! + 100);
  });
});

describe('ghép PDF', () => {
  it('ra đúng số trang, khổ A4, trộn được ảnh với PDF có sẵn', async () => {
    // JPEG 1×1 hợp lệ.
    const jpeg = Uint8Array.from(
      atob(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      ),
      (c) => c.charCodeAt(0),
    );
    const existing = await PDFDocument.create();
    existing.addPage([200, 300]);
    const bytes = await buildPdf([
      { kind: 'image', jpeg, width: 1414, height: 2000 },
      { kind: 'pdf', bytes: await existing.save() },
      { kind: 'image', jpeg, width: 2000, height: 1414 },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const [p1, p2, p3] = doc.getPages();
    expect(p1!.getSize()).toEqual({ width: A4_POINTS.short, height: A4_POINTS.long });
    expect(p2!.getSize()).toEqual({ width: 200, height: 300 });
    expect(p3!.getSize()).toEqual({ width: A4_POINTS.long, height: A4_POINTS.short });
  });
});

describe('tự tìm mép giấy', () => {
  /** Ảnh w×h: nền `bg`, tờ giấy tứ giác `paper` màu `fg`, nửa phải bị bóng, có vài dòng chữ. */
  function photo(w: number, h: number, paper: Quad, fg: number, bg: number) {
    const img = createImageData(w, h);
    const inside = (x: number, y: number) => {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = paper[i]!;
        const b = paper[(i + 1) % 4]!;
        const s = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
        if (s === 0) continue;
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
      }
      return true;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const shade = x > w / 2 ? 0.7 : 1;
        const text = y % 20 < 3 && x % 7 < 5;
        const v = inside(x + 0.5, y + 0.5) ? (text ? 40 : fg) * shade : bg * shade;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    return img;
  }

  it('tờ giấy nghiêng, có chữ, nửa bị bóng trên bàn tối → ra đúng 4 góc (sai ≤ 3 % cạnh ảnh)', () => {
    const paper: Quad = [
      { x: 90, y: 50 },
      { x: 330, y: 80 },
      { x: 300, y: 420 },
      { x: 50, y: 380 },
    ];
    const q = detectPaperQuad(photo(400, 480, paper, 235, 70));
    expect(q).not.toBeNull();
    q!.forEach((p, i) => {
      expect(Math.hypot(p.x - paper[i]!.x, p.y - paper[i]!.y)).toBeLessThan(0.03 * 480);
    });
  });

  it('giấy trắng trên bàn trắng (không tách được) → không đoán bừa', () => {
    const paper: Quad = [
      { x: 90, y: 50 },
      { x: 330, y: 80 },
      { x: 300, y: 420 },
      { x: 50, y: 380 },
    ];
    expect(detectPaperQuad(photo(400, 480, paper, 235, 235))).toBeNull();
  });
});

describe('tờ giấy tràn khung (ảnh thật anh Dũng 22/10/2026)', () => {
  it('vẫn tìm được; vải xanh / bàn tối ở mép thuộc vùng tô trắng, chữ và dấu đỏ chạm mép thì không', () => {
    const w = 300;
    const h = 400;
    const img = createImageData(w, h);
    const set = (x: number, y: number, [r, g, b]: number[]) => {
      const i = (y * w + x) * 4;
      img.data[i] = r!;
      img.data[i + 1] = g!;
      img.data[i + 2] = b!;
      img.data[i + 3] = 255;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (y < 20)
          set(x, y, [40, 40, 45]); // dải bàn tối ở trên
        else if (x < 25 && y > 150)
          set(x, y, [60, 75, 130]); // vải jean bên trái
        else if (x > 280 && y > 200 && y < 240)
          set(x, y, [210, 60, 80]); // dấu đỏ chạm mép phải
        else if (y % 25 < 4 && x > 50 && x < 260)
          set(x, y, [40, 45, 60]); // dòng chữ
        else set(x, y, [205, 220, 235]); // giấy ám xanh
      }
    const r = detectPaper(img);
    expect(r).not.toBeNull();
    const outside = (x: number, y: number) => r!.outside[y * w + x];
    expect(outside(150, 5)).toBe(1); // bàn
    expect(outside(10, 300)).toBe(1); // vải
    expect(outside(295, 220)).toBe(0); // dấu đỏ giữ
    expect(outside(150, 101)).toBe(0); // chữ giữ
    expect(outside(150, 300)).toBe(0); // giấy
  });
});
