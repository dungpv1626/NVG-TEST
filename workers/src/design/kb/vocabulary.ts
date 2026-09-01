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

  constructor(readonly vocabulary: RoomVocabulary) {
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
   * Hai lượt: khớp nguyên nhãn trước, rồi bỏ phần số đuôi ("PN2" → "PN"). Số đuôi gần như
   * luôn là số thứ tự phòng chứ không đổi loại phòng — nhưng thử nguyên nhãn TRƯỚC vì có
   * loại phòng mà con số là một phần của tên.
   */
  lookup(label: string): string | undefined {
    const key = normaliseKey(label);
    if (!key) return undefined;
    return this.byKey.get(key) ?? this.byKey.get(key.replace(/[0-9]+$/, ''));
  }
}
