/**
 * Phần thân lời gọi chế độ hình chữ nhật theo `prompt-mat-bang-v5.md` (bàn giao v5, Haan gửi 04/10/2026):
 * `<rules>` đánh số (catalog có `when`, mục 3), `<knowledge>` (mục 4: khu đất, thang, ban công, chỗ đỗ, cạnh tối thiểu,
 * đồ đạc, danh mục phòng, khả thi, ưu tiên) và `<brief>` rút gọn (lời gia chủ + mong muốn chưa mã hoá). Hàm thuần.
 */
import { BRIEF_FORM, fieldByPath, type AiBriefDigest } from '@nvg/shared/design';
import type { FurnitureSpec, HouseProgramSpec } from '../kb/house-program';
import type { ProgramRow } from './house-program';

export interface LayoutRule {
  id: string;
  /** `always` · `storeys>=2` · `has_parent` · `has_cantilever` · `has_balcony` · `has_open_pairs` · `has_roof` ·
   *  `entry_via_garage` · `not_entry_via_garage` · `has:<loại>` · `has_for:<vai trò>`. */
  when: string;
  text: string;
  /** Mã lỗi cổng thuộc luật này — câu nhắc vòng sửa mang số luật (tài liệu mục 6). */
  codes: string[];
  /**
   * Cổng chỉ TRỪ ĐIỂM, không bác (handoff sửa lỗi đợt 3 mục 3.1: luật lời dẫn ghi «must» thì cổng phải bác; luật cổng chỉ
   * trừ điểm thì lời dẫn ghi «avoid / prefer»). In ở khối riêng sau các luật bắt buộc.
   */
  soft?: boolean;
}

export interface RuleFacts {
  storeys: number;
  program: readonly ProgramRow[];
  hasCantilever: boolean;
  hasBalcony: boolean;
  hasOpenPairs: boolean;
  hasRoof: boolean;
  /** Loại hình cho gara mang lối vào chính (`passage.entry_room_by_building_type`), tầng 1 có gara, cửa xe cùng
   *  mặt cửa chính (Haan 04/10/2026, nhà ống). */
  entryViaGarage: boolean;
  /** Gia chủ xếp «lấy sáng tự nhiên» trong hai ưu tiên đầu (đợt 3 mục 3.3). Vắng = không. */
  lightFirst?: boolean;
  /** Loại nhà (`ong`, `pho`, …) — luật theo loại nhà (`profile:<loại>`). */
  profile?: string;
}

export function ruleHolds(when: string, facts: RuleFacts): boolean {
  if (when === 'always') return true;
  if (when === 'storeys>=2') return facts.storeys >= 2;
  if (when === 'has_parent') return facts.program.some((row) => row.parent !== null);
  if (when === 'has_cantilever') return facts.hasCantilever;
  if (when === 'has_balcony') return facts.hasBalcony;
  if (when === 'has_open_pairs') return facts.hasOpenPairs;
  if (when === 'has_roof') return facts.hasRoof;
  if (when === 'entry_via_garage') return facts.entryViaGarage;
  if (when === 'not_entry_via_garage') return !facts.entryViaGarage;
  if (when.startsWith('has:')) return facts.program.some((row) => row.type === when.slice(4));
  if (when.startsWith('has_for:')) return facts.program.some((row) => row.for === when.slice(8));
  if (when === 'light_first') return facts.lightFirst === true;
  if (when === 'not_light_first') return facts.lightFirst !== true;
  if (when.startsWith('profile:')) return facts.profile === when.slice(8);
  if (when.startsWith('not_profile:')) return facts.profile !== when.slice(12);
  throw new Error(`kb/ai_design_prompts.yaml house_layout.rules: điều kiện lạ «${when}».`);
}

/** Dòng mở khối luật chỉ trừ điểm. */
export const SOFT_HEADING = 'Scored, not rejected — follow where you can:';

