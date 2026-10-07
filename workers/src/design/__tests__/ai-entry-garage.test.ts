/**
 * Nhà phố: gara mang lối vào chính, người vào cạnh xe (Haan 04/10/2026, chọn (a) sau lượt thật e34f8f58 — nhà ống
 * 5 × 18 m: mất sảnh, cổng đòi phòng khách chạm mép đường, mô hình đẩy gara ra SAU phòng khách).
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */
import { describe, expect, it } from 'vitest';
import { entryAlternatives } from '../ai/plan';
import { ruleHolds, type RuleFacts } from '../ai/layout-prompt';
import { parseVocabulary, passageRules } from '../kb/vocabulary';
import { read } from './ai-real-context';

const passage = passageRules(parseVocabulary(read('kb/room_vocabulary.yaml')))!;

const program = {
  spaces: [
    { id: 'garage_1', type: 'garage', level: 1, ensuite_of: null },
    { id: 'living_1', type: 'living', level: 1, ensuite_of: null },
    { id: 'kitchen_1', type: 'kitchen', level: 1, ensuite_of: null },
  ],
} as never;
const intent = {
  entry_room: 'living_1',
  garage_room: 'garage_1',
  relationships: [{ a: 'garage_1', b: 'living_1', kind: 'adjacent' }],
} as never;

describe('kb: loại phòng được mang lối vào chính theo loại hình', () => {
  it('nhà phố có gara, biệt thự không', () => {
    expect(passage.entryRoomByBuildingType.get('nha_pho')?.has('garage')).toBe(true);
    expect(passage.entryRoomByBuildingType.get('biet_thu')).toBeUndefined();
  });
});

describe('entryAlternatives — chương trình tự thử gara trước khi gọi lại mô hình', () => {
  it('nhà phố: gara là phương án CUỐI, sau phòng sinh hoạt chung', () => {
    const list = entryAlternatives(intent, program, passage, 'nha_pho');
    expect(list.at(-1)).toBe('garage_1');
    expect(list).toContain('kitchen_1');
  });

  it('biệt thự, hoặc không rõ loại hình: không thử gara', () => {
    expect(entryAlternatives(intent, program, passage, 'biet_thu')).not.toContain('garage_1');
    expect(entryAlternatives(intent, program, passage)).not.toContain('garage_1');
  });
});

describe('luật lời dẫn `entry_via_garage`', () => {
  const facts = (entryViaGarage: boolean): RuleFacts => ({
    storeys: 4,
    program: [],
    hasCantilever: false,
    hasBalcony: false,
    hasOpenPairs: false,
    hasRoof: false,
    entryViaGarage,
  });
  it('chỉ bật khi dữ kiện bật', () => {
    expect(ruleHolds('entry_via_garage', facts(true))).toBe(true);
    expect(ruleHolds('entry_via_garage', facts(false))).toBe(false);
  });
});
