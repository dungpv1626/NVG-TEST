import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { A4_POINTS, buildPdf } from '../build-pdf';
import { detectPaper, detectPaperQuad, findEdgeMids } from '../detect';
import { deskewAngle, rotateImage } from '../deskew';
import { enhance } from '../enhance';
import { isBlurry, sharpnessOfImage } from '../quality';
import {
  applyHomography,
  createImageData,
  defaultQuad,
  hasBentEdge,
  homography,
  pageSize,
  rotateQuadClockwise,
  straightMids,
  warpQuad,
  type EdgeMids,
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
    const portrait = pageSize(defaultQuad(4000, 5000, 0));
    expect(portrait.height).toBe(3000);
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
        // Chữ có lề — không chạm mép trang (bước dọn mép xoá vệt tối nối ra mép).
        const inMargin = x >= 10 && x < w - 10 && y >= 5 && y < h - 5;
        const ink = inMargin && ((x % 50 >= 20 && x % 50 < 24) || (y >= 48 && y < 52 && x < 90));
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
        const ink = x % 50 >= 20 && x % 50 < 24 && y >= 5 && y < h - 5;
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

describe('xoay thẳng theo dòng chữ', () => {
  function tiltedLines(deg: number) {
    const w = 600;
    const h = 800;
    const img = createImageData(w, h);
    img.data.fill(255);
    const t = Math.tan((deg * Math.PI) / 180);
    for (let y = 0; y < h; y++)
      for (let x = 60; x < w - 60; x++) {
        // Dòng chữ cách nhau 40 px, dày 6 px, có khoảng trống giữa các «chữ».
        const yy = y - (x - w / 2) * t;
        if (((yy % 40) + 40) % 40 < 6 && x % 23 < 17) {
          const i = (y * w + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 20;
        }
      }
    return img;
  }

  it('đo đúng góc nghiêng và xoay xong thì chữ nằm ngang', () => {
    const img = tiltedLines(3);
    const angle = deskewAngle(img);
    expect(Math.abs(Math.abs(angle) - 3)).toBeLessThan(0.5);
    const fixed = rotateImage(img, -angle, createImageData);
    expect(Math.abs(deskewAngle(fixed))).toBeLessThan(0.5);
  });

  it('chữ đã thẳng / trang trắng thì không xoay', () => {
    expect(deskewAngle(tiltedLines(0))).toBe(0);
    const blank = createImageData(300, 400);
    blank.data.fill(255);
    expect(deskewAngle(blank)).toBe(0);
  });
});

describe('dọn mép trang và báo ảnh mờ', () => {
  it('mảng bàn sát đáy (cách mép một hàng trắng) bị dọn, chữ giữ nguyên', () => {
    const w = 400;
    const h = 560;
    const img = createImageData(w, h);
    img.data.fill(255);
    const paint = (x: number, y: number, v: [number, number, number]) => {
      const i = (y * w + x) * 4;
      [img.data[i], img.data[i + 1], img.data[i + 2]] = v;
    };
    // Mảng bàn xám xanh ở đáy, cách mép dưới 2 hàng trắng (bước tô mặt bàn đã làm trắng hàng sát mép).
    for (let y = h - 9; y < h - 2; y++) for (let x = 0; x < 160; x++) paint(x, y, [120, 130, 160]);
    // Một dòng chữ có lề.
    for (let y = 100; y < 108; y++)
      for (let x = 60; x < 340; x++) if (x % 9 < 6) paint(x, y, [30, 30, 30]);
    enhance(img, 'bw');
    const lum = (x: number, y: number) => img.data[(y * w + x) * 4]!;
    expect(lum(50, h - 5)).toBe(255);
    expect(lum(63, 104)).toBe(0);
  });

  it('ảnh chữ nét không bị báo mờ; cùng ảnh làm nhòe thì bị báo', () => {
    const w = 600;
    const h = 800;
    const sharp = createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = y % 30 < 8 && x % 11 < 6 && x > 40 && x < w - 40 ? 50 : 200;
        const i = (y * w + x) * 4;
        sharp.data[i] = sharp.data[i + 1] = sharp.data[i + 2] = v;
        sharp.data[i + 3] = 255;
      }
    // Nhòe kiểu rung tay: trung bình 9 điểm theo phương ngang, rồi 9 điểm theo phương dọc.
    const blurred = createImageData(w, h);
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -4; k <= 4; k++)
          s += sharp.data[(y * w + Math.min(w - 1, Math.max(0, x + k))) * 4]!;
        tmp[y * w + x] = s / 9;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -4; k <= 4; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
        const i = (y * w + x) * 4;
        blurred.data[i] = blurred.data[i + 1] = blurred.data[i + 2] = s / 9;
        blurred.data[i + 3] = 255;
      }
    expect(isBlurry(sharpnessOfImage(sharp))).toBe(false);
    expect(isBlurry(sharpnessOfImage(blurred))).toBe(true);
  });
});

