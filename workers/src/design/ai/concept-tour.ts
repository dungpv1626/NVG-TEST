/**
 * Trang KHÁCH «đi xem nhà theo tầng» — phần THUẦN (link gửi khách B5, anh Dũng chọn «Cách 1» 31/10/2026).
 *
 * Mỗi tầng một câu tóm tắt ghép TẤT ĐỊNH từ đầu bài đã lược danh tính: ai ở tầng này (`family[].floor`, chỉ vai — không
 * tên) và các phòng ghim ở tầng ấy theo thứ tự đầu bài khai. Câu mẫu, tên vai, loại bỏ qua là DỮ LIỆU ở mục `tour` của
 * `kb/concept_zoning.yaml`. Không gọi mô hình, không số đo.
 *
 * Sơ đồ công năng của từng tầng đi ra dưới dạng CẤU TRÚC (hàng → khối, tỉ lệ tương đối, màu theo nhóm) để trang khách vẽ
 * và bấm được — không cm, không m², không chiều sâu tuyệt đối. Khối nối với ảnh nội thất qua thứ tự phòng trong
 * `required_spaces` (khoá ảnh `<loại>:<tầng>:<thứ tự>`, `room-image.ts`; khối `ZoningCell.spaces`). Tầng nào không vừa lô
 * thì KHÔNG trả sơ đồ của tầng nào (khách không thấy phần vượt lô — quy tắc B5), ảnh vẫn xếp theo tầng, thứ tự đầu bài.
 */

import type { AiBriefDigest } from '@nvg/shared/design';
import type { ConceptTourTable, ConceptZoningTable } from '../kb/concept-zoning';
import type { ConceptZoning, ZoningCell } from './concept-zoning';

/** Một ảnh nội thất đã chụp vào link — khoá ảnh của trang khách + khoá phòng của đầu bài. */
export interface TourRoomShot {
  imageKey: string;
  /** `<loại>:<tầng hoặc 0>:<thứ tự trong required_spaces>`. */
  roomKey: string;
  type: string;
}

export interface TourCell {
  label: string;
  fill: string;
  /** Phần bề ngang của hàng (0–1). */
  share: number;
  /** Khoá ảnh nội thất của khối này (có thể rỗng). */
  images: string[];
}

export interface TourRow {
  /** Phần chiều sâu của tầng (0–1). */
  share: number;
  /** Phần bề ngang dành cho lối đi dọc (0 = không có). */
  passage: number;
  cells: TourCell[];
}

export interface TourFloor {
  level: number;
  summary: string | null;
  /** Hàng đầu = sát mặt đường. `null` khi không trình sơ đồ. */
  diagram: { aspect: number; rows: TourRow[] } | null;
  /** Ảnh nội thất của tầng — theo sơ đồ từ mặt đường vào, không có sơ đồ thì theo thứ tự đầu bài. */
  images: string[];
}

export interface ConceptTour {
  diagrams: boolean;
  palette: { stroke: string; text: string; passage: string };
  floors: TourFloor[];
  /** Ảnh phòng chưa ghim tầng. */
  others: string[];
  /** Nhãn từng ảnh nội thất («Phòng ngủ 2» khi tầng có hai phòng ngủ). */
  labels: Record<string, string>;
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (all, slot: string) =>
    slot in values ? String(values[slot]) : all,
  );

/** Viết thường chữ đầu cho câu văn — giữ nguyên tên viết tắt («WC»). */
function lowerFirst(text: string): string {
  return text.length > 1 && text[1] === text[1]!.toLowerCase()
    ? text[0]!.toLowerCase() + text.slice(1)
    : text;
}

/** Tầng ghim của một dòng đầu bài — chỗ để xe không ghim thì tầng 1 (cùng quy ước `concept-zoning.ts`). */
const spaceFloor = (space: { type: string; floor?: number | null }) =>
  typeof space.floor === 'number' ? space.floor : space.type === 'garage' ? 1 : null;

/**
 * Câu tóm tắt một tầng: «Tầng 2 dành cho ông bà: phòng ngủ có WC riêng, phòng làm việc, WC.» `null` khi tầng không có
 * người ghim lẫn phòng nào để kể.
 */
