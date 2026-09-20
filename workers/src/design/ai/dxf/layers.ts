/**
 * Lớp CAD khi GHI tệp — đọc mục `export` của `kb/layer_mapping.yaml`.
 *
 * Tên lớp là DỮ LIỆU (CLAUDE.md 8.7): quy ước của NVG lệch nhau giữa các thời kỳ và người vẽ, nên mã
 * chỉ nói VAI TRÒ (`wall`, `door`…), tệp kb nói vai trò ấy nằm ở lớp nào, màu gì. Cùng mục mà bộ xuất
 * Python của bộ giải đọc — hai bộ xuất cho ra cùng tên lớp.
 */

import { load as parseYaml } from 'js-yaml';

/** Vai trò bộ xuất DXF của nhánh AI dùng tới. Thiếu vai trò nào trong tệp kb thì từ chối nạp. */
export const DXF_ROLES = [
  'room_boundary',
  'room_label',
  'soft_divider',
  'wall',
  'hatch',
  'door',
  'window',
  'stair',
  'void',
  'dimension',
  'annotation',
] as const;

export type DxfRole = (typeof DXF_ROLES)[number];

export type LayerExport = Record<DxfRole, { layer: string; color: number }>;

export class LayerExportError extends Error {
  readonly retryable = false;
}

export function parseLayerExport(yamlText: string): LayerExport {
  const raw = parseYaml(yamlText) as {
    export?: Record<string, { layer?: unknown; color?: unknown }>;
  };
  const section = raw?.export;
  if (!section || typeof section !== 'object') {
    throw new LayerExportError('kb/layer_mapping.yaml thiếu mục `export`.');
  }
  const out = {} as LayerExport;
  for (const role of DXF_ROLES) {
    const entry = section[role];
    const layer = entry?.layer;
    const color = Number(entry?.color);
    if (typeof layer !== 'string' || !layer.trim()) {
      throw new LayerExportError(`kb/layer_mapping.yaml mục \`export.${role}\` thiếu tên lớp.`);
    }
    out[role] = {
      layer: layer.trim(),
      color: Number.isInteger(color) && color >= 1 && color <= 255 ? color : 7,
    };
  }
  return out;
}
