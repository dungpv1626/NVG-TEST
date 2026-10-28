/**
 * Ô nổi neo theo phần tử: luôn nằm trong khung nhìn, thiếu chỗ dưới thì lật lên trên.
 * Ca thật: bảng lịch 288px căn mép phải với ô ngày sát mép trái cột nội dung (anh Dũng 28/10/2026)
 * từng thò ra ngoài bên trái và bị cắt mất cột T2 / T3.
 */

import { describe, expect, it } from 'vitest';
import { placeAnchored } from '../use-anchored-position';

const VIEW = { width: 1280, height: 800 };
const PANEL = { width: 288, height: 349 };

describe('placeAnchored', () => {
  it('mặc định: ngay dưới neo, căn mép phải', () => {
    const p = placeAnchored({ top: 100, bottom: 140, left: 600, right: 800 }, PANEL, VIEW);
    expect(p).toEqual({ top: 144, left: 512, side: 'below' });
  });

  it('neo sát mép trái: kẹp vào trong khung nhìn thay vì thò ra ngoài', () => {
    const p = placeAnchored({ top: 100, bottom: 140, left: 10, right: 180 }, PANEL, VIEW);
    expect(p.left).toBe(8);
  });

  it('neo sát mép phải với căn trái: kẹp lại', () => {
    const p = placeAnchored({ top: 100, bottom: 140, left: 1200, right: 1270 }, PANEL, VIEW, {
      align: 'start',
    });
    expect(p.left).toBe(1280 - 8 - 288);
  });

  it('dưới không đủ chỗ, trên đủ: lật lên trên', () => {
    const p = placeAnchored({ top: 530, bottom: 570, left: 600, right: 800 }, PANEL, VIEW);
    expect(p.side).toBe('above');
    expect(p.top).toBe(530 - 4 - 349);
  });

  it('cả hai phía không đủ: chọn phía rộng hơn và vẫn nằm trọn trong khung nhìn', () => {
    const p = placeAnchored({ top: 300, bottom: 340, left: 600, right: 800 }, PANEL, {
      width: 1280,
      height: 600,
    });
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + PANEL.height).toBeLessThanOrEqual(600 - 8);
  });
});
