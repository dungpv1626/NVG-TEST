/**
 * Tab Nhật ký công trường của Chi tiết Công trình (TC-02, TC-08).
 *
 * Ô nhập nằm NGAY TRÊN CÙNG, mở sẵn, không giấu sau một nút "Thêm": ghi nhật ký là việc lặp
 * lại mỗi ngày của chỉ huy trưởng, và Webapp Flow 6.4 xếp nó vào nhóm tác vụ phải tới được
 * ngay chứ không đi qua menu → danh sách → nút Tạo mới mỗi lần.
 *
 * Nhật ký đã ghi hiện ở chế độ CHỈ ĐỌC: quá 24 giờ hoặc do người khác ghi thì CSDL từ chối
 * sửa (TC-08), nên hiện ô sửa ở đây chỉ dẫn người dùng tới một thông báo lỗi. Cần đính chính
 * thì ghi một mục mới — đúng cách một quyển nhật ký giấy hoạt động.
 *
 * Nói thay gõ (Đợt 2 — 2B): chỉ huy trưởng bấm «Nói nhật ký», nói 1–2 phút → máy chép chữ, xếp
 * vào các ô (việc đã làm, vật tư, vướng mắc, an toàn, quân số, thời tiết) → người ghi đọc lại,
 * sửa, Lưu. Máy chỉ điền nháp; AI tắt hay lỗi thì vẫn gõ tay như cũ. Đoạn ghi âm và bản chép chữ
 * lưu cùng mục — bằng chứng gốc khi tranh chấp (TC-08).
 */

import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Mic, Users } from 'lucide-react';
import {
  BUTTONS,
  SITE_LOG_TYPES,
  SITE_LOG_TYPE_LABELS,
  composeSiteLogContent,
  formatDate,
  type SiteLogType,
  toNvgDateInput,
} from '@nvg/shared';
import { VoiceRecorder } from '@/components/media/voice-recorder';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { useCreateSiteLog, useSiteLogs } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { siteLogAudioUrl, uploadSiteLogAudio } from '@/hooks/use-site-log-voice';
import { uploadConstructionPhotos } from '@/hooks/use-site-photos';
import { useAiStatus } from '@/hooks/use-site-surveys';
import { draftSiteLog } from '@/lib/ai-api';
import { PhotoStrip, SitePhotoPicker } from './site-photo-picker';

const TODAY = () => toNvgDateInput(new Date());

interface LogDraft {
  logDate: string;
  logType: SiteLogType;
  content: string;
  workforceCount: string;
  weather: string;
  /** Đoạn ghi âm đã tải lên (nói thay gõ) + bản máy chép — lưu kèm mục nhật ký. */
  voicePath: string | null;
  voiceTranscript: string | null;
  aiDrafted: boolean;
}

const EMPTY_DRAFT = (): LogDraft => ({
  logDate: TODAY(),
  logType: 'tien_do',
  content: '',
  workforceCount: '',
  weather: '',
  voicePath: null,
  voiceTranscript: null,
  aiDrafted: false,
});

/**
 * Nháp nhật ký theo từng công trình, giữ trong phiên trình duyệt (CLAUDE.md 5.4 — không bao giờ
 * mất dữ liệu đang nhập). Ở công trường, mất sóng rồi tải lại trang là chuyện hằng ngày. Ảnh
 * chưa gửi thì không giữ được qua lần tải lại — trình duyệt không cho lưu tệp.
 */
function draftKey(siteId: string) {
  return `nvg.nhat-ky-nhap.${siteId}`;
}

function readDraft(siteId: string): LogDraft {
  try {
    const raw = sessionStorage.getItem(draftKey(siteId));
    return raw ? { ...EMPTY_DRAFT(), ...(JSON.parse(raw) as Partial<LogDraft>) } : EMPTY_DRAFT();
  } catch {
    return EMPTY_DRAFT();
  }
}

