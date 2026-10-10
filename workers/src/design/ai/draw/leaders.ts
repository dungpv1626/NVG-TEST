/**
 * Ghi chú dẫn trên mặt đứng — «PHÀO CHỈ 100×50 (MM)», «LAN CAN …», «ỐP ĐÁ …» (T147).
 *
 * Khuôn đo trên tờ KT07-08 của M5: chữ 2 mm in hoa nằm trên một nét ngang ngắn, một nét dẫn đi từ
 * nét ngang ấy tới đúng chi tiết, không mũi tên. Ở đây chữ đứng thành CỘT sát hai mép hình (trái và
 * phải), xếp theo cao độ của chi tiết, đẩy nhau xuống cho khỏi chồng — vị trí là việc của chương
 * trình, không ai phải kéo tay từng dòng.
 *
 * Nội dung ghi chú sinh từ `kb/` và danh mục vật liệu, nhưng vẫn đi qua `textEl` (thoát ký tự) như
 * mọi chữ khác trên tờ.
 */

import type { FacadeDetail } from '../../kb/facade-detail';
import type { Pt, Rect } from './geometry';
import { CLS, polylinePath, tag, textEl } from './svg';
import type { SheetStyle } from './style';
import type { Paper } from './units';

export interface LeaderNote {
  text: string;
  /** Điểm chi tiết được chỉ vào, cm thật. */
  anchor: Pt;
}

/** Tỷ lệ bề rộng một ký tự trên cỡ chữ — ước để chừa chỗ, không phải đo chữ. */
const CHAR_WIDTH_SHARE = 0.56;
/** Khe giữa mép hình và đầu nét ngang mang chữ, mm giấy. */
const EDGE_GAP_MM = 2;

/** Bỏ ghi chú trùng chữ, giữ cái gặp trước. */
export function dedupeNotes(notes: readonly LeaderNote[]): LeaderNote[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    const key = note.text.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ngắt dòng theo từ, không quá `max` ký tự mỗi dòng (từ dài hơn thì đứng riêng một dòng). */
export function wrapNote(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= max) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Ghi chú nào về bên trái, ghi chú nào về bên phải — theo điểm được chỉ, nửa nào gần hơn. */
export function splitSides(
  notes: readonly LeaderNote[],
  bbox: Rect,
): { left: LeaderNote[]; right: LeaderNote[] } {
  const mid = (bbox.x0 + bbox.x1) / 2;
  return {
    left: notes.filter((n) => n.anchor[0] < mid),
    right: notes.filter((n) => n.anchor[0] >= mid),
  };
}

/** Bề rộng cột ghi chú một bên, mm giấy (0 khi bên ấy không có ghi chú). */
export function notesBandMm(count: number, detail: FacadeDetail): number {
  return count > 0 ? detail.notes.column + EDGE_GAP_MM : 0;
}

interface Placed {
  lines: string[];
  anchor: [number, number];
  /** y giấy của nét ngang mang chữ. */
  y: number;
  height: number;
}

/**
 * Vẽ ghi chú một bên. `edge` là toạ độ x giấy của mép hình phía ấy; `yRange` là khoảng y giấy được
 * phép đặt chữ (đỉnh hình → cốt đất).
 */
export function renderLeaders(
  notes: readonly LeaderNote[],
  side: 'left' | 'right',
  edge: number,
  yRange: [number, number],
  paper: Paper,
  style: SheetStyle,
  detail: FacadeDetail,
): string {
  if (notes.length === 0) return '';
  const size = style.text_mm.note;
  const lineH = size + detail.notes.lineGap;
  const placed: Placed[] = notes
    .map((note) => {
      const raw = detail.notes.uppercase ? note.text.toLocaleUpperCase('vi-VN') : note.text;
      const lines = wrapNote(raw, detail.notes.maxCharsPerLine);
      const anchor = paper.p(note.anchor);
      return { lines, anchor, y: anchor[1], height: lines.length * lineH };
    })
    .sort((a, b) => a.anchor[1] - b.anchor[1]);

  // Đẩy xuống cho khỏi chồng: nét ngang của ghi chú sau phải thấp hơn ghi chú trước ít nhất bằng
  // chiều cao chữ của chính nó, và không gần hơn `min_spacing_mm`.
  const [top, bottom] = yRange;
  let cursor = top;
  for (const p of placed) {
    const want = Math.max(p.y, cursor + p.height);
    p.y = want;
    cursor = want + Math.max(detail.notes.minSpacing - p.height, 0) + detail.notes.lineGap;
  }
  // Tràn đáy thì dồn ngược lên, từ dưới.
  let floor = bottom;
  for (let i = placed.length - 1; i >= 0; i -= 1) {
    const p = placed[i]!;
    if (p.y > floor) p.y = floor;
    floor = p.y - p.height - detail.notes.lineGap;
  }

  const out: string[] = [];
  const paths: string[] = [];
  for (const p of placed) {
    const widest = Math.max(...p.lines.map((l) => l.length)) * size * CHAR_WIDTH_SHARE;
    const near = side === 'left' ? edge - EDGE_GAP_MM : edge + EDGE_GAP_MM;
    const far =
      side === 'left'
        ? near - Math.max(widest, detail.notes.landing)
        : near + Math.max(widest, detail.notes.landing);
    // Nét ngang mang chữ, rồi nét dẫn từ đầu gần hình tới chi tiết.
    paths.push(polylinePath([[far, p.y], [near, p.y], p.anchor], false));
    p.lines.forEach((line, index) => {
      out.push(
        textEl(line, {
          x: near,
          y: p.y - detail.notes.lineGap / 2 - (p.lines.length - 1 - index) * lineH,
          class: side === 'left' ? CLS.textNoteDrawEnd : CLS.textNoteDraw,
        }),
      );
    });
  }
  return [tag('path', { class: CLS.leader, d: paths.join(' ') }), ...out].join('');
}
