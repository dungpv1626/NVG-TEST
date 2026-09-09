/**
 * Hình bao XÂY ĐƯỢC, suy từ ĐẦU BÀI — dùng chung cho mọi bước của nhánh AI.
 *
 * Vì sao nhánh AI tự tính thay vì gọi `buildableFootprint` của bộ giải: hàm kia sống trong
 * `program/engine.ts`, thứ sẽ bị xoá (T15, 09/09/2026). Nó cũng làm nhiều hơn mức cần ở đây —
 * nó đọc rule pack để lấy khoảng lùi và mật độ quy chuẩn, còn nhánh AI thì CỐ Ý không tiêm
 * ngưỡng quy chuẩn vào lời dẫn (T14 giữ nguyên): mô hình chỉ nhận những gì ĐẦU BÀI khai, và
 * quy chuẩn được đối chiếu SAU để sinh cảnh báo.
 *
 * Hệ quả phải chấp nhận và nói ra: nếu đầu bài khai khoảng lùi nhỏ hơn quy chuẩn, mô hình sẽ
 * xếp trên phần đất rộng hơn mức được phép — và chỗ đó hiện thành cảnh báo, không phải lỗi.
 * Đó đúng là điều T14 chọn.
 *
 * `siteGeometry` đến từ `@nvg/shared/design`, không phải bộ giải: nó là phép hình học thuần
 * trên phần `site` của đầu bài, và cả hai nhánh đều đọc cùng một cách hiểu về thửa đất.
 */

import { siteGeometry, type AiBriefDigest } from '@nvg/shared/design';

export interface BuildableBox {
  /** Toạ độ mét trong hệ của thửa: gốc góc trước-trái, x sang phải, y vào sâu. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  widthM: number;
  depthM: number;
  areaM2: number;
  /**
   * `false` khi thửa là đa giác bất kỳ: ô chữ nhật tìm được nằm gọn trong thửa nhưng có thể
   * nhỏ hơn ô lớn nhất thật. Sai về phía ít đất hơn — hướng sai an toàn.
   */
  exact: boolean;
}

/**
 * Ô chữ nhật xây được: ô lớn nhất nằm trong thửa, trừ đi khoảng lùi mà chính đầu bài khai.
 *
 * Khoảng lùi vắng mặt được hiểu là 0 — đây là dữ liệu người dùng nhập, không phải ngưỡng quy
 * chuẩn, nên không tự dựng lại một giá trị mặc định (CLAUDE.md 5.2).
 */
export function buildableFromDigest(digest: AiBriefDigest): BuildableBox {
  const site = digest.site;
  const geometry = siteGeometry({
    shape: site.shape ?? null,
    width_m: site.width_m,
    depth_m: site.depth_m,
    rear_width_m: site.rear_width_m ?? null,
    boundary_m: site.boundary_m ?? null,
  } as Parameters<typeof siteGeometry>[0]);

  const back = site.setback_required_m?.back ?? 0;
  const front = site.setback_required_m?.front ?? 0;
  const left = site.setback_required_m?.left ?? 0;
  const right = site.setback_required_m?.right ?? 0;

  const rect = geometry.buildable;
  const x0 = rect.xM + left;
  const y0 = rect.yM + front;
  // `Math.max` giữ ô không lộn ngược khi khoảng lùi cộng lại vượt kích thước thửa. Ô rỗng là
  // kết quả hợp lệ ở đây và sẽ thành cảnh báo ở lớp gọi — ném lỗi thì mất luôn cơ hội nói cho
  // người dùng biết vì sao không xếp được gì.
  const x1 = Math.max(x0, rect.xM + rect.widthM - right);
  const y1 = Math.max(y0, rect.yM + rect.depthM - back);

  const widthM = round1(x1 - x0);
  const depthM = round1(y1 - y0);
  return {
    x0: round1(x0),
    y0: round1(y0),
    x1: round1(x1),
    y1: round1(y1),
    widthM,
    depthM,
    areaM2: round1(widthM * depthM),
    exact: geometry.exact,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
