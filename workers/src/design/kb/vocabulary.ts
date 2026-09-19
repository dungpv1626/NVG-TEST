/**
 * Từ vựng phòng chuẩn — nạp từ `kb/room_vocabulary.yaml`.
 *
 * Nguồn: doc/design/06-knowledge-base.md mục 6.1.
 *
 * Việc quy nhãn bản vẽ về mã phòng chuẩn nằm ở Worker chứ KHÔNG ở Container (CLAUDE.md 8.7):
 * đó là tri thức đang thay đổi, còn trích xuất hình học thì không.
 */

import { load as parseYaml } from 'js-yaml';

export interface RoomTypeEntry {
  code: string;
  vi: string;
  aliases?: string[];
}

export interface RoomGroupEntry {
  vi: string;
  /** Mã phòng thuộc nhóm. `null` = mọi mã phòng. */
  members: string[] | null;
}

export interface RoomVocabulary {
  version: string;
  types: RoomTypeEntry[];
  group_targets?: Record<string, RoomGroupEntry>;
  /**
   * Đuôi cần gỡ khỏi nhãn trước khi tra, theo thứ tự thử. Biểu thức chính quy, khớp trên
   * nhãn ĐÃ chuẩn hoá. Là dữ liệu vì đây là thói quen ghi chú của người vẽ chứ không phải
   * quy tắc của phần mềm — hồ sơ thật có nhãn mang cả diện tích ("… 11.3m²").
   */
  strip_patterns?: string[];
  /** Cặp loại phòng được ghép một không gian mở (T40). */
  merge_allowed?: [string, string][];
  /** Phòng nào được đi xuyên để tới phòng khác (V-27). */
  passage?: {
    through?: string[];
    entry_through?: string[];
    served_from?: Record<string, string[]>;
    not_a_route?: string[];
    everyday?: string[];
    everyday_from?: string[];
    stair_not_for?: string[];
    cooking?: string[];
    quiet?: string[];
  };
  /** Vùng mặc định khi ý định bố cục bỏ sót một phòng (T43). */
  zone_defaults?: {
    front?: string[];
    center?: string[];
    back?: string[];
    street?: string[];
  };
}

/** Vùng mặc định của một loại phòng khi ý định bố cục bỏ sót nó (T43). */
export interface ZoneDefaults {
  /** Loại phòng → hàng trong lô: `front`, `center` hoặc `back`. */
  row: ReadonlyMap<string, 'front' | 'center' | 'back'>;
  /** Loại phòng mặc định muốn ra mặt đường. */
  street: ReadonlySet<string>;
}

/**
 * Vùng mặc định (`kb/room_vocabulary.yaml` mục `zone_defaults`). Mã gõ sai ném lỗi lúc nạp — cùng lý
 * do với `passageRules`. Vắng mục thì trả bảng rỗng: loại nào không khai rơi vào `center`.
 */
export function zoneDefaults(vocabulary: RoomVocabulary): ZoneDefaults {
  const codes = new Set(vocabulary.types.map((t) => t.code));
  const raw = vocabulary.zone_defaults ?? {};
  const row = new Map<string, 'front' | 'center' | 'back'>();
  for (const key of ['front', 'center', 'back'] as const) {
    for (const code of raw[key] ?? []) {
      if (!codes.has(code)) {
        throw new Error(
          `kb/room_vocabulary.yaml: mục zone_defaults.${key} có mã phòng lạ "${code}".`,
        );
      }
      if (row.has(code)) {
        throw new Error(`kb/room_vocabulary.yaml: "${code}" khai ở hai hàng của zone_defaults.`);
      }
      row.set(code, key);
    }
  }
  for (const code of raw.street ?? []) {
    if (!codes.has(code)) {
      throw new Error(
        `kb/room_vocabulary.yaml: mục zone_defaults.street có mã phòng lạ "${code}".`,
      );
    }
  }
  return { row, street: new Set(raw.street ?? []) };
}

