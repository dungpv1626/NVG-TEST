/**
 * Bộ đặc trưng phong cách (T175). Nguồn: `kb/style_catalogue.yaml` — ĐỀ XUẤT của Claude Code, chờ kiến
 * trúc sư NVO duyệt. Kiểu dữ liệu và phép so dùng chung ở `@nvg/shared/design` (`style-catalogue.ts`);
 * ở đây chỉ ĐỌC và KIỂM tệp.
 *
 * Kiểm lúc nạp, không lúc chạy: một mã phong cách gõ sai trong `allowed` mà để tới lúc chạy thì ô chọn
 * lặng lẽ bớt một lựa chọn, còn lời dẫn dặn mô hình dùng một mã không có — lượt ấy đã tính tiền.
 *
 * Tách khỏi phần nạp (`style-catalogue-data.ts`) vì Vitest không nạp được `.yaml` qua `import`.
 */

import { load as parseYaml } from 'js-yaml';
import {
  STYLE_CODE_GROUPS,
  STYLE_MATCH_KEYS,
  type StyleCatalogue,
  type StyleCodeGroup,
  type StyleCue,
  type StyleMatchKey,
  type StyleSpec,
} from '@nvg/shared/design';
import type { FacadeVocabulary } from './facade-vocabulary';

export class StyleCatalogueError extends Error {
  constructor(message: string) {
    super(`Không đọc được bộ đặc trưng phong cách: ${message}`);
    this.name = 'StyleCatalogueError';
  }
}

const SYMMETRY = ['cao', 'vua', 'thap'] as const;

/** Bảng mã của danh mục mặt đứng ứng với từng khoá `allowed` / `match`. */
function codeTable(vocab: FacadeVocabulary, key: StyleMatchKey): Record<string, unknown> {
  switch (key) {
    case 'roof_types':
      return vocab.roofTypes;
    case 'roof_materials':
      return vocab.roofMaterials;
    case 'materials':
    case 'body_materials':
    case 'base_materials':
      return vocab.materials;
    case 'colours':
    case 'body_colours':
    case 'roof_colours':
      return vocab.colours;
    case 'railings':
      return vocab.railings;
    case 'door_materials':
      return vocab.doorMaterials;
    case 'gate_types':
      return vocab.gateTypes;
    case 'fence_types':
      return vocab.fenceTypes;
    case 'elements':
      return vocab.elements;
  }
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new StyleCatalogueError(`"${where}" phải là chữ`);
  }
  return value;
}

function codes(
  raw: unknown,
  key: StyleMatchKey,
  where: string,
  vocab: FacadeVocabulary,
): readonly string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new StyleCatalogueError(`"${where}" phải là danh sách mã không rỗng`);
  }
  const table = codeTable(vocab, key);
  for (const code of raw) {
    if (typeof code !== 'string' || !(code in table)) {
      throw new StyleCatalogueError(
        `"${where}": mã «${String(code)}» không có trong kb/facade_vocabulary.yaml`,
      );
    }
  }
  return raw as string[];
}

function cues(raw: unknown, where: string, vocab: FacadeVocabulary): StyleCue[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new StyleCatalogueError(`"${where}" phải là danh sách`);
  return raw.map((item, index) => {
    const c = item as Record<string, unknown>;
    const at = `${where}[${index}]`;
    const cue: StyleCue = { vi: text(c?.vi, `${at}.vi`), en: text(c?.en, `${at}.en`) };
    if (c.match !== undefined) {
      if (!c.match || typeof c.match !== 'object') {
        throw new StyleCatalogueError(`"${at}.match" phải là bảng khoá → mã`);
      }
      const match: Partial<Record<StyleMatchKey, readonly string[]>> = {};
      for (const [key, value] of Object.entries(c.match as Record<string, unknown>)) {
        if (!(STYLE_MATCH_KEYS as readonly string[]).includes(key)) {
          throw new StyleCatalogueError(`"${at}.match" có khoá lạ «${key}»`);
        }
        match[key as StyleMatchKey] = codes(
          value,
          key as StyleMatchKey,
          `${at}.match.${key}`,
          vocab,
        );
      }
      cue.match = match;
    }
    return cue;
  });
}

/**
 * Đọc và kiểm tệp. `vocab` là danh mục mặt đứng — mọi mã của `allowed` và `match` phải có trong đó.
 */
