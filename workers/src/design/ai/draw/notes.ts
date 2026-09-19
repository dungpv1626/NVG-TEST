/**
 * Ghi chú của bộ vẽ — chỗ bộ vẽ nói ra những gì nó đã tự xử lý.
 *
 * Bộ vẽ KHOAN DUNG: dữ liệu đã qua schema thì không bao giờ làm nó ném. Một cửa đặt lòi ra
 * ngoài đầu tường bị kẹp lại, một tầng quá khổ bị hạ tỷ lệ — tờ vẽ vẫn ra. Nhưng "tự xử lý"
 * mà im lặng thì kiến trúc sư nhìn tờ vẽ đẹp và không biết nó đã khác dữ liệu, nên mọi lần
 * kẹp đều để lại một dòng ở đây và màn hình hiện lên.
 *
 * Tách khỏi `Issue` của bộ kiểm (`ai/plan-check.ts`) vì hai thứ trả lời hai câu khác nhau:
 * bộ kiểm nói «đề xuất này có chỗ sai, có nên bắt mô hình sửa không», bộ vẽ nói «tờ giấy này
 * không vẽ đúng y dữ liệu ở mấy chỗ».
 */

export interface DrawNote {
  /** Mã ngắn, không dấu — để màn hình và test bám vào mà không phụ thuộc câu chữ. */
  code: string;
  /** Câu tiếng Việt cụ thể, nêu rõ phần tử nào và đã xử lý thế nào. */
  message: string;
}

export class DrawNotes {
  private readonly items: DrawNote[] = [];

  add(code: string, message: string): void {
    this.items.push({ code, message });
  }

  list(): DrawNote[] {
    return this.items.slice();
  }
}
