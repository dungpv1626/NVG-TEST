/**
 * Ảnh và video hiện trạng của MỘT biên bản khảo sát (TK-02).
 *
 * Ba ràng buộc của bố cục di động cho hiện trường (AFD 4.8) áp thẳng vào đây:
 *  · Nút thêm ảnh nằm ngay trên biên bản, không ẩn sau menu — ảnh là chứng cứ chính.
 *  · `capture="environment"` để trên điện thoại bấm là mở camera sau, không phải duyệt thư mục.
 *  · Chọn được nhiều tệp một lần: một buổi khảo sát là 15–86 tấm (hồ sơ thật), không ai
 *    tải từng tấm.
 *
 * Xoá là xoá MỀM và chỉ khi còn sửa được dự án; không có hộp thoại `confirm` của trình duyệt
 * (chữ tiếng Anh, CLAUDE.md 4.1) — bấm xoá là ẩn ngay, ảnh vẫn còn trong CSDL.
 */

import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SITE_PHOTO_ACCEPT,
  useRemoveSurveyPhoto,
  useUploadSurveyPhotos,
  type SurveyPhotoRecord,
} from '@/hooks/use-survey-photos';

export function SurveyPhotos({
  projectId,
  companyId,
  surveyId,
  photos,
  readOnly,
}: {
  projectId: string;
  companyId: string;
  surveyId: string;
  photos: SurveyPhotoRecord[];
  readOnly: boolean;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadSurveyPhotos();
  const remove = useRemoveSurveyPhoto();

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setError(null);
    try {
      await upload.mutateAsync({ projectId, companyId, surveyId, files });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được ảnh. Thử lại sau ít phút.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg-subtle">
          Ảnh hiện trạng{photos.length > 0 ? ` (${photos.length})` : ''}
        </p>
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={SITE_PHOTO_ACCEPT}
              multiple
              capture="environment"
              className="hidden"
              data-testid={`them-anh-${surveyId}`}
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Camera className="size-4" />
              {upload.isPending ? 'Đang tải lên…' : 'Thêm ảnh hiện trạng'}
            </Button>
          </>
        )}
      </div>

      {error && <p className="mt-1 text-status-overdue">{error}</p>}

      {photos.length === 0 ? (
        <p className="mt-1 text-fg-subtle">
          Chưa có ảnh. Chụp mặt tiền, bốn phía tiếp giáp và lối vào — đó là ba thứ phương án cần
          trước tiên.
        </p>
      ) : (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="group relative overflow-hidden rounded border border-border"
            >
              {photo.mime_type.startsWith('video/') ? (
                photo.url ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption -- video hiện trạng không có lời thoại
                  <video src={photo.url} controls className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square bg-surface-sunken" />
                )
              ) : photo.url ? (
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img
                    src={photo.url}
                    alt={photo.caption ?? photo.file_name}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center bg-surface-sunken text-fg-subtle">
                  Không đọc được
                </div>
              )}
              {photo.caption && (
                <p className="truncate px-1 py-0.5 text-xs text-fg-subtle">{photo.caption}</p>
              )}
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Xoá ảnh ${photo.file_name}`}
                  className="absolute right-1 top-1 rounded bg-surface/90 p-1 text-fg-subtle hover:text-status-overdue"
                  disabled={remove.isPending}
                  onClick={() =>
                    void remove.mutateAsync({ projectId, photoId: photo.id }).catch(() => undefined)
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
