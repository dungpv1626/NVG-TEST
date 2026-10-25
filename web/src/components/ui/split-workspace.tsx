/**
 * Khung làm việc hai ngăn kiểu VS Code (anh Dũng 25/10/2026, tab «Soạn hợp đồng»: «chia tab như Visual Studio Code,
 * kéo ra kéo vào để dễ quan sát, thay đổi thay vì xem văn bản ở dưới rồi lại kéo lên trên để sửa»).
 *
 * - Hai ngăn cạnh nhau, mỗi ngăn có thanh tab và cuộn riêng; thanh giữa kéo để đổi bề rộng (nhấp đúp = chia lại như
 *   mặc định, phím mũi tên khi đang chọn thanh = 5 %).
 * - Kéo một tab thả vào thanh tab của ngăn kia để chuyển ngăn. Ngăn nào hết tab thì ngăn kia chiếm trọn bề ngang.
 * - Nút «Phóng to» một ngăn, bấm lại để thu về.
 * - Cách sắp xếp nhớ theo `storageKey` trên máy người dùng (chỉ là tiện lợi — đọc / ghi bọc try).
 * - Dưới lg: một ngăn duy nhất chứa mọi tab.
 *
 * Mọi tab được dựng sẵn và chỉ ẨN khi không chọn, để ô đang gõ không mất và `revealElement` tìm được phần tử nằm trong
 * tab đang ẩn rồi mở tab ấy ra.
 */

import { Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface WorkspaceTab {
  /** Định danh ổn định — dùng để nhớ ngăn của tab và để `revealElement` mở tab. */
  id: string;
  label: string;
  /** Số / chữ nhỏ cạnh nhãn (vd số mục còn thiếu). */
  badge?: ReactNode;
  content: ReactNode;
  /** Ngăn mặc định khi chưa có sắp xếp đã nhớ. */
  side: Side;
}

type Side = 'left' | 'right';

interface Layout {
  side: Record<string, Side>;
  active: Partial<Record<Side, string>>;
  /** Phần bề ngang của ngăn trái, 0–1. */
  ratio: number;
  maximized: Side | null;
}

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const REVEAL_EVENT = 'nvg:reveal-tab';

function readLayout(key: string): Partial<Layout> | null {
  try {
    const raw = window.localStorage.getItem(`split:${key}`);
    return raw ? (JSON.parse(raw) as Partial<Layout>) : null;
  } catch {
    return null;
  }
}

function writeLayout(key: string, layout: Layout) {
  try {
    window.localStorage.setItem(`split:${key}`, JSON.stringify(layout));
  } catch {
    // Trình duyệt chặn lưu (chế độ riêng tư…): sắp xếp chỉ mất khi tải lại, không ảnh hưởng gì khác.
  }
}

/**
 * Mở tab chứa `el` (nếu nó nằm trong một ngăn của `SplitWorkspace`) rồi cuộn tới và đặt con trỏ vào đó. Dùng thay
 * cho `el.scrollIntoView()` ở mọi lối «tới ô điền» — phần tử trong tab đang ẩn thì cuộn không có tác dụng.
 */
export function revealElement(el: HTMLElement, focus = false): void {
  const tab = el.closest<HTMLElement>('[data-workspace-tab]')?.dataset.workspaceTab;
  if (tab) window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: tab }));
  // Đợi React vẽ tab vừa mở (phần tử còn `hidden` thì cuộn / đặt con trỏ không có tác dụng).
  window.setTimeout(
    () => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (focus) (el as HTMLInputElement).focus({ preventScroll: true });
    },
    tab ? 60 : 0,
  );
}

export function revealById(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  revealElement(el);
  return true;
}

function useIsWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return wide;
}

