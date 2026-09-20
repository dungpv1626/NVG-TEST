/**
 * Dòng "Hoạt động gần đây" của cột phải (bản mẫu §5.5d).
 *
 * ⚠️ KHÔNG đọc `audit_logs`. Bảng đó theo NEN-07 chỉ TGĐ/CFO/BGĐ/Quản trị viên đọc được
 * (CLAUDE.md 3.4), nên kiến trúc sư — người dùng chính của màn hình này — mở ra sẽ thấy một
 * panel rỗng vĩnh viễn, và không có gì báo cho biết vì sao.
 *
 * Thay vào đó ghép từ chính những bản ghi kiến trúc sư đã đọc được ở các tab khác: phiên bản
 * bản vẽ đã phát hành, yêu cầu thay đổi, đầu bài, và phương án mặt bằng AI Design đã lưu. Bốn nguồn này đã có
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
  tone: 'brief' | 'plan' | 'version' | 'change';
}

export interface ActivityInput {
  briefs: {
    id: string;
    version: number;
    created_at: string;
    author: { full_name: string } | null;
  }[];
  aiPlans: { artifactId: string; createdAt: string }[];
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
  for (const p of input.aiPlans) {
    items.push({
      id: `plan-${p.artifactId}`,
      text: 'Lưu một phương án mặt bằng',
      // Phương án do AI dựng, không gắn với một người — nói đúng như vậy.
      meta: stamp('AI Design', p.createdAt, formatWhen),
      at: p.createdAt,
      tone: 'plan',
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
