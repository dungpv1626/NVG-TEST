/**
 * Chữ trong phòng: tên và diện tích.
 *
 * Nhãn lấy theo thứ tự: `label` mô hình khai (khi kiến trúc sư cần tên riêng — «Phòng ngủ ông
 * bà») → nhãn tiếng Việt của mã phòng ở `kb/room_vocabulary.yaml` → chính mã phòng. Không bao
 * giờ để trống: một chữ nhật không tên trên mặt bằng là một câu hỏi cho người đọc.
 *
 * ⚠️ `label` do MÔ HÌNH sinh — nội dung không tin được. Nó đi qua `textEl`, nơi escape XML.
 *
 * Chữ CO lại cho vừa phòng, và dưới ngưỡng đọc được thì bỏ hẳn (`text_min_mm`). Một dòng chữ
 * 1 mm vừa không đọc được vừa che mất nét tường — tệ hơn là không có chữ, vì người đọc tưởng
 * mình đọc được nếu ghé sát.
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import { rectCentre, rectHeight, rectWidth, toRect } from './geometry';
import { DrawNotes } from './notes';
import { CLS, num, tag, textEl } from './svg';
import type { SheetStyle } from './style';
import type { Paper } from './units';

type Room = AiFloorPlanLevel['rooms'][number];

/**
 * Bề rộng trung bình một ký tự so với cỡ chữ, dùng để ước bề rộng dòng chữ.
 *
 * Ước chứ không đo: Worker không có công cụ đo chữ, và nạp bảng độ rộng của một phông chỉ để
 * canh chữ trong phòng là đổi vài trăm ki-lô-byte lấy một chỗ chính xác không ai nhìn ra. Hệ
 * số 0,55 lấy theo phông sans-serif thân hẹp; chữ tiếng Việt có dấu KHÔNG rộng hơn theo chiều
 * ngang, chỉ cao hơn.
 */
const CHAR_WIDTH_RATIO = 0.55;

/** Khe hở hai bên chữ so với mép phòng, phần trăm bề rộng phòng. */
const SIDE_PADDING = 0.1;

export function renderRoomLabels(
  rooms: readonly Room[],
  paper: Paper,
  style: SheetStyle,
  labels: Record<string, string>,
  notes: DrawNotes,
): string {
  const out: string[] = [];

  for (const room of rooms) {
    const rect = toRect(room.rect);
    const centre = rectCentre(rect);
    const [cx, cy] = paper.p(centre);
    const boxW = paper.len(rectWidth(rect)) * (1 - SIDE_PADDING * 2);
    const boxH = paper.len(rectHeight(rect)) * (1 - SIDE_PADDING * 2);

    const raw = room.label?.trim() || labels[room.type] || room.type;
    const name = style.room_label.uppercase ? raw.toLocaleUpperCase('vi-VN') : raw;
    // Khuôn đo được trên hồ sơ thật: `64(M2)`, `3.1(M2)` — dấu chấm thập phân, không có khoảng
    // trắng trước ngoặc, bỏ phần thập phân khi tròn. Cả khuôn lẫn hậu tố là dữ liệu ở
    // `kb/sheet_style.yaml`, không viết cứng ở đây.
    const area = `${trimZero(room.area_m2)}${style.room_label.area_suffix}`;

    // Thử cả hai chiều rồi lấy chiều cho chữ TO hơn. Phòng hẹp mà dài — khu vệ sinh, kho, hành
    // lang — chỉ ghi được tên khi chữ quay dọc, và đó cũng là cách hồ sơ giấy vẫn ghi.
    const flat = fitLabel(name, area, boxW, boxH, style);
    const upright = fitLabel(name, area, boxH, boxW, style);
    const rotated = upright.nameSize > flat.nameSize;
    const chosen = rotated ? upright : flat;

    if (chosen.nameSize < style.text_min_mm) {
      notes.add(
        'room_label_dropped',
        `Phòng "${name}" quá nhỏ so với tỷ lệ tờ vẽ nên không in được tên và diện tích trong phòng.`,
      );
      continue;
    }

    const transform = rotated ? `rotate(-90 ${num(cx)} ${num(cy)})` : null;

    // Khung mảnh quanh hai dòng chữ — hồ sơ thật đóng khung nhãn phòng, và khung là thứ tách
    // chữ khỏi nét tường chạy sau lưng nó tốt hơn hẳn quầng nền.
    if (style.room_label.box) {
      const pad = style.room_label.box_pad_mm;
      // Bề rộng khung tính theo DÒNG DÀI NHẤT ở đúng cỡ chữ của dòng đó — dòng diện tích nhỏ
      // hơn dòng tên, nên nhân cả hai với cùng một cỡ sẽ ra khung rộng quá và đè sang tường.
      const textW =
        Math.max(name.length * chosen.nameSize, area.length * chosen.areaSize) * CHAR_WIDTH_RATIO +
        pad * 2;
      const textH = (chosen.nameSize + chosen.areaSize) * 1.35 + pad * 2;
      out.push(
        tag('rect', {
          x: cx - textW / 2,
          y: cy - textH / 2,
          width: textW,
          height: textH,
          class: CLS.labelBox,
          transform,
        }),
      );
    }
    // Khi chữ quay dọc, hai dòng phải lệch nhau theo trục ĐÃ QUAY — `rotate` quanh chính tâm
    // phòng lo phần đó, nên toạ độ vẫn tính như chữ nằm ngang.
    out.push(
      textEl(name, {
        x: cx,
        y: cy - chosen.areaSize * 0.7,
        class: CLS.textRoom,
        transform,
        style:
          chosen.nameSize < style.text_mm.room_name ? `font-size:${num(chosen.nameSize)}px` : null,
      }),
    );
    out.push(
      textEl(area, {
        x: cx,
        y: cy + chosen.nameSize * 0.7,
        class: CLS.textArea,
        transform,
        style:
          chosen.areaSize < style.text_mm.room_area ? `font-size:${num(chosen.areaSize)}px` : null,
      }),
    );
  }

  return out.join('');
}

/** Cỡ chữ lớn nhất để cả hai dòng lọt một ô rộng `available`, cao `depth`. */
function fitLabel(
  name: string,
  area: string,
  available: number,
  depth: number,
  style: SheetStyle,
): { nameSize: number; areaSize: number } {
  const ratio = style.text_mm.room_area / style.text_mm.room_name;
  const byWidth = Math.min(
    fitSize(name, available, style.text_mm.room_name),
    fitSize(area, available, style.text_mm.room_area) / ratio,
  );
  const byDepth = (depth * 0.8) / (1 + ratio);
  const nameSize = Math.min(style.text_mm.room_name, byWidth, byDepth);
  return { nameSize, areaSize: nameSize * ratio };
}

/** Cỡ chữ lớn nhất để dòng chữ còn lọt bề rộng cho trước. */
function fitSize(text: string, available: number, preferred: number): number {
  const width = text.length * CHAR_WIDTH_RATIO;
  if (width <= 0) return preferred;
  return available / width;
}

/**
 * Diện tích theo cách hồ sơ NVG ghi: một chữ số thập phân, bỏ `.0`, dấu CHẤM.
 *
 * Cố ý khác `formatNumber` của giao diện (dấu phẩy thập phân, CGD 4.3): đây là chữ trên BẢN VẼ,
 * và bản vẽ thật của NVG ghi `3.1(M2)`. Trộn hai quy ước thì một tờ giấy có hai kiểu số.
 */
function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
