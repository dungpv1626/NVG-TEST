/**
 * Chụp / chọn ảnh hiện trường — nút lớn, mở thẳng camera sau trên điện thoại.
 *
 * AFD 4.8: nút chụp ảnh KHÔNG BAO GIỜ nằm sau menu. Ảnh chưa gửi hiện thành hàng ảnh nhỏ, bỏ
 * được từng ảnh trước khi lưu. Tệp chỉ tải lên khi bấm Lưu — mở ra rồi bỏ thì không để lại gì.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONSTRUCTION_PHOTO_ACCEPT, useSignedPhotoUrls } from '@/hooks/use-site-photos';

export function SitePhotoPicker({
  files,
  onChange,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={CONSTRUCTION_PHOTO_ACCEPT}
        capture="environment"
        multiple
        hidden
        data-testid="chon-anh-hien-truong"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length > 0) onChange([...files, ...picked]);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Camera aria-hidden />
        Chụp ảnh hiện trường
      </Button>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Ảnh sẽ gửi kèm">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="relative">
              <img
                src={previews[i]}
                alt={`Ảnh ${i + 1}: ${file.name}`}
                className="size-20 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                aria-label={`Bỏ ảnh ${i + 1}`}
                className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border border-border bg-surface shadow-card"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Hàng ảnh đã lưu — bấm mở ảnh cỡ đầy đủ ở thẻ mới. */
export function PhotoStrip({ paths }: { paths: readonly string[] }) {
  const { data: urls } = useSignedPhotoUrls(paths);
  if (paths.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Ảnh hiện trường">
      {paths.map((path, i) => {
        const url = urls?.[path];
        return (
          <li key={path}>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={`Ảnh hiện trường ${i + 1}`}
                  loading="lazy"
                  className="size-20 rounded-md border border-border object-cover"
                />
              </a>
            ) : (
              <div className="size-20 animate-pulse rounded-md bg-surface-hover" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
