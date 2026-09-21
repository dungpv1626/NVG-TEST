/**
 * Sinh `SAD.docx` — bản trình bày của `SAD.md`.
 *
 *   npm install docx --no-save --prefix /tmp/sad
 *   NODE_PATH=/tmp/sad/node_modules node doc/architecture/sad-docx.mjs
 *
 * Bố cục mỗi mục theo đúng thứ tự: khái niệm → sơ đồ → giải thích ngắn → chi tiết dạng bảng.
 * Người đọc phải nắm được kiến trúc ở mức tổng quan mà KHÔNG cần đọc hết phần chữ.
 */

import { writeFileSync } from 'node:fs';
import {
  Packer,
  buildDocument,
  bullets,
  figure,
  h1,
  h2,
  note,
  p,
  pageBreak,
  spacer,
  table,
  titlePage,
  toc,
} from './docx-lib.mjs';

const NGAY = '20/09/2026';
const D = 'doc/architecture/diagrams';

const children = [
  ...titlePage({
    title: 'Software Architecture Document',
    subtitle: 'Hệ thống Quản trị Nhà Việt Group',
    module: 'Toàn hệ thống — 12 phân hệ',
    version: '1.0',
    date: NGAY,
    author: 'Đội triển khai — vai trò Kiến trúc sư phần mềm',
    status: 'Chờ Haan duyệt',
  }),
  spacer(),
  note(
    'Mọi con số trong tài liệu **đo trên hệ thống thật ngày ' +
      NGAY +
      '**. Phần chưa quyết đánh dấu **TBD**. Phần suy luận chưa ai xác nhận đánh dấu **Giả định**.',
  ),
  pageBreak(),
  ...toc(),
  pageBreak(),

  // ------------------------------------------------------------- 1
  h1('1. Executive Summary'),
  ...bullets([
    'Hệ thống quản trị nội bộ cho **ba pháp nhân** — NVC xây dựng công nghiệp, NVO nhà ở dân dụng, NVS giàn giáo — dùng chung một khối Back Office. Thay cho Excel, Word, Zalo và Google Drive.',
    '**12 phân hệ trên một cơ sở dữ liệu duy nhất.** Nền tảng là phân hệ NEN: pháp nhân, người dùng, quyền, phê duyệt, tham số, nhật ký.',
    '**Phân quyền nằm trong cơ sở dữ liệu** (RLS của PostgreSQL), không nằm ở giao diện hay API. Đây là quyết định quan trọng nhất — ADR-002.',
    '**Không có tầng API tự viết cho nghiệp vụ thường**: giao diện gọi thẳng PostgREST. Chỉ phân hệ Thiết kế AI có endpoint riêng — ADR-001.',
    'Chạy trên **mạng biên Cloudflare và Supabase**, không có máy chủ ứng dụng thường trực.',
  ]),
  table(
    ['Số đo', 'Giá trị', 'Số đo', 'Giá trị'],
    [
      ['Phân hệ', '12 (+ Thiết kế AI đang làm)', 'Vai trò', '14'],
      ['Bảng dữ liệu', '108', 'Màn hình', 'khoảng 110'],
      ['Migration', '131', 'Endpoint API tự viết', 'chỉ `/design`'],
      ['Hàm trong CSDL', '202 — 55 hàm phân quyền', 'Phép thử tự động', '446 giao diện · 142 phân quyền'],
    ],
    [1.1, 1.6, 1.1, 1.6],
  ),

  // ------------------------------------------------------------- 2
  h1('2. Purpose & Scope'),
  p(
    'Cho người mới đọc trong mười phút để biết: hệ thống gồm gì, các phần nối nhau ra sao, dữ liệu ' +
      'đi đường nào, quyết định nào đã chốt và vì sao.',
  ),
  table(
    ['Trong phạm vi', 'Ngoài phạm vi'],
    [
      ['Cấu trúc hệ thống, ranh giới, phụ thuộc', 'Thiết kế chi tiết từng lớp, từng hàm'],
      ['Luồng nghiệp vụ trọng yếu', 'Đặc tả nghiệp vụ đầy đủ — xem PRD'],
      ['Quyết định kiến trúc và lý do', 'Lược đồ bảng đầy đủ — xem `db/src/schema/`'],
      ['Bảo mật, triển khai, khả mở rộng', 'Hướng dẫn sử dụng'],
    ],
    [1, 1],
  ),
  p('**Người đọc:** chủ dự án · người viết mã ở phiên sau · người kiểm thử · Ban Giám đốc NVG.'),

  // ------------------------------------------------------------- 3
  h1('3. Architecture Drivers / NFR'),
  table(
    ['Yếu tố dẫn dắt', 'Yêu cầu đo được', 'Ảnh hưởng tới kiến trúc'],
    [
      ['Dữ liệu nhạy cảm nhiều tầng', 'Giá vốn, lợi nhuận, lương chỉ tới đúng nhóm vai trò', 'RLS là hàng rào duy nhất; cột nhạy cảm đi qua hàm có ghi nhật ký'],
      ['Ba pháp nhân, báo cáo hợp nhất', 'Tách bạch dữ liệu, vẫn cộng được toàn nhóm', '`company_id` trên mọi bảng giao dịch; loại trừ giao dịch nội bộ khi hợp nhất'],
      ['Người dùng ở công trường', 'Cập nhật hằng ngày **dưới 10–20 phút**', 'Bố cục di động thật, tách gói theo màn hình, không nhập hai lần'],
      ['Quy chế NVG chưa ban hành', 'Hạn mức, ngưỡng, thời hạn sửa được khi đang chạy', 'Cấu hình là dữ liệu, không phải mã — ADR-005'],
      ['Một người triển khai', 'Sửa một quy tắc chỉ động vào một chỗ', 'Điều kiện phân quyền gói trong hàm dùng chung'],
      ['Sai quyền phải bắt được bằng máy', 'Phép thử đăng nhập thật bằng từng vai trò', '142 phép thử phân quyền chạy trên CSDL thật'],
      ['Giao diện tiếng Việt 100%', 'Kể cả chữ do trình duyệt tự sinh', 'Cấm điều khiển gốc tự sinh chữ; có phép thử canh'],
    ],
    [1.1, 1.7, 2.2],
  ),

  // ------------------------------------------------------------- 4
  h1('4. System Context'),
  ...figure(`${D}/system-context.png`, 'Ngữ cảnh hệ thống: ai dùng, nối ra đâu', { maxHeight: 420 }),
  ...bullets([
    'Bốn nhóm người dùng, một hệ thống, bốn hệ thống ngoài — **hai trong bốn còn là TBD**.',
    '**Supabase là nền dữ liệu**, không phải dịch vụ ngoài tuỳ chọn: mất Supabase là mất hệ thống.',
    '**Mô hình ngôn ngữ chỉ phục vụ phân hệ Thiết kế AI.** Mười hai phân hệ nghiệp vụ không gọi AI.',
    'Dữ liệu gửi ra ngoài đã bỏ danh tính; khung tên mang mã hồ sơ không gửi.',
  ]),

  // ------------------------------------------------------------- 5
  h1('5. High-Level Architecture'),
  ...figure(`${D}/high-level-architecture.png`, 'Kiến trúc tổng thể: bốn tầng, hai đường dữ liệu', {
    maxHeight: 400,
  }),
  table(
    ['Tầng', 'Thành phần', 'Trách nhiệm'],
    [
      ['Giao diện', 'Worker `nvg` — Static Assets', 'Ứng dụng một trang, PWA, tách gói theo màn hình'],
      ['Dữ liệu', '**PostgREST**', 'Đường mặc định: đọc, lọc, ghi cho 12 phân hệ'],
      ['Nghiệp vụ đặc thù', 'Worker `nvg-api` — Hono', 'Chỉ `/design`; cổng vào tác vụ nền theo lịch'],
      ['Lưu trữ', 'PostgreSQL · Auth · Storage', 'Dữ liệu, danh tính, tệp — kèm RLS'],
    ],
    [0.9, 1.5, 2.6],
  ),
  note(
    '**Không có API Gateway, không hàng đợi, không bộ nhớ đệm riêng.** Quy mô hiện tại không đòi hỏi, ' +
      'và mỗi tầng thêm vào là một tầng nữa có thể hỏng. Khi cần gửi thư điện tử hàng loạt thì thêm ' +
      'hàng đợi — hiện **TBD**, chờ khoá dịch vụ thư.',
  ),

  // ------------------------------------------------------------- 6
  pageBreak(),
  h1('6. Logical / Component Architecture'),
  ...figure(`${D}/component.png`, 'Phân hệ và phụ thuộc giữa chúng; NEN đỡ toàn bộ', {
    maxHeight: 640,
  }),
  table(
    ['Phân hệ', 'Trách nhiệm', 'Bảng', 'Hiện trạng'],
    [
      ['**NEN**', 'Pháp nhân, người dùng, vai trò, quyền, phê duyệt, tham số, nhật ký, thông báo', '20', 'Xong, 6 màn hình quản trị'],
      ['CRM', 'Khách hàng, cơ hội, báo giá có phiên bản', '6', 'Xong'],
      ['DA', 'Gói thầu, dự toán', '7', 'Xong phần lõi'],
      ['TK', 'Hồ sơ thiết kế', '8', 'Xong phần lõi'],
      ['HD', 'Hợp đồng, phát sinh', '3', 'Xong'],
      ['TC', 'Công trình, ngân sách, nhật ký thi công', '6', 'Xong lõi phạm vi cũ'],
      ['MH', 'Đề nghị mua, so sánh báo giá, đơn hàng', '9', 'Xong'],
      ['KHO', 'Tồn kho, nhập xuất, kiểm kê', '9', 'Xong'],
      ['KT', 'Công nợ, thanh toán, lãi lỗ', '9', 'Xong'],
      ['NS', 'Nhân sự, chấm công, tuyển dụng', '16', 'Xong'],
      ['SX', 'Sản xuất, cho thuê giàn giáo', '4', 'Mới có khung'],
      ['BC', 'Báo cáo', '0 — đọc từ nguồn', 'Xong phần lớn'],
      ['TK-AI', 'Thiết kế sơ bộ bằng AI', '8', 'Đang làm'],
    ],
    [0.7, 2.6, 0.7, 1.2],
  ),
  p(
    'Hai ranh giới cứng: **BC không có bảng riêng** (một nguồn dữ liệu duy nhất, báo cáo đọc từ nơi ' +
      'phát sinh), và **TK-AI không ghi vào hồ sơ phát hành** (kết quả AI là đề xuất; người có thẩm ' +
      'quyền mới phát hành).',
  ),
];

