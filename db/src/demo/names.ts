/**
 * Chặn chữ lộ «dữ liệu giả» lên màn hình khách xem.
 *
 * Một dòng «Công ty mẫu…» hay «[TEST]» giữa buổi demo là đủ để người xem coi mọi con số còn lại
 * là bịa. Mọi chuỗi trình nạp ghi vào tên, tiêu đề, nội dung đều đi qua đây.
 */

// Ranh giới từ viết bằng lớp chữ Unicode: `\b` của JavaScript chỉ hiểu chữ ASCII, nên với «thử»
// nó không bao giờ khớp.
const FORBIDDEN = /(?<!\p{L})(mẫu|test|demo|thử|lorem|placeholder)(?!\p{L})|\[test\]/iu;

export function clean<T extends string>(text: T): T {
  if (FORBIDDEN.test(text)) {
    throw new Error(`Chuỗi dữ liệu demo lộ chữ «dữ liệu giả»: «${text}»`);
  }
  return text;
}
