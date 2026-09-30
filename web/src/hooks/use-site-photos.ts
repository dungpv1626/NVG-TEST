/**
 * Ảnh hiện trường của công trình — bucket `construction-photos` (migration 0135).
 *
 * Quy ước đường dẫn `<công trình>/<loại>/<uuid>.<đuôi>`: quyền đọc/ghi tệp đi theo công trình ở
 * thư mục đầu (Mẫu A + E). Tải tệp TRƯỚC, ghi dòng dữ liệu SAU: dòng hỏng thì còn tệp mồ côi
 * (chấp nhận được), còn ngược lại là dòng trỏ vào tệp không có.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const CONSTRUCTION_PHOTO_BUCKET = 'construction-photos';

/** Khớp `allowed_mime_types` của bucket — sai loại thì Storage từ chối, ở đây chỉ chặn sớm. */
export const CONSTRUCTION_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export type ConstructionPhotoKind = 'nhat-ky' | 'nghiem-thu' | 'diem-danh';

/** URL ký sống một giờ — đủ cho một phiên xem. */
const SIGNED_URL_SECONDS = 3600;

function extensionOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return file.type.split('/').pop() ?? 'jpg';
}

/** Tải ảnh lên, trả về đường dẫn trong bucket theo đúng thứ tự tệp. */
export async function uploadConstructionPhotos(
  siteId: string,
  kind: ConstructionPhotoKind,
  files: File[],
): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const path = `${siteId}/${kind}/${crypto.randomUUID()}.${extensionOf(file)}`;
    const { error } = await supabase.storage
      .from(CONSTRUCTION_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (error) {
      throw new Error(
        `Không tải được ảnh «${file.name}». Kiểm tra lại mạng và dung lượng ảnh (tối đa 20 MB), rồi thử lại.`,
      );
    }
    paths.push(path);
  }
  return paths;
}

/** URL ký cho danh sách đường dẫn; đường dẫn không ký được thì bỏ qua. */
export function useSignedPhotoUrls(paths: readonly string[]) {
  return useQuery<Record<string, string>, Error>({
    queryKey: ['construction-photos', ...paths],
    queryFn: async () => {
      const { data } = await supabase.storage
        .from(CONSTRUCTION_PHOTO_BUCKET)
        .createSignedUrls([...paths], SIGNED_URL_SECONDS);
      const byPath: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) byPath[item.path] = item.signedUrl;
      }
      return byPath;
    },
    enabled: paths.length > 0,
    // Làm mới theo nửa thời hạn để ảnh không chết giữa lúc đang xem.
    staleTime: (SIGNED_URL_SECONDS / 2) * 1000,
  });
}
