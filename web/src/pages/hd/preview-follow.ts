/**
 * Bản xem trước «chạy theo» ô đang sửa (anh Dũng 27/10/2026: «ấn vào phần nào thì preview hợp đồng phần đó cũng cần
 * nhảy theo để dễ theo dõi và biết mình đang sửa phần nào»).
 *
 * Mỗi chỗ trên bản xem trước là một `<mark data-key>` (điền được) hoặc `<mark data-src-key>` (lấy từ hồ sơ) (`markPreview` trong `document-panel.tsx`), khoá = chỗ trống của
 * mẫu. Ô bên trái khai mình in vào khoá nào: ô điền tay / chỗ trống tự do đã có `id` `manual-<khoá>` / `free-<khoá>`
 * (chiều ngược lại — bấm chỗ trên văn bản tới ô — đã dùng chúng); ô khác mang `data-preview-keys="khoá1 khoá2"`.
 * Bấm hay đặt con trỏ vào ô thì ngăn xem trước cuộn tới chỗ đầu tiên của khoá ấy và viền sáng mọi chỗ của nó.
 */

import {
  isPayableContract,
  TEMPLATE_LOOPS,
  type ContractTermType,
  type ContractType,
} from '@nvg/shared';

export const PREVIEW_KEYS_ATTR = 'data-preview-keys';
/** Dự phòng khi mẫu không in khoá nào của ô: tên phần trong văn bản (vd «Phạm vi công việc»). */
export const PREVIEW_LABEL_ATTR = 'data-preview-label';

/** Tên phần (dự phòng) của ô người dùng vừa bấm, nếu ô khai. */
export function previewLabelOf(target: Element): string | null {
  return target.closest(`[${PREVIEW_LABEL_ATTR}]`)?.getAttribute(PREVIEW_LABEL_ATTR) ?? null;
}

/** Khoá in lên văn bản của một nhóm điều khoản: bảng lặp của nhóm, nhóm Giá trị thì các ô giá trị. */
export function termPreviewKeys(type: ContractTermType): string {
  const loops = Object.entries(TEMPLATE_LOOPS)
    .filter(([, l]) => l.term === type)
    .map(([key]) => key);
  if (type === 'gia_tri')
    loops.push('gia_tri', 'gia_tri_bang_chu', 'gia_tri_truoc_thue', 'tien_thue');
  return loops.join(' ');
}

/**
 * Khoá của ô người dùng vừa bấm / đặt con trỏ; ngoài mọi ô thì rỗng. Ô của một bên (`nvg_*`, `doi_tac_*`) kèm luôn
 * khoá «bên A / bên B» tương ứng — mẫu viết theo cách nào thì bản xem trước mang khoá ấy (NVG là bên B khi nhận việc).
 */
export function previewKeysOf(target: Element, contractType: ContractType): string[] {
  for (let el: Element | null = target; el; el = el.parentElement) {
    const own = /^(?:free|manual|customer)-(.+)$/.exec(el.id)?.[1];
    const keys = own ? [own] : el.getAttribute(PREVIEW_KEYS_ATTR)?.split(/\s+/).filter(Boolean);
    if (!keys?.length) continue;
    const [nvgSide, partnerSide] = isPayableContract(contractType)
      ? ['ben_a', 'ben_b']
      : ['ben_b', 'ben_a'];
    return keys.flatMap((k) => {
      const party = /^(nvg|doi_tac)_(.+)$/.exec(k);
      return party ? [k, `${party[1] === 'nvg' ? nvgSide : partnerSide}_${party[2]}`] : [k];
    });
  }
  return [];
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight)
      return p;
  }
  return null;
}

const FLASH = ['outline', 'outline-2', 'outline-offset-1', 'outline-brand'];
let flashed: HTMLElement[] = [];
let flashTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Cuộn ngăn xem trước tới chỗ đầu tiên của các khoá và viền sáng chúng 2 giây. Chỉ cuộn chính ngăn chứa bản xem
 * trước (không `scrollIntoView` — nó kéo cả trang). Không thấy chỗ nào (mẫu không in khoá ấy, điều khoản chưa có
 * dòng) thì không làm gì. Trả về có cuộn được không.
 */
export function followPreview(
  root: HTMLElement,
  keys: readonly string[],
  label: string | null = null,
): boolean {
  if (keys.length === 0 || root.offsetParent === null) return false;
  let marks = [...root.querySelectorAll<HTMLElement>('mark[data-key], mark[data-src-key]')].filter(
    (m) => keys.includes(m.dataset.key ?? m.dataset.srcKey!),
  );
  if (marks.length === 0 && label) {
    // Mẫu không in khoá nào của ô (vd phạm vi viết thành câu chữ của mẫu): tới đoạn đầu tiên có tên phần.
    const needle = label.toLocaleLowerCase('vi');
    const para = [...root.querySelectorAll<HTMLElement>('p')].find((p) =>
      p.textContent?.toLocaleLowerCase('vi').includes(needle),
    );
    if (para) marks = [para];
  }
  if (marks.length === 0) return false;
  const first = marks[0]!;
  const box = scrollParent(first);
  if (box) {
    const offset = first.getBoundingClientRect().top - box.getBoundingClientRect().top;
    // Đặt chỗ ấy ở khoảng một phần ba trên của ngăn — thấy được cả câu đứng trước nó.
    box.scrollTo({ top: box.scrollTop + offset - box.clientHeight / 3, behavior: 'smooth' });
  }
  clearTimeout(flashTimer);
  for (const m of flashed) m.classList.remove(...FLASH);
  flashed = marks;
  for (const m of marks) m.classList.add(...FLASH);
  flashTimer = setTimeout(() => {
    for (const m of flashed) m.classList.remove(...FLASH);
    flashed = [];
  }, 2000);
  return true;
}
