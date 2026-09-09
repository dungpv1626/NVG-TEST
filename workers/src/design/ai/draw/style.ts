/**
 * Quy ước trình bày tờ bản vẽ — đọc từ `kb/sheet_style.yaml`, kiểm hình dạng lúc nạp.
 *
 * Tách phần phân tích (thuần, kiểm thử được bằng chuỗi YAML tự dựng) khỏi phần nạp tệp
 * (`style-data.ts`), cùng khuôn với `kb/construction.ts` + `kb/construction-data.ts`.
 *
 * Kiểm ở đây là kiểm HÌNH DẠNG, không phải kiểm giá trị đẹp: thiếu một khoá thì bộ vẽ sẽ đặt
 * `undefined` vào một thuộc tính SVG và tờ vẽ hỏng câm — không lỗi, chỉ là nét biến mất. Bắt
 * lúc nạp thì thấy ngay tên khoá thiếu.
 */

import { load as parseYaml } from 'js-yaml';

export interface SheetStyle {
  version: string;
  paper: { long_mm: number; short_mm: number };
  /** Hướng đặt giấy được phép thử, theo thứ tự ưu tiên khi cả hai cùng vừa. */
  orientations: Orientation[];
  margin_mm: { left: number; right: number; top: number; bottom: number };
  title_strip: { h_mm: number; right_cell_w_mm: number };
  /** Tỷ lệ thử theo thứ tự, số nhỏ = hình lớn. Ví dụ 100 nghĩa là 1:100. */
  scales: number[];
  line_mm: Record<LineKey, number>;
  text_mm: Record<TextKey, number>;
  text_min_mm: number;
  /** Bề rộng nửa quầng nền quanh chữ, mm giấy. */
  text_halo_mm: number;
  font_family: string;
  colour: Record<ColourKey, string>;
  dim: {
    first_offset_mm: number;
    row_gap_mm: number;
    tick_mm: number;
    ext_overshoot_mm: number;
    text_gap_mm: number;
  };
  symbol: { north_r_mm: number; stair_arrow_head_mm: number; stair_gap_mm: number };
}

export type Orientation = 'landscape' | 'portrait';

export type LineKey =
  | 'frame'
  | 'title_rule'
  | 'wall_cut'
  | 'railing'
  | 'opening'
  | 'door_leaf'
  | 'window'
  | 'stair'
  | 'stair_arrow'
  | 'void'
  | 'dim_line'
  | 'dim_tick'
  | 'north';

export type TextKey =
  'level_name' | 'disclaimer' | 'strip_note' | 'room_name' | 'room_area' | 'dim' | 'north';

export type ColourKey = 'ink' | 'hairline' | 'dim' | 'wall_fill' | 'void_fill' | 'paper';

const LINE_KEYS: LineKey[] = [
  'frame',
  'title_rule',
  'wall_cut',
  'railing',
  'opening',
  'door_leaf',
  'window',
  'stair',
  'stair_arrow',
  'void',
  'dim_line',
  'dim_tick',
  'north',
];

const TEXT_KEYS: TextKey[] = [
  'level_name',
  'disclaimer',
  'strip_note',
  'room_name',
  'room_area',
  'dim',
  'north',
];

const COLOUR_KEYS: ColourKey[] = ['ink', 'hairline', 'dim', 'wall_fill', 'void_fill', 'paper'];

export class SheetStyleError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(`Không đọc được quy ước trình bày bản vẽ: ${message}`);
    this.name = 'SheetStyleError';
  }
}

export function parseSheetStyle(yamlText: string): SheetStyle {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new SheetStyleError('tệp rỗng');

  const paper = numberGroup(raw.paper, 'paper', ['long_mm', 'short_mm']);
  const orientations = raw.orientations;
  if (
    !Array.isArray(orientations) ||
    orientations.length === 0 ||
    orientations.some((value) => value !== 'landscape' && value !== 'portrait')
  ) {
    throw new SheetStyleError('mục "orientations" phải là danh sách "landscape" hoặc "portrait"');
  }
  const margin = numberGroup(raw.margin_mm, 'margin_mm', ['left', 'right', 'top', 'bottom']);
  const strip = numberGroup(raw.title_strip, 'title_strip', ['h_mm', 'right_cell_w_mm']);
  const scales = raw.scales;
  if (!Array.isArray(scales) || scales.length === 0 || scales.some((s) => !positive(s))) {
    throw new SheetStyleError('mục "scales" phải là danh sách số dương');
  }
  const dim = numberGroup(raw.dim, 'dim', [
    'first_offset_mm',
    'row_gap_mm',
    'tick_mm',
    'ext_overshoot_mm',
    'text_gap_mm',
  ]);
  const symbol = numberGroup(raw.symbol, 'symbol', [
    'north_r_mm',
    'stair_arrow_head_mm',
    'stair_gap_mm',
  ]);
  if (!positive(raw.text_min_mm)) throw new SheetStyleError('thiếu "text_min_mm"');
  if (typeof raw.text_halo_mm !== 'number' || raw.text_halo_mm < 0) {
    throw new SheetStyleError('thiếu "text_halo_mm" hoặc giá trị âm');
  }
  if (typeof raw.font_family !== 'string' || !raw.font_family) {
    throw new SheetStyleError('thiếu "font_family"');
  }

  return {
    version: String(raw.version ?? '0.0.0'),
    paper: paper as SheetStyle['paper'],
    orientations: (orientations as Orientation[]).slice(),
    margin_mm: margin as SheetStyle['margin_mm'],
    title_strip: strip as SheetStyle['title_strip'],
    scales: (scales as number[]).slice(),
    line_mm: numberGroup(raw.line_mm, 'line_mm', LINE_KEYS) as Record<LineKey, number>,
    text_mm: numberGroup(raw.text_mm, 'text_mm', TEXT_KEYS) as Record<TextKey, number>,
    text_min_mm: raw.text_min_mm as number,
    text_halo_mm: raw.text_halo_mm,
    font_family: raw.font_family,
    colour: colourGroup(raw.colour),
    dim: dim as SheetStyle['dim'],
    symbol: symbol as SheetStyle['symbol'],
  };
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function numberGroup(
  value: unknown,
  name: string,
  keys: readonly string[],
): Record<string, number> {
  if (!value || typeof value !== 'object') throw new SheetStyleError(`thiếu mục "${name}"`);
  const source = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of keys) {
    if (!positive(source[key])) {
      throw new SheetStyleError(`mục "${name}" thiếu "${key}" hoặc giá trị không phải số dương`);
    }
    out[key] = source[key] as number;
  }
  return out;
}

function colourGroup(value: unknown): Record<ColourKey, string> {
  if (!value || typeof value !== 'object') throw new SheetStyleError('thiếu mục "colour"');
  const source = value as Record<string, unknown>;
  const out = {} as Record<ColourKey, string>;
  for (const key of COLOUR_KEYS) {
    const colour = source[key];
    // Chỉ nhận mã hex: màu đi thẳng vào thuộc tính SVG, và một chuỗi tự do ở đây là một
    // đường tiêm nội dung vào tờ vẽ qua tệp cấu hình.
    if (typeof colour !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(colour)) {
      throw new SheetStyleError(`màu "${key}" phải là mã hex sáu chữ số, ví dụ "#172B4D"`);
    }
    out[key] = colour;
  }
  return out;
}
