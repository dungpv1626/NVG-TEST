/**
 * T100 (28/09/2026) — bếp và phòng thờ giữ vùng mô hình khai khi bộ xếp phải NỚI vùng. Haan: «đầu bài
 * có thể xếp hướng cho phòng thờ hoặc phòng bếp, nên khi sửa / xếp lại phải chú ý điều này». Chương
 * trình không đọc được câu chữ hướng; chỗ mô hình đặt phòng là cách duy nhất hướng ấy tới được mặt bằng.
 */

import { describe, expect, it } from 'vitest';
import { keepsZoneWhenRelaxed } from '../ai/arrange';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { read } from './ai-real-context';

const keepZone = new Set(roomGroups(parseVocabulary(read('kb/room_vocabulary.yaml'))).keep_zone);
const intent = { entryRoom: 'living_1', garageRoom: 'garage_1' };
const leaf = (id: string, type: string, street = false) => ({ id, types: [type], street });

describe('keepsZoneWhenRelaxed — phòng nào giữ vùng ở vòng nới', () => {
  it('bếp và phòng thờ giữ vùng, như lối vào và chỗ để xe', () => {
    expect(keepsZoneWhenRelaxed(leaf('kitchen_1', 'kitchen'), intent, keepZone)).toBe(true);
    expect(keepsZoneWhenRelaxed(leaf('altar_room_1', 'altar_room'), intent, keepZone)).toBe(true);
    expect(keepsZoneWhenRelaxed(leaf('living_1', 'living'), intent, keepZone)).toBe(true);
    expect(keepsZoneWhenRelaxed(leaf('garage_1', 'garage'), intent, keepZone)).toBe(true);
    expect(keepsZoneWhenRelaxed(leaf('bedroom_9', 'bedroom', true), intent, keepZone)).toBe(true);
  });

  it('phòng khác vẫn được nới như trước', () => {
    expect(keepsZoneWhenRelaxed(leaf('bedroom_1', 'bedroom'), intent, keepZone)).toBe(false);
    expect(keepsZoneWhenRelaxed(leaf('storage_1', 'storage'), intent, keepZone)).toBe(false);
  });

  it('WC KHÔNG giữ vùng: phát lại 5bc280ff — giữ vùng WC làm tầng 2 không xếp được, mất bản 85,2 điểm', () => {
    expect([...keepZone].sort()).toEqual(['altar_room', 'kitchen']);
    expect(keepsZoneWhenRelaxed(leaf('wc_1', 'wc'), intent, keepZone)).toBe(false);
  });
});