/** Luật đi xuyên phòng, đã kiểm mã (`kb/room_vocabulary.yaml` mục `passage`). */
export interface PassageRules {
  through: ReadonlySet<string>;
  entryThrough: ReadonlySet<string>;
  servedFrom: ReadonlyMap<string, ReadonlySet<string>>;
  /** Loại phòng không được nằm trên đường đi hằng ngày trong nhà (T48). Vắng = không kiểm. */
  notARoute: ReadonlySet<string>;
  /** Loại phòng phải tới được từ khu sinh hoạt chung mà không đi xuyên `notARoute` (T48). */
  everyday: ReadonlySet<string>;
  /** Chỗ xuất phát của đường đi hằng ngày — nơi cả nhà ngồi, không phải hành lang (T48). */
  everydayFrom: ReadonlySet<string>;
  /** Loại phòng KHÔNG được mở cửa thẳng từ ô thang. Rỗng = không kiểm (Haan 18/09/2026). */
  stairNotFor: ReadonlySet<string>;
  /** Khu nấu nướng trong một không gian mở — xếp xa cửa phòng yên tĩnh (Haan 18/09/2026). */
  cooking: ReadonlySet<string>;
  /** Phòng yên tĩnh: cửa của nó không nên mở thẳng vào khu nấu nướng. */
  quiet: ReadonlySet<string>;
}

/**
 * Luật đi xuyên phòng. Vắng mục `passage` thì trả `null` — không kiểm (hành vi trước V-27).
 *
 * Mã gõ sai ném lỗi ngay lúc nạp, cùng lý do với `mergeAllowed`: một mã lạ trong `through` âm thầm
 * không bao giờ khớp, và cổng bác một lối đi hợp lệ mà không ai hiểu vì sao.
 */
export function passageRules(vocabulary: RoomVocabulary): PassageRules | null {
  const raw = vocabulary.passage;
  if (!raw) return null;
  const codes = new Set(vocabulary.types.map((t) => t.code));
  const checked = (list: readonly string[] | undefined, where: string): Set<string> => {
    for (const code of list ?? []) {
      if (!codes.has(code)) {
        throw new Error(`kb/room_vocabulary.yaml: mục passage.${where} có mã phòng lạ "${code}".`);
      }
    }
    return new Set(list ?? []);
  };
  const servedFrom = new Map<string, ReadonlySet<string>>();
  for (const [type, from] of Object.entries(raw.served_from ?? {})) {
    checked([type], 'served_from');
    servedFrom.set(type, checked(from, `served_from.${type}`));
  }
  return {
    through: checked(raw.through, 'through'),
    entryThrough: checked(raw.entry_through, 'entry_through'),
    servedFrom,
    notARoute: checked(raw.not_a_route, 'not_a_route'),
    everyday: checked(raw.everyday, 'everyday'),
    everydayFrom: checked(raw.everyday_from, 'everyday_from'),
    stairNotFor: checked(raw.stair_not_for, 'stair_not_for'),
    cooking: checked(raw.cooking, 'cooking'),
    quiet: checked(raw.quiet, 'quiet'),
  };
}

/** Khoá của một cặp loại phòng, không phụ thuộc thứ tự. */
export function mergeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Tập cặp loại phòng được ghép, dạng khoá `mergeKey`.
 *
 * Mọi cặp khai phải trỏ vào mã phòng có thật — một mã gõ sai ở đây thì cặp ấy âm thầm không bao giờ
 * khớp, và mô hình bị từ chối một phòng ghép hợp lệ mà không ai hiểu vì sao.
 */
export function mergeAllowed(vocabulary: RoomVocabulary): Set<string> {
  const codes = new Set(vocabulary.types.map((t) => t.code));
  const out = new Set<string>();
  for (const pair of vocabulary.merge_allowed ?? []) {
    const [a, b] = pair;
    if (!a || !b || !codes.has(a) || !codes.has(b)) {
      throw new Error(`kb/room_vocabulary.yaml: cặp ghép [${pair.join(', ')}] có mã phòng lạ.`);
    }
    out.add(mergeKey(a, b));
  }
  return out;
}

