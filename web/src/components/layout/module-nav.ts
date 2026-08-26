/**
 * Danh mục module dùng chung cho MỌI thanh điều hướng: sidebar máy tính, thanh dưới điện
 * thoại, và bảng "Tất cả module".
 *
 * Gom về một chỗ vì icon và đường dẫn của một module phải giống hệt nhau ở mọi nơi
 * (Content Guidelines 6.6: một khái niệm luôn dùng đúng một icon). Chép sang hai nơi thì
 * lần đổi đường dẫn tiếp theo sẽ chỉ đổi một bên, và thanh dưới dẫn tới trang trắng.
 */

import {
  Boxes, Building, ClipboardList, FileSignature, HardHat,
  LayoutDashboard, PencilRuler, Settings, ShoppingCart, Users, Wallet, Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MODULE_CODES, type ModuleCode } from '@nvg/shared';
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
  return MODULE_CODES.filter((code) =>
    profile?.permissions.some((p) => p.moduleCode === code && p.canView),
  );
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
      (code) =>
        MODULE_ROUTES[code] === segment || MODULE_ROUTES[code].startsWith(`${segment}/`),
    ) ?? null
  );
}

/** Số mục tối đa trên thanh điều hướng dưới của điện thoại — Webapp Flow 4.7: 4–5 mục. */
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