export function SplitWorkspace({
  tabs,
  storageKey,
  defaultRatio = 0.45,
  className,
}: {
  tabs: WorkspaceTab[];
  storageKey: string;
  defaultRatio?: number;
  className?: string;
}) {
  const wide = useIsWide();
  const ids = tabs.map((t) => t.id).join('|');
  const initial = useMemo<Layout>(() => {
    const saved = readLayout(storageKey);
    const side: Record<string, Side> = {};
    for (const t of tabs) side[t.id] = saved?.side?.[t.id] ?? t.side;
    return {
      side,
      active: saved?.active ?? {},
      ratio:
        typeof saved?.ratio === 'number'
          ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, saved.ratio))
          : defaultRatio,
      maximized: saved?.maximized ?? null,
    };
    // Dựng lại khi bộ tab đổi (vd người chỉ xem / người soạn có bộ tab khác nhau).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, ids]);
  const [layout, setLayout] = useState<Layout>(initial);
  useEffect(() => setLayout(initial), [initial]);
  useEffect(() => writeLayout(storageKey, layout), [storageKey, layout]);

  const sideOf = useCallback((id: string): Side => layout.side[id] ?? 'left', [layout.side]);
  const inSide = (side: Side) => tabs.filter((t) => sideOf(t.id) === side);
  const activeOf = (side: Side) => {
    const list = inSide(side);
    return list.find((t) => t.id === layout.active[side])?.id ?? list[0]?.id ?? null;
  };

  // `revealElement` báo mở một tab — chọn tab ấy trong ngăn của nó, bỏ phóng to ngăn kia.
  useEffect(() => {
    function onReveal(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (!tabs.some((t) => t.id === id)) return;
      setLayout((l) => {
        const side = wide ? (l.side[id] ?? 'left') : 'left';
        return {
          ...l,
          active: { ...l.active, [side]: id },
          maximized: l.maximized && l.maximized !== side ? null : l.maximized,
        };
      });
    }
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_EVENT, onReveal);
  }, [tabs, wide]);

  function moveTab(id: string, to: Side) {
    setLayout((l) => ({
      ...l,
      side: { ...l.side, [id]: to },
      active: { ...l.active, [to]: id },
      maximized: null,
    }));
  }

  // ---- thanh giữa
  const rowRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !rowRef.current) return;
    const box = rowRef.current.getBoundingClientRect();
    const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, (e.clientX - box.left) / box.width));
    setLayout((l) => ({ ...l, ratio }));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Dưới lg: một ngăn, mọi tab.
  if (!wide) {
    const active = tabs.find((t) => t.id === layout.active.left)?.id ?? tabs[0]?.id ?? null;
    return (
      <div className={cn('min-w-0', className)}>
        <TabBar
          tabs={tabs}
          active={active}
          onSelect={(id) => setLayout((l) => ({ ...l, active: { ...l.active, left: id } }))}
        />
        <TabBodies tabs={tabs} active={active} />
      </div>
    );
  }

  const left = inSide('left');
  const right = inSide('right');
  const showLeft = left.length > 0 && layout.maximized !== 'right';
  const showRight = right.length > 0 && layout.maximized !== 'left';
  const both = showLeft && showRight;

  const pane = (side: Side, list: WorkspaceTab[]) => {
    const active = activeOf(side);
    const maximized = layout.maximized === side;
    return (
      <section
        aria-label={side === 'left' ? 'Ngăn trái' : 'Ngăn phải'}
        className="flex min-h-0 min-w-0 flex-col rounded-card bg-surface"
        style={
          both
            ? { flexBasis: `${(side === 'left' ? layout.ratio : 1 - layout.ratio) * 100}%` }
            : undefined
        }
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/x-workspace-tab')) e.preventDefault();
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData('text/x-workspace-tab');
          if (id) moveTab(id, side);
        }}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-line-soft px-2 pt-2">
          <TabBar
            tabs={list}
            active={active}
            draggable
            onSelect={(id) => setLayout((l) => ({ ...l, active: { ...l.active, [side]: id } }))}
          />
          {(both || maximized) && (
            <button
              type="button"
              onClick={() => setLayout((l) => ({ ...l, maximized: maximized ? null : side }))}
              className="ml-auto mb-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-hover hover:text-ink"
              aria-label={maximized ? 'Thu ngăn về như cũ' : 'Phóng to ngăn này'}
              title={maximized ? 'Thu về' : 'Phóng to'}
            >
              {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TabBodies tabs={list} active={active} />
        </div>
      </section>
    );
  };

  return (
    <div ref={rowRef} className={cn('flex min-h-0 gap-0', className)}>
      {showLeft && pane('left', left)}
      {both && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Kéo để đổi bề rộng hai ngăn"
          aria-valuemin={MIN_RATIO * 100}
          aria-valuemax={MAX_RATIO * 100}
          aria-valuenow={Math.round(layout.ratio * 100)}
          tabIndex={0}
          title="Kéo để đổi bề rộng · nhấp đúp để chia lại"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => setLayout((l) => ({ ...l, ratio: defaultRatio }))}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
            if (!step) return;
            e.preventDefault();
            setLayout((l) => ({
              ...l,
              ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, l.ratio + step)),
            }));
          }}
          className="group flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center"
        >
          <span className="h-12 w-1 rounded-full bg-line-soft transition-colors group-hover:bg-shell group-focus-visible:bg-shell" />
        </div>
      )}
      {showRight && pane('right', right)}
    </div>
  );
}

function TabBar({
  tabs,
  active,
  onSelect,
  draggable = false,
}: {
  tabs: WorkspaceTab[];
  active: string | null;
  onSelect: (id: string) => void;
  draggable?: boolean;
}) {
  return (
    <div role="tablist" className="flex min-w-0 flex-wrap gap-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          draggable={draggable}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/x-workspace-tab', t.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => onSelect(t.id)}
          title={draggable ? 'Bấm để mở · kéo sang ngăn kia để xem cạnh nhau' : undefined}
          className={cn(
            'mb-1 flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm',
            t.id === active
              ? 'bg-shell font-semibold text-fg-inverse'
              : 'text-ink-subtle hover:bg-surface-hover hover:text-ink',
            draggable && 'cursor-grab active:cursor-grabbing',
          )}
        >
          {t.label}
          {t.badge !== undefined && t.badge !== null && t.badge !== false && (
            <span
              className={cn(
                'rounded-full px-1.5 text-xs',
                t.id === active ? 'bg-shell-active' : 'bg-pill text-ink',
              )}
            >
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function TabBodies({ tabs, active }: { tabs: WorkspaceTab[]; active: string | null }) {
  return (
    <>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" data-workspace-tab={t.id} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </>
  );
}