describe('giấy cong — điểm giữa cạnh', () => {
  /** Ảnh xám w×h từ hàm độ sáng. */
  function gray(w: number, h: number, lum: (x: number, y: number) => number) {
    const img = createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = lum(x, y);
        img.data[i + 3] = 255;
      }
    return img;
  }

  it('điểm giữa đúng trung điểm (hoặc lệch dưới nửa điểm ảnh) thì ra y hệt phép phối cảnh cũ', () => {
    // Nền có vân để mọi sai lệch lấy mẫu đều lộ ra.
    const src = gray(240, 300, (x, y) => (x * 37 + y * 91 + ((x * y) % 13) * 17) % 256);
    const quad: Quad = [
      { x: 30, y: 20 },
      { x: 210, y: 40 },
      { x: 200, y: 280 },
      { x: 15, y: 260 },
    ];
    const old = warpQuad(src, quad, 120, 170, undefined, 2);
    const mids = straightMids(quad);
    expect(warpQuad(src, quad, 120, 170, undefined, 2, mids).data).toEqual(old.data);
    const nudged = mids.map((m) => ({ x: m.x + 0.2, y: m.y - 0.25 })) as EdgeMids;
    expect(warpQuad(src, quad, 120, 170, undefined, 2, nudged).data).toEqual(old.data);
    expect(hasBentEdge(quad, nudged)).toBe(false);
  });

  it('cạnh trên cong: nắn theo điểm giữa thì dòng chữ sát mép ra thẳng, nắn thẳng thì vẫn cong', () => {
    // Tờ giấy 200 × 300 trên bàn tối, mép trên vồng lên 25 px ở giữa; một dòng chữ chạy song song
    // mép trên, cách 12 px — đúng kiểu trang sổ bị cong ở gáy.
    const top = (x: number) => 60 - 25 * (1 - ((x - 150) / 100) ** 2);
    const src = gray(300, 400, (x, y) => {
      if (x < 50 || x >= 250 || y >= 360 || y + 0.5 < top(x + 0.5)) return 30;
      const line = y + 0.5 - top(x + 0.5);
      return line >= 12 && line < 15 && x >= 60 && x < 240 ? 20 : 230;
    });
    const quad: Quad = [
      { x: 50, y: 60 },
      { x: 250, y: 60 },
      { x: 250, y: 360 },
      { x: 50, y: 360 },
    ];
    const mids = straightMids(quad);
    mids[0] = { x: 150, y: 35 };
    /** Hàng của dòng chữ ở từng cột trang đã nắn (hàng tối đầu tiên dưới mép). */
    const lineRows = (img: ImageData) => {
      const rows: number[] = [];
      for (let x = 15; x < 185; x += 5) {
        for (let y = 3; y < 120; y++) {
          if (img.data[(y * img.width + x) * 4]! < 100) {
            rows.push(y);
            break;
          }
        }
      }
      return rows;
    };
    const curved = warpQuad(src, quad, 200, 300, undefined, 0, mids);
    const rows = lineRows(curved);
    expect(rows.length).toBe(34);
    expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);
    // Mép trên nằm đúng trên đường cong: hàng đầu trang là giấy, không dính mặt bàn.
    for (let x = 2; x < 198; x++) expect(curved.data[(1 * 200 + x) * 4]!).toBeGreaterThan(200);
    // Đối chứng: nắn bằng 4 góc thẳng thì phần giấy vồng lên trên dây cung bị cắt — đoạn giữa của
    // dòng chữ mất khỏi trang.
    expect(lineRows(warpQuad(src, quad, 200, 300)).length).toBeLessThan(20);
  });

  it('tự tìm mép: thấy cạnh trên cong thì đặt điểm giữa lên mép thật, cạnh thẳng giữ trung điểm', () => {
    const top = (x: number) => 80 - 20 * (1 - ((x - 200) / 120) ** 2);
    const img = gray(400, 480, (x, y) => {
      const inside = x >= 80 && x < 320 && y < 420 && y + 0.5 >= top(x + 0.5);
      if (!inside) return 60;
      return y > 140 && y % 20 < 3 && x > 100 && x < 300 && x % 7 < 5 ? 40 : 235;
    });
    const r = detectPaper(img);
    expect(r).not.toBeNull();
    const straight = straightMids(r!.quad);
    // Mép thật ở giữa cạnh trên là y = 60 (lùi vào 1 % như 4 góc thì thêm ~2 px).
    expect(Math.abs(r!.mids[0].x - 200)).toBeLessThan(2);
    expect(Math.abs(r!.mids[0].y - 60)).toBeLessThan(3.5);
    expect(straight[0].y - r!.mids[0].y).toBeGreaterThan(15);
    for (const i of [1, 2, 3]) expect(r!.mids[i]).toEqual(straight[i]);
  });

  it('không thấy mép rõ thì giữ trung điểm: giấy tràn khung, hay mép lổn nhổn không ra ranh giới', () => {
    // Tờ giấy chạm mép trên của ảnh: phía ngoài cạnh trên không có trong ảnh.
    const img = gray(400, 480, (x, y) => (x >= 40 && x < 360 && y < 440 ? 235 : 60));
    const r = detectPaper(img);
    expect(r).not.toBeNull();
    expect(r!.mids[0]).toEqual(straightMids(r!.quad)[0]);
    // Mặt nạ lốm đốm (bóng, vân bàn) quanh cả 4 cạnh: không có chỗ chuyển rõ nào.
    const quad: Quad = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 400 },
      { x: 100, y: 400 },
    ];
    const speckle = (x: number, y: number) => (Math.floor(x) * 7 + Math.floor(y) * 3) % 5 < 2;
    expect(findEdgeMids(quad, speckle)).toEqual(straightMids(quad));
  });
});
