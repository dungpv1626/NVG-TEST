/**
 * Nhật ký công trường bằng giọng nói (Đợt 2 — 2B): các mục máy xếp từ lời chỉ huy trưởng nói.
 *
 * Một nguồn cho Worker (lược đồ JSON gửi mô hình) và giao diện (ghép vào ô Nội dung). Mục không
 * được nhắc tới để RỖNG — không ghi «Chưa rõ», không bịa (CLAUDE.md 5.2): ô trống là chỗ người
 * ghi tự thấy còn thiếu.
 */

export const SITE_LOG_DRAFT_SECTIONS = [
  ['work_done', 'Việc đã làm'],
  ['materials', 'Vật tư'],
  ['issues', 'Vướng mắc'],
  ['safety', 'An toàn'],
] as const;

export type SiteLogDraftSection = (typeof SITE_LOG_DRAFT_SECTIONS)[number][0];

export interface SiteLogVoiceDraft extends Record<SiteLogDraftSection, string> {
  /** Số người có mặt nếu lời nói có nêu; không nêu thì `null`. */
  workforce_count: number | null;
  weather: string;
}

/**
 * Ghép các mục thành ô Nội dung, mục rỗng bỏ qua. Một ý thì «Nhãn: …» trên một dòng; nhiều ý
 * (gạch đầu dòng) thì nhãn một dòng, các ý xuống dòng dưới — đọc trên điện thoại không lẫn.
 */
export function composeSiteLogContent(draft: SiteLogVoiceDraft): string {
  return SITE_LOG_DRAFT_SECTIONS.map(([key, label]) => [label, draft[key].trim()] as const)
    .filter(([, text]) => text)
    .map(([label, text]) =>
      text.includes('\n') || text.startsWith('- ') ? `${label}:\n${text}` : `${label}: ${text}`,
    )
    .join('\n');
}

/** Chuẩn hoá đầu ra mô hình — thiếu / sai kiểu thì rỗng, quân số chỉ nhận số nguyên 0–9999. */
export function normalizeSiteLogDraft(raw: unknown): SiteLogVoiceDraft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const n = typeof o.workforce_count === 'number' ? o.workforce_count : Number.NaN;
  return {
    work_done: text(o.work_done),
    materials: text(o.materials),
    issues: text(o.issues),
    safety: text(o.safety),
    weather: text(o.weather),
    workforce_count: Number.isInteger(n) && n >= 0 && n < 10000 ? n : null,
  };
}
