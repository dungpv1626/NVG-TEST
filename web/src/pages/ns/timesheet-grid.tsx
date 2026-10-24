/**
 * Bảng công chi tiết của một kỳ — người × ngày (NS-04).
 *
 * Trước 01/10/2026 màn hình Chấm công chỉ ghi được công CẢ KHỐI cho một ngày; ai nghỉ thì
 * «sửa lại dòng của người đó» nhưng không có chỗ nào để thấy hay sửa dòng ấy. Bảng này là chỗ
 * đó: mỗi ô một ngày của một người, bấm ô để đổi loại ngày công và số giờ.
 *
 * Ghi được hay không do CSDL quyết (`save_attendance`): kỳ đã gửi xác nhận thì khoá, «nghỉ có
 * phép» phải có đơn nghỉ đã duyệt. Màn hình không đoán trước — lỗi của CSDL hiện nguyên văn,
 * vì nó đã nói đúng việc cần làm.
 */

import { useMemo, useState } from 'react';
import {
  ATTENDANCE_KINDS,
  ATTENDANCE_KIND_LABELS,
  formatDate,
  formatNumber,
  summarizeAttendance,
  type AttendanceKind,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useSaveAttendance,
  useTimesheetEntries,
  type EmployeeRecord,
  type TimesheetEntryRecord,
  type TimesheetPeriodRecord,
} from '@/hooks/use-hr';
import { cn } from '@/lib/utils';

