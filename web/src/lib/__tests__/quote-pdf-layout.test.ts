import { describe, expect, it } from 'vitest';
import { alignX, itemColumns, pageLabel, paginateRows, wrapText } from '../quote-pdf-layout';

/** Mỗi ký tự rộng 1 điểm — đủ để kiểm cách ngắt. */
const measure = (s: string) => Array.from(s).length;

describe('wrapText', () => {
  it('ngắt ở khoảng trắng, giữ xuống dòng có sẵn', () => {
    expect(wrapText('một hai ba bốn', 7, measure)).toEqual(['một hai', 'ba bốn']);
    expect(wrapText('dòng một\ndòng hai', 20, measure)).toEqual(['dòng một', 'dòng hai']);
    expect(wrapText('', 10, measure)).toEqual(['']);
  });
  it('cắt từ dài hơn cả dòng theo ký tự', () => {
    expect(wrapText('abcdefghij xy', 4, measure)).toEqual(['abcd', 'efgh', 'ij', 'xy']);
  });
});

describe('paginateRows', () => {
  it('một trang khi đủ chỗ', () => {
    expect(paginateRows([10, 10, 10], 100, 200, 20)).toEqual([[0, 1, 2]]);
  });
  it('sang trang khi hết chỗ; trang sau rộng hơn trang đầu', () => {
    // Trang đầu: 60 − 20 = 40 → hai dòng 15; trang sau: 100 − 20 = 80.
    expect(paginateRows([15, 15, 15, 15, 15, 15, 15], 60, 100, 20)).toEqual([
      [0, 1],
      [2, 3, 4, 5, 6],
    ]);
  });
  it('dòng cao hơn cả trang vẫn được đặt, không mất dòng', () => {
    const pages = paginateRows([10, 500, 10], 100, 100, 20);
    expect(pages.flat()).toEqual([0, 1, 2]);
    expect(pages).toEqual([[0], [1], [2]]);
  });
  it('trang đầu không đủ cho dòng đầu thì bảng bắt đầu trang sau', () => {
    expect(paginateRows([50, 10], 40, 200, 20)).toEqual([[], [0, 1]]);
  });
  it('bảng rỗng vẫn có một trang (dòng tiêu đề)', () => {
    expect(paginateRows([], 100, 100, 20)).toEqual([[]]);
  });
});

describe('cột và căn lề', () => {
  it('các cột phủ đúng vùng nội dung', () => {
    const cols = itemColumns(40, 500);
    const last = cols[cols.length - 1]!;
    expect(cols[0]!.x).toBe(40);
    expect(last.x + last.width).toBeCloseTo(540, 6);
  });
  it('căn phải / giữa / trái', () => {
    const col = { x: 0, width: 100, align: 'right' as const };
    expect(alignX(col, 20, 4)).toBe(76);
    expect(alignX({ ...col, align: 'center' }, 20, 4)).toBe(40);
    expect(alignX({ ...col, align: 'left' }, 20, 4)).toBe(4);
  });
  it('nhãn số trang', () => {
    expect(pageLabel(0, 3)).toBe('Trang 1/3');
  });
});
