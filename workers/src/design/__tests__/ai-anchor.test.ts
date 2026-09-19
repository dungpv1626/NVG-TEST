/**
 * Ảnh neo (`ai/draw/anchor.ts`) — tờ rút gọn gửi cho mô hình ảnh (T57, 19/09/2026).
 *
 * Phép thử ở đây canh hai thứ, và cả hai đều là ràng buộc chứ không phải sở thích trình bày:
 *
 *  · **Không khung tên.** Tờ này RỜI KHỎI hệ thống: trình duyệt rasterise rồi gửi thẳng cho nhà
 *    cung cấp mô hình ảnh. Khung tên mang tên/mã hồ sơ là dữ liệu hạng 1, mà tuyến ảnh chỉ nhận
 *    tới hạng 2 (`config/models.yaml`). Bảo đảm nằm ở CẤU TRÚC — `renderPlanAnchor` không gọi
 *    `renderTitleBlock` — nhưng cấu trúc đổi được, nên phải có lưới đo lại kết quả.
 *  · **Khung ảnh chuẩn.** `llm/openai.ts` không gửi tham số `size`, nên mô hình trả ảnh theo khung
 *    của nó. Ảnh neo lệch khung thì mặt bằng bị cắt hoặc bị bóp, và chỗ ấy chỉ lộ ra sau khi đã
 *    trả tiền một tấm.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { ANCHOR_FRAMES, renderPlanAnchor } from '../ai/draw/anchor';
import { PlanSheetError } from '../ai/draw/plan-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { CLS } from '../ai/draw/svg';
import { parseVocabulary } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

// Vitest không nạp được `.yaml` qua `import`, nên đọc thẳng như `ai-draw.test.ts` vẫn làm.
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const style = parseSheetStyle(read('../../../../kb/sheet_style.yaml'));
const vocabulary = parseVocabulary(read('../../../../kb/room_vocabulary.yaml'));
const options = {
  style,
  labels: Object.fromEntries(vocabulary.types.map((type) => [type.code, type.vi])),
};
const anchorOf = (plan = TOWNHOUSE_PLAN, level = 1) => renderPlanAnchor(plan, level, options);

describe('ảnh neo — tờ gửi cho mô hình ảnh', () => {
  it('tất định: cùng một phương án cho cùng một chuỗi', () => {
    expect(anchorOf().svg).toBe(anchorOf().svg);
  });

  it('KHÔNG mang khung tên, khung bản vẽ hay câu cảnh báo — tờ này rời khỏi hệ thống', () => {
    const { svg } = anchorOf();
    // Ba lớp chỉ có trên tờ A3: khung bản vẽ, nhãn ô khung tên, dòng tên tờ.
    expect(svg).not.toContain(`class="${CLS.frame}"`);
    expect(svg).not.toContain(`class="${CLS.textBlockLabel}"`);
    expect(svg).not.toContain(`class="${CLS.textSheetTitle}"`);
    // Nguyên văn nhãn ô khung tên, in HOA đúng như `draw/sheet.ts` đặt lên giấy — viết thường ở
    // đây thì khẳng định luôn đúng mà không canh được gì.
    expect(svg).not.toContain('TÊN BẢN VẼ');
    expect(svg).not.toContain('TỶ LỆ');
    expect(svg).not.toContain('Kích thước ghi bằng mi-li-mét');
    // Và không câu nhãn nào — chúng thuộc về tờ người đọc, không thuộc về đầu vào của máy.
    for (const line of Object.values(AI_DISCLAIMERS)) {
      expect(svg, line).not.toContain(line);
    }
  });

  it('vẫn mang đủ phần HÌNH: tường, lỗ mở, chuỗi kích thước, tên phòng', () => {
    const { svg } = anchorOf();
    expect(svg).toContain(`class="${CLS.wall}"`);
    expect(svg).toContain(`class="${CLS.dimLine}"`);
    expect(svg).toContain(`class="${CLS.textRoom}"`);
    expect(svg).toContain(`class="${CLS.textArea}"`);
    // Tên phòng tiếng Việt viết hoa — chính thứ mô hình ảnh chép lại lên tờ trình khách.
    expect(svg).toMatch(/PHÒNG/);
  });

  it('nền TRẮNG tuyệt đối phủ hết khung, không lấy màu giấy của quy ước trình bày', () => {
    const { svg } = anchorOf();
    const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    expect(view).not.toBeNull();
    expect(svg).toContain(
      `<rect x="0" y="0" width="${view![1]}" height="${view![2]}" fill="#ffffff"`,
    );
  });

  it('cỡ ảnh khai bằng ĐIỂM ẢNH, số trần không đơn vị, và đúng một trong ba khung chuẩn', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const level of plan.levels) {
        const anchor = renderPlanAnchor(plan, level.level, options);
        expect(
          ANCHOR_FRAMES.some((f) => f.widthPx === anchor.widthPx && f.heightPx === anchor.heightPx),
          `${plan.variant_id} tầng ${level.level}: ${anchor.widthPx}×${anchor.heightPx}`,
        ).toBe(true);
        // `mm` ở đây là lỗi: canvas cần cỡ điểm ảnh nội tại, khai `mm` thì mỗi trình duyệt quy
        // đổi một kiểu và tấm PNG ra không còn đúng khung chuẩn.
        expect(anchor.svg).toContain(`width="${anchor.widthPx}" height="${anchor.heightPx}"`);
      }
    }
  });

  it('tỷ lệ pixel khớp tỷ lệ viewBox — hình không bị bóp một chiều', () => {
    const anchor = anchorOf();
    const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(anchor.svg)!;
    const viewRatio = Number(view[1]) / Number(view[2]);
    expect(viewRatio).toBeCloseTo(anchor.widthPx / anchor.heightPx, 3);
  });

  it('lấy đúng tỷ lệ mà tờ A3 chọn — con số gửi trong lời dẫn khớp thứ mô hình nhìn thấy', () => {
    expect(anchorOf().scale).toBeGreaterThan(0);
    expect(style.scale_steps).toContain(anchorOf().scale);
  });

  it('tầng không có trong phương án thì ném lỗi đọc được, không phải lỗi máy chủ', () => {
    expect(() => anchorOf(TOWNHOUSE_PLAN, 9)).toThrow(PlanSheetError);
    expect(() => anchorOf(TOWNHOUSE_PLAN, 9)).toThrow(/tầng 9/);
  });
});
