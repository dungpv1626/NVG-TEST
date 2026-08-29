/**
 * Hình học thửa đất — `shared/src/design/site-geometry.ts`.
 *
 * Loại lỗi bộ này canh KHÔNG bao giờ tự lộ ra: đầu bài vẫn hợp lệ theo hợp đồng, engine vẫn
 * chạy, bản vẽ vẫn ra. Chỉ là nó ra trên một mảnh đất rộng hơn mảnh đất thật. Vì vậy mọi
 * phép thử dưới đây đều kiểm cùng một tính chất — **không bao giờ hứa nhiều đất hơn thực
 * có** — chứ không chỉ kiểm hàm chạy không ném lỗi.
 *
 * Chạy: `npx vitest run --project logic shared/src/__tests__/site-geometry.test.ts`
 */

import { describe, expect, it } from 'vitest';
import type { DesignBrief } from '../design/design-brief.generated';
import {
  largestInscribedRect,
  pointInPolygon,
  polygonArea,
  siteGeometry,
  SiteGeometryError,
  type Point,
} from '../design/site-geometry';

type Site = DesignBrief['site'];

const site = (over: Partial<Site> = {}): Site => ({ width_m: 5, depth_m: 18, ...over }) as Site;

describe('Thửa hình chữ nhật', () => {
  it('mặc định khi chưa khai hình — đầu bài cũ đọc lên vẫn đúng', () => {
    const g = siteGeometry(site());
    expect(g.shape).toBe('chu_nhat');
    expect(g.areaM2).toBe(90);
    expect(g.frontageM).toBe(5);
    expect(g.buildable).toEqual({ xM: 0, yM: 0, widthM: 5, depthM: 18 });
    expect(g.unusedM2).toBe(0);
    expect(g.exact).toBe(true);
  });

  it('không có phần đất nào bị bỏ lại', () => {
    const g = siteGeometry(site({ shape: 'chu_nhat', width_m: 12, depth_m: 20 }));
    expect(g.buildable.widthM * g.buildable.depthM).toBe(g.areaM2);
  });
});

describe('Thửa hình thang — dạng không đều phổ biến nhất', () => {
  it('diện tích là trung bình hai đáy nhân chiều sâu, KHÔNG phải hình bao', () => {
    // Mặt tiền 6 m, mặt hậu 4 m, sâu 20 m → (6+4)/2 × 20 = 100 m².
    // Dùng hình bao (6 × 20 = 120 m²) là nới trần mật độ xây dựng thêm 20%.
    const g = siteGeometry(site({ shape: 'hinh_thang', width_m: 6, rear_width_m: 4, depth_m: 20 }));
    expect(g.areaM2).toBe(100);
    expect(g.bboxWidthM).toBe(6);
  });

  it('ô xây được lấy theo cạnh HẸP hơn, và nằm gọn trong thửa', () => {
    const g = siteGeometry(site({ shape: 'hinh_thang', width_m: 6, rear_width_m: 4, depth_m: 20 }));
    expect(g.buildable.widthM).toBe(4);
    expect(g.buildable.depthM).toBe(20);
    expect(g.buildable.xM).toBe(1); // căn giữa
    expect(g.exact).toBe(true);

    for (const corner of [
      [g.buildable.xM, g.buildable.yM],
      [g.buildable.xM + g.buildable.widthM, g.buildable.yM],
      [g.buildable.xM + g.buildable.widthM, g.buildable.yM + g.buildable.depthM],
      [g.buildable.xM, g.buildable.yM + g.buildable.depthM],
    ] as Point[]) {
      expect(pointInPolygon(corner, g.boundary), `góc ${corner}`).toBe(true);
    }
  });

  it('mặt hậu RỘNG hơn mặt tiền cũng chạy đúng — lô nở hậu', () => {
    const g = siteGeometry(site({ shape: 'hinh_thang', width_m: 4, rear_width_m: 6, depth_m: 20 }));
    expect(g.areaM2).toBe(100);
    expect(g.buildable.widthM).toBe(4);
    expect(g.frontageM, 'mặt tiền vẫn là cạnh giáp đường, không phải cạnh rộng nhất').toBe(4);
  });

  it('phần đất ngoài ô chữ nhật được ĐO, không bị nuốt', () => {
    const g = siteGeometry(site({ shape: 'hinh_thang', width_m: 6, rear_width_m: 4, depth_m: 20 }));
    expect(g.unusedM2).toBe(20); // 100 − 4×20
  });

  it('thiếu mặt hậu thì coi như chữ nhật, không ném lỗi', () => {
    const g = siteGeometry(site({ shape: 'hinh_thang', width_m: 6, depth_m: 20 }));
    expect(g.areaM2).toBe(120);
    expect(g.buildable.widthM).toBe(6);
  });
});

