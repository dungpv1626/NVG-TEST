import { describe, expect, it } from 'vitest';
import { sortByCapture } from '../document-scanner';

const file = (name: string, lastModified: number) => new File(['x'], name, { lastModified });

describe('thứ tự trang khi thêm nhiều ảnh một lần', () => {
  it('xếp theo thời điểm chụp dù hộp chọn tệp trả đảo ngược', () => {
    const picked = [
      file('IMG_0003.jpg', 3000),
      file('IMG_0002.jpg', 2000),
      file('IMG_0001.jpg', 1000),
    ];
    expect(sortByCapture(picked).map((f) => f.name)).toEqual([
      'IMG_0001.jpg',
      'IMG_0002.jpg',
      'IMG_0003.jpg',
    ]);
  });

  it('cùng thời điểm thì theo tên, số tự nhiên (trang 2 trước trang 10)', () => {
    const picked = [file('trang-10.jpg', 5), file('trang-2.jpg', 5), file('trang-1.jpg', 5)];
    expect(sortByCapture(picked).map((f) => f.name)).toEqual([
      'trang-1.jpg',
      'trang-2.jpg',
      'trang-10.jpg',
    ]);
  });
});
