/**
 * Tờ mặt bằng có nội thất — lời dẫn và payload artifact (T57, 19/09/2026).
 *
 * Không một lượt gọi trả phí nào: `ai/sheet-image.ts` thuần, và lời gọi mô hình thử bằng client
 * giả ở `ai-sheet-image-call.test.ts`.
 *
 * Phép thử nặng nhất ở đây là phép thử KHUNG TÊN. Khung tên là cửa duy nhất chữ có thể đi từ hồ
 * sơ ra ngoài, mà tuyến ảnh chỉ nhận tới dữ liệu hạng 2 — nên «hàm không nhận `projectId`» là một
 * ràng buộc, và nó phải có lưới chứ không phải chỉ có một câu chú thích.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { aiPlanSheetImageSchema } from '@nvg/shared/design';
import { PlanSheetError } from '../ai/draw/plan-sheet';
import { parseAiPrompts } from '../ai/prompts';
import { anchorMime, assembleSheetImage, pngSize, sheetImagePrompt } from '../ai/sheet-image';
import { parseVocabulary } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const prompts = parseAiPrompts(load(read('../../../../kb/ai_design_prompts.yaml')));
const vocabulary = parseVocabulary(read('../../../../kb/room_vocabulary.yaml'));
const labels: Record<string, string> = Object.fromEntries(
  vocabulary.types.map((type) => [type.code, type.vi]),
);

const promptOf = (level = 1, styleCode: string | null = 'hien_dai') =>
  sheetImagePrompt({ plan: TOWNHOUSE_PLAN, level, prompts, labels, scale: 60, styleCode });

describe('lời dẫn tờ mặt bằng có nội thất', () => {
  it('nói rõ ảnh đính kèm là hình học CÓ THẨM QUYỀN — lý do duy nhất đợt này khác T21', () => {
    // Gộp xuống dòng trước khi đo: khuôn YAML ngắt dòng theo chiều rộng cột, nên một biểu thức
    // bám vào chỗ ngắt sẽ đỏ mỗi lần ai đó bọc lại đoạn văn mà không đổi nghĩa câu nào.
    const system = promptOf().system.replace(/\s+/g, ' ');
    expect(system).toMatch(/attached/i);
    expect(system).toMatch(/THE ATTACHED DRAWING IS THE AUTHORITY/);
    expect(system).toMatch(/do not move, add, remove, merge, split or resize/i);
  });

  it('bơm ĐỦ tên phòng tiếng Việt viết hoa kèm diện tích thật của MỌI phòng', () => {
    const level = TOWNHOUSE_PLAN.levels[0]!;
    const { prompt } = promptOf(1);
    for (const room of level.rooms) {
      const parts = room.parts ?? [];
      const names = parts.length > 1 ? parts.map((p) => labels[p.type]!) : [labels[room.type]!];
      for (const name of names) {
        expect(prompt, `thiếu ${name}`).toContain(name.toLocaleUpperCase('vi-VN'));
      }
    }
    // Diện tích một chữ số thập phân, dấu chấm — đúng cách hồ sơ NVG ghi.
    expect(prompt).toMatch(/— \d+(\.\d)? m²/);
  });

  it('kích thước gửi bằng MI-LI-MÉT, hình bao gửi bằng mét — hai đơn vị, hai chỗ dùng', () => {
    const level = TOWNHOUSE_PLAN.levels[0]!;
    const xs = level.outline.map((p) => p[0]!);
    const ys = level.outline.map((p) => p[1]!);
    const widthCm = Math.max(...xs) - Math.min(...xs);
    const depthCm = Math.max(...ys) - Math.min(...ys);
    const { prompt } = promptOf(1);
    expect(prompt).toContain(`${Math.round(widthCm * 10)} along the front`);
    expect(prompt).toContain(`${Math.round(depthCm * 10)} into the lot`);
    expect(prompt).toContain(`${widthCm / 100} m wide by ${depthCm / 100} m deep`);
  });

  it('hướng bắc thành chữ, không thành số độ', () => {
    expect(promptOf().prompt).toContain('North points up (towards the top of the sheet)');
    const east = sheetImagePrompt({
      plan: { ...TOWNHOUSE_PLAN, north_deg: 90 },
      level: 1,
      prompts,
      labels,
      scale: 60,
      styleCode: null,
    });
    expect(east.prompt).toContain('North points to the right');
  });

  it('khung tên chỉ có bốn dòng cho sẵn, KHÔNG có mã hồ sơ, tên người hay ngày tháng', () => {
    const { prompt } = promptOf(1);
    expect(prompt).toContain('MẶT BẰNG CÔNG NĂNG — TẦNG 1');
    expect(prompt).toContain('DIỆN TÍCH XÂY DỰNG:');
    expect(prompt).toContain('TỶ LỆ 1:60 — Kích thước ghi bằng mi-li-mét');
    // `sheetImagePrompt` KHÔNG nhận `projectId` — phép thử này canh chữ ký hàm, vì thêm tham số
    // ấy vào là mở đúng cái cửa mà cả đợt này đóng lại.
    expect(prompt).not.toMatch(TOWNHOUSE_PLAN.program_ref);
    expect(prompt).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('có mã phong cách thì thêm một câu; không có thì bỏ hẳn, không để lại chỗ điền trần', () => {
    expect(promptOf(1, 'hien_dai').prompt).toContain('Interior styling: contemporary Vietnamese');
    const bare = promptOf(1, null).prompt;
    expect(bare).not.toContain('Interior styling');
    expect(bare).not.toContain('{style}');
    // Mã lạ cũng bỏ hẳn, không ném: đầu bài là dữ liệu, mã mới thêm ở đó không được làm hỏng
    // một lượt vẽ đang chạy.
    expect(promptOf(1, 'chua_co_trong_bang').prompt).not.toContain('Interior styling');
  });

  it('không còn chỗ điền nào sót lại sau khi ghép', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const level of plan.levels) {
        const { prompt } = sheetImagePrompt({
          plan,
          level: level.level,
          prompts,
          labels,
          scale: 60,
          styleCode: 'toi_gian',
        });
        expect(prompt, `${plan.variant_id} tầng ${level.level}`).not.toMatch(/\{[a-z_]+\}/);
      }
    }
  });

  it('điền theo BẢNG, không thay nối tiếp — tên phòng chứa chuỗi giống chỗ điền vẫn an toàn', () => {
    const plan = structuredClone(TOWNHOUSE_PLAN);
    plan.levels[0]!.rooms[0]!.label = '{north}';
    const { prompt } = sheetImagePrompt({
      plan,
      level: 1,
      prompts,
      labels,
      scale: 60,
      styleCode: null,
    });
    // Chỉ MỘT lần nói về hướng bắc — nhãn phòng «{north}» không được biến thành hướng thứ hai.
    expect(prompt.match(/towards the top of the sheet/g) ?? []).toHaveLength(1);
    expect(prompt).toContain('{NORTH}');
  });

  it('tầng không có trong phương án thì ném lỗi đọc được', () => {
    expect(() => promptOf(9)).toThrow(PlanSheetError);
  });
});

describe('kiểu ảnh neo', () => {
  it('nhận ra ba kiểu cho phép và TRẢ NULL khi không nhận ra, không đoán bừa', () => {
    expect(anchorMime('iVBORw0KGgoAAAA')).toBe('image/png');
    expect(anchorMime('/9j/4AAQSkZJRg')).toBe('image/jpeg');
    expect(anchorMime('UklGRiQAAABXRUJQ')).toBe('image/webp');
    // Khác `sniffMime` của `llm/image-bytes.ts`, vốn ngã về PNG — đoán bừa ở đây là để một
    // chuỗi rác đi tiếp thành tệp gửi ra ngoài.
    expect(anchorMime('bGluaCB0aW5o')).toBeNull();
    expect(anchorMime('')).toBeNull();
  });
});

/**
 * Cỡ ảnh đọc từ chính tệp PNG — lớp kiểm DUY NHẤT máy chủ còn làm được trên ảnh neo (V-32).
 *
 * Máy chủ không rasterise được tờ SVG nên không so được từng điểm ảnh; binding `IMAGES` của
 * Cloudflare cũng không giúp («does not resize SVG files and will ignore any optimization
 * parameters»). Đối chiếu kích thước bắt đúng loại sự cố đáng lo: gửi ảnh của tầng khác, của
 * phương án khác, một tấm cũ còn trong bộ nhớ, hay một ảnh chụp màn hình.
 */
