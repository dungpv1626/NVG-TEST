/**
 * Hai phép đổi nhị phân dùng chung cho mọi client ảnh — tách ra khỏi `pollinations.ts` khi có
 * client thứ hai (OpenAI, 08/09/2026) để không chép lại.
 */

/**
 * Nhận dạng kiểu ảnh từ vài byte đầu của chuỗi base64.
 *
 * Cần thiết vì phản hồi của nhiều nhà cung cấp KHÔNG khai kiểu tệp, còn màn hình thì dựng
 * `data:<kiểu>;base64,…` — đoán bừa `image/png` cho một tệp JPEG là loại sai chỉ lộ ra ở một
 * số trình duyệt. Đo được 06/09/2026: Pollinations `kontext` trả JPEG.
 */
export function sniffMime(dataBase64: string): string {
  if (dataBase64.startsWith('/9j/')) return 'image/jpeg';
  if (dataBase64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (dataBase64.startsWith('UklGR')) return 'image/webp';
  // Không nhận ra thì khai PNG: mọi trình duyệt đều tự dò lại theo nội dung, nên đây là
  // phỏng đoán an toàn nhất chứ không phải một khẳng định.
  return 'image/png';
}

/** base64 → nhị phân. `atob` có sẵn trong Workers và trong Node từ bản 16. */
export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Đuôi tệp cho một kiểu ảnh — dùng khi gửi multipart, nhà cung cấp đọc đuôi để nhận dạng. */
export function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

/** Kiểu ảnh mà mọi nhà cung cấp hiện dùng đều nhận. */
export const ALLOWED_IMAGE_INPUT: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
