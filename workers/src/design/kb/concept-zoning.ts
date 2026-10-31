/**
 * Đọc `kb/concept_zoning.yaml` — bảng dải trước / giữa / sau của sơ đồ công năng («Bộ ý tưởng cho khách» B1 + B2,
 * 30/10/2026). Thứ tự dải theo loại phòng, nhóm gộp theo câu trả lời của gia chủ và màu khối là DỮ LIỆU: không
 * ngưỡng hay thứ tự phòng nào viết trong mã.
 */

import { load as parseYaml } from 'js-yaml';

export interface ConceptBand {
  id: string;
  vi: string;
  types: readonly string[];
  /** Dải chừa một lối đi dọc để ra dải sau. */
  passageBeside: boolean;
}

/** Trang khách «đi xem nhà theo tầng» — câu tóm tắt từng tầng và thứ tự ảnh bên ngoài. */
export interface ConceptTourTable {
  heroViews: readonly string[];
  skipTypes: ReadonlySet<string>;
  labels: Readonly<Record<string, string>>;
  roles: Readonly<Record<string, { one: string; many: string }>>;
  phrases: {
    withResidents: string;
    residentsOnly: string;
    roomsOnly: string;
    ensuite: string;
    count: string;
    listSeparator: string;
    whoSeparator: string;
  };
}

export interface ConceptZoningTable {
  bands: readonly ConceptBand[];
  defaultBand: string;
  sideOnly: ReadonlySet<string>;
  /** Câu hỏi đầu bài (khoá `lifestyle.<câu>`) → giá trị → các nhóm loại phòng gộp thành một khối. */
  mergeByAnswer: Readonly<Record<string, Readonly<Record<string, readonly (readonly string[])[]>>>>;
  suggestMerge: readonly string[];
  /** Loại phải quay ra mặt trước / mặt sau: không chung hàng với dải khác, đứng đầu / cuối dải mình. */
  facing: { front: ReadonlySet<string>; back: ReadonlySet<string> };
  keepOnFloor: ReadonlySet<string>;
  /** Tầng trống dải trước thì kéo một phòng loại này (theo thứ tự) từ dải sau lên mặt tiền. */
  promoteWhenFrontEmpty: readonly string[];
  /** Trong cùng dải, hàng có loại này (theo thứ tự) đứng trước. */
  rowLeadTypes: readonly string[];
  /** `null` = không báo «khá chật». */
  tightShare: number | null;
  colours: {
    groups: readonly { id: string; types: readonly string[]; fill: string }[];
    other: string;
    stroke: string;
    text: string;
    passage: string;
    over: string;
  };
  /** `null` = tệp không khai mục `tour`. */
  tour: ConceptTourTable | null;
}

export class ConceptZoningError extends Error {
  constructor(message: string) {
    super(`Không đọc được bảng sơ đồ công năng: ${message}`);
    this.name = 'ConceptZoningError';
  }
}

const strings = (value: unknown, where: string): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ConceptZoningError(`«${where}» phải là danh sách mã`);
  }
  return value as string[];
};

const colour = (value: unknown, where: string): string => {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new ConceptZoningError(`«${where}» phải là mã màu #RRGGBB`);
  }
  return value;
};

export function parseConceptZoning(yamlText: string): ConceptZoningTable {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new ConceptZoningError('tệp rỗng');
  if (!Array.isArray(raw.bands) || raw.bands.length === 0) {
    throw new ConceptZoningError('thiếu mục «bands»');
  }
  const seen = new Set<string>();
  const bands = (raw.bands as Record<string, unknown>[]).map((band, i) => {
    if (typeof band.id !== 'string' || typeof band.vi !== 'string') {
      throw new ConceptZoningError(`dải thứ ${i + 1} thiếu «id» hoặc «vi»`);
    }
    const types = strings(band.types, `bands.${band.id}.types`);
    for (const type of types) {
      if (seen.has(type)) throw new ConceptZoningError(`«${type}» khai ở hai dải`);
      seen.add(type);
    }
    return { id: band.id, vi: band.vi, types, passageBeside: band.passage_beside === true };
  });
  const defaultBand = raw.default_band;
  if (typeof defaultBand !== 'string' || !bands.some((b) => b.id === defaultBand)) {
    throw new ConceptZoningError('«default_band» phải là mã một dải');
  }
  const mergeRaw = (raw.merge_by_answer ?? {}) as Record<string, Record<string, unknown>>;
  const mergeByAnswer: Record<string, Record<string, string[][]>> = {};
  for (const [question, answers] of Object.entries(mergeRaw)) {
    mergeByAnswer[question] = {};
    for (const [answer, groups] of Object.entries(answers ?? {})) {
      if (!Array.isArray(groups)) {
        throw new ConceptZoningError(
          `«merge_by_answer.${question}.${answer}» phải là danh sách nhóm`,
        );
      }
      mergeByAnswer[question]![answer] = groups.map((g, i) =>
        strings(g, `merge_by_answer.${question}.${answer}[${i}]`),
      );
    }
  }
  const tight = raw.tight_share;
  if (tight !== undefined && tight !== null && (typeof tight !== 'number' || !(tight > 0))) {
    throw new ConceptZoningError('«tight_share» phải là số dương hoặc để trống');
  }
  const c = (raw.colours ?? {}) as Record<string, unknown>;
  const groups = Array.isArray(c.groups)
    ? (c.groups as Record<string, unknown>[]).map((g, i) => ({
        id: String(g.id ?? `nhom_${i + 1}`),
        types: strings(g.types, `colours.groups[${i}].types`),
        fill: colour(g.fill, `colours.groups[${i}].fill`),
      }))
    : [];
  return {
    bands,
    defaultBand,
    sideOnly: new Set(strings(raw.side_only, 'side_only')),
    mergeByAnswer,
    suggestMerge: strings(raw.suggest_merge, 'suggest_merge'),
    facing: {
      front: new Set(strings((raw.facing as Record<string, unknown>)?.front, 'facing.front')),
      back: new Set(strings((raw.facing as Record<string, unknown>)?.back, 'facing.back')),
    },
    keepOnFloor: new Set(strings(raw.keep_on_floor, 'keep_on_floor')),
    promoteWhenFrontEmpty: strings(raw.promote_when_front_empty ?? [], 'promote_when_front_empty'),
    rowLeadTypes: strings(raw.row_lead_types ?? [], 'row_lead_types'),
    tightShare: typeof tight === 'number' ? tight : null,
    colours: {
      groups,
      other: colour(c.other, 'colours.other'),
      stroke: colour(c.stroke, 'colours.stroke'),
      text: colour(c.text, 'colours.text'),
      passage: colour(c.passage, 'colours.passage'),
      over: colour(c.over, 'colours.over'),
    },
    tour: parseTour(raw.tour),
  };
}

