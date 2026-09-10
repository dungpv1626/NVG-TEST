/**
 * Lời dẫn nhánh AI (`kb/ai_design_prompts.yaml`): nạp được, đúng hình, và giữ đúng ranh giới
 * ngôn ngữ — lời dẫn tiếng Anh (ngoại lệ có bằng chứng của quy tắc 100% tiếng Việt), còn phần
 * mô hình trả cho người đọc phải được yêu cầu bằng tiếng Việt ngay trong lời dẫn.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { AiPromptsError, parseAiPrompts } from '../ai/prompts';
import {
  AREA_TOLERANCE_M2,
  AREA_TOLERANCE_RATIO,
  EDGE_COVERAGE_MIN,
  STAIR_ALIGN_CM,
} from '../ai/plan-check';

const raw = load(
  readFileSync(
    fileURLToPath(new URL('../../../../kb/ai_design_prompts.yaml', import.meta.url)),
    'utf8',
  ),
);
const prompts = parseAiPrompts(raw);
const vietnamese = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

describe('kb/ai_design_prompts.yaml', () => {
  it('có phiên bản và hai lời dẫn của bước chương trình', () => {
    expect(prompts.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(prompts.program.system.length).toBeGreaterThan(200);
    expect(prompts.program.repair).toContain('{issues}');
  });

  it('lời dẫn là tiếng Anh, nhưng yêu cầu mô hình TRẢ tiếng Việt cho người đọc', () => {
    // Bỏ các từ khoá kỹ thuật tiếng Việt được nhắc trong ngoặc (giải thích thuật ngữ) rồi mới đo:
    // phần còn lại của lời dẫn không được có dấu tiếng Việt.
    const body = prompts.program.system
      .replace(/\([^)]*\)/g, '')
      .replace(/Vietnamese \(có dấu\)/g, '');
    const lines = body.split('\n').filter((l) => vietnamese.test(l));
    expect(lines, lines.join('\n')).toEqual([]);
    expect(prompts.program.system).toMatch(/in Vietnamese/);
  });

  it('không mang một ngưỡng quy chuẩn nào — số do Worker tiêm vào lúc gọi', () => {
    // Một con số mét vuông viết cứng trong lời dẫn là bản sao thứ hai của rule pack.
    expect(prompts.program.system).not.toMatch(/\d+(\.\d+)?\s*(m²|m2|sqm|square met)/i);
  });

  it('bước mặt bằng có đủ lời dẫn, lượt sửa và ba ý đồ bố cục', () => {
    expect(prompts.floorPlan.system.length).toBeGreaterThan(200);
    expect(prompts.floorPlan.repair).toContain('{issues}');
    expect(prompts.floorPlan.strategies.length).toBeGreaterThanOrEqual(3);
    const ids = prompts.floorPlan.strategies.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lời dẫn mặt bằng cũng là tiếng Anh, nhãn phương án thì tiếng Việt', () => {
    const body = prompts.floorPlan.system
      .replace(/\([^)]*\)/g, '')
      .replace(/Vietnamese \(có dấu\)/g, '');
    expect(body.split('\n').filter((l) => vietnamese.test(l))).toEqual([]);
    for (const item of prompts.floorPlan.strategies) {
      // `strategy` đi vào lời dẫn nên phải là tiếng Anh; `label` hiện trên màn hình nên phải là
      // tiếng Việt (CLAUDE.md 4.1). Hai trường cạnh nhau, hai ngôn ngữ, có chủ đích.
      expect(vietnamese.test(item.strategy), item.id).toBe(false);
      expect(vietnamese.test(item.label), item.id).toBe(true);
    }
  });

  it('dung sai nói với mô hình khớp dung sai bộ kiểm thật sự dùng', () => {
    // Lời dẫn là DỮ LIỆU còn dung sai là hằng số trong mã: hai bản của cùng một con số. Không có
    // phép thử này thì một lần chỉnh `EDGE_COVERAGE_MIN` sẽ để lại lời dẫn nói 95% trong khi bộ
    // kiểm đo mức khác — và mô hình bị bác vì một luật chưa ai nói cho nó.
    const system = prompts.floorPlan.system;
    expect(system).toContain(`${EDGE_COVERAGE_MIN * 100}%`);
    expect(system).toContain(`${AREA_TOLERANCE_RATIO * 100}% or ${AREA_TOLERANCE_M2} m²`);
    expect(system).toContain(`within ${STAIR_ALIGN_CM} cm`);
  });

  it('thiếu chỗ điền {issues} thì từ chối nạp', () => {
    expect(() =>
      parseAiPrompts({ version: '1.0.0', program: { system: 'x', repair: 'no placeholder' } }),
    ).toThrow(AiPromptsError);
  });
});

describe('Lời dẫn vẽ tờ mặt bằng bằng mô hình ảnh (T21)', () => {
  it('có đủ ba phần và bốn chỗ điền của khuôn', () => {
    expect(prompts.sheetImage.system.length).toBeGreaterThan(200);
    for (const slot of ['{level_name}', '{sheet_prompt}', '{rooms}', '{footprint}', '{north}']) {
      expect(prompts.sheetImage.prompt, slot).toContain(slot);
    }
  });

  it('chỉ dẫn hệ thống là tiếng Anh, còn nhãn cảnh báo là tiếng Việt', () => {
    // Cùng ranh giới với hai bước trên: chữ gửi cho mô hình thì tiếng Anh, chữ cho người đọc
    // tờ giấy thì tiếng Việt (CLAUDE.md 4.1). Riêng phần dạy mô hình VIẾT tên phòng tiếng Việt
    // buộc phải có ví dụ có dấu, nên bỏ dòng ví dụ ra trước khi đo.
    const body = prompts.sheetImage.system
      .replace(/\([^)]*\)/g, '')
      .replace(/e\.g\.[^\n]*/g, '')
      .replace(/Vietnamese[^\n]*/g, '');
    expect(body.split('\n').filter((l) => vietnamese.test(l))).toEqual([]);
    expect(vietnamese.test(prompts.sheetImage.watermark)).toBe(true);
  });

  it('cấm mô hình vẽ khung tên và bất cứ thứ gì nhận ra được hồ sơ', () => {
    // Tờ này là dữ liệu hạng 2 và sẽ còn được gửi đi tiếp (T12). Một khung tên bịa có tên
    // người trên đó trông y hệt một khung tên thật.
    const system = prompts.sheetImage.system.toLowerCase();
    for (const forbidden of ['title block', "person's name", 'signature', 'logo']) {
      expect(system, forbidden).toContain(forbidden);
    }
  });

  it('nhãn cảnh báo nói rõ tờ này KHÔNG dựng từ toạ độ', () => {
    // Đây là điều nguy hiểm nhất về tờ ảnh và là lý do nhãn tồn tại: nó trông như một bản vẽ
    // kỹ thuật nhưng không có một kích thước nào đo được.
    expect(prompts.sheetImage.watermark).toMatch(/không dựng từ toạ độ/);
  });

  it('thiếu {sheet_prompt} thì từ chối nạp, vì lượt gọi vẫn tính tiền', () => {
    const base = raw as Record<string, unknown>;
    expect(() =>
      parseAiPrompts({
        ...base,
        sheet_image: { system: 'x', prompt: 'không có chỗ điền', watermark: 'y' },
      }),
    ).toThrow(AiPromptsError);
  });

  it('thiếu hẳn khối sheet_image thì từ chối nạp', () => {
    const base = { ...(raw as Record<string, unknown>) };
    delete base.sheet_image;
    expect(() => parseAiPrompts(base)).toThrow(AiPromptsError);
  });
});
