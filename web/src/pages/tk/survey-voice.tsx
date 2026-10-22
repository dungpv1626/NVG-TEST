/**
 * Khảo sát thiết kế theo luồng của khảo sát Kinh doanh (Đợt 5 — 5A, migration 0205):
 * «Bắt đầu khảo sát» khi tới nơi → máy ghi giờ, lập biên bản → ghi âm lời chủ nhà (máy chép chữ
 * nếu công tắc chép chữ bật) → «Kết thúc khảo sát» → máy ghi giờ kết thúc. Số đo vẫn điền ở biên
 * bản như cũ («Sửa»). Máy chỉ chép chữ — người khảo sát đọc lại, chép đoạn cần vào biên bản.
 */

import { useState } from 'react';
import { Copy, Play, Square } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import { VoiceRecorder } from '@/components/media/voice-recorder';
import { Button } from '@/components/ui/button';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  designAudioUrl,
  uploadDesignAudio,
  useAddSurveyRecording,
  useSaveRecordingTranscript,
  useSurveyClock,
  type DesignSurveyRecording,
} from '@/hooks/use-design-voice';
import { useAiStatus } from '@/hooks/use-site-surveys';
import { transcribeDesignAudio } from '@/lib/ai-api';

/** Nút «Bắt đầu khảo sát» — hành động chính của tab khi chưa có buổi nào đang mở. */
export function StartSurveyButton({
  projectId,
  onError,
}: {
  projectId: string;
  onError: (message: string | null) => void;
}) {
  const clock = useSurveyClock();
  return (
    <Button
      variant="primary"
      disabled={clock.isPending}
      onClick={async () => {
        onError(null);
        try {
          await clock.mutateAsync({ action: 'start', projectId });
        } catch (e) {
          onError(toUserMessage(e, 'create'));
        }
      }}
    >
      <Play className="size-4" aria-hidden />
      Bắt đầu khảo sát
    </Button>
  );
}

/** Dòng giờ máy ghi + nút «Kết thúc khảo sát» trên một biên bản. */
export function SurveyClockLine({
  survey,
  canEdit,
  onError,
}: {
  survey: { id: string; started_at: string | null; finished_at: string | null };
  canEdit: boolean;
  onError: (message: string | null) => void;
}) {
  const clock = useSurveyClock();
  if (!survey.started_at) {
    return <p className="text-sm text-fg-subtle">Biên bản lập tay — không có giờ máy ghi.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>
        Bắt đầu {formatDateTime(survey.started_at)}
        {survey.finished_at
          ? ` · Kết thúc ${formatDateTime(survey.finished_at)}`
          : ' · Đang khảo sát'}
      </span>
      <span className="text-fg-subtle">(máy ghi)</span>
      {!survey.finished_at && canEdit && (
        <Button
          variant="secondary"
          disabled={clock.isPending}
          onClick={async () => {
            onError(null);
            try {
              await clock.mutateAsync({ action: 'finish', surveyId: survey.id });
            } catch (e) {
              onError(toUserMessage(e, 'edit'));
            }
          }}
        >
          <Square className="size-4" aria-hidden />
          Kết thúc khảo sát
        </Button>
      )}
    </div>
  );
}

/** Ghi âm lời chủ nhà trên một biên bản + danh sách đoạn đã ghi. */
export function SurveyRecordings({
  projectId,
  companyId,
  surveyId,
  recordings,
  canEdit,
  onCopy,
}: {
  projectId: string;
  companyId: string;
  surveyId: string;
  recordings: DesignSurveyRecording[];
  canEdit: boolean;
  /** Chép bản chép chữ vào ô «Nhu cầu sử dụng» của biên bản. */
  onCopy?: (text: string) => void;
}) {
  const { data: ai } = useAiStatus();
  const add = useAddSurveyRecording();
  const saveTranscript = useSaveRecordingTranscript();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canTranscribe = ai !== undefined && ai.transcribe !== 'off';

  async function onRecorded(blob: Blob, seconds: number | null) {
    setError(null);
    setBusy(true);
    try {
      const path = await uploadDesignAudio(`${projectId}/khao-sat/${surveyId}`, blob);
      const id = await add.mutateAsync({ projectId, companyId, surveyId, path, seconds });
      if (canTranscribe) {
        try {
          const res = await transcribeDesignAudio({ projectId, audioPath: path, seconds });
          await saveTranscript.mutateAsync({
            recordingId: id,
            transcript: res.transcript,
            status: 'xong',
          });
        } catch (e) {
          await saveTranscript.mutateAsync({ recordingId: id, transcript: null, status: 'loi' });
          setError(`${toUserMessage(e, 'create')} Đoạn ghi âm đã lưu, nghe lại được để gõ tay.`);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function listen(path: string) {
    try {
      window.open(await designAudioUrl(path), '_blank', 'noopener');
    } catch (e) {
      setError(toUserMessage(e, 'view'));
    }
  }

  if (!canEdit && recordings.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="font-medium">Ghi âm lời chủ nhà</p>
      {canEdit && (
        <>
          <p className="text-sm text-fg-subtle">
            {canTranscribe
              ? 'Máy chép lời thành chữ để đọc lại; chép đoạn cần vào biên bản.'
              : 'Chép chữ đang tắt — đoạn ghi âm vẫn được lưu để nghe lại.'}
          </p>
          <VoiceRecorder disabled={busy} onRecorded={onRecorded} />
          {busy && (
            <p role="status" className="text-sm text-fg-subtle">
              Đang lưu đoạn ghi âm…
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-overdue">
          {error}
        </p>
      )}
      {recordings.length > 0 && (
        <ul className="space-y-2">
          {recordings.map((r, i) => (
            <li key={r.id} className="rounded-sm bg-surface-sunken p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Đoạn {i + 1}</span>
                <span className="text-fg-subtle">
                  {formatDateTime(r.created_at)}
                  {r.duration_seconds ? ` · ${r.duration_seconds} giây` : ''}
                </span>
                <Button variant="subtle" onClick={() => void listen(r.storage_path)}>
                  Nghe lại
                </Button>
                {canEdit && onCopy && r.transcript && (
                  <Button variant="subtle" onClick={() => onCopy(r.transcript!)}>
                    <Copy className="size-4" aria-hidden />
                    Chép vào Nhu cầu sử dụng
                  </Button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap">
                {r.transcript ??
                  (r.transcript_status === 'loi'
                    ? 'Máy chưa chép được chữ — nghe lại để gõ tay.'
                    : 'Chưa chép chữ.')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
