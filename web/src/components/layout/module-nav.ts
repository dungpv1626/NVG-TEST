/**
 * Danh mục module dùng chung cho MỌI thanh điều hướng: sidebar máy tính, thanh dưới điện
 * thoại, và bảng "Tất cả module".
 *
 * Gom về một chỗ vì icon và đường dẫn của một module phải giống hệt nhau ở mọi nơi
 * (Content Guidelines 6.6: một khái niệm luôn dùng đúng một icon). Chép sang hai nơi thì
 * lần đổi đường dẫn tiếp theo sẽ chỉ đổi một bên, và thanh dưới dẫn tới trang trắng.
 */

import {
  Boxes,
  Building,
  ClipboardList,
  FileSignature,
  HardHat,
  LayoutDashboard,
  PencilRuler,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MODULE_CODES, type ModuleCode, type RoleCode } from '@nvg/shared';
import { useAuth } from '@/lib/auth';

/** Một khái niệm luôn dùng đúng một icon xuyên suốt hệ thống (Content Guidelines 6.6). */
export const MODULE_ICONS: Record<ModuleCode, LucideIcon> = {
  BC: LayoutDashboard,
  CRM: Users,
  DA: ClipboardList,
  TK: PencilRuler,
  HD: FileSignature,
  TC: HardHat,
  MH: ShoppingCart,
  KHO: Warehouse,
  KT: Wallet,
  NS: Building,
  SX: Boxes,
  NEN: Settings,
};

export const MODULE_ROUTES: Record<ModuleCode, string> = {
  BC: '/dashboard',
  CRM: '/crm/co-hoi',
  DA: '/da/goi-thau',
  TK: '/tk/du-an',
  HD: '/hd/hop-dong',
  TC: '/tc/cong-trinh',
  MH: '/mh/de-nghi-mua',
  KHO: '/kho/ton-kho',
  KT: '/kt/de-nghi-thanh-toan',
  NS: '/ns/nhan-su',
  SX: '/sx/tai-san-cho-thue',
  NEN: '/nen/quan-tri',
};

/**
 * Module người dùng được xem, theo THỨ TỰ ƯU TIÊN NGHIỆP VỤ (không xếp alphabet).
 *
 * Module không có quyền xem thì KHÔNG hiển thị, chứ không hiện rồi báo lỗi khi bấm
 * (Webapp Flow 2.3 và 6.5).
 */
export function useVisibleModules(): ModuleCode[] {
  const { profile } = useAuth();
  const managesRules = useManagesApprovalRules();
  return MODULE_CODES.filter(
    (code) =>
      profile?.permissions?.some((p) => p.moduleCode === code && p.canView) ||
      // Tổng Giám đốc thấy mục Quản trị hệ thống, chỉ với hai màn hình hạn mức / thời hạn.
      (code === 'NEN' && managesRules),
  );
}

/**
 * Vai trò được SỬA hạn mức phê duyệt và thời hạn xử lý — cùng nhóm với chính sách CSDL
 * (migration 0141: `auth_has_role('ADMIN', 'TGD')`). Haan 30/09/2026: «chỉ TGĐ» — Giám đốc Tài
 * chính và các thành viên Ban Giám đốc khác không sửa. Sửa nhóm này thì sửa cả migration.
 */
export const APPROVAL_RULE_EDITOR_ROLES: readonly RoleCode[] = ['ADMIN', 'TGD'];

/** Hai màn hình Quản trị mà Tổng Giám đốc mở được; các màn hình Quản trị khác vẫn chỉ ADMIN. */
export const APPROVAL_RULE_PATHS = ['/nen/han-muc', '/nen/thoi-han'] as const;

export function useManagesApprovalRules(): boolean {
  const { profile } = useAuth();
  return (
    profile?.assignments?.some((a) => APPROVAL_RULE_EDITOR_ROLES.includes(a.roleCode)) ?? false
  );
}

/**
 * Đường vào của từng module trên thanh bên / thanh dưới. Người chỉ quản lý hạn mức (Tổng Giám
 * đốc) vào thẳng màn hình Hạn mức — trang đầu mặc định của Quản trị là Người dùng, họ không mở được.
 */
export function useModuleRoutes(): Record<ModuleCode, string> {
  const canViewNen = useCanViewModule('NEN');
  return canViewNen ? MODULE_ROUTES : { ...MODULE_ROUTES, NEN: APPROVAL_RULE_PATHS[0] };
}

/**
 * Vai trò hiện tại có được xem một phân hệ hay không.
 *
 * Cùng một nguồn với `useVisibleModules` — quyền quyết định menu và quyền quyết định vào được
 * màn hình phải là MỘT phép tính. Trước đây chỉ menu dùng tới nó, nên gõ thẳng đường dẫn là
 * vào được phân hệ đã bị ẩn: dữ liệu vẫn an toàn nhờ RLS, nhưng màn hình hiện ra trạng thái
 * rỗng như thể phân hệ đó không có dữ liệu (Webapp Flow 6.5).
 */
export function useCanViewModule(code: ModuleCode): boolean {
  const { profile } = useAuth();
  return profile?.permissions?.some((p) => p.moduleCode === code && p.canView) ?? false;
}

/**
 * Module ứng với màn hình đang mở, nhận biết theo ĐOẠN ĐẦU của đường dẫn.
 *
 * Không dùng trạng thái `isActive` sẵn có của `NavLink`: nó so khớp với đúng đường dẫn đích
 * của mục menu, nên đang ở `/crm/khach-hang` mà mục menu trỏ tới `/crm/co-hoi` thì cả menu
 * không có mục nào sáng lên — người dùng mất một trong ba lớp định vị "luôn biết mình đang
 * ở đâu" (Webapp Flow 6.2), rõ nhất trên điện thoại vì ở đó không còn breadcrumb dài.
 *
 * Trả về `null` ở màn hình dùng chung không thuộc module nào (Hộp thư Phê duyệt).
 */
export function useActiveModule(): ModuleCode | null {
  const { pathname } = useLocation();
  const segment = `/${pathname.split('/')[1] ?? ''}`;
  return (
    MODULE_CODES.find(
      (code) => MODULE_ROUTES[code] === segment || MODULE_ROUTES[code].startsWith(`${segment}/`),
    ) ?? null
  );
}

/** Số mục tối đa trên thanh điều hướng dưới của điện thoại — Webapp Flow 4.8: 4–5 mục. */
export const BOTTOM_NAV_LIMIT = 5;

/**
 * Chia danh sách module thành phần hiện thẳng trên thanh dưới và phần nằm trong bảng "Thêm".
 *
 * Vừa đủ 5 module thì hiện cả 5 và KHÔNG có mục "Thêm": một nút mở ra bảng trống rỗng chỉ để
 * báo "không còn gì nữa" là lấy mất một ô của thanh điều hướng để đổi lấy con số không.
 */
export function splitBottomNav(visible: ModuleCode[]): {
  primary: ModuleCode[];
  rest: ModuleCode[];
} {
  if (visible.length <= BOTTOM_NAV_LIMIT) return { primary: visible, rest: [] };
  return {
    // Chừa một ô cho mục "Thêm".
    primary: visible.slice(0, BOTTOM_NAV_LIMIT - 1),
    rest: visible.slice(BOTTOM_NAV_LIMIT - 1),
  };
}
