/**
 * Nhãn CỐ ĐỊNH của phương án / mặt đứng / bộ ảnh trong dải chọn (Haan, 11/10/2026).
 *
 * Trước đây tên đánh theo vị trí trong danh sách đang hiện: xoá «Phương án 2» thì phương án thứ ba đổi tên thành
 * «Phương án 2», và dải chỉ hiện 12 bản nên bản thứ 13 trồi lên lấy tên cũ — kỹ sư tưởng xoá không ăn. Nay:
 *
 *  - bản GỐC đánh số theo thứ tự tạo trong hồ sơ, TÍNH CẢ bản đã xoá khỏi danh sách — số không bao giờ đổi;
 *  - bản SỬA (cạnh lineage từ một bản cùng loại: sửa bằng ô yêu cầu, sửa tay, sửa mặt đứng) mang số gốc + lần sửa
 *    theo thứ tự tạo trong cả nhánh của gốc ấy: 3.1, 3.2 — sửa tiếp từ 3.1 vẫn là 3.2, không thành 3.1.1.
 *
 * Thuần, không đọc CSDL: tuyến `/state` đưa danh sách và cạnh vào.
 */

export interface LabelItem {
  id: string;
  createdAt: string;
}

/** `parentOf`: bản → bản cùng loại mà nó sửa từ. Cạnh trỏ ra ngoài `items` bị bỏ qua. */
export function stableLabels(
  items: readonly LabelItem[],
  parentOf: ReadonlyMap<string, string>,
): Map<string, string> {
  const ordered = [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const known = new Set(ordered.map((item) => item.id));
  const rootOf = (id: string): string => {
    const seen = new Set<string>([id]);
    let current = id;
    for (;;) {
      const parent = parentOf.get(current);
      // Cạnh vòng không thể có với băm nội dung, nhưng một vòng lặp vô tận ở tuyến đọc thì không được phép.
      if (!parent || !known.has(parent) || seen.has(parent)) return current;
      seen.add(parent);
      current = parent;
    }
  };
  const rootNumber = new Map<string, number>();
  const revisions = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const item of ordered) {
    const root = rootOf(item.id);
    if (root === item.id) {
      rootNumber.set(item.id, rootNumber.size + 1);
      labels.set(item.id, String(rootNumber.get(item.id)));
      continue;
    }
    const n = (revisions.get(root) ?? 0) + 1;
    revisions.set(root, n);
    labels.set(item.id, `${rootNumber.get(root)}.${n}`);
  }
  return labels;
}

/**
 * Bản cùng loại mà mỗi bản sửa từ, và bản LOẠI KHÁC mà mỗi bản dựng theo (mặt đứng ← phương án, bộ ảnh ← mặt
 * đứng). Bản sửa không có cạnh sang loại kia thì thừa hưởng của bản gốc nó sửa từ.
 */
export function lineageMaps(
  edges: ReadonlyArray<{ from: string; to: string }>,
  own: ReadonlySet<string>,
  basis: ReadonlySet<string>,
): { parentOf: Map<string, string>; basisOf: Map<string, string> } {
  const parentOf = new Map<string, string>();
  const basisOf = new Map<string, string>();
  for (const { from, to } of edges) {
    if (!own.has(to)) continue;
    if (own.has(from) && from !== to && !parentOf.has(to)) parentOf.set(to, from);
    if (basis.has(from) && !basisOf.has(to)) basisOf.set(to, from);
  }
  for (const id of own) {
    if (basisOf.has(id)) continue;
    const seen = new Set<string>([id]);
    let current = parentOf.get(id);
    while (current && !seen.has(current)) {
      const found = basisOf.get(current);
      if (found) {
        basisOf.set(id, found);
        break;
      }
      seen.add(current);
      current = parentOf.get(current);
    }
  }
  return { parentOf, basisOf };
}
