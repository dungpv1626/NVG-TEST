/**
 * Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2) — kiểm mã lúc lưu, và dựng khối yêu cầu cho lời dẫn.
 *
 * Haan chốt 19/09/2026: mục kỹ sư đã điền là BẮT BUỘC, mục bỏ trống để AI đề xuất. Phần «bắt buộc»
 * được bảo đảm ở hai tầng: lời dẫn ghi rõ REQUIRED (để mô hình dựng phần còn lại cho hợp), và hàm
 * ghép (`merge.ts`) áp thẳng mọi mục chương trình tự áp được. Chỉ những thứ chương trình không tự đặt
 * được toạ độ (chi tiết trang trí, có cổng) mới phải trông vào mô hình — `check.ts` canh chúng.
 */

import type { AiFacadeBrief } from '@nvg/shared/design';
import type { FacadeVocabulary, VocabEntry } from '../../kb/facade-vocabulary';
import { scrubIdentity } from '../../brief/anonymise';

export const FACADE_BRIEF_SCHEMA_VERSION = '1.0.0';

/**
 * Tên tiếng Việt của từng mục trong phiếu — để câu lỗi nói ĐƯỢC mục nào hỏng.
 *
 * Trước 20/09/2026 câu lỗi duy nhất là «Phiếu yêu cầu chưa đúng. Kiểm tra lại các ô đã điền»: đúng
 * nhưng vô dụng, phiếu có mười bốn mục. Xảy ra thật khi kỹ sư tick 7 ô trang trí trong lúc hợp đồng
 * chặn ở 6 — không có cách nào đoán ra từ màn hình (CGD 5.5: lỗi phải nói việc gì hỏng và cần làm gì).
 */
const BRIEF_FIELD_VI: Readonly<Record<string, string>> = {
  style: 'Phong cách',
  ground_raise_cm: 'Cốt sàn tầng 1 so với vỉa hè',
  roof: 'Mái',
  palette: 'Màu sơn',
  surfaces: 'Vật liệu mặt tiền',
  main_door: 'Cửa chính',
  side_door: 'Cửa phụ, cửa ra ban công',
  window: 'Cửa sổ',
  garage_door: 'Cửa để xe',
  balcony: 'Lan can ban công',
  railing: 'Lan can',
  gate: 'Cổng',
  fence: 'Tường rào',
  decorations: 'Chi tiết trang trí mong muốn',
  notes: 'Ghi chú',
};

/**
 * Một lỗi hợp đồng của phiếu, viết thành câu tiếng Việt.
 *
 * Chữ của Zod là tiếng Anh và nói theo ngôn ngữ kiểu dữ liệu («Array must contain at most 6
 * element(s)»), nên KHÔNG đem thẳng lên màn hình (CLAUDE.md 4.1). Ở đây đổi sang lý do người đọc
 * hiểu; loại lỗi lạ thì nói mục nào hỏng chứ không im.
 */
export function facadeBriefIssueText(issue: {
  path: PropertyKey[];
  code: string;
  message: string;
  maximum?: number | bigint;
  minimum?: number | bigint;
}): string {
  const field = String(issue.path[0] ?? '');
  const label = BRIEF_FIELD_VI[field] ?? field;
  const sub = issue.path.length > 1 ? ` (${issue.path.slice(1).join('.')})` : '';
  switch (issue.code) {
    case 'too_big':
      return `${label}${sub}: chọn quá nhiều, tối đa ${String(issue.maximum ?? '')} mục.`;
    case 'too_small':
      return `${label}${sub}: giá trị nhỏ hơn mức cho phép${issue.minimum === undefined ? '' : ` (${String(issue.minimum)})`}.`;
    case 'invalid_enum_value':
    case 'invalid_literal':
      return `${label}${sub}: giá trị không có trong danh mục.`;
    case 'invalid_type':
      return `${label}${sub}: chưa điền hoặc sai kiểu dữ liệu.`;
    default:
      return `${label}${sub}: giá trị không hợp lệ.`;
  }
}

/** Phiếu trống — mọi mục «để AI đề xuất». */
export function emptyFacadeBrief(savedAt = new Date(0).toISOString()): AiFacadeBrief {
  const finish = () => ({ material: null, colour: null });
  const door = () => ({ material: null, colour: null, type: null, h_cm: null });
  return {
    saved_at: savedAt,
    schema_version: FACADE_BRIEF_SCHEMA_VERSION,
    plan_ref: null,
    style: null,
    ground_raise_cm: null,
    roof: { type: null, material: null, colour: null, pitch_deg: null, parapet_cm: null },
    palette: { primary: null, secondary: null, accent: null },
    surfaces: { body: finish(), base: finish(), accent: finish(), trim: finish() },
    main_door: door(),
    side_door: door(),
    window: { material: null, colour: null, glass: null },
    garage_door: { type: null, material: null, colour: null },
    balcony: { railing: null, colour: null, material: null, h_cm: null },
    gate: { wanted: null, type: null, material: null, colour: null, h_cm: null },
    fence: { type: null, material: null, colour: null, h_cm: null },
    decorations: [],
    notes: null,
  };
}

