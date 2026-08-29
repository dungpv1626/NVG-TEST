# 10 — Bảng thuật ngữ và viết tắt

Mọi viết tắt dùng trong bộ tài liệu này đều có ở đây. Khi viết thêm tài liệu hoặc code
comment, **viết đầy đủ ở lần dùng đầu tiên trong mỗi file**, kèm dạng viết tắt trong
ngoặc, rồi mới được dùng dạng ngắn ở các lần sau. Viết tắt mới phải bổ sung vào bảng này.

## Chuyên ngành xây dựng và thiết kế

| Viết tắt | Dạng đầy đủ | Nghĩa |
|---|---|---|
| **NVG** | Nhà Việt Group | Công ty khách hàng |
| **KTS** | Kiến trúc sư | |
| **KT** | Kiến trúc | Một trong ba bộ môn của hồ sơ thiết kế |
| **KC** | Kết cấu | Bộ môn tính toán móng, cột, dầm, sàn |
| **DN** | Điện nước | Bộ môn hệ thống điện và cấp thoát nước |
| **M&E** | Mechanical and Electrical | Cơ điện — cách gọi khác của bộ môn điện nước, bao gồm cả điều hoà thông gió |
| **QCVN** | Quy chuẩn kỹ thuật quốc gia | Văn bản quy phạm pháp luật bắt buộc tuân thủ. Tài liệu này tham chiếu QCVN 01:2021/BXD |
| **BXD** | Bộ Xây dựng | Cơ quan ban hành QCVN 01:2021 |
| **PCCC** | Phòng cháy chữa cháy | |
| **WC** | Water closet | Khu vệ sinh |
| **QTO** | Quantity Take-Off | Bóc tách khối lượng — đo và tổng hợp diện tích, thể tích, số lượng để lập dự toán |
| **NVO-xxx** | — | Quy ước mã dự án của NVG, ví dụ `NVO026` |

## Định dạng tệp và tiêu chuẩn dữ liệu

| Viết tắt | Dạng đầy đủ | Nghĩa |
|---|---|---|
| **CAD** | Computer-Aided Design | Thiết kế với sự hỗ trợ của máy tính; ở đây chủ yếu là AutoCAD |
| **DWG** | Drawing | Định dạng tệp gốc của AutoCAD. Không thư viện mã nguồn mở nào ghi được trực tiếp |
| **DXF** | Drawing Exchange Format | Định dạng trao đổi bản vẽ, AutoCAD mở trực tiếp được. Đây là định dạng hệ thống xuất ra |
| **ODA** | Open Design Alliance | Tổ chức phát hành công cụ chuyển đổi DWG sang DXF miễn phí |
| **IFC** | Industry Foundation Classes | Tiêu chuẩn mở mô tả dữ liệu công trình, dùng để các bộ môn tham chiếu chung một hình học |
| **BIM** | Building Information Modeling | Mô hình thông tin công trình |
| **BREP** | Boundary Representation | Cách biểu diễn khối bằng mặt biên, chính xác hơn lưới tam giác |
| **glTF** | Graphics Language Transmission Format | Định dạng mô hình ba chiều dùng trên web |
| **SVG** | Scalable Vector Graphics | Ảnh vector hiển thị trên web |
| **JSON** | JavaScript Object Notation | Định dạng dữ liệu có cấu trúc dùng cho mọi ranh giới giữa các lớp |
| **YAML** | YAML Ain't Markup Language | Định dạng cấu hình dễ đọc, dùng cho rule pack |
| **PDF, PNG, XLSX** | — | Các định dạng tệp thông dụng |

## Kỹ thuật phần mềm

| Viết tắt | Dạng đầy đủ | Nghĩa |
|---|---|---|
| **AI** | Artificial Intelligence | Trí tuệ nhân tạo |
| **LLM** | Large Language Model | Mô hình ngôn ngữ lớn |
| **CP-SAT** | Constraint Programming — Satisfiability | Bộ giải ràng buộc của thư viện OR-Tools. Xem `04-layer3-floorplan.md` |
| **OR-Tools** | Operations Research Tools | Thư viện tối ưu hoá của Google, chứa CP-SAT |
| **SMT** | Satisfiability Modulo Theories | Loại bộ giải logic; Z3 thuộc nhóm này |
| **UNSAT** | Unsatisfiable | Trạng thái vô nghiệm — không tồn tại lời giải thoả mọi ràng buộc |
| **MMR** | Maximal Marginal Relevance | Thuật toán chọn kết quả vừa sát yêu cầu vừa khác nhau, tránh chọn trùng lặp |
| **DAG** | Directed Acyclic Graph | Đồ thị có hướng không chu trình — dùng mô tả quan hệ phụ thuộc giữa các artifact |
| **API** | Application Programming Interface | Giao diện lập trình để các hệ thống gọi nhau |
| **SQL** | Structured Query Language | Ngôn ngữ truy vấn cơ sở dữ liệu |
| **RLS** | Row Level Security | Phân quyền ở mức từng dòng dữ liệu, cưỡng chế bởi cơ sở dữ liệu thay vì bởi ứng dụng |
| **WASM** | WebAssembly | Định dạng mã chạy được trong trình duyệt với tốc độ gần mã máy |
| **TS** | TypeScript | Ngôn ngữ của phần Worker |
| **UI / UX** | User Interface / User Experience | Giao diện và trải nghiệm người dùng |
| **CI** | Continuous Integration | Tích hợp liên tục — hệ thống tự chạy kiểm thử khi có thay đổi mã nguồn |
| **DoD** | Definition of Done | Điều kiện xác định một mốc đã hoàn thành |
| **FK** | Foreign key | Khoá ngoại trong cơ sở dữ liệu |
| **SHA-256** | Secure Hash Algorithm 256-bit | Hàm băm dùng để định danh artifact theo nội dung |
| **semver** | Semantic Versioning | Quy ước đánh số phiên bản dạng major.minor.patch |
| **p95** | Phân vị 95 | Giá trị mà 95% số lần đo nằm dưới nó |
| **NULL** | — | Giá trị rỗng trong cơ sở dữ liệu; ở đây quy ước nghĩa là "dùng chung nền tảng" |

