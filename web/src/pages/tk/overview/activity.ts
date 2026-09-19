/**
 * Dòng "Hoạt động gần đây" của cột phải (bản mẫu §5.5d).
 *
 * ⚠️ KHÔNG đọc `audit_logs`. Bảng đó theo NEN-07 chỉ TGĐ/CFO/BGĐ/Quản trị viên đọc được
 * (CLAUDE.md 3.4), nên kiến trúc sư — người dùng chính của màn hình này — mở ra sẽ thấy một
 * panel rỗng vĩnh viễn, và không có gì báo cho biết vì sao.
 *
 * Thay vào đó ghép từ chính những bản ghi kiến trúc sư đã đọc được ở các tab khác: phiên bản
 * bản vẽ đã phát hành, yêu cầu thay đổi, đầu bài, và đợt sinh phương án. Bốn nguồn này đã có
 * trong bộ nhớ đệm khi mở màn hình, nên panel không tốn thêm lượt gọi nào.
 *
 * Hàm thuần để kiểm thử được: không hook, không ngày giờ hiện tại.
 */

export interface ActivityItem {
  id: string;
  /** Việc gì đã xảy ra, viết như một câu hoàn chỉnh. */
  text: string;
  /** Ai làm và lúc nào. Không rõ người thì bỏ vế đó, không ghi "Không rõ". */
  meta: string;
  at: string;
  tone: 'brief' | 'variant' | 'version' | 'change';
}

export interface ActivityInput {
  briefs: {
    id: string;
    version: number;
    created_at: string;
    author: { full_name: string } | null;
  }[];
  generations: { programArtifactId: string; createdAt: string; count: number }[];
  versions: {
    id: string;
    title: string;
    published_at: string | null;
    publisher: { full_name: string } | null;
  }[];
  changes: {
    id: string;
    title: string;
    requested_at: string;
    requester_name: string | null;
    requester: { full_name: string } | null;
  }[];
}

function stamp(who: string | null, at: string, format: (v: string) => string): string {
  return who ? `${who} · ${format(at)}` : format(at);
}

export function recentActivity(
  input: ActivityInput,
  formatWhen: (value: string) => string,
  limit = 4,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const b of input.briefs) {
    items.push({
      id: `brief-${b.id}`,
      text: `Lập đầu bài phiên bản ${b.version}`,
      meta: stamp(b.author?.full_name ?? null, b.created_at, formatWhen),
      at: b.created_at,
      tone: 'brief',
    });
  }
  for (const g of input.generations) {
    items.push({
      id: `gen-${g.programArtifactId}`,
      text: `Sinh ${g.count} phương án kiến trúc từ chương trình không gian`,
      // Đợt sinh là việc của hệ thống, không gắn với một người — nói đúng như vậy.
      meta: stamp('Bộ giải mặt bằng', g.createdAt, formatWhen),
      at: g.createdAt,
      tone: 'variant',
    });
  }
  for (const v of input.versions) {
    if (!v.published_at) continue;
    items.push({
      id: `version-${v.id}`,
      text: `Phát hành ${v.title}`,
      meta: stamp(v.publisher?.full_name ?? null, v.published_at, formatWhen),
      at: v.published_at,
      tone: 'version',
    });
  }
  for (const c of input.changes) {
    items.push({
      id: `change-${c.id}`,
      text: `Ghi nhận yêu cầu thay đổi: ${c.title}`,
      meta: stamp(c.requester_name ?? c.requester?.full_name ?? null, c.requested_at, formatWhen),
      at: c.requested_at,
      tone: 'change',
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
