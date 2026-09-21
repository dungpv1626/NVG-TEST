/**
 * Người dùng và vai trò (NEN-02) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * PRD NEN-02: "Hệ thống phải cho phép gán NHIỀU vai trò cho một người trong cùng một pháp
 * nhân" — ví dụ nhân sự NVS vừa làm kinh doanh vừa xử lý nghiệp vụ kho. Nên cột vai trò ở
 * đây liệt kê từng cặp pháp nhân – vai trò, không rút gọn thành một vai trò duy nhất.
 *
 * ⚠️ Màn hình này KHÔNG tạo tài khoản mới. Backend Schema 3.1: hệ thống nội bộ, không có
 * luồng tự đăng ký, và một tài khoản cần trước hết một danh tính trong Supabase Auth —
 * việc đó nằm ngoài PostgREST. Tạo tài khoản vẫn qua bộ nạp dữ liệu; ở đây chỉ xem, tra và
 * thu hồi quyền truy cập.
 */

import { useState } from 'react';
import { EMPTY_STATES } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAdminUsers, useSetUserActive, type AdminUser } from '@/hooks/use-admin';
import { useCompanyLookup } from '@/hooks/use-companies';
import { useCan } from '@/lib/auth';
import { NenNav } from './nen-nav';

interface UserRow extends EntityRow {
  record: AdminUser;
}

export function UserAdminPage() {
  const canEdit = useCan('NEN', 'edit');
  const { data, isLoading, error, refetch } = useAdminUsers();
  const lookupCompany = useCompanyLookup();
  const setActive = useSetUserActive();

  const [pending, setPending] = useState<AdminUser | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows: UserRow[] = (data ?? []).map((u) => ({
    id: u.id,
    code: u.email,
    title: u.full_name,
    responsiblePerson: u.job_title,
    // Tài khoản không có vòng đời hồ sơ. Dùng hai nhóm trạng thái sẵn có để trả lời đúng một
    // câu hỏi người quản trị hỏi: tài khoản này còn vào được hệ thống không.
    status: u.is_active ? 'in_progress' : 'draft',
    deadline: null,
    record: u,
  }));

  function describeRoles(u: AdminUser): string {
    if (u.user_companies.length === 0) return 'Chưa gán vai trò';
    return u.user_companies
      .map((uc) => {
        const company = lookupCompany(uc.company_id);
        const roleLabel = uc.role?.label ?? 'Chưa gán vai trò';
        return company ? `${company.code} · ${roleLabel}` : roleLabel;
      })
      .join(' · ');
  }

  async function toggleActive() {
    if (!pending) return;
    setActionError(null);
    try {
      await setActive.mutateAsync({ id: pending.id, isActive: !pending.is_active });
      setPending(null);
    } catch (err) {
      setActionError(toUserMessage(err, 'edit'));
    }
  }

  return (
    <>
      <NenNav />
      <PageHeader
        title="Người dùng"
        description="Tài khoản, pháp nhân và vai trò được gán. Thu hồi quyền truy cập bằng cách ngừng kích hoạt, không xóa tài khoản."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Người dùng' }]}
      />

      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      <EntityTable<UserRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        // Tài khoản chưa có trang Chi tiết riêng — giữ người dùng ở lại danh sách.
        detailPath={() => '/nen/quan-tri'}
        searchPlaceholder="Tìm theo tên, email hoặc chức danh…"
        showStatusFilter={false}
        sharedAcrossCompanies
        emptyMessage={EMPTY_STATES.list('tài khoản', 'Nạp dữ liệu')}
        columns={[
          {
            key: 'roles',
            header: 'Pháp nhân · Vai trò',
            render: (r) => describeRoles(r.record),
          },
          {
            key: 'phone',
            header: 'Điện thoại',
            render: (r) => r.record.phone ?? '—',
          },
          {
            key: 'state',
            header: 'Truy cập',
            render: (r) => (r.record.is_active ? 'Đang hoạt động' : 'Đã ngừng'),
          },
          ...(canEdit
            ? [
                {
                  key: 'action',
                  header: 'Thao tác',
                  render: (r: UserRow) => (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setPending(r.record);
                      }}
                    >
                      {r.record.is_active ? 'Ngừng truy cập' : 'Mở lại truy cập'}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />

      {pending && (
        <ConfirmDialog
          title={pending.is_active ? 'Ngừng quyền truy cập' : 'Mở lại quyền truy cập'}
          confirmLabel={pending.is_active ? 'Ngừng truy cập' : 'Mở lại truy cập'}
          danger={pending.is_active}
          pending={setActive.isPending}
          onConfirm={() => void toggleActive()}
          onCancel={() => setPending(null)}
        >
          {pending.is_active
            ? `${pending.full_name} sẽ không đăng nhập được nữa. Hồ sơ, lịch sử thao tác và nhật ký của tài khoản này được giữ nguyên (NEN-10). Bàn giao công việc đang xử lý cho người kế nhiệm trước khi ngừng.`
            : `${pending.full_name} sẽ đăng nhập lại được với đúng các vai trò đã gán trước đây.`}
        </ConfirmDialog>
      )}

      <p className="mt-3 text-fg-subtle">
        Tạo tài khoản mới và đổi vai trò hiện thực hiện qua bộ nạp dữ liệu — chưa mở trên giao diện.
      </p>
    </>
  );
}
