/**
 * Dải «Điểm danh» in thẳng lên ảnh — kiểu Timemark mà công trường đang dùng.
 *
 * In lên PIXEL chứ không chỉ ghi kèm dữ liệu: ảnh còn được chuyển tiếp qua Zalo, in ra, đính
 * vào hồ sơ — đi tới đâu cũng mang theo giờ, ngày, công trình, người điểm danh.
 *
 * Giờ in lên ảnh là giờ điện thoại lúc chụp (máy chủ chưa kịp trả lời). Giờ CHÍNH THỨC là giờ
 * máy chủ lưu ở `site_check_ins.checked_in_at`; danh sách điểm danh hiện giờ đó, và báo khi hai
 * giờ lệch nhau (`CLOCK_SKEW_WARN_MINUTES`).
 */

import { NVG_TIME_ZONE, toNvgTimeInput } from '@nvg/shared';

/** Lệch giữa giờ điện thoại và giờ máy chủ quá mức này thì danh sách ghi rõ cả hai giờ. */
export const CLOCK_SKEW_WARN_MINUTES = 10;

/** Cạnh dài tối đa của ảnh lưu — đủ đọc rõ mặt người và dải chữ, nhẹ để tải lên bằng 4G. */
const MAX_EDGE = 1600;

export type CheckInLocation =
  | { status: 'co_vi_tri'; latitude: number; longitude: number; accuracy: number | null }
  | { status: 'khong_cho_phep' }
  | { status: 'khong_lay_duoc' };

export interface CheckInStampText {
  badge: string;
  time: string;
  lines: string[];
  brand: string;
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** «Thứ Tư, 30/09/2026» theo giờ Việt Nam. */
export function formatCheckInDay(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: NVG_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return `${WEEKDAYS[weekday]}, ${get('day')}/${get('month')}/${get('year')}`;
}

export function describeLocation(location: CheckInLocation): string {
  switch (location.status) {
    case 'co_vi_tri': {
      const coords = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
      return location.accuracy !== null
        ? `Vị trí ${coords} (sai số ~${Math.round(location.accuracy)} m)`
        : `Vị trí ${coords}`;
    }
    case 'khong_cho_phep':
      return 'Không có vị trí — điện thoại không cho phép lấy vị trí';
    case 'khong_lay_duoc':
      return 'Không có vị trí — không lấy được tín hiệu định vị';
  }
}

export function checkInStampText(input: {
  at: Date;
  siteCode: string;
  siteName: string;
  personName: string;
  location: CheckInLocation;
}): CheckInStampText {
  return {
    badge: 'Điểm danh',
    time: toNvgTimeInput(input.at),
    lines: [
      formatCheckInDay(input.at),
      `${input.siteCode} — ${input.siteName}`,
      input.personName,
      describeLocation(input.location),
    ],
    brand: 'Nhà Việt Group',
  };
}

/** Cắt dòng chữ quá dài bằng dấu «…» cho vừa bề rộng. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * Thu nhỏ ảnh về `MAX_EDGE`, in dải điểm danh ở góc dưới, trả về JPEG.
 * Ảnh không giải mã được (định dạng lạ) thì ném lỗi có câu cho người dùng.
 */
export async function stampCheckInPhoto(file: File, text: CheckInStampText): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Không đọc được ảnh vừa chụp. Chụp lại bằng máy ảnh của điện thoại.');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Điện thoại không hỗ trợ xử lý ảnh. Thử bằng trình duyệt Chrome.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const unit = Math.max(12, Math.round(Math.min(w, h) / 28));
  const pad = Math.round(unit * 0.7);
  const font = (weight: number, size: number) =>
    `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
  const lineGap = Math.round(unit * 1.35);
  const boxW = Math.min(w - pad * 2, unit * 22);
  const badgeH = Math.round(unit * 2.4);
  const boxH = badgeH + pad + text.lines.length * lineGap + pad;
  const x = pad;
  const y = h - boxH - pad;

  // Nền mờ để chữ đọc được trên mọi nền ảnh.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x, y, boxW, boxH);

  // Ô vàng «Điểm danh» + ô trắng giờ.
  ctx.font = font(700, unit);
  const badgeW = ctx.measureText(text.badge).width + pad * 2;
  ctx.fillStyle = '#F5C518';
  ctx.fillRect(x, y, badgeW, badgeH);
  ctx.fillStyle = '#1F2933';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.badge, x + pad, y + badgeH / 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x + badgeW, y, boxW - badgeW, badgeH);
  ctx.fillStyle = '#12372A';
  ctx.font = font(700, Math.round(unit * 1.6));
  ctx.fillText(text.time, x + badgeW + pad, y + badgeH / 2);
  ctx.font = font(600, Math.round(unit * 0.7));
  const brandW = ctx.measureText(text.brand).width;
  if (x + badgeW + pad + unit * 5 + brandW < x + boxW - pad) {
    ctx.fillText(text.brand, x + boxW - pad - brandW, y + badgeH / 2);
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  text.lines.forEach((line, i) => {
    ctx.font = font(i === 0 ? 600 : 400, i === 0 ? unit : Math.round(unit * 0.85));
    ctx.fillText(fit(ctx, line, boxW - pad * 2), x + pad, y + badgeH + pad + lineGap * (i + 0.8));
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw new Error('Không lưu được ảnh điểm danh. Chụp lại ảnh.');
  return new File([blob], 'diem-danh.jpg', { type: 'image/jpeg' });
}

/** Lấy vị trí đúng một lần, không chặn điểm danh khi không có. */
export function readCheckInLocation(timeoutMs = 10_000): Promise<CheckInLocation> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ status: 'khong_lay_duoc' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          status: 'co_vi_tri',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        }),
      (err) =>
        resolve({
          status: err.code === err.PERMISSION_DENIED ? 'khong_cho_phep' : 'khong_lay_duoc',
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
