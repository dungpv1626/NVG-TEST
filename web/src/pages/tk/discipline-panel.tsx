/**
 * Tab Hồ sơ kỹ thuật của Chi tiết Dự án thiết kế (TK-04).
 *
 * Đây là màn hình mà thẻ công cụ số sáu ở Tổng quan mở ra — hai chỗ cùng tên, cùng đích.
 *
 * Hai việc trên cùng một màn hình, vì trong thực tế chúng là một việc:
 *  1. Theo dõi tiến độ ba bộ môn triển khai SONG SONG.
 *  2. Kiểm tra đồng bộ trước khi phát hành và bàn giao.
 *
 * Kết quả kiểm tra lấy từ ĐÚNG hàm CSDL mà nút Bàn giao dùng — nên màn hình không bao giờ
 * báo "đã đồng bộ" trong khi nút bàn giao vẫn từ chối.
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  DESIGN_DISCIPLINE_LABELS,
  DISCIPLINE_TASK_STATUSES,
  DISCIPLINE_TASK_STATUS_META,
  TECHNICAL_DISCIPLINES,
  disciplineDisplayStatus,
  formatDate,
  type DesignDiscipline,
  type DisciplineTaskStatus,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useActiveUsers } from '@/hooks/use-active-users';
import {
  useDesignSync,
  useDisciplineTasks,
  useSaveDisciplineTask,
  type DisciplineTaskRecord,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';

export function DisciplinePanel({
  projectId,
  companyId,
  readOnly,
}: {
  projectId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: tasks } = useDisciplineTasks(projectId);
  const { data: findings } = useDesignSync(projectId);
  const { data: users } = useActiveUsers();
  const saveTask = useSaveDisciplineTask();
  const [error, setError] = useState<string | null>(null);

  const byDiscipline = new Map((tasks ?? []).map((t) => [t.discipline, t]));
  const blocking = (findings ?? []).filter((f) => f.blocking);
  const warnings = (findings ?? []).filter((f) => !f.blocking);

  async function save(
    discipline: DesignDiscipline,
    task: DisciplineTaskRecord | undefined,
    changes: Record<string, unknown>,
  ) {
    setError(null);
    try {
      await saveTask.mutateAsync({
        id: task?.id,
        projectId,
        companyId,
        discipline,
        changes,
      });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <p className="mb-3 font-medium">Kiểm tra đồng bộ giữa các bộ môn</p>

        {blocking.length === 0 && warnings.length === 0 ? (
          <p className="flex items-center gap-2 text-status-completed">
            <CheckCircle2 className="size-4" />
            Hồ sơ đã đủ và đồng bộ. Bàn giao được cho Ban công trường.
          </p>
        ) : (
          <ul className="space-y-2">
            {blocking.map((f, index) => (
              <li key={`${f.code}-${index}`} className="flex gap-2 text-status-overdue">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{f.message}</span>
              </li>
            ))}
            {warnings.map((f, index) => (
              <li key={`${f.code}-${index}`} className="flex gap-2 text-status-pending">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}

        {blocking.length > 0 && (
          <p className="mt-3 text-fg-subtle">
            Còn {blocking.length} hạng mục phải xử lý trước khi bàn giao. Các mục màu vàng là cảnh
            báo, không chặn.
          </p>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        {TECHNICAL_DISCIPLINES.map((discipline) => {
          const task = byDiscipline.get(discipline);
          return (
            <section
              key={discipline}
              className="rounded-lg border border-border bg-surface p-4 shadow-card"
            >
              <div className="mb-3 flex items-center gap-2">
                <p className="font-medium">{DESIGN_DISCIPLINE_LABELS[discipline]}</p>
                <StatusLozenge
                  status={disciplineDisplayStatus(
                    task?.status ?? 'chua_bat_dau',
                    task?.due_date ?? null,
                  )}
                />
              </div>

              <div className="space-y-3">
                <Field label="Người phụ trách">
                  <select
                    value={task?.assignee_id ?? ''}
                    disabled={readOnly}
                    onChange={(e) =>
                      void save(discipline, task, { assignee_id: e.target.value || null })
                    }
                    className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
                  >
                    <option value="">Chưa phân công</option>
                    {(users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Tiến độ">
                  <select
                    value={task?.status ?? 'chua_bat_dau'}
                    disabled={readOnly}
                    onChange={(e) => {
                      const status = e.target.value as DisciplineTaskStatus;
                      void save(discipline, task, {
                        status,
                        completed_at: status === 'hoan_thanh' ? new Date().toISOString() : null,
                        progress_percent:
                          status === 'hoan_thanh' ? 100 : (task?.progress_percent ?? 0),
                      });
                    }}
                    className="h-10 w-full rounded-sm border border-border bg-surface px-3 sm:h-9"
                  >
                    {DISCIPLINE_TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {DISCIPLINE_TASK_STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Hạn hoàn thành">
                  <DateInput
                    defaultValue={task?.due_date ?? ''}
                    disabled={readOnly}
                    onBlur={(v) => void save(discipline, task, { due_date: v || null })}
                  />
                </Field>

                <Field
                  label="Xung đột với bộ môn khác"
                  hint="Còn nội dung ở đây thì hồ sơ chưa bàn giao được. Xử lý xong thì xoá trống."
                >
                  <textarea
                    defaultValue={task?.conflict_notes ?? ''}
                    disabled={readOnly}
                    rows={3}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                    placeholder="Dầm chắn cửa sổ, ống kỹ thuật đâm vào cột…"
                    onBlur={(e) =>
                      void save(discipline, task, { conflict_notes: e.target.value.trim() || null })
                    }
                  />
                </Field>
              </div>

              {task?.completed_at && (
                <p className="mt-2 text-fg-subtle">Hoàn thành {formatDate(task.completed_at)}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
