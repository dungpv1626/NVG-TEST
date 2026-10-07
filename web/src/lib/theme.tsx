/**
 * Chế độ sáng / tối / theo hệ thống của toàn ứng dụng.
 *
 * Lịch sử: 06/09/2026 chế độ tối chỉ có ở Module Thiết kế, hai trạng thái do người dùng chọn.
 * 07/10/2026 Haan mở ra toàn ứng dụng và thêm trạng thái thứ ba «theo hệ thống» — nút ba ô
 * biểu tượng (mặt trời · trăng · màn hình) ở thanh trên.
 *
 * Cách hoạt động vẫn gói trong một thuộc tính `data-tk-theme` ('sang' | 'toi'): `tk-theme.css`
 * đè token theo thuộc tính ấy, biến CSS kế thừa nên đặt ở tổ tiên là cả nhánh đổi màu. Tên
 * thuộc tính giữ nguyên để không phải đổi CSS và các phép thử đang canh nó. Thuộc tính đặt ở
 * HAI chỗ: phần tử gốc của khung (`app-shell.tsx`) và `<html>` — thiếu `<html>` thì hộp thoại,
 * menu thả xuống (Radix dựng ở `document.body`, ngoài khung) giữ màu sáng giữa màn hình tối.
 *
 * Lựa chọn ghi vào `localStorage`, không vào hồ sơ người dùng: đây là sở thích theo MÁY. Giá
 * trị cũ ('toi' | 'sang') vẫn đọc được.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lựa chọn của người dùng. */
export type ThemeChoice = 'sang' | 'toi' | 'he-thong';
/** Bảng màu thật đang áp. */
export type ResolvedTheme = 'sang' | 'toi';

const DEFAULT: ThemeChoice = 'he-thong';
const KEY = 'nvg.tk.theme';
const QUERY = '(prefers-color-scheme: dark)';

interface ThemeValue {
  choice: ThemeChoice;
  theme: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue>({
  choice: DEFAULT,
  theme: 'sang',
  setChoice: () => {},
});

/** Đọc lựa chọn đã lưu. Cửa sổ riêng tư hoặc trình duyệt chặn lưu trữ thì ném lỗi — bắt lại. */
function stored(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'sang' || value === 'toi' || value === 'he-thong' ? value : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function systemDark(): boolean {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [choice, setChoice] = useState<ThemeChoice>(stored);
  const [dark, setDark] = useState<boolean>(systemDark);

  // Theo hệ thống thì phải đổi NGAY khi hệ điều hành đổi (lịch tự tối lúc chiều), không chờ
  // người dùng tải lại trang.
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, choice);
    } catch {
      // Không lưu được thì lựa chọn chỉ sống trong phiên này — không phải lỗi để báo cho người dùng.
    }
  }, [choice]);

  const theme: ResolvedTheme = choice === 'he-thong' ? (dark ? 'toi' : 'sang') : choice;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-tk-theme', theme);
    return () => root.removeAttribute('data-tk-theme');
  }, [theme]);

  const value = useMemo(() => ({ choice, theme, setChoice }), [choice, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'sang', label: 'Sáng', icon: Sun },
  { value: 'toi', label: 'Tối', icon: Moon },
  { value: 'he-thong', label: 'Theo hệ thống', icon: Monitor },
];

/**
 * Nút ba ô chỉ có biểu tượng — nhãn nằm ở `aria-label` và `title`, ô đang chọn tô màu thương
 * hiệu và mang `aria-checked`, nên trạng thái không chỉ nói bằng màu.
 */
export function ThemeSwitch(): React.ReactElement {
  const { choice, setChoice } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Chế độ hiển thị"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={cn(
              'grid size-10 place-items-center rounded-full transition-colors duration-(--motion-fast) ease-(--ease-out) sm:size-8',
              on ? 'bg-brand text-fg-inverse' : 'text-fg-subtle hover:text-fg',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
