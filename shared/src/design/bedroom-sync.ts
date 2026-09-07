/**
 * Đồng bộ dòng PHÒNG NGỦ ở «Không gian bắt buộc có» theo phần «Thành viên gia đình».
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────────────────────
 * Số phòng ngủ suy từ gia đình (`kb/space_norms.yaml` mục `occupancy`), nên trước đây hai mã
 * `bedroom`/`master_bedroom` bị gỡ khỏi danh sách chọn để không ai khai hai lần. Cái mất là
 * mọi thứ khai THEO TỪNG PHÒNG: ghim tầng, diện tích mong muốn, và nay là tiện ích bổ sung.
 * Danh sách không gian cũng đọc ra thiếu — nhìn vào không thấy phòng ngủ đâu.
 *
 * Hàm này giữ cả hai: **số lượng vẫn do gia đình quyết**, còn danh sách không gian có đủ
 * dòng để tinh chỉnh. Engine đã sẵn luật cho đúng chuyện đó — dòng phòng ngủ khai tường minh
 * GHI ĐÈ lên phần suy diễn chứ không cộng thêm (`engine.ts`, `overriddenRows`).
 *
 * ── Điều KHÔNG được làm ─────────────────────────────────────────────────────────────────
 * Đây KHÔNG phải chỗ thứ hai để khai số phòng ngủ. Hàm chỉ chạy một chiều — gia đình → danh
 * sách không gian — và người dùng không thêm/bớt được dòng phòng ngủ bằng tay ở đầu kia; xoá
 * một dòng thì lần đồng bộ sau nó quay lại. Ngược lại là hai nguồn dữ liệu nói khác nhau về
 * cùng một con số (CLAUDE.md 5.2).
 *
 * ── Giữ gì khi đồng bộ lại ──────────────────────────────────────────────────────────────
 * Ghép dòng cũ với dòng mong muốn theo THỨ TỰ, ưu tiên dòng trùng cả loại lẫn "khép kín".
 * Nhờ vậy thêm một đứa con không làm mất diện tích và tiện ích đã gõ cho các phòng trước đó.
 */

import { bedroomsFor, bedroomTypeFor } from './kb.generated';
import { FAMILY_ROLE_LABEL, type FamilyRole } from './brief-vocabulary';
import type { DesignBriefDraft } from './brief-draft';

type SpaceItem = NonNullable<DesignBriefDraft['required_spaces']>[number];

/**
 * Hình dạng LỎNG của một nhóm thành viên — cố ý không dùng thẳng kiểu của hợp đồng.
 *
 * Hợp đồng bó `role` vào năm giá trị, đúng cho dữ liệu SẼ ghi. Nhưng ba hàm dưới đây đọc dữ
 * liệu ĐANG CÓ: bản nháp trong trình duyệt, đầu bài đã lưu từ trước, và bản ghi mang vai trò
 * đã gỡ khỏi `occupancy`. Bó kiểu ở đây thì nơi gọi phải ép kiểu, và ép kiểu là chỗ lỗi thật
 * đi qua mà không ai thấy. Vai trò lạ đã có nhánh xử lý riêng — trả về rỗng, không đoán.
 */
type FamilyMemberLike = {
  role?: string;
  count?: number;
  floor?: number | null;
  needs?: readonly string[] | null;
  ensuite?: boolean | null;
};
type FamilyMember = FamilyMemberLike;

/** Hai mã do `occupancy` sinh ra. Mọi mã khác không thuộc phạm vi hàm này. */
export const BEDROOM_TYPES = ['bedroom', 'master_bedroom'] as const;

export function isBedroomType(type: string): boolean {
  return (BEDROOM_TYPES as readonly string[]).includes(type);
}

/**
 * Nhóm này có muốn phòng ngủ khép kín không.
 *
 * Đọc CẢ hai cách khai: `ensuite` (cách hiện hành) và chuỗi `"wc"` trong `needs` (cách trước
 * 06/09/2026). Chuỗi đó chưa bao giờ có tác dụng ở Lớp 2, nhưng nó nằm sẵn trong đầu bài đã
 * lưu — bỏ qua nó ở đây là làm mất một câu trả lời người dùng đã đưa.
 */
