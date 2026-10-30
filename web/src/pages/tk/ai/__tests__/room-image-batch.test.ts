import { describe, expect, it } from 'vitest';
import { roomsToDrawAll } from '../room-image-batch';

const rooms = [
  { key: 'living:1:0', type: 'living' },
  { key: 'wc:1:1', type: 'wc' },
  { key: 'bedroom:2:2', type: 'bedroom' },
  { key: 'bedroom:2:3', type: 'bedroom' },
  { key: 'wc:2:4', type: 'wc' },
  { key: 'balcony:2:5', type: 'balcony' },
  { key: 'balcony:3:6', type: 'balcony' },
  { key: 'master_bedroom:3:7', type: 'master_bedroom' },
];

describe('Vẽ tất cả phòng chính — chọn phòng', () => {
  it('gộp loại lặp lại (một WC, một ban công), phòng ngủ thì từng phòng', () => {
    expect(roomsToDrawAll(rooms, []).map((r) => r.key)).toEqual([
      'living:1:0',
      'wc:1:1',
      'bedroom:2:2',
      'bedroom:2:3',
      'balcony:2:5',
      'master_bedroom:3:7',
    ]);
  });

  it('bỏ qua phòng / loại đã có ảnh theo đầu bài hiện hành', () => {
    const images = [
      { roomKey: 'wc:2:4', roomType: 'wc' },
      { roomKey: 'bedroom:2:3', roomType: 'bedroom' },
    ];
    expect(roomsToDrawAll(rooms, images).map((r) => r.key)).toEqual([
      'living:1:0',
      'bedroom:2:2',
      'balcony:2:5',
      'master_bedroom:3:7',
    ]);
  });
});
