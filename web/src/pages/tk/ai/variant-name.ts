/**
 * Tên hiển thị của phương án / bản mặt đứng / bộ ảnh: «Phương án 1», «Phương án 2»… (Haan,
 * 07/10/2026) thay mã `AI-A` hay đoạn băm artifact.
 *
 * Số đếm theo thứ tự TẠO (cũ nhất là 1), không theo thứ tự hiện — danh sách từ máy chủ có chỗ mới
 * nhất trước, có chỗ không, mà tên thì phải giữ nguyên khi có bản mới chen vào. Artifact bất biến
 * nên tên chỉ sống ở giao diện; không ghi gì vào dữ liệu.
 */
export function numberedNames(
  items: ReadonlyArray<{ artifactId: string; createdAt: string }>,
  prefix: string,
): Map<string, string> {
  const ordered = [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.artifactId.localeCompare(b.artifactId),
  );
  return new Map(ordered.map((item, index) => [item.artifactId, `${prefix} ${index + 1}`]));
}

/** Tên tệp tải về theo tên hiển thị: «Phương án 2» → `phuong-an-2`. */
export function fileSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