/** Ký hiệu trong ô — chú giải in ngay dưới bảng, không bắt người đọc đoán. */
const KIND_SHORT: Record<AttendanceKind, string> = {
  lam_viec: '',
  nghi_co_phep: 'P',
  nghi_khong_phep: 'K',
  nghi_le: 'L',
  cong_tac: 'CT',
};

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function cellText(entry: TimesheetEntryRecord | undefined): string {
  if (!entry) return '';
  if (entry.kind === 'lam_viec') return entry.hours ? formatNumber(Number(entry.hours)) : '✓';
  return KIND_SHORT[entry.kind];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function TimesheetGrid({
  period,
  employees,
}: {
  period: TimesheetPeriodRecord;
  employees: EmployeeRecord[];
}) {
  const { data, isLoading, error } = useTimesheetEntries(period.id);
  const save = useSaveAttendance();
  const editable = period.status === 'dang_ghi';

  const days = useMemo(() => {
    const count = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
    return Array.from({ length: count }, (_, i) => {
      const iso = `${period.year}-${pad(period.month)}-${pad(i + 1)}`;
      const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
      return { iso, day: i + 1, weekday };
    });
  }, [period.year, period.month]);

  const byCell = useMemo(() => {
    const map = new Map<string, TimesheetEntryRecord>();
    for (const e of data ?? []) map.set(`${e.employee_id}|${e.work_date}`, e);
    return map;
  }, [data]);

  // Người trong bảng: nhân sự của khối, cộng người đã có công trong kỳ mà nay đổi khối / nghỉ.
  const people = useMemo(() => {
    const ids = new Set(employees.map((e) => e.id));
    const extra = new Map<string, { id: string; full_name: string; code: string | null }>();
    for (const e of data ?? []) {
      if (!ids.has(e.employee_id) && e.employee) extra.set(e.employee_id, e.employee);
    }
    return [
      ...employees.map((e) => ({ id: e.id, full_name: e.full_name, code: e.code })),
      ...extra.values(),
    ];
  }, [employees, data]);

  const [selected, setSelected] = useState<{ employeeId: string; date: string } | null>(null);
  const [kind, setKind] = useState<AttendanceKind>('lam_viec');
  const [hours, setHours] = useState('8');
  const [overtime, setOvertime] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function select(employeeId: string, date: string) {
    if (!editable) return;
    const entry = byCell.get(`${employeeId}|${date}`);
    setSelected({ employeeId, date });
    setKind(entry?.kind ?? 'lam_viec');
    setHours(entry?.hours ?? (entry ? '' : '8'));
    setOvertime(entry?.overtime_hours ?? '');
    setMessage(null);
    setSaveError(null);
  }

  async function saveCell() {
    if (!selected) return;
    setSaveError(null);
    const working = kind === 'lam_viec' || kind === 'cong_tac';
    try {
      await save.mutateAsync({
        periodId: period.id,
        entries: [
          {
            employee_id: selected.employeeId,
            work_date: selected.date,
            kind,
            hours: working ? hours || null : null,
            overtime_hours: working ? overtime || null : null,
          },
        ],
      });
      setMessage(`Đã lưu ngày ${formatDate(selected.date)}.`);
      setSelected(null);
    } catch (e) {
      setSaveError(toUserMessage(e, 'edit'));
    }
  }

  if (isLoading) return <TableSkeleton rows={4} columns={8} />;
  if (error) return <ErrorState message={toUserMessage(error, 'view')} />;

  const selectedName = selected ? people.find((p) => p.id === selected.employeeId)?.full_name : '';

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded border border-border">
        <table className="text-sm">
          <thead className="bg-surface-sunken">
            <tr>
              <th className="sticky left-0 z-10 min-w-44 bg-surface-sunken px-3 py-2 text-left font-medium">
                Nhân sự
              </th>
              <th className="px-2 py-2 text-right font-medium">Ngày công</th>
              <th className="px-2 py-2 text-right font-medium">Tăng ca</th>
              <th className="px-2 py-2 text-right font-medium" title="Nghỉ có phép">
                P
              </th>
              <th
                className="border-r border-border px-2 py-2 text-right font-medium"
                title="Nghỉ không phép"
              >
                K
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  className={cn(
                    'w-9 px-0.5 py-1 text-center font-medium',
                    d.weekday === 0 && 'bg-border/40 text-fg-subtle',
                  )}
                >
                  <div>{d.day}</div>
                  <div className="text-[10px] font-normal text-fg-subtle">
                    {WEEKDAY_SHORT[d.weekday]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const own = (data ?? []).filter((e) => e.employee_id === p.id);
              const sum = summarizeAttendance(
                own.map((e) => ({
                  kind: e.kind,
                  hours: e.hours,
                  overtimeHours: e.overtime_hours,
                })),
              );
              return (
                <tr key={p.id} className="border-t border-border">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-3 py-1 text-left font-normal"
                  >
                    <div className="font-medium">{p.full_name}</div>
                    <div className="font-mono text-[11px] text-fg-subtle">{p.code}</div>
                  </th>
                  <td className="px-2 text-right font-semibold tabular-nums">
                    {formatNumber(sum.workdays)}
                  </td>
                  <td className="px-2 text-right tabular-nums">
                    {formatNumber(sum.overtimeHours)}
                  </td>
                  <td className="px-2 text-right tabular-nums">{sum.leaveDays}</td>
                  <td className="border-r border-border px-2 text-right tabular-nums">
                    {sum.unpaidAbsenceDays}
                  </td>
                  {days.map((d) => {
                    const entry = byCell.get(`${p.id}|${d.iso}`);
                    const isSel = selected?.employeeId === p.id && selected.date === d.iso;
                    const label = entry
                      ? `${p.full_name}, ${formatDate(d.iso)}: ${ATTENDANCE_KIND_LABELS[entry.kind]}${entry.hours ? `, ${entry.hours} giờ` : ''}`
                      : `${p.full_name}, ${formatDate(d.iso)}: chưa ghi`;
                    return (
                      <td
                        key={d.iso}
                        className={cn(
                          'p-0 text-center tabular-nums',
                          d.weekday === 0 && 'bg-border/40',
                        )}
                      >
                        <button
                          type="button"
                          disabled={!editable}
                          aria-label={label}
                          title={label}
                          onClick={() => select(p.id, d.iso)}
                          className={cn(
                            'h-9 w-9 enabled:hover:bg-brand/10',
                            entry &&
                              entry.kind !== 'lam_viec' &&
                              'font-semibold text-status-pending',
                            entry?.kind === 'nghi_khong_phep' && 'text-status-overdue',
                            isSel && 'ring-2 ring-inset ring-brand',
                          )}
                        >
                          {cellText(entry)}
                          {entry?.overtime_hours && Number(entry.overtime_hours) > 0 && (
                            <span className="block text-[9px] leading-none text-fg-subtle">
                              +{formatNumber(Number(entry.overtime_hours))}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fg-subtle">
        Số trong ô là giờ làm; «+2» là giờ tăng ca. P nghỉ có phép · K nghỉ không phép · L nghỉ lễ ·
        CT công tác · cột xám là Chủ nhật.{' '}
        {editable
          ? 'Bấm một ô để sửa ngày công của người đó.'
          : 'Kỳ đã gửi xác nhận nên bảng công không sửa được nữa.'}
      </p>

      {message && <p className="rounded border border-border bg-surface-sunken p-2">{message}</p>}

      {selected && (
        <div className="space-y-3 rounded border border-border bg-surface p-3">
          <p className="font-medium">
            {selectedName} — ngày {formatDate(selected.date)}
          </p>
          {saveError && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {saveError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Loại ngày công">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AttendanceKind)}
                className="h-11 w-full rounded-field border border-border-strong bg-surface px-3"
              >
                {ATTENDANCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ATTENDANCE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            {(kind === 'lam_viec' || kind === 'cong_tac') && (
              <>
                <Field label="Giờ làm">
                  <Input
                    inputMode="decimal"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </Field>
                <Field label="Giờ tăng ca">
                  <Input
                    inputMode="decimal"
                    value={overtime}
                    onChange={(e) => setOvertime(e.target.value)}
                  />
                </Field>
              </>
            )}
          </div>
          {kind === 'nghi_co_phep' && (
            <p className="text-xs text-fg-subtle">
              Nghỉ có phép chỉ ghi được khi người này có đơn nghỉ phép đã duyệt cho ngày đó.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void saveCell()} disabled={save.isPending}>
              {save.isPending ? 'Đang lưu…' : 'Lưu ngày công'}
            </Button>
            <Button variant="subtle" onClick={() => setSelected(null)}>
              Huỷ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
