/**
 * Báo cáo khảo sát của MỘT buổi khảo sát (Đợt 1 — 1D).
 *
 * Luồng chủ dự án chốt: tới nơi bấm «Bắt đầu khảo sát» → ghi âm khi nói chuyện với khách →
 * «Kết thúc khảo sát» (máy ghi giờ) → máy chép chữ, viết nháp sáu ô báo cáo → người khảo sát sửa
 * → «Gửi Ban Giám đốc duyệt» → duyệt thì cơ hội tự sang Báo giá; trả về thì sửa theo ý kiến rồi
 * gửi lại. Máy chỉ làm nháp; AI tắt hay lỗi thì người khảo sát tự gõ, luồng không bị chặn.
 */

import { useState } from 'react';
import { Bot, FileAudio, Play, Send, Timer } from 'lucide-react';
import { SURVEY_REPORT_STATUS_META, formatDateTime, type SurveyReportStatus } from '@nvg/shared';
import { WaitingOn } from '@/components/entity/waiting-on';
import { VoiceRecorder } from '@/components/media/voice-recorder';
import { Button } from '@/components/ui/button';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  recordingUrl,
  useAddRecording,
  useAiStatus,
  useSaveTranscript,
  useSubmitSurveyReport,
  useSummarizeSurvey,
  useSurveyClock,
  useSurveyRecordings,
  useTranscribe,
  type SiteSurveyRecord,
  type SurveyRecording,
} from '@/hooks/use-site-surveys';
import type { SurveyAiDraft } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth';

export function SurveyReportBadge({ status }: { status: SurveyReportStatus }) {
  const meta = SURVEY_REPORT_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusLozenge status={meta.statusGroup} />
      <span className="text-xs text-fg-subtle">{meta.label}</span>
    </span>
  );
}

