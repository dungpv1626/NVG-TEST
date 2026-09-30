/**
 * Sidebar — vùng 1 của App Shell (Webapp Flow Mục 2.1).
 *
 * CHỈ hiện từ khổ máy tính bảng ngang trở lên. Trên điện thoại, điều hướng chuyển sang
 * thanh dưới (`bottom-nav.tsx`) — Webapp Flow 4.8 cấm thu nhỏ bố cục máy tính rồi bắt
 * người dùng bấm vào các mục li ti.
 *
 * Danh sách module và thứ tự lấy từ `module-nav.ts`, dùng chung với thanh dưới.
 *
 * ── Thu gọn được (06/09/2026) ────────────────────────────────────────────────────────────
 * Thanh có hai bề rộng: **240px** mở và **80px** thu. Thu gọn trả lại 160px cho vùng nội
 * dung — đáng kể ở những màn hình rộng thật sự cần chỗ: bản vẽ, bảng dự toán nhiều cột, lưới
 * thẻ của Trang dự án thiết kế.
 *
 * Ở trạng thái thu, mỗi mục xếp DỌC (biểu tượng trên, nhãn ngắn dưới) chứ không bỏ hẳn chữ.
 * Một cột toàn biểu tượng bắt người dùng học 12 hình mới, và `title` chỉ hiện sau khi rê chuột
 * đứng yên — vô dụng khi họ đang quét mắt tìm chỗ cần bấm.
 *
 * Nhãn ngắn là chữ NHÌN THẤY, còn tên đọc được của liên kết vẫn là nhãn đầy đủ (`aria-label`).
 * Mọi `shortLabel` đều là một phần của `label` nên không phạm WCAG 2.5.3 — có test canh.
 *
 * ⚠️ Dùng `Link`, KHÔNG dùng `NavLink`. `NavLink` tự tính trạng thái hoạt động theo đường dẫn
 * của chính nó và **ghi đè `aria-current` ta truyền vào** — nên có những đường dẫn mà mục vẫn
 * sáng pill nền mint (ta tô theo `useActiveModule`) nhưng `aria-current` bị bỏ trống. Khi đó
 * màu là cách DUY NHẤT nói cho biết đang ở đâu, đúng thứ Content Guidelines 6.8 cấm, và người
 * dùng bàn phím mất hẳn mốc định vị. Một nguồn sự thật: `useActiveModule()`.
 */

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MODULES } from '@nvg/shared';
import { cn } from '@/lib/utils';
import { CompanySwitcher } from './company-switcher';
import { MODULE_ICONS, useActiveModule, useModuleRoutes, useVisibleModules } from './module-nav';
import { useTkScope } from './tk-chrome';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

