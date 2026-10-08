/**
 * Dòng "Hoạt động gần đây" của cột phải (bản mẫu §5.5d).
 *
 * ⚠️ KHÔNG đọc `audit_logs`. Bảng đó theo NEN-07 chỉ TGĐ/CFO/BGĐ/Quản trị viên đọc được
 * (CLAUDE.md 3.4), nên kiến trúc sư — người dùng chính của màn hình này — mở ra sẽ thấy một
 * panel rỗng vĩnh viễn, và không có gì báo cho biết vì sao.
 *
 * Thay vào đó ghép từ chính những bản ghi kiến trúc sư đã đọc được ở các tab khác: phiên bản
 * bản vẽ đã phát hành, yêu cầu thay đổi và đầu bài. Ba nguồn này đã có trong bộ nhớ đệm khi mở
 * màn hình, nên panel không tốn thêm lượt gọi nào.
 *
 * Bản phác của AI Design KHÔNG vào đây (Haan, 07/10/2026): AI Design là công cụ hỗ trợ độc lập,
 * bản phác của nó không phải hoạt động của hồ sơ thiết kế.
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
  tone: 'brief' | 'version' | 'change' | 'review' | 'rfi' | 'milestone';
}

export interface ActivityInput {
  briefs: {
    id: string;
    version: number;
    created_at: string;
    author: { full_name: string } | null;
  }[];
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
  /** Góp ý / duyệt của khách và nội bộ trên bản vẽ (TK-03). Chỉ tab Lịch sử truyền vào. */
  reviews?: {
    id: string;
    decisionLabel: string;
    versionTitle: string;
    reviewer: string | null;
    reviewed_at: string;
  }[];
  /** Yêu cầu làm rõ của công trường: lúc gửi và lúc trả lời (TK-08, 0154). */
  rfis?: {
    id: string;
    code: string;
    title: string;
    created_at: string;
    requester: string | null;
    answered_at: string | null;
    answerer: string | null;
  }[];
  /** Mốc của chính hồ sơ: tạo, bàn giao. */
  milestones?: { id: string; text: string; at: string }[];
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

  for (const v of input.reviews ?? []) {
    items.push({
      id: `review-${v.id}`,
      text: `${v.decisionLabel}: ${v.versionTitle}`,
      meta: stamp(v.reviewer, v.reviewed_at, formatWhen),
      at: v.reviewed_at,
      tone: 'review',
    });
  }
  for (const q of input.rfis ?? []) {
    items.push({
      id: `rfi-${q.id}`,
      text: `Công trường gửi yêu cầu làm rõ ${q.code}: ${q.title}`,
      meta: stamp(q.requester, q.created_at, formatWhen),
      at: q.created_at,
      tone: 'rfi',
    });
    if (q.answered_at) {
      items.push({
        id: `rfi-answer-${q.id}`,
        text: `Trả lời yêu cầu làm rõ ${q.code}`,
        meta: stamp(q.answerer, q.answered_at, formatWhen),
        at: q.answered_at,
        tone: 'rfi',
      });
    }
  }
  for (const m of input.milestones ?? []) {
    items.push({
      id: `milestone-${m.id}`,
      text: m.text,
      meta: formatWhen(m.at),
      at: m.at,
      tone: 'milestone',
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
