/**
 * Lời dẫn nhánh AI (`kb/ai_design_prompts.yaml`): nạp được, đúng hình, và giữ đúng ranh giới
 * ngôn ngữ — lời dẫn tiếng Anh (ngoại lệ có bằng chứng của quy tắc 100% tiếng Việt), còn phần
 * mô hình trả cho người đọc phải được yêu cầu bằng tiếng Việt ngay trong lời dẫn.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import { AiPromptsError, parseAiPrompts } from '../ai/prompts';
import { ARRANGE_ISSUE_CODES, REVISABLE_CODES } from '../ai/arrange';

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

  it('bước mặt bằng có đủ lời dẫn, lời dẫn lấy mẫu lại và ba ý đồ bố cục', () => {
    expect(prompts.floorLevel.system.length).toBeGreaterThan(200);
    expect(prompts.floorLevel.resample).toContain('{avoid}');
    expect(prompts.floorLevel.strategies.length).toBeGreaterThanOrEqual(3);
    const ids = prompts.floorLevel.strategies.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lời dẫn mặt bằng cũng là tiếng Anh, nhãn phương án thì tiếng Việt', () => {
    // Ngoại lệ duy nhất: tên mục đầu bài trích trong «…» — đó là chữ mô hình phải tìm thấy trong
    // `<brief>` (T46), dịch ra tiếng Anh thì không khớp được.
    const body = prompts.floorLevel.system
      .replace(/«[^»]*»/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/Vietnamese \(có dấu\)/g, '');
    expect(body.split('\n').filter((l) => vietnamese.test(l))).toEqual([]);
    for (const item of prompts.floorLevel.strategies) {
      // `strategy` đi vào lời dẫn nên phải là tiếng Anh; `label` hiện trên màn hình nên phải là
      // tiếng Việt (CLAUDE.md 4.1). Hai trường cạnh nhau, hai ngôn ngữ, có chủ đích.
      expect(vietnamese.test(item.strategy), item.id).toBe(false);
      expect(vietnamese.test(item.label), item.id).toBe(true);
    }
  });

  it('lời dẫn mặt bằng không có ví dụ mẫu — lược đồ strict đã ép hình dạng đầu ra (T46)', () => {
    // Ví dụ nhà ống 13 phòng từng chiếm ~3.000 ký tự mỗi lượt gọi và kéo mô hình về bố cục nhà ống.
    expect(prompts.floorLevel.system).not.toMatch(/<example>/);
  });

  it('lời dẫn mặt bằng KHÔNG nói một con số kích thước nào — mọi số là việc của bộ giải (T43)', () => {
    // Một «tối thiểu 60 cm» trong lời dẫn là mời mô hình làm số học hai chiều — đúng thứ T43 gỡ. Diện
    // tích mục tiêu là của mô hình từ T45, nhưng mọi con số nó phải khớp vẫn đi trong `<knowledge>`.
    const body = prompts.floorLevel.system.replace(/<example>[\s\S]*?<\/example>/g, '');
    expect(body).not.toMatch(/\d+(\.\d+)?\s*(cm|mm|m²|m2)\b/);
    expect(body).not.toMatch(/"cut"|`at`|unbuilt_N|void_N/);
  });

  it('mọi mã lỗi của bộ giải và mọi mã gọi lại được có một dòng ghi chú cho lượt sửa ý định', () => {
    // Thiếu dòng thì lượt sửa chỉ nhận câu mặc định chung chung, và mô hình mắc lại đúng lỗi.
    const missing = [...ARRANGE_ISSUE_CODES, ...REVISABLE_CODES].filter(
      (code) => !prompts.floorLevel.hints[code],
    );
    expect(missing).toEqual([]);
    for (const [code, line] of Object.entries(prompts.floorLevel.hints)) {
      expect(vietnamese.test(line), code).toBe(false);
    }
  });

  it('lấy mẫu lại KHÔNG gửi bản cũ; lượt sửa ý định thì gửi — ý định cả nhà vài KB (T43, T45)', () => {
    expect(prompts.floorLevel.resample).not.toMatch(/PATCH|previous`|\{intent\}/);
    expect(prompts.floorLevel.revise).toContain('{intent}');
    expect(prompts.floorLevel.revise).toContain('{avoid}');
    // `area_m2` không còn trong danh sách cấm: từ T45 lời dẫn nói về cột diện tích TỐI THIỂU của đầu bài
    // (`brief_spaces[].area_m2`). Phần hình học của cây chia thì vẫn cấm.
    expect(prompts.floorLevel.system).not.toMatch(/`rect`|`edge`|`hinge`|centreline gap/);
  });

  it('thiếu chỗ điền {issues} hoặc {avoid} thì từ chối nạp', () => {
    expect(() =>
      parseAiPrompts({ version: '1.0.0', program: { system: 'x', repair: 'no placeholder' } }),
    ).toThrow(AiPromptsError);
    const floor = (raw as { floor_level: Record<string, unknown> }).floor_level;
    expect(() =>
      parseAiPrompts({
        ...(raw as object),
        floor_level: { ...floor, resample: 'no placeholder' },
      }),
    ).toThrow(AiPromptsError);
  });
});

/**
 * Lời dẫn và HỢP ĐỒNG là hai tệp dữ liệu tách rời, và Worker chép từ tệp này sang tệp kia.
 *
 * Không có phép thử nối hai bên thì chúng trôi khỏi nhau một cách hoàn toàn im lặng. Đã xảy ra
 * thật ngày 11/09/2026: hợp đồng khai `strategy` tối đa **200** ký tự — một con số phỏng đoán —
 * trong khi ba ý đồ bố cục thật dài **241–301**. Hệ quả không phải «đôi khi hỏng» mà là **mọi
 * lượt ghi đều hỏng**, và hỏng ở bước CUỐI: mô hình đã chạy xong, đã sửa xong, đã kiểm lại đạt,
 * rồi artifact bị hợp đồng từ chối. Hai lượt gọi trả tiền, không ghi được gì.
 *
 * Hai fixture không bắt được vì chúng dùng câu tiếng Việt tự viết dài 76–83 ký tự, chứ không
 * phải đoạn tiếng Anh thật mà Worker chép vào. Fixture không trung thực thì không canh được gì.
 */