const phrase = (value: unknown, where: string, slots: readonly string[]): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConceptZoningError(`«${where}» phải là câu chữ`);
  }
  for (const slot of slots) {
    if (!value.includes(`{${slot}}`)) {
      throw new ConceptZoningError(`«${where}» thiếu chỗ trống {${slot}}`);
    }
  }
  return value;
};

function parseTour(value: unknown): ConceptTourTable | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new ConceptZoningError('«tour» phải là bảng');
  const raw = value as Record<string, unknown>;
  const labels: Record<string, string> = {};
  for (const [code, text] of Object.entries((raw.labels ?? {}) as Record<string, unknown>)) {
    if (typeof text !== 'string') throw new ConceptZoningError(`«tour.labels.${code}» phải là chữ`);
    labels[code] = text;
  }
  const roles: Record<string, { one: string; many: string }> = {};
  for (const [role, forms] of Object.entries((raw.roles ?? {}) as Record<string, unknown>)) {
    const f = (forms ?? {}) as Record<string, unknown>;
    if (typeof f.one !== 'string' || typeof f.many !== 'string') {
      throw new ConceptZoningError(`«tour.roles.${role}» phải có «one» và «many»`);
    }
    roles[role] = { one: f.one, many: f.many };
  }
  const p = (raw.phrases ?? {}) as Record<string, unknown>;
  const separator = (v: unknown, where: string) => {
    if (typeof v !== 'string' || v.length === 0) {
      throw new ConceptZoningError(`«tour.phrases.${where}» phải là chữ`);
    }
    return v;
  };
  return {
    heroViews: strings(raw.hero_views, 'tour.hero_views'),
    skipTypes: new Set(strings(raw.skip_types, 'tour.skip_types')),
    labels,
    roles,
    phrases: {
      withResidents: phrase(p.with_residents, 'tour.phrases.with_residents', [
        'floor',
        'who',
        'rooms',
      ]),
      residentsOnly: phrase(p.residents_only, 'tour.phrases.residents_only', ['floor', 'who']),
      roomsOnly: phrase(p.rooms_only, 'tour.phrases.rooms_only', ['floor', 'rooms']),
      ensuite: phrase(p.ensuite, 'tour.phrases.ensuite', ['room']),
      count: phrase(p.count, 'tour.phrases.count', ['count', 'room']),
      listSeparator: separator(p.list_separator, 'list_separator'),
      whoSeparator: separator(p.who_separator, 'who_separator'),
    },
  };
}

/** Mọi mã loại phòng bảng nhắc tới — để phép thử đối chiếu với `kb/room_vocabulary.yaml`. */
export function conceptZoningCodes(table: ConceptZoningTable): string[] {
  return [
    ...new Set([
      ...table.bands.flatMap((b) => b.types),
      ...table.sideOnly,
      ...Object.values(table.mergeByAnswer).flatMap((a) => Object.values(a).flat(2)),
      ...table.suggestMerge,
      ...table.facing.front,
      ...table.facing.back,
      ...table.keepOnFloor,
      ...table.promoteWhenFrontEmpty,
      ...table.rowLeadTypes,
      ...table.colours.groups.flatMap((g) => g.types),
      ...(table.tour ? [...table.tour.skipTypes, ...Object.keys(table.tour.labels)] : []),
    ]),
  ];
}
