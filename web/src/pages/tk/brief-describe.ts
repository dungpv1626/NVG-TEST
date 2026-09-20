/**
 * Một giá trị của đầu bài đọc thành CHỮ TIẾNG VIỆT.
 *
 * Tách khỏi `brief-panel.tsx` ngày 07/09/2026 để bản in dùng CHUNG đúng hàm này. Dựng bản in
 * bằng một phép dịch riêng là chuyện chắc chắn xảy ra: hai nơi rồi sẽ nói hai con số và hai
 * cái tên khác nhau về cùng một trường, và bản in là thứ mang đi gặp khách nên sai ở đó tốn
 * hơn sai trên màn hình.
 *
 * Không nơi nào ở đây được in mã máy ra: mọi mã đều đi qua bảng nhãn (CLAUDE.md 4.1).
 */

import { formatCurrency, formatNumber } from '@nvg/shared';
import {
  ACCESS_SIDES,
  DERIVED_NEED_CODES,
  FAMILY_ROLE_LABEL,
  FLOOR_PREF_LABEL,
  ROOM_LABEL,
  SIDE_LABEL,
  bedroomOwnerLabels,
  bedroomTypeFor,
  bedroomsFor,
  displayNumber,
  isBedroomType,
  siteGeometry,
  type BriefFormField,
  type FamilyRole,
  type FloorPref,
} from '@nvg/shared/design';

/** Một nhóm thành viên, đã đọc thành chữ tiếng Việt — dùng chung cho màn hình và bản in. */
export interface FamilyRow {
  /** Vai trò, đã tra nhãn. */
  role: string;
  count: number;
  /** Ví dụ «2 phòng ngủ», «1 phòng ngủ chính». Rỗng khi vai trò không sinh phòng ngủ nào. */
  bedrooms: string;
  /** «Khép kín» hoặc «Riêng» — biểu mẫu luôn hiện đúng một trong hai, bản in phải khớp. */
  bedroomKind: string;
  /** «Tầng 2», hoặc nguyện vọng tầng của đầu bài cũ, hoặc rỗng. */
  floor: string;
  /** Nhu cầu riêng, đã tra nhãn và đã lọc mã Lớp 2 tự suy. */
  needs: string[];
}

/**
 * Đọc `family[]` thành từng dòng có cấu trúc.
 *
 * Tách khỏi `describeField` ngày 07/09/2026 vì bản in cần BẢNG, còn màn hình cần một dòng
 * chữ. Hai cách trình bày, nhưng phải cùng một phép đọc: dựng riêng cho bản in là chuyện
 * chắc chắn lệch, và bản in là thứ mang đi gặp khách.
 */
export function familyRows(value: unknown, field: BriefFormField): FamilyRow[] {
  const members = (value ?? []) as {
    role?: string;
    count?: number;
    floor?: number | null;
    floor_pref?: string | null;
    needs?: string[];
    ensuite?: boolean;
  }[];
  const label = (raw: unknown): string => {
    const found = field.options?.find((option) => String(option.value) === String(raw));
    return found ? found.label : String(raw);
  };

  return members.map((member) => {
    const rooms = bedroomsFor(member.role ?? '', member.count ?? 0);
    const roomLabel = ROOM_LABEL[bedroomTypeFor(member.role ?? '') ?? ''] ?? 'phòng ngủ';
    // Tầng cụ thể thắng nguyện vọng cũ — cùng thứ tự Lớp 2 áp dụng.
    const floor =
      typeof member.floor === 'number'
        ? `Tầng ${member.floor}`
        : member.floor_pref
          ? (FLOOR_PREF_LABEL[member.floor_pref as FloorPref] ?? member.floor_pref)
          : '';
    // Đầu bài cũ khai cả ba thứ Lớp 2 TỰ SUY vào `needs`: `wc` (cách khai "khép kín" cũ),
    // `bedroom` và `master_bedroom` (hai ô chọn không bao giờ có tác dụng). Không mã nào còn
    // trong danh sách lựa chọn, nên tra nhãn không ra và mã máy lọt ra màn hình — đúng lỗi
    // này đã thấy trên hồ sơ thật (CLAUDE.md 4.1).
    const needs = (member.needs ?? []).filter((n) => !DERIVED_NEED_CODES.includes(n));
    return {
      role: FAMILY_ROLE_LABEL[member.role as FamilyRole] ?? member.role ?? '',
      count: member.count ?? 0,
      bedrooms: rooms > 0 ? `${rooms} ${roomLabel.toLowerCase()}` : '',
      // Cùng phép suy với ô chọn của biểu mẫu (`isEnsuite`): luôn đúng một trong hai vế, không
      // có trạng thái "chưa rõ" — nên bản in không được để trống ô này.
      bedroomKind: member.ensuite || member.needs?.includes('wc') ? 'Khép kín' : 'Riêng',
      floor,
      needs: needs.map(label),
    };
  });
}

