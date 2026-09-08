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

  it('thiếu chỗ điền {issues} thì từ chối nạp', () => {
    expect(() =>
      parseAiPrompts({ version: '1.0.0', program: { system: 'x', repair: 'no placeholder' } }),
    ).toThrow(AiPromptsError);
  });
});
