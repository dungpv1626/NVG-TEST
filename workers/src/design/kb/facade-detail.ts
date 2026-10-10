/**
 * Chi tiết cấu tạo trên tờ mặt đứng (T147). Nguồn: `kb/facade_detail.yaml`.
 *
 * Tệp kb ghi số cấu tạo bằng mm THẬT (như hồ sơ ghi «phào 100×50»); bộ vẽ tính bằng cm, nên đổi
 * MỘT LẦN ở đây — mọi trường `…Cm` dưới đây đã là cm. Bước ký hiệu, chữ và chú thích giữ mm GIẤY.
 *
 * Kiểm HÌNH DẠNG lúc nạp, cùng lý do với `draw/style.ts`: thiếu một khoá thì bộ vẽ đặt `NaN` vào một
 * thuộc tính SVG và nét biến mất câm lặng.
 *
 * Tách khỏi phần nạp (`facade-detail-data.ts`) vì Vitest không nạp được `.yaml` qua `import`.
 */

import { load as parseYaml } from 'js-yaml';

/** Ký hiệu vật liệu trên mặt đứng. `paint` tô xám khi màu đủ tối. */
export type HatchKind = 'paint' | 'stone' | 'brick' | 'wood' | 'dots' | 'tile' | 'glass' | 'none';
/** Kiểu vẽ lan can. */
export type RailingDraw = 'balusters' | 'glass' | 'ornamental' | 'turned' | 'solid';
/** Vùng vật liệu của hợp đồng `ai-facade-concept` (`materials[].where`). */
export type MaterialZone = string;

export interface BarSpec {
  widthCm: number;
  pitchCm: number;
}

export interface FacadeDetail {
  version: string;
  floorBand: {
    enabled: boolean;
    bandCm: number;
    corniceHCm: number;
    corniceProjectionCm: number;
    corniceNote: string;
  };
  parapet: {
    copingHCm: number;
    copingProjectionCm: number;
    copingNote: string;
    materialFrom: MaterialZone[];
  };
  plinth: { materialFrom: MaterialZone[] };
  window: {
    frameCm: number;
    sashCm: number;
    multiLeafFromCm: number;
    leafTargetCm: number;
    topFixed: boolean;
    topFixedHCm: number;
  };
  door: {
    frameCm: number;
    stileCm: number;
    twoLeafFromCm: number;
    foldingPanels: number;
    slidingSplitShare: number;
    handleWCm: number;
    handleHCm: number;
    handleZCm: number;
    surroundMainDoor: boolean;
    surroundCm: number;
    surroundNote: string;
    solidMaterials: string[];
  };
  garage: { frameCm: number; shutterSlatCm: number; foldingPanels: number };
  railing: {
    postCm: number;
    postMaxSpacingCm: number;
    bottomGapCm: number;
    railCm: number;
    handrailCm: number;
    defaultDraw: RailingDraw;
    draw: Record<string, RailingDraw>;
    balusters: BarSpec;
    turned: BarSpec;
    ornamental: BarSpec;
  };
  elements: {
    cornice: { profileLines: number };
    reveal: { grooveCm: number; pitchCm: number; note: string };
    louvre: { finCm: number; pitchCm: number };
    column: { capCm: number; baseCm: number };
    canopy: { soffitShare: number };
    planter: { lipCm: number };
  };
  materialHatch: Record<string, HatchKind>;
  paintSolidBelow: number;
  toneRange: readonly [number, number];
  /** mm giấy. */
  hatch: {
    stone: { course: number; joint: number };
    brick: { course: number; joint: number };
    wood: { pitch: number; break: number };
    dots: { pitch: number; r: number };
    tile: { pitch: number };
    glass: { pairs: number; gap: number; minPane: number };
    minGap: number;
  };
  /** mm giấy, trừ `maxCharsPerLine`. */
  notes: {
    uppercase: boolean;
    column: number;
    lineGap: number;
    minSpacing: number;
    landing: number;
    maxCharsPerLine: number;
  };
  axes: { minSpanShare: number; mergeCm: number; letters: string[] };
  /** mm giấy, trừ `openingChainZCm`. */
  annotation: {
    bubbleD: number;
    bubbleGap: number;
    axisOverrun: number;
    openingChainZCm: number;
    windowChainOffset: number;
  };
}