/**
 * Một giá trị đã lưu, viết ra bằng tiếng Việt.
 *
 * Phải BIẾT TRƯỜNG mới viết đúng: cùng một chuỗi `"bedroom"` là "Phòng ngủ" ở danh sách
 * không gian và là một vai trò khác ở chỗ khác; một cặp số là khoảng ngân sách ở đây và là
 * kích thước ở chỗ khác. Bản trước đổ thẳng giá trị ra màn hình nên hiện `nha_pho`,
 * `[object Object]` và `2000000000` — mã máy giữa một màn hình tiếng Việt (CLAUDE.md 4.1),
 * đúng thứ nhân sự NVG không đọc được.
 */
export function describeField(
  field: BriefFormField,
  value: unknown,
  /** Thành phần gia đình của CHÍNH bản ghi đang xem — để gọi tên phòng ngủ theo chủ nhân. */
  family?: unknown,
): string | null {
  if (value === undefined || value === null || value === '') return null;

  const label = (raw: unknown): string => {
    const found = field.options?.find((option) => String(option.value) === String(raw));
    return found ? found.label : String(raw);
  };

  if (field.control === 'money_range') {
    const [low, high] = value as (number | null)[];
    if (low === null && high === null) return null;
    return `${formatCurrency(low ?? 0)} – ${formatCurrency(high ?? 0)}`;
  }

  if (field.control === 'family') {
    const rows = familyRows(value, field);
    if (!rows.length) return null;
    return rows
      .map((row) => {
        const parts = [`${row.role}: ${row.count} người`];
        // Số phòng ngủ nói ngay trong dòng tóm tắt: đó là thứ người đọc đầu bài muốn đối
        // chiếu với chương trình không gian, và nó không suy được bằng mắt từ số người.
        if (row.bedrooms) parts.push(row.bedrooms);
        if (row.floor) parts.push(row.floor);
        if (row.bedroomKind === 'Khép kín') parts.push('khép kín');
        if (row.needs.length) parts.push(row.needs.join(', '));
        return parts.join(' · ');
      })
      .join(' | ');
  }

  if (field.control === 'space_floor') {
    const items = value as {
      type: string;
      floor?: number | null;
      area_m2?: number | null;
      ensuite?: boolean | null;
      amenities?: string | null;
    }[];
    if (!items.length) return null;
    // Gộp các dòng GIỐNG HỆT nhau thành "×N": bảy phòng ngủ để hệ thống tự xếp mà liệt kê
    // bảy lần thì dòng tóm tắt dài mà không thêm thông tin nào. Dòng có ghim tầng hoặc có
    // diện tích riêng thì mỗi cái một mục, vì lúc đó chúng khác nhau thật.
    // «Phòng ngủ (con 2)» thay cho «Phòng ngủ ×2»: gọi tên theo chủ nhân là thứ người đọc hồ
    // sơ cần, và nó cũng làm mỗi phòng ngủ thành một mục riêng — đúng, vì chúng khác nhau
    // thật. Dùng CHUNG hàm suy nhãn với chế độ nhập; hai bản suy riêng sẽ lệch nhau.
    const owners = bedroomOwnerLabels(family as Parameters<typeof bedroomOwnerLabels>[0]);
    const bedroomSeats = new Map<number, number>();
    items.forEach((it, i) => {
      if (isBedroomType(it.type)) bedroomSeats.set(i, bedroomSeats.size);
    });
    const useOwners = owners.length === bedroomSeats.size;

    const groups = new Map<string, { text: string; count: number }>();
    for (const [i, it] of items.entries()) {
      const detail = [
        typeof it.floor === 'number' ? `Tầng ${it.floor}` : null,
        typeof it.area_m2 === 'number' ? `tối thiểu ${formatNumber(it.area_m2)} m²` : null,
        // Tiện ích bổ sung PHẢI hiện ở chế độ xem: đây là yêu cầu khách nói ra mà engine
        // không đọc, nên nếu màn hình cũng không hiện thì nó chỉ nằm trong CSDL — bằng chưa
        // từng ghi.
        it.amenities ? it.amenities : null,
      ].filter(Boolean);
      // Khép kín hay không là khác biệt lớn nhất giữa hai phòng ngủ, và nó cũng là thứ tách
      // hai dòng ra khỏi phép gộp "×N" bên dưới.
      //
      // `null`/vắng mặt thì KHÔNG nói gì — đầu bài lưu trước 07/09/2026 chưa có trường này, và
      // hợp đồng quy định lúc đó lấy theo `family`. Đoán "riêng" ở đây là nói ngược lại phần
      // Thành viên gia đình ngay trên cùng màn hình, và cái sai đó trông y như một sự thật.
      const owner = useOwners && bedroomSeats.has(i) ? (owners[bedroomSeats.get(i)!] ?? '') : '';
      const base = owner ? `${label(it.type)} (${owner})` : label(it.type);
      const name =
        isBedroomType(it.type) && it.ensuite != null
          ? `${base} · ${it.ensuite ? 'khép kín' : 'riêng'}`
          : base;
      const text = detail.length ? `${name} (${detail.join(', ')})` : name;
      const entry = groups.get(text) ?? { text, count: 0 };
      entry.count += 1;
      groups.set(text, entry);
    }
    return [...groups.values()]
      .map((g) => (g.count > 1 ? `${g.text} ×${g.count}` : g.text))
      .join(', ');
  }

  if (field.control === 'polygon') {
    // KHÔNG đổ danh sách toạ độ ra màn hình: "0,0, 5,0, 5,18…" không ai đọc được, và với
    // ngũ giác thì dài quá một dòng. Cái người đọc cần là hệ thống ĐANG HIỂU thửa đất này
    // rộng bao nhiêu — toạ độ đã có ở chế độ sửa.
    const points = value as [number, number][];
    if (points.length < 3) return null;
    try {
      const geometry = siteGeometry({
        width_m: 1,
        depth_m: 1,
        shape: 'da_giac',
        boundary_m: points,
      });
      return (
        `${points.length} đỉnh · ${formatNumber(geometry.areaM2)} m² · ` +
        `phần xây được ${formatNumber(geometry.buildable.widthM)} × ` +
        `${formatNumber(geometry.buildable.depthM)} m`
      );
    } catch {
      return `${points.length} đỉnh — chưa dựng được hình thửa`;
    }
  }

  if (field.control === 'number') {
    // Cùng phép quy đổi với ô nhập (`displayNumber`). Bỏ bước này thì mật độ 60 % lưu dưới
    // dạng 0,6 sẽ hiện ra «0,6 %» ở chế độ xem — màn hình sửa và màn hình xem nói hai con số
    // khác nhau về cùng một trường.
    const shown = formatNumber(displayNumber(field, Number(value)));
    return field.unit ? `${shown} ${field.unit}` : shown;
  }

  if (field.control === 'sides') {
    const sides = value as Record<string, unknown>;
    const parts = ACCESS_SIDES.filter((side) => sides[side]).map(
      (side) => `${SIDE_LABEL[side]}: ${label(sides[side])}`,
    );
    return parts.length ? parts.join(' · ') : null;
  }

  if (Array.isArray(value)) return value.length ? value.map(label).join(', ') : null;
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';

  if (typeof value === 'object') {
    // Đi qua bảng nhãn chứ không đổ thẳng ra chuỗi: người quyết định cuối lưu dưới dạng
    // `{ relationship: 'chu_nha' }`, và bỏ bước này thì màn hình hiện đúng chữ `chu_nha`.
    const parts = Object.values(value as Record<string, unknown>)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map((v) => label(v));
    return parts.length ? parts.join(' · ') : null;
  }

  return label(value);
}
