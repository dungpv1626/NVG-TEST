/**
 * Toán bố cục của bản PDF báo giá (0239) — thuần, không phụ thuộc pdf-lib, có phép thử.
 *
 * Bản PDF dựng THẲNG từ dữ liệu (không đổi từ Word): chữ là vector, chọn / tìm được; khổ A4; bảng hạng mục
 * dài thì sang trang, mỗi trang lặp lại dòng tiêu đề bảng; mọi trang có số trang.
 */

/** Đo bề rộng một chuỗi (điểm) ở cỡ chữ đang dùng. */
export type Measure = (text: string) => number;

/**
 * Ngắt chữ theo bề rộng: tôn trọng xuống dòng có sẵn, ngắt ở khoảng trắng; một từ dài hơn cả dòng (mã, địa chỉ
 * email) thì cắt theo ký tự. Chuỗi rỗng → một dòng rỗng (giữ chỗ).
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      // Từ dài hơn cả dòng: cắt theo ký tự.
      let chunk = '';
      for (const ch of Array.from(word)) {
        if (chunk && measure(chunk + ch) > maxWidth) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

/**
 * Chia các dòng bảng thành trang. Mỗi trang bắt đầu bằng dòng tiêu đề (`headerHeight`), nên chỗ còn cho dòng
 * dữ liệu = chỗ trống của trang − tiêu đề. Trang đầu còn ít chỗ hơn (đầu thư, khách hàng). Một dòng cao hơn cả
 * trang vẫn được đặt (một mình một trang) — không bao giờ lặp vô tận hay bỏ dòng.
 *
 * Trả mảng các trang, mỗi trang là danh sách chỉ số dòng.
 */
export function paginateRows(
  rowHeights: readonly number[],
  firstPageSpace: number,
  pageSpace: number,
  headerHeight: number,
): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let room = firstPageSpace - headerHeight;
  rowHeights.forEach((h, i) => {
    if (current.length > 0 && h > room) {
      pages.push(current);
      current = [];
      room = pageSpace - headerHeight;
    } else if (
      current.length === 0 &&
      pages.length === 0 &&
      h > room &&
      pageSpace > firstPageSpace
    ) {
      // Trang đầu không đủ chỗ cho cả dòng đầu tiên: bảng bắt đầu ở trang sau.
      pages.push([]);
      room = pageSpace - headerHeight;
    }
    current.push(i);
    room -= h;
  });
  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

export interface Column {
  key: string;
  label: string;
  x: number;
  width: number;
  align: 'left' | 'center' | 'right';
}

/** Cột bảng hạng mục theo tỷ lệ bề rộng vùng nội dung (tổng tỷ lệ = 1). */
export function itemColumns(left: number, contentWidth: number): Column[] {
  const spec: [string, string, number, Column['align']][] = [
    ['stt', 'STT', 0.06, 'center'],
    ['noi_dung', 'Hạng mục', 0.38, 'left'],
    ['don_vi', 'Đơn vị', 0.09, 'center'],
    ['khoi_luong', 'Khối lượng', 0.12, 'right'],
    ['don_gia', 'Đơn giá (đồng)', 0.16, 'right'],
    ['thanh_tien', 'Thành tiền (đồng)', 0.19, 'right'],
  ];
  let x = left;
  return spec.map(([key, label, share, align]) => {
    const width = contentWidth * share;
    const col = { key, label, x, width, align };
    x += width;
    return col;
  });
}

/** Vị trí x của chữ trong một ô theo căn lề. */
export function alignX(
  col: Pick<Column, 'x' | 'width' | 'align'>,
  textWidth: number,
  pad: number,
): number {
  if (col.align === 'right') return col.x + col.width - pad - textWidth;
  if (col.align === 'center') return col.x + (col.width - textWidth) / 2;
  return col.x + pad;
}

/** Nhãn số trang ở chân trang. */
export function pageLabel(index: number, total: number): string {
  return `Trang ${index + 1}/${total}`;
}