export class FacadeDetailError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(`Không đọc được quy ước chi tiết mặt đứng: ${message}`);
    this.name = 'FacadeDetailError';
  }
}

const HATCH_KINDS: readonly HatchKind[] = [
  'paint',
  'stone',
  'brick',
  'wood',
  'dots',
  'tile',
  'glass',
  'none',
];
const RAILING_DRAWS: readonly RailingDraw[] = [
  'balusters',
  'glass',
  'ornamental',
  'turned',
  'solid',
];
const CODE = /^[a-z0-9_]+$/;

type Raw = Record<string, unknown>;

function group(raw: unknown, path: string): Raw {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new FacadeDetailError(`thiếu mục "${path}"`);
  }
  return raw as Raw;
}

/** Số DƯƠNG. `mm → cm` khi `toCm`. */
function pos(g: Raw, key: string, path: string, toCm = false): number {
  const value = g[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new FacadeDetailError(`"${path}.${key}" phải là số dương`);
  }
  return toCm ? value / 10 : value;
}

function share(g: Raw, key: string, path: string): number {
  const value = pos(g, key, path);
  if (value >= 1) throw new FacadeDetailError(`"${path}.${key}" phải nhỏ hơn 1`);
  return value;
}

function bool(g: Raw, key: string, path: string): boolean {
  if (typeof g[key] !== 'boolean')
    throw new FacadeDetailError(`"${path}.${key}" phải là true/false`);
  return g[key];
}

function text(g: Raw, key: string, path: string): string {
  const value = g[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new FacadeDetailError(`"${path}.${key}" phải là chữ`);
  }
  return value;
}

function codes(g: Raw, key: string, path: string): string[] {
  const value = g[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !CODE.test(v))) {
    throw new FacadeDetailError(`"${path}.${key}" phải là danh sách mã`);
  }
  return value.slice() as string[];
}

function bar(raw: unknown, path: string): BarSpec {
  const g = group(raw, path);
  return { widthCm: pos(g, 'width_mm', path, true), pitchCm: pos(g, 'pitch_mm', path, true) };
}

function railingDraw(value: unknown, path: string): RailingDraw {
  if (!RAILING_DRAWS.includes(value as RailingDraw)) {
    throw new FacadeDetailError(`"${path}" phải là một trong ${RAILING_DRAWS.join(', ')}`);
  }
  return value as RailingDraw;
}

