/**
 * Mẫu lời nhắn gửi khách (migration 0239): Zalo và email, theo pháp nhân. Ban Giám đốc / Quản trị sửa mẫu ở
 * trang «Mẫu lời nhắn»; khi gửi, người gửi thấy lời đã điền và sửa được cho riêng lần gửi đó.
 *
 * Chưa có dòng trong `message_templates` thì dùng mẫu mặc định dưới đây. Văn phong theo CGD 4.4: không đại từ
 * nhân xưng, không IN HOA nhấn mạnh, không chấm than.
 */

export type MessageChannel = 'zalo' | 'email';

/** Chỗ trống của lời nhắn báo giá và ý nghĩa — trang sửa mẫu in danh sách này. */
export const QUOTE_MESSAGE_PLACEHOLDERS = [
  { key: 'ten_khach', label: 'Tên khách hàng (không có thì «Quý khách»)' },
  { key: 'ma_bao_gia', label: 'Mã báo giá' },
  { key: 'gia_tri', label: 'Tổng giá trị báo giá' },
  { key: 'hieu_luc', label: 'Ngày hết hiệu lực' },
  { key: 'nguoi_gui', label: 'Họ tên người gửi' },
  { key: 'sdt_nguoi_gui', label: 'Điện thoại người gửi' },
  { key: 'phap_nhan', label: 'Tên pháp nhân gửi' },
  { key: 'ten_cong_trinh', label: 'Tên cơ hội / công trình' },
] as const;

export type QuoteMessageKey = (typeof QUOTE_MESSAGE_PLACEHOLDERS)[number]['key'];
export type QuoteMessageValues = Partial<Record<QuoteMessageKey, string | null | undefined>>;

export interface MessageTemplate {
  /** Chỉ email có tiêu đề. */
  subject: string | null;
  body: string;
}

export const DEFAULT_QUOTE_MESSAGE_TEMPLATES: Readonly<Record<MessageChannel, MessageTemplate>> = {
  zalo: {
    subject: null,
    body: [
      'Kính gửi {ten_khach},',
      '{phap_nhan} trân trọng gửi báo giá số {ma_bao_gia}, tổng giá trị {gia_tri}, có hiệu lực đến hết ngày {hieu_luc}.',
      'Bản báo giá chi tiết (PDF) gửi kèm tin nhắn này. Cần làm rõ hạng mục, đơn giá hay tiến độ, xin liên hệ {nguoi_gui} — {sdt_nguoi_gui}.',
      'Trân trọng cảm ơn Quý khách đã quan tâm.',
    ].join('\n'),
  },
  email: {
    subject: '{phap_nhan} — Báo giá số {ma_bao_gia}',
    body: [
      'Kính gửi {ten_khach},',
      '',
      '{phap_nhan} xin chân thành cảm ơn Quý khách đã quan tâm và tạo điều kiện để khảo sát, tư vấn cho công trình.',
      '',
      'Trên cơ sở trao đổi và khảo sát thực tế, {phap_nhan} trân trọng gửi báo giá số {ma_bao_gia}:',
      '  - Tổng giá trị: {gia_tri}',
      '  - Hiệu lực báo giá: đến hết ngày {hieu_luc}',
      '',
      'Bản báo giá chi tiết (hạng mục, khối lượng, đơn giá, phạm vi và điều kiện) đính kèm thư này dưới dạng PDF.',
      '',
      'Cần làm rõ hoặc điều chỉnh nội dung, xin liên hệ {nguoi_gui} — điện thoại {sdt_nguoi_gui}, hoặc trả lời trực tiếp thư này.',
      '',
      'Rất mong sớm nhận được phản hồi của Quý khách.',
      '',
      'Trân trọng,',
      '{nguoi_gui}',
      '{phap_nhan}',
    ].join('\n'),
  },
};

/** Ô không có dữ liệu in dải chấm — người gửi thấy và sửa trước khi gửi, không bịa (CLAUDE.md 5.2). */
export const MESSAGE_BLANK = '……';

const TAG = /\{([a-z_]+)\}/g;
const KNOWN = new Set<string>(QUOTE_MESSAGE_PLACEHOLDERS.map((p) => p.key));

/** Chỗ trống lạ trong một mẫu (gõ sai tên) — trang sửa mẫu báo ngay. */
export function unknownMessagePlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TAG)) if (!KNOWN.has(m[1]!)) out.add(m[1]!);
  return [...out];
}

export interface FilledMessage {
  text: string;
  /** Chỗ trống có trong mẫu mà chưa có dữ liệu. */
  missing: QuoteMessageKey[];
}

/** Điền mẫu. Tên khách thiếu → «Quý khách»; chỗ khác thiếu → dải chấm và liệt kê ra. Chỗ lạ giữ nguyên. */
export function fillMessageTemplate(template: string, values: QuoteMessageValues): FilledMessage {
  const missing = new Set<QuoteMessageKey>();
  const text = template.replace(TAG, (whole, key: string) => {
    if (!KNOWN.has(key)) return whole;
    const v = values[key as QuoteMessageKey]?.trim();
    if (v) return v;
    if (key === 'ten_khach') return 'Quý khách';
    missing.add(key as QuoteMessageKey);
    return MESSAGE_BLANK;
  });
  return { text, missing: [...missing] };
}

/** Mẫu đang hiệu lực: dòng đã lưu của pháp nhân, không có thì mặc định. */
export function effectiveMessageTemplate(
  channel: MessageChannel,
  saved: { email_subject: string | null; body: string } | null | undefined,
): MessageTemplate {
  if (!saved) return DEFAULT_QUOTE_MESSAGE_TEMPLATES[channel];
  return { subject: channel === 'email' ? saved.email_subject : null, body: saved.body };
}

/** Địa chỉ email đủ dạng để gửi — kiểm thô, máy chủ email kiểm lại. */
export function isEmailAddress(value: string | null | undefined): boolean {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test((value ?? '').trim());
}
