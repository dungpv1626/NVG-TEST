/**
 * Nhãn trạng thái dạng Lozenge — Content Guidelines Mục 6.2 và 5.1.
 *
 * Hai quy tắc bất biến:
 *  1. NGOẠI LỆ DUY NHẤT về bo góc: bo tròn hoàn toàn, để nhãn trạng thái luôn dễ nhận ra
 *     giữa các thành phần khác (6.5).
 *  2. LUÔN hiển thị chữ kèm màu — không bao giờ dùng màu làm cách duy nhất truyền đạt
 *     thông tin (6.8, Webapp Flow 6.4). Người khiếm thị màu vẫn phải đọc được.
 */
import { type StatusGroup } from '@nvg/shared';
export declare function StatusLozenge({ status, className, }: {
    status: StatusGroup;
    className?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=status-lozenge.d.ts.map