export function parseVocabulary(yamlText: string): RoomVocabulary {
  const raw = parseYaml(yamlText) as RoomVocabulary | undefined;
  if (!raw?.types?.length) {
    throw new Error('kb/room_vocabulary.yaml không đúng định dạng: thiếu mục `types`.');
  }
  for (const entry of raw.types) {
    if (!/^[a-z0-9_]+$/.test(entry.code)) {
      throw new Error(
        `Mã phòng "${entry.code}" không hợp lệ — hợp đồng kb-record chỉ nhận [a-z0-9_].`,
      );
    }
  }
  return raw;
}

/**
 * Thành viên của từng nhóm mã phòng, gửi kèm lời gọi bộ giải.
 *
 * Bộ giải cần biết `target: habitable` của một quy tắc phủ những loại phòng nào. Nó KHÔNG tự
 * tra: bảng từ vựng là tệp dữ liệu phía Worker, và giữ bản sao thứ hai trong Container thì
 * thêm một loại phòng phải sửa hai chỗ.
 *
 * Nhóm khai `members: null` (nghĩa là mọi mã phòng) không cần gửi — bộ giải đã hiểu `all`.
 */
export function roomGroups(vocabulary: RoomVocabulary): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, entry] of Object.entries(vocabulary.group_targets ?? {})) {
    if (entry?.members) out[name] = entry.members;
  }
  return out;
}

/**
 * Đưa một nhãn về dạng so khớp được: bỏ dấu tiếng Việt, viết hoa, bỏ mọi ký tự không phải
 * chữ hoặc số.
 *
 * Vì sao bỏ dấu: cùng một phòng được gõ "PHÒNG NGỦ", "PHONG NGU" và "Phòng Ngu" trong ba bản
 * vẽ khác nhau của cùng một người. Giữ dấu thì bảng bí danh phải liệt kê đủ mọi biến thể.
 */
export function normaliseKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Bảng tra bí danh → mã phòng, dựng một lần rồi dùng lại. */
export class VocabularyIndex {
  private readonly byKey = new Map<string, string>();
  private readonly stripPatterns: RegExp[];

  constructor(readonly vocabulary: RoomVocabulary) {
    // Mặc định giữ đúng hành vi cũ nếu tệp YAML chưa khai: bỏ số thứ tự ở đuôi.
    this.stripPatterns = (vocabulary.strip_patterns ?? ['[0-9]+$']).map(
      (source) => new RegExp(source),
    );
    for (const entry of vocabulary.types) {
      // Bản thân mã phòng cũng là một bí danh: bản vẽ mới do chính hệ thống xuất ra sẽ mang
      // đúng mã chuẩn, và bắt nó đi vòng qua mô hình ngôn ngữ là tốn tiền để ra lại chính nó.
      this.add(entry.code, entry.code);
      this.add(entry.vi, entry.code);
      for (const alias of entry.aliases ?? []) this.add(alias, entry.code);
    }
  }

  private add(alias: string, code: string): void {
    const key = normaliseKey(alias);
    // Bí danh trùng nhau giữa hai loại phòng: giữ loại KHAI TRƯỚC. Ghi đè im lặng sẽ khiến
    // thứ tự dòng trong tệp YAML âm thầm quyết định kết quả.
    if (key && !this.byKey.has(key)) this.byKey.set(key, code);
  }

  get codes(): string[] {
    return this.vocabulary.types.map((t) => t.code);
  }

  /**
   * Tra nhãn nguyên văn, không gọi mạng. Trả `undefined` khi không chắc.
   *
   * Khớp nguyên nhãn TRƯỚC, rồi mới thử từng đuôi khai ở `strip_patterns`. Thứ tự đó quan
   * trọng: có loại phòng mà con số là một phần của tên, và gỡ trước là quy sai loại.
   *
   * Gỡ dồn chứ không thay phiên: nhãn thật `"SẢNH/ SINH HOẠT CHUNG 11.3m²"` mang cả diện
   * tích lẫn số, phải gỡ hết mới còn phần tra được.
   */
  lookup(label: string): string | undefined {
    let key = normaliseKey(label);
    if (!key) return undefined;
    const hit = this.byKey.get(key);
    if (hit) return hit;
    for (const pattern of this.stripPatterns) {
      const shorter = key.replace(pattern, '');
      if (shorter === key) continue;
      key = shorter;
      const next = this.byKey.get(key);
      if (next) return next;
    }
    return undefined;
  }
}