export function Sidebar() {
  const visible = useVisibleModules();
  const moduleRoutes = useModuleRoutes();
  const activeModule = useActiveModule();
  const { collapsed, toggle } = useSidebarCollapsed();
  // Trong Module Thiết kế, thanh này mặc bảng màu tối CỐ ĐỊNH của bản mẫu (§4.3) — tối ở cả
  // chế độ sáng lẫn tối, đúng như bản mẫu ghi là chủ ý. Nên nó KHÔNG dùng `--color-tk-*`
  // (bộ đó đổi theo chế độ) mà dùng bộ `--color-navdark-*` chỉ có một giá trị.
  const tk = useTkScope();

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col self-stretch overflow-hidden border',
        tk
          ? // Bản mẫu §5.1: ba vùng sát nhau, chỉ một đường viền phải ngăn cách.
            'border-transparent border-r-navdark-line bg-navdark-bg lg:flex lg:h-[100dvh]'
          : cn(
              'rounded-xl border-border bg-surface',
              // Panel nổi trên nền trũng (thay thanh full-bleed cũ) — DESIGN_SYSTEM.md.
              'lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-1.5rem)]',
            ),
        'transition-[width] duration-(--motion-base) ease-(--ease-out)',
        collapsed ? 'w-20' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1 border-b p-2',
          tk ? 'border-navdark-line' : 'border-border',
          collapsed && 'flex-col',
        )}
      >
        {/* Thu gọn thì bộ chọn pháp nhân dùng lại dạng `compact` sẵn có của thanh trên —
            không dựng dạng thứ ba cho cùng một điều khiển. */}
        <div className={cn('min-w-0', collapsed ? 'w-full' : 'flex-1')}>
          <CompanySwitcher compact={collapsed} onDark={tk} />
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="dieu-huong-chinh"
          title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-md',
            'transition-colors duration-(--motion-fast) ease-(--ease-out)',
            tk
              ? 'border border-navdark-line bg-navdark-btn text-navdark-fg hover:text-navdark-fg-strong'
              : 'text-fg-subtle hover:bg-surface-hover hover:text-brand-forest',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
        </button>
      </div>

      <nav
        id="dieu-huong-chinh"
        className="flex-1 overflow-y-auto p-2"
        aria-label="Điều hướng chính"
      >
        <ul className="space-y-0.5">
          {visible.map((code) => {
            const Icon = MODULE_ICONS[code];
            const meta = MODULES[code];
            const isActive = activeModule === code;
            return (
              <li key={code}>
                <Link
                  to={moduleRoutes[code]}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex rounded-md',
                    'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                    tk
                      ? 'text-navdark-fg hover:bg-navdark-hover hover:text-navdark-fg-strong'
                      : 'text-fg-subtle hover:bg-surface-hover hover:text-brand-forest',
                    collapsed
                      ? 'flex-col items-center gap-1 px-1 py-2 text-center'
                      : 'items-center gap-2 py-2 pr-2 pl-3',
                    // Mục đang hoạt động tô đậm (Webapp Flow 2.1) — một trong ba lớp
                    // định vị "luôn biết mình đang ở đâu" (Webapp Flow 6.2). Sáng theo
                    // MODULE, không theo đúng một đường dẫn: mọi màn hình trong CRM đều
                    // phải làm mục "Khách hàng & Cơ hội" sáng lên.
                    //
                    // Pill nền mint khi active (thay thanh chỉ mục cam an toàn cũ) — theo
                    // bản demo "dashboard soft light style" (DESIGN_SYSTEM.md).
                    isActive &&
                      (tk
                        ? 'bg-navdark-sel font-semibold text-navdark-sel-fg hover:bg-navdark-sel hover:text-navdark-sel-fg'
                        : 'bg-brand-subtle font-bold text-brand-forest hover:bg-brand-subtle'),
                  )}
                  // Tên đọc được luôn là nhãn ĐẦY ĐỦ, kể cả khi trên màn hình chỉ thấy nhãn
                  // ngắn — người dùng trình đọc màn hình không có gì để "nhìn cho rõ hơn".
                  aria-label={collapsed ? meta.label : undefined}
                  title={collapsed ? meta.label : meta.description}
                >
                  {/* 20px, không phải 24px mặc định của thư viện biểu tượng: ở trạng thái thu
                      gọn biểu tượng đứng trên nhãn 10px, để 24px thì cột nặng đầu và chữ đọc
                      như phần phụ. Bản mẫu §5.2 để 19px. */}
                  <Icon className="size-5 shrink-0" aria-hidden />
                  {/* Thu gọn thì CHO XUỐNG DÒNG, không cắt cụt: "Khách …" không nói được mục
                      đó là gì, còn "Khách hàng" xuống hai dòng thì vẫn đọc được. */}
                  <span className={cn(collapsed ? 'w-full text-2xs' : 'truncate')}>
                    {collapsed ? meta.shortLabel : meta.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Thu gọn thì bỏ dòng chân: 76px không đủ cho "Hệ thống Quản trị NVG", và cắt cụt tên
          hệ thống thì thà không hiện. */}
      {!collapsed && (
        <div
          className={cn(
            'border-t px-3 py-2.5 text-xs',
            tk ? 'border-navdark-line text-navdark-fg' : 'border-border text-fg-subtle',
          )}
        >
          Hệ thống Quản trị NVG
        </div>
      )}
    </aside>
  );
}
