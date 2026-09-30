/**
 * Điểm danh bằng ảnh tại công trường — tab «Điểm danh» của Chi tiết Công trình (0139).
 *
 * Haan 30/09/2026: nhân sự đi làm tại công trình chụp ảnh điểm danh như Timemark; chỉ cần ở
 * gần công trường, dựa trên sự trung thực của nhân viên. Vì vậy vị trí là TUỲ CHỌN — không lấy
 * được thì vẫn điểm danh, và bản ghi nói rõ là không có vị trí.
 *
 * CHƯA liên kết bảng chấm công (TC-08 / NS-04 chưa chốt cách ghi nhận công tại hiện trường).
 * Câu cảnh báo luôn hiện ở đầu tab — người dùng không được hiểu nhầm rằng điểm danh ở đây đã
 * là chấm công.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, MapPin } from 'lucide-react';
import { formatDate, toNvgTimeInput } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCreateSiteCheckIn,
  useSiteCheckIns,
  type SiteCheckIn,
} from '@/hooks/use-site-check-ins';
import { useSignedPhotoUrls } from '@/hooks/use-site-photos';
import { useAuth } from '@/lib/auth';
import {
  CLOCK_SKEW_WARN_MINUTES,
  checkInStampText,
  describeLocation,
  formatCheckInDay,
  readCheckInLocation,
  stampCheckInPhoto,
  type CheckInLocation,
} from '@/lib/check-in-stamp';

export const CHECK_IN_NOT_TIMESHEET =
  'Điểm danh chỉ lưu ảnh làm bằng chứng có mặt tại công trường. Tính năng này chưa liên kết với ' +
  'bảng chấm công — công vẫn chấm theo cách đang áp dụng.';

interface Draft {
  photo: File;
  previewUrl: string;
  location: CheckInLocation;
  capturedAt: Date;
}

export function SiteCheckInPanel({
  siteId,
  siteCode,
  siteName,
  readOnly,
}: {
  siteId: string;
  siteCode: string;
  siteName: string;
  readOnly: boolean;
}) {
  const { profile } = useAuth();
  const { data: checkIns, isLoading } = useSiteCheckIns(siteId);
  const create = useCreateSiteCheckIn(siteId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'processing' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => () => (draft ? URL.revokeObjectURL(draft.previewUrl) : undefined), [draft]);

  async function onPicked(file: File) {
    setError(null);
    setDone(null);
    setBusy('processing');
    try {
      const capturedAt = new Date();
      const location = await readCheckInLocation();
      const photo = await stampCheckInPhoto(
        file,
        checkInStampText({
          at: capturedAt,
          siteCode,
          siteName,
          personName: profile?.fullName ?? '',
          location,
        }),
      );
      setDraft({ photo, previewUrl: URL.createObjectURL(photo), location, capturedAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xử lý được ảnh. Chụp lại ảnh.');
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!draft) return;
    setError(null);
    setBusy('saving');
    try {
      await create.mutateAsync({
        photo: draft.photo,
        location: draft.location,
        capturedAt: draft.capturedAt,
        note,
      });
      setDone(`Đã điểm danh lúc ${toNvgTimeInput(new Date())}.`);
      setDraft(null);
      setNote('');
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p role="note" className="rounded-sm bg-status-pending-bg px-3 py-2 text-status-pending">
        {CHECK_IN_NOT_TIMESHEET}
      </p>

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      {done && (
        <p
          role="status"
          className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed"
        >
          {done}
        </p>
      )}

      {/* Ô chọn tệp nằm ngoài hai khối dưới: «Chụp lại» gọi nó sau khi khối xem trước đã đóng. */}
      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid="chup-anh-diem-danh"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onPicked(file);
          }}
        />
      )}

      {!readOnly && !draft && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Camera aria-hidden />
            {busy === 'processing' ? 'Đang xử lý ảnh…' : 'Chụp ảnh điểm danh'}
          </Button>
          <p className="mt-2 text-fg-subtle">
            Giờ, ngày, công trình và tên người điểm danh được in lên ảnh. Vị trí lấy nếu điện thoại
            cho phép.
          </p>
        </div>
      )}

      {!readOnly && draft && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <img
            src={draft.previewUrl}
            alt="Ảnh điểm danh vừa chụp"
            className="max-h-[60vh] w-auto rounded-sm border border-border"
          />
          <p className="flex items-center gap-1.5 text-fg-subtle">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {describeLocation(draft.location)}
          </p>
          <Field label="Ghi chú" optional>
            <Input
              value={note}
              maxLength={500}
              placeholder="Ví dụ: đến sớm để nhận vật tư"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <p className="text-fg-subtle">
            Bấm Gửi điểm danh là xác nhận đang có mặt tại công trường. Điểm danh đã gửi không sửa
            hoặc xoá được.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={busy !== null}
              onClick={() => void submit()}
            >
              {busy === 'saving' ? 'Đang gửi…' : 'Gửi điểm danh'}
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={busy !== null}
              onClick={() => {
                setDraft(null);
                inputRef.current?.click();
              }}
            >
              Chụp lại
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !checkIns || checkIns.length === 0 ? (
        <EmptyState
          message={
            readOnly
              ? 'Chưa có lượt điểm danh nào ở công trình này.'
              : 'Chưa có lượt điểm danh nào ở công trình này. Bấm «Chụp ảnh điểm danh» khi tới công trường.'
          }
        />
      ) : (
        <CheckInList checkIns={checkIns} />
      )}
    </div>
  );
}

