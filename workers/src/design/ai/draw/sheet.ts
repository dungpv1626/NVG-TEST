/**
 * Khung tờ giấy: khung bản vẽ, khung tên, dòng tên bản vẽ và ghi chú chân tờ.
 *
 * ── Hình dạng lấy từ hồ sơ thật, nội dung thì không ────────────────────────────────────
 * Đo ngày 10/09/2026 trên HS-01 (tập kiến trúc, 54 tờ A3): NVG đặt khung tên thành một CỘT
 * ĐỨNG sát mép phải, cao hết khung bản vẽ; tên bản vẽ in đậm căn giữa NGAY DƯỚI hình; chân tờ
 * có một dòng ghi chú nhỏ. Bản trước của tệp này dựng một dải ngang dưới đáy — đó là lý do tờ
 * vẽ nhìn không ra bản vẽ kiến trúc.
 *
 * ⚠️ CỐ Ý chỉ mượn hình dạng. Khung tên thật mang chủ đầu tư, địa chỉ công trình, tên và chữ ký
 * năm người — dữ liệu hạng 1 (`kb/title_block.yaml` liệt kê đủ). Tờ này sẽ được rasterise thành
 * ảnh tham chiếu và gửi cho nhà cung cấp mô hình ảnh ở bước phối cảnh, nên nó không được mang
 * một chữ nào nhận ra được khách hàng hay hồ sơ (T12, CLAUDE.md 5.1).
 *
 * Vì thế khung tên ở đây chỉ có: câu cảnh báo bắt buộc, tên tầng, tỷ lệ, đơn vị đo, và ghi chú
 * của bộ vẽ. Không tên người, không mã hồ sơ, không ngày.
 */

import { AI_DISCLAIMERS } from '@nvg/shared/design';
import type { Rect } from './geometry';
import { CLS, el, num, sheetCss, tag, textEl } from './svg';
import type { Orientation, SheetStyle } from './style';
import { paperSize, type DrawArea } from './units';

/** Ghi chú chân tờ — nguyên văn dòng in ở chân mọi tờ mặt bằng của NVG. */
const FOOTER_NOTE = 'Kiểm tra kích thước thực tế trước khi thi công.';

export interface TitleBlockContent {
  /** Tên tầng, nguyên văn mô hình khai — được escape khi đặt lên tờ vẽ. */
  levelName: string;
  scale: number;
}