export function SiteLogPanel({
  siteId,
  companyId,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: logs } = useSiteLogs(siteId);
  const createLog = useCreateSiteLog();

  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<LogDraft>(() => readDraft(siteId));
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null);
  const { data: ai } = useAiStatus();
  const canSpeak = ai !== undefined && ai.transcribe !== 'off';

  useEffect(() => {
    try {
      if (form.content || form.workforceCount || form.weather || form.voicePath) {
        sessionStorage.setItem(draftKey(siteId), JSON.stringify(form));
      } else {
        sessionStorage.removeItem(draftKey(siteId));
      }
    } catch {
      // Trình duyệt chặn bộ nhớ phiên: vẫn ghi được nhật ký, chỉ không giữ nháp.
    }
  }, [siteId, form]);

  /** Nói xong: tải tệp lên, máy chép chữ + xếp mục, điền nháp lên biểu mẫu. */
  async function onSpoken(blob: Blob, seconds: number | null) {
    setError(null);
    setVoiceInfo(null);
    setVoiceBusy(true);
    try {
      const audioPath = await uploadSiteLogAudio(siteId, blob);
      setForm((f) => ({ ...f, voicePath: audioPath }));
      const res = await draftSiteLog({ siteId, audioPath, seconds });
      const drafted = res.draft ? composeSiteLogContent(res.draft) : '';
      const text = drafted || res.transcript;
      setForm((f) => ({
        ...f,
        // Đã gõ sẵn thì nối thêm, không ghi đè chữ người ghi.
        content: f.content.trim() ? `${f.content.trim()}\n${text}` : text,
        workforceCount:
          res.draft?.workforce_count != null ? String(res.draft.workforce_count) : f.workforceCount,
        weather: res.draft?.weather || f.weather,
        voicePath: audioPath,
        voiceTranscript: res.transcript,
        aiDrafted: res.draft !== null,
      }));
      setVoiceInfo(
        res.warning ??
          (res.draft
            ? 'Máy đã điền nháp — đọc lại, sửa chỗ sai rồi bấm Lưu.'
            : 'Đã chép lời nói vào ô Nội dung — đọc lại, sửa rồi bấm Lưu.') +
            (res.fake ? ' (giả lập)' : ''),
      );
    } catch (e) {
      // Ném lại để bộ ghi âm hiện lỗi ngay dưới nút; biểu mẫu vẫn gõ tay được.
      throw new Error(e instanceof Error ? e.message : 'Máy chưa chép được lời nói. Gõ tay.');
    } finally {
      setVoiceBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.content.trim()) {
      setError('Vui lòng nhập nội dung nhật ký.');
      return;
    }
    setSaving(true);
    try {
      // Tải ảnh TRƯỚC, ghi nhật ký SAU: nhật ký không bao giờ trỏ vào ảnh chưa có.
      const photoPaths =
        photos.length > 0 ? await uploadConstructionPhotos(siteId, 'nhat-ky', photos) : [];
      await createLog.mutateAsync({
        siteId,
        companyId,
        values: {
          log_date: form.logDate,
          log_type: form.logType,
          content: form.content.trim(),
          workforce_count: form.workforceCount ? Number(form.workforceCount) : null,
          weather: form.weather.trim() || null,
          ...(photoPaths.length > 0 ? { photo_urls: photoPaths } : {}),
          ...(form.voicePath
            ? {
                voice_path: form.voicePath,
                voice_transcript: form.voiceTranscript,
                ai_drafted: form.aiDrafted,
              }
            : {}),
        },
      });
      setForm(EMPTY_DRAFT());
      setPhotos([]);
      setVoiceInfo(null);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {!readOnly && (
        <form
          onSubmit={submit}
          noValidate
          className="rounded-card bg-surface p-4"
        >
          <p className="mb-3 font-medium">Ghi nhật ký hôm nay</p>

          {canSpeak && (
            <div className="mb-3 rounded-sm bg-surface-sunken p-3">
              <p className="mb-2 text-sm">
                <span className="font-medium">Nói nhật ký thay gõ</span>
                <span className="text-fg-subtle">
                  {' '}
                  — việc đã làm, vật tư, vướng mắc, an toàn, số người, thời tiết. Máy điền vào các ô
                  bên dưới để đọc lại.
                </span>
              </p>
              <VoiceRecorder disabled={saving || voiceBusy} onRecorded={onSpoken} />
              {voiceBusy && (
                <p role="status" className="mt-2 text-sm text-fg-subtle">
                  Máy đang nghe và điền nháp…
                </p>
              )}
              {voiceInfo && !voiceBusy && (
                <p role="status" className="mt-2 text-sm text-status-completed">
                  {voiceInfo}
                </p>
              )}
              {form.voiceTranscript && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-fg-subtle">
                    Lời đã nói (máy nghe được)
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-fg-subtle">{form.voiceTranscript}</p>
                </details>
              )}
            </div>
          )}

          <div className="mb-3">
            <SitePhotoPicker files={photos} onChange={setPhotos} disabled={saving} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nội dung" required className="sm:col-span-2">
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={form.content.split('\n').length > 3 ? 8 : 3}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                placeholder="Việc đã làm, khối lượng, vướng mắc hoặc sự việc tại hiện trường."
              />
            </Field>

            <Field label="Ngày xảy ra" hint="Ngày việc thật sự xảy ra, không phải ngày nhập.">
              <DateInput
                value={form.logDate}
                max={TODAY()}
                onChange={(v) => setForm((f) => ({ ...f, logDate: v }))}
              />
            </Field>

            <Field label="Loại mục">
              <select
                value={form.logType}
                onChange={(e) => setForm((f) => ({ ...f, logType: e.target.value as SiteLogType }))}
                className="h-10 w-full rounded-sm border border-border bg-surface px-3"
              >
                {SITE_LOG_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SITE_LOG_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Quân số có mặt"
              hint="Số người làm việc tại công trường trong ngày — để đối chiếu với bảng chấm công khối công trường."
            >
              <Input
                value={form.workforceCount}
                inputMode="numeric"
                onChange={(e) =>
                  setForm((f) => ({ ...f, workforceCount: e.target.value.replace(/[^\d]/g, '') }))
                }
              />
            </Field>

            <Field label="Thời tiết" hint="Căn cứ khi tranh chấp chậm tiến độ do thời tiết.">
              <Input
                value={form.weather}
                onChange={(e) => setForm((f) => ({ ...f, weather: e.target.value }))}
                placeholder="Nắng · Mưa từ 14h · Bão"
              />
            </Field>
          </div>

          <p className="mt-3 text-xs text-fg-subtle">
            Nhật ký đã ghi chỉ sửa được trong 24 giờ và chỉ bởi người đã ghi. Cần đính chính sau đó
            thì ghi thêm một mục mới.
          </p>

          <div className="mt-3">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving && photos.length > 0 ? 'Đang tải ảnh…' : BUTTONS.save}
            </Button>
          </div>
        </form>
      )}

      {(logs ?? []).length === 0 ? (
        <EmptyState message="Chưa có mục nhật ký nào. Ghi lại tiến độ, khối lượng và vướng mắc theo từng ngày để truy vết được khi phát sinh tranh chấp." />
      ) : (
        <ol className="space-y-3">
          {(logs ?? []).map((log) => (
            <li key={log.id} className="rounded-card bg-surface p-4">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-4 shrink-0" aria-hidden />
                  {formatDate(log.log_date)}
                </span>
                <span className="font-medium text-fg">{SITE_LOG_TYPE_LABELS[log.log_type]}</span>
                {log.workforce_count != null && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-4 shrink-0" aria-hidden />
                    {log.workforce_count} người
                  </span>
                )}
                {log.weather && <span>{log.weather}</span>}
                {log.voice_path && (
                  <span className="inline-flex items-center gap-1">
                    <Mic className="size-4 shrink-0" aria-hidden />
                    Nói bằng giọng
                  </span>
                )}
                <span className="ms-auto">{log.author?.full_name ?? 'Không rõ người ghi'}</span>
              </div>
              <p className="whitespace-pre-wrap">{log.content}</p>
              {log.photo_urls && log.photo_urls.length > 0 && <PhotoStrip paths={log.photo_urls} />}
              {log.voice_path && (
                <VoiceEvidence path={log.voice_path} transcript={log.voice_transcript} />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Đoạn ghi âm gốc + bản máy chép của một mục nhật ký đã lưu — nghe lại khi cần đối chiếu. */
function VoiceEvidence({ path, transcript }: { path: string; transcript: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2 text-sm">
      {src ? (
        <audio controls src={src} className="w-full" />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="subtle"
          onClick={() => void siteLogAudioUrl(path).then(setSrc, (e: Error) => setError(e.message))}
        >
          Nghe đoạn ghi âm
        </Button>
      )}
      {transcript && (
        <details className="mt-1">
          <summary className="cursor-pointer text-fg-subtle">Lời đã nói (máy nghe được)</summary>
          <p className="mt-1 whitespace-pre-wrap text-fg-subtle">{transcript}</p>
        </details>
      )}
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
