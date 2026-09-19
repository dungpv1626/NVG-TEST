/**
 * Chế độ sáng/tối của riêng Module Thiết kế.
 *
 * Vì sao chỉ riêng module này: bộ bàn giao thiết kế lấy nền tối làm mặc định, còn 11 module
 * còn lại chưa có chế độ tối và Content Guidelines 6.7 nói rõ chế độ tối không bắt buộc cho
 * bản demo. Haan chốt 06/09/2026: có nút chuyển, phạm vi Module Thiết kế.
 *
 * Cách hoạt động gói gọn trong một thuộc tính: `data-tk-theme` đặt trên phần tử bọc ngoài
 * cùng của màn hình. Utility Tailwind biên dịch thành `var(--color-tk-…)`, mà biến CSS thì
 * kế thừa — nên đè giá trị ở tổ tiên là cả nhánh đổi màu, không cần lớp phủ, không cần class
 * có điều kiện ở từng thành phần.
 *
 * Lựa chọn ghi vào `localStorage` chứ không vào hồ sơ người dùng: đây là sở thích hiển thị
 * theo MÁY (màn hình văn phòng và màn hình laptop ngoài nắng sáng khác nhau), không phải một
 * thuộc tính của con người.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type TkTheme = 'toi' | 'sang';

/** Mặc định theo bản mẫu. */
const DEFAULT: TkTheme = 'toi';
const KEY = 'nvg.tk.theme';

interface TkThemeValue {
  theme: TkTheme;
  toggle: () => void;
}

const TkThemeContext = createContext<TkThemeValue>({ theme: DEFAULT, toggle: () => {} });

/** Đọc lựa chọn đã lưu. Cửa sổ riêng tư hoặc trình duyệt chặn lưu trữ thì ném lỗi — bắt lại. */
function stored(): TkTheme {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'sang' || value === 'toi' ? value : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function TkThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [theme, setTheme] = useState<TkTheme>(stored);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      // Không lưu được thì lựa chọn chỉ sống trong phiên này — không phải lỗi để báo cho người dùng.
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'toi' ? 'sang' : 'toi')), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);

  return <TkThemeContext.Provider value={value}>{children}</TkThemeContext.Provider>;
}

export function useTkTheme(): TkThemeValue {
  return useContext(TkThemeContext);
}

/**
 * Nút chuyển. Nhãn nói TRẠNG THÁI ĐANG Ở, biểu tượng gợi ý chỗ sẽ tới — cùng cách bản mẫu
 * làm, và cũng là cách duy nhất đọc được khi chỉ nhìn thấy một nút: "Tối" kèm mặt trời nghĩa
 * là đang tối, bấm thì sang sáng. `title` nói đủ cả hai vế để không phải đoán.
 */
export function TkThemeToggle(): React.ReactElement {
  const { theme, toggle } = useTkTheme();
  const dark = theme === 'toi';
  return (
    <button
      type="button"
      onClick={toggle}
      title={
        dark ? 'Đang ở chế độ tối · bấm để chuyển sáng' : 'Đang ở chế độ sáng · bấm để chuyển tối'
      }
      className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-tk-line2 bg-tk-panel px-3 text-tk-t2 transition-colors duration-(--motion-fast) ease-(--ease-out) hover:text-tk-tx"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
      {dark ? 'Tối' : 'Sáng'}
    </button>
  );
}
