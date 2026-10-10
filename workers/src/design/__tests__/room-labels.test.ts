/**
 * Đổi tên loại phòng không hồi tố (Haan, 09/10/2026: «Khu vệ sinh» → «WC», «bản vẽ hiện có không
 * cần đổi, tên mới cho bản vẽ từ giờ trở đi»). Canh: phương án mới mang tên mới trong artifact,
 * phương án đã lưu (phòng chưa mang nhãn) vẽ ra tên cũ.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOM_LABEL, type AiFloorPlan } from '@nvg/shared/design';
import { drawingLabelsOf, parseVocabulary } from '../kb/vocabulary';
import { stampRenamedRoomLabels } from '../ai/room-labels';

const vocabulary = parseVocabulary(
  readFileSync(new URL('../../../../kb/room_vocabulary.yaml', import.meta.url), 'utf8'),
);
const drawing = drawingLabelsOf(vocabulary);

const plan = (rooms: Array<{ type: string; label: string | null }>) =>
  ({
    levels: [{ level: 1, rooms: rooms.map((r, i) => ({ id: `r${i}`, rect: [0, 0, 1, 1], ...r })) }],
  }) as unknown as AiFloorPlan;

describe('Tên WC', () => {
  it('tên hiện hành là «WC», bộ vẽ dự phòng tên cũ cho phương án đã lưu', () => {
    expect(vocabulary.types.find((t) => t.code === 'wc')?.vi).toBe('WC');
    expect(ROOM_LABEL.wc).toBe('WC');
    expect(drawing.wc).toBe('Khu vệ sinh');
    // Loại không đổi tên thì hai bảng như nhau.
    expect(drawing.kitchen).toBe(ROOM_LABEL.kitchen);
  });

  it('phương án mới ghi «WC» vào phòng wc; phòng khác và nhãn đã khai giữ nguyên', () => {
    const types = vocabulary.types;
    const out = stampRenamedRoomLabels(
      plan([
        { type: 'wc', label: null },
        { type: 'wc', label: 'WC khách' },
        { type: 'kitchen', label: null },
      ]),
      types,
    );
    expect(out.levels[0]!.rooms.map((r) => r.label)).toEqual(['WC', 'WC khách', null]);
  });

  it('không loại nào đổi tên thì trả nguyên đối tượng', () => {
    const input = plan([{ type: 'wc', label: null }]);
    expect(stampRenamedRoomLabels(input, [{ code: 'wc', vi: 'WC' }])).toBe(input);
  });
});
