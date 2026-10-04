/**
 * Phần MẶT ĐỨNG của đầu bài (T114, 03/10/2026) — gộp phiếu mặt đứng T59 vào đầu bài.
 *
 * Canh ba điều:
 *  1. hợp đồng `design-brief.facade` khớp `ai-facade-brief` từng mục — hai bản chép của cùng một
 *     phiếu, lệch thì biểu mẫu đầu bài lưu được thứ bước mặt đứng không đọc nổi (hoặc ngược lại);
 *  2. đổi qua lại đầu bài ↔ phiếu không mất mục nào, và mục thiếu là «để AI đề xuất» (`null`),
 *     không bao giờ là một giá trị mặc định;
 *  3. mỗi câu của biểu mẫu nằm trong một phần, và nhãn `for` chỉ trỏ tới ba lời gọi đã biết.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRIEF_FORM,
  BRIEF_PART_TARGETS,
  briefFacadeFromFacadeBrief,
  countFacadeAnswers,
  designBriefSchema,
  emptyFacadeBrief,
  facadeBriefFromBrief,
  fieldTargets,
} from '../design';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(root(p), 'utf8'));

describe('Hợp đồng: phần mặt đứng của đầu bài khớp phiếu mặt đứng', () => {
  const brief = json('contracts/design-brief.schema.json');
  const facade = json('contracts/ai-facade-brief.schema.json');
  const SERVER_KEYS = ['schema_version', 'saved_at', 'plan_ref', 'style'];

  it('cùng bộ mục, trừ ba khoá máy chủ và `style` (đầu bài có câu phong cách riêng)', () => {
    const expected = Object.keys(facade.properties).filter((k) => !SERVER_KEYS.includes(k));
    expect(Object.keys(brief.properties.facade.properties).sort()).toEqual(expected.sort());
  });

  it('từng mục giống hệt, chỉ khác tiền tố tên định nghĩa dùng chung', () => {
    for (const key of Object.keys(brief.properties.facade.properties)) {
      const mine = JSON.stringify(brief.properties.facade.properties[key]).replaceAll(
        '#/$defs/facade_',
        '#/$defs/',
      );
      const theirs = { ...facade.properties[key] };
      // Mô tả của ghi chú được viết lại cho người khai đầu bài; hình dạng phải giữ nguyên.
      if (key === 'notes') delete theirs.description;
      const mineObj = JSON.parse(mine);
      if (key === 'notes') delete mineObj.description;
      expect(mineObj, key).toEqual(theirs);
    }
    for (const def of ['code_or_null', 'finish', 'door']) {
      expect(
        JSON.parse(
          JSON.stringify(brief.$defs[`facade_${def}`]).replaceAll('#/$defs/facade_', '#/$defs/'),
        ),
        def,
      ).toEqual(facade.$defs[def]);
    }
  });
});

describe('Đổi qua lại đầu bài ↔ phiếu', () => {
  it('đầu bài chưa có phần mặt đứng → phiếu trống, phong cách lấy từ đầu bài', () => {
    const out = facadeBriefFromBrief(undefined, 'indochine');
    expect(out).toEqual({ ...emptyFacadeBrief(), style: 'indochine' });
  });

  it('mục thiếu ở cấp nào cũng thành `null` — không điền mặc định', () => {
    const out = facadeBriefFromBrief(
      { roof: { type: 'hip' } as never, gate: { wanted: false } as never },
      null,
    );
    expect(out.roof).toEqual({
      type: 'hip',
      material: null,
      colour: null,
      pitch_deg: null,
      parapet_cm: null,
    });
    expect(out.gate).toEqual({
      wanted: false,
      type: null,
      material: null,
      colour: null,
      h_cm: null,
    });
    expect(out.ground_raise_cm).toBeNull();
  });

  it('phiếu → đầu bài → phiếu giữ nguyên mọi mục; phần ghi vào đầu bài qua được hợp đồng', () => {
    const filled = emptyFacadeBrief();
    filled.style = 'hien_dai';
    filled.ground_raise_cm = 45;
    filled.roof.type = 'flat';
    filled.roof.parapet_cm = 90;
    filled.palette.primary = 'trang';
    filled.surfaces.base = { material: 'da_granite', colour: 'xam_dam' };
    filled.main_door = { material: 'go', colour: 'nau', type: 'swing', h_cm: 270 };
    filled.balcony = { railing: 'kinh', colour: 'den', material: 'kinh', h_cm: 110 };
    filled.decorations = ['canopy', 'louvre'];
    filled.notes = 'Mặt tiền ít chi tiết';

    const part = briefFacadeFromFacadeBrief(filled);
    expect(part).not.toHaveProperty('style');
    expect(part).not.toHaveProperty('saved_at');
    expect(designBriefSchema.shape.facade.safeParse(part).success).toBe(true);

    expect(facadeBriefFromBrief(part, 'hien_dai')).toEqual(filled);
  });

  it('đếm mục đã chốt — để màn hình chỉ xem không đổ mã danh mục ra', () => {
    expect(countFacadeAnswers(undefined)).toBe(0);
    expect(countFacadeAnswers(briefFacadeFromFacadeBrief(emptyFacadeBrief()))).toBe(0);
    expect(
      countFacadeAnswers({ roof: { type: 'hip' } as never, decorations: ['canopy', 'arch'] }),
    ).toBe(3);
  });
});

describe('Ba phần của biểu mẫu và nhãn `for`', () => {
  it('đủ ba phần theo đúng thứ tự Chung · Mặt bằng · Mặt đứng', () => {
    expect(BRIEF_FORM.parts.map((p) => p.id)).toEqual(['chung', 'mat_bang', 'mat_dung']);
  });

  it('phong cách và phiếu mặt đứng nằm ở phần Mặt đứng — không đi vào lời gọi mặt bằng', () => {
    for (const path of ['style', 'legacy.style_note', 'facade']) {
      const section = BRIEF_FORM.sections.find((s) => s.fields.some((f) => f.path === path))!;
      const field = section.fields.find((f) => f.path === path)!;
      expect(section.part, path).toBe('mat_dung');
      expect(fieldTargets(section, field), path).not.toContain('plan');
    }
  });

  it('câu dùng chéo khai `for` tường minh; câu không khai theo phần chứa nó', () => {
    const at = (path: string) => {
      const section = BRIEF_FORM.sections.find((s) => s.fields.some((f) => f.path === path))!;
      return fieldTargets(
        section,
        section.fields.find((f) => f.path === path)!,
      );
    };
    expect(at('site.orientation')).toEqual(BRIEF_PART_TARGETS.chung);
    expect(at('site.setback_required_m')).toEqual(['plan', 'perspective']);
    expect(at('site.boundary_m')).toEqual(['plan']);
    expect(at('massing.yards')).toEqual(['plan', 'facade', 'perspective']);
    expect(at('family')).toEqual(['plan']);
  });

  it('mọi câu của phần Mặt bằng đều đi vào lời gọi mặt bằng — khai `for` không được làm rơi nó', () => {
    for (const section of BRIEF_FORM.sections.filter((s) => s.part !== 'mat_dung')) {
      for (const field of section.fields) {
        if (section.part === 'mat_bang')
          expect(fieldTargets(section, field), field.path).toContain('plan');
      }
    }
  });
});