## Hạ tầng

| Viết tắt | Dạng đầy đủ | Nghĩa |
|---|---|---|
| **R2** | Cloudflare R2 | Dịch vụ lưu trữ tệp của Cloudflare, không thu phí truyền dữ liệu ra |
| **GPU** | Graphics Processing Unit | Bộ xử lý đồ hoạ, cần cho việc sinh ảnh phối cảnh |
| **VRAM** | Video RAM | Bộ nhớ của card đồ hoạ. Quyết định chạy được mô hình sinh ảnh nào |
| **CPU / vCPU** | Central Processing Unit / virtual CPU | Bộ xử lý trung tâm; vCPU là phần được chia cho một máy ảo |
| **RAM** | Random Access Memory | Bộ nhớ trong |
| **VPS** | Virtual Private Server | Máy chủ ảo thuê riêng |
| **IP** | Internet Protocol address | Địa chỉ mạng của một máy |
| **HTTP** | HyperText Transfer Protocol | Giao thức Worker gọi Container |

## Mô hình sinh ảnh

| Viết tắt | Dạng đầy đủ | Nghĩa |
|---|---|---|
| **SD / SDXL** | Stable Diffusion / Stable Diffusion XL | Dòng mô hình sinh ảnh mã nguồn mở |
| **FLUX** | — | Tên dòng mô hình sinh ảnh của Black Forest Labs |
| **ControlNet** | — | Kỹ thuật ép mô hình sinh ảnh bám theo hình học cho trước (bản đồ độ sâu, đường biên) |
| **ComfyUI** | — | Công cụ định nghĩa quy trình sinh ảnh dưới dạng tệp JSON |

## Thuật ngữ riêng của dự án

| Thuật ngữ | Nghĩa |
|---|---|
| **Wing** (cánh nhà) | Một hình chữ nhật thành phần của khối công trình. Nhà phố có một; biệt thự hình chữ L có hai |
| **Core** (lõi) | Dải chứa cầu thang, khu vệ sinh, hộp kỹ thuật. Vị trí dùng chung giữa các tầng |
| **Slicing tree** (cây chia không gian) | Cây nhị phân, mỗi nút là một lát cắt ngang hoặc dọc, mỗi lá là một phòng hoặc khoảng rỗng |
| **Layout intent** | Kết quả của lớp 3a: cấu trúc bố cục do mô hình ngôn ngữ sinh ra, chưa có kích thước chính xác |
| **Massing** | Bước đặt khối công trình trong lô đất: khoảng lùi, hình dạng khối, vị trí sân |
| **Void** | Lá đặc biệt của cây chia không gian, đánh dấu khoảng rỗng (giếng trời, sân trong, thông tầng) thay vì phòng |
| **Rule pack** | Tập quy tắc kiến trúc dạng YAML, có phiên bản, tách theo địa phương và bộ môn |
| **Artifact** | Kết quả bất biến của một lớp, định danh bằng hàm băm nội dung |
| **Lineage** | Chuỗi quan hệ cha–con giữa các artifact: đầu bài nào sinh ra mặt bằng nào |
| **Publish bridge** | Cầu nối đưa tài liệu đã phê duyệt từ module thiết kế sang hệ quản lý tài liệu chung |
| **Golden set** | Bộ dự án mẫu dùng để đo chất lượng hệ thống qua từng lần thay đổi |
| **Leave-one-out** | Cách đánh giá ở quy mô dữ liệu nhỏ: đo từng công trình trong khi loại chính nó khỏi tập tham chiếu |
| **Tenant** | Một khách hàng doanh nghiệp dùng hệ thống. NVG là tenant đầu tiên |
| **Stub** | Đoạn mã tạm, đúng contract nhưng chưa có cài đặt thật |
| **Contract** | Định nghĩa hình dạng dữ liệu ở ranh giới giữa hai lớp |
| **Worker / Container** | Hai môi trường chạy của module — xem `02-architecture.md` mục 2.2 |
| **Bong bóng trục** | Vòng tròn chứa ký hiệu trục lưới, đặt ở hai đầu mỗi trục trên bản vẽ |
| **Chuỗi kích thước** | Dãy đường ghi kích thước chạy dọc cạnh bản vẽ, hai lớp: từng khoảng và tổng |
| **Nét trục** | Đường gạch dài chấm ngắn đánh dấu trục lưới kết cấu |
| **Khu vẽ** | Vùng hiển thị bản vẽ ở giữa màn hình chỉnh sửa |
| **Trí nhớ cơ bắp** | Thói quen thao tác hình thành khi vị trí điều khiển không đổi |