describe('Thửa đa giác', () => {
  const pentagon: [number, number][] = [
    [0, 0],
    [8, 0],
    [8, 12],
    [4, 16],
    [0, 12],
  ];

  it('diện tích tính bằng công thức dây giày', () => {
    const g = siteGeometry(site({ shape: 'da_giac', boundary_m: pentagon }));
    // Chữ nhật 8×12 = 96, cộng tam giác đỉnh đáy 8 cao 4 = 16 → 112.
    expect(g.areaM2).toBe(112);
    expect(g.bboxWidthM).toBe(8);
    expect(g.bboxDepthM).toBe(16);
  });

  it('mặt tiền là cạnh đỉnh 1 → đỉnh 2, không phải cạnh dài nhất', () => {
    const g = siteGeometry(site({ shape: 'da_giac', boundary_m: pentagon }));
    expect(g.frontageM).toBe(8);
  });

  it('ô xây được nằm GỌN trong ranh giới — tính chất quan trọng nhất của cả tệp', () => {
    const g = siteGeometry(site({ shape: 'da_giac', boundary_m: pentagon }));
    const { xM, yM, widthM, depthM } = g.buildable;
    expect(widthM).toBeGreaterThan(0);
    expect(widthM * depthM).toBeLessThanOrEqual(g.areaM2);
    for (const corner of [
      [xM, yM],
      [xM + widthM, yM],
      [xM + widthM, yM + depthM],
      [xM, yM + depthM],
    ] as Point[]) {
      expect(pointInPolygon(corner, g.boundary), `góc ${corner}`).toBe(true);
    }
    expect(g.exact, 'đa giác: kết quả an toàn nhưng có thể chưa lớn nhất').toBe(false);
  });

  it('chiều đi của các đỉnh không ảnh hưởng kết quả', () => {
    const forward = siteGeometry(site({ shape: 'da_giac', boundary_m: pentagon }));
    const backward = siteGeometry(site({ shape: 'da_giac', boundary_m: [...pentagon].reverse() }));
    expect(backward.areaM2).toBe(forward.areaM2);
    expect(backward.buildable.widthM * backward.buildable.depthM).toBe(
      forward.buildable.widthM * forward.buildable.depthM,
    );
  });

  it('đa giác LÕM hình chữ L: ô không được phủ sang phần khuyết', () => {
    const lShape: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const g = siteGeometry(site({ shape: 'da_giac', boundary_m: lShape }));
    expect(g.areaM2).toBe(64);
    expect(g.buildable.widthM * g.buildable.depthM).toBe(40);
  });

  it('rãnh khoét giữa cạnh: BỐN GÓC nằm trong hình mà ô vẫn không hợp lệ', () => {
    // Đây là hình bắt được lỗi mà hình chữ L KHÔNG bắt được, và là lý do phép kiểm "không
    // đỉnh nào nằm hẳn trong lòng ô" tồn tại.
    //
    // Thửa 10 × 10 bị khoét một rãnh chữ V từ cạnh trên xuống tới (5, 5). Ô 10 × 10:
    //  · bốn góc đều là ĐỈNH của thửa → phép kiểm góc nói "nằm trong";
    //  · hai cạnh rãnh chỉ CHẠM cạnh trên rồi đi vào trong → phép kiểm cắt ngang không nổ;
    //  · nhưng 5 m² của rãnh nằm ngoài thửa.
    //
    // Không có phép kiểm đỉnh, hàm trả về 100 m² đất xây được trên một thửa 95 m².
    const notched: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [6, 10],
      [5, 5],
      [4, 10],
      [0, 10],
    ];
    const g = siteGeometry(site({ shape: 'da_giac', boundary_m: notched }));
    expect(g.areaM2).toBe(95);
    expect(g.buildable.widthM * g.buildable.depthM).toBe(50); // 10 × 5, dừng dưới mũi rãnh
    expect(pointInPolygon([5, 8], g.boundary), 'điểm giữa rãnh nằm NGOÀI thửa').toBe(false);
  });

  it('tất định: cùng đầu vào, cùng kết quả — điều kiện để mã băm artifact có nghĩa', () => {
    const a = siteGeometry(site({ shape: 'da_giac', boundary_m: pentagon }));
    const b = siteGeometry(site({ shape: 'da_giac', boundary_m: pentagon }));
    expect(b).toEqual(a);
  });

  it('thiếu ranh giới thì DỪNG, không im lặng lùi về hình chữ nhật', () => {
    // Lùi về chữ nhật ở đây là tự bịa ra một mảnh đất: người dùng đã nói thửa không vuông
    // vắn, mà hệ thống vẫn xếp phòng như thể nó vuông vắn.
    expect(() => siteGeometry(site({ shape: 'da_giac' }))).toThrow(SiteGeometryError);
    expect(() => siteGeometry(site({ shape: 'da_giac', boundary_m: [[0, 0]] }))).toThrow(
      SiteGeometryError,
    );
  });

  it('ba đỉnh thẳng hàng không tạo thành thửa — nói ra, không chia cho không', () => {
    expect(() =>
      siteGeometry(
        site({
          shape: 'da_giac',
          boundary_m: [
            [0, 0],
            [5, 0],
            [10, 0],
          ],
        }),
      ),
    ).toThrow(SiteGeometryError);
  });
});

describe('Hàm hình học nền', () => {
  it('diện tích dây giày không phụ thuộc chiều đi', () => {
    const square: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    expect(polygonArea(square)).toBe(16);
    expect(polygonArea([...square].reverse())).toBe(16);
  });

  it('điểm nằm ĐÚNG trên cạnh tính là ở trong', () => {
    // Không có điều khoản này thì thửa hình chữ nhật không tìm được ô nào bằng chính nó:
    // cả bốn góc đều nằm trên biên.
    const square: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    expect(pointInPolygon([0, 0], square)).toBe(true);
    expect(pointInPolygon([2, 0], square)).toBe(true);
    expect(pointInPolygon([2, 2], square)).toBe(true);
    expect(pointInPolygon([5, 2], square)).toBe(false);
  });

  it('ô lớn nhất của một hình chữ nhật là chính nó', () => {
    const rect: Point[] = [
      [0, 0],
      [6, 0],
      [6, 10],
      [0, 10],
    ];
    expect(largestInscribedRect(rect)).toEqual({ xM: 0, yM: 0, widthM: 6, depthM: 10 });
  });
});
