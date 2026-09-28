/**
 * Lượt sửa (Haan 25/09/2026, sau ba lượt thật cùng ngày đều hỏng):
 *  · tối đa NĂM lượt sửa (`HOUSE_REVISIONS_MAX`), và để tiết kiệm token RA — phần đắt nhất — lượt sửa
 *    chỉ trả về các tầng có lỗi, chương trình ghép tầng còn lại từ ý định trước (`mergeRevision`);
 *  · gửi lại bản tốt nhất hai lần liền mà không tiến thì đổi gốc sang bản mới nhất (`revisionBase`,
 *    `stalled`).
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { HOUSE_REVISIONS_MAX, mergeRevision, revisionBase, STALLED_AFTER } from '../ai/plan';
import { prompts } from './ai-real-context';

const room = (id: string, level: number) => ({
  id,
  type: id.replace(/_\d+$/, ''),
  level,
  target_area_m2: 12,
  ensuite_of: null,
});

const previous: HouseIntent = {
  variant_label: 'A',
  rationale: 'cũ',
  assumptions: ['x'],
  rooms: [room('living_1', 1), room('stair_1', 1), room('bedroom_1', 2), room('stair_2', 2)],
  relationships: [
    { a: 'living_1', b: 'stair_1', kind: 'adjacent' },
    { a: 'bedroom_1', b: 'stair_2', kind: 'adjacent' },
  ],
  sketches: [
    { level: 1, rows: ['living_1 stair_1'] },
    { level: 2, rows: ['bedroom_1 stair_2'] },
  ],
  entry_room: 'living_1',
  garage_room: null,
} as HouseIntent;

describe('mergeRevision — lượt sửa chỉ trả tầng có lỗi', () => {
  it('tầng không có trong câu trả lời lấy nguyên từ ý định trước: phòng, quan hệ, bản phác', () => {
    const answer: HouseIntent = {
      ...previous,
      rationale: 'mới',
      assumptions: [],
      rooms: [room('bedroom_1', 2), room('stair_2', 2), room('wc_1', 2)],
      relationships: [{ a: 'bedroom_1', b: 'wc_1', kind: 'adjacent' }],
      sketches: [{ level: 2, rows: ['bedroom_1 wc_1 stair_2'] }],
    } as HouseIntent;
    const merged = mergeRevision(previous, answer);
    expect(merged.rooms.map((r) => r.id).sort()).toEqual([
      'bedroom_1',
      'living_1',
      'stair_1',
      'stair_2',
      'wc_1',
    ]);
    expect(merged.relationships).toEqual([
      { a: 'bedroom_1', b: 'wc_1', kind: 'adjacent' },
      { a: 'living_1', b: 'stair_1', kind: 'adjacent' },
    ]);
    expect(merged.sketches).toEqual([
      { level: 1, rows: ['living_1 stair_1'] },
      { level: 2, rows: ['bedroom_1 wc_1 stair_2'] },
    ]);
    // Chữ tự do và cửa chính lấy theo câu trả lời.
    expect(merged.rationale).toBe('mới');
    expect(merged.entry_room).toBe('living_1');
  });

  it('câu trả lời đủ mọi tầng thì giữ nguyên, không ghép gì', () => {
    const full = { ...previous, rationale: 'đủ' } as HouseIntent;
    expect(mergeRevision(previous, full)).toBe(full);
  });

  it('lời dẫn lượt sửa bảo chỉ trả tầng có lỗi và viết ngắn phần chữ tự do', () => {
    expect(prompts.floorLevel.revise).toMatch(/storeys the problems name ONLY/);
    expect(prompts.floorLevel.revise).toMatch(/`rationale` in one sentence/);
  });

  it('phòng mới trùng mã phòng của tầng giữ thì đổi sang mã trống — tầng giữ không mất phòng (T97)', () => {
    // Lượt thật 5584bf0d (28/09/2026): hành lang mới của tầng 2 tên `circulation_1`, trùng hành lang
    // tầng 1 — gộp theo mã thì hành lang tầng 1 mất và bốn phòng quanh nó «không có lối vào».
    const answer: HouseIntent = {
      ...previous,
      rooms: [room('bedroom_1', 2), room('stair_2', 2), room('living_1', 2)],
      relationships: [{ a: 'living_1', b: 'bedroom_1', kind: 'adjacent' }],
      sketches: [{ level: 2, rows: ['bedroom_1 stair_2 living_1'] }],
      entry_room: 'living_1',
    } as HouseIntent;
    const merged = mergeRevision(previous, answer, [1]);
    expect(merged.rooms.map((r) => `${r.id}@${r.level}`).sort()).toEqual([
      'bedroom_1@2',
      'living_1@1',
      'living_2@2',
      'stair_1@1',
      'stair_2@2',
    ]);
    expect(merged.sketches).toEqual([
      { level: 1, rows: ['living_1 stair_1'] },
      { level: 2, rows: ['bedroom_1 stair_2 living_2'] },
    ]);
    expect(merged.relationships).toEqual([
      { a: 'living_2', b: 'bedroom_1', kind: 'adjacent' },
      { a: 'living_1', b: 'stair_1', kind: 'adjacent' },
    ]);
    // Cửa chính vẫn là phòng khách TẦNG 1 (tầng giữ), không đi theo mã mới.
    expect(merged.entry_room).toBe('living_1');
  });
});

describe('revisionBase — đổi gốc khi đứng yên', () => {
  const best = { rejections: [{ level: 2, messages: ['x'] }], hints: ['- best'] };
  const worse = { rejections: [{ level: 2, messages: ['x', 'y', 'z'] }], hints: ['- worse'] };

  it('bình thường: bản tệ hơn bị gạt, gửi lại bản tốt nhất', () => {
    expect(revisionBase(best, worse, prompts).next.hints[0]).toMatch(/set aside/);
  });

  it('đứng yên: lấy bản mới nhất làm gốc, kèm dòng nói vì sao', () => {
    const picked = revisionBase(best, worse, prompts, true);
    expect(picked.best).toBe(worse);
    expect(picked.next.hints[0]).toMatch(/last two corrections did not reduce the problems/);
    expect(picked.next.hints.slice(1)).toEqual(['- worse']);
  });

  it('năm lượt sửa, đổi gốc sau hai lần gửi lại', () => {
    expect(HOUSE_REVISIONS_MAX).toBe(5);
    expect(STALLED_AFTER).toBe(2);
  });
});
