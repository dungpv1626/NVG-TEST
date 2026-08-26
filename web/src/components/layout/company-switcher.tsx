/**
 * Bộ chọn pháp nhân — Webapp Flow Mục 2.2.
 *
 * Đặt ở góc trên bên trái sidebar. Lựa chọn "Toàn NVG" CHỈ hiện với Ban Giám đốc và
 * Back Office (vai trò có `sees_all_companies`).
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

export function CompanySwitcher({ compact = false }: { compact?: boolean } = {}) {
  const { profile } = useAuth();
  const { selectedCompanyId, setSelectedCompany } = useCompanyStore();

  // Một người có thể giữ nhiều vai trò ở cùng một pháp nhân — gộp lại thành một mục.
  const options = useMemo(() => {
    const byId = new Map<string, { id: string; code: string; name: string; roles: string[] }>();
    for (const a of profile?.assignments ?? []) {
      const existing = byId.get(a.companyId);
      if (existing) {
        if (!existing.roles.includes(a.roleLabel)) existing.roles.push(a.roleLabel);
      } else {
        byId.set(a.companyId, {
          id: a.companyId,
          code: a.companyCode,
          name: a.companyShortName,
          roles: [a.roleLabel],
        });
      }
    }
    return [...byId.values()];
  }, [profile]);

  const selected = options.find((o) => o.id === selectedCompanyId) ?? options[0];

  if (!selected) return null;

  // Một pháp nhân duy nhất thì không cần bộ chọn — vẫn hiển thị tên cố định
  // để tránh nhầm dữ liệu giữa các công ty (Webapp Flow 6.2).
  if (options.length === 1) {
    if (compact) {
      return (
        <span
          className="flex items-center gap-1.5 px-1 font-semibold"
          title={`${selected.name} — ${selected.roles.join(' · ')}`}
        >
          <Building2 className="size-4 shrink-0 text-fg-subtle" />
          {selected.code}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-sm px-2 py-2">
        <Building2 className="text-fg-subtle" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{selected.name}</div>
          <div className="truncate text-xs text-fg-subtle">
            {selected.roles.join(' · ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'flex items-center gap-2 rounded-sm text-left hover:bg-surface-hover',
          compact ? 'px-2 py-1 font-semibold' : 'w-full px-2 py-2',
        )}
        aria-label={compact ? `Pháp nhân ${selected.code} — chọn pháp nhân khác` : 'Chọn pháp nhân'}
        title={compact ? `${selected.name} — ${selected.roles.join(' · ')}` : undefined}
      >
        <Building2 className="size-4 shrink-0 text-fg-subtle" />
        {compact ? (
          selected.code
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{selected.name}</div>
            <div className="truncate text-xs text-fg-subtle">
              {selected.roles.join(' · ')}
            </div>
          </div>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" />
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
                'outline-none focus:bg-surface-hover',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{o.name}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {o.roles.join(' · ')}
                </div>
              </div>
              {o.id === selected.id && <Check className="text-brand" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
