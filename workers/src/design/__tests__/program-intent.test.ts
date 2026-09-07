/**
 * Lớp 2a — ranh giới của phần AI trong việc soạn chương trình không gian.
 *
 * Hai thứ tệp này canh, và cả hai là hàng rào chứ không phải hành vi:
 *  1. **Cái gì ĐƯỢC RA MẠNG.** Bản tóm tắt dựng bằng danh sách cho phép; một trường mới thêm
 *     vào hợp đồng đầu bài không được tự động đi theo.
 *  2. **Hỏng thì KHÔNG chặn.** Hết hạn mức, sai cấu trúc, mạng lỗi — chương trình vẫn soạn
 *     xong bằng chuẩn nghề (PRD 5.1).
 */

import { describe, expect, it } from 'vitest';
import type { DesignBrief } from '@nvg/shared/design';
import { digestBrief, resolveProgramIntent } from '../program/intent';
import { parseVocabulary, VocabularyIndex } from '../kb/vocabulary';
import { DataClassViolation, ModelNotConfigured } from '../llm/router';
import { LlmCallFailed, type GeminiClient } from '../llm/gemini';
import { testVocabularyYaml } from './program-fixtures';

const index = new VocabularyIndex(parseVocabulary(testVocabularyYaml()));

const brief = (over: Partial<DesignBrief> = {}): DesignBrief =>
  ({
    schema_version: '1.2.0',
    project_id: '11111111-1111-4111-8111-111111111111',
    project_code: 'NVO-TK-2026-0001',
    building_type: 'biet_thu',
    locality: 'hung_yen',
    site: { width_m: 15, depth_m: 20, area_m2: 300 },
    floors: 2,
    style: 'hien_dai',
    priorities: ['natural_light'],
    budget_range_vnd: [4_000_000_000, 5_500_000_000],
    family: [
      { role: 'ong_ba', count: 2, needs: ['phòng ngủ hướng vườn cho bà'] },
      { role: 'vo_chong', count: 2 },
      { role: 'con', count: 2 },
    ],
    required_spaces: [{ type: 'kitchen' }, { type: 'garage' }],
    ...over,
  }) as DesignBrief;

const fakeLlm = (behaviour: () => unknown): GeminiClient =>
  ({ generateJson: async () => behaviour() }) as unknown as GeminiClient;

describe('Bản tóm tắt gửi cho mô hình — danh sách CHO PHÉP', () => {
  it('không mang tên, mã hồ sơ, ngân sách hay kích thước thật của thửa', () => {
    const digest = digestBrief(brief(), 172.8);
    const text = JSON.stringify(digest);
    for (const secret of ['NVO-TK-2026-0001', '4000000000', '11111111', '300']) {
      expect(text).not.toContain(secret);
    }
    // Kích thước lô là dữ liệu hạng 2 ("mặt bằng kích thước thật") — chỉ gửi diện tích sàn
    // đã LÀM TRÒN theo bậc 50 m², đủ để mô hình biết "cỡ nào" mà không đọc ngược ra số đo
    // thật của thửa (172,8 m² không thể suy từ 150).
    expect(text).not.toContain('"width_m"');
    expect(text).not.toContain('172');
    expect(digest.floor_area_m2).toBe(150);
  });

  it('không mang một chữ TỰ DO nào của khách', () => {
    // Đây là ranh giới thật sự: chữ khách viết là dữ liệu hạng 1, và mọi tuyến trong giai
    // đoạn demo chỉ nhận hạng 3 (quyết định T8). Cùng lý do `program/needs.ts` cố ý không gọi.
    const digest = digestBrief(
      brief({
        design_task: 'Nhà cho anh Tuấn ở Thái Bình',
        functional_notes: 'Tầng 1 để xe cho ông Minh',
        style_note: 'Giống nhà chị Lan bên cạnh',
      } as Partial<DesignBrief>),
      172.8,
    );
    const text = JSON.stringify(digest);
    for (const phrase of ['Tuấn', 'Minh', 'Lan', 'Thái Bình', 'hướng vườn']) {
      expect(text).not.toContain(phrase);
    }
  });

  it('mang đủ thứ mô hình cần để phán đoán mức rộng rãi', () => {
    const digest = digestBrief(brief(), 172.8);
    expect(digest.building_type).toBe('biet_thu');
    expect(digest.floors).toBe(2);
    // Hai ông bà một phòng, hai vợ chồng một phòng, hai con hai phòng.
    expect(digest.bedrooms).toBe(4);
    expect(digest.generations).toBe('3_the_he');
    expect(digest.space_types).toEqual(['garage', 'kitchen']);
  });
});

describe('Mô hình hỏng thì chương trình vẫn soạn xong', () => {
  const cases: [string, () => never][] = [
    [
      'hết hạn mức hoặc mạng lỗi',
      () => {
        throw new LlmCallFailed('429', true, 429);
      },
    ],
    [
      'chưa cấu hình tuyến',
      () => {
        throw new ModelNotConfigured('layer2_program', 'chưa khai tuyến');
      },
    ],
    [
      'lớp chặn dữ liệu từ chối',
      () => {
        throw new DataClassViolation('layer2_program', 1, 3);
      },
    ],
  ];

  for (const [name, behaviour] of cases) {
    it(`${name} → không có ý đồ, có câu giải thích, KHÔNG ném lỗi`, async () => {
      const result = await resolveProgramIntent(brief(), 172.8, index, fakeLlm(behaviour));
      expect(result.intent).toBeNull();
      expect(result.notes).toHaveLength(1);
      // Câu phải nói được việc gì không chạy VÀ hệ quả là gì (CGD 5.5).
      expect(result.notes[0]).toContain('chuẩn nghề nghiệp');
    });
  }

  it('trả về cấu trúc sai hợp đồng → bỏ qua, không đi tiếp với dữ liệu hỏng', async () => {
    const result = await resolveProgramIntent(
      brief(),
      172.8,
      index,
      fakeLlm(() => ({ emphasis: [{ space_type: 'kitchen', level: 'rất rộng' }] })),
    );
    expect(result.intent).toBeNull();
    expect(result.notes[0]).toContain('cấu trúc');
  });

  it('chưa có khoá mô hình → im lặng bỏ qua, không sinh ghi chú thừa', async () => {
    const result = await resolveProgramIntent(brief(), 172.8, index, undefined);
    expect(result).toEqual({ intent: null, notes: [] });
  });

  it('kết quả đúng hợp đồng đi qua nguyên vẹn, có đóng dấu phiên bản hợp đồng', async () => {
    const ok = await resolveProgramIntent(
      brief(),
      172.8,
      index,
      fakeLlm(() => ({
        emphasis: [{ space_type: 'kitchen', level: 'generous' }],
        rationale: 'Bếp là trung tâm sinh hoạt của gia đình ba thế hệ.',
      })),
    );
    expect(ok.intent?.schema_version).toBe('1.0.0');
    expect(ok.intent?.emphasis).toEqual([{ space_type: 'kitchen', level: 'generous' }]);
  });
});
