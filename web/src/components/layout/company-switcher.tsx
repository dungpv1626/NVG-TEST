/**
 * Bộ chọn pháp nhân — Webapp Flow Mục 2.2.
 *
 * Đặt ở góc trên bên trái sidebar. Danh sách lấy từ `profile.scopeCompanies`, KHÔNG từ
 * `profile.assignments`: vai trò cấp tập đoàn (`sees_all_companies`) xem được cả ba pháp
 * nhân dù chỉ được gán vào NVG. Dựng từ `assignments` thì Giám đốc Tài chính và Quản trị
 * hệ thống chỉ có đúng một mục, rơi vào nhánh "một pháp nhân duy nhất" bên dưới và mất hẳn
 * khả năng bấm — kẹt vĩnh viễn ở chế độ gộp.
 *
 * Chuyển pháp nhân KHÔNG tải lại trang — chỉ đổi state, giữ nguyên module đang xem.
 *
 * Trên điện thoại, sidebar không hiển thị nên bộ chọn chuyển lên thanh trên ở dạng `compact`
 * (chỉ mã pháp nhân). Vẫn phải LUÔN nhìn thấy được: người dùng thuộc nhiều pháp nhân mà
 * không biết mình đang ở pháp nhân nào thì nhập nhầm dữ liệu sang P&L công ty khác (NEN-01).
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { cn } from '@/lib/utils';

export function CompanySwitcher({
  compact = false,
  onDark = false,
}: { compact?: boolean; onDark?: boolean } = {}) {
  const { profile } = useAuth();
  const { selectedCompanyId, setSelectedCompany } = useCompanyStore();

  const options = useMemo(
    () =>
      (profile?.scopeCompanies ?? []).map((c) => ({
        id: c.companyId,
        code: c.companyCode,
        name: c.companyShortName,
        roles: c.roleLabels,
      })),
    [profile],
  );

  const selected = options.find((o) => o.id === selectedCompanyId) ?? options[0];

  /**
   * Thanh điều hướng của Module Thiết kế tối ở CẢ hai chế độ (bản mẫu §4.3), nên bộ chọn đặt
   * trong đó không đọc được token dùng chung: ở chế độ SÁNG chúng trả về màu của nền trắng và
   * nút ra một mảng trắng nằm giữa thanh tối. Bảng màu `--color-navdark-*` chỉ có một giá trị,
   * đúng thứ cần ở đây.
   *
   * Bảng xổ xuống KHÔNG áp bảng màu này: nó được cổng ra ngoài `<body>`, tức nằm trên nền
   * trang chứ không trên thanh điều hướng.
   */
  const trigger = onDark
    ? 'border-navdark-line bg-navdark-btn text-navdark-fg-strong hover:bg-navdark-hover'
    : 'border-border bg-surface-sunken hover:bg-surface-hover';
  const triggerIcon = onDark ? 'text-navdark-fg' : 'text-fg-subtle';

  if (!selected) return null;

  // Một pháp nhân duy nhất thì không cần bộ chọn — vẫn hiển thị tên cố định
  // để tránh nhầm dữ liệu giữa các công ty (Webapp Flow 6.2).
  if (options.length === 1) {
    if (compact) {
      return (
        <span
          className={cn(
            'flex items-center gap-1.5 px-1 font-semibold',
            onDark && 'text-navdark-fg-strong',
          )}
          title={`${selected.name} — ${selected.roles.join(' · ')}`}
        >
          <Building2 className={cn('size-4 shrink-0', triggerIcon)} />
          {selected.code}
        </span>
      );
    }
    return (
      <div className={cn('flex items-center gap-2 rounded-md border px-2 py-2', trigger)}>
        <Building2 className={cn('size-5', triggerIcon)} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{selected.name}</div>
          <div className="truncate text-xs text-fg-subtle">{selected.roles.join(' · ')}</div>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          // Viền + nền trũng để đọc ra là ĐIỀU KHIỂN. Trước đây chỉ có mỗi mũi tên 16px gợi ý
          // bấm được, nên khối này trông y hệt một tiêu đề và người dùng không tìm ra chỗ đổi
          // pháp nhân — trong khi Bảng điều khiển vẫn bảo họ "chọn một pháp nhân ở thanh bên".
          'flex items-center gap-2 rounded-md border text-left',
          trigger,
          // Vùng bấm tối thiểu 40px trên di động, 32px trên máy tính có chuột (Content
          // Guidelines 6.8) — compact chỉ hiện dưới `lg:` (top-bar.tsx), đúng nơi ngón tay cần
          // vùng bấm lớn nhất; trước đây `px-2 py-1` quanh icon 16px + chữ ra dưới 40px, cùng
          // lớp lỗi đã vá cho "Menu tài khoản".
          compact ? 'min-h-10 px-2 py-1 font-semibold sm:min-h-8' : 'w-full px-2 py-2',
        )}
        aria-label={compact ? `Pháp nhân ${selected.code} — chọn pháp nhân khác` : 'Chọn pháp nhân'}
        title={compact ? `${selected.name} — ${selected.roles.join(' · ')}` : undefined}
      >
        <Building2 className={cn('size-4 shrink-0', triggerIcon)} />
        {compact ? (
          selected.code
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{selected.name}</div>
            <div className="truncate text-xs text-fg-subtle">{selected.roles.join(' · ')}</div>
          </div>
        )}
        <ChevronsUpDown className={cn('size-4 shrink-0', triggerIcon)} />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 min-w-64 rounded-md border border-border',
            'bg-surface p-1 shadow-overlay',
          )}
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-fg-subtle">
            Pháp nhân
          </DropdownMenu.Label>
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.id}
              onSelect={() => setSelectedCompany(o.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2',
                'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                // Kiểu rê chuột khai TƯỜNG MINH, không dựa vào việc Radix có đặt
                // `data-highlighted` khi con trỏ đi qua hay không — hành vi đó nằm trong thư viện
                // và có thể đổi giữa hai phiên bản mà không ai để ý.
                'hover:bg-surface-hover',
                // Radix dời con trỏ bàn phím bằng `data-highlighted`, không phải `:focus-visible`,
                // nên vòng focus chung ở index.css không bắt được. Trước đây chỉ đổi nền sang
                // `surface-hover` — chênh lệch với nền trắng chỉ 1.09:1, tức là người dùng bàn
                // phím không nhìn thấy mình đang ở mục nào (WCAG 2.4.11 cần ≥3:1).
                'data-highlighted:bg-brand-subtle data-highlighted:text-brand',
                'data-highlighted:outline data-highlighted:outline-2 data-highlighted:outline-brand',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{o.name}</div>
                <div className="truncate text-xs text-fg-subtle">{o.roles.join(' · ')}</div>
              </div>
              {o.id === selected.id && <Check className="text-brand" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
