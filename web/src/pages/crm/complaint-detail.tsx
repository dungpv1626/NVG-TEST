/**
 * Chi tiết Khiếu nại (PRD CRM-08) — mẫu bố cục 3 "Hồ sơ 360°" (Webapp Flow 4.3).
 *
 * CRM-08 liệt kê đủ vòng đời: mức độ · người chủ trì · người phối hợp · hạn phản hồi ·
 * phương án xử lý · kết quả · XÁC NHẬN CỦA KHÁCH HÀNG. Bước cuối là thứ dễ bỏ sót nhất —
 * "đã xử lý" theo lời nội bộ và "khách đã hài lòng" là hai việc khác nhau, nên nó là một
 * hành động riêng chứ không gộp vào nút hoàn tất.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BUTTONS,
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  complaintDisplayStatus,
  formatDate,
  formatDateTime,
  type ComplaintSeverity,
} from '@nvg/shared';
import { DetailFields, EntityDetail } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useActiveUsers, type ActiveUser } from '@/hooks/use-active-users';
import { useComplaint, useUpdateComplaint } from '@/hooks/use-complaints';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan, useIsResponsible } from '@/lib/auth';

const EM_DASH = '—';

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEditModule = useCan('CRM', 'edit');

  const { data, isLoading, error } = useComplaint(id);
  const { data: users } = useActiveUsers();

  const update = useUpdateComplaint();
  // Khớp đúng policy `complaints_update`: người chủ trì, người phối hợp, hoặc — khi hồ sơ
  // chưa phân công — bất kỳ ai ghi nhận được khiếu nại. Dùng mỗi `useCan('CRM','edit')` là
  // hiện nút cho đồng nghiệp mà CSDL sẽ chặn (Webapp Flow 6.5).
  const isResponsible = useIsResponsible(data?.assignee_id, ...(data?.collaborator_ids ?? []));
  const canCreate = useCan('CRM', 'create');
  const [resolution, setResolution] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <EmptyState message="Không tìm thấy khiếu nại này. Có thể hồ sơ đã được xóa hoặc vai trò hiện tại chưa được cấp quyền xem." />
    );
  }

  const complaint = data;
  const isUnassigned = complaint.assignee_id === null && complaint.collaborator_ids.length === 0;
  const canEdit = canEditModule && (isResponsible || (isUnassigned && canCreate));
  const displayStatus = complaintDisplayStatus(complaint.status, complaint.response_due_date);
  const isResolved = complaint.status === 'completed';
  const draftResolution = resolution ?? complaint.resolution ?? '';

  const collaboratorNames = complaint.collaborator_ids
    .map((cid) => users?.find((u) => u.id === cid)?.full_name ?? 'Không rõ')
    .join(', ');

  async function run(changes: Parameters<typeof update.mutateAsync>[0]['changes']) {
    setActionError(null);
    try {
      await update.mutateAsync({ id: complaint.id, changes });
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <>
      {actionError && (
        <p role="alert" className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {actionError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Khách hàng & Cơ hội' },
          { label: 'Khiếu nại', to: '/crm/khieu-nai' },
          { label: complaint.title },
        ]}
        title={complaint.title}
        code={complaint.code}
        status={displayStatus}
        responsiblePerson={complaint.assignee?.full_name ?? null}
        // Đã xử lý xong thì bỏ đếm ngược ở header: nhãn "Hoàn thành" đứng cạnh dòng
        // "Quá hạn 1 ngày" đọc ra như hồ sơ vẫn đang trễ. Hạn phản hồi vẫn còn nguyên ở
        // tab Tổng quan, nơi nó là DỮ LIỆU chứ không phải cảnh báo đang chạy.
        deadline={isResolved ? null : complaint.response_due_date}
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              {!isResolved ? (
                <Button
                  variant="primary"
                  disabled={update.isPending || !draftResolution.trim()}
                  title={
                    draftResolution.trim()
                      ? undefined
                      : 'Nhập phương án xử lý ở tab Xử lý trước khi hoàn tất.'
                  }
                  onClick={() =>
                    void run({ status: 'completed', resolution: draftResolution.trim() })
                  }
                >
                  Hoàn tất xử lý
                </Button>
              ) : (
                !complaint.customer_confirmed_at && (
                  // Bước riêng, không gộp vào "Hoàn tất xử lý": nội bộ nói xong không có
                  // nghĩa là khách đã chấp nhận (CRM-08).
                  <Button
                    variant="primary"
                    disabled={update.isPending}
                    onClick={() =>
                      void run({ customer_confirmed_at: new Date().toISOString() })
                    }
                  >
                    Ghi nhận khách hàng xác nhận
                  </Button>
                )
              )}

              {isResolved && (
                <Button
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => void run({ status: 'in_progress' })}
                >
                  Mở lại
                </Button>
              )}
            </div>
          ) : undefined
        }
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <div className="space-y-6">
                <DetailFields
                  fields={[
                    { label: 'Khách hàng', value: complaint.customer?.name ?? EM_DASH },
                    {
                      label: 'Mức độ nghiêm trọng',
                      value: COMPLAINT_SEVERITY_LABELS[complaint.severity],
                    },
                    { label: 'Người chủ trì', value: complaint.assignee?.full_name ?? 'Chưa phân công' },
                    { label: 'Người phối hợp', value: collaboratorNames || EM_DASH },
                    { label: 'Hạn phản hồi', value: formatDate(complaint.response_due_date) || EM_DASH },
                    {
                      label: 'Khách hàng xác nhận',
                      value: complaint.customer_confirmed_at
                        ? formatDateTime(complaint.customer_confirmed_at)
                        : 'Chưa xác nhận',
                    },
                  ]}
                />

                <div className="rounded-lg border border-border bg-surface-sunken p-3">
                  <p className="mb-1 font-medium">Nội dung khách phản ánh</p>
                  <p className="whitespace-pre-wrap">{complaint.content}</p>
                </div>
              </div>
            ),
          },
          {
            id: 'xu-ly',
            label: 'Xử lý',
            content: (
              <div className="max-w-2xl space-y-4">
                <label className="block space-y-1.5">
                  <span className="block font-medium">Phương án xử lý và kết quả</span>
                  <textarea
                    value={draftResolution}
                    onChange={(e) => setResolution(e.target.value)}
                    disabled={!canEdit}
                    rows={5}
                    placeholder="Nguyên nhân, biện pháp đã thực hiện, thời điểm hoàn thành, chi phí phát sinh nếu có"
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle disabled:opacity-60"
                  />
                </label>

                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={update.isPending}
                      onClick={() => void run({ resolution: draftResolution.trim() || null })}
                    >
                      {update.isPending ? 'Đang lưu…' : BUTTONS.save}
                    </Button>

                    <Reassign
                      users={users ?? []}
                      currentId={complaint.assignee_id}
                      disabled={update.isPending}
                      onChange={(assigneeId) => void run({ assignee_id: assigneeId })}
                    />

                    <SeverityPicker
                      value={complaint.severity}
                      disabled={update.isPending}
                      onChange={(severity) => void run({ severity })}
                    />
                  </div>
                )}
              </div>
            ),
          },
        ]}
        historyContent={
          <DetailFields
            fields={[
              { label: 'Ghi nhận lúc', value: formatDateTime(complaint.created_at) },
              { label: 'Cập nhật gần nhất', value: formatDateTime(complaint.updated_at) },
              {
                label: 'Khách hàng xác nhận',
                value: complaint.customer_confirmed_at
                  ? formatDateTime(complaint.customer_confirmed_at)
                  : 'Chưa xác nhận',
              },
            ]}
          />
        }
        related={[
          {
            title: 'Hồ sơ liên quan',
            records: complaint.customer
              ? [
                  {
                    label: 'Khách hàng',
                    value: complaint.customer.name,
                    to: `/crm/khach-hang/${complaint.customer.id}`,
                  },
                ]
              : [],
          },
        ]}
      />
    </>
  );
}

function Reassign({
  users,
  currentId,
  disabled,
  onChange,
}: {
  users: ActiveUser[];
  currentId: string | null;
  disabled: boolean;
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-fg-subtle">Người chủ trì</span>
      <select
        value={currentId ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 rounded-sm border border-border bg-surface px-2"
      >
        <option value="">Chưa phân công</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SeverityPicker({
  value,
  disabled,
  onChange,
}: {
  value: ComplaintSeverity;
  disabled: boolean;
  onChange: (v: ComplaintSeverity) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-fg-subtle">Mức độ</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ComplaintSeverity)}
        className="h-9 rounded-sm border border-border bg-surface px-2"
      >
        {COMPLAINT_SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {COMPLAINT_SEVERITY_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
