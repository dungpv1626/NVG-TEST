/**
 * `kb/house_program.yaml` và `kb/furniture.yaml` — dữ liệu cho danh mục phòng chương trình cấp và đồ đạc gửi kèm lời
 * gọi mặt bằng chế độ hình chữ nhật (bàn giao v5). Phân tích thuần; nạp tệp ở `house-program-data.ts`.
 */
import { load as parseYaml } from 'js-yaml';

export interface HouseProgramSpec {
  version: string;
  bedroomRoleOrder: string[];
  roleCodes: Record<string, string>;
  /** Tiền tố mã mô hình được tự thêm → loại phòng. */
  modelAdded: Record<string, string>;
  feasibility: { wallFactor: number; hubM2: number; tightRatio: number };
}

export interface FurnitureSpec {
  version: string;
  items: Record<string, number | [number, number]>;
  clearances: Record<string, number>;
  byType: Record<string, { items: string[]; clearances: string[] }>;
  /** Số người → mã bàn ăn, tăng dần. */
  diningByPeople: [number, string][];
}

export class HouseProgramError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function parseHouseProgram(text: string): HouseProgramSpec {
  const doc = parseYaml(text) as Record<string, unknown> | null;
  const f = doc?.feasibility as Record<string, unknown> | undefined;
  if (
    !doc ||
    typeof doc.version !== 'string' ||
    !Array.isArray(doc.bedroom_role_order) ||
    !isRecord(doc.role_codes) ||
    !isRecord(doc.model_added) ||
    !f ||
    typeof f.wall_factor !== 'number' ||
    typeof f.hub_m2 !== 'number' ||
    typeof f.tight_ratio !== 'number'
  ) {
    throw new HouseProgramError(
      'kb/house_program.yaml cần `version`, `bedroom_role_order`, `role_codes`, `model_added`, `feasibility.{wall_factor,hub_m2,tight_ratio}`.',
    );
  }
  for (const [prefix, type] of Object.entries(doc.model_added)) {
    if (!/^[a-z]+$/.test(prefix) || typeof type !== 'string') {
      throw new HouseProgramError(
        `kb/house_program.yaml model_added: «${prefix}» phải là chữ thường → mã loại.`,
      );
    }
  }
  return {
    version: doc.version,
    bedroomRoleOrder: doc.bedroom_role_order.map(String),
    roleCodes: doc.role_codes as Record<string, string>,
    modelAdded: doc.model_added as Record<string, string>,
    feasibility: { wallFactor: f.wall_factor, hubM2: f.hub_m2, tightRatio: f.tight_ratio },
  };
}

export function parseFurniture(text: string): FurnitureSpec {
  const doc = parseYaml(text) as Record<string, unknown> | null;
  if (
    !doc ||
    typeof doc.version !== 'string' ||
    !isRecord(doc.items) ||
    !isRecord(doc.clearances) ||
    !isRecord(doc.by_type) ||
    !isRecord(doc.dining_by_people)
  ) {
    throw new HouseProgramError(
      'kb/furniture.yaml cần `version`, `items`, `clearances`, `by_type`, `dining_by_people`.',
    );
  }
  const items = doc.items as FurnitureSpec['items'];
  const clearances = doc.clearances as Record<string, number>;
  const byType: FurnitureSpec['byType'] = {};
  for (const [type, raw] of Object.entries(doc.by_type)) {
    const entry = raw as { items?: unknown; clearances?: unknown };
    const its = Array.isArray(entry.items) ? entry.items.map(String) : [];
    const cls = Array.isArray(entry.clearances) ? entry.clearances.map(String) : [];
    for (const name of its)
      if (!(name in items))
        throw new HouseProgramError(
          `kb/furniture.yaml: đồ «${name}» (${type}) chưa khai ở \`items\`.`,
        );
    for (const name of cls)
      if (!(name in clearances))
        throw new HouseProgramError(
          `kb/furniture.yaml: khoảng trống «${name}» (${type}) chưa khai.`,
        );
    byType[type] = { items: its, clearances: cls };
  }
  const diningByPeople = Object.entries(doc.dining_by_people)
    .map(([people, name]) => [Number(people), String(name)] as [number, string])
    .sort((a, b) => a[0] - b[0]);
  for (const [, name] of diningByPeople)
    if (!(name in items))
      throw new HouseProgramError(`kb/furniture.yaml: bàn ăn «${name}» chưa khai ở \`items\`.`);
  return { version: doc.version, items, clearances, byType, diningByPeople };
}
