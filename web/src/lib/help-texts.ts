/**
 * Hướng dẫn ngắn cho các màn hình chính — nội dung nút «Hướng dẫn» của `PageHeader`.
 *
 * Gom về một chỗ để câu chữ nhất quán và soát được cùng lúc. Viết theo CGD 4.4: câu mệnh lệnh,
 * không đại từ nhân xưng, không emoji. Mỗi mục tối đa ba bước và MỘT lưu ý — thứ dễ làm sai
 * nhất ở màn hình đó. Dài hơn thì người dùng đóng bảng mà không đọc.
 *
 * `autoOpenKey` là khoá ghi nhớ «đã tự mở»: phải ổn định giữa các lần phát hành.
 */

export interface SectionGuide {
  title: string;
  steps: string[];
  note?: string;
}

type Guide = SectionGuide & { autoOpenKey: string };

export const APP_HELP = {
  dashboard: {
    autoOpenKey: 'dashboard',
    title: 'Việc cần làm hôm nay',
    steps: [
      'Xem hai thẻ đầu: hồ sơ đang chờ mình duyệt và việc đã quá hạn.',
      'Bấm vào một thẻ để mở đúng danh sách đã lọc sẵn.',
      'Đổi kỳ báo cáo ở hàng nút phía trên để xem theo tháng, quý hoặc năm.',
    ],
    note: 'Thẻ chỉ hiện với phân hệ vai trò được xem; số liệu lấy thẳng từ chứng từ, không nhập tay.',
  },
  approvalInbox: {
    autoOpenKey: 'phe-duyet',
    title: 'Hộp thư Phê duyệt',
    steps: [
      'Chọn một hồ sơ ở danh sách; hồ sơ chờ lâu nhất nằm trên cùng.',
      'Đọc tóm tắt, mở hồ sơ đầy đủ nếu cần, rồi bấm Duyệt hoặc Từ chối.',
      'Từ chối phải nêu lý do — người gửi nhận lại hồ sơ kèm lý do đó.',
    ],
    note: 'Chỉ hiện hồ sơ nằm trong hạn mức của vai trò; hồ sơ lớn hơn do người có hạn mức cao hơn duyệt.',
  },
  customers: {
    autoOpenKey: 'crm.khach-hang',
    title: 'Khách hàng',
    steps: [
      'Tìm khách hàng trước khi tạo mới để không lập trùng.',
      'Mở một khách hàng để xem mọi cơ hội, báo giá, hợp đồng liên quan.',
      'Tạo cơ hội từ trang khách hàng để hồ sơ tự liên kết.',
    ],
    note: 'Khách hàng dùng chung cho cả ba pháp nhân — một khách hàng chỉ có một mã.',
  },
  bidding: {
    autoOpenKey: 'da.goi-thau',
    title: 'Gói thầu',
    steps: [
      'Bóc khối lượng, lập dự toán rồi gửi duyệt giá.',
      'Giá được duyệt mới nộp thầu và ghi kết quả được.',
      'Trúng thầu thì soạn hợp đồng ngay từ gói thầu — giá trị và khách hàng tự điền.',
    ],
    note: 'Dự toán đã duyệt không sửa được; cần đổi thì lập phiên bản mới.',
  },
  contracts: {
    autoOpenKey: 'hd.hop-dong',
    title: 'Hợp đồng',
    steps: [
      'Hợp đồng được soạn từ gói thầu hoặc dự án thiết kế, không nhập lại số liệu.',
      'Thêm điều khoản, trình ký, rồi ghi nhận số hợp đồng khi đã ký.',
      'Hợp đồng đã ký thì mở công trình và sinh ngân sách thi công từ dự toán.',
    ],
    note: 'Số đã thu của hợp đồng cộng từ chứng từ thu của Kế toán, không sửa tay.',
  },
  sites: {
    autoOpenKey: 'tc.cong-trinh',
    title: 'Công trình',
    steps: [
      'Mở công trình để ghi nhật ký, gửi đề nghị vật tư, lập biên bản nghiệm thu.',
      'Theo dõi đề nghị cho biết đề nghị nào đang kẹt ở đâu, và ai đang giữ.',
      'Tab Ngân sách so chi phí thực tế và đã cam kết với dự toán.',
    ],
    note: 'Chỉ huy trưởng chỉ thấy công trình được phân công.',
  },
  siteRequests: {
    autoOpenKey: 'tc.de-nghi',
    title: 'Theo dõi đề nghị',
    steps: [
      'Mỗi thẻ cho biết đề nghị đang ở bước nào, ai đang giữ và đã chờ bao lâu.',
      'Bấm Thúc để nhắc người đang giữ — hệ thống gửi thông báo và ghi lại lần nhắc.',
      'Mở mã đề nghị để xem chi tiết mặt hàng, báo giá và đơn hàng.',
    ],
    note: 'Hạn xử lý chỉ hiện khi Ban Giám đốc đã khai thời hạn cam kết cho bước đó.',
  },
  purchaseRequests: {
    autoOpenKey: 'mh.de-nghi-mua',
    title: 'Đề nghị mua',
    steps: [
      'Đề nghị từ công trường mang mã công trình; đề nghị văn phòng thì không.',
      'Đề nghị đã duyệt: nhập báo giá, so sánh, chọn nhà cung cấp rồi lập đơn hàng.',
      'Ghi nhận giao nhận khi hàng về — chi phí tự vào đúng mã chi phí của công trình.',
    ],
    note: 'Chọn nhà cung cấp không phải giá thấp nhất thì phải nêu căn cứ.',
  },
  scaffolding: {
    autoOpenKey: 'kho.gian-giao',
    title: 'Giàn giáo',
    steps: [
      'Mỗi dòng là một lô: loại vật tư, số lượng, tình trạng và đang ở đâu.',
      'Ghi sự kiện sửa chữa, mất mát, thanh lý ngay trên lô đó.',
      'Lập hợp đồng thuê thì lô tự tách phần cho thuê; thu hồi về thành lô riêng theo tình trạng.',
    ],
    note: 'Số lượng lô không sửa tay — thay đổi đi qua sự kiện hoặc hợp đồng thuê để truy được.',
  },
  rentals: {
    autoOpenKey: 'sx.cho-thue',
    title: 'Cho thuê giàn giáo',
    steps: [
      'Lập hợp đồng thuê: chọn khách, vật tư, số lượng và đơn giá ngày.',
      'Thu hồi theo từng đợt; ghi rõ số đạt, hư hỏng và mất.',
      'Tiền thuê tính theo số ngày thuê thật của từng đợt trả.',
    ],
    note: 'Hợp đồng đóng khi đã thu hồi đủ; không trả vượt số đang thuê được.',
  },
  paymentRequests: {
    autoOpenKey: 'kt.de-nghi-thanh-toan',
    title: 'Đề nghị thanh toán',
    steps: [
      'Lập đề nghị, phân bổ vào đúng công trình và mã chi phí, rồi gửi đi.',
      'Hồ sơ qua ba bước kiểm: đơn vị xác nhận, Kế toán kiểm chứng từ, Tài chính kiểm dòng tiền.',
      'Được phê duyệt thì Kế toán ghi nhận đã chi — chi phí tự vào ngân sách công trình.',
    ],
    note: 'Người lập đề nghị không tự ghi nhận đã chi cho hồ sơ của mình.',
  },
  profitLoss: {
    autoOpenKey: 'bc.lai-lo',
    title: 'Lãi/lỗ theo công trình',
    steps: [
      'Lãi/lỗ dự kiến lấy từ dự toán đã duyệt; lãi/lỗ thực tế tính từ chứng từ tới hôm nay.',
      'Bấm tên công trình để xem từng mã chi phí và truy ngược tới chứng từ gốc.',
      'Xuất bản in hoặc tệp bảng tính bằng nút ở góc trên.',
    ],
    note: 'Doanh thu thực tế ghi theo giá trị đã nghiệm thu với chủ đầu tư, không theo cả hợp đồng.',
  },
  employees: {
    autoOpenKey: 'ns.nhan-su',
    title: 'Hồ sơ nhân sự',
    steps: [
      'Mở một nhân sự để xem hợp đồng lao động, giấy tờ và tài sản được cấp.',
      'Thông tin nhạy cảm chỉ hiện với vai trò được phép, và mỗi lượt xem đều được ghi lại.',
      'Chấm công lấy từ nhật ký công trường và bảng công, không nhập lại.',
    ],
    note: 'Không lưu mật khẩu, tài khoản ngân hàng cá nhân hay nhận xét cảm tính trong hồ sơ.',
  },
} as const satisfies Record<string, Guide>;