/** Lệch giữa giờ điện thoại lúc chụp và giờ máy chủ nhận, tính bằng phút. */
export function clockSkewMinutes(
  checkIn: Pick<SiteCheckIn, 'checked_in_at' | 'client_created_at'>,
) {
  if (!checkIn.client_created_at) return 0;
  return Math.abs(
    (new Date(checkIn.checked_in_at).getTime() - new Date(checkIn.client_created_at).getTime()) /
      60_000,
  );
}

function CheckInList({ checkIns }: { checkIns: SiteCheckIn[] }) {
  const paths = useMemo(() => checkIns.map((c) => c.photo_path), [checkIns]);
  const { data: urls } = useSignedPhotoUrls(paths);

  const days = useMemo(() => {
    const groups = new Map<string, SiteCheckIn[]>();
    for (const c of checkIns) {
      const key = formatDate(c.checked_in_at);
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return [...groups.values()];
  }, [checkIns]);

  return (
    <div className="space-y-4">
      {days.map((items) => (
        <section
          key={items[0]!.id}
          aria-label={formatCheckInDay(new Date(items[0]!.checked_in_at))}
        >
          <h3 className="mb-2 font-medium">
            {formatCheckInDay(new Date(items[0]!.checked_in_at))}
            <span className="ml-2 font-normal text-fg-subtle">{items.length} lượt</span>
          </h3>
          <ul className="space-y-2">
            {items.map((c) => {
              const url = urls?.[c.photo_path];
              const skew = clockSkewMinutes(c);
              return (
                <li
                  key={c.id}
                  className="flex gap-3 rounded-lg border border-border bg-surface p-3"
                >
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                      <img
                        src={url}
                        alt={`Ảnh điểm danh của ${c.person?.full_name ?? 'nhân sự'}`}
                        className="size-20 rounded-sm object-cover"
                      />
                    </a>
                  ) : (
                    <Skeleton className="size-20 shrink-0" />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      {toNvgTimeInput(c.checked_in_at)} · {c.person?.full_name ?? 'Không rõ người'}
                    </p>
                    {c.location_status === 'co_vi_tri' &&
                    c.latitude !== null &&
                    c.longitude !== null ? (
                      <a
                        href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand hover:underline"
                      >
                        <MapPin className="size-4" aria-hidden />
                        Xem vị trí trên bản đồ
                        {c.accuracy_m !== null &&
                          ` (sai số ~${Math.round(Number(c.accuracy_m))} m)`}
                      </a>
                    ) : (
                      <p className="text-fg-subtle">
                        {describeLocation({ status: c.location_status } as CheckInLocation)}
                      </p>
                    )}
                    {skew > CLOCK_SKEW_WARN_MINUTES && c.client_created_at && (
                      <p className="text-status-pending">
                        Ảnh chụp lúc {toNvgTimeInput(c.client_created_at)} theo giờ điện thoại, gửi
                        lên lúc {toNvgTimeInput(c.checked_in_at)}.
                      </p>
                    )}
                    {c.note && <p className="text-fg-subtle">{c.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
