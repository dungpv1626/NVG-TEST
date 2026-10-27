/**
 * «Điểm danh tổ đội» trên tab Điểm danh của công trình (0232, câu 6).
 *
 * Mỗi ngày, mỗi tổ: chụp MỘT ảnh tập thể (máy in giờ, công trình, tên tổ lên ảnh) → cả tổ mặc định «Cả ngày», chỉ bấm
 * người nào khác (Nửa ngày / Vắng), ghi giờ tăng ca nếu có → Lưu. Mục tiêu < 5 phút / ngày. Vị trí lấy lúc chụp; xa tâm
 * công trình quá bán kính thì nói rõ — không chặn.
 *
 * Cuối tháng: Chỉ huy trưởng gửi bảng công của từng tổ → Trưởng phòng Thi công xác nhận hoặc trả lại. Đã gửi thì điểm
 * danh của tháng khoá.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, MapPin, UserPlus } from 'lucide-react';
import { formatDate, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { EmptyState } from '@/components/ui/states';
import {
  CREW_MONTH_STATUS_LABELS,
  CREW_STATUS_LABELS,
  useAddCrewMember,
  useCanConfirmCrewMonth,
  useCreateCrewSheet,
  useCrewMembers,
  useCrewMonth,
  useCrewSheets,
  useDecideCrewMonth,
  useSaveCrewAttendance,
  useSetSiteLocation,
  useSubmitCrewMonth,
  type CrewAttendanceStatus,
  type CrewLocationFlag,
  type CrewMember,
  type CrewSheet,
} from '@/hooks/use-crew-attendance';
import { useSubcontractors } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { checkInStampText, readCheckInLocation, stampCheckInPhoto } from '@/lib/check-in-stamp';
import { cn } from '@/lib/utils';

const VN_DAY = (offset: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(Date.now() - offset * 86_400_000),
  );

function describeFlag(
  flag: CrewLocationFlag,
  distance: number | null,
): { text: string; warn: boolean } {
  switch (flag) {
    case 'trong_ban_kinh':
      return { text: `Tại công trường (cách tâm ${formatNumber(distance ?? 0)} m)`, warn: false };
    case 'ngoai_ban_kinh':
      return {
        text: `Cách công trình ${distance && distance >= 1000 ? `${formatNumber(distance / 1000, 1)} km` : `${formatNumber(distance ?? 0)} m`} — kiểm lại`,
        warn: true,
      };
    case 'chua_co_toa_do':
      return { text: 'Công trình chưa ghi vị trí — chưa so được khoảng cách', warn: false };
    default:
      return { text: 'Không có vị trí — điện thoại không cho lấy vị trí', warn: true };
  }
}

export function CrewAttendancePanel({
  site,
  readOnly,
}: {
  site: {
    id: string;
    code: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
  };
  readOnly: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const day = VN_DAY(offset);
  const month = `${day.slice(0, 7)}-01`;
  const crews = useSubcontractors(site.id);
  const crewIds = useMemo(() => (crews.data ?? []).map((c) => c.id), [crews.data]);
  const members = useCrewMembers(crewIds);
  const sheets = useCrewSheets(site.id, day);
  const monthQ = useCrewMonth(site.id, month);
  const setLocation = useSetSiteLocation();
  const [error, setError] = useState<string | null>(null);

  async function saveSiteLocation() {
    setError(null);
    const loc = await readCheckInLocation();
    if (loc.status !== 'co_vi_tri') {
      setError(
        'Không lấy được vị trí. Bật định vị cho trình duyệt rồi thử lại, đứng tại công trường.',
      );
      return;
    }
    setLocation.mutate(
      { siteId: site.id, latitude: loc.latitude, longitude: loc.longitude },
      { onError: (e) => setError(toUserMessage(e, 'edit')) },
    );
  }

  const lockedCrews = new Set(
    (monthQ.data?.months ?? []).filter((m) => m.status !== 'nhap').map((m) => m.subcontractor_id),
  );

  return (
    <section aria-labelledby="diem-danh-to" className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="diem-danh-to" className="text-md font-semibold">
          Điểm danh tổ đội
        </h3>
        <div role="group" aria-label="Ngày điểm danh" className="flex gap-1">
          {['Hôm nay', 'Hôm qua', 'Hôm kia'].map((label, i) => (
            <Button
              key={label}
              size="sm"
              variant={offset === i ? 'primary' : 'secondary'}
              onClick={() => setOffset(i)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-fg-subtle">
        {formatDate(day)} · Cả ngày tính 1 công, nửa ngày 0,5 công, tăng ca ghi giờ riêng. Chụp một
        ảnh tập thể cho mỗi tổ, cả tổ mặc định «Cả ngày» — chỉ bấm người khác.
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-sm bg-surface px-3 py-2 text-sm">
        <MapPin className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="flex-1">
          {site.latitude !== null
            ? 'Đã ghi vị trí công trình — phiếu điểm danh so khoảng cách với vị trí này.'
            : 'Công trình chưa ghi vị trí — chưa so được khoảng cách khi điểm danh.'}
        </span>
        {!readOnly && (
          <Button
            size="sm"
            variant="secondary"
            disabled={setLocation.isPending}
            onClick={() => void saveSiteLocation()}
          >
            {site.latitude !== null
              ? 'Ghi lại vị trí (đứng tại công trường)'
              : 'Ghi vị trí công trình (đứng tại công trường)'}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {(crews.data ?? []).length === 0 ? (
        <EmptyState message="Công trình chưa có tổ đội nào. Thêm tổ đội ở tab Tổ đội rồi quay lại điểm danh." />
      ) : (
        <ul className="space-y-3">
          {(crews.data ?? []).map((crew) => (
            <CrewCard
              key={`${crew.id}-${day}`}
              site={site}
              crew={{ id: crew.id, name: crew.name }}
              day={day}
              members={(members.data ?? []).filter((m) => m.subcontractor_id === crew.id)}
              sheet={(sheets.data ?? []).find((s) => s.subcontractor_id === crew.id) ?? null}
              readOnly={readOnly}
              locked={lockedCrews.has(crew.id)}
            />
          ))}
        </ul>
      )}

      {(crews.data ?? []).length > 0 && (
        <CrewMonthBlock
          siteId={site.id}
          month={month}
          crews={(crews.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}

function CrewCard({
  site,
  crew,
  day,
  members,
  sheet,
  readOnly,
  locked,
}: {
  site: { id: string; code: string; name: string };
  crew: { id: string; name: string };
  day: string;
  members: CrewMember[];
  sheet: CrewSheet | null;
  readOnly: boolean;
  locked: boolean;
}) {
  const createSheet = useCreateCrewSheet();
  const save = useSaveCrewAttendance();
  const addMember = useAddCrewMember();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const active = members.filter((m) => m.is_active);
  const editable = !readOnly && !locked;

  // Giá trị đang chỉnh: lấy từ phiếu đã lưu, người chưa có dòng mặc định «Cả ngày».
  const [draft, setDraft] = useState<
    Record<string, { status: CrewAttendanceStatus; overtime: string }>
  >({});
  useEffect(() => {
    const next: Record<string, { status: CrewAttendanceStatus; overtime: string }> = {};
    for (const m of active) {
      const row = sheet?.attendance.find((a) => a.crew_member_id === m.id);
      next[m.id] = {
        status: row?.status ?? 'ca_ngay',
        overtime:
          row && Number(row.overtime_hours) > 0 ? String(row.overtime_hours).replace('.', ',') : '',
      };
    }
    setDraft(next);
    // Dựng lại khi phiếu hoặc danh sách người đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id, sheet?.attendance.length, active.length]);

  async function onPhoto(file: File) {
    setError(null);
    setMessage(null);
    try {
      const at = new Date();
      const location = await readCheckInLocation();
      const stamped = await stampCheckInPhoto(
        file,
        checkInStampText({
          at,
          siteCode: site.code,
          siteName: site.name,
          personName: crew.name,
          location,
        }),
      );
      await createSheet.mutateAsync({
        siteId: site.id,
        crewId: crew.id,
        day,
        photo: stamped,
        location:
          location.status === 'co_vi_tri'
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
              }
            : null,
      });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function saveAll() {
    if (!sheet) return;
    setError(null);
    setMessage(null);
    const rows = active.map((m) => {
      const d = draft[m.id] ?? { status: 'ca_ngay' as const, overtime: '' };
      const ot = Number((d.overtime || '0').replace(',', '.'));
      return { crewMemberId: m.id, status: d.status, overtime: Number.isFinite(ot) ? ot : 0 };
    });
    try {
      await save.mutateAsync({ sheetId: sheet.id, rows });
      setMessage('Đã lưu điểm danh.');
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  async function add() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await addMember.mutateAsync({ crewId: crew.id, fullName: newName, phone: null });
      setNewName('');
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  const present = sheet?.attendance.filter((a) => a.status !== 'vang') ?? [];
  const workdays = present.reduce((s, a) => s + Number(a.workday), 0);
  const flag = sheet ? describeFlag(sheet.location_flag, sheet.distance_m) : null;

  return (
    <li className="rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{crew.name}</span>
        <span className="text-sm text-fg-subtle">
          {sheet
            ? `Đã điểm danh — ${present.length} có mặt, ${formatNumber(workdays, 1)} công`
            : 'Chưa điểm danh'}
          {locked ? ' · bảng công tháng đã gửi, không sửa được' : ''}
        </span>
      </div>
      {flag && (
        <p className={cn('mt-1 text-sm', flag.warn ? 'text-status-pending' : 'text-fg-subtle')}>
          {flag.text}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-status-completed">
          {message}
        </p>
      )}

      {!sheet && editable && (
        <>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onPhoto(f);
            }}
          />
          <Button
            className="mt-3"
            variant="primary"
            disabled={createSheet.isPending || active.length === 0}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera />
            {createSheet.isPending ? 'Đang lưu ảnh…' : 'Chụp ảnh tổ và điểm danh'}
          </Button>
          {active.length === 0 && (
            <p className="mt-2 text-sm text-fg-subtle">Thêm người của tổ trước khi điểm danh.</p>
          )}
        </>
      )}

      {sheet && active.length > 0 && (
        <ul className="mt-3 divide-y divide-line-soft">
          {active.map((m) => {
            const d = draft[m.id] ?? { status: 'ca_ngay' as const, overtime: '' };
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-32 flex-1">{m.full_name}</span>
                <div
                  role="radiogroup"
                  aria-label={`Điểm danh ${m.full_name}`}
                  className="flex gap-1"
                >
                  {(Object.keys(CREW_STATUS_LABELS) as CrewAttendanceStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      role="radio"
                      aria-checked={d.status === st}
                      disabled={!editable}
                      onClick={() => setDraft((v) => ({ ...v, [m.id]: { ...d, status: st } }))}
                      className={cn(
                        'min-h-10 rounded-full border px-3 text-sm',
                        d.status === st
                          ? st === 'vang'
                            ? 'border-status-overdue bg-status-overdue-bg font-semibold text-status-overdue'
                            : 'border-shell bg-pill font-semibold text-ink'
                          : 'border-border-strong text-ink-subtle',
                      )}
                    >
                      {CREW_STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>
                <Input
                  aria-label={`Giờ tăng ca của ${m.full_name}`}
                  placeholder="Tăng ca (giờ)"
                  inputMode="decimal"
                  className="w-32"
                  value={d.overtime}
                  disabled={!editable || d.status === 'vang'}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, [m.id]: { ...d, overtime: e.target.value } }))
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      {sheet && editable && active.length > 0 && (
        <Button
          className="mt-3"
          variant="primary"
          disabled={save.isPending}
          onClick={() => void saveAll()}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu điểm danh'}
        </Button>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
          <Input
            aria-label={`Tên người mới của ${crew.name}`}
            placeholder="Họ tên người mới vào tổ"
            className="max-w-xs"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!newName.trim() || addMember.isPending}
            onClick={() => void add()}
          >
            <UserPlus />
            Thêm người
          </Button>
        </div>
      )}
    </li>
  );
}

function CrewMonthBlock({
  siteId,
  month,
  crews,
  readOnly,
}: {
  siteId: string;
  month: string;
  crews: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const monthQ = useCrewMonth(siteId, month);
  const canConfirm = useCanConfirmCrewMonth(siteId);
  const submit = useSubmitCrewMonth();
  const decide = useDecideCrewMonth();
  const promptDialog = usePromptDialog();
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  async function giveBack(crewId: string) {
    const reason = await promptDialog.ask({
      title: 'Trả lại bảng công',
      label: 'Lý do — chỉ huy trưởng cần sửa gì',
      confirmLabel: 'Trả lại',
    });
    if (reason === null) return;
    void run(() => decide.mutateAsync({ crewId, month, confirm: false, reason }));
  }

  return (
    <section aria-labelledby="bang-cong-thang" className="rounded-card bg-surface p-4">
      {promptDialog.dialog}
      <h4 id="bang-cong-thang" className="font-semibold">
        Bảng công tháng {month.slice(5, 7)}/{month.slice(0, 4)}
      </h4>
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}
      <ul className="mt-2 space-y-3">
        {crews.map((crew) => {
          const rows = (monthQ.data?.summary ?? []).filter((r) => r.subcontractor_id === crew.id);
          const status = monthQ.data?.months.find((m) => m.subcontractor_id === crew.id);
          const total = rows.reduce((s, r) => s + Number(r.workdays), 0);
          const ot = rows.reduce((s, r) => s + Number(r.overtime_hours), 0);
          const st = status?.status ?? 'nhap';
          return (
            <li key={crew.id} className="rounded-sm border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{crew.name}</span>
                <span className="text-sm text-fg-subtle">
                  {rows.length > 0
                    ? `${rows.filter((r) => r.days_present > 0).length} người · ${formatNumber(total, 1)} công · ${formatNumber(ot, 1)} giờ tăng ca`
                    : 'Chưa có ngày điểm danh nào'}{' '}
                  · {CREW_MONTH_STATUS_LABELS[st]}
                </span>
                <span className="ml-auto flex gap-2">
                  {st === 'nhap' && !readOnly && rows.length > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={submit.isPending}
                      onClick={() => void run(() => submit.mutateAsync({ crewId: crew.id, month }))}
                    >
                      Gửi bảng công tháng
                    </Button>
                  )}
                  {st === 'da_gui' && canConfirm.data && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={decide.isPending}
                        onClick={() =>
                          void run(() =>
                            decide.mutateAsync({ crewId: crew.id, month, confirm: true }),
                          )
                        }
                      >
                        Xác nhận
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void giveBack(crew.id)}>
                        Trả lại
                      </Button>
                    </>
                  )}
                </span>
              </div>
              {status?.returned_reason && st === 'nhap' && (
                <p className="mt-1 text-sm text-status-pending">
                  Bị trả lại: {status.returned_reason}
                </p>
              )}
              {rows.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-fg-subtle">Công từng người</summary>
                  <table className="mt-2 w-full">
                    <thead>
                      <tr className="text-left text-fg-subtle">
                        <th className="py-1">Họ tên</th>
                        <th className="py-1">Ngày có mặt</th>
                        <th className="py-1">Công</th>
                        <th className="py-1">Tăng ca (giờ)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.crew_member_id} className="border-t border-line-soft">
                          <td className="py-1">{r.full_name}</td>
                          <td className="py-1">{r.days_present}</td>
                          <td className="py-1">{formatNumber(Number(r.workdays), 1)}</td>
                          <td className="py-1">{formatNumber(Number(r.overtime_hours), 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
