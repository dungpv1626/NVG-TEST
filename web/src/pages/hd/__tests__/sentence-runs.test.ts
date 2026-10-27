/**
 * Chỗ trống cùng câu gộp thành một câu (anh Dũng 27/10/2026: «20.2. Đại diện liên lạc» thành 6 ô lặp cả câu), và tệp
 * Word còn chỗ trống của mẫu bị từ chối khi tải lên (người duyệt từng nhận mẫu gốc chưa điền).
 */

import { describe, expect, it } from 'vitest';
import type { TemplateFreeField } from '@/hooks/use-contract-templates';
import { sentenceRuns } from '../document-inputs';
import { unfilledTemplateTags } from '../document-panel';

const field = (key: string, before: string, after = ''): TemplateFreeField => ({
  key,
  article: 'Điều 20',
  before,
  after,
  default: null,
  option: null,
});

describe('sentenceRuns', () => {
  it('gộp chỗ trống liền nhau của cùng câu, kể cả khi câu trước chỗ sau bị cắt đầu', () => {
    const runs = sentenceRuns([
      field('o_59', '20.2. Đại diện liên lạc: Bên A: ', ' – ĐT: …'),
      field('o_60', '20.2. Đại diện liên lạc: Bên A: ………………… – ĐT: ', ' – Email: …'),
      // convert.py cắt bớt đầu câu dài.
      field('o_61', 'iện liên lạc: Bên A: ………… – ĐT: ……… – Email: ', '; Bên B: …'),
      field('o_62', '20.3. Tin nhắn qua ứng dụng (Zalo, ', ') chỉ dùng để trao đổi'),
    ]);
    expect(runs.map((r) => r.map((f) => f.key))).toEqual([['o_59', 'o_60', 'o_61'], ['o_62']]);
  });

  it('không gộp ô bảng hay chỗ trống thuộc phương án khác', () => {
    const a = field('o_1', 'Bên A: ');
    const b = { ...field('o_2', 'Bên A: ……… – ĐT: '), option: 'pa_1_a' };
    expect(sentenceRuns([a, b])).toHaveLength(2);
  });
});

describe('unfilledTemplateTags', () => {
  it('bắt chỗ trống của mẫu, kể cả khi Word cắt nó thành nhiều đoạn chữ', () => {
    const xml =
      '<w:p><w:r><w:t>Số: {so_</w:t></w:r><w:r><w:t>hop_dong}</w:t></w:r>{#pa_1_a}x{/pa_1_a}</w:p>';
    expect(unfilledTemplateTags(xml)).toEqual(['{so_hop_dong}', '{pa_1_a}']);
    expect(unfilledTemplateTags('<w:t>Số: 12/2026/HĐTC {ghi chú tay}</w:t>')).toEqual([]);
  });
});
