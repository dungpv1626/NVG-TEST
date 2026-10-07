/**
 * `kb/roof_plan.yaml` — danh mục khu trên mái và điều kiện đầu bài bật từng khu (Haan chốt 04/10/2026: luôn vẽ
 * tầng mái). Phân tích thuần + một hàm đọc đầu bài; nạp tệp ở `roof-plan-data.ts`.
 */
import { load as parseYaml } from 'js-yaml';

export interface RoofCondition {
  path: string;
  equals?: string | number | boolean;
  includes?: string;
  in?: (string | number | boolean)[];
}

export interface RoofZoneSpec {
  code: string;
  vi: string;
  minSideM: number;
  minM2: number;
  /** Chương trình tự đặt thì đặt trên khu ướt tầng dưới. */
  overWet: boolean;
  when: 'always' | { anyOf: RoofCondition[] } | { allOf: RoofCondition[] };
}

export interface RoofPlanSpec {
  version: string;
  stairHead: { vi: string; landingM: number };
  roofSlabVi: string;
  zones: RoofZoneSpec[];
}

export class RoofPlanError extends Error {}

function condition(raw: unknown, where: string): RoofCondition {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c.path !== 'string') {
    throw new RoofPlanError(`kb/roof_plan.yaml ${where}: điều kiện cần \`path\`.`);
  }
  const keys = ['equals', 'includes', 'in'].filter((key) => key in c);
  if (keys.length !== 1) {
    throw new RoofPlanError(
      `kb/roof_plan.yaml ${where}: điều kiện cần đúng một trong \`equals\`, \`includes\`, \`in\`.`,
    );
  }
  if ('in' in c && !Array.isArray(c.in)) {
    throw new RoofPlanError(`kb/roof_plan.yaml ${where}: \`in\` phải là danh sách.`);
  }
  return c as unknown as RoofCondition;
}

export function parseRoofPlan(text: string): RoofPlanSpec {
  const doc = parseYaml(text) as Record<string, unknown> | null;
  const head = doc?.stair_head as Record<string, unknown> | undefined;
  if (
    !doc ||
    typeof doc.version !== 'string' ||
    !head ||
    typeof head.vi !== 'string' ||
    typeof head.landing_m !== 'number' ||
    typeof doc.roof_slab_vi !== 'string' ||
    !Array.isArray(doc.zones)
  ) {
    throw new RoofPlanError(
      'kb/roof_plan.yaml cần `version`, `stair_head.vi`, `stair_head.landing_m`, `roof_slab_vi` và `zones`.',
    );
  }
  const seen = new Set<string>();
  const zones = doc.zones.map((raw, i): RoofZoneSpec => {
    const z = raw as Record<string, unknown>;
    const where = `zones[${i}]`;
    if (
      typeof z.code !== 'string' ||
      !/^[a-z_]+$/.test(z.code) ||
      typeof z.vi !== 'string' ||
      typeof z.min_side_m !== 'number' ||
      typeof z.min_m2 !== 'number'
    ) {
      throw new RoofPlanError(
        `kb/roof_plan.yaml ${where}: cần \`code\`, \`vi\`, \`min_side_m\`, \`min_m2\`.`,
      );
    }
    if (seen.has(z.code)) throw new RoofPlanError(`kb/roof_plan.yaml: mã khu «${z.code}» lặp.`);
    seen.add(z.code);
    const modes = ['when', 'any_of', 'all_of'].filter((key) => key in z);
    if (modes.length !== 1 || (z.when !== undefined && z.when !== 'always')) {
      throw new RoofPlanError(
        `kb/roof_plan.yaml ${where}: cần đúng một trong \`when: always\`, \`any_of\`, \`all_of\`.`,
      );
    }
    const list = (key: string) => {
      if (!Array.isArray(z[key]) || !(z[key] as unknown[]).length) {
        throw new RoofPlanError(
          `kb/roof_plan.yaml ${where}: \`${key}\` phải là danh sách không rỗng.`,
        );
      }
      return (z[key] as unknown[]).map((c, j) => condition(c, `${where}.${key}[${j}]`));
    };
    return {
      code: z.code,
      vi: z.vi,
      minSideM: z.min_side_m,
      minM2: z.min_m2,
      overWet: z.over_wet === true,
      when:
        z.when === 'always'
          ? 'always'
          : 'any_of' in z
            ? { anyOf: list('any_of') }
            : { allOf: list('all_of') },
    };
  });
  return {
    version: doc.version,
    stairHead: { vi: head.vi, landingM: head.landing_m },
    roofSlabVi: doc.roof_slab_vi,
    zones,
  };
}

function valueAt(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      source,
    );
}

/** Câu ĐÃ trả lời mới khớp: giá trị vắng / `null` không bao giờ khớp, kể cả `equals: false`. */
export function roofConditionHolds(source: unknown, c: RoofCondition): boolean {
  const value = valueAt(source, c.path);
  if (value === undefined || value === null) return false;
  if (c.equals !== undefined) return value === c.equals;
  if (c.includes !== undefined) return Array.isArray(value) && value.includes(c.includes);
  return (c.in ?? []).includes(value as string);
}

/** Mã các khu đầu bài đòi, theo thứ tự tệp dữ liệu. */
export function requiredRoofZones(spec: RoofPlanSpec, digest: unknown): string[] {
  return spec.zones
    .filter((zone) =>
      zone.when === 'always'
        ? true
        : 'anyOf' in zone.when
          ? zone.when.anyOf.some((c) => roofConditionHolds(digest, c))
          : zone.when.allOf.every((c) => roofConditionHolds(digest, c)),
    )
    .map((zone) => zone.code);
}
