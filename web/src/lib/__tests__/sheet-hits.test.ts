import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRoomHits } from '../sheet-hits';

// Tờ thật do bộ vẽ của Worker dựng (ảnh chụp vàng) — giao diện và bộ vẽ không được lệch nhau về cách ghi vùng bấm.
const golden = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../workers/src/design/__tests__/__snapshots__/nha-pho-tang-1.svg',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Vùng bấm phòng trên tờ mặt bằng', () => {
  it('đọc được mọi phòng của tờ thật, toạ độ là phần của tờ (0–1)', () => {
    const hits = parseRoomHits(golden);
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.y).toBeGreaterThanOrEqual(0);
      expect(h.x + h.w).toBeLessThanOrEqual(1);
      expect(h.y + h.h).toBeLessThanOrEqual(1);
      expect(h.w).toBeGreaterThan(0);
    }
    expect(new Set(hits.map((h) => h.id)).size).toBe(hits.length);
  });

  it('mã phòng có ký tự đặc biệt được giải mã; tờ không có nhóm vùng bấm thì rỗng', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g data-room-hits="">' +
      '<rect data-room="a&amp;b" x="20" y="10" width="40" height="50" fill="none" stroke="none"/></g></svg>';
    expect(parseRoomHits(svg)).toEqual([{ id: 'a&b', x: 0.1, y: 0.1, w: 0.2, h: 0.5 }]);
    expect(
      parseRoomHits('<svg viewBox="0 0 10 10"><rect x="1" y="1" width="2" height="2"/></svg>'),
    ).toEqual([]);
  });
});