describe('Lời dẫn phải vừa hợp đồng mà Worker sẽ ghi', () => {
  const plan = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../contracts/ai-floor-plan.schema.json', import.meta.url)),
      'utf8',
    ),
  ) as { properties: Record<string, { maxLength?: number }> };

  it('mọi ý đồ bố cục lọt trần `strategy`', () => {
    const cap = plan.properties.strategy?.maxLength;
    expect(cap, 'hợp đồng phải khai trần cho `strategy`').toBeTypeOf('number');
    for (const item of prompts.floorLevel.strategies) {
      expect(
        item.strategy.length,
        `${item.id} dài ${item.strategy.length}, trần ${cap}`,
      ).toBeLessThanOrEqual(cap!);
    }
  });

  it('mọi nhãn phương án lọt trần `variant_label`', () => {
    // Worker điền nhãn này khi mô hình không tự khai nhãn riêng — cùng đường vấp với `strategy`.
    const cap = plan.properties.variant_label?.maxLength;
    expect(cap).toBeTypeOf('number');
    for (const item of prompts.floorLevel.strategies) {
      expect(item.label.length, `${item.id}: ${item.label}`).toBeLessThanOrEqual(cap!);
    }
  });

  it('trần còn CHỖ THỞ, không vừa khít', () => {
    // Vừa khít nghĩa là lần chỉnh lời dẫn tiếp theo sẽ phá hợp đồng. Ý đồ bố cục là thứ sẽ dài
    // ra sau mỗi lần đo, nên trần phải rộng hơn hẳn bản dài nhất hiện có.
    const cap = plan.properties.strategy!.maxLength!;
    const longest = Math.max(...prompts.floorLevel.strategies.map((s) => s.strategy.length));
    expect(cap, `dài nhất ${longest}, trần ${cap}`).toBeGreaterThan(longest * 1.5);
  });
});

/**
 * Khối `sheet_image` (T57) — lời dẫn vẽ tờ mặt bằng có nội thất.
 *
 * Ranh giới ngôn ngữ ở đây KHÁC hai khối trên, và khác có chủ đích: `system`/`user` đi tới mô hình
 * nên phải là tiếng Anh, còn `styles` và `watermark` thì không. `watermark` là câu in lên ảnh cho
 * NGƯỜI XEM đọc, nên nó phải là tiếng Việt (CLAUDE.md 4.1) — loại nó khỏi phép soi dấu là một
 * ngoại lệ có lý do, không phải một chỗ bỏ sót.
 */
describe('sheet_image — tờ mặt bằng có nội thất (T57)', () => {
  it('lời dẫn gửi đi là tiếng Anh; câu nhãn in lên ảnh là tiếng Việt', () => {
    for (const body of [prompts.sheetImage.system, prompts.sheetImage.user]) {
      expect(body.split('\n').filter((l) => vietnamese.test(l))).toEqual([]);
    }
    for (const line of Object.values(prompts.sheetImage.styles)) {
      expect(vietnamese.test(line), line).toBe(false);
    }
    expect(vietnamese.test(prompts.sheetImage.watermark)).toBe(true);
  });

  it('câu nhãn in lên ảnh trùng nguyên văn bản trong `shared` — hai nơi, một câu', () => {
    // Trình duyệt KHÔNG đọc được `kb/`, nên khi xem lại một tờ đã vẽ từ phiên trước nó phải đóng
    // dấu bằng bản trong `shared`. Hai chuỗi lệch nhau thì cùng một tấm ảnh mang hai câu khác nhau
    // tuỳ lúc xem — và bản trong `shared` là bản đi kèm tấm tải về.
    expect(prompts.sheetImage.watermark).toBe(AI_DISCLAIMERS.aiSheetImageStamp);
    expect(AI_DISCLAIMERS.aiSheetImageStamp).toMatch(/không đo được/);
  });

  it('nói ra rằng ảnh đính kèm là hình học có thẩm quyền — khác biệt duy nhất với T21', () => {
    const system = prompts.sheetImage.system.replace(/\s+/g, ' ');
    expect(system).toMatch(/THE ATTACHED DRAWING IS THE AUTHORITY/);
  });

  it('cấm mô hình viết mã hồ sơ, tên người hay ngày vào khung tên', () => {
    const system = prompts.sheetImage.system.replace(/\s+/g, ' ');
    expect(system).toMatch(/never write a client name, an address, a project\s*code/i);
  });

  it('thiếu một chỗ điền thì báo ngay lúc NẠP, không đợi tới khi đã trả tiền một tấm ảnh', () => {
    const broken = {
      ...(raw as Record<string, unknown>),
      sheet_image: {
        ...prompts.sheetImage,
        user: 'Storey: {level_name}\n{rooms}',
      },
    };
    expect(() => parseAiPrompts(broken)).toThrow(AiPromptsError);
    expect(() => parseAiPrompts(broken)).toThrow(/\{title_block\}/);
  });

  it('thiếu hẳn khối thì cũng báo lúc nạp', () => {
    const without = { ...(raw as Record<string, unknown>) };
    delete without.sheet_image;
    expect(() => parseAiPrompts(without)).toThrow(AiPromptsError);
  });
});