export function floorSummary(
  digest: Pick<AiBriefDigest, 'family' | 'required_spaces'>,
  level: number,
  tour: ConceptTourTable,
  labels: Record<string, string>,
): string | null {
  const who = new Map<string, number>();
  for (const member of digest.family ?? []) {
    if (member.floor !== level || !(member.count > 0) || !tour.roles[member.role]) continue;
    who.set(member.role, (who.get(member.role) ?? 0) + member.count);
  }
  const people = [
    ...new Set(
      [...who].map(([role, n]) => (n > 1 ? tour.roles[role]!.many : tour.roles[role]!.one)),
    ),
  ];

  const groups = new Map<string, { name: string; ensuite: boolean; count: number }>();
  for (const space of digest.required_spaces ?? []) {
    if (spaceFloor(space) !== level || tour.skipTypes.has(space.type)) continue;
    const vi =
      tour.labels[space.type] ?? (labels[space.type] ? lowerFirst(labels[space.type]!) : null);
    if (!vi) continue;
    const ensuite = space.ensuite === true;
    const key = `${space.type}|${ensuite ? 1 : 0}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { name: vi, ensuite, count: 1 });
  }
  const rooms = [...groups.values()].map((g) => {
    const name = g.ensuite ? fill(tour.phrases.ensuite, { room: g.name }) : g.name;
    return g.count > 1 ? fill(tour.phrases.count, { count: g.count, room: name }) : name;
  });

  const values = {
    floor: level,
    who: people.join(tour.phrases.whoSeparator),
    rooms: rooms.join(tour.phrases.listSeparator),
  };
  if (people.length && rooms.length) return fill(tour.phrases.withResidents, values);
  if (people.length) return fill(tour.phrases.residentsOnly, values);
  if (rooms.length) return fill(tour.phrases.roomsOnly, values);
  return null;
}

/** `living:1:3` → loại, tầng (0 = chưa ghim), thứ tự trong đầu bài. */
export function parseRoomKey(key: string): { type: string; floor: number; index: number } | null {
  const m = /^([a-z_]+):(\d+):(\d+)$/.exec(key);
  return m ? { type: m[1]!, floor: Number(m[2]), index: Number(m[3]) } : null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface ConceptTourInput {
  digest: Pick<AiBriefDigest, 'family' | 'required_spaces' | 'floors'>;
  /** `null` khi không có đầu bài để đo. */
  zoning: ConceptZoning | null;
  table: ConceptZoningTable;
  labels: Record<string, string>;
  /** Ảnh nội thất trong link, thứ tự bất kỳ. */
  rooms: readonly TourRoomShot[];
}

export function buildConceptTour(input: ConceptTourInput): ConceptTour {
  const { digest, zoning, table, labels } = input;
  const c = table.colours;
  const fillOf = (types: readonly string[]) =>
    c.groups.find((g) => types.some((t) => g.types.includes(t)))?.fill ?? c.other;
  const diagrams = Boolean(zoning && zoning.floors.every((f) => f.verdict !== 'over'));

  const shots = input.rooms
    .map((shot) => ({ shot, key: parseRoomKey(shot.roomKey) }))
    .filter((s): s is { shot: TourRoomShot; key: NonNullable<ReturnType<typeof parseRoomKey>> } =>
      Boolean(s.key),
    )
    .sort((a, b) => a.key.index - b.key.index);

  // Khối của từng dòng đầu bài (theo thứ tự trong required_spaces).
  const cellOf = new Map<number, ZoningCell>();
  for (const floor of zoning?.floors ?? []) {
    for (const row of floor.rows)
      for (const cell of row.cells) for (const i of cell.spaces) cellOf.set(i, cell);
  }
  const labelOf: Record<string, string> = {};
  for (const { shot, key } of shots) {
    const cell = cellOf.get(key.index);
    labelOf[shot.imageKey] =
      cell && cell.spaces.length === 1 ? cell.label : (labels[shot.type] ?? 'Nội thất');
  }

  const levels = Array.from({ length: Math.max(1, digest.floors ?? 1) }, (_, i) => i + 1);
  const placed = new Set<string>();
  const floors: TourFloor[] = levels.map((level) => {
    const own = shots.filter((s) => s.key.floor === level);
    const zf = zoning?.floors.find((f) => f.level === level);
    let diagram: TourFloor['diagram'] = null;
    const ordered: string[] = [];
    if (diagrams && zf && zf.rows.length) {
      const widthCm = Math.max(1, zoning!.widthM * 100);
      const total = Math.max(
        1,
        zf.rows.reduce((s, r) => s + r.depthCm, 0),
      );
      diagram = {
        aspect: round3(widthCm / total),
        rows: zf.rows.map((row) => {
          const passage = Math.min(row.passageCm / widthCm, 0.5);
          const sum = Math.max(
            1,
            row.cells.reduce((s, cell) => s + cell.widthCm, 0),
          );
          return {
            share: round3(row.depthCm / total),
            passage: round3(passage),
            cells: row.cells.map((cell) => {
              const images = own
                .filter((s) => cell.spaces.includes(s.key.index))
                .map((s) => s.shot.imageKey);
              ordered.push(...images);
              return {
                label: cell.label,
                fill: fillOf(cell.types),
                share: round3((cell.widthCm / sum) * (1 - passage)),
                images,
              };
            }),
          };
        }),
      };
    }
    for (const s of own) if (!ordered.includes(s.shot.imageKey)) ordered.push(s.shot.imageKey);
    ordered.forEach((k) => placed.add(k));
    return {
      level,
      summary: table.tour ? floorSummary(digest, level, table.tour, labels) : null,
      diagram,
      images: ordered,
    };
  });

  return {
    diagrams,
    palette: { stroke: c.stroke, text: c.text, passage: c.passage },
    floors,
    others: shots.map((s) => s.shot.imageKey).filter((k) => !placed.has(k)),
    labels: labelOf,
  };
}

/** Phối cảnh: góc «đầu trang» (`tour.hero_views`) trước, rồi theo thứ tự góc khai ở kb. */
export function orderPerspectives<T extends { view: string }>(
  images: readonly T[],
  heroViews: readonly string[],
  viewOrder: readonly string[],
): (T & { hero: boolean })[] {
  const rank = (view: string) => {
    const h = heroViews.indexOf(view);
    if (h >= 0) return h;
    const v = viewOrder.indexOf(view);
    return heroViews.length + (v >= 0 ? v : viewOrder.length);
  };
  return [...images]
    .sort((a, b) => rank(a.view) - rank(b.view))
    .map((image) => ({ ...image, hero: heroViews.includes(image.view) }));
}
