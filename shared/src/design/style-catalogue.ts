/**
 * Bộ đặc trưng phong cách (`kb/style_catalogue.yaml`, T175) — kiểu dữ liệu và phép so THUẦN, dùng chung
 * cho Worker (lời dẫn, hàm ghép, thước chấm) và giao diện (phiếu mặt đứng lọc lựa chọn theo phong cách).
 *
 * Phần đọc tệp YAML nằm ở Worker (`workers/src/design/kb/style-catalogue.ts`); giao diện nhận bộ đã
 * đọc qua `GET /design/ai/facade/vocabulary`. Ở đây không có số hay mã nào viết cứng — chỉ có cách
 * đọc một lựa chọn mặt đứng ra thành «nhóm mã + mã», để hai bên so cùng một kiểu.
 *
 * Phong cách là THẨM MỸ, không phải luật (T52): không hàm nào ở đây chặn gì. Mã ngoài tập hợp phong
 * cách chỉ thành cảnh báo, và kiến trúc sư vẫn chọn được.
 */

import type { AiFacadeBrief } from './ai-facade-brief.generated';
import type { AiFacadeConcept } from './ai-facade-concept.generated';

/** Nhóm mã của `kb/facade_vocabulary.yaml` mà một phong cách khai được tập «hợp phong cách». */
export const STYLE_CODE_GROUPS = [
  'roof_types',
  'roof_materials',
  'materials',
  'colours',
  'railings',
  'door_materials',
  'gate_types',
  'fence_types',
] as const;
export type StyleCodeGroup = (typeof STYLE_CODE_GROUPS)[number];

/**
 * Khoá của `match` trong một chi tiết `must` / `prefer` / `avoid`: các nhóm mã ở trên (khớp ở BẤT KỲ
 * vùng nào), cộng bốn khoá chỉ xét một vùng, cộng `elements` (mảng trang trí đã đặt / đã yêu cầu).
 */
export const STYLE_MATCH_KEYS = [
  ...STYLE_CODE_GROUPS,
  'body_materials',
  'base_materials',
  'body_colours',
  'roof_colours',
  'elements',
] as const;
export type StyleMatchKey = (typeof STYLE_MATCH_KEYS)[number];

/** Vùng chỉ định của bốn khoá một-vùng — so theo `field` của lựa chọn. */
const ZONE_KEYS: Readonly<Partial<Record<StyleMatchKey, string>>> = {
  body_materials: 'body.material',
  base_materials: 'base.material',
  body_colours: 'body.colour',
  roof_colours: 'roof.colour',
};

export interface StyleCue {
  /** Câu hiện trên màn hình. */
  vi: string;
  /** Câu gửi mô hình. */
  en: string;
  /** Mã danh mục mà chi tiết «có mặt» — khớp bất kỳ khoá nào là có. Vắng = không đo được bằng mã. */
  match?: Partial<Record<StyleMatchKey, readonly string[]>>;
}

export type StyleSymmetry = 'cao' | 'vua' | 'thap';

export interface StyleSpec {
  code: string;
  /** `de_xuat` = bản Claude Code soạn, chờ kiến trúc sư NVO duyệt. */
  status: string;
  label: string;
  moTa: string;
  prompt: { interior: string; exterior: string };
  must: StyleCue[];
  prefer: StyleCue[];
  avoid: StyleCue[];
  /** Mã hợp phong cách theo nhóm. Nhóm vắng = không giới hạn. */
  allowed: Partial<Record<StyleCodeGroup, readonly string[]>>;
  symmetry: StyleSymmetry;
  /** Tỷ lệ cao / rộng gợi ý của ô cửa sổ — chỉ vào lời dẫn. */
  windowHw: readonly [number, number] | null;
}

export interface StyleCatalogue {
  version: string;
  status: string;
  styles: Record<string, StyleSpec>;
}

/** Một mã đã chọn trên mặt đứng: ô nào (`field`), thuộc nhóm mã nào, mã gì. */
export interface FacadeSelection {
  /** Khoá ổn định của ô, giống nhau giữa phiếu và ý tưởng — `roof.type`, `body.material`… */
  field: string;
  group: StyleCodeGroup;
  code: string;
}