/**
 * Mã trong phiếu phải có trong danh mục — kiểm lúc LƯU, để phiếu hỏng không bao giờ tới được lượt gọi
 * tính tiền. Trả danh sách lỗi tiếng Việt, rỗng = hợp lệ.
 */
export function checkFacadeBriefCodes(brief: AiFacadeBrief, vocab: FacadeVocabulary): string[] {
  const issues: string[] = [];
  const code = (
    table: Record<string, unknown>,
    value: string | null | undefined,
    where: string,
  ) => {
    if (value && !(value in table)) issues.push(`${where}: mã «${value}» không có trong danh mục.`);
  };
  code(vocab.roofMaterials, brief.roof.material, 'Vật liệu mái');
  code(vocab.colours, brief.roof.colour, 'Màu mái');
  for (const [key, value] of Object.entries(brief.palette))
    code(vocab.colours, value, `Màu ${key}`);
  for (const [zone, finish] of Object.entries(brief.surfaces)) {
    code(vocab.materials, finish.material, `Vật liệu ${vocab.zones[zone] ?? zone}`);
    code(vocab.colours, finish.colour, `Màu ${vocab.zones[zone] ?? zone}`);
  }
  for (const [label, door] of [
    ['Cửa chính', brief.main_door],
    ['Cửa phụ', brief.side_door],
  ] as const) {
    code(vocab.doorMaterials, door.material, `${label} — vật liệu`);
    code(vocab.colours, door.colour, `${label} — màu`);
    code(vocab.doorTypes, door.type, `${label} — kiểu mở`);
  }
  code(vocab.doorMaterials, brief.window.material, 'Cửa sổ — vật liệu khung');
  code(vocab.colours, brief.window.colour, 'Cửa sổ — màu khung');
  code(vocab.glassTypes, brief.window.glass, 'Cửa sổ — loại kính');
  code(vocab.garageDoorTypes, brief.garage_door.type, 'Cửa để xe — kiểu');
  code(vocab.doorMaterials, brief.garage_door.material, 'Cửa để xe — vật liệu');
  code(vocab.colours, brief.garage_door.colour, 'Cửa để xe — màu');
  code(vocab.railings, brief.balcony.railing, 'Lan can ban công');
  code(vocab.materials, brief.balcony.material, 'Vật liệu lan can');
  code(vocab.colours, brief.balcony.colour, 'Màu lan can');
  code(vocab.materials, brief.gate.material, 'Vật liệu cổng');
  code(vocab.colours, brief.gate.colour, 'Màu cổng');
  code(vocab.fenceTypes, brief.fence.type, 'Kiểu tường rào');
  code(vocab.materials, brief.fence.material, 'Vật liệu tường rào');
  code(vocab.colours, brief.fence.colour, 'Màu tường rào');
  code(vocab.roofTypes, brief.roof.type, 'Loại mái');
  code(vocab.gateTypes, brief.gate.type, 'Kiểu cổng');
  for (const element of brief.decorations) code(vocab.elements, element, 'Chi tiết trang trí');

  // Số đo của phiếu đi THẲNG vào khung, không qua `checkFacade` — nên khoảng dựng được phải kiểm ở
  // đây. Hợp đồng cho tường chắn mái tới 300 cm trong khi bộ vẽ chỉ dựng nổi tới `limits.parapet_cm`.
  const within = (
    value: number | null | undefined,
    [low, high]: readonly [number, number],
    where: string,
  ) => {
    if (typeof value === 'number' && (value < low || value > high)) {
      issues.push(`${where}: ${value} cm, phải trong khoảng ${low}–${high} cm.`);
    }
  };
  within(brief.roof.parapet_cm, vocab.limits.parapet_cm, 'Tường chắn mái cao');
  within(brief.gate.h_cm, vocab.limits.gate_h_cm, 'Cổng cao');
  within(brief.fence.h_cm, vocab.limits.fence_h_cm, 'Tường rào cao');
  return issues;
}

/**
 * Khối `<requirements>` của lời dẫn: mỗi mục đã điền một dòng «REQUIRED», mục trống gộp một dòng
 * «left to you». Ghi MÃ kèm cụm tiếng Anh, để mô hình dùng đúng mã trong câu trả lời.
 */