children.push(
  // ------------------------------------------------------------- 7
  pageBreak(),
  h1('7. Runtime / Critical Flows'),

  h2('7.1 Phê duyệt theo hạn mức'),
  ...figure(`${D}/sequence-phe-duyet.png`, 'Luồng phê duyệt — hạn mức quyết định ai nhìn thấy hồ sơ', {
    maxHeight: 460,
  }),
  p(
    'Một Hộp thư Phê duyệt cho mọi loại hồ sơ. Hạn mức đọc từ bảng cấu hình, nên đổi quy chế là đổi ' +
      'dữ liệu. Hồ sơ vượt hạn mức tự chuyển bước cao hơn.',
  ),

  h2('7.2 Đọc dữ liệu có phạm vi và có cột nhạy cảm'),
  ...figure(`${D}/sequence-rls-hien-truong.png`, 'Chỉ huy trưởng đọc dữ liệu: giao diện không lọc, CSDL lọc', {
    maxHeight: 440,
  }),
  p(
    'Giao diện **không gửi điều kiện lọc người dùng**; cơ sở dữ liệu tự lọc. Quên phân công dẫn tới ' +
      'thấy ít đi — hướng sai an toàn.',
  ),

  h2('7.3 Thiết kế sơ bộ bằng AI'),
  ...figure(`${D}/sequence-thiet-ke-ai.png`, 'Luồng duy nhất đi qua Worker và ra dịch vụ ngoài', {
    maxHeight: 460,
  }),
  p(
    'Mô hình đề xuất bố cục; **chương trình gán mọi toạ độ**. Hỏng cổng kiểm thì không lưu. Kết quả ' +
      'là đề xuất, không tự phát hành hồ sơ.',
  ),

  h2('7.4 Tác vụ nền'),
  p(
    'Cron Trigger gọi Worker, Worker gọi ba hàm SQL quét cảnh báo rồi ghi log. Điều kiện nghiệp vụ ' +
      'nằm trong SQL để không có hai bản. Cảnh báo vượt ngân sách không chờ quét — trigger báo ngay ' +
      'khi ghi, vì chờ tới đêm thì tiền đã tiêu rồi.',
  ),

  // ------------------------------------------------------------- 8
  pageBreak(),
  h1('8. Data Architecture'),
  ...figure(`${D}/data-flow.png`, 'Dữ liệu đi từ khách hàng tới lãi lỗ công trình', { maxHeight: 600 }),
  table(
    ['Chủ đề', 'Quy tắc áp cho mọi bảng'],
    [
      ['Định danh', 'Khoá chính UUID; tên bảng số nhiều, tiếng Anh, `snake_case`'],
      ['Phạm vi', 'Bảng giao dịch có `company_id`; bảng dùng chung thì không'],
      ['Tiền', 'Số nguyên đồng, **không thập phân**. Số lượng vật lý là số thực có đơn vị'],
      ['Trạng thái', 'Quy về sáu nhóm chung cho toàn hệ thống'],
      ['Lịch sử', 'Thay đổi quan trọng ghi sang **bảng lịch sử riêng**, không ghi đè'],
      ['Xoá', 'Xoá mềm cho bảng quan trọng; phân công kết thúc bằng ngày, không xoá dòng'],
      ['Chứng từ đã ký', 'Bất biến; sửa bằng chứng từ điều chỉnh có người duyệt, cưỡng chế ở CSDL'],
      ['Hiện trường', 'Ba cột đồng bộ để khử ghi trùng khi mạng chập chờn'],
    ],
    [0.9, 3.3],
  ),
  p(
    '**Hồ sơ 360°:** bảy thực thể tham chiếu xuyên phân hệ — pháp nhân, người dùng, khách hàng, cơ ' +
      'hội, gói thầu hoặc dự án thiết kế, hợp đồng, công trình — được **liên kết, không sao chép**.',
  ),

  // ------------------------------------------------------------- 9
  h1('9. Security Architecture'),
  table(
    ['Mẫu', 'Logic phân quyền', 'Áp cho'],
    [
      ['**A**', 'Theo pháp nhân; Ban Giám đốc và quản trị viên thấy tất cả', 'Hầu hết bảng giao dịch'],
      ['**B**', 'A cộng điều kiện người chịu trách nhiệm mới sửa được', 'Cơ hội, hợp đồng'],
      ['**C**', 'Hiện trong Hộp thư Phê duyệt nếu giá trị trong hạn mức', 'Đề nghị mua, thanh toán'],
      ['**D**', 'Hạn chế theo **cột**, trả số thật qua hàm có ghi nhật ký', 'Giá vốn, lợi nhuận, lương'],
      ['**E**', 'Chỉ dữ liệu công trình hoặc xưởng được phân công', 'Công trình, nhật ký thi công'],
    ],
    [0.5, 2.6, 1.3],
  ),
  ...bullets([
    'Trình duyệt chỉ giữ khoá ẩn danh. Khoá `service_role` **chỉ tồn tại trong Worker**.',
    'Mọi lượt xem hoặc sửa dữ liệu nhạy cảm ghi một dòng nhật ký truy cập — hiện 2.434 dòng.',
    'Bảng mới **tự động bật RLS**: quên viết policy thì bảng bị chặn hết, tức là hỏng theo hướng an toàn.',
    'Ba lớp chặn: menu ẩn theo quyền → chặn đường dẫn gõ tay → RLS. **Chỉ lớp cuối là hàng rào.**',
    'Không lưu mật khẩu thô, mã xác thực một lần, tài khoản ngân hàng cá nhân.',
    'Không commit bí mật; dùng kho bí mật của Cloudflare Workers.',
  ]),

  // ------------------------------------------------------------- 10
  pageBreak(),
  h1('10. Deployment Architecture'),
  ...figure(`${D}/deployment.png`, 'Triển khai: mạng biên Cloudflare và Supabase', { maxHeight: 420 }),
  table(
    ['Môi trường', 'Giao diện', 'API', 'Cơ sở dữ liệu'],
    [
      ['Máy phát triển', 'Vite cổng 5173', '`wrangler dev`', 'Dùng **chung** project Supabase'],
      ['Bản chạy thử', 'Worker `nvg`', 'Worker `nvg-api`', 'Cùng project đó'],
      ['Production', 'Chưa dựng', 'Chưa dựng', '**Chưa tách** — xem R-1'],
    ],
    [1, 1, 1, 1.6],
  ),
  note(
    '**Hai cái bẫy đã gặp thật.** Kèm `--env production` khi triển khai Worker giao diện sinh ra một ' +
      'Worker thứ hai; bản thật giữ nguyên bản cũ mà không báo lỗi. Và biến môi trường `VITE_` rỗng ' +
      'làm **trắng màn hình** trong khi bản dựng vẫn báo thành công.',
  ),

  // ------------------------------------------------------------- 11
  h1('11. Scalability & Reliability'),
  table(
    ['Khía cạnh', 'Hiện trạng', 'Đánh giá'],
    [
      ['Quy mô người dùng', 'Khoảng 40 nhân sự văn phòng và ban công trường', 'Xa ngưỡng cần chia tải'],
      ['Khối lượng giao dịch', 'Khoảng 800 dự án và đơn hàng mỗi năm', 'Một instance PostgreSQL dư sức'],
      ['Giao diện', 'Tệp tĩnh trên mạng biên', 'Không có điểm nghẽn máy chủ ứng dụng'],
      ['Tác vụ nền', 'Cron Trigger, không hàng đợi', 'Đủ cho ba loại quét hiện có'],
      ['Ngoại tuyến', 'Chỉ khử ghi trùng, **chưa làm ngoại tuyến thật**', 'TBD'],
      ['Sao lưu', 'Theo cơ chế của Supabase', 'Chưa diễn tập phục hồi'],
      ['Điểm hỏng đơn lẻ', 'Supabase', 'Chấp nhận ở giai đoạn demo'],
    ],
    [1, 2, 1.6],
  ),
  p(
    'Hướng mở rộng khi cần, theo thứ tự: chỉ mục và truy vấn trước, rồi bộ nhớ đệm cho báo cáo nặng, ' +
      'sau cùng mới tách dịch vụ. **Chưa có nhu cầu nào trong ba mức này.**',
  ),

  // ------------------------------------------------------------- 12
  h1('12. Technology Stack'),
  table(
    ['Lớp', 'Công nghệ', 'Ghi chú'],
    [
      ['Giao diện', 'React 18 · TypeScript · Vite · Tailwind · shadcn/ui', 'SPA, không kết xuất phía máy chủ'],
      ['Trạng thái', 'TanStack Query · Zustand', 'Bộ đệm truy vấn 30 giây'],
      ['Biểu mẫu', 'React Hook Form · Zod', 'Zod dùng chung giao diện và máy chủ'],
      ['API', 'Supabase PostgREST · Cloudflare Workers + Hono', 'Workers chỉ cho Thiết kế AI'],
      ['Dữ liệu', 'PostgreSQL trên Supabase · Drizzle ORM', 'Migration là nguồn duy nhất của lược đồ'],
      ['Xác thực · Tệp', 'Supabase Auth · Supabase Storage', ''],
      ['Nền tảng chạy', 'Cloudflare Workers · Static Assets · Cron Triggers', ''],
      ['Kiểm thử', 'Vitest · React Testing Library · Playwright', ''],
      ['AI', 'Mô hình ngôn ngữ và ảnh', 'Chỉ cho Thiết kế AI'],
    ],
    [0.8, 2.3, 1.7],
  ),

  // ------------------------------------------------------------- 13
  pageBreak(),
  h1('13. Architecture Decisions'),
  p('Năm quyết định đầu có tài liệu riêng trong `doc/architecture/adr/`, kèm phương án đã loại.'),
  table(
    ['Mã', 'Quyết định', 'Đánh đổi chính'],
    [
      ['ADR-001', 'PostgREST là đường dữ liệu mặc định; Workers chỉ cho ngoại lệ', 'Mọi truy vấn phải diễn đạt được bằng PostgREST'],
      ['ADR-002', 'Phân quyền bằng RLS trong cơ sở dữ liệu', 'Logic quyền viết bằng SQL, khó đọc hơn TypeScript'],
      ['ADR-003', 'Năm mẫu RLS, mỗi bảng đúng một mẫu', 'Trường hợp lạ phải uốn về một trong năm mẫu'],
      ['ADR-004', 'Đa pháp nhân bằng cột `company_id`', 'Lọc sai một chỗ là lộ dữ liệu chéo pháp nhân'],
      ['ADR-005', 'Cấu hình là dữ liệu, không phải mã', 'Chưa cấu hình thì màn hình phải xử lý giá trị rỗng'],
      ['—', 'Giao diện là SPA trên Workers Static Assets', 'Không kết xuất phía máy chủ, không SEO'],
      ['—', 'Chứng từ đã ký bất biến, cưỡng chế ở CSDL', 'Mọi sửa đổi thành luồng điều chỉnh'],
      ['—', 'Tác vụ nền: Cron gọi hàm SQL', 'Khó gỡ lỗi hơn mã TypeScript'],
      ['—', 'Ba lớp chặn quyền, chỉ lớp cuối là hàng rào', 'Quyền khai ở hai nơi, phải giữ đồng bộ'],
      ['—', 'Kết quả AI luôn là đề xuất', 'Không tự động hoá được khâu phát hành hồ sơ'],
    ],
    [0.7, 2.3, 2],
  ),

  // ------------------------------------------------------------- 14
  h1('14. Risks & Trade-offs'),
  table(
    ['Mã', 'Rủi ro', 'Ảnh hưởng', 'Hướng xử lý'],
    [
      ['R-1', 'Một project Supabase dùng chung cho máy phát triển và bản chạy thử', 'Chạy migration ở máy đổi luôn CSDL bản công khai; phép thử CSDL **xoá cứng** dữ liệu thử', 'Bắt buộc tách **trước dòng dữ liệu thật đầu tiên**'],
      ['R-2', 'Bảng nhật ký thao tác chưa có nguồn ghi nào', 'Không trả lời được "hôm qua ai sửa gì" theo chiều ngang', 'Chờ quyết định nghiệp vụ nào ghi vào đây'],
      ['R-3', 'Bảng việc cần làm có nhưng chưa dùng', 'Việc không gắn phê duyệt chỉ có thông báo một chiều', 'Bỏ hẳn hay dùng thật'],
      ['R-4', 'Ma trận quyền không có chiều pháp nhân', 'Nhân viên kinh doanh NVS dùng chung vai trò với khối Xưởng', 'Ghi nhận, chưa sửa'],
      ['R-5', 'Bảng thời hạn cam kết cố ý để rỗng', 'Cảnh báo quá hạn **chưa có căn cứ để chạy**', 'Chờ Ban Giám đốc, không nạp số tạm'],
      ['R-6', 'Không chặn người tự duyệt hồ sơ của mình', 'Kiểm soát yếu khi người lập và người duyệt cùng vai trò', 'Thêm một bước duyệt — bằng dữ liệu'],
      ['R-7', 'Phụ thuộc một nhà cung cấp nền dữ liệu', 'Supabase hỏng là hệ thống dừng', 'Chấp nhận ở giai đoạn demo'],
      ['R-8', 'Thư viện Supabase không coi mã 300 là lỗi', 'Truy vấn nhúng mơ hồ trả rỗng, màn hình đọc như "chưa có dữ liệu"', 'Đã có phép thử đọc mã nguồn canh thường trực'],
    ],
    [0.4, 1.5, 2, 1.8],
  ),

  // ------------------------------------------------------------- 15
  h1('15. Open Issues / TBD'),
  table(
    ['Mã', 'Câu hỏi còn mở', 'Chặn việc gì'],
    [
      ['TBD-1', 'Thời hạn cam kết phản hồi của từng phòng ban', 'Cảnh báo quá hạn của công trường'],
      ['TBD-2', 'Phương thức ghi nhận công tại công trường', 'Chấm công khối công trường'],
      ['TBD-3', 'Bộ mã vật tư, công trình, nhà cung cấp', 'Nhập liệu thật — đã có bản đề xuất chờ duyệt'],
      ['TBD-4', 'Phần mềm kế toán chính thức để tích hợp', 'Xuất dữ liệu sang kế toán'],
      ['TBD-5', 'Công thức lương', 'Tính lương từ bảng công'],
      ['TBD-6', 'Ngoại tuyến thật cho Kho hay chỉ trực tuyến', 'Thiết kế đồng bộ dữ liệu'],
      ['TBD-7', 'Tên miền chính thức, đầu mối hỗ trợ kỹ thuật', 'Nội dung thông báo lỗi, cấu hình nguồn cho phép'],
    ],
    [0.5, 2.3, 2.2],
  ),
  p('Danh sách đầy đủ kèm hiện trạng: `doc/VAN_DE_CON_MO.md`.'),

  // ------------------------------------------------------------- 16
  h1('16. Related Documents'),
  table(
    ['Tài liệu', 'Trả lời câu hỏi', 'Đường dẫn'],
    [
      ['PRD', 'Làm gì, ranh giới không làm', '`doc/PRD_He_thong_Quan_tri_NVG_v1_4.docx`'],
      ['BSD', 'Bảng, quan hệ, mẫu RLS, API đã đặc tả', '`doc/BackendSchema_Document_NVG_v1_1.docx`'],
      ['AFD', 'Màn hình, điều hướng, hành trình', '`doc/Webapp_Flow_Document_NVG_v1_1.docx`'],
      ['TSD', 'Thư viện, hạ tầng, CI/CD', '`doc/TechStack_Document_NVG_v1_2.docx`'],
      ['CGD', 'Nội dung hiển thị, màu, khoảng cách', '`doc/ContentGuidelines_Document_NVG_v1_2.docx`'],
      ['ADR', 'Vì sao chọn kiến trúc đó', '`doc/architecture/adr/`'],
      ['Kế hoạch triển khai', 'Thứ tự làm, hiện trạng từng phân hệ', '`BUILD_PLAN.md`'],
      ['Câu hỏi còn treo', 'Cái gì đang chặn cái gì', '`doc/VAN_DE_CON_MO.md`'],
      ['Đặc tả Thiết kế AI', 'Ràng buộc riêng của phân hệ TK-AI', '`doc/design/`'],
      ['Hàng rào cho người viết mã', 'Cái gì không được vượt', '`CLAUDE.md`'],
    ],
    [1, 1.8, 2.2],
  ),
);

const doc = buildDocument({
  headerText: 'SAD — Hệ thống Quản trị Nhà Việt Group — v1.0',
  children,
});

const out = process.argv[2] ?? 'doc/architecture/SAD.docx';
const buffer = await Packer.toBuffer(doc);
writeFileSync(out, buffer);
console.log(`Đã ghi: ${out} (${(buffer.length / 1024).toFixed(1)} KB)`);