/** Luật áp cho ca này, đánh số liên tục; `ruleOf` = mã lỗi → số luật mô hình nhìn thấy. */
export function selectRules(
  rules: readonly LayoutRule[],
  facts: RuleFacts,
): { text: string; ruleOf: Record<string, number> } {
  const held = rules.filter((rule) => ruleHolds(rule.when, facts));
  // Luật bắt buộc trước, luật chỉ trừ điểm sau một dòng nói rõ — số luật chạy liên tục để câu nhắc «R<số>» vẫn trỏ đúng.
  const kept = [...held.filter((rule) => !rule.soft), ...held.filter((rule) => rule.soft)];
  const ruleOf: Record<string, number> = {};
  kept.forEach((rule, i) => {
    for (const code of rule.codes) ruleOf[code] ??= i + 1;
  });
  const firstSoft = kept.findIndex((rule) => rule.soft);
  const lines = kept.map((rule, i) => `${i + 1} ${rule.text.trim()}`);
  if (firstSoft >= 0) lines.splice(firstSoft, 0, SOFT_HEADING);
  return { text: lines.join('\n'), ruleOf };
}

const BEARINGS_DEG: Record<string, number> = {
  B: 0,
  DB: 45,
  D: 90,
  DN: 135,
  N: 180,
  TN: 225,
  T: 270,
  TB: 315,
};
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

type Face = 'front' | 'back' | 'left' | 'right';

export interface LayoutKnowledgeInput {
  digest: AiBriefDigest;
  program: readonly ProgramRow[];
  spec: HouseProgramSpec;
  furniture: FurnitureSpec;
  /** Vùng xây được trong toạ độ lô, mm `[x0, y0, x1, y1]`. */
  envelopeMm: [number, number, number, number];
  /** Diện tích sàn xây tối đa theo mật độ chủ nhà khai, m² (`null` = không khai). */
  maxFootprintM2: number | null;
  faces: Readonly<Record<Face, readonly string[]>>;
  entries: { main: string | null; car: string | null };
  stair: { type: string | null; risers: number; rectMinMm: [number, number] } | null;
  balcony: { cantilever: Partial<Record<Face, number>>; required: Face[]; optional: Face[] } | null;
  garageMinM2: number | null;
  openPairs: string[][];
  /** Cạnh ngắn lọt lòng tối thiểu theo loại phòng, m (`kb/construction_norms.yaml`). */
  minSideM: (type: string) => number | null;
  corridorMinMm: number;
  doorWallMm: number;
  circulationShare: { low: number; high: number } | null;
  /** Diện tích ô thang (gồm tường), m² — cộng vào mỗi tầng khi nhà từ hai tầng. */
  stairAreaM2: number;
  storeys: number;
  /** Diện tích thường gặp của loại phòng, m² (`kb/space_norms.yaml`) — cho phòng danh mục không có số tối thiểu. */
  usualM2?: (type: string) => number | null;
  priorities: string[];
  strategy: string;
  constraints?: unknown[];
}

