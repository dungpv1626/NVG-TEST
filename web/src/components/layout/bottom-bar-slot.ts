/**
 * Chỗ cho một màn hình THAY thanh điều hướng dưới bằng thao tác của chính nó — chỉ trên điện thoại.
 *
 * Vì sao: trang công trình từng có HAI thanh dưới chồng nhau — thanh thao tác nhanh của công
 * trường (4 nút) dính trên thanh điều hướng phân hệ (5 nút): ~150px trên màn hình 844px, che mất
 * ô nhập nhật ký (review UX, doc/MOC_CAI_TIEN_UX.md vấn đề 2). AFD 4.8 cho bố cục di động 4–5 mục.
 *
 * Màn hình khai thao tác qua `useBottomBarActions`; `BottomNav` thấy có thì vẽ các thao tác đó
 * cộng MỘT nút «Phân hệ» mở bảng toàn bộ phân hệ — không mất đường sang module khác. Rời màn
 * hình thì thanh điều hướng thường trở lại.
 */

import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';

interface BottomBarSlot {
  actions: ReactNode | null;
  set: (actions: ReactNode | null) => void;
}

export const useBottomBarSlot = create<BottomBarSlot>((set) => ({
  actions: null,
  set: (actions) => set({ actions }),
}));

/** Khai thao tác thay thanh điều hướng dưới trong lúc màn hình đang mở. */
export function useBottomBarActions(actions: ReactNode | null): void {
  const setActions = useBottomBarSlot((s) => s.set);
  useEffect(() => {
    setActions(actions);
    return () => setActions(null);
  }, [actions, setActions]);
}
