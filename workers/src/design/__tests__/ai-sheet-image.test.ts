/**
 * Tờ mặt bằng do mô hình ẢNH vẽ (T21) — phần thuần, không một lượt gọi trả phí nào.
 *
 * Điều đáng canh nhất ở đây KHÔNG phải hình dạng chuỗi, mà là **sợi dây duy nhất buộc tờ ảnh
 * vào bảng diện tích**: vì không có ảnh neo, lời dẫn phải mang theo tên phòng và số mét vuông
 * THẬT lấy từ artifact. Mất phần đó thì tờ vẽ và bảng số hoàn toàn không liên quan tới nhau,
 * mà lượt gọi vẫn tính tiền và tờ giấy vẫn trông như một bản vẽ.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseArtifact } from '../contracts';
import { parseAiPrompts } from '../ai/prompts';
import { SheetImageUnavailable, assembleSheetImage, sheetImagePrompt } from '../ai/sheet-image';
import { TOWNHOUSE_PLAN } from './ai-plan-fixtures';

const prompts = parseAiPrompts(
  load(
    readFileSync(
      fileURLToPath(new URL('../../../../kb/ai_design_prompts.yaml', import.meta.url)),
      'utf8',
    ),
  ),
);

const LABELS: Record<string, string> = {
  garage: 'Chỗ để xe',
  living: 'Phòng khách',
  kitchen: 'Bếp — ăn',
  stair: 'Thang',
  wc: 'Vệ sinh',
  light_well: 'Giếng trời',
};

const PLAN_REF = `sha256:${'b'.repeat(64)}`;

const build = (level = 1) =>
  sheetImagePrompt({ plan: TOWNHOUSE_PLAN, level, prompts, labels: LABELS });

describe('Lời dẫn vẽ tờ mặt bằng', () => {
  it('mang theo đoạn mô tả mà mô hình văn bản đã khai', () => {
    const out = build();
    expect(out.sheetPrompt).toContain('tube house ground floor');
    expect(out.prompt).toContain(out.sheetPrompt);
  });

  it('bơm TÊN PHÒNG và DIỆN TÍCH thật vào lời dẫn — sợi dây duy nhất nối với bảng số', () => {
    const out = build();
    // Diện tích in ra theo đúng cách hồ sơ NVG ghi: một chữ số thập phân, dấu CHẤM, bỏ `.0`.
    // Fixture khai 14.24 m² cho phòng khách.
    expect(TOWNHOUSE_PLAN.levels[0]!.rooms.find((r) => r.id === 'living_1')!.area_m2).toBeCloseTo(
      14.24,
      2,
    );
    expect(out.prompt).toContain('PHÒNG KHÁCH — 14.2 m²');
    expect(out.prompt).toContain('THANG — 5 m²');
    // Đủ MỌI phòng của tầng, không phải vài phòng đầu.
    for (const item of TOWNHOUSE_PLAN.levels[0]!.rooms) {
      const name = item.label?.trim() || LABELS[item.type] || item.type;
      expect(out.prompt, item.id).toContain(name.toLocaleUpperCase('vi-VN'));
    }
  });

  it('ưu tiên nhãn riêng mô hình khai hơn nhãn mặc định của mã phòng', () => {
    // `light_well_1` có label riêng «Giếng trời» trong fixture.
    expect(build().prompt).toContain('GIẾNG TRỜI');
  });

  it('nói bề rộng và chiều sâu bằng MÉT, không phải centimet của hợp đồng', () => {
    expect(build().prompt).toMatch(/4 m wide by 15 m deep/);
  });

  it('đổi hướng bắc thành chữ mô hình ảnh hiểu được', () => {
    expect(build().prompt).toContain('up (towards the top of the sheet)');
    const east = sheetImagePrompt({
      plan: { ...TOWNHOUSE_PLAN, north_deg: 90 },
      level: 1,
      prompts,
      labels: LABELS,
    });
    expect(east.prompt).toContain('to the right');
  });

  it('dùng nguyên chỉ dẫn hệ thống trong kb, không ghép chuỗi trong mã', () => {
    expect(build().system).toBe(prompts.sheetImage.system);
  });

  it('KHÔNG thay tiếp vào chính giá trị vừa điền', () => {
    // `sheet_prompt` là chữ tự do do mô hình sinh: nó có thể chứa một chuỗi trông y hệt một chỗ
    // điền khác. Thay nối tiếp thì lần sau sẽ thay tiếp vào đó và lời dẫn méo đi.
    const nasty = { ...TOWNHOUSE_PLAN.levels[0]!, sheet_prompt: 'Draw {rooms} and {north} here.' };
    const out = sheetImagePrompt({
      plan: { ...TOWNHOUSE_PLAN, levels: [nasty] },
      level: 1,
      prompts,
      labels: LABELS,
    });
    expect(out.prompt).toContain('Draw {rooms} and {north} here.');
  });
});

describe('Tầng không vẽ được', () => {
  it('thiếu mô tả thì báo bằng câu đọc được, KHÔNG phải lỗi máy chủ', () => {
    // Tầng 2 của fixture cố ý không có `sheet_prompt` — trường này tuỳ chọn.
    expect(() => build(2)).toThrow(SheetImageUnavailable);
    try {
      build(2);
    } catch (error) {
      expect((error as Error).message).toContain('chưa có mô tả tờ vẽ');
      expect((error as SheetImageUnavailable).retryable).toBe(false);
    }
  });

  it('mô tả chỉ có khoảng trắng cũng bị coi là thiếu', () => {
    const blank = { ...TOWNHOUSE_PLAN.levels[0]!, sheet_prompt: '   \n  ' };
    expect(() =>
      sheetImagePrompt({
        plan: { ...TOWNHOUSE_PLAN, levels: [blank] },
        level: 1,
        prompts,
        labels: LABELS,
      }),
    ).toThrow(SheetImageUnavailable);
  });

  it('tầng không tồn tại thì báo rõ, không trả tờ của tầng khác', () => {
    expect(() => build(99)).toThrow(SheetImageUnavailable);
  });
});

describe('Đúc artifact tờ ảnh', () => {
  const payload = () =>
    assembleSheetImage({
      planRef: PLAN_REF,
      level: 1,
      uri: 'supabase://design-renders/p/plan-sheet/abc.png',
      mime: 'image/png',
      sheetPrompt: build().sheetPrompt,
      route: 'ai_image_gemini',
      provider: 'gemini_paid',
      model: 'gemini-3.1-flash-image',
      promptVersion: prompts.version,
      latencyMs: 4200,
    });

  it('qua được hợp đồng ai_plan_sheet_image', () => {
    expect(() => parseArtifact('ai_plan_sheet_image', payload())).not.toThrow();
  });

  it('KHÔNG khai đã đóng dấu — byte trong kho chưa có nhãn nào', () => {
    expect(payload().watermark_applied).toBe(false);
    expect(() =>
      parseArtifact('ai_plan_sheet_image', { ...payload(), watermark_applied: true }),
    ).toThrow();
  });

  it('giữ nguyên văn đoạn mô tả đã gửi, để đọc lại còn hiểu vì sao tờ ra như vậy', () => {
    expect(payload().prompt_excerpt).toBe(build().sheetPrompt);
  });

  it('từ chối URI không mang scheme của kho', () => {
    expect(() =>
      parseArtifact('ai_plan_sheet_image', { ...payload(), uri: '/tmp/anh.png' }),
    ).toThrow();
  });

  it('ghi lại đủ nhà cung cấp, model và tuyến đã dùng', () => {
    expect(payload().generator).toMatchObject({
      kind: 'ai',
      provider: 'gemini_paid',
      route: 'ai_image_gemini',
      prompt_version: prompts.version,
    });
  });
});