export function layoutKnowledge(input: LayoutKnowledgeInput): Record<string, unknown> {
  const { digest, program } = input;
  const site = digest.site;
  const front = site.orientation ? BEARINGS_DEG[site.orientation] : undefined;
  const faceDeg: Record<Face, number> | null =
    front === undefined ? null : { front, back: front + 180, left: front + 90, right: front - 90 };
  const faces = Object.fromEntries(
    (['front', 'left', 'back', 'right'] as const).map((face) => [
      face,
      [...input.faces[face], ...(faceDeg ? [compass(faceDeg[face])] : [])].join('; '),
    ]),
  );
  const types = new Set(program.map((row) => row.type));
  for (const type of Object.values(input.spec.modelAdded)) types.add(type);
  const minSide = Object.fromEntries(
    [...types].flatMap((type) => {
      const m = input.minSideM(type);
      return m ? [[type, Math.ceil((m * 1000) / 100) * 100]] : [];
    }),
  );
  const people = (digest.family ?? []).reduce((sum, member) => sum + (member.count ?? 0), 0);
  const furnitureTypes = [...new Set(program.map((row) => row.type))].filter(
    (type) => input.furniture.byType[type],
  );
  const furniture: Record<string, unknown> = {};
  const clearances: Record<string, number> = {};
  for (const type of furnitureTypes) {
    const entry = input.furniture.byType[type]!;
    for (const name of entry.items) furniture[name] = input.furniture.items[name];
    for (const name of entry.clearances) clearances[name] = input.furniture.clearances[name]!;
    if (type === 'dining') {
      const table =
        input.furniture.diningByPeople.find(([n]) => n >= people) ??
        input.furniture.diningByPeople.at(-1);
      if (table) furniture[table[1]] = input.furniture.items[table[1]];
    }
  }
  const [ex0, ey0, ex1, ey1] = input.envelopeMm;
  const envelopeM2 = ((ex1 - ex0) * (ey1 - ey0)) / 1e6;
  const levels = [...new Set(program.map((row) => row.level))].filter((l) => /^\d+$/.test(l));
  const feasibility = Object.fromEntries(
    levels.sort().map((level) => {
      const sum = program
        .filter((row) => row.level === level)
        .reduce((s, row) => s + (row.min_m2 ?? input.usualM2?.(row.type) ?? 0), 0);
      const f = input.spec.feasibility;
      const core = input.storeys >= 2 ? input.stairAreaM2 + f.hubM2 : 0;
      const gross = Math.round((sum + core) * f.wallFactor);
      const cap =
        level === '1' && input.maxFootprintM2
          ? Math.min(envelopeM2, input.maxFootprintM2)
          : envelopeM2;
      const verdict = gross > cap ? 'over' : gross >= cap * f.tightRatio ? 'tight' : 'fits';
      return [
        level,
        `program ≈${Math.round(sum)} m² clear (minimums, else usual areas) → ≈${gross} m² gross vs ${Math.round(cap)} m² → ${verdict}`,
      ];
    }),
  );
  const levelsMm =
    typeof site.road_level_m === 'number' || typeof site.land_level_m === 'number'
      ? {
          ...(typeof site.road_level_m === 'number' ? { road: 0 } : {}),
          ...(typeof site.land_level_m === 'number' && typeof site.road_level_m === 'number'
            ? { yard: Math.round((site.land_level_m - site.road_level_m) * 1000) }
            : {}),
        }
      : null;
  return {
    site: {
      lot_mm: [Math.round((site.width_m ?? 0) * 1000), Math.round((site.depth_m ?? 0) * 1000)],
      envelope_mm: input.envelopeMm,
      ...(input.maxFootprintM2 ? { max_footprint_m2: Math.round(input.maxFootprintM2) } : {}),
      faces,
      entries: input.entries,
      ...(levelsMm ? { levels_mm: levelsMm } : {}),
    },
    ...(input.stair
      ? {
          stair: {
            ...(input.stair.type ? { type: input.stair.type } : {}),
            risers: input.stair.risers,
            rect_min_mm: input.stair.rectMinMm,
          },
        }
      : {}),
    ...(input.circulationShare
      ? { circulation_share: [input.circulationShare.low, input.circulationShare.high] }
      : {}),
    corridor_min_mm: input.corridorMinMm,
    door_wall_mm: input.doorWallMm,
    ...(input.balcony
      ? {
          balcony: {
            cantilever_faces: input.balcony.cantilever,
            required_faces: input.balcony.required,
            optional_faces: input.balcony.optional,
          },
        }
      : {}),
    ...(digest.parking
      ? {
          parking: {
            cars: digest.parking.cars ?? 0,
            motorbikes: digest.parking.motorbikes ?? 0,
            ...(input.garageMinM2 ? { garage_min_m2: input.garageMinM2 } : {}),
          },
        }
      : {}),
    open_pairs: input.openPairs,
    min_side_mm: minSide,
    furniture,
    clearances,
    model_added: input.spec.modelAdded,
    program: program.map((row) => [row.id, row.name, row.level, row.type, row.min_m2, row.parent]),
    feasibility,
    priorities: input.priorities,
    strategy: input.strategy,
    ...(input.constraints?.length ? { constraints: input.constraints } : {}),
  };
}

/** Nhãn tiếng Việt của các ưu tiên gia chủ, theo thứ tự đã khai. */
export function priorityLabels(digest: AiBriefDigest): string[] {
  const field = fieldByPath(BRIEF_FORM, 'priorities');
  return (digest.priorities ?? []).map(
    (p) => field?.options?.find((o) => String(o.value) === String(p))?.label ?? String(p),
  );
}

/** Đầu bài rút gọn: chỉ giữ các mục của văn xuôi đầu bài có tên trong `keep` (phần tri thức chưa mã hoá). */
export function compactBrief(narrative: string, keep: readonly string[]): string {
  const keepSet = new Set(keep);
  return narrative
    .split(/\n(?=## )/)
    .filter((part) => keepSet.has(part.replace(/^## /, '').split('\n')[0]!.trim()))
    .join('\n');
}
