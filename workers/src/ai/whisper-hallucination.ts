/**
 * Câu Whisper tự bịa khi KHÔNG nghe ra lời — gặp thật 18/10/2026 trên máy chủ dự án.
 *
 * Mô hình học từ phụ đề YouTube, nên gặp tiếng ồn / micro chọn nhầm nó «nghe» ra câu kết video:
 * «Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn», «… kênh La La
 * School …». `vad_filter` chặn được đoạn im lặng, nhưng đoạn có tiếng ồn đều (quạt, máy lạnh,
 * micro thu kém) vẫn lọt. Lưu câu đó làm bản chép chữ là đưa chữ bịa vào báo cáo gửi Ban Giám
 * đốc — nên lọc ở đây và báo «không nghe rõ».
 *
 * Gỡ các câu mẫu khỏi bản chép; phần còn lại không còn chữ nào thì coi cả đoạn là bịa. Đoạn có
 * lời thật xen một câu bịa thì giữ phần lời thật.
 */

const PATTERNS: readonly RegExp[] = [
  /h[ãa]y\s+(?:subscribe|đăng\s+k[ýí])[^.!?\n]*/giu,
  /để\s+không\s+bỏ\s+lỡ\s+những\s+video[^.!?\n]*/giu,
  /(?:cảm|cám)\s+ơn\s+(?:các\s+bạn\s+)?đã\s+(?:theo\s+dõi|xem|lắng\s+nghe)[^.!?\n]*/giu,
  /hẹn\s+gặp\s+lại\s+(?:các\s+bạn\s+)?trong\s+(?:những\s+)?video[^.!?\n]*/giu,
  /(?:nhấn|bấm)\s+(?:like|thích|chuông)[^.!?\n]*/giu,
  /ghiền\s+mì\s+gõ/giu,
  /la\s+la\s+school/giu,
  /\bsubscribe\b[^.!?\n]*/giu,
];

/** Bản chép sau khi gỡ câu bịa; chuỗi rỗng = cả đoạn là bịa / không có lời. */
export function stripWhisperHallucinations(transcript: string): string {
  let rest = transcript;
  for (const re of PATTERNS) rest = rest.replace(re, ' ');
  rest = rest.replace(/\s+/g, ' ').trim();
  // Chỉ còn dấu câu / vài ký tự rời thì không phải lời nói.
  const letters = rest.replace(/[^\p{L}\p{N}]/gu, '');
  return letters.length < 3 ? '' : rest;
}