export function facadeRequirementsText(
  brief: AiFacadeBrief | null,
  vocab: FacadeVocabulary,
  frame?: { frontYard: boolean },
): string {
  if (!brief) return 'The architect has not filled in any requirement — every choice is yours.';
  const lines: string[] = [];
  const open: string[] = [];
  const phrase = (table: Record<string, VocabEntry>, value: string | null) =>
    value ? `${value} (${table[value]?.prompt_en ?? value})` : null;
  const need = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') open.push(label);
    else lines.push(`- REQUIRED ${label}: ${value}`);
  };

  need('style', brief.style);
  need('roof type', brief.roof.type);
  need('roof material', phrase(vocab.roofMaterials, brief.roof.material));
  need('roof colour', phrase(vocab.colours, brief.roof.colour));
  need('roof pitch (degrees)', brief.roof.pitch_deg);
  // Tường chắn mái chỉ có nghĩa với mái bằng — `mergeFacade` bỏ nó ở mái dốc. Vẫn khai REQUIRED
  // là dặn mô hình một thứ chương trình sẽ vứt đi, và kỹ sư không thấy mình bị bỏ yêu cầu.
  if (brief.roof.type === null || brief.roof.type === 'flat') {
    need('parapet height (cm)', brief.roof.parapet_cm);
  }
  need('primary colour', phrase(vocab.colours, brief.palette.primary));
  need('secondary colour', phrase(vocab.colours, brief.palette.secondary));
  need('accent colour', phrase(vocab.colours, brief.palette.accent));
  for (const zone of ['body', 'base', 'accent', 'trim'] as const) {
    need(`${zone} material`, phrase(vocab.materials, brief.surfaces[zone].material));
    need(`${zone} colour`, phrase(vocab.colours, brief.surfaces[zone].colour));
  }
  for (const [zone, door] of [
    ['main_door', brief.main_door],
    ['side_door', brief.side_door],
  ] as const) {
    need(`${zone} material`, phrase(vocab.doorMaterials, door.material));
    need(`${zone} colour`, phrase(vocab.colours, door.colour));
    need(`${zone} style`, phrase(vocab.doorTypes, door.type));
  }
  need('window frame material', phrase(vocab.doorMaterials, brief.window.material));
  need('window frame colour', phrase(vocab.colours, brief.window.colour));
  need('window glass', phrase(vocab.glassTypes, brief.window.glass));
  need('garage door style', phrase(vocab.garageDoorTypes, brief.garage_door.type));
  need('garage door material', phrase(vocab.doorMaterials, brief.garage_door.material));
  need('garage door colour', phrase(vocab.colours, brief.garage_door.colour));
  need('balcony railing', phrase(vocab.railings, brief.balcony.railing));
  need('railing material', phrase(vocab.materials, brief.balcony.material ?? null));
  need('railing colour', phrase(vocab.colours, brief.balcony.colour));
  // Chiều cao lan can KHÔNG vào khối yêu cầu: bộ vẽ đặt số ấy, mô hình không vẽ nét nào của lan
  // can (T15). Gửi đi là tiêu chữ cho một thứ mô hình không cầm.
  // Nhà sát ranh mặt tiền: khung đã nói «gate and fence must be null», nên khai thêm yêu cầu cổng
  // là gửi đi hai câu ngược nhau trong cùng một lời gọi tính tiền. `mergeFacade` cũng bỏ cổng ở
  // trường hợp này — màn hình phải nói rõ thay vì để lời dẫn tự mâu thuẫn.
  if (frame?.frontYard !== false) {
    need(
      'gate',
      brief.gate.wanted === null ? null : brief.gate.wanted ? 'yes, draw a gate' : 'no gate',
    );
    if (brief.gate.wanted !== false) {
      need('gate type', brief.gate.type);
      need('gate material', phrase(vocab.materials, brief.gate.material));
      need('gate colour', phrase(vocab.colours, brief.gate.colour));
      need('gate height (cm)', brief.gate.h_cm);
    }
    need('fence type', phrase(vocab.fenceTypes, brief.fence.type));
    need('fence material', phrase(vocab.materials, brief.fence.material));
    need('fence colour', phrase(vocab.colours, brief.fence.colour));
    need('fence height (cm)', brief.fence.h_cm);
  }
  if (brief.decorations.length) {
    lines.push(
      `- REQUIRED decorative elements, at least one of each: ${brief.decorations.join(', ')}`,
    );
  } else {
    open.push('decorative elements');
  }

  const out = [
    'Everything marked REQUIRED was chosen by the architect: use exactly that code or value.',
    ...lines,
  ];
  if (open.length) out.push(`Left to you: ${open.join(', ')}.`);
  if (brief.notes?.trim()) {
    // Ô chữ tự do đi tới nhà cung cấp mô hình, nên qua cùng bộ lược với mọi ô chữ khác của nhánh AI
    // (số điện thoại, email, mã hồ sơ, dãy số dài). Tên riêng vẫn phải trông vào câu nhắc trên màn
    // hình — danh sách danh tính không có ở bước này.
    const notes = scrubIdentity(brief.notes.trim());
    out.push(`Architect's notes (Vietnamese, treat as requirements): ${notes}`);
  }
  return out.join('\n');
}