/** Nhãn tiếng Việt của ô — dùng trong câu cảnh báo. */
export const FACADE_SELECTION_LABEL: Readonly<Record<string, string>> = {
  'roof.type': 'Loại mái',
  'roof.material': 'Vật liệu mái',
  'roof.colour': 'Màu mái',
  'palette.primary': 'Màu chính',
  'palette.secondary': 'Màu phụ',
  'palette.accent': 'Màu nhấn',
  'body.material': 'Thân nhà — vật liệu',
  'body.colour': 'Thân nhà — màu',
  'base.material': 'Phần đế — vật liệu',
  'base.colour': 'Phần đế — màu',
  'accent.material': 'Mảng nhấn — vật liệu',
  'accent.colour': 'Mảng nhấn — màu',
  'trim.material': 'Chỉ, phào, khung — vật liệu',
  'trim.colour': 'Chỉ, phào, khung — màu',
  'main_door.material': 'Cửa chính — vật liệu',
  'main_door.colour': 'Cửa chính — màu',
  'side_door.material': 'Cửa phụ — vật liệu',
  'side_door.colour': 'Cửa phụ — màu',
  'window.material': 'Cửa sổ — vật liệu khung',
  'window.colour': 'Cửa sổ — màu khung',
  'garage_door.material': 'Cửa để xe — vật liệu',
  'garage_door.colour': 'Cửa để xe — màu',
  'balcony.railing': 'Kiểu lan can',
  'railing.material': 'Vật liệu lan can',
  'railing.colour': 'Màu lan can',
  'gate.type': 'Kiểu cổng',
  'gate.material': 'Vật liệu cổng',
  'gate.colour': 'Màu cổng',
  'fence.type': 'Kiểu tường rào',
  'fence.material': 'Vật liệu tường rào',
  'fence.colour': 'Màu tường rào',
};

/** Vùng cửa lấy vật liệu từ nhóm `door_materials` — cùng quy ước với `ai/facade/check.ts`. */
const DOOR_ZONES = new Set(['main_door', 'side_door', 'window', 'garage_door']);

function push(
  out: FacadeSelection[],
  field: string,
  group: StyleCodeGroup,
  code: string | null | undefined,
): void {
  if (!code || out.some((s) => s.field === field)) return;
  out.push({ field, group, code });
}

/** Mọi mã kỹ sư đã điền trên phiếu mặt đứng. Ô trống («để AI đề xuất») không thành lựa chọn. */
export function selectionsOfFacadeBrief(brief: AiFacadeBrief): FacadeSelection[] {
  const out: FacadeSelection[] = [];
  push(out, 'roof.type', 'roof_types', brief.roof.type);
  push(out, 'roof.material', 'roof_materials', brief.roof.material);
  push(out, 'roof.colour', 'colours', brief.roof.colour);
  for (const key of ['primary', 'secondary', 'accent'] as const) {
    push(out, `palette.${key}`, 'colours', brief.palette[key]);
  }
  for (const zone of ['body', 'base', 'accent', 'trim'] as const) {
    push(out, `${zone}.material`, 'materials', brief.surfaces[zone].material);
    push(out, `${zone}.colour`, 'colours', brief.surfaces[zone].colour);
  }
  for (const zone of ['main_door', 'side_door', 'window', 'garage_door'] as const) {
    push(out, `${zone}.material`, 'door_materials', brief[zone].material);
    push(out, `${zone}.colour`, 'colours', brief[zone].colour);
  }
  push(out, 'balcony.railing', 'railings', brief.balcony.railing);
  push(out, 'railing.material', 'materials', brief.balcony.material ?? null);
  push(out, 'railing.colour', 'colours', brief.balcony.colour);
  if (brief.gate.wanted !== false) {
    push(out, 'gate.type', 'gate_types', brief.gate.type);
    push(out, 'gate.material', 'materials', brief.gate.material);
    push(out, 'gate.colour', 'colours', brief.gate.colour);
  }
  push(out, 'fence.type', 'fence_types', brief.fence.type);
  push(out, 'fence.material', 'materials', brief.fence.material);
  push(out, 'fence.colour', 'colours', brief.fence.colour);
  return out;
}

