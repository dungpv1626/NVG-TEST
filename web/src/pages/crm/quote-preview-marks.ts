/**
 * Bản xem trước văn bản báo giá sửa được tại chỗ (0239, anh Dũng 29/10/2026) — cùng cách của bản xem trước hợp
 * đồng (0222, `pages/hd/document-panel.tsx`): giá trị điền vào tệp XEM TRƯỚC được bọc bằng dấu ẩn (vùng ký tự
 * riêng của Unicode), dựng bằng docx-preview, rồi đổi dấu ẩn thành `<mark>`:
 *  - câu chữ sửa được (lời giới thiệu, điều kiện, thanh toán, thời gian, lời kết, người ký) → bấm để sửa;
 *  - số tiền / bảng (đơn giá, thành tiền, giảm giá, thuế, tổng) → khoá, rê chuột thấy lý do.
 * Tệp tải về / gửi khách dựng từ dữ liệu KHÔNG bọc — dấu ẩn chỉ có ở bản xem trước.
 */

import {
  QUOTE_LOCKED_KEYS,
  QUOTE_LOCKED_NOTE,
  QUOTE_TEXT_KEYS,
  QUOTE_TEXT_LABELS,
  TEMPLATE_BLANK,
  type QuoteDocumentData,
  type QuoteTextKey,
  type TemplateValue,
} from '@nvg/shared';

const EDIT_OPEN = '';
const KEY_SEP = '';
const EDIT_CLOSE = '';
const LOCK_OPEN = '';
const LOCK_CLOSE = '';
const HIDDEN = /[-]/g;

const LOCKED_CELLS = ['khoi_luong', 'don_gia', 'thanh_tien'] as const;

const wrapLines = (v: string, open: string, close: string) =>
  v
    .split('\n')
    .map((line) => (line ? open + line + close : line))
    .join('\n');

/**
 * Dữ liệu điền cho bản XEM TRƯỚC. `editable` = người xem được sửa câu chữ; không thì chỉ khoá số tiền, câu chữ
 * in thường. Ô câu chữ trống in dải chấm bấm được (để điền).
 */
export function markQuoteData(
  data: QuoteDocumentData,
  editable: boolean,
): Record<string, TemplateValue> {
  const out: Record<string, TemplateValue> = {
    ...(data as unknown as Record<string, TemplateValue>),
  };
  if (editable) {
    for (const key of QUOTE_TEXT_KEYS) {
      const v = (data[key] as string | null) ?? TEMPLATE_BLANK;
      out[key] = wrapLines(v, EDIT_OPEN + key + KEY_SEP, EDIT_CLOSE);
    }
  }
  for (const key of QUOTE_LOCKED_KEYS) {
    const v = data[key] as string | null;
    if (v) out[key] = LOCK_OPEN + v + LOCK_CLOSE;
  }
  out.hang_muc = data.hang_muc.map((row) => {
    const r: Record<string, string> = { ...row };
    for (const c of LOCKED_CELLS) if (r[c]) r[c] = LOCK_OPEN + r[c] + LOCK_CLOSE;
    return r;
  }) as unknown as TemplateValue;
  return out;
}

/** Đổi dấu ẩn trong bản xem trước đã dựng thành `<mark>`; gỡ dấu ẩn khỏi chữ. */
export function decorateQuotePreview(root: HTMLElement): void {
  const token = new RegExp(
    `${EDIT_OPEN}([a-z_]+)${KEY_SEP}([^${EDIT_CLOSE}]*)${EDIT_CLOSE}|${LOCK_OPEN}([^${LOCK_CLOSE}]*)${LOCK_CLOSE}`,
    'g',
  );
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/[-]/.test(n.nodeValue ?? '')) hits.push(n as Text);
  }
  for (const node of hits) {
    const text = node.nodeValue!;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(token)) {
      if (m.index > last) frag.append(text.slice(last, m.index).replace(HIDDEN, ''));
      const mark = document.createElement('mark');
      if (m[1] !== undefined) {
        mark.textContent = m[2]!;
        mark.dataset.quoteKey = m[1];
        mark.title = `Bấm để sửa: ${QUOTE_TEXT_LABELS[m[1] as QuoteTextKey] ?? m[1]}`;
        mark.className =
          m[2] === TEMPLATE_BLANK
            ? 'cursor-pointer bg-status-pending-bg text-fg hover:outline hover:outline-1'
            : 'cursor-pointer bg-status-progress-bg text-fg hover:outline hover:outline-1';
      } else {
        mark.textContent = m[3]!;
        mark.dataset.locked = '1';
        mark.title = QUOTE_LOCKED_NOTE;
        mark.className = 'cursor-not-allowed bg-surface-sunken text-fg';
      }
      frag.append(mark);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last).replace(HIDDEN, ''));
    node.replaceWith(frag);
  }
}
