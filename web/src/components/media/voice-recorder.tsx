/**
 * Nút ghi âm dùng chung (khối nền K1, Đợt 1) — khảo sát hôm nay, nhật ký công trường và phiếu
 * bảo hành ở các đợt sau.
 *
 * Ghi bằng `MediaRecorder` của trình duyệt: không cài ứng dụng, chạy được trên điện thoại.
 * Trình duyệt không cho ghi (máy cũ, chưa cấp quyền micro) thì vẫn còn lối tải tệp ghi âm có
 * sẵn — ghi bằng ứng dụng ghi âm của điện thoại rồi chọn tệp. Nút luôn lớn (≥ 40 px) vì người
 * dùng đang đứng ngoài hiện trường (AFD 4.8).
 */

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  /** Nhận tệp ghi âm + số giây; ném lỗi thì nút hiện lại để ghi lại / tải lại. */
  onRecorded: (blob: Blob, seconds: number | null) => Promise<void>;
  disabled?: boolean;
}) {
  const canRecord =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined';
  const [state, setState] = useState<'idle' | 'recording' | 'saving'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function save(blob: Blob, secs: number | null) {
    setState('saving');
    setError(null);
    try {
      await onRecorded(blob, secs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được đoạn ghi âm. Thử lại.');
    } finally {
      setState('idle');
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = Math.round((Date.now() - startedRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        void save(blob, secs);
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setSeconds(0);
      recorder.start(1000);
      setState('recording');
      timerRef.current = window.setInterval(
        () => setSeconds(Math.round((Date.now() - startedRef.current) / 1000)),
        500,
      );
    } catch {
      setError(
        'Không mở được micro. Cho phép trình duyệt dùng micro, hoặc ghi bằng ứng dụng ghi âm của điện thoại rồi tải tệp lên.',
      );
    }
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canRecord &&
          (state === 'recording' ? (
            <Button type="button" variant="danger" onClick={stop} className="min-h-10">
              <Square />
              Dừng và lưu · {clock(seconds)}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void start()}
              disabled={disabled || state === 'saving'}
              className="min-h-10"
            >
              <Mic />
              {state === 'saving' ? 'Đang lưu…' : 'Ghi âm'}
            </Button>
          ))}
        <Button
          type="button"
          variant="subtle"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || state !== 'idle'}
          className="min-h-10"
        >
          <Upload />
          Tải tệp ghi âm
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void save(file, null);
          }}
        />
        {state === 'recording' && (
          <span role="status" className="text-xs font-semibold text-status-overdue">
            Đang ghi âm — để điện thoại gần người nói
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
