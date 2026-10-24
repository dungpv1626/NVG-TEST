/**
 * Người dùng và vai trò (NEN-02) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * PRD NEN-02: "Hệ thống phải cho phép gán NHIỀU vai trò cho một người trong cùng một pháp
 * nhân" — ví dụ nhân sự NVS vừa làm kinh doanh vừa xử lý nghiệp vụ kho. Nên cột vai trò ở
 * đây liệt kê từng cặp pháp nhân – vai trò, không rút gọn thành một vai trò duy nhất.
 *
 * Tạo tài khoản mới (0150): hệ thống nội bộ, không có luồng tự đăng ký (Backend Schema 3.1),
 * nên Quản trị viên cấp tài khoản tại đây — «Thêm người dùng». Danh tính đăng nhập trong
 * Supabase Auth nằm ngoài PostgREST nên đi qua Worker (`POST /admin/users`). Thêm vai trò thứ
 * hai cho một người vẫn qua đội triển khai.
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
import { NewAccountForm } from './new-account-form';

interface UserRow extends EntityRow {
  record: AdminUser;
}

export function UserAdminPage() {
  const canEdit = useCan('NEN', 'edit');
  const { data, isLoading, error, refetch } = useAdminUsers();
  const lookupCompany = useCompanyLookup();
  const setActive = useSetUserActive();

  const [pending, setPending] = useState<AdminUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows: UserRow[] = (data ?? []).map((u) => ({
    id: u.id,
    code: u.email,
    title: u.full_name,
    // Không hiện thành cột (`showRecordColumns={false}`) — giữ để ô tìm kiếm tra được chức danh.
    responsiblePerson: u.job_title,
    status: u.is_active ? 'in_progress' : 'draft',
    deadline: null,
    record: u,
  }));

  /**
   * Gom theo vai trò: «Kế toán – Tài chính: NVC, NVS, NVO». Bản trước nối từng cặp bằng cùng
   * một dấu «·» («NVC · Kế toán · NVS · Kế toán…») nên không đọc ra cặp nào đi với cặp nào.
   */
  function describeRoles(u: AdminUser): string[] {
    if (u.user_companies.length === 0) return ['Chưa gán vai trò'];
    const byRole = new Map<string, string[]>();
    for (const uc of u.user_companies) {
      const roleLabel = uc.role?.label ?? 'Chưa gán vai trò';
      const code = lookupCompany(uc.company_id)?.code;
      const list = byRole.get(roleLabel) ?? [];
      if (code) list.push(code);
      byRole.set(roleLabel, list);
    }
    return [...byRole].map(([role, codes]) =>
      codes.length ? `${role}: ${codes.join(', ')}` : role,
    );
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
      <PageHeader
        title="Người dùng"
        description="Tài khoản, pháp nhân và vai trò được gán. Thu hồi quyền truy cập bằng cách ngừng kích hoạt, không xóa tài khoản."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Người dùng' }]}
        actions={
          canEdit && !adding ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Thêm người dùng
            </Button>
          ) : undefined
        }
      />
      <NenNav />

      {adding && <NewAccountForm onDone={() => setAdding(false)} />}

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
        showRecordColumns={false}
        emptyMessage={EMPTY_STATES.list('tài khoản', 'Thêm người dùng')}
        columns={[
          {
            key: 'job',
            header: 'Chức danh',
            render: (r) => r.record.job_title ?? '—',
          },
          {
            key: 'roles',
            header: 'Vai trò: pháp nhân',
            render: (r) => (
              <ul>
                {describeRoles(r.record).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ),
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
            ? `${pending.full_name} sẽ không đăng nhập được nữa. Hồ sơ, lịch sử thao tác và nhật ký của tài khoản này được giữ nguyên. Bàn giao công việc đang xử lý cho người kế nhiệm trước khi ngừng.`
            : `${pending.full_name} sẽ đăng nhập lại được với đúng các vai trò đã gán trước đây.`}
        </ConfirmDialog>
      )}

      <p className="mt-3 text-fg-subtle">
        Mỗi tài khoản mới có một vai trò chính. Thêm vai trò thứ hai hoặc đổi vai trò hiện do đội
        triển khai thực hiện.
      </p>
    </>
  );
}
