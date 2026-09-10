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