export function memberWantsEnsuite(member: FamilyMember): boolean {
  return member.ensuite === true || (member.needs ?? []).includes('wc');
}

/** Một phòng ngủ suy từ gia đình, kèm chỗ nó đến từ đâu. */
export interface DerivedBedroom {
  type: string;
  ensuite: boolean;
  floor: number | null;
  /** Nhóm thành viên sinh ra phòng này. */
  role: string;
  /** Thứ tự trong CHÍNH nhóm đó, bắt đầu từ 1. */
  ordinal: number;
  /** Tổng số phòng nhóm đó sinh ra — chỉ đánh số khi lớn hơn 1. */
  ofRole: number;
}

/**
 * Phòng ngủ mà thành phần gia đình sinh ra, theo đúng thứ tự khai.
 *
 * `ordinal`/`ofRole` đếm theo VAI trên toàn gia đình, không theo từng nhóm: hai nhóm «con»
 * khai tách (một ở tầng 2, một ở tầng 3) là hai phòng cùng vai, và nhãn «Phòng ngủ (con)»
 * lặp hai lần thì không phân biệt được — đếm theo nhóm đã cho ra đúng lỗi đó (08/09/2026).
 */
export function bedroomsFromFamily(family: readonly FamilyMember[] | undefined): DerivedBedroom[] {
  const members = family ?? [];
  const totalOfRole = new Map<string, number>();
  for (const member of members) {
    const role = member.role ?? '';
    if (!bedroomTypeFor(role)) continue;
    const count = bedroomsFor(role, member.count ?? 0);
    if (count > 0) totalOfRole.set(role, (totalOfRole.get(role) ?? 0) + count);
  }

  const out: DerivedBedroom[] = [];
  const seenOfRole = new Map<string, number>();
  for (const member of members) {
    const role = member.role ?? '';
    const type = bedroomTypeFor(role);
    const count = bedroomsFor(role, member.count ?? 0);
    if (!type || count <= 0) continue;
    for (let i = 0; i < count; i += 1) {
      const ordinal = (seenOfRole.get(role) ?? 0) + 1;
      seenOfRole.set(role, ordinal);
      out.push({
        type,
        ensuite: memberWantsEnsuite(member),
        floor: member.floor ?? null,
        role,
        ordinal,
        ofRole: totalOfRole.get(role) ?? count,
      });
    }
  }
  return out;
}

/**
 * «Phòng ngủ này của ai» — chuỗi đặt trong ngoặc trên nhãn từng dòng.
 *
 * Vì sao SUY chứ không lưu vào `required_spaces[].role`: chủ nhân của một phòng ngủ đã được
 * khai đúng một lần ở phần Thành viên gia đình. Chép nó xuống dòng không gian là tạo nguồn
 * thứ hai có thể nói khác đi ngay lần sau ai đó sửa số người (CLAUDE.md 5.2).
 *
 * Suy được vì `syncBedroomRows` dựng lại TOÀN BỘ cụm phòng ngủ theo đúng thứ tự hàm trên trả
 * về — phòng ngủ thứ i trong danh sách luôn là phòng ngủ thứ i của gia đình. Nơi gọi vẫn phải
 * kiểm số lượng khớp trước khi dùng: đầu bài chưa qua một lượt đồng bộ nào thì không có bảo
 * đảm đó, và đoán bừa "của ông bà" cho một phòng của khách còn tệ hơn đánh số.
 *
 * Vai trò lạ (đầu bài cũ, hoặc `occupancy` đổi) trả về rỗng chứ không in mã máy ra màn hình.
 */
