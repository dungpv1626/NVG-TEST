/**
 * Đầu bài đã lược danh tính → văn xuôi tiếng Việt cho mô hình (`brief/narrative.ts`, T43).
 *
 * Canh bốn điều, cả bốn đều là chỗ hỏng im lặng — mô hình vẫn trả lời, chỉ trả lời trên đầu bài sai:
 *  · tất định từng byte — đầu bài là TIỀN TỐ của mọi lượt gọi, đổi một byte là mất bộ nhớ đệm;
 *  · mọi thông tin của digest đều tới được mô hình, bằng nhãn tiếng Việt chứ không bằng mã máy;
 *  · lời gia chủ đi NGUYÊN VĂN, kể cả dấu «[đã lược]» — hàm này không lược lại, không tóm tắt;
 *  · mục rỗng không sinh tiêu đề trống, và độ dài có trần.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AiBriefDigest } from '@nvg/shared/design';
import { briefNarrative, knowledgeOf, modelBody } from '../brief/narrative';
import { parseVocabulary } from '../kb/vocabulary';
import { digestOf, TOWNHOUSE, VILLA } from './ai-digest-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const roomLabels = Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi]));
const narrate = (digest: AiBriefDigest) => briefNarrative(digest, { roomLabels });

/** Biệt thự mẫu, thêm đủ các nhóm trường mà đầu bài thật hay có — giả lập, không lấy từ hồ sơ khách. */
function richVilla(): AiBriefDigest {
  const digest = digestOf(VILLA);
  return {
    ...digest,
    site: {
      ...digest.site,
      orientation: 'DN',
      main_entrance_side: 'front',
      vehicle_entrance_side: 'left',
    },
    parking: { cars: 1, motorbikes: 3 },
    massing: { ...(digest.massing ?? {}), yards: ['san_sau'], service_core: true },
    free_text: {
      design_task: 'Nhà cho ba thế hệ, ông bà ở tầng 1 gần phòng thờ.',
      functional_needs: 'Liên hệ chủ nhà qua [đã lược] khi cần đo lại.',
      style_note: null,
      site_condition: null,
    },
    survey: {
      land_width_m: 15.2,
      land_depth_m: 19.8,
      measurement_notes: 'Mốc ranh phía sau lệch 20 cm so với sổ.',
    },
  } as AiBriefDigest;
}

describe('briefNarrative', () => {
  it('tất định từng byte — cùng digest, cùng văn xuôi', () => {
    expect(narrate(richVilla())).toBe(narrate(richVilla()));
  });

  it('nói bằng nhãn tiếng Việt, không để lộ mã máy của đầu bài', () => {
    const text = narrate(richVilla());
    expect(text).toMatch(/Biệt thự, 2 tầng\./);
    expect(text).toMatch(/Mặt tiền rộng 15 m, sâu 20 m/);
    expect(text).toMatch(/Khoảng lùi bắt buộc: .*4 m/);
    expect(text).toMatch(/Ông bà: 2 người/);
    expect(text).toMatch(/Vợ chồng: 2 người, phòng ngủ khép kín/);
    expect(text).toContain(roomLabels.altar_room);
    expect(text).toMatch(/1 ô tô, 3 xe máy/);
    for (const code of ['biet_thu', 'vo_chong', 'ong_ba', 'san_sau', 'hung_yen', '"DN"']) {
      expect(text, code).not.toContain(code);
    }
  });

  it('lời gia chủ và ghi chú khảo sát đi NGUYÊN VĂN, dấu lược danh tính giữ nguyên', () => {
    const digest = richVilla();
    const text = narrate(digest);
    expect(text).toContain(digest.free_text!.design_task!);
    expect(text).toContain('Liên hệ chủ nhà qua [đã lược] khi cần đo lại.');
    expect(text).toContain('Mốc ranh phía sau lệch 20 cm so với sổ.');
  });

  it('không thêm con số nào digest không có', () => {
    // Đầu bài nhà phố mẫu không khai khoảng lùi, mật độ, chỗ để xe — văn xuôi không được tự bịa.
    const text = narrate(digestOf(TOWNHOUSE));
    expect(text).not.toMatch(/Khoảng lùi|Mật độ|Chỗ để xe/);
    const numbers = text.match(/\d+(,\d+)?/g) ?? [];
    expect(
      numbers.every((n) => ['5', '18', '3', '2'].includes(n)),
      numbers.join(' '),
    ).toBe(true);
  });

  it('mục rỗng không sinh tiêu đề trống', () => {
    const text = narrate(digestOf(TOWNHOUSE));
    expect(text).not.toMatch(/^## .+\n(?!- )/m);
    expect(text).not.toContain('Lời gia chủ');
    expect(text).not.toContain('Khảo sát hiện trạng');
  });

  it('dưới 4.000 ký tự cho biệt thự đầy đủ — đầu bài đi kèm MỌI lượt gọi', () => {
    expect(narrate(richVilla()).length).toBeLessThan(4_000);
  });
});

describe('thân lời gọi', () => {
  it('<brief> đứng trước, <knowledge> đọc lại được đúng dữ liệu', () => {
    const knowledge = { level: 2, rooms: [{ id: 'bedroom_1' }] };
    const body = modelBody('Đầu bài.', knowledge);
    expect(body.startsWith('<brief>\nĐầu bài.\n</brief>')).toBe(true);
    expect(knowledgeOf(`${body}\n\nREVISION …`)).toEqual(knowledge);
  });

  it('thiếu <knowledge> thì ném, không trả rỗng im lặng', () => {
    expect(() => knowledgeOf('<brief>x</brief>')).toThrow();
  });
});
