/**
 * Chặn truy cập vào một PHÂN HỆ khi vai trò hiện tại không có quyền xem.
 *
 * Vì sao cần: điều hướng đã ẩn phân hệ không có quyền (Webapp Flow 6.5), nhưng ẩn menu không
 * phải là chặn. Đường dẫn vẫn gõ tay được, vẫn được dán qua Zalo, và trình duyệt vẫn nhớ lịch
 * sử — nên nếu chỉ có menu kiểm quyền thì màn hình vẫn mở ra đầy đủ với vai trò không liên quan.
 *
 * Dữ liệu KHÔNG rò rỉ trong tình huống đó vì RLS chặn ở cơ sở dữ liệu; nhưng hệ quả vẫn nghiêm
 * trọng theo cách khác: danh sách trả về rỗng, và màn hình nói "chưa có dữ liệu". Kho trống và
 * kho không được phép xem trông giống hệt nhau, trong khi một bên nghĩa là "đi mua đi" còn bên
 * kia nghĩa là "hỏi người khác" (Content Guidelines 4.7).
 *
 * Đặt ở tầng route chứ không ở từng trang: một phân hệ có nhiều màn hình, và màn hình quên
 * kiểm thì lỗi lại im lặng đúng như cũ.
 */

import { Outlet, useNavigate } from 'react-router-dom';
import { BUTTONS, ERRORS, MODULES, type ModuleCode } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { BlockedNotice } from '@/components/ui/states';
import { useCanViewModule, useManagesApprovalRules } from './module-nav';

export function ModuleGuard({ module }: { module: ModuleCode }) {
  const canView = useCanViewModule(module);
  const navigate = useNavigate();
  const meta = MODULES[module];

  if (canView) return <Outlet />;

  return (
    <>
      <PageHeader title={meta.label} breadcrumbs={[{ label: meta.label }]} />
      <BlockedNotice
        title={`Không mở được phân hệ ${meta.label}.`}
        detail={ERRORS.noModuleAccess(meta.label)}
        action={
          // Đưa về Dashboard chứ không về danh sách của chính phân hệ vừa bị chặn — đó là
          // nơi duy nhất chắc chắn mọi vai trò đều vào được.
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            {BUTTONS.back}
          </Button>
        }
      />
    </>
  );
}

/**
 * Chặn cho hai màn hình Hạn mức phê duyệt và Thời hạn xử lý: mở cho người xem được Quản trị hệ
 * thống, và cho Tổng Giám đốc (migration 0141). Các màn hình Quản trị khác vẫn dùng `ModuleGuard`.
 */
export function ApprovalRulesGuard() {
  const managesRules = useManagesApprovalRules();
  const canViewNen = useCanViewModule('NEN');
  if (canViewNen || managesRules) return <Outlet />;
  return <ModuleGuard module="NEN" />;
}
