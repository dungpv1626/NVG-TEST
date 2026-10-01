/**
 * Đưa biểu mẫu sửa vào tầm nhìn khi nó vừa mở.
 *
 * Các màn hình cấu hình (Tham số, Hạn mức, Thời hạn) mở biểu mẫu sửa BÊN DƯỚI bảng. Bảng dài
 * hơn một màn hình thì bấm «Chỉnh sửa» ở dòng đầu trông như không có gì xảy ra — biểu mẫu nằm
 * ngoài khung nhìn (thấy khi chụp hướng dẫn Quản trị hệ thống, 01/10/2026). Cuộn tới biểu mẫu
 * và đặt con trỏ vào ô đầu tiên.
 */

import { useEffect, useRef } from 'react';

export function useRevealOnOpen<T extends HTMLElement>(openKey: string | null | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!openKey || !el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true });
  }, [openKey]);
  return ref;
}
