/**
 * Ghi âm nhật ký công trường (Đợt 2 — 2B) — kho `site-log-audio` (migration 0190).
 *
 * Đường dẫn `<công trình>/<uuid>.<đuôi>`: quyền tệp theo công trình ở thư mục đầu (Mẫu A + E),
 * cùng hàm với chính sách của `site_logs`. Tệp tải lên TRƯỚC khi có mục nhật ký; mục được lưu
 * sau đó trỏ vào tệp (`voice_path`). Người ghi bỏ ngang thì còn tệp mồ côi — chấp nhận được,
 * như ảnh công trường.
 */

import { supabase } from '@/lib/supabase';

export const SITE_LOG_AUDIO_BUCKET = 'site-log-audio';

export async function uploadSiteLogAudio(siteId: string, blob: Blob): Promise<string> {
  const type = (blob.type || 'audio/webm').split(';')[0]!;
  const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : (type.split('/')[1] ?? 'webm');
  const path = `${siteId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SITE_LOG_AUDIO_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (error) {
    throw new Error('Không tải được đoạn ghi âm lên. Kiểm tra mạng rồi ghi lại, hoặc gõ tay.');
  }
  return path;
}

/** URL ký một giờ để nghe lại đoạn ghi âm. */
export async function siteLogAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SITE_LOG_AUDIO_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data) throw new Error('Không mở được đoạn ghi âm.');
  return data.signedUrl;
}
