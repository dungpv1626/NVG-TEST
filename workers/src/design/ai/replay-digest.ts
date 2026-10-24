/**
 * Đối chiếu đầu bài của hồ sơ với đầu bài của lượt ghi trước khi phát lại (T170).
 *
 * Phát lại một câu trả lời trên một đầu bài KHÁC là bịa phương án — nên tuyến phát lại chỉ chạy khi hai
 * đầu bài trùng nhau. «Trùng» theo NGHĨA, không theo từng byte: đầu bài lược danh tính (`anonymiseForAi`)
 * thêm trường theo thời gian, nên một lượt ghi cũ thiếu khoá mà bản bây giờ có khoá ấy bằng `null`; và
 * một danh sách rỗng là «không có gì» giống `null`. Hai loại ấy không mang thông tin nên coi như nhau.
 * Mọi thứ khác phải khớp đúng — kể cả thứ tự phần tử mảng.
 */

/** Dạng chuẩn để so: vắng / `null` / mảng rỗng → `null`, khoá mang `null` bị bỏ, đệ quy. */
export function normaliseDigest(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.length ? value.map(normaliseDigest) : null;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = normaliseDigest((value as Record<string, unknown>)[key]);
      if (item !== null) out[key] = item;
    }
    return out;
  }
  return value;
}

/** Đường dẫn chỗ khác nhau SAU khi chuẩn hoá — rỗng = hai đầu bài như nhau. Tối đa `limit` dòng. */
export function digestDifferences(recorded: unknown, current: unknown, limit = 40): string[] {
  const paths: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (paths.length >= limit) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) paths.push(path || '(gốc)');
      else a.forEach((item, i) => walk(item, b[i], `${path}[${i}]`));
      return;
    }
    const objA = a !== null && typeof a === 'object' && !Array.isArray(a);
    const objB = b !== null && typeof b === 'object' && !Array.isArray(b);
    if (objA && objB) {
      const ra = a as Record<string, unknown>;
      const rb = b as Record<string, unknown>;
      for (const key of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) {
        walk(ra[key], rb[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    if (a !== b) paths.push(path || '(gốc)');
  };
  walk(normaliseDigest(recorded), normaliseDigest(current), '');
  return paths;
}
