/**
 * Chỉ dẫn thao tác cho từng phần của Module Thiết kế — nội dung của `SectionHelp`.
 *
 * Gom về một chỗ để câu chữ nhất quán và soát được cùng lúc, thay vì rải trong từng tệp giao
 * diện. Viết theo CGD 4.4: câu mệnh lệnh, không đại từ nhân xưng, không emoji.
 *
 * Mỗi mục giữ tối đa ba bước và MỘT lưu ý — thứ dễ làm sai nhất ở phần đó. Dài hơn thì người
 * dùng đóng bảng mà không đọc, và chỉ dẫn thành ra vô ích.
 */

export interface SectionGuide {
  title: string;
  steps: string[];
  note?: string;
}

export const DESIGN_HELP = {
  brief: {
    title: 'Đầu bài thiết kế',
    steps: [
      'Điền các mục còn trống cho tới khi mức độ đầy đủ đạt yêu cầu.',
      'Đối chiếu với biên bản làm việc; con số nào chưa chắc thì để trống thay vì đoán.',
      'Bấm Xác nhận đầu bài khi chủ đầu tư đã đồng ý.',
    ],
    note: 'Đầu bài đã xác nhận thì khoá lại. Muốn sửa phải tạo phiên bản mới, và các bước sau phải chốt lại theo.',
  },
  survey: {
    title: 'Khảo sát hiện trạng',
    steps: [
      'Nhập kích thước thửa đất, hướng và hiện trạng bốn phía.',
      'Đính ảnh hiện trạng ngay trên biên bản — ảnh là căn cứ đối chiếu về sau.',
      'Ghi rõ số nào đo tại chỗ, số nào lấy theo trích lục.',
    ],
    note: 'Ranh giới thửa quyết định toàn bộ phương án; sai ở đây thì mọi bước sau sai theo.',
  },
  program: {
    title: 'Chương trình không gian',
    steps: [
      'Soát diện tích tối thiểu, mong muốn và tối đa của từng không gian.',
      'Đọc phần cảnh báo và các nhu cầu chưa xếp được trước khi chốt.',
      'Bấm Chốt chương trình không gian để các bước sau dùng bản này.',
    ],
    note: 'Chưa chốt thì chưa dựng được phương án. Đầu bài đổi thì phải chốt lại.',
  },
  variants: {
    title: 'Phương án kiến trúc',
    steps: [
      'So sánh các phương án bằng bảng phía trên: số phòng ngủ, tỷ lệ giao thông, tầng đặt phòng thờ.',
      'Mở từng phương án để xem bản vẽ, khối ba chiều và bảng thống kê.',
      'Bấm Chọn phương án này để đặt bản đang hiệu lực cho các bước sau.',
    ],
    note: 'Phương án không xếp được nghĩa là các yêu cầu mâu thuẫn nhau. Sửa đầu bài hoặc chương trình không gian rồi dựng lại — phần mềm không tự nới quy chuẩn.',
  },
  sheet: {
    title: 'Bản vẽ mặt bằng',
    steps: [
      'Chọn tầng để xem mặt bằng tương ứng.',
      'Đối chiếu chuỗi kích thước và lưới trục trước khi tải về.',
      'Tải DXF để mở bằng AutoCAD và chỉnh tiếp.',
    ],
    note: 'Phương án sơ bộ, chưa phải hồ sơ thi công. Lưới trục là đề xuất của hệ thống — kỹ sư kết cấu quyết định.',
  },
  massing: {
    title: 'Khối ba chiều',
    steps: [
      'Kéo chuột để xoay, lăn chuột để phóng to thu nhỏ.',
      'Kiểm tra chiều cao tầng, lối vào và các mặt thoáng.',
      'Bấm Chụp ảnh khối khi đã có góc nhìn ưng ý — ảnh đó dùng cho phần phối cảnh.',
    ],
    note: 'Khối chưa thể hiện vật liệu và mặt đứng; không dùng thay bản vẽ.',
  },
  schedules: {
    title: 'Bảng thống kê',
    steps: [
      'Soát số lượng cửa đi, cửa sổ và diện tích sàn từng tầng.',
      'Tải XLSX để chuyển sang bộ phận dự toán.',
    ],
    note: 'Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng.',
  },
  render: {
    title: 'Phối cảnh tham khảo',
    steps: [
      'Chụp ảnh khối ở mục Khối ba chiều trước.',
      'Bấm Dựng ảnh phối cảnh để có ảnh trình khách hàng.',
    ],
    note: 'Ảnh chỉ trả lời câu hỏi thẩm mỹ, không thay mặt bằng. Nhãn cảnh báo in thẳng lên ảnh và không gỡ được.',
  },
} as const satisfies Record<string, SectionGuide>;
