/**
 * Kiến trúc sư sửa diện tích đề xuất trước khi chốt — canh ba luật và danh tính của bản chốt.
 */

import { describe, expect, it } from 'vitest';
import { applyProgramEdits, parseAreaInput, type SpaceProgram } from '../design';

function program(): SpaceProgram {
  return {
    schema_version: '1.1.0',
    brief_ref: `sha256:${'a'.repeat(64)}`,
    spaces: [
      {
        id: 'living_1',
        type: 'living',
        floor: 1,
        min_area_m2: 58,
        target_area_m2: 60,
        max_area_m2: 70,
        min_source: 'brief',
        target_source: 'program',
      },
      {
        id: 'kitchen_1',
        type: 'kitchen',
        floor: 1,
        min_area_m2: 6,
        target_area_m2: 12,
        max_area_m2: 20,
        min_source: 'practice',
        target_source: 'program',
      },
      {
        id: 'bedroom_1',
        type: 'bedroom',
        floor: 2,
        min_area_m2: 9,
        target_area_m2: 15,
        max_area_m2: 25,
        min_source: 'rule_pack',
        target_source: 'program',
      },
    ],
    floor_allocation: [
      { floor: 1, usable_area_m2: 80, buildable_area_m2: 100, allocated_area_m2: 72 },
      { floor: 2, usable_area_m2: 80, buildable_area_m2: 100, allocated_area_m2: 15 },
    ],
  };
}

describe('applyProgramEdits', () => {
  it('không sửa gì thì trả về ĐÚNG bản chương trình — không thêm trường, không làm tròn lại', () => {
    const base = program();
    const result = applyProgramEdits(base, []);
    expect(result.program).toEqual(base);
    expect(result.edits).toEqual([]);
    expect('architect_edits' in result.program).toBe(false);
  });

  it('sửa về đúng số đề xuất thì không tính là một chỗ sửa', () => {
    const result = applyProgramEdits(program(), [{ space_id: 'kitchen_1', target_area_m2: 12 }]);
    expect(result.edits).toEqual([]);
    expect(result.program).toEqual(program());
  });

  it('chặn khi xuống dưới tối thiểu, và nói tối thiểu ấy là của ai', () => {
    const result = applyProgramEdits(program(), [{ space_id: 'living_1', target_area_m2: 40 }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.spaceId).toBe('living_1');
    expect(result.errors[0]!.message).toContain('nhỏ hơn tối thiểu 58 m²');
    expect(result.errors[0]!.message).toContain('khách khai ở đầu bài');
  });

  it('ghi chỗ sửa, đánh dấu nguồn là kiến trúc sư, cộng lại tổng tầng', () => {
    const result = applyProgramEdits(program(), [{ space_id: 'kitchen_1', target_area_m2: 16.04 }]);
    expect(result.errors).toEqual([]);
    const kitchen = result.program.spaces.find((s) => s.id === 'kitchen_1')!;
    expect(kitchen.target_area_m2).toBe(16);
    expect(kitchen.target_source).toBe('architect');
    expect(result.program.architect_edits).toEqual([{ space_id: 'kitchen_1', target_area_m2: 16 }]);
    expect(result.program.floor_allocation![0]!.allocated_area_m2).toBe(76);
  });

  it('vượt mức rộng rãi của chuẩn nghề: được, nhưng cảnh báo và nới cận trên', () => {
    const result = applyProgramEdits(program(), [{ space_id: 'bedroom_1', target_area_m2: 30 }]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.message.includes('vượt mức rộng rãi'))).toBe(true);
    expect(result.program.spaces.find((s) => s.id === 'bedroom_1')!.max_area_m2).toBe(30);
  });

  it('tổng tầng vượt sàn xây được thì chặn; vượt sàn đang dùng thì nới sàn chung và nói ra', () => {
    const over = applyProgramEdits(program(), [{ space_id: 'living_1', target_area_m2: 95 }]);
    expect(over.errors.map((e) => e.message)).toEqual([
      'Tầng 1: tổng diện tích các không gian 107 m² vượt sàn xây được 100 m².',
    ]);

    const grow = applyProgramEdits(program(), [{ space_id: 'living_1', target_area_m2: 75 }]);
    expect(grow.errors).toEqual([]);
    expect(grow.program.floor_allocation!.map((f) => f.usable_area_m2)).toEqual([87, 87]);
    expect(grow.warnings.some((w) => w.message.includes('nới từ 80 m² lên 87 m²'))).toBe(true);
  });

  it('chỗ sửa trỏ vào không gian đã biến mất thì chặn — đầu bài đã đổi', () => {
    const result = applyProgramEdits(program(), [{ space_id: 'study_1', target_area_m2: 10 }]);
    expect(result.errors[0]!.message).toContain('không còn trong chương trình');
  });

  it('danh sách sửa xếp theo mã, để cùng nội dung ra cùng mã băm', () => {
    const result = applyProgramEdits(program(), [
      { space_id: 'living_1', target_area_m2: 62 },
      { space_id: 'bedroom_1', target_area_m2: 18 },
    ]);
    expect(result.edits.map((e) => e.space_id)).toEqual(['bedroom_1', 'living_1']);
  });
});

describe('parseAreaInput', () => {
  it('nhận dấu phẩy thập phân kiểu Việt và dấu chấm', () => {
    expect(parseAreaInput('12,5')).toBe(12.5);
    expect(parseAreaInput(' 12.5 ')).toBe(12.5);
    expect(parseAreaInput('20')).toBe(20);
  });

  it('chữ lạ, số âm, ô rỗng thì trả rỗng', () => {
    expect(parseAreaInput('')).toBeNull();
    expect(parseAreaInput('-3')).toBeNull();
    expect(parseAreaInput('12m2')).toBeNull();
  });
});
