/**
 * Nút ghi âm dùng chung (khối nền K1, Đợt 1) — khảo sát hôm nay, nhật ký công trường và phiếu
 * bảo hành ở các đợt sau.
 *
 * Ghi bằng `MediaRecorder` của trình duyệt: không cài ứng dụng, chạy được trên điện thoại.
 * Trình duyệt không cho ghi (máy cũ, chưa cấp quyền micro) thì vẫn còn lối tải tệp ghi âm có
 * sẵn — ghi bằng ứng dụng ghi âm của điện thoại rồi chọn tệp. Nút luôn lớn (≥ 40 px) vì người
 * dùng đang đứng ngoài hiện trường (AFD 4.8).
 *
 * Thanh mức âm + tên micro + chọn micro (18/10/2026): đoạn ghi đầu tiên của chủ dự án chỉ thu
 * được tiếng ồn đều — micro chọn nhầm / ở xa — và chỉ lộ ra khi chép chữ ra câu Whisper tự bịa.
 * Thấy thanh mức âm đứng yên ngay lúc nói thì người ghi sửa được tại chỗ, không phải ghi lại
 * sau khi đã rời công trường.
 */

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
const MIC_STORAGE_KEY = 'nvg.voice-recorder.mic';
/** Thang thanh mức âm: −60 dB = rỗng, −10 dB = đầy. */
const METER_FLOOR_DB = -60;
const METER_CEIL_DB = -10;
/**
 * Sau vài giây mà đỉnh chưa từng vượt mức này thì nhắc: tiếng nói cách máy 30–50 cm thường lên
 * −25 dB trở lên; đoạn hỏng ngày 18/10/2026 đỉnh chỉ quanh −24 dB và đều đều suốt đoạn.
 */
const QUIET_PEAK_DB = -30;
const QUIET_CHECK_MS = 4000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function readMic(): string {
  try {
    return window.localStorage.getItem(MIC_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeMic(id: string) {
  try {
    window.localStorage.setItem(MIC_STORAGE_KEY, id);
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ mất ghi nhớ lựa chọn, ghi âm vẫn chạy.
  }
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
  const [level, setLevel] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [micLabel, setMicLabel] = useState<string | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>(readMic);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const meterRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function stopMeter() {
    if (meterRef.current) window.clearInterval(meterRef.current);
    meterRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
  }

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopMeter();
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  /** Danh sách micro chỉ có tên sau khi người dùng đã cho phép micro một lần. */
  async function loadMics() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setMics(all.filter((d) => d.kind === 'audioinput' && d.deviceId));
    } catch {
      setMics([]);
    }
  }

  useEffect(() => {
    if (canRecord) void loadMics();
  }, [canRecord]);

  /** Đo mức âm của luồng micro mỗi 100 ms — chỉ để hiển thị, không ảnh hưởng tệp ghi. */
  function startMeter(stream: MediaStream) {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    // Tạo sau `await getUserMedia` là đã rời cú bấm — Chrome để bộ âm thanh ở «suspended»,
    // thanh mức âm đứng im ở 0 dù micro vẫn thu (gặp khi chạy thử 18/10/2026).
    void ctx.resume().catch(() => undefined);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peakDb = -Infinity;
    const begin = Date.now();
    setQuiet(false);
    meterRef.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8);
      peakDb = Math.max(peakDb, db);
      setLevel(Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / (METER_CEIL_DB - METER_FLOOR_DB))));
      if (Date.now() - begin > QUIET_CHECK_MS) setQuiet(peakDb < QUIET_PEAK_DB);
    }, 100);
  }

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
      const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: micId ? { ...base, deviceId: { exact: micId } } : base,
        });
      } catch {
        // Micro đã chọn lần trước không còn (rút tai nghe) — quay về micro mặc định.
        stream = await navigator.mediaDevices.getUserMedia({ audio: base });
      }
      setMicLabel(stream.getAudioTracks()[0]?.label || null);
      void loadMics();
      startMeter(stream);
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopMeter();
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
        {canRecord && mics.length > 1 && state === 'idle' && (
          <select
            value={micId}
            onChange={(e) => {
              setMicId(e.target.value);
              writeMic(e.target.value);
            }}
            aria-label="Micro dùng để ghi"
            className="h-10 max-w-64 rounded-sm border border-border bg-surface px-2 text-sm"
          >
            <option value="">Micro mặc định của máy</option>
            {mics.map((m, i) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Micro ${i + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {state === 'recording' && (
        <div role="status" className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-status-overdue">Đang ghi âm</span>
            {/* Thanh mức âm: nói mà thanh không nhảy là micro không nghe thấy. */}
            <div
              className="h-2 w-40 overflow-hidden rounded-full bg-surface-sunken"
              aria-label="Mức âm micro"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-100',
                  level > 0.45 ? 'bg-status-completed' : 'bg-fg-subtle',
                )}
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </div>
          {micLabel && <p className="text-xs text-fg-subtle">Micro: {micLabel}</p>}
          {quiet && (
            <p className="text-xs font-semibold text-status-overdue">
              Micro gần như không nghe thấy tiếng nói — nói to hơn, để máy gần người nói, hoặc dừng
              lại và chọn micro khác.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
