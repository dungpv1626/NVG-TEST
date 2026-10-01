/**
 * Khung ký tên trên màn hình — biên bản thu hồi giàn giáo ký hai bên tại bãi (migration 0145).
 *
 * Vẽ bằng Pointer Events nên dùng được cả ngón tay, bút cảm ứng và chuột. Ảnh xuất ra là PNG
 * nền trắng (nền trong suốt in ra thành ô đen trên vài máy in). Canvas dựng theo
 * `devicePixelRatio` để nét không nhoè trên điện thoại.
 *
 * `touch-action: none` là bắt buộc: thiếu nó, kéo ngón tay trên khung là cuộn cả trang và
 * chữ ký thành một vệt ngắn.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export interface SignaturePadHandle {
  /** Ảnh PNG của chữ ký; `null` khi khung còn trống. */
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

interface SignaturePadProps {
  /** Nhãn đọc được bằng trình đọc màn hình và hiện phía trên khung. */
  label: string;
  onInkChange?: (hasInk: boolean) => void;
}

const HEIGHT = 160;

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { label, onInkChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const paintBackground = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, HEIGHT);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#172B4D';
  }, []);

  useEffect(() => {
    paintBackground();
  }, [paintBackground]);

  const markInk = useCallback(
    (value: boolean) => {
      setHasInk(value);
      onInkChange?.(value);
    },
    [onInkChange],
  );

  const clear = useCallback(() => {
    paintBackground();
    markInk(false);
  }, [paintBackground, markInk]);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || !hasInk) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        }),
    }),
    [clear, hasInk],
  );

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Chấm một điểm để cú chạm không kéo vẫn để lại nét.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    if (!hasInk) markInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{label}</p>
        <Button type="button" variant="subtle" onClick={clear} disabled={!hasInk}>
          Ký lại
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${label} — ${hasInk ? 'đã ký' : 'chưa ký'}`}
        className="block w-full cursor-crosshair touch-none rounded-sm border border-border-strong bg-white"
        style={{ height: HEIGHT }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <p className="text-xs text-fg-subtle">
        {hasInk ? 'Đã ký.' : 'Ký bằng ngón tay, bút cảm ứng hoặc chuột vào khung trên.'}
      </p>
    </div>
  );
});