describe('đọc cỡ ảnh PNG', () => {
  /** PNG 1×1 hợp lệ — cùng tệp mà `ai-sheet-image-call.test.ts` dùng làm ảnh neo giả. */
  const png = (w: number, h: number): Uint8Array => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes.set([0, 0, 0, 13], 8);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(16, w);
    new DataView(bytes.buffer).setUint32(20, h);
    return bytes;
  };

  it('đọc đúng bề rộng và chiều cao của một trong ba khung chuẩn', () => {
    expect(pngSize(png(1536, 1024))).toEqual({ width: 1536, height: 1024 });
    expect(pngSize(png(1024, 1536))).toEqual({ width: 1024, height: 1536 });
  });

  it('trả NULL khi không phải PNG, thiếu IHDR, quá ngắn hay cỡ bằng 0', () => {
    expect(pngSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(pngSize(png(0, 1024))).toBeNull();
    const noIhdr = png(1024, 1024);
    noIhdr.set([0x49, 0x44, 0x41, 0x54], 12);
    expect(pngSize(noIhdr)).toBeNull();
  });

  it('đọc được cỡ lớn hơn 2^31 — dịch bit có dấu là bẫy quen thuộc ở đây', () => {
    expect(pngSize(png(3_000_000_000, 10))).toEqual({ width: 3_000_000_000, height: 10 });
  });
});

describe('payload artifact', () => {
  const payload = assembleSheetImage({
    planRef: `sha256:${'a'.repeat(64)}`,
    level: 2,
    uri: 'supabase://design-renders/duan/plan-sheet/abc.png',
    mime: 'image/png',
    widthPx: 1536,
    heightPx: 1024,
    prompt: 'x'.repeat(2000),
    styleCode: 'indochine',
    anchor: { sha256: 'b'.repeat(64), bytes: 204800, mime: 'image/png' },
    route: 'ai_image_openai',
    provider: 'openai',
    model: 'gpt-image-2',
    promptVersion: '8.6.0',
    latencyMs: 12345,
  });

  it('qua được lược đồ sinh từ hợp đồng', () => {
    expect(() => aiPlanSheetImageSchema.parse(payload)).not.toThrow();
  });

  it('ghi lại ảnh neo — dấu vết duy nhất cho một đầu vào máy chủ không kiểm được', () => {
    expect(payload.anchor.source).toBe('client_raster');
    expect(payload.anchor.sha256).toBe('b'.repeat(64));
    expect(payload.anchor.bytes).toBe(204800);
  });

  it('byte trong kho CHƯA đóng dấu — nhãn do trình duyệt in, cả khi xem lẫn khi tải về', () => {
    expect(payload.watermark_applied).toBe(false);
  });

  it('cắt trích đoạn lời dẫn đúng trần của hợp đồng', () => {
    expect(payload.prompt_excerpt).toHaveLength(1200);
  });
});
