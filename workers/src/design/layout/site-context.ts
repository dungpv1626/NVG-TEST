/**
 * Từ hiện trạng bốn phía trong Đầu bài ra danh sách mặt thoáng của thửa.
 *
 * Đây KHÔNG phải một vị từ hình học (CLAUDE.md 8.7 cấm cài đặt vị từ ở hai nơi) — nó là một
 * phép tra bảng trên dữ liệu của đầu bài, và kết quả đi thẳng vào lời gọi bộ giải dưới dạng
 * `site.open_faces`. Container vì vậy không bao giờ phải đoán loại hình nào có mấy mặt thoáng.
 */

import { load as parseYaml } from 'js-yaml';

export type Face = 'front' | 'back' | 'left' | 'right';

export const FACES: readonly Face[] = ['front', 'back', 'left', 'right'];

export interface SiteContextTable {
  readonly version: string;
  readonly openFaces: Record<string, boolean>;
  readonly defaultOpen: boolean;
  readonly alwaysOpen: readonly Face[];
}

export class SiteContextError extends Error {
  readonly retryable = false;
}

export function parseSiteContext(yamlText: string): SiteContextTable {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    throw new SiteContextError('Tệp hiện trạng bốn phía rỗng hoặc sai định dạng.');
  }
  const openFaces = raw.open_faces;
  if (!openFaces || typeof openFaces !== 'object') {
    throw new SiteContextError('Tệp hiện trạng bốn phía thiếu mục open_faces.');
  }
  const table: Record<string, boolean> = {};
  for (const [code, value] of Object.entries(openFaces as Record<string, unknown>)) {
    table[code] = value === true;
  }
  const alwaysOpen = Array.isArray(raw.always_open)
    ? (raw.always_open as unknown[]).filter((f): f is Face => FACES.includes(f as Face))
    : [];
  return {
    version: String(raw.version ?? ''),
    openFaces: table,
    defaultOpen: raw.default_open === true,
    alwaysOpen,
  };
}

export interface SiteFaces {
  /** Mặt lấy được sáng và gió tự nhiên. */
  readonly open: Face[];
  /** Mặt vào được từ ngoài — phòng tầng trệt giáp mặt này là đã có lối vào. */
  readonly access: Face[];
}

/**
 * Mặt thoáng và mặt vào được của một thửa.
 *
 * `access_sides` của đầu bài luôn được coi là thoáng: một mặt vào được thì nó giáp đường hoặc
 * ngõ, và không thể vừa đi qua được vừa bị nhà hàng xóm bịt kín.
 */
export function siteFaces(
  site: { adjacent?: Record<string, string | null>; access_sides?: string[] } | undefined,
  table: SiteContextTable,
): SiteFaces {
  const access = (site?.access_sides ?? []).filter((f): f is Face => FACES.includes(f as Face));
  const accessFaces = access.length > 0 ? access : (['front'] as Face[]);

  const open = FACES.filter((face) => {
    if (table.alwaysOpen.includes(face) || accessFaces.includes(face)) return true;
    const code = site?.adjacent?.[face];
    if (code == null || code === '') return table.defaultOpen;
    return table.openFaces[code] ?? table.defaultOpen;
  });

  return { open, access: accessFaces };
}