/** Bọc toàn bộ nội dung vào một tài liệu SVG hoàn chỉnh, kèm nền giấy. */
export function svgDocument(style: SheetStyle, orientation: Orientation, body: string): string {
  const { width, height } = paperSize(style, orientation);
  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(width)} ${num(height)}`,
      width: `${num(width)}mm`,
      height: `${num(height)}mm`,
    },
    [
      el('style', {}, sheetCss(style)),
      tag('rect', { x: 0, y: 0, width, height, fill: style.colour.paper }),
      body,
    ],
  );
}

export function renderFrame(area: DrawArea): string {
  return tag('rect', {
    x: area.frame.x0,
    y: area.frame.y0,
    width: area.frame.x1 - area.frame.x0,
    height: area.frame.y1 - area.frame.y0,
    class: CLS.frame,
  });
}

/**
 * Khung tên — cột đứng bên phải, chia thành các ô có nhãn nhỏ in trên giá trị.
 *
 * Ô đầu tiên là CÂU CẢNH BÁO, không phải tên công trình: người cầm tờ giấy phải đọc được ngay
 * rằng đây là đề xuất của máy. Đặt nó xuống cuối cột là đặt nó vào chỗ không ai nhìn.
 */
export function renderTitleBlock(
  area: DrawArea,
  style: SheetStyle,
  content: TitleBlockContent,
): string {
  const block = area.block;
  const pad = style.title_block.pad_mm;
  const rowH = style.title_block.row_h_mm;

  const cells: Array<{ label: string; value: string; big?: boolean }> = [
    { label: 'Tên bản vẽ', value: content.levelName, big: true },
    { label: 'Hạng mục', value: 'Kiến trúc — mặt bằng công năng' },
    { label: 'Tỷ lệ', value: `1:${content.scale}` },
    { label: 'Đơn vị', value: 'Kích thước ghi bằng mi-li-mét' },
  ];

  const out: string[] = [
    tag('rect', {
      x: block.x0,
      y: block.y0,
      width: block.x1 - block.x0,
      height: block.y1 - block.y0,
      class: CLS.frame,
    }),
  ];

  let y = block.y0;
  for (const cell of cells) {
    const lines = wrap(cell.value, cell.big ? 20 : 28);
    const height = Math.max(rowH, pad * 2 + style.text_mm.block_label + lines.length * rowH * 0.5);
    if (y + height > block.y1) break;
    out.push(
      textEl(cell.label.toUpperCase(), {
        x: block.x0 + pad,
        y: y + pad + style.text_mm.block_label * 0.6,
        class: CLS.textBlockLabel,
      }),
    );
    for (const [index, line] of lines.entries()) {
      out.push(
        textEl(line, {
          x: block.x0 + pad,
          y:
            y +
            pad +
            style.text_mm.block_label +
            (cell.big ? style.text_mm.level_name : style.text_mm.strip_note) * (0.9 + index * 1.2),
          class: cell.big ? CLS.textLevel : CLS.textNote,
        }),
      );
    }
    y += height;
    out.push(rule(block.x0, y, block.x1));
  }

  return out.join('');
}

/** Tên bản vẽ, in đậm và căn giữa ngay dưới hình — đúng chỗ hồ sơ thật đặt nó. */
export function renderSheetTitle(area: DrawArea, style: SheetStyle, levelName: string): string {
  const band: Rect = area.titleBand;
  const y = band.y0 + style.sheet_title.gap_mm * 0.5 + style.text_mm.sheet_title / 2;
  return textEl(`Mặt bằng công năng — ${levelName}`, {
    x: (band.x0 + band.x1) / 2,
    y,
    class: CLS.textSheetTitle,
  });
}

/**
 * Cảnh báo bắt buộc và ghi chú, in ở chân tờ theo suốt bề rộng.
 *
 * ⚠️ Câu cảnh báo phải nằm TRỌN trong một thẻ `<text>`, không ngắt dòng. Bản đầu đặt nó trong
 * cột khung tên rộng 55 mm nên nó bị ngắt làm hai — câu vẫn hiện trên giấy, nhưng không còn
 * tìm được nguyên vẹn trong tệp, và phép thử canh nhãn bắt buộc (CLAUDE.md 8.7) mất chỗ bám.
 * Một nhãn không kiểm được bằng máy là một nhãn sẽ biến mất vào một ngày nào đó.
 *
 * Chỗ này cũng đúng hơn về trình bày: câu cảnh báo là thứ người cầm tờ giấy phải đọc trước,
 * và một dòng chạy hết bề ngang đọc dễ hơn hai dòng nhét trong cột hẹp.
 */
export function renderFooter(area: DrawArea, style: SheetStyle, notes: readonly string[]): string {
  const lines: Array<{ text: string; className: string }> = [
    { text: AI_DISCLAIMERS.aiSheet, className: CLS.textDisclaimer },
    ...notes.map((note) => ({ text: note, className: CLS.textNote })),
  ];
  const out = lines.map((line, index) =>
    textEl(line.text, {
      x: area.content.x0,
      y: area.titleBand.y0 + style.text_mm.disclaimer * (0.9 + index * 1.35),
      class: line.className,
    }),
  );
  out.push(
    textEl(FOOTER_NOTE, {
      x: area.frame.x0,
      y: area.frame.y1 + style.text_mm.footer * 1.6,
      class: CLS.textFooter,
    }),
  );
  return out.join('');
}

function rule(x0: number, y: number, x1: number): string {
  return tag('path', {
    class: CLS.titleRule,
    d: `M ${num(x0)} ${num(y)} L ${num(x1)} ${num(y)}`,
  });
}

/**
 * Ngắt dòng theo số ký tự — đủ cho một cột khung tên hẹp.
 *
 * Không đo chữ thật: Worker không có công cụ đo, và một khung tên rộng 55 mm chỉ cần biết
 * "khoảng bao nhiêu ký tự một dòng". Từ dài hơn một dòng thì để tràn còn hơn cắt giữa từ.
 */
function wrap(text: string, perLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > perLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}