/** Mọi mã trên ý tưởng mặt đứng đã ghép. Bảng màu là mã hex nên không vào — màu đi theo vùng. */
export function selectionsOfFacadeConcept(concept: AiFacadeConcept): FacadeSelection[] {
  const out: FacadeSelection[] = [];
  push(out, 'roof.type', 'roof_types', concept.roof.type);
  push(out, 'roof.material', 'roof_materials', concept.roof.material);
  push(out, 'roof.colour', 'colours', concept.roof.colour);
  for (const m of concept.materials) {
    push(
      out,
      `${m.where}.material`,
      DOOR_ZONES.has(m.where) ? 'door_materials' : 'materials',
      m.material,
    );
    push(out, `${m.where}.colour`, 'colours', m.colour);
  }
  push(out, 'balcony.railing', 'railings', concept.balconies?.find((b) => b.railing)?.railing);
  if (concept.gate) {
    // `none` = hợp đồng khai «không có cổng», không phải một kiểu cổng để so.
    if (concept.gate.type !== 'none') push(out, 'gate.type', 'gate_types', concept.gate.type);
    push(out, 'gate.material', 'materials', concept.gate.material);
    push(out, 'gate.colour', 'colours', concept.gate.colour);
  }
  if (concept.fence) {
    push(out, 'fence.type', 'fence_types', concept.fence.type ?? null);
    push(out, 'fence.material', 'materials', concept.fence.material);
    push(out, 'fence.colour', 'colours', concept.fence.colour);
  }
  return out;
}

/** Mã có hợp phong cách không. Nhóm phong cách không khai = hợp. */
export function codeFitsStyle(spec: StyleSpec, group: StyleCodeGroup, code: string): boolean {
  const allowed = spec.allowed[group];
  return !allowed || allowed.includes(code);
}

/** Các lựa chọn nằm NGOÀI tập hợp phong cách — đầu vào của cảnh báo, không phải của lỗi. */
export function styleMismatches(
  selections: readonly FacadeSelection[],
  spec: StyleSpec,
): FacadeSelection[] {
  return selections.filter((s) => !codeFitsStyle(spec, s.group, s.code));
}

/** Câu cảnh báo tiếng Việt cho một lựa chọn ngoài phong cách. `label` = nhãn của mã nếu có. */
export function styleMismatchText(
  selection: FacadeSelection,
  spec: StyleSpec,
  label?: string,
): string {
  const where = FACADE_SELECTION_LABEL[selection.field] ?? selection.field;
  return `${where}: «${label ?? selection.code}» không hợp phong cách ${spec.label} đã chọn.`;
}

/** Những gì một chi tiết phong cách được so với: mã đã chọn và loại mảng trang trí đã có. */
export interface StyleFacts {
  selections: readonly FacadeSelection[];
  elements: readonly string[];
}

/** `null` = chi tiết không khai `match`, không đo được bằng mã. */
export function cueHit(cue: StyleCue, facts: StyleFacts): boolean | null {
  if (!cue.match) return null;
  for (const [key, codes] of Object.entries(cue.match) as [StyleMatchKey, readonly string[]][]) {
    if (!codes?.length) continue;
    if (key === 'elements') {
      if (facts.elements.some((kind) => codes.includes(kind))) return true;
      continue;
    }
    const zone = ZONE_KEYS[key];
    const hit = facts.selections.some((s) =>
      zone ? s.field === zone && codes.includes(s.code) : s.group === key && codes.includes(s.code),
    );
    if (hit) return true;
  }
  return false;
}

export interface StyleFit {
  /** Chi tiết `must` đo được bằng mã. */
  mustMeasured: StyleCue[];
  mustMissing: StyleCue[];
  /** Chi tiết `avoid` đang bị dùng. */
  avoidHit: StyleCue[];
}

export function styleFit(spec: StyleSpec, facts: StyleFacts): StyleFit {
  const mustMeasured = spec.must.filter((cue) => cue.match);
  return {
    mustMeasured,
    mustMissing: mustMeasured.filter((cue) => cueHit(cue, facts) === false),
    avoidHit: spec.avoid.filter((cue) => cueHit(cue, facts) === true),
  };
}

/** Sự thật phong cách của một ý tưởng mặt đứng đã ghép. */
export function styleFactsOfConcept(concept: AiFacadeConcept): StyleFacts {
  return {
    selections: selectionsOfFacadeConcept(concept),
    elements: (concept.elevation.elements ?? []).map((e) => e.kind),
  };
}