export function parseFacadeDetail(yamlText: string): FacadeDetail {
  const raw = parseYaml(yamlText) as Raw | null;
  if (!raw || typeof raw !== 'object') throw new FacadeDetailError('tệp rỗng');

  const fb = group(raw.floor_band, 'floor_band');
  const pp = group(raw.parapet, 'parapet');
  const pl = group(raw.plinth, 'plinth');
  const wn = group(raw.window, 'window');
  const dr = group(raw.door, 'door');
  const gr = group(raw.garage, 'garage');
  const rl = group(raw.railing, 'railing');
  const el = group(raw.elements, 'elements');
  const ht = group(raw.hatch, 'hatch');
  const nt = group(raw.notes, 'notes');
  const ax = group(raw.axes, 'axes');
  const an = group(raw.annotation, 'annotation');

  const drawRaw = group(rl.draw, 'railing.draw');
  const draw: Record<string, RailingDraw> = {};
  for (const [code, value] of Object.entries(drawRaw)) {
    if (!CODE.test(code)) throw new FacadeDetailError(`mã "railing.draw.${code}" sai dạng`);
    draw[code] = railingDraw(value, `railing.draw.${code}`);
  }

  const hatchRaw = group(raw.material_hatch, 'material_hatch');
  const materialHatch: Record<string, HatchKind> = {};
  for (const [code, value] of Object.entries(hatchRaw)) {
    if (!CODE.test(code)) throw new FacadeDetailError(`mã "material_hatch.${code}" sai dạng`);
    if (!HATCH_KINDS.includes(value as HatchKind)) {
      throw new FacadeDetailError(
        `"material_hatch.${code}" phải là một trong ${HATCH_KINDS.join(', ')}`,
      );
    }
    materialHatch[code] = value as HatchKind;
  }

  const tone = raw.tone_range;
  if (
    !Array.isArray(tone) ||
    tone.length !== 2 ||
    tone.some((v) => typeof v !== 'number' || v <= 0 || v >= 1) ||
    (tone[0] as number) > (tone[1] as number)
  ) {
    throw new FacadeDetailError('"tone_range" phải là [thấp, cao] trong khoảng (0, 1)');
  }
  const letters = ax.letters;
  if (
    !Array.isArray(letters) ||
    letters.length === 0 ||
    letters.some((v) => typeof v !== 'string' || !/^[A-Z]$/.test(v))
  ) {
    throw new FacadeDetailError('"axes.letters" phải là danh sách chữ cái in hoa');
  }

  const sub = (key: string) => group(el[key], `elements.${key}`);
  const hs = (key: string) => group(ht[key], `hatch.${key}`);

  return {
    version: String(raw.version ?? '0.0.0'),
    floorBand: {
      enabled: bool(fb, 'enabled', 'floor_band'),
      bandCm: pos(fb, 'band_mm', 'floor_band', true),
      corniceHCm: pos(fb, 'cornice_h_mm', 'floor_band', true),
      corniceProjectionCm: pos(fb, 'cornice_projection_mm', 'floor_band', true),
      corniceNote: text(fb, 'cornice_note', 'floor_band'),
    },
    parapet: {
      copingHCm: pos(pp, 'coping_h_mm', 'parapet', true),
      copingProjectionCm: pos(pp, 'coping_projection_mm', 'parapet', true),
      copingNote: text(pp, 'coping_note', 'parapet'),
      materialFrom: codes(pp, 'material_from', 'parapet'),
    },
    plinth: { materialFrom: codes(pl, 'material_from', 'plinth') },
    window: {
      frameCm: pos(wn, 'frame_mm', 'window', true),
      sashCm: pos(wn, 'sash_mm', 'window', true),
      multiLeafFromCm: pos(wn, 'multi_leaf_from_mm', 'window', true),
      leafTargetCm: pos(wn, 'leaf_target_mm', 'window', true),
      topFixed: bool(wn, 'top_fixed', 'window'),
      topFixedHCm: pos(wn, 'top_fixed_h_mm', 'window', true),
    },
    door: {
      frameCm: pos(dr, 'frame_mm', 'door', true),
      stileCm: pos(dr, 'stile_mm', 'door', true),
      twoLeafFromCm: pos(dr, 'two_leaf_from_mm', 'door', true),
      foldingPanels: Math.round(pos(dr, 'folding_panels', 'door')),
      slidingSplitShare: share(dr, 'sliding_split_share', 'door'),
      handleWCm: pos(dr, 'handle_w_mm', 'door', true),
      handleHCm: pos(dr, 'handle_h_mm', 'door', true),
      handleZCm: pos(dr, 'handle_z_mm', 'door', true),
      surroundMainDoor: bool(dr, 'surround_main_door', 'door'),
      surroundCm: pos(dr, 'surround_mm', 'door', true),
      surroundNote: text(dr, 'surround_note', 'door'),
      solidMaterials: codes(dr, 'solid_materials', 'door'),
    },
    garage: {
      frameCm: pos(gr, 'frame_mm', 'garage', true),
      shutterSlatCm: pos(gr, 'shutter_slat_mm', 'garage', true),
      foldingPanels: Math.round(pos(gr, 'folding_panels', 'garage')),
    },
    railing: {
      postCm: pos(rl, 'post_mm', 'railing', true),
      postMaxSpacingCm: pos(rl, 'post_max_spacing_mm', 'railing', true),
      bottomGapCm: pos(rl, 'bottom_gap_mm', 'railing', true),
      railCm: pos(rl, 'rail_mm', 'railing', true),
      handrailCm: pos(rl, 'handrail_mm', 'railing', true),
      defaultDraw: railingDraw(rl.default, 'railing.default'),
      draw,
      balusters: bar(rl.balusters, 'railing.balusters'),
      turned: bar(rl.turned, 'railing.turned'),
      ornamental: bar(rl.ornamental, 'railing.ornamental'),
    },
    elements: {
      cornice: {
        profileLines: Math.round(pos(sub('cornice'), 'profile_lines', 'elements.cornice')),
      },
      reveal: {
        grooveCm: pos(sub('reveal'), 'groove_mm', 'elements.reveal', true),
        pitchCm: pos(sub('reveal'), 'pitch_mm', 'elements.reveal', true),
        note: text(sub('reveal'), 'note', 'elements.reveal'),
      },
      louvre: {
        finCm: pos(sub('louvre'), 'fin_mm', 'elements.louvre', true),
        pitchCm: pos(sub('louvre'), 'pitch_mm', 'elements.louvre', true),
      },
      column: {
        capCm: pos(sub('column'), 'cap_mm', 'elements.column', true),
        baseCm: pos(sub('column'), 'base_mm', 'elements.column', true),
      },
      canopy: { soffitShare: share(sub('canopy'), 'soffit_share', 'elements.canopy') },
      planter: { lipCm: pos(sub('planter'), 'lip_mm', 'elements.planter', true) },
    },
    materialHatch,
    paintSolidBelow: share(
      { paint_solid_below: raw.paint_solid_below },
      'paint_solid_below',
      'tệp',
    ),
    toneRange: [tone[0] as number, tone[1] as number],
    hatch: {
      stone: {
        course: pos(hs('stone'), 'course_mm', 'hatch.stone'),
        joint: pos(hs('stone'), 'joint_mm', 'hatch.stone'),
      },
      brick: {
        course: pos(hs('brick'), 'course_mm', 'hatch.brick'),
        joint: pos(hs('brick'), 'joint_mm', 'hatch.brick'),
      },
      wood: {
        pitch: pos(hs('wood'), 'pitch_mm', 'hatch.wood'),
        break: pos(hs('wood'), 'break_mm', 'hatch.wood'),
      },
      dots: {
        pitch: pos(hs('dots'), 'pitch_mm', 'hatch.dots'),
        r: pos(hs('dots'), 'r_mm', 'hatch.dots'),
      },
      tile: { pitch: pos(hs('tile'), 'pitch_mm', 'hatch.tile') },
      glass: {
        pairs: Math.round(pos(hs('glass'), 'pairs', 'hatch.glass')),
        gap: pos(hs('glass'), 'gap_mm', 'hatch.glass'),
        minPane: pos(hs('glass'), 'min_pane_mm', 'hatch.glass'),
      },
      minGap: pos(ht, 'min_gap_mm', 'hatch'),
    },
    notes: {
      uppercase: bool(nt, 'uppercase', 'notes'),
      column: pos(nt, 'column_mm', 'notes'),
      lineGap: pos(nt, 'line_gap_mm', 'notes'),
      minSpacing: pos(nt, 'min_spacing_mm', 'notes'),
      landing: pos(nt, 'landing_mm', 'notes'),
      maxCharsPerLine: Math.round(pos(nt, 'max_chars_per_line', 'notes')),
    },
    axes: {
      minSpanShare: share(ax, 'min_span_share', 'axes'),
      mergeCm: pos(ax, 'merge_mm', 'axes', true),
      letters: (letters as string[]).slice(),
    },
    annotation: {
      bubbleD: pos(an, 'bubble_d_mm', 'annotation'),
      bubbleGap: pos(an, 'bubble_gap_mm', 'annotation'),
      axisOverrun: pos(an, 'axis_overrun_mm', 'annotation'),
      openingChainZCm: pos(an, 'opening_chain_z_mm', 'annotation', true),
      windowChainOffset: pos(an, 'window_chain_offset_mm', 'annotation'),
    },
  };
}