export function SurveyReportSection({
  survey,
  canEdit,
  onUseDraft,
}: {
  survey: SiteSurveyRecord;
  /** Người phụ trách cơ hội, cơ hội chưa bàn giao. */
  canEdit: boolean;
  /** Mở biểu mẫu biên bản, điền sẵn nháp máy viết. */
  onUseDraft: (draft: SurveyAiDraft) => void;
}) {
  const { profile } = useAuth();
  const clock = useSurveyClock();
  const submit = useSubmitSurveyReport();
  const addRecording = useAddRecording();
  const summarize = useSummarizeSurvey();
  const transcribe = useTranscribe();
  const { data: ai } = useAiStatus();
  const { data: recordings } = useSurveyRecordings(survey.id);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const status = survey.report_status;
  const writable = canEdit && (status === 'nhap' || status === 'tra_ve');
  const surveyed = survey.surveyed_at !== null;
  const inProgress = survey.started_at !== null && survey.finished_at === null;
  const transcribed = (recordings ?? []).some((r) => r.transcript_status === 'xong');
  const summaryMode = ai?.summary ?? 'off';
  const isSender = profile?.id != null;

  async function run(action: () => Promise<unknown>, done?: string) {
    setError(null);
    setInfo(null);
    try {
      await action();
      if (done) setInfo(done);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SurveyReportBadge status={status} />
        <span className="text-xs text-fg-subtle">
          {survey.started_at && <>Bắt đầu {formatDateTime(survey.started_at)}</>}
          {survey.finished_at && <> · Kết thúc {formatDateTime(survey.finished_at)}</>}
        </span>
      </div>

      {status === 'tra_ve' && survey.report_feedback && (
        <div
          role="note"
          className="rounded-sm border border-status-overdue bg-status-overdue-bg px-3 py-2"
        >
          <p className="font-semibold text-status-overdue">Ban Giám đốc trả về — cần sửa</p>
          <p className="mt-0.5 whitespace-pre-wrap">{survey.report_feedback}</p>
        </div>
      )}

      {status === 'cho_duyet' && survey.report_approval_id && (
        <div className="rounded-sm bg-surface-sunken px-3 py-2">
          <p>Đã gửi Ban Giám đốc lúc {formatDateTime(survey.report_submitted_at)}.</p>
          <WaitingOn approvalId={survey.report_approval_id} canNudge={isSender && canEdit} />
        </div>
      )}

      {status === 'da_duyet' && (
        <p className="text-status-completed">
          Ban Giám đốc đã duyệt lúc {formatDateTime(survey.report_decided_at)} — lập báo giá ở tab
          Báo giá.
        </p>
      )}

      {/* Bước 1–2: bắt đầu, ghi âm, kết thúc */}
      {writable && !surveyed && survey.started_at === null && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={clock.isPending}
            onClick={() =>
              void run(() => clock.mutateAsync({ surveyId: survey.id, action: 'start' }))
            }
          >
            <Play />
            Bắt đầu khảo sát
          </Button>
          <span className="text-xs text-fg-subtle">Bấm khi tới nơi — máy ghi giờ bắt đầu.</span>
        </div>
      )}

      {writable && (inProgress || surveyed) && (
        <div className="space-y-2">
          <p className="text-xs text-fg-subtle">
            {inProgress
              ? 'Đang khảo sát — ghi âm khi trao đổi với khách, nhiều đoạn cũng được.'
              : 'Ghi thêm đoạn ghi âm nếu cần bổ sung.'}
          </p>
          <VoiceRecorder
            disabled={addRecording.isPending}
            onRecorded={async (blob, seconds) => {
              const { id } = await addRecording.mutateAsync({ surveyId: survey.id, blob, seconds });
              setInfo('Đã lưu đoạn ghi âm.');
              if (ai?.transcribe && ai.transcribe !== 'off') {
                // Chép chữ ngay; hỏng thì vẫn còn nút «Chép chữ» và ô gõ tay.
                void transcribeLater(id);
              }
            }}
          />
          {inProgress && (
            <Button
              variant="secondary"
              disabled={clock.isPending}
              onClick={() =>
                void run(
                  () => clock.mutateAsync({ surveyId: survey.id, action: 'finish' }),
                  'Đã ghi giờ kết thúc. Viết báo cáo rồi gửi Ban Giám đốc.',
                )
              }
            >
              <Timer />
              Kết thúc khảo sát
            </Button>
          )}
        </div>
      )}

      {(recordings ?? []).length > 0 && (
        <ul className="space-y-2">
          {recordings!.map((r, i) => (
            <RecordingItem key={r.id} index={i + 1} recording={r} writable={writable} />
          ))}
        </ul>
      )}

      {/* Bước 3–4: máy viết nháp, gửi Ban Giám đốc */}
      {writable && surveyed && (
        <div className="flex flex-wrap items-center gap-2">
          {summaryMode !== 'off' && (
            <Button
              variant="secondary"
              disabled={summarize.isPending || !transcribed}
              title={transcribed ? undefined : 'Cần ít nhất một đoạn ghi âm đã chép chữ.'}
              onClick={() =>
                void run(async () => {
                  const res = await summarize.mutateAsync(survey.id);
                  onUseDraft(res.draft);
                }, 'Máy đã viết nháp vào biểu mẫu — đọc lại, sửa rồi lưu.')
              }
            >
              <Bot />
              {summarize.isPending ? 'Máy đang viết…' : 'Máy viết báo cáo'}
              {summaryMode === 'fake' && <span className="text-xs">(giả lập)</span>}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={submit.isPending || !survey.needs}
            title={survey.needs ? undefined : 'Điền ô Nhu cầu của khách trước khi gửi.'}
            onClick={() =>
              void run(
                () => submit.mutateAsync(survey.id),
                'Đã gửi Ban Giám đốc. Duyệt xong cơ hội tự sang Báo giá.',
              )
            }
          >
            <Send />
            {status === 'tra_ve' ? 'Gửi lại Ban Giám đốc' : 'Gửi Ban Giám đốc duyệt'}
          </Button>
          {/* Nút khoá phải nói lý do ngay dưới nút, không chỉ khi rê chuột (chạy thử 28/10/2026). */}
          {summaryMode !== 'off' && !transcribed && (
            <p className="basis-full text-fg-subtle">
              «Máy viết báo cáo» viết từ các đoạn ghi âm — chưa có đoạn nào đã chép chữ. Khảo sát
              bằng phiếu giấy thì dùng «Máy đọc phiếu và điền nháp» ở tệp phiếu phía trên.
            </p>
          )}
          {!survey.needs && (
            <p className="basis-full text-fg-subtle">
              Điền ô «Nhu cầu của khách» rồi Lưu trước khi gửi Ban Giám đốc.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="text-status-completed">
          {info}
        </p>
      )}
    </div>
  );

  async function transcribeLater(id: string) {
    try {
      await transcribe.mutateAsync(id);
    } catch {
      /* nút «Chép chữ» và ô gõ tay vẫn còn */
    }
  }
}

function RecordingItem({
  index,
  recording,
  writable,
}: {
  index: number;
  recording: SurveyRecording;
  writable: boolean;
}) {
  const transcribe = useTranscribe();
  const save = useSaveTranscript();
  const { data: ai } = useAiStatus();
  const [src, setSrc] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = text ?? recording.transcript ?? '';

  return (
    <li className="rounded-sm border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <FileAudio className="size-4 text-fg-subtle" />
          Đoạn {index}
          <span className="text-xs font-normal text-fg-subtle">
            {formatDateTime(recording.created_at)}
            {recording.duration_seconds != null && ` · ${recording.duration_seconds} giây`}
            {recording.author && ` · ${recording.author.full_name}`}
          </span>
        </span>
        <div className="flex flex-wrap gap-1">
          {!src && (
            <Button
              size="sm"
              variant="subtle"
              onClick={() => void recordingUrl(recording.storage_path).then(setSrc)}
            >
              Nghe
            </Button>
          )}
          {writable && ai?.transcribe && ai.transcribe !== 'off' && (
            <Button
              size="sm"
              variant="subtle"
              disabled={transcribe.isPending}
              onClick={() => {
                setError(null);
                transcribe.mutate(recording.id, {
                  onError: (e) => setError(e.message),
                  onSuccess: () => setText(null),
                });
              }}
            >
              {transcribe.isPending
                ? 'Đang chép chữ…'
                : recording.transcript_status === 'xong'
                  ? 'Chép chữ lại'
                  : 'Chép chữ'}
              {ai.transcribe === 'fake' && ' (giả lập)'}
            </Button>
          )}
        </div>
      </div>
      {src && <audio controls src={src} className="mt-2 w-full" />}
      {writable ? (
        <div className="mt-2 space-y-1">
          <textarea
            value={value}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Chưa có chữ — bấm «Chép chữ» hoặc gõ tóm tắt đoạn này"
            className="w-full rounded-field border border-border-strong bg-surface px-3 py-2 placeholder:text-fg-subtle"
          />
          {text !== null && text !== (recording.transcript ?? '') && (
            <Button
              size="sm"
              variant="secondary"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { id: recording.id, transcript: text },
                  { onSuccess: () => setText(null), onError: (e) => setError(e.message) },
                )
              }
            >
              Lưu chữ
            </Button>
          )}
        </div>
      ) : (
        recording.transcript && (
          <p className="mt-2 whitespace-pre-wrap text-fg-subtle">{recording.transcript}</p>
        )
      )}
      {recording.transcript_note && (
        <p className="mt-1 text-xs text-fg-subtle">{recording.transcript_note}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-status-overdue">
          {error}
        </p>
      )}
    </li>
  );
}
