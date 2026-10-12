/**
 * Tên hiển thị của phương án / bản mặt đứng / bộ ảnh: «Phương án 1», «Phương án 2»… (Haan,
 * 07/10/2026) thay mã `AI-A` hay đoạn băm artifact.
 *
 * Từ 11/10/2026 số là nhãn CỐ ĐỊNH máy chủ đánh (`label`: «3», «3.1» — `workers/src/design/ai/variant-labels.ts`):
 * đếm trên cả lịch sử hồ sơ, tính cả bản đã xoá khỏi dải, nên xoá một bản không làm bản khác đổi tên (Haan: «sau khi
 * xoá 1 phương án thì phải re-load lại web thì phương án đó mới biến mất» — thật ra bản sau đã lấy tên bản vừa xoá).
 * Máy chủ cũ không trả nhãn thì lùi về đếm theo thứ tự TẠO trong danh sách đang hiện.
 */
export function numberedNames(
  items: ReadonlyArray<{ artifactId: string; createdAt: string; label?: string | null }>,
  prefix: string,
): Map<string, string> {
  const ordered = [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.artifactId.localeCompare(b.artifactId),
  );
  return new Map(
    ordered.map((item, index) => [item.artifactId, `${prefix} ${item.label ?? index + 1}`]),
  );
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