export function parseStyleCatalogue(yamlText: string, vocab: FacadeVocabulary): StyleCatalogue {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new StyleCatalogueError('tệp rỗng');
  const list = raw.styles as Record<string, unknown> | undefined;
  if (!list || typeof list !== 'object' || Object.keys(list).length === 0) {
    throw new StyleCatalogueError('thiếu mục "styles"');
  }

  const styles: Record<string, StyleSpec> = {};
  for (const [code, value] of Object.entries(list)) {
    const s = value as Record<string, unknown>;
    const at = `styles.${code}`;
    const prompt = s?.prompt as Record<string, unknown> | undefined;
    const allowedRaw = (s?.allowed ?? {}) as Record<string, unknown>;
    const allowed: Partial<Record<StyleCodeGroup, readonly string[]>> = {};
    for (const [key, list] of Object.entries(allowedRaw)) {
      if (!(STYLE_CODE_GROUPS as readonly string[]).includes(key)) {
        throw new StyleCatalogueError(`"${at}.allowed" có nhóm lạ «${key}»`);
      }
      allowed[key as StyleCodeGroup] = codes(
        list,
        key as StyleCodeGroup,
        `${at}.allowed.${key}`,
        vocab,
      );
    }
    const symmetry = s?.symmetry;
    if (!SYMMETRY.includes(symmetry as (typeof SYMMETRY)[number])) {
      throw new StyleCatalogueError(`"${at}.symmetry" phải là cao, vua hoặc thap`);
    }
    const hw = s?.window_hw;
    if (
      hw !== undefined &&
      !(
        Array.isArray(hw) &&
        hw.length === 2 &&
        typeof hw[0] === 'number' &&
        typeof hw[1] === 'number' &&
        hw[0] > 0 &&
        hw[0] <= hw[1]
      )
    ) {
      throw new StyleCatalogueError(`"${at}.window_hw" phải là [thấp, cao]`);
    }
    const must = cues(s?.must, `${at}.must`, vocab);
    if (must.length === 0) throw new StyleCatalogueError(`"${at}.must" rỗng`);
    styles[code] = {
      code,
      status: text(s?.status, `${at}.status`),
      label: text(s?.label, `${at}.label`),
      moTa: text(s?.mo_ta, `${at}.mo_ta`),
      prompt: {
        interior: text(prompt?.interior, `${at}.prompt.interior`),
        exterior: text(prompt?.exterior, `${at}.prompt.exterior`),
      },
      must,
      prefer: cues(s?.prefer, `${at}.prefer`, vocab),
      avoid: cues(s?.avoid, `${at}.avoid`, vocab),
      allowed,
      symmetry: symmetry as StyleSpec['symmetry'],
      windowHw: hw ? [hw[0] as number, hw[1] as number] : null,
    };
  }
  return {
    version: text(raw.version, 'version'),
    status: text(raw.status, 'status'),
    styles,
  };
}

const SYMMETRY_EN: Record<StyleSpec['symmetry'], string> = {
  cao: 'symmetrical about the centre line of the facade',
  vua: 'balanced; symmetry is welcome but not required',
  thap: 'asymmetry is normal for this style',
};

/**
 * Câu phong cách cho ẢNH mặt đứng và ảnh phối cảnh: cụm `prompt.exterior` + chi tiết nên có / tránh.
 *
 * Ảnh vẽ từ ảnh neo đã khoá (T57, T59), nên dặn rõ: chỉ thể hiện phong cách trên những gì bản vẽ
 * đã có — «phải có vòm» mà bản vẽ không có vòm thì mô hình ảnh vẽ thêm vòm, mâu thuẫn bản vẽ.
 */
export function exteriorStylePhrase(spec: StyleSpec): string {
  const list = (items: readonly StyleCue[]) => items.map((c) => c.en).join('; ');
  const parts = [spec.prompt.exterior];
  const show = [...spec.must, ...spec.prefer];
  if (show.length) parts.push(`style cues, only where the drawing already has them: ${list(show)}`);
  if (spec.avoid.length) parts.push(`avoid: ${list(spec.avoid)}`);
  return parts.join('. ');
}

/**
 * Khối «Style guide» của lời dẫn mặt đứng (văn bản): `must` / `prefer` / `avoid`, mức đối xứng, tỷ lệ
 * cửa sổ, và tập mã hợp phong cách để mô hình chọn. Mô hình VẪN được dùng mã khác khi yêu cầu kỹ sư
 * hay khung nhà đòi — đó là thẩm mỹ, không phải luật (T52); hàm ghép chỉ ghi cảnh báo.
 */
export function facadeStyleGuideText(spec: StyleSpec): string {
  const lines = [
    `Style guide for "${spec.code}" (${spec.prompt.exterior}). Aesthetic guidance from the design office, not a hard rule:`,
  ];
  const block = (title: string, items: readonly StyleCue[]) => {
    if (items.length) lines.push(`${title}:`, ...items.map((c) => `- ${c.en}`));
  };
  block('Must show (express each through your codes and decorative elements)', spec.must);
  block('Prefer', spec.prefer);
  block('Avoid', spec.avoid);
  lines.push(`Symmetry: ${SYMMETRY_EN[spec.symmetry]}.`);
  if (spec.windowHw) {
    lines.push(
      `Window proportion for this style: height about ${spec.windowHw[0]}–${spec.windowHw[1]} times the width (openings are LOCKED; use it only for trims and shutters).`,
    );
  }
  const groups = Object.entries(spec.allowed) as [string, readonly string[]][];
  if (groups.length) {
    lines.push(
      'Codes that suit this style — choose from these unless a REQUIRED item says otherwise:',
      ...groups.map(([group, list]) => `- ${group}: ${list.join(', ')}`),
    );
  }
  return lines.join('\n');
}