export function bedroomOwnerLabels(family: readonly FamilyMember[] | undefined): string[] {
  return bedroomsFromFamily(family).map((b) => {
    const label = FAMILY_ROLE_LABEL[b.role as FamilyRole];
    if (!label) return '';
    // Viết thường vì nó nằm giữa câu: «Phòng ngủ (ông bà)», không phải «(Ông bà)».
    const lower = label.charAt(0).toLowerCase() + label.slice(1);
    return b.ofRole > 1 ? `${lower} ${b.ordinal}` : lower;
  });
}

/**
 * Trả về `required_spaces` đã đồng bộ, hoặc CHÍNH mảng cũ khi không có gì phải đổi.
 *
 * Trả về cùng tham chiếu khi không đổi là có chủ ý: nơi gọi dùng nó để biết có cần ghi lại
 * bản nháp hay không. Luôn dựng mảng mới thì mỗi lần gõ một ký tự vào ô khác cũng thành một
 * lần "đầu bài vừa đổi", và hộp thoại «rời trang?» nổ ở chỗ không ai đụng gì.
 */
export function syncBedroomRows(draft: DesignBriefDraft): SpaceItem[] | undefined {
  const current = draft.required_spaces ?? [];
  const desired = bedroomsFromFamily(draft.family);

  // Kho dòng phòng ngủ cũ, giữ nguyên thứ tự — nguồn để ghép lại.
  const pool = current.filter((it) => isBedroomType(it.type));
  if (pool.length === 0 && desired.length === 0) return draft.required_spaces;

  const taken = new Set<SpaceItem>();
  const pick = (type: string, ensuite: boolean): SpaceItem | undefined => {
    // Hai lượt: trùng cả loại lẫn "khép kín" trước, rồi mới trùng mỗi loại. Không có lượt
    // thứ hai thì đổi một phòng từ riêng sang khép kín sẽ vứt diện tích và tiện ích đã gõ.
    const exact = pool.find(
      (it) => !taken.has(it) && it.type === type && (it.ensuite ?? false) === ensuite,
    );
    const hit = exact ?? pool.find((it) => !taken.has(it) && it.type === type);
    if (hit) taken.add(hit);
    return hit;
  };

  const rebuilt: SpaceItem[] = desired.map((want) => {
    const old = pick(want.type, want.ensuite);
    return {
      type: want.type,
      // Tầng: phần Thành viên gia đình là NGUỒN khi có khai — dòng được sinh ngay lúc thêm
      // thành viên (tầng còn trống), nên nếu dòng đã có mà cứ giữ tầng của dòng thì mọi lần
      // chọn tầng ở gia đình sau đó đều bị nuốt, và engine (đọc `pinned` từ chính dòng này)
      // không bao giờ nhận được (lỗi bắt 08/09/2026). Gia đình để trống thì dòng mới được
      // đặt tầng riêng, và tầng ấy giữ qua các lần đồng bộ.
      floor: want.floor ?? old?.floor ?? null,
      ...(old?.area_m2 != null ? { area_m2: old.area_m2 } : {}),
      ensuite: want.ensuite,
      ...(old?.amenities ? { amenities: old.amenities } : {}),
    };
  });

  // Chèn lại đúng chỗ cụm phòng ngủ đang đứng, để danh sách không nhảy loạn khi đồng bộ.
  const anchor = current.findIndex((it) => isBedroomType(it.type));
  const rest = current.filter((it) => !isBedroomType(it.type));
  const at = anchor === -1 ? rest.length : Math.min(anchor, rest.length);
  const next = [...rest.slice(0, at), ...rebuilt, ...rest.slice(at)];

  return sameRows(current, next) ? draft.required_spaces : next;
}

function sameRows(a: readonly SpaceItem[], b: readonly SpaceItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i]!;
    return (
      x.type === y.type &&
      (x.floor ?? null) === (y.floor ?? null) &&
      (x.area_m2 ?? null) === (y.area_m2 ?? null) &&
      (x.ensuite ?? null) === (y.ensuite ?? null) &&
      (x.amenities ?? null) === (y.amenities ?? null)
    );
  });
}
