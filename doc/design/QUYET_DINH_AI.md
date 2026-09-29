# Nhật ký quyết định — Module Thiết kế AI (T1 → T57)

> Chuyển nguyên văn từ `CLAUDE.md` mục 8.5/8.5b ngày 19/09/2026 để CLAUDE.md gọn lại.
> Đây là **nhật ký**: nhiều mục đã bị mục sau thay thế (thường ghi rõ trong mục thay thế).
> T22–T36 bổ sung từ bản kế hoạch đợt 12/09/2026.
> Hiện trạng đang có hiệu lực tóm ở `CLAUDE.md` mục 8.3. Quyết định mới: thêm vào CUỐI tệp này.

## T1

**Vite SPA + Worker Hono**, KHÔNG Next.js

**Lý do / đánh đổi:** Tài liệu ghi "Next.js — kế thừa, không đổi" là **mô tả sai** nền tảng. Không nội dung nào cần Next.js

## T2

**Container Python + OR-Tools CP-SAT** cho Layer 3b

**Lý do / đánh đổi:** Cơ chế giả định của CP-SAT trả về **tập ràng buộc mâu thuẫn nhỏ nhất** — đó là thứ tạo ra tính năng phân tích tác động. Thay thế phương án cũ trong BUILD_PLAN ("thuật toán tự xây bằng TypeScript")

## T3

Giai đoạn dev **giữ gói Cloudflare Free** → `compute/` chạy bằng **Docker tại chỗ**, Worker gọi `localhost:8080` qua interface `ComputeBackend`

**Lý do / đánh đổi:** Containers không có trên gói Free. Khi nâng gói chỉ đổi một tệp sang `getContainer()`

## T4

**R2 cho artifact** (dữ liệu máy đọc) + **Supabase Storage cho hồ sơ phát hành** (đi qua `documents`/`document_versions`). Cài đặt qua interface `ArtifactStore`, adapter `supabase://` dùng ngay, adapter `r2://` viết sẵn

**Lý do / đánh đổi:** R2 cần bật thanh toán. Cùng khuôn với `RenderBackend` mà tài liệu đã dùng

## T5

Bảng module mang **cả `tenant_id` lẫn `company_id`**

**Lý do / đánh đổi:** `tenant_id` giữ đúng nguyên tắc 7 và sẵn sàng bán lại; `company_id` để artifact truy được về pháp nhân — bắt buộc theo mục 3.5

## T6

Quyền chuỗi qua bảng mới **`role_capabilities(role_id, capability)`**, khởi động chỉ với `design.*`

**Lý do / đánh đổi:** Ma trận `permissions` hiện chỉ tới mức module, không phân biệt được ba bộ môn. **Không sửa** ma trận cũ — 12 module đang chạy trên đó

## T7

**Dùng lại enum `design_discipline`** sẵn có. Ánh xạ: `KT→kien_truc`, `KC→ket_cau`, `DN→dien_nuoc`

**Lý do / đánh đổi:** Một bộ từ vựng duy nhất. Enum này đã có index phụ thuộc

## T8

Giai đoạn demo, mô hình ngôn ngữ **chỉ chạy dữ liệu giả lập hoặc ẩn danh**

**Lý do / đánh đổi:** Đầu bài khách hàng là dữ liệu hạng 1; gói Gemini miễn phí có thể được dùng để huấn luyện (mục 5.1). Lớp chặn `data_class` vẫn dựng ngay từ khung

## T9

~~Rule pack: **mọi giá trị QCVN 01:2021/BXD nằm ở `base/`**~~ — **thay bằng T42** (13/09/2026, `base/` đã xoá) (kể cả khoảng lùi, mật độ); `locality/<tỉnh>/` chỉ ra đời khi có văn bản quy hoạch của tỉnh để trích vào `source` — hiện chưa tỉnh nào có. Đầu bài chọn được **34 đơn vị hành chính**, nhóm đầu là Hưng Yên · Hải Phòng · Ninh Bình · Hà Nội

**Lý do / đánh đổi:** Thái Bình đã sáp nhập vào Hưng Yên (2025). Gói địa phương chép lại số của quy chuẩn quốc gia là bản sao thứ hai của cùng con số — sửa quy chuẩn thì bản sao không đổi theo, và không có gì báo

## T10

**Nhánh AI chạy SONG SONG bộ giải CP-SAT**, không thay thế. Người dùng chọn «Bộ giải nội bộ» hay «AI» + model ngay trên trang thiết kế

**Lý do / đánh đổi:** Bộ giải cho phương án hợp quy chuẩn, tất định, xuất được hồ sơ; AI cho tốc độ và ý tưởng. Ép chọn một là mất một nửa giá trị. 1.211 phép thử đang xanh không được vỡ

## T11

Đầu ra AI **cả hai dạng**: mặt bằng là **dữ liệu có cấu trúc**, còn phối cảnh/nội thất/mặt đứng/mặt cắt là **ảnh**

**Lý do / đánh đổi:** Dữ liệu có cấu trúc thì đọc được, so sánh được, cảnh báo được. Ảnh thì không — nhưng ảnh là thứ khách hàng hiểu ngay

## T12

Dữ liệu gửi cho nhà cung cấp: **đầy đủ TRỪ danh tính** (lược tên khách, điện thoại, địa chỉ, mã hồ sơ, ngân sách; giữ kích thước thật, gia đình, nhu cầu, phong cách, chữ tự do) → hạng 2

**Lý do / đánh đổi:** API TRẢ PHÍ của cả ba cam kết không dùng để huấn luyện. **Chính sách bám vào KHOÁ, không vào lời hứa** — nên `gemini_paid` là nhà cung cấp riêng với khoá riêng, tách hẳn gói miễn phí hạng 3

## T13

Ảnh đợt đầu làm **cả bốn loại**: mặt bằng có nội thất, phối cảnh ngoại thất nhiều góc, nội thất từng phòng, mặt đứng + mặt cắt

**Lý do / đánh đổi:** Anthropic không có mô hình ảnh — ô chọn ảnh chỉ có OpenAI và Google

## T14

**Nhánh AI là DÒNG RIÊNG, độc lập hoàn toàn với bộ giải** (09/09/2026). Đầu vào **chỉ đầu bài + khảo sát**, không tiêm ngưỡng quy chuẩn vào lời dẫn. Đầu ra **không** thành `floor_plan` chuẩn, **không** đi qua Container, **không** dùng lại SVG/DXF/glTF/thống kê/phát hành. **Mô hình TỰ VẼ tờ bản vẽ** — Haan đã thử thực tế và đánh giá làm tốt; ảnh trình khách dựng từ chính tờ đó (ảnh→ảnh, giữ bất biến 1). Lệch quy chuẩn QUỐC GIA (`rules/base/`) hiện thành **cảnh báo**, không chặn và không tự sửa

**Lý do / đánh đổi:** Thay phương án Đợt 3 cũ (Container snap → sửa → `evaluate_violations` → `floor_plan`). Lý do đổi: bó nhánh AI bằng đúng ràng buộc của bộ giải là dựng lại bộ giải bằng công cụ dở hơn — mất chính thứ làm nhánh AI có giá trị. Đánh đổi đã biết và chấp nhận: **kết quả AI không xuất được DXF cho người vẽ, không lên hồ sơ phát hành, không có bảng thống kê**. Muốn hồ sơ thì chạy bộ giải

## T15

**AI thiết kế, chương trình cầm bút.** Mô hình khai TOÀN BỘ nội dung bản vẽ dạng dữ liệu (từng đoạn tường + bề dày, cửa/cửa sổ + chiều mở, thang, tên + diện tích); bộ vẽ SVG tất định trong Worker (`ai/draw/`) đặt lên giấy. Chuỗi kích thước do bộ vẽ SUY từ toạ độ tường, không hỏi mô hình

**Lý do / đánh đổi:** Thay T14 «mô hình tự vẽ SVG». Dữ liệu kiểm được, tệp vẽ thì không. Bắt mô hình khai lại chuỗi kích thước là thêm ~30% token và thêm một cách sai mới — một chuỗi cộng không ra tổng là bản vẽ không kiến trúc sư nào tin

## T16

Phối cảnh qua bước trung gian **ý tưởng mặt đứng**: AI đề xuất mái, vật liệu, màu, cổng, ban công dạng dữ liệu + mặt đứng chính vẽ bằng cùng bộ vẽ; kiến trúc sư sửa được **trước khi trả tiền ảnh**. Ảnh chính diện ban ngày là **ảnh neo**, bốn góc còn lại dựng ảnh→ảnh từ nó

**Lý do / đánh đổi:** Đầu bài **không có** trường mái/vật liệu/màu/cổng/ban công — đo 09/09: cả hợp đồng chỉ có `style` (1 trong 9) và một ô ghi chú. Đưa chừng đó cho mô hình ảnh thì năm tấm ra năm ngôi nhà khác nhau

## T17

Giao diện: **tab riêng «Thiết kế AI»** với dải bốn bước. Hai tab của bộ giải giữ nguyên tới ngày dọn

**Lý do / đánh đổi:** Trộn hai nhánh vào cùng màn hình thì con số hiện ra không rõ của bên nào, và ngày dọn phải gỡ từng khối khỏi panel bên kia

## T18

**Hai bước**: chương trình không gian (AI, viết lại sạch) rồi mặt bằng

**Lý do / đánh đổi:** Lượt gọi nhỏ hơn nên ít bị cắt giữa chừng, chỗ sai dễ khoanh, và kiến trúc sư duyệt danh sách phòng trước khi vẽ

## T19

Tường mô hình khai sai sau **một lượt sửa** → **chương trình suy tường từ phòng** (cạnh chung = vách, cạnh biên = tường bao), ghi rõ trên tờ «Tường do chương trình suy từ phòng, không phải của AI»

**Lý do / đánh đổi:** Tờ vẽ vẫn dùng được, và chỗ suy hộ vẫn nhìn thấy. Trả về một tờ vẽ hỏng rồi bắt bấm lại là tốn thêm một lượt tính tiền

## T20

**Hai gói quy tắc, kỹ sư tự chọn, mặc định TẮT CẢ HAI.** «Quy chuẩn quốc gia» (`rules/base/`, 18 quy tắc QCVN/TCVN) và «Kinh nghiệm nghề NVG» (`rules/nvg-experience.yaml`, 23 quy tắc) là hai ô tích riêng trên màn hình. Gói đã tích tác động **CẢ HAI CHIỀU**: đưa vào lời dẫn để mô hình làm theo, VÀ dùng để đối chiếu kết quả

**Lý do / đánh đổi:** Thay một phần T14 («lời dẫn không tiêm ngưỡng»): nay kỹ sư quyết theo từng hồ sơ, còn mặc định vẫn là không tiêm gì. Phải tách hai gói vì đo 09/09/2026 thấy `rules/base/` trộn 18 quy tắc pháp quy với 23 quy tắc thói quen, nên màn hình báo «phòng khách dưới mức tối thiểu 14 m²» y như một vi phạm quy chuẩn, trong khi 14 m² chỉ là cách NVG quen làm

## T21

**Tờ mặt bằng công năng do MÔ HÌNH ẢNH vẽ** (10/09/2026). Mô hình văn bản vẫn khai mặt bằng dạng dữ liệu VÀ khai thêm `levels[].sheet_prompt`; một lượt gọi mô hình ảnh dựng tờ giấy từ đoạn mô tả ấy. **Không có ảnh neo** — mô hình ảnh chỉ nhận chữ. Vẽ **theo yêu cầu, từng tầng một** (`POST /design/ai/plan/:id/sheet-image`), không chạy sẵn trong lượt chạy nền. Bộ vẽ vector `ai/draw/` **GIỮ NGUYÊN**, tụt xuống làm bản đối chiếu kích thước

**Lý do / đánh đổi:** Thay phần VẼ của **T15**, giữ nguyên phần «mô hình khai dữ liệu» — dữ liệu vẫn là nguồn duy nhất đo diện tích và đối chiếu quy chuẩn. Lý do đổi: bộ vẽ tất định qua hai vòng sửa vẫn không cho ra tờ vẽ một kiến trúc sư chấp nhận được. **Đánh đổi đã biết và đã chấp nhận:** hình trên giấy KHÔNG khớp chính xác bảng diện tích, và vẽ lại cùng một tầng ra một tấm khác — đó là cái giá của việc bỏ ảnh neo. Vẽ theo yêu cầu vì chạy sẵn cả loạt là 9 tấm (0,36–1,71 USD) cho một lần bấm, trong khi kiến trúc sư chỉ đọc kỹ một phương án

> **T22–T36** chép nguyên văn ngày 19/09/2026 từ bản kế hoạch đã duyệt `~/.claude/plans/fancy-weaving-bird.md`
> (đợt «thiết kế lại luồng mặt bằng», 12/09/2026). Diễn biến triển khai ở `TIEN_DO_THIET_KE.html`.

## T22

**Đảo T21: tờ SVG tất định là tờ CHÍNH; gỡ đường sinh ảnh cho mặt bằng.** Giữ `render-store.ts`

**Lý do / đánh đổi:** Ảnh không đo được. Giữ `render-store.ts` vì Đợt 5 (bộ ảnh phối cảnh) cần nó và `ai-independence.test.ts` đã khai trước tệp đó — gỡ là phải viết lại

## T23

**Mô hình khai PHÒNG, không khai tường.** Cửa/cửa sổ neo vào `{phòng, cạnh, cách đầu cạnh, bề rộng}`. Tường suy từ phòng **luôn luôn**, bề dày từ `kb/construction_norms.yaml`

**Lý do / đánh đổi:** Cắt ~4.710 ký tự lược đồ, cắt phần lớn 13.2k token đầu ra, và **xoá hẳn 6 trong 21 phép kiểm chặn**. Đánh đổi: không diễn đạt được vách tự do không phải ranh giới phòng — chấp nhận được ở bước thiết kế sơ bộ. Nới điểm 2 của 8.2 **không rộng thêm**: mô hình vẫn khai chữ nhật như hôm nay, chỉ bớt việc

## T24

**Tách CỔNG khỏi ĐIỂM.** Cổng = dữ liệu tự mâu thuẫn, đạt/không, không có điểm. Điểm = chất lượng kiến trúc, chỉ chấm trên bản đã qua cổng

**Lý do / đánh đổi:** Một mặt bằng có hai phòng chồng lên nhau không phải «80 điểm», nó là dữ liệu hỏng. Trộn hai thứ vào một số thì không ai biết 62 điểm nghĩa là sai dữ liệu hay bố cục chưa hay

## T25

**Làm lại = LẤY MẪU MỚI, không phải vá ngữ cảnh cũ.** Lời dẫn mới + ghi chú ngắn «tránh những chỗ này»; **không gửi lại bản cũ**. Giữ bản ĐIỂM CAO HƠN

**Lý do / đánh đổi:** Đúng trực giác của Haan, và có số đo: một lượt vá gửi lại cả bản cũ (~15.000–20.000 ký tự) nên **vá ĐẮT HƠN lấy mẫu mới**, trong khi tỷ lệ cứu được thấp. Ghi chú ~200 token thay vì cả bản cũ

## T26

**Chế độ ăn token**: bỏ văn xuôi trùng khỏi lược đồ, nén JSON, cắt lời dẫn phần nói về tường

**Lý do / đánh đổi:** ~30% đầu vào, xem mục 6. Không đánh đổi gì — đây là byte dư thật

## T27

**Điểm có SỐ PHIÊN BẢN** (`score_version`), lưu cùng artifact

**Lý do / đánh đổi:** Đổi công thức chấm là mọi điểm cũ hết so sánh được. Không có số phiên bản thì bảng lịch sử so model bằng hai thước khác nhau mà không ai biết

## T28

**Bộ vẽ SVG là mảng việc riêng** (mục 7), bắt đầu bằng lỗi sai mốc kích thước

**Lý do / đánh đổi:** Xem 2.3. Không làm mảng này thì hai mảng kia vô nghĩa với kiến trúc sư

## T29

**Cổng và điểm là hai thứ khác nhau**: ① cổng dữ liệu (tự mâu thuẫn → không chấm, không vẽ) ② điểm chất lượng 100. **Không có tầng pháp quy** sau T30

**Lý do / đánh đổi:** `scoring.yaml` đặt vi phạm văn bản thành **cổng trọng số 0**, không thành nhóm điểm — và lý lẽ đó đúng: cho một điều khoản pháp quy 10 điểm nghĩa là nói «vi phạm cũng được, miễn chỗ khác bù lại». Bản trước của tài liệu này đặt F thành nhóm điểm 10 — sai. Sau T30 thì tầng ấy rỗng nên bỏ hẳn, nhưng **nguyên tắc giữ lại cho ngày có quy tắc đã kiểm** (T34)

## T30

**Nhánh AI KHÔNG kiểm pháp quy.** Bỏ cả TCVN lẫn QCVN: `nationalRulePack()` trả gói RỖNG, ô tích «Quy chuẩn quốc gia» gỡ khỏi màn hình, T20 còn **một** gói. Màn hình phải **nói ra** rằng không kiểm quy chuẩn (Haan quyết 12/09/2026)

**Lý do / đánh đổi:** Không dựng cổng pháp lý trên chứng cứ chưa kiểm được. Đo thử thì **bỏ đi còn tốt hơn giữ**: 2 quy tắc QCVN **bắt oan trên nhà đã xây**, 1 quy tắc **chưa từng chạy**, 6 cái đã được bộ đo thật hoặc cổng dữ liệu phủ tốt hơn, 3 cái là no-op. Và nó **nhất quán với nguyên tắc 9** của 8.2: tuân thủ pháp lý là việc của người có chứng chỉ hành nghề ký, không phải của engine. Xem **5.2c**

## T31

**Tiêu chí chấm mang `n` và nhãn `[ĐO]`/`[CHUNG]`, và màn hình NÓI RA phần điểm dựa trên ngưỡng chưa đo**

**Lý do / đánh đổi:** A1 và A2 (13/100 điểm) có `n = 0`: ngưỡng hoàn toàn là suy luận. Trộn chúng vào một con số 100 với 13 tiêu chí đã đo là đúng thứ 5.2 cấm — «Chưa đủ dữ liệu» phải nhìn thấy được ở mức từng tiêu chí, không chỉ mức nhóm

## T32

**Hai mã phòng mới: `porch` (sảnh ngoài nhà) và `vanity` (hốc lavabo).** Không phải chuyện đặt tên — xem 5.4

**Lý do / đánh đổi:** Hồ sơ thật có 2 sảnh và 1 hốc lavabo; xếp chúng vào `circulation` thì quy tắc `circulation ≥ 1,1 m` **báo vi phạm trên công trình đã xây** (hốc lavabo P2 rộng 1,05 m). Mã mới là cách bỏ một cảnh báo sai, không phải cách làm đẹp từ vựng

## T33

**Bước 2 xuất được DXF cho kỹ sư sửa tiếp** (Haan quyết 12/09/2026). Bộ ghi bằng TypeScript trong `ai/dxf/`, dùng chính hình học `ai/draw/` đã tính, theo `chuan_ban_ve.yaml`. **Một chiều**: không đọc lại tệp đã sửa; tệp quay về qua `documents`/`document_versions`. Xem 7.2

**Lý do / đánh đổi:** **Đảo một phần T14** («kết quả AI không xuất được DXF cho người vẽ»). Một mặt bằng kỹ sư không mang được vào CAD là đường cụt — và chính nó làm tờ SVG ở mục 7 có ích hơn, chứ không thừa: tờ SVG để ĐỌC và duyệt, tệp DXF để LÀM TIẾP. Viết trong Worker vì bộ ghi `ezdxf` của Container hiện chỉ chạy bằng Docker tại chỗ (T3), nên đi đường đó thì nút này **chết trên bản deploy** cho tới khi nâng gói Workers Paid

## T34

**Điều kiện để bao giờ thêm lại một quy tắc pháp quy**: số hiệu văn bản **+ số mục** + `xac_minh` (kiểm bằng cách nào) + `hieu_luc_tu`/`hieu_luc_den`, **và bản văn bản phải có trong repo**. Thiếu một trong bốn thì vào gói kinh nghiệm, mức `warning`

**Lý do / đánh đổi:** Đây là rào chắn cho đúng cách 18 quy tắc kia đã vào: không ai kiểm, không ai thấy là chưa kiểm. Viết thành điều kiện có phép thử canh thì lần sau không lặp lại được bằng thiện chí

## T35

**DXF chỉ mở sau khi KỸ SƯ nói đạt** (Haan quyết 12/09/2026). «Đạt» là định nghĩa của kỹ sư, xem bằng mắt trên tờ SVG — **điểm số không gác nút này**, cả khi điểm cao lẫn khi điểm thấp. Một dòng `duyet` cho **đúng mã băm** artifact ấy mới mở được nút. Xem 7.3

**Lý do / đánh đổi:** Đây là chỗ PRD 2.3 và 5.1 đòi sẵn: mọi kết quả AI là **nháp/đề xuất** tới khi người có thẩm quyền xác nhận. Và nó là điểm đầu tiên trong cả luồng có **tên người** gắn vào — nguyên tắc 9 của 8.2 nói tuân thủ là việc của người ký, thì đây là chỗ ký. Lợi thêm: tệp DXF mang được tên người xác nhận thay vì một câu cảnh báo chung

## T36

**Vẽ nội thất, và vẽ cho tốt** (Haan quyết 12/09/2026). Chương trình đặt đồ **tất định** từ `kb/furniture.yaml` theo loại phòng + chữ nhật phòng + vị trí cửa/cửa sổ — **mô hình không khai toạ độ đồ đạc**. Đặt không nổi thì **để trống VÀ nói ra**, không âm thầm bỏ. Lớp riêng `NV-NoiThat` nên trong DXF nó cách kỹ sư **một cú tắt lớp**. Xem 7.4

**Lý do / đánh đổi:** **NVO vẽ nội thất ở CẢ HAI hồ sơ thật** (`!NOITHAT` / `NV-NoiThat`, color 32) — nó là phần của thứ họ gọi là mặt bằng công năng. Và nó là thứ làm cổng T35 có nghĩa: một phòng ngủ 2,35 m **qua hết mọi phép kiểm** mà không kê nổi giường cộng lối đi, thì chỉ bộ đồ vẽ ra mới thấy. Tất định vì 8.2 điểm 2 (mô hình không sinh toạ độ) và vì token: T23 vừa cắt phần ấy, không mua lại

## T37

**Mô hình khai CÂY CHIA, chương trình gán số** (13/09/2026). Hợp đồng `contracts/ai-plan-tree` — MỘT tầng: `footprint`, nút cắt phẳng (`cut`, `at` = tim tường, `a` phía toạ độ nhỏ), lá = mã phòng / `unbuilt_N` / `void_N`, `doors[{a,b,kind}]`, `stair{room,up}`, `no_window`. `ai/tree/` suy kích thước lọt lòng, diện tích, hình bao, cửa, cửa sổ, số bậc, rồi đổ ra `ai-plan-rooms` (nay là hợp đồng NỘI BỘ) để `plan-geometry`/`plan-check`/`draw/` dùng lại nguyên

**Lý do / đánh đổi:** Lượt thật 13/09 (gpt-5, cả nhà một lượt): 42 lỗi chặn, 7 cặp phòng chồng nhau, 91 m² sàn trống, 90–93% token ra là phần nghĩ. Chồng lấn và sàn trống không diễn đạt được bằng cây. Mượn Ý của `layout-intent`, không import mã bộ giải. Đánh đổi: không có bố cục chong chóng và phòng chữ L

## T38

**Mỗi tầng một lượt gọi.** Tầng 1 trước; tầng ≥ 2 song song, nhận mốc ô thang/giếng trời của tầng 1; chương trình dời vách ≤ 30 cm để bám mốc (có ghi chú), lệch hơn là lỗi cổng

**Lý do / đánh đổi:** Không gian lỗi nhỏ hẳn, tầng hỏng không kéo tầng kia. ⚠️ `checkStairs` không so ô thang tầng TRÊN CÙNG (không có `stairs[]`) — bám mốc đang che lỗ này (V-25)

## T39

**Cổng hỏng thì không lưu, không vẽ.** Gọi lại đúng một lần mỗi tầng: lời dẫn `resample` + ghi chú tiếng Anh dựng từ mã lỗi (`floor_level.hints`). ⚠️ Sửa 13/09/2026 (V-26): trước đó chương trình TỰ SỬA tôpô cửa (`ai/tree/openings.ts`, nhóm `door_hosts`); cây còn ≤ 6 lỗi thì lượt hai là `revise` **có gửi cây cũ**, hỏng nặng hơn mới dựng mới. Vẫn hỏng → `failed[].reasons` theo tầng. Gỡ hẳn `repair`/`previous`/`keepRepaired`

**Lý do / đánh đổi:** Haan chốt. Lượt vá đo thật: 0,34 USD, không giảm được lỗi nào. Thay «vẫn lưu kèm lỗi» của T15

## T40

**Cửa sổ, chiều mở cửa, số bậc do chương trình quyết.** Mô hình chỉ từ chối cửa sổ qua `no_window`. `also` chỉ nhận cặp loại trong `kb/room_vocabulary.yaml` `merge_allowed`; quy cách cửa/thang ở `kb/construction_norms.yaml` (`openings.door_by_kind`, `stairs`). ⚠️ Thêm 13/09/2026 (V-27): **không phòng nào vào bằng cách đi xuyên phòng riêng** — luật ở `kb/room_vocabulary.yaml` mục `passage`, cổng `ai/tree/passage.ts` (`room_through_private`); và **vị trí vách cũng do chương trình căn** theo diện tích chương trình (`ai/tree/sizing.ts`, giữ tôpô, chỉ nhận khi qua cổng và sát hơn) — mô hình giữ phần tôpô

**Lý do / đánh đổi:** Lượt 13/09 nhét hành lang vào `also` và để thang không có cửa. Mỗi trường bớt khỏi hợp đồng là một phép số học bớt giao cho mô hình

## T41

**Đầu bài đã khai là RÀNG BUỘC, phần không khai mới là chỗ sáng tạo** (13/09/2026). Đầu bài 1.4.0 thêm lối vào chính, lối xe, tường chung/riêng, khoảng sân theo mặt, số xe. Bộ kiểm đầu bài bắt mâu thuẫn nội tại; mức nghiêm trọng chặn Lớp 2 và nhánh AI (`brief/gate.ts`). Bước chương trình không gian kiểm tầng ghim, diện tích ghim (±`kb/brief_fidelity.yaml`), khép kín, nhu cầu riêng từng phòng, chỗ đỗ, thang mọi tầng; sân trừ vào sàn xây được; mặt bằng đặt cửa chính/cửa xe đúng mặt

**Lý do / đánh đổi:** Haan: «sáng tạo nhưng phải sát với đầu bài, không conflict». Đầu bài demo từng được chấm «98%, 0 chỗ chưa nhất quán» trong khi phòng khép kín lệch tầng, đòi ba sân không kích thước, hai cánh mà hình chữ nhật — và mô hình thấy đủ các trường ấy nhưng không bị kiểm, lời dẫn còn dặn «diện tích là việc của bạn». Số chỗ đỗ, sai số là SỐ THAM KHẢO, sửa ở `kb/`

## T42

**Bỏ quy chuẩn Việt Nam khỏi TOÀN BỘ bộ giải** (13/09/2026, Haan: «bỏ quy chuẩn VN đi»). `rules/base/` (QCVN 01:2021/BXD, TCVN) đã xoá. Bộ giải — cả Worker (`rulePackFor`) lẫn Container (`load_for_locality`) — nay đọc `rules/structure/` (ba ràng buộc bố cục: thang và hộp kỹ thuật thẳng hàng, mọi phòng có lối vào; nguồn `nguyên lý bố cục`, mức `error`) + `rules/nvg-experience.yaml` (mức `warning`). Khoảng lùi và mật độ CHỈ lấy từ đầu bài; để trống = không giới hạn. Gói cũ chép vào dữ liệu kiểm thử (`__tests__/fixtures/rules-legacy-base`, `compute/tests/fixtures/rules-legacy-base`) chỉ để kiểm CƠ CHẾ đối chiếu

**Lý do / đánh đổi:** Thay T9 và phần «ngưỡng quy chuẩn» của 8.2 cho bộ giải. Lý do đo được: bộ số QCVN dùng một mức cố định cho mỗi loại nhà (biệt thự luôn 60 %) trong khi văn bản tính theo diện tích lô, và ép thắng số đầu bài khai khiến màn hình nói khác người dùng. Đánh đổi đã biết: bộ giải không còn tự chặn phương án lệch quy chuẩn — kỹ sư có chứng chỉ chịu trách nhiệm (nguyên tắc 9). Kèm sửa: Container trước đó không đọc gói kinh nghiệm nên `garage_on_access_face`, `outdoor_on_open_face`… không tới được bộ giải

## T43

**Mô hình khai Ý ĐỊNH BỐ CỤC, chương trình xếp phòng** (14/09/2026, Haan chốt). Hợp đồng gửi đi `contracts/ai-plan-intent` — MỘT tầng: mỗi phòng một vùng trong chín vùng của khối nhà (`front_left`…`back_right`, lô dưới 7,5 m chỉ còn một cột/hàng) + `street_facing`, quan hệ `adjacent`/`near`/`far`/`open`, `entry_room`, `garage_room`. KHÔNG toạ độ, KHÔNG cây, KHÔNG cửa. Bộ giải tất định `ai/arrange/` dựng nhiều cây `ai-plan-tree` ứng viên, đặt cửa theo luật đi xuyên, đưa qua cổng `ai/tree/` KHÔNG ĐỔI, chấm bằng `plan-score` + độ khớp ý định, chọn một cây. `ai-plan-tree` nay là hợp đồng NỘI BỘ. Đầu bài + khảo sát gửi cho CẢ HAI bước dạng **văn xuôi tiếng Việt** trong `<brief>` (`brief/narrative.ts`), dữ liệu máy trong `<knowledge>`; mốc tầng dưới gửi dạng VÙNG. Gọi lại tối đa một lần: sai hợp đồng → lấy mẫu lại; lý do ở ý định (`REVISABLE_CODES`) → gửi lại ý định cũ để sửa; lý do thuần hình học (chương trình vượt khối xây, thang lệch mốc) → **không gọi lại**. Lời dẫn `kb/ai_design_prompts.yaml` 3.0.0

**Lý do / đánh đổi:** Thay phần «mô hình khai cây chia» của T37 và lượt `revise` gửi cây của T39/V-26. Lý do đo được: trên lượt thật 13/09/2026 `tree/sizing.ts` đã ghi đè mọi `at` mô hình khai, còn lại tôpô — và tôpô là chỗ hỏng (V-26, V-27); mỗi tầng 127–294 s, 90 % token ra là phần nghĩ. **Cứng/mềm** (Haan: «kinh nghiệm từ hồ sơ thật chỉ là tham khảo»): chỉ bác khi không dựng được hoặc không đi được — vùng mô hình khai là ưu tiên, dồn cả tầng vào một vùng vẫn xếp được, chỉ tụt độ khớp ý đồ. Đánh đổi đã biết: bộ giải không sinh `void_N`, sân trong chỉ là phòng `courtyard`; hình L/U chỉ bằng khoét góc. **Đo thật 16/09/2026 (lượt 58d9ff66, gpt-5)**: một lượt gọi lưu được phương án đầu tiên cho biệt thự demo — 47.648 token ra, 20,4 phút, 0,48 USD (lời dẫn 5.0.0: 16.259 token, 2,3 phút, 0,17 USD). Bản phác CHƯA qua thẳng cổng ở tầng nào; sau vòng sửa mã, chỗ còn lại là thứ mô hình vẽ: WC chung và kho không có lối ra ở tầng 1, bố cục chong chóng ở tầng 2

## T44

**Cạnh DÙNG ĐƯỢC là điều kiện dựng của bộ giải ý định** (14/09/2026, V-28, Haan duyệt). `kb/construction_norms.yaml` mục `usable`: cạnh ngắn lọt lòng theo loại phòng + tỉ lệ dài/rộng tối đa của phòng ở; bộ xếp dùng làm sàn khi chia ô, lọc trước cổng, cổng bác bằng `arrange_room_too_narrow` (không gọi lại mô hình). Không áp tỉ lệ cho phòng khép kín. Bước chương trình không gian KHÔNG nhận mục này. Kèm: tầng trên thử dải hành lang áp sát ô thang tầng dưới làm ô khoét thứ hai

**Lý do / đánh đổi:** Khác ngưỡng kinh nghiệm `rules/nvg-*` (vẫn chỉ vào điểm): đây là giới hạn đồ đạc. Lượt thật 9cce001a qua cổng với phòng ngủ 1,78 × 14,6 m vì cạnh ngắn chỉ bị trừ điểm. Số là SỐ THAM KHẢO, thấp hơn mức nhỏ nhất đo được trên hồ sơ NVG (Q-44)

## T45

**Một lượt gọi cho CẢ NHÀ, chỉ từ đầu bài + khảo sát** (15/09/2026, Haan chốt Q-45). Hợp đồng gửi đi `contracts/ai-house-intent`: mọi phòng mọi tầng (loại, diện tích mục tiêu, vùng, quan hệ, lối vào); chương trình không gian KHÔNG vào lời dẫn. Bộ kiểm đầu bài T41 chạy trên danh sách ấy; bộ giải xếp từng tầng; sửa tối đa ba lượt (`HOUSE_REVISIONS_MAX`) — **chỉ cho lỗi NGỮ NGHĨA** (`REVISABLE_CODES`: danh mục sai đầu bài, dồn vùng, m² vượt khối xây, cửa chính/cửa xe sai mặt); lỗi HÌNH HỌC thì bộ xếp tự thử hết (vòng nới cuối bỏ vùng) rồi dừng, không gọi lại (tài liệu bàn giao mục 08, Haan duyệt 15/09/2026). **Diện tích tối thiểu đầu bài khai là sàn CỨNG** — cả ở bộ chia ô (`areaFloor`, lọc trước cổng) lẫn cổng (`arrange_room_below_brief_area`); phòng không khai thì mô hình tự suy. **Ô thang phải đủ dài cho số bậc** (`arrange_stair_too_short`, `stairs.going_m`). **Một ô thang mỗi tầng**: loại sau của `stair_types` (lõi thang) gộp vào loại đầu (`foldStairCore`), mô hình không thấy mã `core` — lượt đo 4a521f52 khai cả hai và hỏng cả bốn lượt. Tầng trên: bộ chia phòng vào vùng phạt vùng vượt **sức chứa** và phòng cần cửa quá nhỏ cho **chiều sâu** vùng (V-29). Lời dẫn 4.0.0. Chưa làm: DXF bằng TypeScript trong Worker, trình sửa kéo vách + đổi chỗ phòng

**Lý do / đánh đổi:** Thay «mỗi tầng một lượt» của T38/T43. Tầng gọi song song không thống nhất được danh mục phòng giữa các tầng. Sàn đầu bài từng chỉ kiểm ở cổng: lượt đo 5aba737d (gpt-5, 0,435 USD) hỏng cả bốn lượt vì bộ chia ô co phòng dưới mức, mô hình sửa ý định không gỡ được. Tầng 2 biệt thự 15 phòng vẫn chưa dựng được đường vào (V-29)

## T46

**Lời dẫn tối giản** (15/09/2026, Haan: «ưu tiên giữ đầu bài, khảo sát, đầu ra mong muốn; phần còn lại tối giản hoặc loại bỏ»). `planContext` giữ `knowledge` ĐẦY ĐỦ cho bộ kiểm và gửi `modelKnowledge` (`HouseModelKnowledge`): mã → tên loại phòng, phòng ngủ theo nhóm, sàn tầng, khối nhà, mặt thoáng, ô thang, chỗ để xe, luật khép kín và đi xuyên, ý đồ phương án. Bỏ: danh sách không gian đầu bài (văn xuôi đã có), quy cách cửa/cửa sổ/lan can, ví dụ mẫu, `$comment`/mô tả gốc của lược đồ gửi đi; lượt sửa không gửi lại `rationale`/`assumptions`. Lời dẫn 5.0.0

**Lý do / đánh đổi:** Đo trên đầu bài biệt thự thật: ~25.000 → 9.325 ký tự (−63%). Có phép thử canh: mọi `knowledge.<khoá>` lời dẫn nhắc đều có trong tri thức gửi đi và ngược lại (`ai-plan.test.ts`), trần kích thước (`token-diet.test.ts`). Ví dụ nhà ống cũ giữ làm fixture `TUBE_HOUSE`. **Chưa đo trên mô hình thật**

## T47

**Nhánh AI xuất DXF bằng TypeScript trong Worker** (15/09/2026, Haan chốt Q-45a). `ai/dxf/`: R12 ASCII, mm, mọi tầng cạnh nhau trong modelspace; hình lấy từ CHÍNH phần thân tờ SVG (`renderPlanBody`) qua bộ đổi toạ độ 1:100 rồi đổi thẻ SVG → LINE/ARC/TEXT/POLYLINE; thêm đường bao tim từng phòng và câu cảnh báo AI. Lớp CAD đọc `kb/layer_mapping.yaml` mục `export`. `GET /design/ai/plan/:projectId/dxf`, nút «Tải DXF cả nhà»

**Lý do / đánh đổi:** Ngoại lệ có chủ đích của 8.3 («đọc/ghi tệp CAD ở Container»): Container thuộc bộ giải sẽ bị xoá (8.5b). Đi qua SVG để tệp CAD không lệch tờ đã duyệt. Đã kiểm bằng ezdxf trong ảnh Docker: 0 lỗi, chữ tiếng Việt `\U+XXXX` giải mã đúng. Vẫn MỘT CHIỀU

## T48

**Mô hình VẼ bản phác lưới mỗi tầng, chương trình nắn và căn vách** (16/09/2026, Haan chốt hướng B + A). `ai-house-intent` bỏ `zone`/`street_facing`, thêm `sketches[{level, rows}]`: lưới ô ~1 m (`knowledge.sketch_grid`, ô to lên khi khối dài hơn 24 m), mỗi ô một mã phòng, `.` là sân ở mép. `arrange/sketch.ts` nắn hàng lệch, mã lạ, ô trống, phòng không chữ nhật → tách chém → ba cách căn vách → ĐI QUA cổng hiện có trước mọi khung; không qua thì xếp theo vùng SUY TỪ bản phác (ghi chú `sketch_fallback`). Lỗi của chính bản phác (`sketch_room_missing`, `sketch_not_rectangular`, `sketch_pinwheel`, `sketch_rooms_too_small`) là NGỮ NGHĨA. Nắn được bằng mã thì nắn: phòng KHÉP KÍN vẽ lọt giữa phòng mẹ thành dải áp một cạnh; ô thang tầng trên ép về đúng ô tầng dưới; căn vách giữ cạnh nhỏ nhất của từng phòng (ô thang theo số bậc), rồi dời vách cục bộ cho phòng còn hẹp, quá tỉ lệ hay hụt sàn đầu bài. Phòng KHÔNG khép kín mà vẽ lọt giữa phòng khác là lỗi bố cục của mô hình (`sketch_island_room`), không nắn hộ. Hướng A: tầng không khai hành lang mà không cây nào qua cổng thì chương trình thêm một `circulation` và thử lại (`arrange_hall_inserted`). Ô thang có thang đi lên không nhỏ hơn thang hai vế hẹp nhất dựng được. Ý định theo vùng (trước T48) vẫn đọc được — chỉ để phát lại lượt đo cũ. Lời dẫn 6.0.0

**Lý do / đánh đổi:** Nới thêm nguyên tắc 2: bản phác là toạ độ THÔ một mét — mô hình quyết tôpô và tỉ lệ gợi ý, chương trình vẫn gán mọi số. Lý do: lượt 5fda70dc — chín vùng không nói được «WC ở đầu hồi phòng ngủ», tầng 1 không hành lang thì WC không cửa; cùng đề bài ChatGPT phác bố cục đọc được. Lưới ô không chồng lấn, không sót sàn theo cấu tạo — hai lỗi T37 không chặn được. **Chưa đo trên mô hình thật**

## T49

**Đường đi hằng ngày là lỗi CHẶN; định mức nghề chỉ TRỪ ĐIỂM; ô gộp phải đọc được trên bản vẽ** (16/09/2026, Haan chấm lượt 58d9ff66 «chưa đạt»). (a) `route_through_service`: từ chỗ sinh hoạt chung (`passage.everyday_from`) phải tới được WC chung, bếp, thang mà KHÔNG đi xuyên `passage.not_a_route` (gara, sảnh ngoài) — mã CHẶN và NGỮ NGHĨA (gửi mô hình sửa), kiểm ở `tree/openings.ts` nên mọi ứng viên bộ xếp đều bị đo; bước chèn hành lang (T48-A) nay chạy cả khi tầng ĐÃ có hành lang, nếu lý do hỏng là đường đi. (b) `kb/space_norms.yaml` vào nhánh AI qua `design/kb/space-norms.ts`: gửi mô hình `knowledge.room_area_m2` (min/hợp lý/max) và chấm A5 (dưới mức) + A6 (vượt mức) — **không chặn**. (c) Ba tiêu chí giao thông mới C6 (số cửa tới WC chung), C7 (số mét), C8 (chiều dài hành lang trên mỗi phòng phục vụ), đo trên đồ thị cửa có trọng số `ai/circulation.ts` dùng chung `planGraph`. (d) Ô gộp (`also`) mang thêm `parts` trong `ai-floor-plan`: chương trình chia theo tỉ lệ diện tích mục tiêu, tờ vẽ ghi mỗi khu một nhãn + nét đứt ranh mềm (lớp CAD `NV-RanhMem`), có câu cảnh báo «nét đứt là ranh mềm, không phải vách». Lời dẫn 7.0.0

**Lý do / đánh đổi:** Ba lời phê của Haan trên lượt 58d9ff66, đo lại được từng cái: đường thật từ phòng khách tới WC chung là khách → sảnh → thang → **gara** → hành lang → WC (5 cửa, 31,5 m; không có đường nào tránh gara); phòng khách 86,8 m² là ô GỘP khách + ăn + bếp mà tờ vẽ chỉ ghi «PHÒNG KHÁCH»; kho 1,7 m² dưới mức nghề 2 m². Đo sau khi sửa: cùng mặt bằng ấy C6/C7 = 0 điểm, A5/A6 mỗi cái một phòng. Bộ đo 36 ý định: 29 → 28 ca xếp được (hai ca biến thể hành lang +6 m² tụt vì thứ tự xếp hạng đổi, một ca thang +3 m² được cứu); sáu ý định THẬT vẫn xếp được. Đã thử và BỎ: phạt phòng dưới định mức nghề ở bộ chia ô — đo trên sáu ý định thật không đổi phòng nào

## T50

**Đối chiếu «Nguyên tắc vàng thiết kế mặt bằng nhà ở» (12 mục) của Haan với lời dẫn và bộ kiểm** (16/09/2026). Phần lớn đã có (giao thông T48/T49, nhân trắc `construction_norms`, khu ướt theo trục E2/E4, thông gió D1, kinh doanh tách lối C5, phòng thờ A3, hình khối vuông vức nhờ bản phác chia dải). Vá: (a) lời dẫn 8.0.0 thêm hai gợi ý thiết kế KHÔNG chặn — phân vùng theo ba cặp công cộng/riêng tư, động/tĩnh, khô/ướt; phòng ngủ `for: ong_ba` chưa ghim tầng thì ở tầng 1–2 cạnh WC. (b) Quy tắc kinh nghiệm tuỳ chọn mới `stair_not_facing_entry` (vị từ `stair_faces_entry`, `ai/rule-warnings.ts#stairsFacingEntry`): cửa chính → đi thẳng theo pháp tuyến → gặp ô thang (trong phòng cửa mở vào, hoặc phòng kế tiếp qua một cửa nằm trên trục ±30 cm) mà vế đầu chạy cùng chiều đi vào. Chỉ cảnh báo khi kỹ sư tích gói kinh nghiệm, không vào điểm. (c) Sửa lỗi khai-mà-không-đo: `adjacency` và `floor_preference` đã TIÊM vào lời dẫn nhưng chưa từng được đo lại trên mặt bằng, nên `wc_separate_from_kitchen`, `kitchen_near_dining`, `garage_ground_floor` chưa bao giờ sinh cảnh báo; nay `reviewPlanRooms` đo cả hai (khu của không gian mở tính theo `parts`; `separate` + `scope: building` xét cả chồng tầng). `rectsOverlap`/`rectsShareEdge` chuyển về `ai/draw/geometry.ts` để `plan-score` và `rule-warnings` dùng chung một bản. Container Python nhận tên vị từ mới trong `VALID_PREDICATES` (bộ giải không đo, chỉ để đọc được tệp)

**Lý do / đánh đổi:** Phong thuỷ — Haan chọn «chỉ thêm thang không đâm cửa chính»: ý duy nhất đo được đáng tin bằng hình học sẵn có; «bếp đối diện WC» (dò cửa đối cửa) và «bếp kẹp hai thuỷ» (cần vị trí đồ đạc) vẫn ở `plan_quality.yaml` mục `khong_do_duoc`. Né nắng Tây — Haan: «chỉ là option, nếu đầu bài yêu cầu thì mới làm, không thì thôi»; mô hình đã đọc nguyên văn đầu bài nên không thêm tri thức hay lời dẫn mặc định. Ngoài phạm vi: tam giác bếp (nội thất), độ dốc lối vào gara, lối thoát nạn thứ hai (PCCC — nguyên tắc 9). Bộ đo 36 ý định giữ 28 ca xếp được; trần độ dài lời dẫn nâng 4.500 → 4.700 ký tự. **Chưa đo trên mô hình thật**

## T51

**Sửa sau lượt đo 58688ead: không trả tiền cho lượt sửa mô hình không sửa được** (16/09/2026, Haan: «tiếp tục nâng cấp»). (a) `arrange/sketch.ts#fitRows`: hàng bản phác lệch số ô được thêm/bớt ô ở chỗ ít làm méo phòng nhất (tổng chữ nhật bao − số ô), thử CÙNG một chỗ cho mọi hàng lệch trước rồi mới tinh chỉnh từng hàng — thay cho «lặp ô cuối», vốn làm ô thang cuối hàng phình, bị cắt còn 3 × 3 ô và kéo cả bản phác bỏ. (b) `plan.ts#evaluateHouse`: tầng 1 hỏng vì cửa ra ngoài (`door_outside_on_boundary`, `door_no_outside_edge`, `entrance_wrong_side`, `vehicle_door_wrong_side`, `arrange_entrance_side`) thì chương trình tự thử tối đa ba phòng khác mang cửa chính (`entryAlternatives`: phòng đi xuyên được, ưu tiên phòng liền lối vào cũ, rồi chỗ sinh hoạt chung, rồi hành lang) TRƯỚC khi gọi lại mô hình; ghi chú `entry_room_switched`. (c) Lời dẫn 8.1.0: phòng ngủ giáp `open_faces` và chừa một đoạn không ban công; diện tích mục tiêu khớp số ô đã vẽ, kể cả hành lang; câu gợi ý `door_outside_on_boundary` nói đúng cho cả gara (bản cũ bảo «chọn phòng vào nhà» cho một cửa xe)

**Lý do / đánh đổi:** Lượt 58688ead: 1 khai + 3 sửa (0,815 USD, 10,9 phút) cùng một lỗi cửa gara, mô hình gửi lại bản phác y hệt; lượt 4 qua chỉ vì đổi `entry_room` sảnh → phòng khách. Phát lại miễn phí (`fixtures/ai-run-58688ead.json`): cả 4 ý định nay xếp được ngay ở lượt đầu, ra đúng phương án đã lưu (70%) — tức lượt ấy lẽ ra tốn ~0,47 USD. Bộ đo 36 ý định giữ 28 ca, điểm không đổi ca nào. Điểm lượt ấy mất ở D1 (≈ 11), A1 (≈ 5), E2 (≈ 5), C3/C6/C8 (≈ 6) — phần (c) nhắm D1 và A1, **chưa đo trên mô hình thật**

## T52

**Sảnh chạy suốt trước phòng mang cửa chính thì cửa chính mở ở sảnh** (16/09/2026). `arrange/doors.ts#deriveDoors` (`mainSide`): bản phác lượt 58688ead vẽ sảnh suốt trước phòng khách và hỏng oan `entrance_wrong_side`. ⚠️ Cùng ngày có thêm ba LUẬT (phòng ngủ không mở cửa ra bếp/ăn, sảnh sau thành hành lang, gara–khách không vách) — **đã gỡ ở T53**

**Lý do / đánh đổi:** Haan: «những lỗi này chỉ là điểm bất hợp lý trên bản vẽ này … không nên fix cứng vào rule là lỗi, như vậy sẽ sinh ra nhiều điểm nhiễu». Ba việc ấy nay làm bằng ô yêu cầu sửa (T53)

## T53

**Ngưỡng 65 điểm, rồi kỹ sư sửa TRÊN bản vẽ bằng ô yêu cầu** (16/09/2026, Haan chốt). (a) `kb/plan_quality.yaml` `accept_percent: 65`: phương án qua cổng mà dưới ngưỡng thì dùng lượt sửa còn lại (`HOUSE_REVISIONS_MAX`) gửi mô hình dòng `floor_level.score_hints` của 3 tiêu chí mất nhiều điểm nhất; giữ bản điểm cao nhất (`keepBest`); hết lượt thì lưu bản cao nhất và ghi `belowThreshold`. (b) Artifact `ai_floor_plan` lưu `house_intent` (ý định cả nhà có bản phác). (c) Hợp đồng `contracts/ai-plan-edit`: mô hình dịch câu yêu cầu thành thao tác trong tập ĐÓNG — `move_door` (kèm `place` đầu/giữa/cuối vách), `open_wall` (ô thông suốt, cửa cây mang `full`), `close_wall`, `swap_rooms`, `resize_room` (dời một vách chung theo diện tích cần thêm), `move_wall`, `window`, `relayout`. `ai/edit/apply.ts` áp lên CÂY đã lưu, cho qua `layoutLevel` + `finalisePlan`, chấm lại; ô thang không đổi; bỏ cửa duy nhất hay đổi diện tích không căn được thì báo, không lưu. Lời gọi chỉ gửi bảng gọn bản vẽ + nguyên văn yêu cầu (`ai/edit/prompt.ts`, `plan_edit` trong lời dẫn; ~3.300 ký tự cho biệt thự 26 phòng), không gửi đầu bài, không gửi ảnh. Thao tác không qua cổng thì gọi lại kèm lý do, tổng tối đa 4 lượt (`EDIT_CALLS_MAX`, Haan 17/09/2026). `relayout` đi lượt `revise` thường với `house_intent`. (d) `POST /design/ai/plan/edit` chạy trong `AiDesignPipeline` (`params.edit`); bản sửa là artifact MỚI trỏ bản gốc + chương trình, `generator.edit`, nhãn «· sửa n»; mã bước lineage dùng lại `ai_plan_propose` (không migration). (e) Màn hình: khung «Yêu cầu sửa» dưới tờ vẽ, chip đạt/dưới ngưỡng, danh sách mã phòng tầng đang xem. (f) Gỡ ba luật T52

**Lý do / đánh đổi:** Haan: «nên để ngưỡng 65/100 - sau đó có một ô chat để kĩ sư đưa vào yêu cầu của họ sau khi review bản vẽ … giai đoạn tiếp theo là sửa trên bản vẽ hiện tại … trên phương châm tăng điểm là trên hết sau đó là tiết kiệm token». Chốt thêm: gửi DỮ LIỆU không gửi ảnh, mô hình trả thao tác. Đánh đổi đã biết: `resize_room` chỉ dời một vách nên có khi kéo lệch ô thang tầng trên và bị cổng bác; bản sửa giữ `house_intent` cũ (bản phác không theo thao tác). Bộ đo 36 ý định giữ 28 ca. **Chưa đo trên mô hình thật**

## T54

**Ba luật bố cục rút từ bản vẽ thật** (18/09/2026, Haan chấm lượt 78be09b4). (a) **Phòng ở không lấy cửa thẳng từ ô thang** — `kb/room_vocabulary.yaml` mục `passage.stair_not_for` (phòng ngủ, phòng làm việc, phòng thờ, không gian kinh doanh); CHẶN và NGỮ NGHĨA (`door_from_stair` trong `REVISABLE_CODES`), kiểm ở `tree/openings.ts`. Bộ xếp phạt trước ở `pack.ts` (`noStairDoor`: ô thang không tính là đường vào của phòng ấy) nên không mất phương án nào — đo trên bốn bản phác thật của lượt 58688ead. Lượt SỬA của kỹ sư truyền `relax` để luật ra đời sau không chặn bản vẽ đã lưu. (b) **Cửa giữa hai phòng cùng nhóm giao thông là Ô THÔNG suốt, không cánh** — `arrange/doors.ts` và lưới an toàn `tree/openings.ts`. (c) **Ban công quay CẠNH DÀI ra mặt thoáng** — `outdoorOffFace`, hiện là GHI CHÚ `outdoor_off_face`, chưa chặn. Lời dẫn 8.4.0 nói cả ba.

**Lý do / đánh đổi:** Haan: «cửa phòng thờ mở ra là thang bộ → bất hợp lý», «ban công nằm giữa nhà → rất bất hợp lý, ban công phải có ít nhất 2 cạnh ở mặt ngoài», «không cần cửa giữa 2 khu vực đều là hành lang giao thông». Ban công để mức ghi chú vì chặn khi chưa cho ban công ĐUA RA NGOÀI khối thì mất phương án ở cả bốn bản phác thật đã đo — Haan chốt hướng đúng là «cạnh dài luôn ở hướng mặt thoáng, phần đua ra không tính vào diện tích công năng của sàn», việc ấy chưa làm. Bộ đo 36 ý định (thời T43/T45): 29 → 26 ca xếp được; bốn bản phác thời T48 giữ nguyên 4/4.

## T55

**Khu nấu nướng trong không gian mở xếp xa cửa phòng yên tĩnh** (18/09/2026, Haan chấm lượt 3bc3d2ed: «không nên xếp cửa ra vào phòng ngủ ở phía bếp nấu nướng»). `plan-geometry.ts#withMergedParts` chọn THỨ TỰ các khu trong một ô gộp sao cho tổng vách chung giữa khu `passage.cooking` và phòng `passage.quiet` nhỏ nhất; hoà nhau thì giữ thứ tự mô hình khai. Lượt 3bc3d2ed phát lại: dải khách–ăn–bếp đổi thành khách–bếp–ăn, cửa phòng ngủ 28,9 m² mở vào khu ăn thay vì khu bếp.

**Lý do / đánh đổi:** KHÔNG phải luật: không mã lỗi, không cảnh báo, không điểm — đúng lời Haan ở T52 («không nên fix cứng vào rule là lỗi, sẽ sinh nhiều điểm nhiễu»). Tường, cửa, diện tích không đổi; chỉ đổi chỗ ghi nhãn trong chính phòng ấy, việc mà kiến trúc sư vẫn tự quyết khi kê đồ. Chồng trục khu vệ sinh thì ĐÃ có sẵn ba tầng (lời dẫn «Wet rooms sit above wet rooms», phạt `wet` ở bộ xếp, tiêu chí E2 + dòng gợi ý sửa E2) nhưng đo trên năm bản phác thật đều ra E2 = 0; thử nâng trọng số phạt 1 → 5 KHÔNG đổi ca nào — chỗ quyết là bản phác tầng trên, cần bước ép ô WC về ô tầng dưới như đã làm cho ô thang. Chưa làm, chờ Haan.

## T56

**Khu vệ sinh tầng trên chồng trục khu vệ sinh tầng dưới — ba mức** (19/09/2026, Haan chốt Q-B «dời vách tầng trên»). (a) **Vùng**: khu vệ sinh CHUNG ở tầng trên nhận vùng của khu vệ sinh tầng dưới (`arrange/intent.ts`, ghi chú `intent_wet_zone_forced`); phòng khép kín không đụng tới — vùng của nó là vùng phòng mẹ, kéo đi là phòng ngủ mất khu vệ sinh riêng. (b) **Phạt tăng dần theo khoảng cách** thay cho bậc có/không (`arrange/pack.ts`): bậc thang không cho bộ xếp lý do nào kéo phòng từ 4 m xuống 2 m — nó thấy «vẫn chưa chồng» ở cả hai chỗ. (c) **Bản phác thứ hai** (`copySketch` + `stackWetRooms`): ô khu vệ sinh ép đúng ô tầng dưới, đi qua cổng CÙNG bản gốc, bản nào ra mặt bằng điểm cao hơn thì thắng — nên việc ép không bao giờ làm mất một phương án. Ba điều kiện để bản ép không hỏng từ lưới ô: phòng khép kín còn chung vách với phòng mẹ, không tụt dưới sàn đầu bài khai, không phòng nào bị lấy hết ô. (d) Lời dẫn 8.5.0 nói ô khu vệ sinh chung nằm trên đúng ô tầng dưới.

**Lý do / đánh đổi:** Đo 19/09/2026 trên lượt thật đã ghi: khu vệ sinh chung tầng 2 xích lại gần — `58688ead` 9,31 → 4,04 m, `fd3b0b86` 9,95 → 5,69 m; điểm giữ 70,3 % và 71,2 → 71,1 %. **E2 vẫn 0 ở mọi bản đã lưu**, vì hai chỗ chặn nằm ngoài tầm với của bộ xếp: (1) trên CẢ HAI lượt thật, bản phác của mô hình không qua được cổng (thiếu phòng ở tầng trên; phòng tầng 1 hụt sàn đầu bài — living_1 53,67 so với 55 m²) nên tầng nào cũng rơi về xếp theo vùng, và mọi cơ chế ép Ô (cả ô thang lẫn ô khu vệ sinh) chỉ chạy ở đường bản phác; (2) E2 đo khoảng cách TÂM ≤ 1,5 m, nên hai khu vệ sinh khác cỡ nằm chồng nhau vẫn trượt — đo trên nhà phố mẫu: cùng vùng, chồng nhau, tâm cách 2,41 m. Hai chỗ ấy ghi ở `TIEN_DO_THIET_KE.html` (V-30, V-31) chờ Haan quyết.

## T57

**Ảnh mặt bằng công năng CÓ NỘI THẤT, mô hình ảnh vẽ từ ẢNH NEO** (19/09/2026, Haan chốt). Sau khi có mặt bằng từng tầng, kỹ sư bấm vẽ một tấm trình khách: tường tô đậm, đồ đạc từng phòng, vật liệu sàn, cây cối quanh nhà, khung tên tiếng Việt. **KHÔNG đảo T22**: tờ SVG vector vẫn là tờ CHÍNH, vẫn hiện mặc định, vẫn là thứ đo được và xuất DXF; tấm ảnh ở panel RIÊNG bên dưới, cùng vai trò với ảnh phối cảnh. (a) **Ảnh neo** — `ai/draw/anchor.ts` dựng tờ chỉ phần hình (`renderPlanBody`, dùng chung với DXF), nền trắng, đệm về một trong ba khung chuẩn 1024×1024 / 1536×1024 / 1024×1536; tuyến RIÊNG `GET /plan/:id/anchor`, không phải tham số của `/sheet`. **Không khung tên** — bảo đảm bằng cấu trúc (không gọi `renderTitleBlock`), vì khung tên mang mã hồ sơ là dữ liệu hạng 1 mà tuyến ảnh chỉ nhận tới hạng 2. (b) **Rasterise ở TRÌNH DUYỆT** (`web/src/lib/rasterise.ts`): Worker không có canvas. (c) `POST /plan/:id/sheet-image` ghép lời dẫn từ dữ liệu THẬT (tên phòng tiếng Việt, m², kích thước mm, hướng bắc, bốn dòng khung tên, phong cách theo lineage), gửi kèm ĐÚNG MỘT ảnh neo, lưu qua `render-store` và đúc artifact `ai_plan_sheet_image` (`setHead: false`). (d) Lời dẫn 8.6.0, migration 0127 mở lại `kind` + `step` mà 0125 đã đóng. (e) Nhãn HAI LỚP: `stampWatermark` in lên pixel + `AI_DISCLAIMERS.aiSheetImage` bằng chữ trong trang. (f) Máy chủ **dựng lại ảnh neo và đối chiếu KÍCH THƯỚC** đọc từ khối IHDR của tệp PNG (`pngSize`), lệch thì 400 và không gọi mô hình; tuyến chỉ nhận PNG, hẹp hơn hợp đồng. (g) **Sáu tuyến ảnh, tên mô hình lấy từ lượt LIỆT KÊ THẬT** (19/09/2026, Haan cho phép hai lượt 0 USD): OpenAI `gpt-image-2` · `gpt-image-2.5-sunburst` (hãng nói rõ bản này dành cho luồng cần độ chính xác khi SỬA ảnh — đúng việc của T57) · `gpt-image-2.5-flare`; Gemini `gemini-3.1-flash-image` · `gemini-3-pro-image` · `gemini-3.1-flash-lite-image`. Ô chọn model hiện TÊN MÔ HÌNH lấy thẳng từ cấu hình, vì nhật ký `design_ai_call` ghi theo tên ấy. **Giá mỗi ảnh của OpenAI khai 0,19 USD là sai gấp hơn sáu lần**: hãng tính theo token (4,00 USD/1M token ảnh vào, 15,00 USD/1M token ra) và lượt thật đã ghi (2.353 vào, 1.372 ra) ra **0,030 USD**. Đã sửa cấu hình; giá Gemini giữ số hãng công bố dù token đo được cho ra 0,135–0,175 USD — chỗ chưa khớp ghi trong `config/models.yaml`, chỉ hoá đơn mới phân xử được.

**Lý do / đánh đổi:** Haan chốt hai điều: **mô hình viết cả chữ lẫn số**, và **chưa gọi API thật** đợt này. Đánh đổi đã biết và đã chấp nhận: tờ ảnh KHÔNG đo được — dấu tiếng Việt có thể hỏng, số mét vuông in trên hình có thể lệch bảng diện tích; đó là lý do nhãn hai lớp là bắt buộc và thẻ tờ vector phải ở ngay cạnh. Khác biệt DUY NHẤT với T21 (đã bị T22 gỡ 12/09) là ảnh neo: T21 cố ý chỉ gửi chữ nên mô hình vẽ một ngôi nhà KHÁC. Bỏ ảnh neo đi thì không gì hỏng — lời gọi vẫn chạy, vẫn ra ảnh, vẫn mất tiền — nên có phép thử riêng canh `images` có đúng một phần tử. Ba chỗ yếu đã ghi: byte ảnh neo do trình duyệt gửi nên máy chủ không so được từng điểm ảnh — binding `IMAGES` của Cloudflare KHÔNG chữa được (tra 19/09: «does not resize SVG files and will ignore any optimization parameters»), nên chỉ đối chiếu được kích thước, và đóng hẳn thì phải nhúng bộ rasterise WebAssembly vào Worker (V-32); phông ngoài không nạp trong `<img>` nên chữ trên ảnh neo rơi về phông hệ thống; nhà càng dài càng lấp ít khung — đo trên nhà phố 4,2 × 15,2 m chỉ lấp ~40 %, và xoay ngang cũng vậy. **Đo thật 19/09/2026** trên hồ sơ «Biệt thự nhà vườn (demo)», tầng 1, hai lượt (báo 0,257 USD theo giá niêm yết lúc ấy; **giá đúng ≈ 0,097 USD** — xem (g)): `gemini-3.1-flash-image` 22,6 s / 0,067 USD và `gpt-image-2` 39,3 s / 0,190 USD — **cả hai bám ảnh neo**, dựng lại đúng bố cục, chuỗi kích thước chép đúng (13000 = 220+5440+2450+1800+3090+220), có nội thất, vật liệu sàn, xe, cây cối, hoa gió, thước tỉ lệ và khung tên. Dấu tiếng Việt sống sót ở cả hai. Khác nhau ở phần SỐ: GPT Image chép đúng **mọi** diện tích (28,9 · 6,9 · 5,7 · 4,2 · 18,1 · 15,8 · 10,8 · 13,1 · 16,6 · 55,1 · 27,1 m²), Gemini ghi nhầm hai khu vệ sinh thành cùng 5,7 m² — đúng kiểu sai mà nhãn hai lớp sinh ra để phòng. Lượt đo bắt thêm **ba lỗi im lặng** đã sửa: header `X-Anchor-*` chưa khai trong `exposeHeaders` của CORS (có phép thử canh hai danh sách từ nay); tuyến `/sheet-image` khai `max-age=300` trong khi nó trỏ tới «tấm MỚI NHẤT» — một con trỏ đổi được — nên sau khi trả tiền cho tấm mới màn hình hiện lại tấm cũ (695 KB thay vì 2,48 MB), nay `no-cache` + `ETag`; và ảnh neo phải tải bỏ qua bộ đệm vì nó là đầu vào của một lượt tính tiền.

## T58

**Gỡ hẳn bộ giải nội bộ; tab «Thiết kế AI» đổi tên thành «AI Design»** (19/09/2026, Haan quyết). Xoá mục «Chương trình không gian» và «AI phương án kiến trúc» — tức toàn bộ bộ giải CP-SAT mà T10 đã ghi «không đạt, xoá khi nhánh AI làm tốt». (a) **web**: bỏ hai tab, hai thẻ Tổng quan và sáu màn hình (`program-panel`, `variants-panel`, `sheet-viewer`, `massing-viewer`, `render-panel`, `schedules-panel`), gỡ `three`; dải tiến trình 7 → 6 bước, hai bước «Không gian», «Phương án» thay bằng một bước **«AI Design»** (xong khi đã chọn một phương án mặt bằng); «Hoạt động gần đây» lấy phương án AI đã lưu thay cho đợt sinh của bộ giải. (b) **Phương án KTS tải lên (TK-03, `discipline = phuong_an`) KHÔNG thuộc bộ giải** — gộp vào tab «Phiên bản bản vẽ» cùng ba bộ môn kỹ thuật. (c) **Worker**: xoá `program/`, `layout/`, `render/`, `workflows/steps.ts`, `workflows/design-pipeline.ts`, `publish.ts`, các tuyến `/program/*`, `/floor-plan/*`, `/render*`, `/publish`, `/policy/data-class`, Workflow `DESIGN_PIPELINE`, tuyến mô hình `layer1…layer5`, gói `rules/structure/` và `rules/locality/`, hai tệp `kb/program_plausibility.yaml`, `kb/render_prompts.yaml`, mười hợp đồng chỉ bộ giải dùng. Giữ `layer1_brief` + `design_brief` vì `/brief/confirm` còn dùng. (d) **Container `compute/` GIỮ, chỉ còn số hoá hồ sơ cũ** (`/extract`, `/kb/record`) — Haan chọn giữ tính năng «Hồ sơ cũ đã số hoá»; `ComputeBackend` thu về `health`/`extract`/`buildKbRecord`, bỏ ortools, trimesh, openpyxl. (e) **Không migration, không xoá dữ liệu**: artifact cũ của bộ giải và ràng buộc CHECK cho phép loại của nó giữ nguyên trong CSDL — bất biến, không mã nào đọc nữa. (f) Tab AI Design còn **ba bước** (Mặt bằng → Mặt đứng → Phối cảnh): bước «Chương trình không gian» của nhánh AI cũng gỡ khỏi giao diện vì từ T45 mặt bằng không đọc nó nữa; `RulePackPicker` tách sang `ai-rule-pack-picker.tsx`, tuyến `/design/ai/program` ở Worker vẫn còn. (g) `ai-independence.test.ts` đổi vai: canh bộ giải KHÔNG được tạo lại lặng lẽ (đường, tệp, hợp đồng không tồn tại và không ai import).

**Lý do / đánh đổi:** «AI Design» là tiếng Anh — ngoại lệ có chủ đích với CLAUDE.md 4.1 (giao diện 100 % tiếng Việt), Haan chọn giữ đúng tên này. Client Pollinations (`llm/pollinations.ts`) GIỮ dù tuyến duy nhất dùng nó (`layer5_render`) đã gỡ: nó là một nhà cung cấp của lớp `llm/` dùng chung, đổi `provider` của một tuyến ảnh là dùng được. Kinh nghiệm chọn nhà cung cấp ảnh (Gemini `limit: 0`, Hugging Face hết hạn mức) chép lại thành chú thích trong `config/models.yaml`. Workflow `nvg-design-pipeline` có thể còn đăng ký trên tài khoản Cloudflare sau lần deploy gỡ binding — xoá bằng `wrangler workflows delete` khi Haan triển khai.

## T59

**Bước «2. Mặt đứng» của AI Design: ý tưởng mặt tiền, tờ SVG, DXF, và phiếu yêu cầu của kỹ sư** (19/09/2026, Haan chốt). (a) **Chỉ mặt tiền**; mỗi lượt chạy cho **một** ý tưởng; sửa sau bằng ô yêu cầu (Đợt D, chưa làm); ảnh có vật liệu do mô hình ảnh vẽ từ ảnh neo (Đợt E, chưa làm). (b) **Mô hình chỉ trang trí (T16)**: khung (bề rộng, cao độ từng tầng), lỗ mở nhìn thấy từ đường và ban công do chương trình suy từ phương án mặt bằng ĐÃ CHỌN (`ai/facade/frame.ts`) và là dữ liệu KHOÁ; mô hình chọn mái, vật liệu, màu, cổng, rào, mảng trang trí trong danh mục `kb/facade_vocabulary.yaml`. Hợp đồng `ai-facade-proposal` là phần mô hình khai; Worker ghép thành `ai_facade_concept` (đơn vị đổi sang lưới nửa centimet cho khớp mặt bằng). ±0.000 là sàn tầng 1, cốt vỉa hè nằm ở `ground_z`. (c) **Tờ mặt đứng là SVG vector tất định** (`ai/draw/elevation-sheet.ts`), cùng bộ vẽ với mặt bằng; một thân hình dùng cho tờ A3, ảnh neo (không khung tên) và DXF. Vật liệu ghi bằng chữ trong cột khung tên — tờ là bản vẽ đơn sắc đo được. Đường mái dốc do chương trình dựng theo kiểu mái và độ dốc; cổng, rào vẽ nét đứt vì đứng trước nhà. (d) **Phiếu yêu cầu của kỹ sư** (Đợt F2, artifact `ai_facade_brief`, migration 0128) đặt đầu màn hình: mục đã điền là **BẮT BUỘC** — hàm ghép (`ai/facade/merge.ts`) **áp thẳng** thay vì bắt mô hình làm lại (chắc chắn đúng và không tốn thêm lượt gọi); chỉ chi tiết trang trí đã chọn và «có cổng» — thứ chương trình không tự đặt được toạ độ — mới khiến phép kiểm gọi lại mô hình. Mục trống để AI đề xuất. **Chiều cao cửa nhập ở phiếu, bề rộng là của mặt bằng** (chỉ đọc). Thêm kiểu **mái Nhật** (vẽ như mái tứ giác dốc thấp, đua rộng — số mồi). (e) Đổi phương án mặt bằng sau khi dựng thì mặt đứng cũ GIỮ, gắn nhãn «dựng theo phương án cũ»; bước Phối cảnh chặn tới khi mặt đứng khớp. (f) Bộ sinh hợp đồng nay đọc `anyOf` (trước đó ra `z.unknown()` — trường trông như có hợp đồng mà không kiểm gì). (g) **Lượt chạy thật đầu tiên** 19/09/2026 23:22 trên «Biệt thự nhà vườn (demo)», Gemini 3.1 Pro: 1.310 token vào, 2.131 token ra, qua phép kiểm ngay lượt đầu; mô hình đặt ô văng trên cửa và bồn cây dưới bệ cửa sổ đúng vị trí lỗ mở khoá. (i) **Đo hồ sơ thật rồi sửa số mồi** (20/09/2026, Haan duyệt): đọc 7 tờ mặt đứng DXF của 6 công trình NVO đã phát hành, ghi kết quả vào `kb/facade_experience.yaml` (n = 6, dưới ngưỡng 15 nên là CHỈ DẤU, không phải định mức; tệp không có mã nào đọc). Ba số đã sửa theo hồ sơ: **mái Nhật dốc 20° → 30°** (cả ba nhà mái Nhật đều 30–32°, hai tờ ghi thẳng «30°» — số mồi cũ vẽ ra mái thoải hơn nhà NVG vẫn làm), **mái đua mái Nhật 90 → 60 cm**, **tường chắn mái 1,1 → 0,9 m**; cốt nền 0,45 m giữ nguyên vì trùng mức thường gặp. Danh mục thêm ba mảng trang trí có trên hồ sơ (`eaves_band` diềm mái, `finial` chóp, `reveal` ron chỉ âm — nới enum của ba hợp đồng mặt đứng), sơn hiệu ứng giả bê tông, nhôm vân gỗ; lời dẫn lên 8.10.0. Thói quen đọc được mà CHƯA thành số: đỉnh cửa chính thẳng hàng đỉnh cửa sổ cùng tầng (4/6), tầng 1 hoặc chân tường luôn ốp vật liệu tối hơn phần trên (5/6). Chưa làm: cửa đầu vòm và sảnh mái dốc có cột — bộ vẽ chưa dựng được. (h) **Ảnh mặt đứng có vật liệu** (Đợt E, 20/09/2026, artifact `ai_facade_image`, bước `ai_facade_image_draw`, migration 0129): cùng khuôn T57 — ảnh neo là tờ mặt đứng vector không khung tên, rasterise ở trình duyệt, máy chủ dựng lại và đối chiếu cỡ khung, lời gọi mang ĐÚNG MỘT ảnh, dữ liệu hạng 2, nhãn hai lớp (`AI_DISCLAIMERS.aiFacadeImage` + dấu in lên pixel). Lời dẫn (`facade_image`, bản 8.9.0) ghép vật liệu, mã màu hex, mái, cổng, rào từ ý tưởng đã lưu; khác T57 ở chỗ ảnh **không viết chữ nào** — cao độ, kích thước, bảng vật liệu đã ở tờ vector. Không đặt head; tấm mới nhất chọn lúc đọc theo lineage. Về sau là ảnh neo của bước Phối cảnh (T16).

**Lý do / đánh đổi:** Mặt đứng phải nói cùng một ngôi nhà với mặt bằng, nên mọi thứ đo được lấy từ mặt bằng, không hỏi mô hình. Đánh đổi đã biết: mặt đứng là hình chiếu phẳng (cửa sau ban công và cửa trên tường mặt tiền cùng một mặt phẳng); ban công chưa đua ra khỏi khối (Q-46); danh mục vật liệu chờ Haan duyệt (Q-48) — riêng số mái Nhật, tường chắn mái và cốt nền đã đo trên hồ sơ thật và chốt ngày 20/09/2026, xem (i).

## T60

**Ô chọn model dạng thẻ: chọn nhà cung cấp trước, rồi chọn model** (20/09/2026, Haan gửi mẫu giao diện và yêu cầu áp cho cả model ngôn ngữ lẫn model ảnh). (a) Ô cũ là một `<select>` một dòng gộp ba thứ («Gemini 3.1 Pro (Google) — chất lượng cao · gemini-3.1-pro-preview»), và model đắt nhất trông y hệt model rẻ nhất — trong khi hai đầu danh sách chênh nhau hơn hai mươi lần tiền. Ô mới (`web/src/pages/tk/ai/ai-model-cards.tsx`) có hai tầng: hàng thẻ nhà cung cấp, rồi danh sách thẻ model của nhà cung cấp ấy, mỗi thẻ mang tên ngắn, nhãn phân loại, một câu mô tả, **tên model thật** và **giá niêm yết**. (b) **Mặc định THU GỌN**, chỉ hiện model đang chọn — ô này nằm ngay trên nút tiêu tiền, mở sẵn cả danh sách thì nút chính bị đẩy khỏi tầm nhìn. (c) Chữ trên thẻ là **DỮ LIỆU** trong `config/models.yaml`: mỗi tuyến `ai_*` thêm `short`, `tag`, `blurb`; thêm mục `providers` ánh xạ mã nhà cung cấp sang tên hiện trên màn hình. Không cắt chuỗi `label` ra ba mảnh trong mã — cắt chuỗi là đoán, và đoán sai lặng lẽ khi ai đó sửa nhãn. `gemini` và `gemini_paid` để **hai thẻ riêng** vì chúng là hai khoá khác nhau, và khác biệt ấy đúng là thứ người dùng cần biết: gói miễn phí có thể bị dùng để huấn luyện. (d) Ba ràng buộc của ô cũ giữ nguyên: tên model thật luôn đọc được kể cả khi thu gọn (nhật ký `design_ai_call` ghi theo tên model); tuyến chưa dùng được vẫn liệt kê, mờ kèm lý do, không bấm được (AFD 6.5); giá niêm yết hiện trước khi bấm, chưa khai giá thì nói chưa có chứ không để trống.

**Lý do / đánh đổi:** giá đọc trên chính thẻ chứ không chỉ ở dòng ghi chú dưới ô — người chọn model là người tiêu tiền, và con số phải nằm cạnh thứ họ đang cân nhắc. Đổi lại, ô chiếm nhiều chỗ hơn khi mở, và câu mô tả từng model là chữ viết tay trong cấu hình: nó mô tả **bậc và giá** theo cấu hình khai, không phải kết quả đo chất lượng — chưa có phép đo nào so chất lượng các model trên việc của NVG.

## T61

**Làm mới danh sách model chữ của OpenAI; thêm quy trình kiểm bản mới** (20/09/2026, Haan phát hiện: «tôi thấy GPT có nhiều model mới, tại sao chúng ta không sử dụng?»). (a) **Chẩn đoán:** hai tuyến chữ OpenAI đang chạy `gpt-5` và `gpt-5-mini` — cả hai ra **05/08/2025, cũ 13 tháng**; trong khoảng đó OpenAI đã ra 5.1 → 5.6 và `gpt-6-astra`. Lọt vì quy trình chỉ hỏi «model này gọi được không» (kiểm 08/09/2026: gọi được, ghi ✔) mà không bao giờ hỏi «có bản mới hơn chưa» — **một model cũ không bao giờ tự báo rằng nó cũ**. Model ảnh thì đúng bản mới nhất, chỉ vì Đợt E hôm 19/09 vừa phải đi tra lại danh sách. (b) **Đo:** `GET /v1/models` ba nhà cung cấp (0 token, 0 USD) — Google đã là bản mới nhất (`gemini-3.1-pro-preview` vẫn là Pro mới nhất, `gemini-3.8-flash` là Flash mới nhất), Anthropic gần như mới nhất (chỉ `claude-fable-5-1` ngày 28/08/2026 là mới hơn `claude-opus-5`), OpenAI lệch 13 tháng. Rồi **bốn lượt gọi rỗng** qua đúng đường mã thật đi (`/v1/responses`, lược đồ `strict`, `store: false`, `reasoning.effort: low`), tổng **0,00206 USD**: cả bốn trả đúng `{"ok":true}`, nhận `reasoning.effort`, nghĩ 0 token, 1,1–2,7 giây. (c) **Thay:** `gpt-5-mini` → **`gpt-5.6-luna`** (vừa mới hơn vừa **rẻ hơn**: 0,20/1,20 so với 0,25/2 — rẻ hơn 40% ở phần đắt nhất); `gpt-5` → **`gpt-5.6-terra`** (2/12). **Thêm** hai bậc cao KHÔNG đặt mặc định: `ai_text_openai_deep` = `gpt-5.6-sol` (4/20) và `ai_text_openai_top` = `gpt-6-astra` (10/50). Mặc định toàn cục vẫn là Gemini 3.1 Pro. (d) **Quy trình mới, ghi thành chú thích ngay đầu tuyến trong `config/models.yaml`:** mỗi lần đụng tệp ấy, gọi `GET /v1/models` của nhà cung cấp TRƯỚC (không tốn token, không tốn tiền) rồi mới sửa. (e) **Gỡ tuyến gói miễn phí của Google** (`ai_text_gemini_free`, `gemini-2.5-flash`, hạng 3 — Haan: «bỏ gói miễn phí của Google đi, chúng ta sẽ không dùng đến nó»). Nó vào danh sách 13/09/2026 cho bước đề xuất mức ưu tiên diện tích ở màn hình Chương trình không gian, mà bước ấy đã gỡ khỏi giao diện cùng T58 — tuyến còn lại là một lựa chọn không nối vào việc gì. Sau khi gỡ, **không tuyến `ai_*` nào còn chạy khoá miễn phí**: mọi thứ trong ô chọn model đều là API trả phí có cam kết không huấn luyện (hạng 2), và ô chọn còn ba thẻ nhà cung cấp thay vì bốn. Khoá `GEMINI_API_KEY` vẫn dùng cho `kb_label_normalize`, `kb_rationale_embed`, `site_boundary_extract` (đường số hoá hồ sơ cũ, không nằm trong ô chọn), nên `gemini` còn nguyên trong `billing.free_providers`. Hàng rào `isPaidAiRoute` trong `router.test.ts` **giữ nguyên** dù hiện không có tuyến nào để canh: nó canh cho lần sau, khi có người thêm lại một tuyến khoá miễn phí và quên đặt nó ở hạng 3.

**Lý do / đánh đổi:** chưa có phép đo nào so **chất lượng bố cục** giữa các bậc trên việc thật của NVG, nên `blurb` của từng thẻ chỉ nói giá và ngày ra, không nói hay dở — và hai bậc cao không được đặt mặc định. Một lượt xếp mặt bằng thật để so chất lượng là khoản tiền riêng, xin phép riêng. Con số đo 13/09/2026 về token nghĩ (`max_output_tokens: 0`) là của `gpt-5`, **chưa đo lại** trên Terra — chú thích trong cấu hình nói rõ điều đó thay vì để người đọc tưởng số ấy còn đúng. Chưa thêm `claude-fable-5-1` (10/50) vì nó cùng bậc giá với Astra và chưa ai hỏi tới.

## T62

**Giữ lại mọi bản mặt đứng đã dựng, mở lại được để so** (20/09/2026, Haan: «khi tạo bản vẽ mới thì không lưu lại bản vẽ cũ để so sánh → chưa tốt. Cần lưu lại bản cũ để so sánh, có thể xoá đi khi không cần nữa»). (a) **Dữ liệu chưa bao giờ mất**: artifact là bất biến (8.2 nguyên tắc 3), mỗi lượt chạy đúc một `ai_facade_concept` mới. Chỗ thiếu nằm ở tuyến `/ai/state/:projectId` — nó chỉ trả `facadeArtifactId` (mốc hiệu lực), nên màn hình không có đường nào mở lại bản trước. Hồ sơ demo có sẵn **bốn** bản đã dựng mà không bản nào xem lại được. (b) `/state` nay trả thêm `facades` (mới nhất trước, bỏ bản đã ẩn, tối đa 12); màn hình có dải chọn như bước Mặt bằng: mỗi bản một thẻ kèm **ngày giờ dựng**, nhãn «Đang hiệu lực», nút × để thôi hiện. (c) Hai tuyến mới: `POST /facade/choose` (đặt lại mốc — đường QUAY LẠI, để không phải trả tiền một lượt chạy nữa cho thứ mình đã có) và `POST /facade/hide` (thôi hiện, cùng khuôn `/ai/plan/hide`: bảng `design_artifact_hidden`, bỏ dòng thì bản ấy trở lại, bản đang hiệu lực thì gỡ luôn mốc). (d) **Tách «bản đang MỞ» khỏi «bản HIỆU LỰC»**: mở bản cũ ra xem không đổi thứ mà ảnh mặt đứng và bước Phối cảnh dựng theo; muốn đổi thì bấm nút riêng. Nhãn «dựng theo phương án mặt bằng cũ» chỉ gắn cho bản hiệu lực, vì `/state` chỉ trả `plan_ref` của riêng bản ấy.

**Lý do / đánh đổi:** dải chỉ hiện khi có **từ hai bản trở lên** — một bản thì dải không nói thêm gì mà chiếm chỗ ngay trên tờ vẽ. Tên thẻ là «Bản 1…n» theo thứ tự dựng chứ không phải mã băm: kỹ sư so hai bản bằng mắt, không bằng mã. Chưa có: so hai tờ vẽ **cạnh nhau** trên cùng màn hình (hiện phải bấm qua lại), và chưa có ghi chú để kỹ sư đánh dấu vì sao thích bản nào.

## T63

**Thước chấm mặt đứng và vòng tự sửa theo điểm** (20/09/2026, Haan: «cần cải tiến để bản vẽ mặt đứng đạt được tối thiểu 80% so với bản vẽ từ hồ sơ thật của NVG»; chọn cách đo «máy chấm + kỹ sư chấm lại», phạm vi «cả thước đo lẫn bổ sung bộ vẽ»). (a) **Trước đó mặt đứng chỉ có CỔNG, không có ĐIỂM**: `check.ts` trả đạt/không đạt (mã có trong danh mục, số trong khoảng dựng được), còn câu «giống cách NVG vẽ đến đâu» thì không ai hỏi. Và `kb/facade_experience.yaml` — toàn bộ phần đo được trên 7 tờ hồ sơ thật — **chưa mã nào đọc**; chỉ ba con số của nó được chép tay vào danh mục và quy ước cấu tạo hôm trước. (b) **`kb/facade_quality.yaml`** là định nghĩa của con số 80%: 13 tiêu chí, 5 nhóm (Mái 20, Vật liệu và màu 30, Cửa 25, Trang trí 15, Lan can 10), ngưỡng `accept_percent: 80`. Mỗi tiêu chí mang `n` và nhãn `[ĐO]`/`[CHUNG]` ra tới màn hình — trọng số là LỰA CHỌN, hồ sơ chỉ nói được tần suất. (c) **Hai kiểu «chưa chấm được», trọng số xử lý ngược nhau**: *không áp dụng* (tiêu chí mái Nhật trên nhà mái bằng) ra khỏi phép chia hẳn — giữ phần của nó là phạt một ngôi nhà vì nó không phải kiểu nhà khác; *thiếu đầu vào* vẫn giữ phần trọng số nhưng phần ấy không vào `scored_weight`. (d) **`do_ai: false`** đánh dấu tiêu chí KHÔNG do mô hình quyết (cao độ lanh tô, chiều cao cửa, lan can — đến từ mặt bằng, phiếu yêu cầu, quy ước cấu tạo). Vòng tự sửa không bao giờ gửi chúng cho mô hình; một đột biến (`M12`) canh điều đó, vì mỗi lượt gọi là tiền thật. (e) **Vòng tự sửa**: qua cổng mà dưới 80% thì gọi lại kèm ĐÚNG những tiêu chí mất điểm mà mô hình sửa được, bằng lời dẫn RIÊNG (`facade.retry_habits`, prompts 8.11.0) — bảo mô hình rằng câu trả lời hợp lệ của nó «không dùng được» là dạy sai, lượt sau nó đổi cả những thứ đang đúng. Giữ bản ĐIỂM CAO NHẤT chứ không phải bản mới nhất; lượt sửa hỏng ở cổng thì vẫn lưu bản trước đó. (f) **Điểm chấm lúc ĐỌC, không lưu vào artifact**: thước còn lớn lên theo số hồ sơ đo được, một con số đóng băng trong artifact bất biến sẽ nói dối ngay lần đầu thước đổi.

**Lỗi đã bắt được ngay trong lượt chấm đầu tiên, ghi lại vì nó là bài học về cách ĐO:** bộ chấm bản đầu dùng *relative luminance* Y của sRGB cho hai tiêu chí màu. Sai. «Ghi bạc» #A7ABAE có Y = 0,40 nên bị xếp vào nhóm màu TỐI, trong khi bốn trong sáu hồ sơ NVG dùng đúng loại ghi sáng ấy cho thân nhà — **cái thước chấm trượt chính những bản vẽ nó được dựng từ đó**. Đã đổi sang **L\*** của CIELAB (độ sáng cảm nhận): ghi bạc L\* = 69,8, nâu đất 42,8, trắng 96,5 — khe hở tự nhiên nằm giữa 69,8 và 43,2 nên ngưỡng 60 tách đúng nhóm của hồ sơ. Điểm bản demo nhảy từ 85% lên **94%** sau khi sửa phép đo, và con số 85% trước đó là con số SAI chứ không phải bản vẽ kém.

**Số đo đầu tiên** (bản mặt đứng «Biệt thự nhà vườn (demo)» dựng 20/09 bằng `gpt-5.6-terra`): **94%** trên 83,3 phần trọng số chấm được. Mất điểm duy nhất ở **R1 — lan can**: bộ vẽ dùng 110 cm, hồ sơ thật 80–90 cm (n = 4). **Chưa tự sửa** — 1,1 m là con số quen của quy chuẩn lan can nhà cao tầng, hạ nó theo sáu ngôi nhà thấp tầng là việc của người ký bản vẽ (ghi vào `doi_chieu_so_moi` của `kb/facade_experience.yaml`, chờ Haan). Ba tiêu chí không chấm được trên hồ sơ này: hai tiêu chí mái Nhật (nhà mái bằng) và C1/C3 (mặt tiền không có cửa sổ nào cùng tầng với cửa chính) — chỗ sau đáng soi lại ở bước dựng khung.

**Còn lại của đợt này:** kỹ sư chấm lại trên cùng bảng tiêu chí (Haan chọn «máy chấm + kỹ sư chấm lại»), và bổ sung bộ vẽ những hình hồ sơ có mà bộ vẽ chưa dựng được — sảnh mái dốc có cột, cửa đầu vòm, ô tròn trang trí. Chừng nào bộ vẽ chưa dựng nổi thì chấm chúng cũng vô nghĩa, nên chúng nằm ở mục `chua_cham_duoc` của thước kèm lý do.

## T64

**Hàng rào không được bịt lối vào; nhật ký gọi AI nạp 25 lượt, hiện 12** (20/09/2026, Haan: «bản vẽ mặt bằng vẽ phòng để xe (có ô tô) ở bên phải nhưng bản vẽ mặt đứng thì không có lối vào phòng để xe cho ô tô… hai bản vẽ không được phép mâu thuẫn nhau»). (a) **Chẩn đoán trên chính tờ vẽ**, không trên ảnh: bộ vẽ chỉ chừa chỗ cho CỔNG, nên nhà có cả cửa chính lẫn cửa để xe thì cổng đứng trước một cái và hàng rào chạy liền qua cái còn lại. Trên hồ sơ demo: cổng 360 cm phủ đúng cửa để xe, còn hàng rào cắt ngang cửa chính — không có lối cho người đi bộ. Ảnh phối cảnh chỉ làm chỗ sai ấy dễ thấy hơn. (b) **Luật CỨNG, không phải thói quen nghề.** T49 cho phép chặn khi «không dựng được / không đi được», và lối vào bị bịt đúng là «không đi được» — đây là hai tờ vẽ của CÙNG một ngôi nhà nói ngược nhau, không phải một lựa chọn thẩm mỹ. `check.ts` thêm hai lỗi chặn: có lối vào mà chỉ có rào không cổng; và cổng hẹp hơn cửa để xe («ô tô không vào được phòng để xe»). (c) **Bộ vẽ tự lo phần toạ độ** (T15): hàng rào dựng bằng phép trừ — cả bề ngang, khoét chỗ cổng, rồi khoét chỗ TỪNG lối vào còn lại; cổng nới rộng cho phủ hết lối vào nó đứng trước. (d) **Lời dẫn ảnh** (prompts 8.12.0) nói thẳng: chỗ nào tờ vẽ chừa khoảng trống trên hàng rào thì ảnh cũng phải chừa — xe phải vào được gara, người phải đi được tới cửa chính. (e) **Nhật ký gọi AI**: nạp 25 lượt gần nhất thay vì 500, hiện 12 dòng, nút «Xem tất cả 25 lượt» mở hết. Dòng tổng cộng CẢ 25 lượt chứ không chỉ 12 — một dòng tiền cộng thiếu là sai lặng lẽ. Dòng đếm tiền của TỪNG LƯỢT CHẠY giữ trần riêng 200: một lượt xếp mặt bằng ba phương án nhà năm tầng đã quá 25 lượt gọi.

**Lý do / đánh đổi:** «Chỉ giữ 25 lượt» được hiểu là giới hạn ĐỌC, không phải xoá — `design_ai_call` là sổ tiền, và màn hình nói rõ «dòng cũ hơn vẫn còn đủ trong cơ sở dữ liệu, không bị xoá». Cắt bớt trên màn hình thì xem lại được; xoá dòng thì không, nên tôi không tự xoá. Phép thử canh hàng rào đã kiểm là KHÔNG vô dụng: bỏ phép trừ lối vào ra thì nó đỏ. Còn một chỗ mặt đứng vẫn chưa nói hết mặt bằng — mặt tiền hồ sơ demo không có cửa sổ nào cùng tầng với cửa chính (hai tiêu chí C1, C3 của thước chấm không chấm được); đó là câu hỏi cho bước dựng KHUNG, chưa trả lời.

## T65

**Kỹ sư chấm lại; ba hình của hồ sơ thật nay vẽ được; cửa sổ mặt tiền là tuỳ ngôi nhà** (20/09/2026 — Haan: «việc có cửa sổ ở mặt tiền là không bắt buộc, có nhà cần có, có nhà không», và làm nốt hai việc còn lại của T63).

(a) **Cửa sổ mặt tiền không bắt buộc ⇒ C1 và C3 là KHÔNG ÁP DỤNG, không phải «thiếu đầu vào».** Hai nhánh ấy xử lý trọng số ngược nhau (T63c), nên xếp nhầm là lặng lẽ co MẪU SỐ của điểm: một ngôi nhà hợp lệ vĩnh viễn chỉ chấm được 1/3 nhóm Cửa, con số vẫn ra bình thường và không ai thấy nó đang nói về một phần nhỏ hơn của ngôi nhà. Thước nhận ba điều kiện mới — `main_door`, `front_window`, `main_door_window` — và nhà phố lấy cửa để xe làm lối vào cũng thành «không có cửa chính», không phải «thiếu số đo». Tầng đem đo là **tầng có cửa chính**, không phải tầng thấp nhất: nhà phố mẫu để tầng trệt chỉ có cửa để xe, đo tầng thấp nhất là kết tội nó không có cửa sổ một cách oan uổng. `score_version` 1 → **2**: cùng một bản vẽ nay có mẫu số khác, hai lượt chấm khác phiên bản thước không đem so thẳng được. Điểm hồ sơ demo 94% → **95%** (nhóm Cửa từ 8,3 phần lên đủ 25).

(b) **Kỹ sư chấm lại** (`contracts/ai-facade-review.schema.json`, migration 0131, loại artifact `ai_facade_review`). Bốn ranh giới: **không chấm KHÔNG PHẢI chấm 0** — tiêu chí bỏ qua giữ nguyên điểm máy, nên bảng rỗng bằng đúng «đồng ý với máy» (đột biến `M13` canh); **kỹ sư chấm được chỗ máy bỏ trống** — phần trọng số ấy quay lại mẫu số, và đó mới là giá trị lớn nhất của việc chấm tay, không phải chuyện sửa vài con số máy đã có; **tiêu chí không áp dụng có trọng số 0** nên màn hình KHÔNG mời chấm nó — một ô nhập không dịch chuyển con số nào là lời nói dối im lặng; **không phải phê duyệt** — hợp đồng cố ý không có ô «đạt / không đạt», kết quả AI vẫn là nháp tới khi duyệt qua đúng luồng (PRD 2.3). Bản chấm mang `facade_ref` và `score_version`: thiếu một trong hai thì «kỹ sư chấm 70» là câu không kiểm chứng được. Tìm bản chấm của đúng bản vẽ nào đi qua **cạnh lineage** (`edgeTargets`), không lọc payload — một hồ sơ dùng lâu có hàng chục bản chấm, đọc hết để tìm bản mới nhất là chuỗi lượt đi kho lớn dần theo thói quen dùng, không gì báo. Đây là loại artifact ĐẦU TIÊN mà nội dung do NGƯỜI viết.

(c) **Bổ sung bộ vẽ ba hình hồ sơ có mà bộ vẽ chưa dựng nổi**: `arch` (vòm đầu cửa — M6), `oculus` (ô tròn R700 — M3), `porch_roof` (sảnh trước mái dốc — M2, M4). Mô hình vẫn chỉ khai KHUNG BAO; cung, đường tròn và đường nóc do chương trình tính (T15) — bán kính vòm suy từ dây cung và độ vồng nên một công thức lo cả vòm nửa tròn lẫn vòm cung. Tờ SVG, ảnh neo và DXF ra cùng hình vì cả ba đi qua `renderElevationBody`, và bộ đổi DXF vốn đã đọc được cung `A` lẫn thẻ `circle`. Vòm và mái sảnh được phép đè lên lỗ mở (chúng đứng TRƯỚC hoặc TRÊN cửa trong đời thật); **cột thì không** — một cây cột giữa cửa là bịt lối đi, đúng loại mâu thuẫn T64 phải chặn. **Không thành tiêu chí chấm**: sảnh 2/6 hồ sơ, vòm và ô tròn mỗi thứ 1/6 — đó là lựa chọn của từng ngôi nhà, không phải thói quen phòng thiết kế; trừ điểm một mặt tiền hiện đại vì nó không có vòm là bịa ra một chuẩn hồ sơ không nói. Chúng vẫn tính vào T3 («mặt tiền không để trơn»).

**Một lỗi thật bắt được khi làm việc này, và hàng rào dựng cho nó:** hai nút «Chọn bản này» và «Thôi hiện» của bước Mặt đứng (T62) gọi `/design/facade/…` trong khi tuyến nằm ở `/design/ai/facade/…`. Lệch đúng một đoạn đường dẫn, và **không một phép thử nào đỏ**: phép thử giao diện mock cả tầng gọi mạng, phép thử Worker gọi thẳng vào hàm xử lý, nên không bên nào nối hai đầu. Trên màn hình nó cũng không hỏng ở chỗ dễ thấy — cả trang vẫn dựng, chỉ một dòng đỏ nhỏ khi bấm. Đã sửa, và thêm `web/src/hooks/__tests__/design-api-paths.test.ts`: đọc thẳng mã nguồn, dựng bảng tuyến Hono từ các lần `route()` rồi đối chiếu mọi đường dẫn `designApi` của giao diện. Kiểm là không vô dụng: đặt lại đường dẫn cũ thì nó đỏ đúng dòng ấy.

## T66

**Mục khảo sát lan can; và ba lỗi đo lộ ra khi làm nó** (20/09/2026 — Haan: «thêm 1 mục khảo sát cho lan can: vật liệu, chiều cao», kèm ảnh chụp lỗi «Phiếu yêu cầu chưa đúng. Kiểm tra lại các ô đã điền»).

(a) **Mục «Lan can ban công»** của phiếu nay có bốn ô: kiểu, **vật liệu**, màu, **chiều cao (cm)**. Chiều cao là số duy nhất của nhóm Lan can mà thước chấm đo (R1) và nó do CHƯƠNG TRÌNH đặt, trước đây chỉ lấy từ `kb/construction_norms.yaml` — nghĩa là một hồ sơ muốn khác 110 cm thì không có đường nào ngoài sửa quy ước cho cả kho. Số ấy chép thẳng vào `elevation.railing_h_cm` của ý tưởng, nên tờ SVG, tệp DXF, ảnh neo và thước chấm đọc CÙNG một chỗ; hàm `railingCmOf` là nơi duy nhất viết phép ưu tiên «phiếu thắng quy ước». Chiều cao KHÔNG vào khối yêu cầu gửi mô hình: bộ vẽ đặt nó, gửi đi là tiêu chữ cho thứ mô hình không cầm. Cả hai khoá mới **không bắt buộc** trong hợp đồng — phiếu lưu trước hôm nay không có chúng, và artifact là bất biến (bài học `saved_at`).

(b) **Lỗi Haan gặp: `maxItems: 6` của `decorations`.** Kỹ sư tick 7 ô trang trí, phiếu bị từ chối. Trần 6 đặt khi danh mục còn 9 mã; danh mục nay 12 mã và không gì buộc hai con số đi cùng nhau — kiểu hỏng của một **số viết tay nằm cách xa thứ nó nói về**: thêm mã vào danh mục thì biểu mẫu hiện thêm ô tick, còn trần thì đứng yên. Trần lên 12, và một phép thử đọc cả `kb/facade_vocabulary.yaml` lẫn hợp đồng buộc chúng đi cùng («tick HẾT mọi ô vẫn phải lưu được»).

(c) **Câu lỗi không dẫn tới đâu.** Worker vốn trả kèm danh sách mục hỏng, nhưng lớp gọi của trình duyệt **vứt bỏ** nó, nên màn hình chỉ còn một câu cho một phiếu mười bốn mục. Nay `DesignApiError` chở `issues` và biểu mẫu liệt kê ra. Chữ của thư viện kiểm kiểu là tiếng Anh và nói theo ngôn ngữ kiểu dữ liệu («Array must contain at most 6 element(s)») nên KHÔNG lên màn hình: Worker đổi sang câu tiếng Việt nói tên mục và lý do (`facadeBriefIssueText`), đúng cấu trúc «việc gì không làm được + cần làm gì» (CGD 5.5).

(d) **Lỗi đo lộ ra khi đặt ô chiều cao: nhà KHÔNG CÓ ban công vẫn bị trừ điểm lan can.** Hồ sơ demo không có ban công nào — và R1 chính là chỗ duy nhất nó mất điểm. Tệ hơn: biểu mẫu ẩn mục lan can đúng ở ngôi nhà ấy (không ban công thì không hỏi), nên kỹ sư không có đường nào sửa con số bị trừ. Cùng một họ với chuyện cửa sổ ở T65: đây là thứ ngôi nhà KHÔNG CÓ, không phải thứ chưa đo được. R1 nhận `chi_khi: balcony`; điểm hồ sơ demo **95% → 100%**, đọc là «90 trên 90 phần trọng số chấm được».

(e) **Nhóm «Lan can ban công» LUÔN hiện.** Haan mở phiếu ra không thấy mục lan can đâu: nó bị ẩn khi phương án mặt bằng chưa có ban công nào ra mặt trước — và ẩn LẶNG LẼ. Nhóm cổng và tường rào bên cạnh cũng ẩn theo điều kiện nhưng NÓI ra lý do («nhà sát ranh mặt tiền, không có sân trước»); chỗ này thì không, nên nó đọc như một mục bị thiếu chứ không phải một mục không áp dụng. Nay nhóm luôn hiện, và khi mặt bằng chưa có ban công thì có một dòng nói đúng điều đó kèm «điền sẵn vẫn được».

**`score_version` 2 → 3 ngay trong ngày.** Bản chấm tay đầu tiên đã lưu dưới thước 2 (ghi kèm «điểm máy 95%»), nên sửa R1 phải là một số MỚI — để nguyên số 2 là hai cái thước khác nhau cùng mang một tên, và không ai phát hiện được. Màn hình nay gọi bản chấm ấy là «dựng trên bản thước cũ», đã xem thật.

---

## T67

**Bước «3. Phối cảnh» — Đợt A: khung dữ liệu, lời dẫn, ba góc đầu** (20/09/2026, Haan chốt bốn điểm trước khi viết dòng nào).

(a) **Bốn quyết định Haan chọn:** ảnh neo mức **B1** — góc nghiêng và toàn cảnh sẽ nhận thêm tờ **mặt bằng mái** dựng từ toạ độ (Đợt B), không làm khối trục đo 3D cho tới khi đo xong; ảnh **cận cảnh do CHƯƠNG TRÌNH chọn** (có ban công thì chụp ban công, không thì chụp cổng và cửa) — câu trả lời đã nằm trong ý tưởng mặt đứng, hỏi mô hình là trả tiền để nó đoán lại thứ ta đã biết; **người và xe có, kỹ sư tắt được** bằng một ô tích, số xe lấy theo `parking` của đầu bài, cây cối KHÔNG chịu ô ấy; **chưa cho phép lượt gọi thật nào** — viết xong toàn bộ đường vẽ, kiểm bằng client giả, đọc lời dẫn bằng mắt, rồi mới xin phép đo.

(b) **Chuỗi năm góc, nối nhau chứ không độc lập.** `front_day` vẽ từ tờ mặt đứng vector (ảnh neo, không khung tên) và là **ảnh neo của cả bộ**; `front_night`, cận cảnh, `oblique`, `aerial` đều cầm chính tấm ấy làm gốc màu và vật liệu. Đó là cách duy nhất đã có bằng chứng để năm tấm là một ngôi nhà (T21 → T57). Hỏng `front_day` thì **cả bộ dừng**; góc phụ hỏng thì ghi vào `missing[]` kèm lý do tiếng Việt và đi tiếp — bốn tấm dùng được vẫn hơn không có gì.

(c) **Tờ mặt đứng không có chiều sâu, và đó là ranh giới của Đợt A.** Ba góc nhìn thẳng đủ dữ liệu; `oblique` và `aerial` thì không — chiều sâu nhà, hình mái nhìn từ trên, vị trí gara so với sân là thứ mô hình sẽ bịa, và bịa xong thì mâu thuẫn với mặt bằng (đúng họ lỗi T65). Nên hai góc ấy **đòi tờ mặt bằng mái**, chưa có thì không chạy, và lý do nằm trong `missing[]` chứ không lặng lẽ biến mất.

(d) **Lời dẫn đọc TẬP TRƯỜNG TRẮNG, không đọc thẳng đầu bài** (`ai/perspective/context.ts`). Giữ: loại công trình, số tầng, ba kích thước, lối vào trái–giữa–phải, có sân trước không, hiện trạng ba phía, hướng nhà, số xe. Bỏ: danh sách phòng từng tầng, nhân khẩu, `required_spaces`, ưu tiên, ba đoạn chữ tự do — không chữ nào đổi được vẻ ngoài ngôi nhà, mà chúng thì dài, và nhiễu trong lời dẫn ảnh không ra lỗi, nó ra một tấm hơi khác ý mà không ai chỉ được tại chỗ nào. Chặn bằng **cấu trúc** (kiểu trả về không có trường ấy) cộng một phép thử đánh dấu đầu bài bằng chuỗi lạ rồi đòi chúng không xuất hiện.

(e) **Vật liệu nói bằng MỘT bản mô tả.** Tách `facadeLook()` ra khỏi `ai/facade/image.ts` để tờ ảnh mặt đứng và cả năm góc dùng chung. Hai bản mô tả song song là đường chắc chắn dẫn tới hai bộ ảnh lệch màu mà không ai giải thích được vì sao.

(f) **Hướng nắng suy từ hướng nhà CỘNG giờ chụp**, không phải một bảng tra cố định. Cùng ngôi nhà hướng nam: ảnh sáng nắng bên **phải**, ảnh cận cảnh buổi chiều nắng bên **trái**. Mỗi góc khai `sun_time` trong `kb/`, và bản nạp kiểm **hai chiều** — câu ánh sáng dùng `{sun}` mà không khai giờ, hoặc khai giờ mà câu không dùng `{sun}`, đều chặn lúc nạp. Đầu bài không khai hướng thì nói ánh sáng chung, KHÔNG đoán một hướng rồi dựng bóng đổ sai suốt cả bộ.

(g) **Chạy nền qua Workflow, một góc một bước** (`workflows/ai-perspective-steps.ts`). Năm lượt nối nhau quá dài cho một request. Vướng: Worker không có canvas nên tờ neo phải do **trình duyệt** rasterise, mà Workflow thì không hỏi trình duyệt được — nên tuyến khởi động nhận byte, **dựng lại tờ ở máy chủ và đối chiếu cỡ khung**, cất vào `render-store`, rồi chỉ truyền URI vào params. Băm `sha256` của byte trình duyệt gửi lên ghi vào `anchors[]` của artifact: đó là dấu vết truy được duy nhất cho một đầu vào máy chủ không kiểm được.

(h) **KHÔNG chấm điểm bộ ảnh.** Mặt bằng có `plan_quality`, mặt đứng có `facade_quality`; ảnh thì không có thước nào đo được, và bịa ra một con số là tệ hơn không có. Chỗ chống đỡ là nhãn **hai lớp** (`AI_DISCLAIMERS.aiImageSet` bằng chữ trong trang + dấu in lên pixel) cộng câu nói rõ cả bộ dựng nối nhau từ tấm ban ngày — nên một chi tiết chỉ có ở một tấm chưa chắc có thật.

(i) **Không migration.** `kind: ai_image_set` và `step: ai_image_render` đã mở từ 0129. Hợp đồng `ai-image-set` (viết sẵn từ T16) nới: thêm góc `aerial`, thêm `anchors[]`, `options.people_and_vehicles`, `prompt_excerpt` từng góc. Lời dẫn lên **8.14.0**. Hai đột biến mới canh hai hàng rào đắt nhất: M16 (hai góc chạy khi chưa có tờ mái) và M17 (hiện trạng không khai vẫn bị nói ra).

**Đợt B — tờ mặt bằng mái, hai góc còn lại mở** (20/09/2026).

(j) **Tờ neo thứ hai** (`ai/draw/roof-plan.ts`): hình bao từng tầng, mái theo kiểu mái (mái bằng có tường chắn; mái dốc có mép mái đua, đường nóc và bốn đường xiên), ban công nét đứt, vạch lối vào tô đặc trên mặt tiền, và một MŨI TÊN chỉ hướng đường. Tuyến `GET /perspective/:projectId/roof-anchor` phát tờ ra; `POST /runs` dựng lại bằng CÙNG hàm rồi đối chiếu cỡ khung. Mái đua và độ dài nóc đọc từ `kb/facade_vocabulary.yaml` (`overhang_cm`, `hip_ridge_share`) — cùng chỗ tờ mặt đứng đọc.

(k) **Ba thứ tờ này CỐ Ý không vẽ**: ranh thửa, hàng rào, cổng (khoảng lùi không có trong hai artifact, vẽ là bịa một con số — CLAUDE.md 5.2); chữ (lời dẫn nói «Write NO text», mà mô hình ảnh chép lại chữ nó thấy); chuỗi kích thước (số đo đi trong lời dẫn). Hướng đường nói bằng mũi tên, không bằng một dải kẻ — dải kẻ đọc nhầm thành tường hay ranh đất được.

(l) **Ba lỗi CHỈ lộ ra khi mở tờ vẽ ra nhìn**, bộ kiểm khi ấy đang xanh — đúng cảnh báo của CLAUDE.md 8.7 điểm 6. **Một**: vạch lối vào vẽ bằng nét lớp `opening`, cùng 0,25 mm với nét tường nó nằm đè lên, nên hai cửa của biệt thự mẫu **không nhìn thấy được** — mà đó chính là thứ quyết định ảnh góc nghiêng có đúng phía gara hay không. Nay vẽ bằng hình TÔ ĐẶC đặt ngay ngoài mặt tiền. **Hai**: mượn nét của tờ mặt đứng nên mái 0,5 mm đè lên khối nhà 0,25 mm — thứ hạng đảo ngược. Nay có bốn nét riêng trong `kb/sheet_style.yaml` (`roof_block` 0,6 > `roof_edge` 0,3 > `roof_below` 0,15). **Ba**: mũi tên chỉ **ra xa** ngôi nhà, vì hai cánh đầu mũi đặt cứng «phía trên mũi» trong khi bộ đổi toạ độ lật trục y (mặt tiền nằm ở ĐÁY tờ). Nay cánh suy từ chính vector đuôi → mũi. Cả ba khoá lại bằng phép thử; thêm đột biến **M18** cho lỗi thứ nhất.

(m) Năm ảnh chụp vàng của hai tờ mặt bằng và hai tờ mặt đứng đổi đúng **218 ký tự** — năm dòng CSS mới nối vào khối `<style>` dùng chung, không một nét vẽ nào khác. Đã đối chiếu từng tệp trước khi cập nhật. Phép thử CORS nay quét **cả ba** tệp tuyến của nhánh AI, không riêng `routes.ts`: tuyến tách ra tệp mới là đúng lúc một header lọt khỏi tầm nó mà vẫn xanh.

**Đợt C — giữ lại mọi bộ đã dựng, và vẽ lại ĐÚNG MỘT góc** (20/09/2026).

(n) **Dải chọn bộ cũ**, cùng khuôn bước Mặt đứng (T64): `/state` trả thêm `imageSets` (mới nhất trước, bỏ bản đã ẩn, tối đa 12) và `imageSetFacadeRef`; hai tuyến `POST /perspective/choose` (đặt lại mốc — đường QUAY LẠI, để không phải trả tiền một lượt chạy nữa cho thứ mình đã có) và `POST /perspective/hide` (thôi hiện, bảng `design_artifact_hidden`, bộ đang hiệu lực thì gỡ luôn mốc). **Tách «bộ đang MỞ» khỏi «bộ HIỆU LỰC»**: mở bộ cũ ra xem không đổi thứ đang hiệu lực.

(o) **Vẽ lại một góc tốn ĐÚNG MỘT lượt.** Artifact bất biến nên không sửa tại chỗ được, nhưng mã artifact là mã băm NỘI DUNG và bốn góc kia giữ nguyên `uri` — nên bộ mới chỉ trả tiền cho tấm vừa vẽ, byte của bốn tấm kia không sinh lại. Tuyến `POST /perspective/redraw` **đồng bộ** (một lượt gọi thì giữ được kết nối) và **không cần tờ neo mới**: mọi thứ cần đã nằm trong kho từ lượt chạy trước, kể cả `anchors[]`. Lựa chọn người-xe đọc từ chính artifact cũ — một tấm vẽ lại không được lặng lẽ đổi từ «không có người» sang «có người».

(p) **`front_day` KHÔNG vẽ lại lẻ được, và đó là ràng buộc chứ không phải thiếu sót.** Bốn góc còn lại dựng ảnh→ảnh TỪ CHÍNH tấm ban ngày; thay nó mà giữ bốn tấm kia là giao cho khách một bộ năm ảnh của HAI ngôi nhà — đúng thứ cả bước này sinh ra để tránh. Phép từ chối nằm ở hàm thuần `redrawAloneRefusal()` chứ không ở tuyến, nên kiểm được; màn hình **nói lý do** ở chỗ đáng lẽ là nút, không ẩn nút đi (ẩn thì người dùng đi tìm và câu «vì sao» không nằm ở đâu cả). Mốc `SET_ANCHOR_VIEW` gom về một chỗ — `assemble.ts` đặt cờ `anchor` theo nó, `views.ts` xếp nó chạy đầu, tuyến từ chối theo nó; có phép thử canh ba chỗ không lệch.

(q) Thêm **M19** (cho phép vẽ lại lẻ tấm gốc) — bị bắt. Tổng **19 đột biến**, **46 phép thử** cho bước Phối cảnh.

**Đợt D — nút «Dừng», và ba chỗ hỏng lộ ra từ lượt chạy thật đầu tiên** (20/09/2026, Haan: «tôi tự gọi 1 lần nhưng cứ chạy mãi… thêm nút stop để phòng những case như này»).

(r) **Nguyên nhân lượt ấy treo là do sửa mã Worker trong lúc nó đang bay.** `wrangler dev` chạy suốt phiên; mỗi lần ghi một tệp `workers/src/**` là một lần nạp lại và **giết instance Workflow**, để lại dòng `design_ai_run` kẹt ở `running`. Đúng ca đã ghi trong memory `khong-sua-worker-khi-dang-chay-nen.md` và đã quên kiểm. Nhưng nó lộ ra ba chỗ hỏng thật, và cả ba đều đáng sửa.

(s) **Bước Phối cảnh không có nút Dừng.** Nút của hai bước trước nằm trong `ai-live-call.tsx`, gắn với bảng theo dõi trực tiếp — mà lượt vẽ ảnh cố ý không có bảng ấy (model ảnh không phát token dọc đường). Nay có nút riêng cạnh dải tiến độ. Tuyến `/runs/:id/cancel` đặt THẲNG trạng thái nên nó gỡ được cả dòng thây ma, không cần instance còn sống.

(t) **Tín hiệu huỷ không đi tới lời gọi ảnh.** `AiImageOptions` không có `signal`, nên bấm Dừng giữa một lượt vẽ chỉ có tác dụng ở góc SAU: lượt đang bay vẫn chạy hết bốn phút và vẫn tính tiền, trong khi màn hình đã nói «đang dừng». Nay `signal` xuyên từ Workflow → `drawViewStep` → cả hai client (OpenAI truyền vào `cancel` của `fetch`, Gemini truyền vào `call` vốn đã nhận sẵn mà chưa ai dùng). Lượt bị dừng ghi `error_code: 'cancelled'`, không phải tên lỗi của runtime.

(u) **Lượt phối cảnh chết phải đợi HƠN HAI TIẾNG mới được tuyên bố là hỏng.** `GET /runs/:id` đã có sẵn phép bắt thây ma: dòng CÓ NHỊP TIM thì ba phút im lặng là đủ, dòng không có nhịp thì dùng `RUN_STALE_MS` = 125 phút. Bảng theo dõi trực tiếp là thứ đập nhịp, mà lượt vẽ ảnh không có nó — nên nó rơi vào nhánh 125 phút, và suốt 125 phút ấy `activeRun` chặn luôn lượt sau. Nay vòng thăm dò nút Dừng ĐỒNG THỜI đập nhịp (`partial.heartbeat`), và phép bắt thây ma nhận cả hai dạng nhịp. Một lượt chết nay tự nói là hỏng sau **ba phút**.

(v) Thêm **M20** (tín hiệu Dừng không tới lời gọi) — bị bắt. Tổng **20 đột biến**, **47 phép thử** cho bước Phối cảnh.

**Chưa làm:** nút tải CẢ BỘ một lần (hiện tải từng tấm); và **chưa có lượt chạy thật nào đi tới kết quả** — lượt duy nhất Haan bấm bị chính việc sửa mã giết giữa chừng.

---

## T68

**Trung thực kích thước xuyên cả chuỗi — số đo phải đi tới lời dẫn ảnh bằng SỐ** (20/09/2026,
Haan báo lỗi trên lượt chạy thật đầu tiên của bước Phối cảnh).

**Lỗi đo được:** đầu bài khai `massing.yard_depth_m.front = 3`. Tấm `aerial` của lượt
`c990c1e5` vẽ sân trước **8–10 m** — sai tới mức nhìn là thấy, vì một thân ô tô đã hơn 4 m mà
sân vẫn còn thừa. Haan: _«hoàn toàn sai về mặt logic mà ai cũng có thể nhận ra»_, và đặt mức
nghiệm thu: ảnh phối cảnh và ảnh nội thất **không cần đúng 100% kích thước, nhưng phải đúng
logic thông thường và đạt ít nhất 90% so với kích thước thật**.

**Nguyên nhân:** con số 3 m đi được tới bước mặt bằng (`ai/buildable.ts` lấy mức lớn hơn giữa
khoảng lùi quy hoạch và sân mong muốn, đẩy khối nhà lùi đúng 3 m — mặt bằng ĐÚNG) rồi chết ở ba
chỗ liên tiếp: `facade/frame.ts` tính `minFrontY` rồi trả ra `frontYard: minFrontY > 0` (số →
một bit); `perspective/context.ts` không lấy lại số mà **suy ngược** từ «ý tưởng có cổng
không»; `perspective/prompt.ts` viết «there is a front yard between the gate and the front
door», không một con số nào. Tờ neo mặt bằng mái thì **cố ý không vẽ ranh thửa**, với lý do đã
ghi trong mã: _«khoảng lùi không có trong `ai_floor_plan` lẫn `ai_facade_concept`, muốn vẽ thì
phải bịa»_ — lý do ấy SAI: gốc toạ độ mặt bằng là góc trước-trái thửa, nên hình bao đã nằm đúng
chỗ của nó, chỉ thiếu đường bao ngoài.

**Một lượt rà soát riêng tìm ra 12 chỗ cùng bệnh**, không phải một. Nặng nhất ngoài ca trên:
bề rộng cửa chính và cửa gara thu về `left|centre|right`; ban công thu về `hasBalcony: boolean`;
`railing_h_cm` có trong artifact mà lời dẫn không đọc; chiều cao TỪNG tầng mất, chỉ còn tổng;
ảnh mặt bằng nội thất chỉ nhận diện tích m² chứ không nhận kích thước phòng, trong khi lời dẫn
lại ra lệnh «vẽ nội thất vừa với căn phòng»; và tệ nhất, lời dẫn bảo mô hình chép «các con số đã
cho» lên chuỗi kích thước nhiều đoạn trong khi chỉ đưa cho nó hai số tổng — tức **mời nó bịa số
rồi in lên tờ đưa khách**.

**Đã sửa:**

1. `PerspectiveContext` mang số thật: `lot {widthM, depthM}`, `yard {frontM, backM, leftM,
   rightM}` đo thẳng từ toạ độ mặt bằng, `mainDoorWidthM`, `garageWidthM`, `balconies[]`,
   `railingHM`, `levelHeightsM[]`, `stepUpM`. Thiếu kích thước thửa thì cả cụm là `null` và lời
   dẫn **không nói gì về sân** — không đoán.
2. Lời dẫn nói **số VÀ hệ quả**. Số một mình không đủ: nói «sân 3 m» rồi vẫn xin «một chiếc ô tô
   cho sinh động» là ra đúng tấm ảnh đã hỏng. `kb` giữ chiều dài xe thật (4,5 m / 2,0 m) và ba
   câu hệ quả; sân ngắn hơn thân xe thì câu người-xe đổi sang bản «xe đứng ngoài đường hoặc
   trong gara».
3. **Tờ neo mặt bằng mái vẽ ranh thửa**, lấy từ `siteGeometry(brief.site).boundary` — đa giác
   THẬT, mọi hình dạng thửa. Ràng buộc bằng HÌNH, không chỉ bằng chữ. Nét **đứt** theo quy ước
   ranh đất: bản dựng đầu vẽ nét liền cùng màu và soát bằng mắt thấy ngay là ranh với khối nhà
   không phân biệt được — mô hình sẽ đọc ranh thành một ngôi nhà 15×20.
4. Cổng, rào, lan can nói bằng **mét** như phần còn lại (trước đó cm, lẫn lộn hai đơn vị trong
   cùng một lời dẫn). Điều kiện `gate.w && gate.h` sửa thành từng số một — hợp đồng chỉ bắt buộc
   `type`, nên thiếu một là mất cả hai.
5. Ảnh mặt bằng nội thất nhận **kích thước từng phòng**, và lời dẫn chuỗi kích thước đổi thành
   «chép số từ chính bản vẽ đính kèm; đoạn nào không đọc được thì vẽ KHÔNG có số — không bao giờ
   bịa một con số».

**Một lỗi tự gây trong lúc sửa, đáng ghi:** lớp CSS của ranh thửa đặt là `rl`, trùng `railing`.
Luật sau đè luật trước nên lan can của MỌI tờ mặt đứng thành nét đứt — và **ảnh chụp vàng không
bắt được**, vì hình y nguyên, chỉ CSS khác. Nay tên là `rlot`, và có một phép thử canh mọi tên
lớp trong `CLS` không trùng nhau. Đột biến M23 canh chỗ này, M21 canh số đo sân, M22 canh câu
hệ quả.

## Phụ lục — bảng «Ngoại lệ có kiểm soát» cũ của CLAUDE.md 8.2 (đã lỗi thời một phần: T21 bị T22 gỡ, quy chuẩn bị T30/T42 gỡ)

### Ngoại lệ có kiểm soát — NHÁNH AI (T10–T14)

Chín điểm trên viết cho **bộ giải nội bộ**, và ở đó chúng không nới điểm nào. Nhánh AI là một
đường ĐỘC LẬP chạy song song (T10, T14): người dùng chọn «Bộ giải nội bộ» hay «AI» ngay trên
trang thiết kế, và hai đường không dùng chung ràng buộc. Bốn điểm dưới đây được nới **chỉ cho
nhánh AI**, không điểm nào nới cho bộ giải.

| Điểm | Nới thế nào ở nhánh AI | Ranh giới còn lại |
| --- | --- | --- |
| 1 | Ảnh nội thất, mặt cắt **và từ 10/09/2026 cả TỜ MẶT BẰNG CÔNG NĂNG** (T21) sinh từ chữ, không có hình học nguồn — mô hình ảnh KHÔNG nhận ảnh neo, chỉ nhận lời mô tả | Mang nhãn riêng _"Ảnh minh hoạ — không theo hình học đã giải"_, khác nhãn của ảnh dẫn xuất. Riêng tờ mặt bằng, nhãn phải nói rõ **"không dựng từ toạ độ"**: nó trông như một bản vẽ kỹ thuật nhưng không có kích thước nào đo được. Nhãn in đè lên pixel ở trình duyệt VÀ hiện bằng chữ trong trang — canvas hỏng được, chữ thì không |
| 2 | Mô hình sinh **diện tích** (chương trình không gian). **Mặt bằng thì KHÔNG còn nới** từ T37 (13/09/2026): mô hình khai **cây chia** (nhát cắt, phòng ở ô nào, cửa nối phòng nào), chương trình `ai/tree/` gán mọi toạ độ. Từ T48 (16/09/2026) mô hình vẽ **bản phác lưới ô ~1 m** — toạ độ thô; chương trình nắn và gán mọi số | Kết quả là **đề xuất**, không bao giờ thành `floor_plan` chuẩn và không đi vào luồng phát hành. Bộ giải CP-SAT và Lớp 3a tất định không đổi một dòng |
| 4 | Lời dẫn gửi cho mô hình **KHÔNG tiêm ngưỡng quy chuẩn** — mô hình chỉ nhận đầu bài | Ngưỡng vẫn là dữ liệu ở `rules/`, và vẫn được đọc — nhưng để **đối chiếu SAU**, sinh cảnh báo, không để ràng buộc mô hình |
| 5 | **Mô hình khai NỘI DUNG bản vẽ dạng dữ liệu**, và từ T21 khai thêm `levels[].sheet_prompt` — đoạn mô tả tờ giấy cho một mô hình ảnh. Tờ TRÌNH BÀY do mô hình ảnh dựng; bộ vẽ tất định (`ai/draw/`) tụt xuống làm **bản đối chiếu kích thước**; Container không dựng gì cho nhánh AI | Bộ vẽ ấy KHÔNG phải Container và KHÔNG dùng lại một dòng nào của bộ giải. Cảnh báo quy chuẩn vẫn đo trên **dữ liệu phòng**, không bao giờ đo trên tờ vẽ — và điều đó nay quan trọng hơn hẳn, vì tờ ảnh không dựng từ toạ độ. Chữ do mô hình sinh (tên phòng, nhãn, `sheet_prompt`) là nội dung KHÔNG TIN ĐƯỢC — thoát ký tự khi dựng SVG, và mọi tờ hiển thị qua `<img>` |

⚠️ **Điểm 5 đã đổi ngày 09/09/2026 (T15).** Trước đó mô hình TỰ VIẾT chuỗi SVG, và Worker phải lược
nội dung nguy hiểm trong đó (`ai/svg-guard.ts`, đã gỡ cùng đường mã ấy). Đo thật hôm ấy: Gemini Flash trả về bản phác **không cửa, không chuỗi
kích thước, vách không bề dày, 13/25 phòng có tên** — đọc được nhưng không phải bản vẽ dùng được.
Dữ liệu thì **kiểm được** (thiếu cửa, cửa đặt ngoài tường, tường không bao kín phòng đều bắt được
và bắt mô hình sửa); một tệp SVG thì chỉ đếm được ký tự.

**Vì sao nới điểm 4 và 5** (T14, 09/09/2026 — Haan quyết): nhánh AI có giá trị đúng ở chỗ nó
KHÔNG bị bó bởi cùng bộ ràng buộc với bộ giải. Tiêm ngưỡng quy chuẩn vào lời dẫn rồi bác kết
quả khi lệch là dựng lại bộ giải bằng một công cụ dở hơn. Đổi lại, kết quả AI **không được
phép** đi vào hồ sơ phát hành, và mọi chỗ lệch quy chuẩn QUỐC GIA đều phải hiện thành **cảnh
báo** cho kiến trúc sư — không chặn, không tự sửa (Haan: _"nếu đúng là quy chuẩn VN tiêu
chuẩn, được áp dụng toàn quốc thì oke, hãy sinh cảnh báo khi vi phạm"_).

⚠️ **`rules/base/` từng TRỘN quy chuẩn với kinh nghiệm nghề, và câu ở trên từng nói sai điều
đó.** Đo ngày 09/09/2026: 41 quy tắc trong đó, 18 trích từ QCVN 01:2021/BXD và TCVN 4451:2012,
còn **23 là thói quen của Phòng Thiết kế NVG**. Đã tách: `rules/base/` nay chỉ còn 18 quy tắc
pháp quy (đều mức `error`), 23 quy tắc kinh nghiệm chuyển sang `rules/nvg-experience.yaml`
(đều mức `warning`). Nhánh AI đọc hai gói RIÊNG theo lựa chọn của kỹ sư (T20); bộ giải nội bộ
vẫn nhận cả hai gộp lại nên hành vi không đổi.

Gói `rules/locality/` KHÔNG dùng ở nhánh AI: quy định riêng của một tỉnh không phải thứ để
cảnh báo trên một đề xuất tham khảo, và hiện chưa tỉnh nào có gói.


---

## T69

**Hai Worker phải phát hành cùng nhau, và phải tự báo khi lệch** (21/09/2026, Haan báo lỗi trên
bản chạy thử công khai).

**Lỗi đo được:** mở tab «AI Design» của hồ sơ `c815a6e6` trên `nvg.tests99.workers.dev` ra một
khối chữ đỏ: `Dữ liệu không đúng hợp đồng "ai_facade_concept": materials.4.where — Invalid enum
value. Expected 'base' | 'body' | … received 'main_door'; … elevation.levels.0 — Unrecognized
key(s) in object: 'x0', 'x1'`, kèm nút «Thử lại».

**Nguyên nhân — KHÔNG phải lỗi sinh dữ liệu, mà là lỗi ĐỌC.** `ArtifactRepository.head()` gọi
`parseArtifact` cả khi đọc lại từ kho, nên một bản Worker cũ hơn hợp đồng đã ghi ra artifact thì
không đọc nổi chính kho của mình. Ba điều kiện cộng lại:

1. Artifact đang là bản hiệu lực (`sha256:ff38e870…`) ghi 20/09 15:10 từ máy phát triển chạy mã
   sau T59: `materials[].where` có `main_door`/`side_door`/`window`/`garage_door`, và
   `elevation.levels[]` có `x0`/`x1` (khung do Worker suy từ mặt bằng).
2. Worker `nvg-api` công khai tải lên **19/09 16:15** — trước cả `adf044e`. Hợp đồng ở bản đó:
   `where` chỉ 7 giá trị, `levels` chỉ `level/z/h` kèm `additionalProperties: false`. Kiểm chứng:
   `GET /design/ai/facade/vocabulary` trên bản đó trả 404.
3. Máy phát triển và bản chạy thử **dùng chung một project Supabase** (CLAUDE.md 6.3), nên mỗi
   lượt chạy thử ở máy ghi thẳng artifact vào kho của bản công khai.

Giao diện `nvg` lại được phát hành 20/09 11:28, tức **sau** T59. Bản công khai chạy giao diện mới
với API cũ hơn một ngày, và không có gì báo.

**Đã sửa:**

1. `npm run deploy` phát hành **cả hai** Worker, API trước giao diện sau. Thứ tự đó có lý do: API
   mới hơn giao diện thì vẫn đọc được mọi thứ; ngược lại là đúng cảnh hôm nay.
2. `CONTRACTS_FINGERPRINT` — băm nội dung `contracts/`, sinh cùng `npm run contracts:gen`. Cả hai
   bên nhúng lúc dựng; Worker trả ở header `X-NVG-Contracts` mọi phản hồi (đã thêm vào
   `exposeHeaders`, `cors-expose.test.ts` canh); giao diện đối chiếu và hiện dải báo ở vỏ màn hình
   thiết kế. Băm **nội dung** chứ không lấy mã commit: câu hỏi là «hai bên có cùng hợp đồng
   không», mà báo động cho mỗi lần commit là cách chắc chắn để người dùng học cách bỏ qua báo động.
   Chỉ BÁO, không chặn — khoá cả module vì một dòng mô tả trong JSON Schema thì hại hơn lợi.
3. `ContractError` phân biệt `read` với `write`. Hỏng lúc đọc không còn đổ cho dữ liệu: dữ liệu
   không sai, nó viết theo phiên bản hợp đồng khác, artifact bất biến nên không sửa tại chỗ được,
   và «Thử lại» bao nhiêu lần cũng ra đúng kết quả đó. Câu mới nói việc phải làm và ai làm được
   (CGD 5.5). Danh sách mục hỏng chuyển sang `error.detail`, chỉ vào log.

**Còn treo:** gốc thật vẫn là một project Supabase dùng chung. Kể cả hai Worker luôn khớp nhau,
chỉ cần chạy một bản mã mới ở máy là bản công khai lại đọc phải artifact nó không hiểu. Việc tách
môi trường đã ghi ở `BUILD_PLAN.md` 4E — chưa làm, chờ Haan.

## T62

**Đầu bài thiết kế hỏi chi tiết hơn: mười một nhóm câu hỏi mới** (21/09/2026, Haan đặt bài: «khảo sát càng chi tiết, output đưa ra càng đúng với mong muốn»). (a) **Chẩn đoán:** đầu bài cũ hỏi kích thước lô, thành viên, danh sách phòng, phong cách — còn gần hết những thứ QUYẾT bố cục thì không có chỗ nào để khai, nên rơi lại ở Zalo: nền cao hơn đường bao nhiêu, nắng đập vào mặt nào, nhà có thờ cúng không, có thang máy không, ban công đua ra ngoài ranh hay không. (b) **Thêm vào hợp đồng `design-brief` (1.4.0 → 1.5.0, chỉ THÊM trường tuỳ chọn):** tám trường khu đất (cao độ tim đường, cao độ đất, mặt chịu nắng gắt, mặt đón gió mát, bề rộng đường trước nhà, nguy cơ ngập, hiện trạng xây dựng, số tầng nhà liền kề từng mặt) · `family[].ages` · `household` (ngành nghề, tín ngưỡng, cách bố trí nơi thờ, phong thuỷ, kiêng kỵ, kinh doanh tại nhà) · `lifestyle` (nấu ăn, bếp phụ, chỗ ăn, tiếp khách, khách qua đêm, làm việc tại nhà, ca đêm, **người đi lại khó khăn**, phơi đồ, thú nuôi, nếp hằng ngày) · `storage` · `vertical` (thang bộ; thang máy: làm ngay / **chừa chỗ làm sau** / không) · `entrance` (cốt nền so tim đường, bậc tam cấp, dốc dắt xe) · `balconies` (mặt, phạm vi, **đua ra ngoài ranh**, độ vươn, ban công phơi) · `systems` (trữ nước, bình mặt trời, chỗ đặt cục nóng) · `future` (nâng tầng, chia giai đoạn) · `finishing_level` · `parking.car_size`, `parking.ev_charging`. Biểu mẫu vẫn **SÁU mục**: đợt này dựng thành 12 rồi Haan cho gộp lại ngay trong ngày («12 mục là quá dài») — mười hai mục là mười hai lần bấm «Tiếp», mà phần lớn chỉ có vài câu. Sáu mục sau khi gộp: Công trình và khu đất (28 câu) · Gia đình và nếp sinh hoạt (25) · Công năng và lưu trữ (9) · Khối nhà, thang và mặt ngoài (23) · Kỹ thuật và dự trù (7) · Ưu tiên, ngân sách và người quyết định (6). Gộp theo MẠCH HỎI của người khai, không theo nhóm dữ liệu. Kéo theo hai điều: nhóm tổ chức khối nhà trước ẩn cả MỤC với nhà phố, nay ẩn theo TỪNG TRƯỜNG — mục mới còn chứa thang và ban công, thứ nhà phố nào cũng có; và bản vẽ thửa đất trong biểu mẫu nay bám vào TRƯỜNG `site.width_m` chứ không bám mã mục, vì gộp mục suýt làm nó biến mất lặng lẽ. (c) **Tuổi chứ không phải năm sinh:** tuổi quyết không gian (dưới 6 ngủ cùng bố mẹ, trên 70 nên ở tầng trệt); năm sinh là dữ liệu định danh và kéo theo chuyện cung mệnh — thứ phần mềm không được tự quyết (PRD 2.3). Cùng lý lẽ: phong thuỷ vào đầu bài dưới dạng **câu ràng buộc đã được NGƯỜI quyết** (`feng_shui_notes`), không phải ngày sinh để máy luận. (d) **Cao độ nói bằng CHÊNH LỆCH:** hai con số đo theo mốc của người khảo sát nên riêng chúng vô nghĩa với bên nhận; văn xuôi chỉ nói «đất cao/thấp hơn tim đường bao nhiêu». (e) **Trọng số:** gần hết trường mới mang **0** có chủ ý — `completeness_score` là cổng chặn Lớp 2 nên chỉ được đo thứ THIẾU THÌ KHÔNG DỰNG NỔI mặt bằng. Mười một trường đổi hẳn bố cục mang trọng số 1; tổng nhà phố 39 → 50, nên một đầu bài trả lời hết phần cũ vẫn đạt 0,78 — trên ngưỡng 0,7, đợt này **không chặn hồ sơ nào đang chạy**. (f) **Đường đi tới mô hình giữ nguyên khuôn cũ:** danh sách cho phép `ai-brief-digest` (1.1.0 → 1.2.0) rồi `briefNarrative`; mọi ô chữ tự do mới (ngành nghề, phong thuỷ, kiêng kỵ, nếp hằng ngày, các ghi chú) đi qua `scrubIdentity` đúng như bốn ô cũ. (g) **Soát mâu thuẫn thêm chín phép**, tất cả là số học hoặc hai câu trả lời của cùng một người nói ngược nhau: tuổi lệch số người, đất thấp hơn đường, cốt nền thấp hơn đất, thang máy cho nhà một tầng, khai có người đi lại khó khăn mà lối vào chỉ có bậc, có tín ngưỡng mà chọn không có nơi thờ, tầng thờ và tầng kinh doanh vượt số tầng, ban công đua ranh mà chưa biết đường rộng bao nhiêu, chọn «không làm ban công» mà vẫn khai mặt đặt.

**Lý do / đánh đổi:** biểu mẫu dài gấp đôi. Chịu được vì đầu bài điền MỘT lần cùng khách, không phải thao tác hằng ngày của công trường (ngân sách thao tác ở CLAUDE.md 4.6 nhắm vào chỗ khác) — và vì gần hết câu hỏi mới là tuỳ chọn, hiện theo điều kiện, trọng số 0. **Lời khuyên nghề cố ý KHÔNG vào bộ soát mâu thuẫn** (Haan, T52): «nấu chiên xào nhiều mà không có bếp phụ» là ý kiến hay nhưng không phải mâu thuẫn; trộn hai thứ là dạy người dùng bỏ qua cảnh báo. Chưa làm: chưa có lượt chạy thật nào đo xem phương án có sát hơn không — đó là một khoản tiền gọi mô hình, xin phép riêng.

## T63

**Quản trị viên thêm, sửa, ẩn được mục khảo sát mà không cần phát hành lại phần mềm** (21/09/2026, Haan: «tài khoản admin có thể thêm sửa xóa các mục trong khảo sát đầu bài»). (a) **LỚP PHỦ, không phải bản chép cả tệp cấu hình.** Bản chép sai ở ba chỗ, cả ba chỉ lộ sau khi đã hỏng: trường của hợp đồng có kiểu và đơn vị nên sửa tự do được là sửa sai được; bản chép đóng băng ở ngày nó được chép nên đợt sau NVG thêm câu hỏi thì tenant đã bấm «Lưu» không bao giờ thấy; và không phân biệt được «NVG đổi» với «quản trị viên đổi». Lớp phủ chỉ chứa phần KHÁC bản gốc (`shared/src/design/brief-form-overlay.ts`). (b) **Sửa được:** nhãn, gợi ý, trọng số, bắt buộc hay không, ẩn/hiện, thứ tự mục, nhãn từng lựa chọn. **Không sửa được:** kiểu điều khiển, đơn vị, khoảng giá trị, điều kiện hiện/ẩn, và **GIÁ TRỊ** của lựa chọn (chúng là enum hợp đồng — giá trị lạ bị bác kèm tên, không im lặng bỏ qua). **Năm trường hợp đồng bắt buộc khoá hẳn**: ẩn chúng là làm mọi đầu bài mới không chốt được mà màn hình không nói vì sao (`LOCKED_PATHS`, có phép thử đối chiếu với `required` của hợp đồng, và một đột biến M24 trong `mutation-proof`). (c) **Xoá thì chỉ xoá được câu hỏi TỰ THÊM.** Câu hỏi có sẵn chỉ ẩn — ẩn giữ câu trả lời đã lưu, xoá thì mất, mà hồ sơ đã xác nhận là bất biến. Màn hình có mục «Đang ẩn» kèm nút hiện lại, nếu không thì ẩn là một chiều. (d) **Câu hỏi tự thêm nằm ở ô mở `custom.*`** của hợp đồng: giá trị là chữ, số, đúng/sai — KHÔNG phải cấu trúc, và engine không đọc. Chúng đi tới mô hình thành cặp **nhãn–câu trả lời** (`customAnswers`, mục «Khảo sát bổ sung» trong văn xuôi), đúng chỗ lời gia chủ vẫn đi; gửi `bep_phu = co` thì bên nhận không giải mã được. Một câu hỏi cần ràng buộc THẬT lên hình học vẫn phải là một trường có tên trong hợp đồng — màn hình nói thẳng điều đó. Trọng số mặc định của câu hỏi tự thêm là **0**: không được âm thầm kéo `completeness_score` xuống dưới ngưỡng chạy Lớp 2. (e) **Lưu ở `design_setting` (khoá `brief_form_overlay`)** — bảng đã có sẵn RLS đúng thứ cần: ai trong tenant cũng đọc (biểu mẫu phải vẽ được cho mọi người), chỉ `design.settings.write` mới ghi. Ghi qua **`POST /design/brief/form`** chứ không `upsert` thẳng từ trình duyệt: kiểm hợp lệ TRƯỚC khi ghi (lớp phủ hỏng trong CSDL làm cả tenant lùi về bản gốc, im lặng), và `tenant_id` không nằm trong tay trình duyệt. Quyền vẫn do RLS quyết — Worker dùng token của chính người gọi. (f) **Worker cũng đọc lớp phủ** (`brief/form-config.ts`): `buildBriefPayload` tính lại điểm độ đầy đủ, nên chấm theo bản gốc trong khi màn hình chấm theo bản đã sửa là hai con số khác nhau về cùng một đầu bài — mà con số đi vào artifact thì bất biến. Artifact ghi `form_overlay: applied | fallback | none` để về sau tra ra được. (g) Màn hình **«Biểu mẫu đầu bài»** ở phân hệ Quản trị hệ thống (`/nen/bieu-mau-dau-bai`); quyền chuỗi đọc từ `role_capabilities` qua hook mới `useDesignCapabilities` — không có quyền thì ô nhập khoá, không phải hiện nút rồi bấm mới bị chặn (CLAUDE.md 5.4).

**Lý do / đánh đổi:** lớp phủ hỏng KHÔNG làm trắng màn hình Đầu bài — lùi về bản gốc kèm dải báo ở màn hình quản trị, chỗ duy nhất sửa được nó. Đánh đổi đã biết: câu hỏi tự thêm không ràng buộc được kích thước hay vị trí phòng, và chưa có đường XOÁ hẳn một câu hỏi tự thêm khỏi những hồ sơ đã trả lời nó (câu trả lời vẫn nằm trong `structured`, chỉ thôi đi tiếp). Chưa làm: kéo thả để đổi thứ tự CÂU HỎI trong một mục — hiện chỉ đổi được thứ tự MỤC.

## T64

**Thửa đất «đa giác không đều» tạm khoá; cách khoá là NÓI RA, không phải làm mờ** (22/09/2026, Haan: «phần đa giác không đều tạm thời chưa hỗ trợ, hiện popup "mục này tạm thời chưa hỗ trợ, vui lòng thử lại sau"»). (a) Lựa chọn **vẫn hiện** trong ô «Hình thửa đất», vẽ mờ viền đứt, và **vẫn bấm được**; cú bấm mở hộp thoại một nút («Đã hiểu») nói đúng câu Haan đưa, cộng một câu chỉ đường: khai tạm theo hình chữ nhật hoặc hình thang. Hai cách khoá hiển nhiên hơn đều sai: `disabled` thì nút xám, bấm không có gì xảy ra và người dùng bấm ba lần rồi đi hỏi; giấu hẳn lựa chọn thì người từng dùng nó đi tìm không thấy và tưởng phần mềm hỏng. (b) **Câu nói ra nằm ở CẤU HÌNH**, khoá `unavailable` của từng lựa chọn trong `brief-form.json` — hôm nay là đa giác, mai có thể là thứ khác, và người sửa câu ấy không nhất thiết biết TypeScript. Khác hẳn `retired` (đã bỏ hẳn, chỉ hiện khi hồ sơ đang mang): ở đây tính năng còn trong kế hoạch, chỉ chưa chạy. (c) **Hồ sơ ĐÃ LƯU theo đa giác không bị chặn**: lựa chọn đang là giá trị hiện hành thì bấm bình thường, bảng toạ độ ranh giới vẫn mở. Chặn cả những hồ sơ ấy là biến một câu trả lời đã lưu thành thứ không sửa được — người dùng không bỏ chọn nổi và cũng không xem lại được toạ độ. (d) `ConfirmDialog` nhận `cancelLabel: null` để chỉ còn một nút: hai nút cho một lời báo là bắt người đọc chọn giữa hai thứ làm cùng một việc.

**Lý do / đánh đổi:** chưa có ngày mở lại — `siteGeometry` làm việc trên hình chữ nhật lớn nhất nội tiếp đa giác, nên nhánh đa giác cần đo lại trên hồ sơ thật trước khi tin được. Ai mở lại thì xoá khoá `unavailable` ở `brief-form.json`, không phải sửa mã; và nhớ phép thử đang canh đúng ba điều: bấm thì nói ra, hình thửa KHÔNG đổi, hồ sơ cũ vẫn sửa được.

## T65

**Mặt bằng phải bám đầu bài đã hỏi kỹ — thang máy, ban công, và chín nhóm câu hỏi của T62 thành ràng buộc kiểm được** (22/09/2026, Haan: «phần mặt bằng cần bổ xung thêm như thang máy, ban công mặt tiền, ban công đua ra ngoài… mặt bằng phải theo sát yêu cầu đầu bài, không được làm thiếu hoặc sai so với đầu bài»). (a) **Chẩn đoán — T62 hỏi 98 câu, nhưng cổng chỉ đọc ba nhóm.** `ai/program.ts` bám đầu bài theo `required_spaces`, thành phần gia đình và số xe; chín nhóm trường thêm ở T62 chỉ tới mô hình dưới dạng CÂU VĂN trong `brief/narrative.ts`. Câu văn là thứ mô hình bỏ qua được mà không ai biết: một đầu bài khai «làm thang máy ngay» vẫn ra mặt bằng không có thang máy, vẫn qua cổng, vẫn được chấm điểm, vẫn đúc thành artifact BẤT BIẾN — cái sai không nổ ra ở đâu cả, nó chỉ hiện ra khi gia chủ mở bản vẽ. (b) **`elevator` thành MÃ PHÒNG riêng**, tách khỏi `core`. Trước đó `core` («Lõi thang») mang cả bí danh `THANG MAY`/`LIFT`, nên cổng «đầu bài khai làm thang máy» nhận nhầm một lõi thang bộ là đã đủ. Giếng thang máy là ô chồng khít qua mọi tầng, không ai đi xuyên, không cửa sổ, kích thước do tải cabin quyết — bốn tính chất lõi thang bộ không có cái nào. (c) **Thang máy bám mốc như giếng trời.** Dùng lại đúng bộ `tree/snap.ts` đã có: ô thang máy tầng trên bám `at` của tầng dưới, lệch quá 30 cm là lỗi cổng chứ không đoán tiếp; cổng mặt bằng kiểm lại lần cuối với mức 10 cm (`elevator_not_aligned`). **Lựa chọn «chừa chỗ lắp sau» đòi Y HỆT** — chừa lệch tầng thì không phải chừa chỗ, sau này đục sàn vẫn không có giếng thẳng. Khác nhau đúng một chỗ: ô chừa mang nhãn «Ô chừa thang máy (lắp sau)» trên bản vẽ, vì in chữ «Thang máy» lên một ô trống là nói sai trên tờ bản vẽ kỹ thuật. (d) **Ban công đua ra ngoài ranh nới Ô TRONG CÂY CHIA**, trước `innerRects` và `outlineOf` (`tree/balcony-projection.ts`). Nới ở đúng chỗ ấy thì ba thứ tự khớp mà không phải sửa chỗ nào: hình bao tầng dựng từ hợp các ô nên tự mọc phần nhô; tường suy từ chữ nhật phòng nên cạnh biên của một phòng ngoài trời tự thành LAN CAN; lỗ mở đặt trên ô đã nới nên `at` của cửa đo trên đúng cạnh cuối cùng. Nới sau bước đặt lỗ mở thì mọi `at` trên hai cạnh vuông góc lệch đi đúng bằng phần nhô. Chỉ nới ô ban công ĐANG ÁP SÁT mép hình bao ở đúng mặt gia chủ khai — ô ở giữa nhà mà nhô là đẩy nó xuyên phòng bên cạnh. Cổng nới `room_outside_buildable` đúng chừng ấy và không hơn. (e) **Không có số thì KHÔNG đua.** Gia chủ khai «có đua ra ngoài ranh» mà chưa khai bao nhiêu mét thì mặt bằng giữ ban công trong ranh và nói ra là đầu bài còn thiếu số — đua 0,6 m hay 1,4 m là hai cái nhà khác nhau, và bịa một con số rồi vẽ lên bản vẽ kỹ thuật tệ hơn hẳn (CLAUDE.md 5.2). (f) **«Chỉ mặt tiền» là câu CẤM với ba mặt còn lại**, nên nó sinh `forbiddenSides`; khai `sides` mà bỏ sót một mặt thì KHÔNG — đó chỉ là chưa nhắc tới, ép thành cấm là bịa ra một yêu cầu. (g) **Bảng `demands` trong `kb/brief_fidelity.yaml`** nói «gia chủ trả lời X thì mặt bằng phải có Y», và cờ `blocking` của từng dòng quyết định thiếu thì BÁC hay chỉ nhắc. Lời gia chủ tự khai thành một không gian thì bác được (bếp phụ, phòng thờ riêng, kinh doanh tại nhà, kho khi khai «lưu trữ nhiều», hộp kỹ thuật cho cục nóng, chỗ phơi ngoài trời); suy đoán nghề thì chỉ cảnh báo (nấu chiên xào nên có bếp kín, khách qua đêm nên có phòng ngủ được) — đúng ranh giới T52. Dòng mềm đi ra cổng mặt bằng dưới dạng `finding`, KHÔNG `blocking`, và cố ý không đi lại đường của dòng cứng: dòng cứng đã bị bác ở cổng chương trình rồi, nhắc thêm lần nữa là hai dòng nói cùng một lỗi. (Chỗ này là một lỗi tôi tự tìm ra khi rà lại trước lúc commit: bản đầu tính ra dòng mềm rồi không ai đọc chúng — chúng được mô tả là cảnh báo mà không thành cảnh báo ở đâu cả.) Cờ nằm ở tệp dữ liệu, không ở mã: đổi ý thì sửa YAML. `blocking` cố ý KHÔNG có giá trị mặc định — quên khai là quên trả lời câu «thiếu thì bác hay chỉ nhắc», và đoán hộ thì hoặc bác oan, hoặc im lặng bỏ qua yêu cầu của gia chủ. (h) **Chỉ suy từ câu ĐÃ TRẢ LỜI**: trường bỏ trống không sinh đòi hỏi nào, không một chỗ nào dùng `?? false`. Một dòng như thế lọt vào là mọi hồ sơ chưa điền hết đầu bài bỗng bị bác vì những thứ gia chủ chưa từng nói. (i) **Chỗ để xe tính theo CỠ xe** (`parking.car_size`): bán tải dài hơn xe gầm thấp khoảng nửa mét, và 15 m² cho bán tải là chỗ đỗ không đóng được cửa cuốn. Vẫn là số tham khảo như cả mục `parking` (Haan, 13/09/2026). (j) Bốn đột biến mới trong `mutation-proof` (M25–M28) canh đúng bốn hàng rào dễ mất nhất: «chưa hỏi» biến thành «có», giếng thang lệch tầng vẫn qua, ban công ra mặt bị cấm vẫn qua, và ban công đua khi chưa có số.

**Lý do / đánh đổi:** mỗi `blocking: true` là một khả năng bác phương án, và bác phương án tốn thêm một lượt gọi mô hình — nên danh sách chặn cố ý ngắn và chỉ gồm thứ gia chủ TỰ KHAI. **Số chưa chắc:** kích thước giếng thang máy (2,2 / 2,5 / 3,2 m² theo tải, cạnh ngắn 1,4 m) lấy từ quy cách cabin của nhà sản xuất, **chưa đối chiếu hồ sơ NVG nào** — chưa có hồ sơ NVG nào có thang máy, nên `priors.min_samples` không áp dụng được. Đây là mức SÀN để bác một «thang máy» 0,8 m² không lọt nổi cabin, không phải kích thước thiết kế; **chờ Haan xác nhận**, sửa ở `kb/brief_fidelity.yaml`. Cạnh ngắn ấy khai ở HAI tệp `kb/` (`brief_fidelity` bác ở cổng, `construction_norms` ép lúc xếp) — có phép thử canh hai con số bằng nhau. **Chưa làm:** tuyến đọc lại `POST /design/plan/:id/review` không truyền `demands`, nên artifact đúc trước T65 không bị xét lại theo luật mới — đúng ý, artifact là bất biến; và chưa có lượt chạy mô hình thật nào đo xem mặt bằng có sát đầu bài hơn không, đó là một khoản tiền gọi mô hình, xin phép riêng.

## T66

**Ngưỡng thống kê `priors.min_samples` hạ 15 → 5** (23/09/2026, Haan trả lời Q-49, chọn **cách A** — hạ thẳng, không nới biên độ theo n). (a) **Bối cảnh:** Q-27 (06/09/2026) trả lời «giai đoạn demo không xin thêm được hồ sơ, tận dụng hai bộ đã có», nên ngưỡng 15 được hiểu là không bao giờ đạt và tầng «định mức và phân bố» coi như đóng vĩnh viễn. Ngày 22/09 Haan gửi thêm năm bộ, kho lên **7 bộ** (2 còn nén `.rar`, 1 bộ biệt thự chưa đọc) — lý do đóng đổi từ «không bao giờ có thêm» thành «chưa đủ», và Haan quyết hạ ngưỡng cho khớp. (b) **Tôi đã nêu rủi ro và Haan giữ nguyên quyết định.** Chính `doc/design/13-ho-so-thuc-te.md` mục 13.15 có dòng do tôi viết trước đây: «đừng hạ `priors.min_samples` xuống cho khớp số hồ sơ đang có» — với n nhỏ, phân bố tính ra hẹp giả tạo rồi cái hẹp giả tạo ấy đi vào điểm chấm như thể là quy luật. Tôi đã đề xuất cách B (hạ xuống 5 **và** nới biên độ theo n, siết lại khi n tăng); Haan chọn A. Dòng cảnh báo cũ **cố ý giữ nguyên** trong 13.15, kèm một dòng cập nhật — nó là cái giá đã biết, không phải cái đã biến mất. (c) **Hai điều kiện đi kèm, ghi ngay tại chú thích `priors` của `kb/space_norms.yaml`:** số thống kê rút ở mức n này chỉ vào **điểm và cảnh báo**, không loại phương án (CLAUDE.md 5.2, T49, T52); và số ở mục `spaces` **vẫn phải do kiến trúc sư NVG ấn định** (Q-18) — 7 hồ sơ không thay được việc đó, chúng chỉ để đối chiếu. (d) **Đây là đổi KHAI BÁO, chưa đổi hành vi chạy.** Không một dòng TypeScript nào đọc `priors.min_samples`; nơi duy nhất dùng nó là hàm `kb_room_area_stats` (migration `0102`), nhận qua tham số `p_min_samples` do lớp gọi truyền, và **hiện chưa có lớp gọi nào** ngoài phép thử của chính nó. Nên hạ ngưỡng hôm nay không làm đổi một con số nào trên bản vẽ; nó mở đường cho lúc nối hook thống kê vào. Đừng nhầm hai chuyện đó. (e) Các chỗ khác trong kho từng viết «dưới ngưỡng 15» đã sửa cho khỏi nói ngược nhau: `kb/construction_norms.yaml` (hai mục `canh_bao`), `kb/facade_quality.yaml`, `kb/facade_experience.yaml`, `kb/brief_fidelity.yaml` (thang máy — không phải «chưa đủ mẫu» mà là KHÔNG CÓ mẫu nào), CLAUDE.md 8.7.5 và `13-ho-so-thuc-te.md` 13.15/13.16. `kb/space_norms.yaml` lên `1.2.0`. (f) **Đánh số câu hỏi bị trùng, đã sửa lúc này.** Ba câu hỏi mở ngày 22/09 lấy số Q-31/Q-32/Q-33, nhưng ba số ấy đã có chủ từ trước trong bảng «Mặc định team đã chốt» (ảnh khảo sát gửi AI · mặt cắt lấy từ đâu · ngân sách AI mỗi tháng) — cùng một dãy số, hai câu hỏi khác hẳn nhau. Ba câu mới đổi thành **Q-49 (ngưỡng thống kê) · Q-50 (bệ cửa sổ) · Q-51 (bậc tam cấp)**, số cao nhất đang dùng là Q-48. Bảng cũ giữ nguyên. Mọi chỗ trỏ tới đã sửa theo.

**Lý do / đánh đổi:** quyết định là của NVG, không phải kết luận thống kê — 5 công trình không đủ cho một phân bố đáng tin, và điều giữ cho việc hạ ngưỡng này an toàn KHÔNG phải con số 5 mà là hàng rào «chỉ vào điểm và cảnh báo». Hàng rào ấy mất đi thì ngưỡng 5 thành nguy hiểm thật. **Chưa làm:** nối hook thống kê vào tuyến chấm điểm, và khi nối thì phải hiện «rút từ n hồ sơ» cạnh mỗi con số — người đọc cần biết con số dựa trên mấy căn nhà.

## T70

**Bậc tam cấp lên mặt bằng, thang giữ mặt bậc 250, bậc được đánh số** (23/09/2026, Haan trả lời Q-51: «làm hết»). Ba chỗ engine vẽ khác hồ sơ thật, ghi ở `13-ho-so-thuc-te.md` 13.16.7, sửa cả ba. (a) **Thang giữ mặt bậc.** Hợp đồng thang (`ai-plan-rooms`, `ai-floor-plan`) thêm `going` (cm), CHƯƠNG TRÌNH điền từ `kb/construction_norms.yaml` `stairs.going_m`. Tờ vẽ đặt mỗi bậc sâu đúng `going`, vế dài theo số bậc, phần dư của ô thang dồn vào chiếu nghỉ — đúng cách HS-03/HS-06 vẽ. Artifact trước T70 không có `going` nên vẫn rải đều như cũ: ảnh chụp vàng của năm tờ mẫu giữ nguyên từng nét bậc, chỉ THÊM số. (b) **Đánh số bậc** 1…`treads` từ chân vế đầu, lớp CSS riêng `tsn`, cỡ `text_mm.stair_number` 1,6 mm (HS-03 in chữ số ~0,6 cỡ tên phòng, dưới ngưỡng đọc được nên lấy đúng ngưỡng). Bậc trên giấy thấp hơn ~1,4 lần cỡ chữ thì bỏ số, không in chồng lên nét. Mỗi vế vẽ cùng số bậc làm tròn nên tổng có thể dư một — bậc dư không đánh số, để số in ra khớp số bậc hợp đồng khai. (c) **Bậc tam cấp** là đối tượng mới `entry_steps` của tầng 1 trong `ai-floor-plan`, do `ai/entry-steps.ts` đặt trong `assemblePlan` SAU khi đã có tường (bậc bắt đầu ở mặt ngoài tường). Số bậc = `entrance.step_count` gia chủ khai, nếu không thì `entrance.floor_above_road_m` ÷ 0,15 làm tròn lên (khớp ba hồ sơ: 430 → 3, 450 → 3, 730 → 5); mặt bậc 0,30; rộng = max(1,1 m; cửa chính + 0,6 m). Cửa chính = cửa ra ngoài nhà không phải cửa xe hay cổng, ưu tiên mặt lối vào đầu bài khai, rộng nhất. Bậc 1 là bậc ngoài cùng, như HS-05 ghi «1 2 3». (d) **Không đủ số thì không vẽ, không đủ chỗ thì nói ra.** Đầu bài không khai chênh cốt lẫn số bậc → không có bậc (khai «có bậc» mà thiếu số → cảnh báo `bac_tam_cap_thieu_so`). Sân trước không đủ sâu, cửa chính mở ra một phần khác của nhà, hoặc cần quá 8 bậc → ghi chú, không vẽ lấn ra ngoài thửa. Cửa sát ranh bên thì trượt dãy bậc vào trong thửa. Không trường hợp nào CHẶN phương án: bậc tam cấp không làm mặt bằng sai công năng và không đáng một lượt gọi mô hình. (e) **Không đổi lời dẫn.** `entrySteps` cố ý bị loại khỏi `ModelDemands`: mô hình không có gì để làm với bậc, và lời dẫn giữ nguyên thì bộ nhớ đệm của nhà cung cấp cũng giữ nguyên. (f) Ranh thửa (`PlanContext.lotCm`, ô thửa CHƯA trừ khoảng lùi) là chỗ duy nhất bậc được phép chìa ra; thửa đa giác bất kỳ lấy ô lớn nhất nằm gọn trong thửa, sai về phía ít đất hơn. (g) Hai đột biến M30 (số bậc làm tròn xuống) và M31 (bậc chìa ra ngoài thửa), cả hai bị bắt.

**Lý do / đánh đổi:** chênh cốt lấy từ **cốt nền so với tim đường**, vì đầu bài chỉ hỏi số ấy; sân lát thường cao hơn đường ~100 (HS-06: đường −0.850, sân −0.750), nên số bậc suy ra có thể DƯ một bậc. Tờ vẽ ghi rõ điều này bằng ghi chú `entry_steps_from_road`, không tự trừ một con số cốt sân không ai khai. **Số chưa chắc:** `width_over_door_m: 0.6` là số tham khảo — hồ sơ không ghi bề rộng cửa cạnh bề rộng bậc. **Hợp đồng đổi** → dấu vân tay hợp đồng đổi: phải phát hành `npm run deploy` (API trước, giao diện sau), không phát hành riêng `deploy:web`. **Chưa làm:** mặt đứng chưa vẽ bậc (vẫn dùng `facade.ground_floor_raise_m` mặc định); cửa chính mở ra hiên (`porch`) chưa đặt bậc ở mép hiên; bậc thứ hai ở cửa bếp/sân sau (HS-04, HS-05) chưa có; thang bậc quạt kiểu HS-03 chưa có.

## T71

**Luật bố trí BẮT BUỘC của Haan: khu ướt, bếp, phòng thờ, ban công** (23/09/2026). Nguyên văn: «Bếp không được nằm dưới nhà vệ sinh → bắt buộc» · «Phòng thờ ko nằm dưới nhà vệ sinh, ko đối diện hoặc giáp nhà vệ sinh» (Haan chọn: cả ba chặn) · «Ban công phải thoáng: cạnh dài hướng ra mặt ngoài đồng thời là mặt thoáng» · WC: «Không bắt buộc WC các tầng phải trùng 100 %, nhưng nên ưu tiên xếp WC và các khu ướt theo cùng một trục kỹ thuật đứng … chỉ cho phép lệch trục khi cần thiết». Hết lượt sửa mà vẫn vi phạm → **không ra phương án** (Haan chọn). (a) **Ngoại lệ có chủ đích với T52** («luật cứng chỉ khi không dựng được»): chính Haan đặt. Dữ liệu ở tệp riêng `rules/nvg-mandatory.yaml`, LUÔN bật (không theo ô tích T20), mọi dung sai ở đó; mã đo ở `ai/mandatory.ts`, một nơi đo cho hai nơi gọi — cổng từng tầng của bộ xếp (`gate()`, loại ứng viên để bộ xếp tự thử cách khác) và cổng liên tầng cuối (`checkPlan`). (b) **Năm luật chặn**: WC chồng lên bếp / phòng thờ tầng NGAY dưới (hình chiếu lọt lòng giao nhau > 100 cm² — hai phòng cách một bức tường không tính); phòng thờ chung tường với WC; cửa phòng thờ nhìn thẳng sang cửa WC qua cùng một phòng (lệch tim ≤ 60 cm, cách ≤ 3 m); ban công không có cạnh dài trên mép hình bao là mặt thoáng. Không gian mở đo theo KHU (`withMergedParts`), nên WC trên phần phòng khách của một không gian có bếp không sai. (c) **WC chung thẳng trục là ƯU TIÊN, không chặn**: bậc xếp hạng ĐẦU TIÊN của bộ xếp (`compareRanked`) — phương án thẳng trục thắng phương án lệch dù điểm thấp hơn; bản phác của mô hình qua cổng mà lệch trục thì bộ xếp chạy thêm các vòng khung và dùng cách thẳng trục nếu có (`sketch_replaced_for_wc_stack`); không có thì ghi chú `wc_off_axis` nói WC nào lệch bao nhiêu mét. «Thẳng trục» đọc đúng `khoang_cach_m` của E2 — một con số. WC khép kín chỉ vào điểm E2. (d) **Mốc theo TẦNG NGAY DƯỚI**: trước T71 mọi tầng trên nhận mốc của tầng 1, nên tầng 3 không thấy bếp tầng 2; nay khu ướt, bếp, phòng thờ chuyền theo từng tầng (`LevelAnchors.service`), thang / giếng / thang máy / khối nhà vẫn bám tầng 1. (e) **Năm mã mới được gửi lại mô hình sửa** (`REVISABLE_CODES`) kèm dòng gợi ý; lời dẫn đưa ba luật vào danh sách «Must hold» (bản 8.17.0, trần độ dài 4.700 → 4.900 ký tự). (f) **Báo đúng luật**: đo trên 12 ý định thật đã ghi, lượt bị bác ban đầu báo lỗi phụ của ứng viên khác («phòng thờ không có cửa») thay vì luật bị vi phạm — mô hình sẽ sửa sai chỗ. Nay ứng viên chỉ vướng luật bắt buộc được ưu tiên làm lý do báo lên. (g) **Tuyến sửa của kỹ sư** chỉ hạ xuống ghi chú những vi phạm (mã + phòng) ĐÃ CÓ trong phương án đang lưu; thao tác sửa không được tạo vi phạm mới. Tuyến xem lại artifact cũ không kiểm luật mới (artifact bất biến, như T65). (h) Đột biến M32–M34.

**Lý do / đánh đổi — số đo, không gọi mô hình:** phát lại 12 ý định thật từng ra phương án (7 lượt đo): **9 nay bị bác**, gần như tất cả vì **ban công** (mô hình vẽ ban công lọt giữa nhà hoặc quay cạnh dài vào tường nhà bên — kiểm bằng hình học, vi phạm thật), một vì phòng thờ giáp WC. Những ý định ấy viết khi lời dẫn chưa có luật, nên con số này là cận TRÊN; nhưng phải chờ lượt chạy thật mới biết bao nhiêu lượt gọi thêm (0,08–0,23 USD mỗi lượt) — cần Haan cho phép riêng. Hai ý định còn qua đều có WC chung lệch trục (3,0 m và 10,0 m) mà bộ xếp không tìm được cách thẳng — thành ghi chú, đúng ý «chỉ lệch khi cần».

## T72

**Sau hai lượt chạy thật đầu tiên của T71: sửa chỗ tiêu tiền vô ích** (23/09/2026). Hai lượt, không lượt
nào hỏng vì luật T71.

- **Sol, fad0c0fa (1 lời gọi, 0,166 USD):** «ô thang máy tầng 2 lệch 152 cm». Ô thang máy nay ghim theo
  tầng dưới như thang bộ; cổng từng tầng biết mức ban công đua ra ngoài ranh; ô thang máy không chồng
  giếng nào hỏng sớm ngay ở tầng; lỗi sửa được của bản phác không còn bị lỗi hình học của ứng viên khác
  che. **Haan chọn (a):** `arrange_room_below_brief_area` vào `REVISABLE_CODES` — chỗ sai là số ô mô hình
  vẽ. Đột biến M35.
- **Terra, 458d9a91 (4 lời gọi, 0,333 USD):** cả bốn lượt hỏng tầng 1 — `porch_1` mang cửa chính là hai
  ô ở góc trước, gara bao quanh; vách ra ngoài thiếu chỗ cửa (lỗi hình học, không gửi) và đường tới thang
  xuyên hiên. Mô hình chỉ nhận «vẽ hành lang nối phòng khách với thang», đã có hành lang nên giữ nguyên
  hiên; lượt sửa 3 nộp lại nguyên văn lượt 2.
  - Dòng gợi ý `entry_room_boxed_in` (`entryBoxedIssue`, `ai/plan.ts`): khi cửa ra ngoài của phòng cửa
    chính thiếu vách, hoặc đường đi hằng ngày xuyên qua nó, gửi dòng nói đúng chỗ ấy và BỎ dòng
    `route_through_service` trỏ vào cùng phòng. Cùng điều kiện ấy cũng kích bước tự đổi phòng cửa chính
    (T51) trước khi gọi lại.
  - Mô hình trả lại y nguyên phần đang hỏng (`unchangedWhereFailed`: phòng, quan hệ, bản phác các tầng
    từ dưới lên tới tầng hỏng cao nhất, phòng cửa chính / gara; chữ tự do không tính) → `retry:
    'unchanged'`, dừng. Bộ xếp tất định nên gọi tiếp là cùng lời dẫn, cùng kết quả. Trên lượt Terra
    tiết kiệm lượt 4 (0,086 USD). Đột biến M36.

**Đánh đổi:** mô hình có nhiệt độ nên lượt gọi lại cùng lời dẫn *có thể* ra bản khác (lượt 4 của Terra
đổi bản phác tầng 1 nhưng vẫn hỏng). Chọn dừng: không có số đo nào cho thấy lượt lặp ấy từng cứu được
phương án, còn tiền thì chắc chắn mất.

**Chưa kiểm bằng lượt gọi thật** — cần Haan cho phép riêng. Terra vẽ kém hơn Sol trên đầu bài này.

**Bổ sung — lượt Sol 011b4adc sau T72** (4 lời gọi, 0,531 USD, vượt mức báo trước 0,1–0,4 USD). Tầng 1
qua (cửa chính vào phòng khách); tầng 2 hỏng cả bốn lượt. Mô hình có đổi bố cục mỗi lượt nên phép dừng
khi trả lại y nguyên đúng là không kích. Hai chỗ của chương trình, đã sửa:

- **Ô thang máy lệch giếng dù vẽ đúng ô:** `forcedCells` (`ai/arrange/index.ts`) khoét thang bộ và giếng
  trời đúng chữ nhật tầng dưới nhưng bỏ sót thang máy; khung khoét ném thang máy vào chung mảnh với
  phòng khác. Nay khoét cả ô thang máy. Đột biến M37.
- **Câu nhắc diện tích không nói bao nhiêu:** lỗi `arrange_room_below_brief_area` kèm số ô bản phác đang
  vẽ và số ô cần vẽ (`withSketchCells`; m² mỗi ô = diện tích ra / số ô, dưới nửa mức danh định thì dùng
  mức danh định). Dòng `arrange_room_below_brief_area_cells`, lời dẫn 8.19.0.

**Còn mở, chưa sửa:** bản phác tầng 1 cũng hụt (phòng khách 28 ô ra 26,8 m², đầu bài 45 m²) nhưng bộ
xếp cứu tầng 1 bằng cách chia khác và DỜI ô thang; mô hình không được báo, và tầng 2 phải ghim theo ô
thang đã dời nên bản phác tầng 2 méo. Phát lại bốn lượt vẫn hỏng tầng 2 (phòng không cửa).

## T73

**Mô hình vẽ phòng nhỏ hơn mức đầu bài vì CHÍNH LỜI DẪN bảo nó đừng đếm ô** (24/09/2026). Haan hỏi
thẳng nguyên nhân gốc: «tại sao đầu bài yêu cầu tối thiểu 45 m² mà AI lại vẽ ra 26,8 m²? đây là
rootcause và cần phải giải quyết trước» — trước khi bàn chuyện có báo lỗi khi bộ xếp «cứu» được tầng.

**Quá trình tìm nguyên nhân (chỉ đọc dữ liệu đã lưu, không gọi mô hình):**

1. Đối chiếu ý định lượt 011b4adc (Sol, 0,531 USD) với đầu bài: mô hình CÓ nhận «Phòng khách, tầng 1,
   tối thiểu 45 m²» trong `<brief>` và TỰ KHAI `target_area_m2: 45` — nó biết con số.
2. Đếm ô bản phác tầng 1: phòng khách 28 ô (7 × 4 m), trong khi bỏ trống 40/192 ô làm sân. Không phải
   thiếu chỗ. Tỉ lệ lệch có quy luật: phòng lớn thiếu (khách 28 ô / 45 m², ngủ 1 16 ô / 22,5 m²), phòng
   nhỏ thừa (kho 6 ô / 2,5 m², WC 6 ô / 3 m², thang máy 8 ô / 4 m²) — đúng kiểu «vẽ đại khái theo tỉ lệ».
3. Đọc lời dẫn đã gửi (bản ghi lời gọi): mục Sketch dặn «roughly in proportion to its target area. **Do
   not count cells: the program sizes the walls from the target areas.**»
4. Truy nguồn câu ấy: lời dẫn 8.3.0 (~17/09/2026), đợt giảm token Haan duyệt (lượt Sonnet ra 117.278
   token), lý do ghi lúc ấy: «bỏ các việc đếm ô mà chương trình làm lại». Sau đó T41/T65 biến diện tích
   tối thiểu thành SÀN CỨNG đo trên hình đã dựng — và chương trình chỉ căn vách được TRONG khung dải mô
   hình vẽ: phòng khách nằm trong dải sâu 4 ô chung với gara thì tối đa ~28 m² dù căn thế nào. Lời hứa
   «chương trình tự căn» không còn đúng cho phòng có sàn cứng.
5. Hệ quả dây chuyền đã thấy ở T72: bản phác tầng 1 hỏng, bộ xếp bỏ bản phác, chia lại cả tầng cho
   đủ 45 m² và DỜI ô thang; mô hình không được báo; tầng 2 ghim theo ô thang đã dời nên bản phác tầng 2
   méo, sinh phòng không cửa. Lượt fad0c0fa (phòng ngủ chính ~12 m² cho 25 m²) cùng một gốc.

**Sửa — ba bước, Haan duyệt:**

1. **Chương trình tính sẵn số ô tối thiểu** (`ai/sketch-cells.ts`, một nguồn cho cả hai phía). Bản phác
   theo tim tường nên phòng a × b m có lọt lòng ≈ (a − t)(b − t), t = một bề dày tường. Kiểm trên số
   đo: 7 × 4 m, t = 0,11 m → 26,8 m², khớp đúng. Số gửi mô hình giả định phòng tỉ lệ 2 và tường ngoài
   0,22 m (dư một chút): 45 m² → 49 ô, 13 m² → 15 ô. Gửi trong `knowledge.min_cells` (loại, tầng, mức,
   số ô), cả chỗ để xe.
2. **Lời dẫn 8.20.0:** bỏ «Do not count cells»; thay bằng «ô chính là diện tích, tường tính trong đó;
   phòng khớp một dòng `min_cells` vẽ ít nhất `cells` ô — hãy đếm». Ô trống «.» làm sân chỉ khi mọi
   phòng đã đủ ô. Lời dẫn vẫn trong trần 4.900 ký tự.
3. **Kiểm bản phác trước khi xếp** (`sketchBelowBrief`): phòng đầu bài khai diện tích mà bản phác vẽ
   hụt QUÁ `sketch.area_slack_ratio` (`kb/construction_norms.yaml`, 0,1) thì báo mô hình ngay, kèm số ô
   đang vẽ và số ô cần — không để bộ xếp «cứu» tầng bằng cách chia khác. Hụt trong 10 % thì bộ xếp tự
   dời vách. Phòng gộp mở (khách + ăn) để phép kiểm cuối lo. Đột biến M38.

**Đo tác động trên mọi ý định thật đã lưu (không gọi mô hình):** phép kiểm mới báo 8 bản phác ở 5 lượt
(hụt 13–40 %: 26,8/45 · 30,7/45 · 19/25 · 17,4/20 m²). Chỉ MỘT ý định đang ra phương án đổi sang bị
gửi lại: fd3b0b86 round1 (phòng ngủ 1 ~19 m² cho 25 m²). Không có dung sai thì 3ff10f75 round2 bị chặn
vì hụt 0,09 m² (24,91/25) — lý do đặt 10 %.

**Đánh đổi:**
- Lời dẫn đảo lại một phần quyết định giảm token 8.3.0: mô hình phải đếm ô cho vài phòng có mức đầu
  bài. Số ô đã tính sẵn nên phần suy luận thêm được kỳ vọng nhỏ — CHƯA ĐO trên mô hình thật.
- Phương án mà bộ xếp từng «cứu» được nay tốn thêm một lượt sửa. 58688ead round4 (tầng 1 Haan chấm
  16/09/2026) thuộc loại này: vẽ phòng ngủ 1 thiếu ô, bộ xếp chia lại đủ 25 m². Phương án ĐÃ LƯU không bị
  ảnh hưởng (bất biến; phép thử dựng lại nó theo luật lúc lưu).

**Còn mở:** câu nhắc tính số ô từ mức đo được của chính bản phác (khách: 48 ô), dòng `min_cells` tính từ
giả định tỉ lệ 2 (49 ô) — lệch một ô, cùng chiều an toàn. Chưa có lượt thật nào chạy lời dẫn 8.20.0.

**Đo thật — lượt 0c86c0b1** (24/09/2026, Sol, lời dẫn 8.20.0, 4 lời gọi, 0,521 USD: 0,176 + 0,109 +
0,123 + 0,114; Haan cho một lượt). Không ra phương án, nhưng nguyên nhân gốc T73 ĐÃ HẾT:

- Mọi phòng có mức đầu bài vẽ đủ số ô cả bốn lượt: phòng khách 49 ô (đúng `min_cells`), gara 30,
  phòng ngủ 1 24 / 23, phòng làm việc 16–24 / 15. Không ô nào bỏ trống (trước: 40 ô).
- Token ra lượt đầu 7.952 — ÍT hơn lượt trước T73 (9.884). Đếm ô không làm phình suy luận.

**Chỗ hỏng mới — chuỗi nhân quả (phát lại bốn lượt ở máy):**

1. Tầng 1: phòng ngủ 1 vẽ 24 ô (6 × 4) mà bước dựng bản phác chỉ ra 19,08 m² (< 20). Chiều sâu mất
   ~0,65 m: mô hình vẽ hành lang MỘT ô (1 m), còn hành lang cần 1,2 m lọt lòng
   (`circulation.corridor_clear_m`) — cộng tường ~1,33 m; bộ xếp nới hành lang và lấy phần ấy từ dải
   phòng bên cạnh. Lời dẫn đang cho phép «a corridor one or two cells wide».
2. Hụt 4,6 % — dưới dung sai 10 % nên T73 không báo mô hình (đúng thiết kế). Bộ xếp bỏ bản phác, chọn
   khung khác và DỜI ô thang từ cột 0–1 sang x ≈ 8,1–10 m.
3. Tầng 2 mô hình vẽ thang đúng chỗ tầng 1 ĐÃ VẼ → «không ép được mốc» → khung khoét, phòng ngủ chính
   và phòng ngủ 5 không cửa. Câu nhắc gửi mô hình chỉ nói phòng ngủ chính hụt diện tích (hệ quả, không
   phải gốc), nên ba lượt sửa không gỡ được.

**Sửa tiếp (Haan: «sửa theo cả 2», 24/09/2026):**

- **(a) Hành lang tối thiểu bằng ô** (`corridorMinCells`, `ai/sketch-cells.ts`): lọt lòng
  `circulation.corridor_clear_m` + tường ngoài + nửa tường ngăn — cùng công thức `corridorWidth.edge`
  của bộ xếp, 1,475 m → ô 1 m là 2 ô. Gửi trong `knowledge.corridor_min_cells`; lời dẫn 8.21.0 thay «one
  or two cells wide» bằng «`knowledge.corridor_min_cells` cells wide». Chỉ đo được khi mô hình vẽ lại —
  bốn ý định cũ vẫn vẽ hành lang một ô.
- **(b) Tầng 1 giữ lõi bản phác** (`sketchCores`, `ai/arrange/index.ts`): tầng không mốc có bản phác thì
  ô thang bộ / thang máy trên bản phác thành «ô khoét» cho các khung dự phòng (dùng lại `forcedCells` của
  tầng trên), và xếp hạng có bậc thứ hai `atSketch` — sau `stacked` của T71, trước điểm: cây giữ lõi
  đúng chỗ (lệch tâm ≤ nửa ô) thắng cây dời lõi. Không cây giữ lõi nào qua cổng thì vẫn được dời như cũ
  (không mất phương án). Đột biến M39.

**Phát lại sau (a) + (b)** (không gọi mô hình):

| Lượt | Trước | Sau |
|---|---|---|
| 0c86c0b1 (Sol, 8.20.0) | tầng 2 hỏng: thang dời, phòng không cửa | như cũ — khung giữ lõi tầng 1 hụt phòng khách 0,49 m² hoặc đi xuyên gara; gốc là hành lang 1 ô, việc của (a) |
| 458d9a91 (Terra) | tầng 1 hỏng: hiên cửa chính bị kẹt | tầng 1 QUA; hỏng tầng 2: master vẽ 20 ô cho 25 m² → gửi lại kèm «ít nhất 27 ô» |
| 011b4adc (Sol, luật trước T73) | tầng 2 «không ép được mốc» | CẢ HAI TẦNG xếp được; chỉ còn lỗi cả nhà «ban công không ở mặt trước» |

**Chỗ hở mới thấy (chưa sửa, đề xuất Haan):** `balcony_side_missing`, `balcony_side_not_wanted`,
`balcony_level_missing` (`ai/plan-demands.ts`) KHÔNG nằm trong `REVISABLE_CODES` — hỏng vì ban công sai
mặt thì lượt DỪNG, dù chỗ đặt ban công là mô hình vẽ (cùng lý lẽ với `balcony_off_open_face` của T71,
vốn được gửi lại). 011b4adc round4 dừng đúng ở đây.

**Đã sửa (Haan đồng ý 24/09/2026):** ba mã trên vào `REVISABLE_CODES`, mang tham số (`side`, `level`,
`room` — `Add` của `plan-check` / `plan-demands` nhận thêm `params` tuỳ chọn) và có dòng gợi ý riêng; lời
dẫn 8.22.0. Phát lại 011b4adc round4 (luật trước T73): nay `revise` kèm «The client wants a balcony on
the front side …».

**Đo thật — lượt 6c35ed79** (24/09/2026, Terra, lời dẫn 8.22.0, 4 lời gọi, 0,315 USD: 0,096 + 0,058 +
0,103 + 0,058; Haan cho một lượt). Không ra phương án.

- **Đã đạt:** tầng 1 QUA cả bốn lượt. Mọi phòng có mức đầu bài vẽ đủ ô, hành lang vẽ 2 ô — mô hình làm
  đúng (a). So lượt Terra trước (458d9a91): khi ấy cả bốn lượt hỏng ngay tầng 1.
- **Tầng 2 hỏng vì bố cục bản phác:** hành lang tầng 2 chỉ là một mẩu phía sau cạnh thang; năm phòng
  (ngủ chính, thờ, làm việc, ngủ 3, ngủ 4) không giáp phòng giao thông nào TRÊN CHÍNH BẢN PHÁC. Lỗi
  «phòng không giáp phòng giao thông» là lỗi hình học của các cây dự phòng nên KHÔNG gửi mô hình; mô
  hình chỉ nhận câu nhắc diện tích (hụt 0,2–2 m²), sửa diện tích mà không sửa bố cục.
- **Lỗi nội bộ phụ:** `tree_child_reused` («elevator_2 là con của 2 nút») ở 10/775 ứng viên tầng 2 —
  khung khoét có dải hành lang, từ khi T72 khoét ô thang máy. Không phải lý do hỏng, nhưng làm bẩn danh
  sách lỗi báo lên.

**Đề xuất (chưa làm, chờ Haan):** (c) kiểm bản phác trước khi xếp, như phép kiểm diện tích T73: phòng
cần cửa từ phòng giao thông mà trên lưới không có cạnh chung với ô giao thông / sinh hoạt chung nào → báo
mô hình ngay, liệt kê phòng; (d) sửa `tree_child_reused` của khung khoét có ô thang máy.

**Sửa tiếp (Haan: «oke sửa c và d đi», 24/09/2026):**

- **(d) — lỗi của chính T72:** `corridorIds` (`ai/arrange/index.ts`) lấy mọi loại trong nhóm giao thông
  của từ vựng — gồm cả THANG MÁY. Dấu vết tầng 2 lượt 6c35ed79: dải hành lang áp thang mang mã
  `elevator_2`, trong khi T72 đã khoét thang máy theo giếng → một phòng ở hai nút (`tree_child_reused`).
  Tệ hơn: khung có thể dựng «thang máy» thành trục hành lang chạy suốt bề ngang nhà, và hành lang chữ T
  tắt khi tầng có thang máy (đếm ra hai hành lang). Bỏ `elevator` khỏi `corridorIds`. Hệ quả đo được:
  011b4adc round4 (luật trước T73) từng «xếp được cả hai tầng» chính nhờ một khung như thế — thành công
  GIẢ; nay hỏng thật ở tầng 2 vì bản phác chong chóng, và mô hình được báo đúng chỗ ấy. Đột biến M41.
- **(c) — phòng không có lối vào ngay trên bản phác** (`sketchNoAccess`): phòng cần cửa phải có ô chung
  cạnh với ô của phòng đi xuyên được (`walk_through`), phòng được phép phục vụ nó (`served_from`), hoặc
  phòng mẹ (khép kín). Đúng luật lời dẫn đã nói với mô hình, đo thẳng trên lưới nên chỉ bắt chỗ chắc
  chắn sai. Không kiểm phòng đi xuyên được, phòng vào từ ngoài (gara, hiên), ban công / sân. Báo mô hình
  ngay, liệt kê phòng (`sketch_room_no_access`, gửi lại; lời dẫn 8.23.0). Bật cùng mục `sketch` của
  `kb/construction_norms.yaml` như phép kiểm diện tích — vắng mục ấy (phương án lưu trước T73) thì không
  kiểm. Đột biến M40.

**Đo (c) trên mọi ý định đã lưu (không gọi mô hình):** không ý định nào đang ra phương án bị chuyển sang
bác. Bản phác bị báo: 3ff10f75 r1 (năm phòng tầng 2), 458d9a91 r1–r4 (phòng ngủ chính tầng 2), 58d9ff66
(kho, WC tầng 1), fd3b0b86 (kho), 6c35ed79 r1–r4 (WC chung tầng 1). Riêng 6c35ed79: tầng 1 từng «qua»
vì bộ xếp dời WC; nay mô hình được báo trước — WC chung mô hình tự khai «cạnh circulation_1» mà vẽ ở
góc chỉ giáp hai phòng ngủ, trái lời dẫn («A common wc … shares a wall with a corridor or with the
shared living space»). Cùng đánh đổi với T73: tầng bộ xếp từng «cứu» nay tốn một lượt sửa.

**Giới hạn:** hỏng ở tầng 1 thì tầng 2 không được xếp nên lỗi tầng 2 báo ở lượt sau — mỗi lượt sửa chỉ
thấy lỗi của tầng hỏng đầu tiên.

**Đo thật — lượt 8efa35a6** (24/09/2026, Terra, lời dẫn 8.23.0, 4 lời gọi, 0,414 USD: 0,183 + 0,085 +
0,056 + 0,090; Haan cho một lượt). Không ra phương án.

- Tầng 1 qua cả bốn lượt (lượt Terra thứ hai liên tiếp).
- Tầng 2: câu nhắc «phòng không có lối vào» CÓ tác dụng — mỗi lượt mô hình sửa đúng phòng bị báo — nhưng
  lại làm hở phòng khác: lượt 1 laundry (+ shaft), 2 wc_4, 3 phòng thờ + laundry, 4 phòng ngủ 5. Kiểu
  «sửa chỗ này hở chỗ kia»: câu nhắc chỉ nêu phòng đang hỏng, không nhắc giữ các phòng còn lại.
- Báo nhầm của (c): lượt 1 báo cả hộp kỹ thuật `shaft_1` — loại `no_door_required`, không cần cửa. Đã
  sửa: bỏ qua loại không cần cửa.
- Token ra lượt đầu 14.569 (lượt Terra trước: 7.273) — một mẫu, chưa kết luận do đếm ô.

**Còn mở (chờ Haan):** câu nhắc lối vào nói luôn «mọi phòng khác vẫn phải giáp hành lang sau khi sửa»
và liệt kê các phòng đang ổn; hoặc so thêm Sol trên cùng lời dẫn.

**Sửa tiếp (Haan: «làm e và làm f, thêm option GPT-6 Sol», 24/09/2026):**

- **(e)** Câu nhắc `sketch_room_no_access` kèm danh sách phòng ĐANG có lối vào và dặn chúng «must STILL
  touch it after your change» (tham số `keep`, lời dẫn 8.24.0). Phát lại 8efa35a6 lượt 3: câu nhắc nay
  nêu cả `bedroom_5` — đúng phòng mà lượt 4 đã làm hở.
- **Model mới GPT-6 Sol** — tuyến `ai_text_openai_sol6` (`config/models.yaml` 1.4.0). Mã `gpt-6-sol`
  kiểm bằng `GET /v1/models` (không tốn token): có. Đơn giá theo bảng giá chính thức
  developers.openai.com/api/docs/pricing: 2 / 10 USD mỗi triệu token vào / ra — nửa GPT-5.6 Sol (4 / 20),
  token ra rẻ hơn Terra (12). Bảng giá cũng ghi GPT-5.6 Sol đang giá khuyến mãi «ít nhất tới 21/11/2026».
- **(f)** Một lượt Sol trên lời dẫn này — chạy bằng GPT-6 Sol (rẻ hơn), kết quả ghi ngay dưới.

**Đo thật — lượt 9d3cc059** (24/09/2026, GPT-6 Sol — lượt đầu của tuyến mới, lời dẫn 8.24.0; 2 lời gọi,
0,188 USD: 0,137 + 0,052; Haan cho «làm f»). Không ra phương án; DỪNG sau lượt sửa đầu.

- Rẻ hơn thật: lượt khai 0,137 USD với 12.858 token ra (GPT-5.6 Sol: 0,176–0,214 USD cho 7.952–9.884).
- Tầng 1 qua cả hai lượt. Tầng 2 lượt 1: phòng ngủ chính 24 ô ra 23,15 m² (< 25) → gửi lại kèm số ô.
- Tầng 2 lượt 2: mô hình chia hành lang thành BỐN phòng giao thông (circulation_3…6) nối nhau bằng chỗ
  tiếp giáp chỉ MỘT ô (1 m) — cửa cần 110 cm vách. Mỗi mẩu hành lang giáp nhau trên bản phác nên phép
  kiểm (c) coi là có lối, nhưng không mẩu nào đặt được cửa sang mẩu kia → hàng loạt «phòng không có
  cửa». Toàn lỗi HÌNH HỌC nên không gửi mô hình (`retry: none`) → lượt dừng ở lời gọi thứ hai.

**Đề xuất (chưa làm, chờ Haan) — (g):** phép kiểm lối vào trên bản phác đo thêm ĐỘ DÀI tiếp giáp: hai
phòng chỉ tính là «nối» khi chung một đoạn ≥ số ô đủ đặt cửa (vách 110 cm → 2 ô), và mọi phòng đi xuyên
được (hành lang, sảnh) phải nối về ô thang qua những đoạn như thế. Bắt được cả kiểu hỏng lượt này lẫn
kiểu «phòng chỉ chạm góc hành lang».

**Sửa (g) (Haan: «oke làm đi», 24/09/2026)** — `sketchNoAccess` hai chế độ:

- Đo trên lưới: đoạn tiếp giáp LIỀN MẠCH dài nhất giữa hai phòng; số ô đủ đặt cửa = (bề rộng cửa + hai
  mép `door_margin_m` + một tường ngăn) / cạnh ô — cửa 0,9 m → 1,21 m → 2 ô; cửa hẹp (WC, kho) 0,75 m →
  2 ô. Mọi phòng đi xuyên được (hành lang, sảnh, phòng khách) phải nối về ô thang qua chuỗi tiếp giáp.
- **Thử lần đầu chặn ngay khi tiếp giáp < 2 ô — SAI, đã bỏ:** phát lại cho thấy tầng 1 lượt 9d3cc059
  (từng qua cổng) có hành lang chạm thang chỉ một ô; bộ xếp căn vách theo diện tích nới đoạn ấy ra. Một
  ô trên bản phác chưa chắc hỏng.
- Nên: **trước khi xếp** (`touch`) chỉ bắt chỗ chắc chắn — phòng không CHẠM đường về ô thang (thêm: hành
  lang phải nối về thang); **sau khi tầng đã hỏng** (`door`) mới đo độ dài và gửi mô hình những chỗ nối
  dưới số ô đủ đặt cửa. Lời dẫn 8.25.0. Đột biến M42 (M38 cập nhật chuỗi).

**Phát lại:** 9d3cc059 lượt sửa 1 (hành lang bốn mẩu) nay `revise` kèm câu nhắc nêu tám phòng / mẩu hành
lang không có lối, đòi «shared wall at least 2 cells long», và năm phòng phải giữ — trước là `none`, lượt
dừng. Kiểm «nối về ô thang» cũng bắt thêm bản phác thang chỉ chạm gara / kho (58688ead, 458d9a91 r1,
fd3b0b86) — trước đây bộ xếp dời cả ô thang để cứu; không ý định nào đang ra phương án bị chuyển sang
bác. 1.098 phép thử xanh.


**Lượt đo 2ddf782a (24/09/2026, gpt-6-sol, lời dẫn 8.25.0, Haan cho một lượt)** — bốn lời gọi, 0,369 USD,
không ra phương án. Tầng 1 qua cả bốn lượt. Tầng 2: lượt 1–3 hỏng ở bản phác (hành lang chạm đường về
thang bằng đoạn < 2 ô; lượt 2–3 thêm WC nằm trên bếp tầng 1, ban công không quay ra mặt thoáng, thang
máy không chữ nhật) — câu nhắc (g) đi tới mô hình đúng như phát lại dự đoán. **Lượt 4 xếp được CẢ HAI
tầng** — lần đầu từ T72. Nó hỏng ở cổng cả nhà: đầu bài khai ban công mặt sau, mà mô hình đã bỏ ban
công thứ hai từ lượt 2 khi vẽ lại hành lang. Lỗi ấy chỉ lộ ra khi mọi tầng đã xếp xong, nên mô hình
không được nhắc ở lượt 2 hay 3 — tới lượt 4 thì hết lượt sửa. Chỗ hở: đòi hỏi ban công của đầu bài
(mặt, tầng) kiểm được ngay trên bản phác mà chương trình chưa kiểm ở đó. Phát lại ở
`fixtures/ai-run-2ddf782a.json`.

**Sửa (h) (Haan: «cho phép làm», 24/09/2026)** — `checkSketchBalconyDemand` (`ai/plan-demands.ts`):
ba phép kiểm ban công của đầu bài (tầng phải có, mặt phải có, mặt bị cấm) đo ngay trên bản phác, cùng
mã và tham số với `checkBalconyDemand` nên dùng chung dòng gợi ý. Mặt đo theo khung ô ĐÃ XÂY của
từng tầng (bỏ ô `.`) — cùng lối `touchesSide` đo theo hình bao của tầng. Thiếu bản phác một tầng cần
xét thì không kết luận. `evaluateHouse` chạy nó mỗi khi lượt hỏng ở một tầng, thêm một dòng từ chối
tầng 0 và giữ chỗ cho câu nhắc ban công trong trần `HINTS_MAX`; không chặn việc xếp, không đổi gì
khi mọi tầng đã xếp (cổng cả nhà vẫn là nơi kết luận). Phát lại 2ddf782a: lượt 2 và 3 nay nhận câu
nhắc «balcony on the back side» cùng lỗi tầng 2. Phát lại cũng lộ ra ba lượt cũ (458d9a91, 8efa35a6,
9d3cc059) chưa bao giờ vẽ ban công mặt bên trái đầu bài của chúng đòi — chưa lần nào tới cổng cả nhà
nên chưa ai thấy. Định thêm một câu «giữ ban công đầu bài khi sửa» vào lời dẫn nhưng bỏ: lời dẫn hệ
thống đã sát trần 4.900 ký tự (`token-diet.test.ts`), và câu nhắc mỗi lượt đã nói đúng chỗ ấy. Lời dẫn
giữ 8.25.0. Đột biến M43; M27 đổi `find` vì dòng cũ nay xuất hiện hai lần. 1.106 phép thử xanh.

**Lượt đo 5cd78ef7 (24/09/2026, gpt-6-sol, lời dẫn 8.25.0 + (h), Haan cho một lượt)** — bốn lời gọi,
0,409 USD (nhỉnh hơn mức 0,2–0,4 đã báo), không ra phương án. Tầng 1 qua cả bốn lượt. Câu nhắc có tác
dụng từng lượt: lượt 1 thiếu ban công mặt trái và năm phòng không lối → lượt 2 thêm ban công trái, gỡ
cả năm phòng, chỉ còn phòng ngủ 5 hụt diện tích → lượt 3 sửa xong, chỉ còn phòng thờ không lối vào
(gần đạt nhất). Lượt 4 vẽ lại cả tầng 2 thay vì sửa một chỗ: bỏ ban công mặt sau, bỏ một hành lang,
năm lỗi mới. Bệnh «sửa chỗ này hở chỗ kia» (như 8efa35a6) nay là chỗ chặn chính: mô hình làm theo
câu nhắc nhưng vẽ lại cả tầng, và chương trình luôn sửa tiếp từ lượt MỚI NHẤT dù lượt ấy tệ hơn lượt
trước. Phát lại ở `fixtures/ai-run-5cd78ef7.json`.

**Sửa (i) (Haan: «oke sửa tiếp», 25/09/2026)** — hai chỗ:

1. `revisionBase` (`ai/plan.ts`): lượt sửa đi tiếp từ lượt hỏng NHẸ NHẤT, không phải lượt mới nhất.
   «Tệ hơn» = hỏng ở tầng thấp hơn (tầng dưới hỏng thì tầng trên chưa được xét), cùng tầng thì nhiều
   lỗi hơn; bằng nhau theo lượt mới. Lượt mới tệ hơn thì lượt gọi sau nhận lại bản tốt nhất, câu nhắc
   của bản ấy, và dòng `revision_setback` («lần sửa vừa rồi tệ hơn — N lỗi so với M — đã gạt; đừng vẽ
   lại phần còn lại của tầng»). Nối vào cả Workflow (`workflows/ai-design.ts`) lẫn tuyến đồng bộ
   (`generateAiPlan`). Kiểm «trả y nguyên» (`unchanged`) so với bản đã gửi, tức bản tốt nhất.
2. Lời dẫn lượt sửa (`floor_level.revise`, 8.26.0): «chỉ đổi phòng bị nêu lỗi và ô sát nó; chép nguyên
   mọi hàng bản phác khác; giữ mọi ban công đầu bài đòi». Tin nhắn lượt sửa, không phải lời dẫn hệ
   thống, nên không đụng trần 4.900 ký tự.

Phát lại 5cd78ef7: lượt 4 (6 lỗi) tệ hơn lượt 3 (1 lỗi) → lời gọi thứ ba… thứ tư sửa từ bản lượt 3.
Phép thử chạy `generateAiPlan` với client giả trên bốn ý định thật. Đột biến M44. Khoảng trống: vòng
sửa trong Workflow không có phép thử chạy trọn (lớp `WorkflowEntrypoint`); chỉ tuyến đồng bộ được
kiểm, hai tuyến gọi cùng một hàm. 1.112 phép thử xanh.

## T74

**Ô thang chỉ mở cửa sang giao thông, khu chung, sân thượng, thang máy** (25/09/2026, Haan). Đảo luật
T54 từ danh sách PHỦ ĐỊNH (`passage.stair_not_for`: chỉ cấm phòng ở, phòng thờ, phòng làm việc, cửa
hàng) sang danh sách KHẲNG ĐỊNH `passage.stair_opens_to` = `circulation, core, stair, elevator, living,
dining, terrace` (`kb/room_vocabulary.yaml`). Mọi phòng khác (WC, kho, bếp, giặt phơi, ban công, gara…)
phải vào từ hành lang hay khu sinh hoạt chung; vi phạm là `door_from_stair`, CHẶN và GỬI LẠI mô hình.
Hàm chung `opensFromStair` (`kb/vocabulary.ts`): ô ghép được khi MỘT loại của nó được (khách ghép bếp).
Áp ở bộ xếp (`pack.ts` phạt, `doors.ts` không mở cửa từ ô thang), cổng cây (`tree/openings.ts`), lời
dẫn 8.27.0 (câu dặn + năm câu nhắc sửa bỏ «stair» khỏi chỗ mở cửa).

**Lý do / đánh đổi:** Haan: «cửa ở mặt cầu thang thì đi vào đi ra kiểu gì?» — ô thang trên bản vẽ là
cả khối bậc, chương trình không biết cửa nằm ở chiếu nghỉ hay giữa vế. Lý do cũ trong tệp dữ liệu («WC,
kho mở từ chiếu nghỉ là cách nhà ống vẫn làm») do phiên trước tự đặt, Haan chưa duyệt. Hai ngoại lệ Haan
chọn: sân thượng (tum thang mở ra mái) và thang máy (sảnh chung chiếu tới). Không chọn: gara / hiên.

Hai chỗ ghép thêm để luật không làm mất lượt oan:
1. `doors.ts`: phòng chỉ còn ô thang là chỗ mở cửa thì báo `door_from_stair` (ngữ nghĩa, gửi mô hình),
   không phải `arrange_no_hub_wall` (hình học, dừng lượt). Lượt 4a521f52 vòng 2–3: giặt phơi / WC tầng
   2 chỉ giáp ô thang — trước T74 xếp được nhờ cửa mở ra bậc, nay bác và gửi lại mô hình.
2. CỐ Ý KHÔNG áp ở phép kiểm bản phác (`sketchNoAccess`): bản phác chưa phải hình cuối, bộ xếp còn nắn
   được. Thử áp thì lượt 9d3cc059 và 6c35ed79 bị bác oan phòng ngủ tầng 1 mà bộ xếp vẫn cứu được.

Đo trên các lượt đã lưu (không gọi mô hình): 9d3cc059 vòng 2 — tầng 2 trước hỏng vì hành lang chia mẩu,
nay bộ xếp không tính ô thang là lối vào WC/kho nên chọn cây khác và QUA, chỉ còn ban công sai mặt (lỗi
thật của lượt ấy). 4a521f52 vòng 2, 3 — mất tầng 2, gửi lại mô hình. Cây thật gpt-5 13/09: thêm
`door_from_stair` cho `wc_2` tầng 1 và `wc_4` tầng 2. Bản phác mẫu `VILLA_SKETCHES` sửa hai tầng (WC tầng
1 dời sang giáp phòng khách, ban công tầng 2 lên mặt trước). Phép thử T73 (g) giữ trên luật trước T74.
Đột biến M45. 1.115 phép thử xanh.

## T75

**Bốn lỗi chặn đổi sang tự sửa hoặc gửi lại mô hình, và kích thước giếng thang hỏi ở đầu bài** (25/09/2026,
Haan: «hai phần này có thể sửa dễ dàng, ko nên dừng»; «diện tích thang máy nên yêu cầu điền thông tin ở
đầu bài thay vì đoán»; «không làm ban công mà vẫn có … nên sửa lại thay vì dừng»).

1. **Diện tích ghi trên phòng, tên phòng trùng → chương trình tự sửa** (`restateRoomFacts`,
   `ai/plan-check.ts`). Cả hai là thứ chương trình gán từ T37/T48, mô hình không khai. Chạy trước
   `checkPlan` ở `assemblePlan` và lưới an toàn của cây: diện tích lệch quá dung sai thì ghi lại theo chữ
   nhật; nhãn trùng (hai giếng trời cùng «Giếng trời») thì đánh số từ phòng thứ hai. Ghi chú
   `room_area_restated` / `room_label_numbered`. Hai cổng cũ giữ làm lưới an toàn cho bản đọc lại.
2. **Kích thước giếng thang máy do gia chủ khai** — hai trường mới `vertical.elevator_shaft_width_m` /
   `_depth_m` (hợp đồng `design-brief` + `ai-brief-digest`, biểu mẫu mục «Khối nhà, thang và mặt ngoài»,
   hiện khi làm ngay / chừa chỗ). Khai thang máy mà để trống → mâu thuẫn NGHIÊM TRỌNG
   `thang_may_thieu_kich_thuoc`, chặn ở cổng Lớp 2 trước khi gọi mô hình (không tốn tiền). Đòi hỏi:
   diện tích = rộng × sâu, cạnh ngắn = số nhỏ hơn; bộ xếp dùng đúng cạnh ấy (`usableMinSideM`). Gỡ bảng
   đoán theo tải (`demands.elevator.shaft_m2` 2,2/2,5/3,2 m², `shaft_min_side_m` 1,4) và
   `usable.min_side_m.elevator` 1,4 — mức cố định ấy sẽ bác oan giếng 1,2 m của hãng nhỏ. Đầu bài cũ
   thiếu số: không đo cỡ, cảnh báo, không đoán.
3. **`balcony_not_wanted` và bốn mã `elevator_*` vào `REVISABLE_CODES`** — chỗ đặt các ô ấy là bản phác mô
   hình vẽ. Thêm câu nhắc sửa cho cả năm (lời dẫn 8.28.0) và tham số `{room}`/`{level}`/`{need}`.

**Hệ quả phải nhớ:** dự án demo «Biệt thự nhà vườn (demo)» khai «chừa chỗ, 350 kg» mà chưa có kích thước
giếng — lượt chạy sau sẽ bị cổng chặn tới khi điền hai ô ấy. Phép thử phát lại lượt cũ điền giếng
1,4 × 1,6 m (`withRecordedShaft`, sát mức đoán cũ) để đo đúng tình huống lượt ấy gặp. Hợp đồng đổi →
`CONTRACTS_FINGERPRINT` đổi: phát hành API và giao diện cùng lúc. Đột biến M46–M48 (kiểm tay trên tệp phép
thử liên quan: `mutation-proof` trọn bộ vướng lỗi «Timeout calling onTaskUpdate» của vitest khi máy tải
cao, 1.931 phép thử vẫn xanh). Phép thử `brief-form-page` «thêm câu hỏi tự soạn» nới hạn 15 giây.

## T76

**Lượt thật b5202883 và kiểu bố trí thang máy** (25/09/2026). Lượt GPT-6 Sol đầu tiên trên lời dẫn 8.28.0
(bốn lời gọi, 0,402 USD) không ra phương án: mô hình đặt thang máy CHẮN GIỮA thang bộ và hành lang
(«cạnh thang bộ» hiểu theo nghĩa đen). Cabin không phải lối đi, nên cả tầng 2 «không có lối vào». Câu
nhắc cũ kể bảy phòng và dặn GIỮ NGUYÊN `elevator_2` (vì nó giáp thang bộ) — ba lượt sửa nộp lại gần như
y nguyên. Haan đồng ý ba chỗ sửa, và bổ sung ba kiểu bố trí thang máy phổ biến ở Việt Nam.

1. **`sketch_stair_isolated`** (`arrange/index.ts` `sketchNoAccess`): không phòng đi xuyên được nào nối
   về ô thang → báo đúng chỗ hỏng: ô thang chỉ giáp những gì; không kèm danh sách «giữ nguyên». Gửi lại
   mô hình. Câu dặn trong lời dẫn chính: thang máy cạnh thang bộ, không bao giờ chắn giữa thang bộ và
   hành lang (8.29.0; câu hành lang và câu WC chung rút gọn để giữ trần 4.900 ký tự).
2. **Kiểu bố trí thang máy ở đầu bài** — dùng lại `vertical.elevator_position`, nhãn «Kiểu bố trí thang
   máy»: `giua_long_thang_bo` (giếng ở lòng thang bộ, thang bộ uốn quanh — hợp nhà ống), `canh_thang_bo`
   (chung một mảng tường, cùng mở ra một hành lang — nhà ngang từ 4,5–5 m), `doi_dien_thang_bo` (hai phía
   một hành lang / sảnh chờ — biệt thự, lô góc), `khac` + ô mô tả `elevator_layout_note`. Giá trị cũ
   `rieng_biet`, `chua_quyet` giữ trong hợp đồng và đánh `retired` ở biểu mẫu (artifact kiểm hợp đồng
   khi đọc lại). «Khác» chưa mô tả → cảnh báo `thang_may_kieu_khac_chua_mo_ta`.
3. **Ràng buộc kiểm được** (`checkElevatorLayout`, `plan-demands.ts`), CHẶN và GỬI LẠI:
   `elevator_not_beside_stair` (giữa lòng / cạnh: không chung vách), `elevator_not_facing_stair` (đối
   diện: lại chung vách), `elevator_no_common_hall` (cạnh / đối diện: hai ô không cùng giáp một hành lang
   / sảnh). «Chung vách» = đoạn chung ≥ `demands.elevator.layout_min_shared_m` (0,8 m, dung sai đo);
   loại sảnh `demands.elevator.hall_types` (`kb/brief_fidelity.yaml`). `khac` chỉ tới mô hình dạng câu.

**Giới hạn phải nói ra:** lưới chữ nhật không vẽ được thang bộ uốn quanh giếng — «giữa lòng thang bộ»
thể hiện là ô thang máy và ô thang bộ liền nhau thành một lõi. Phát lại b5202883: câu nhắc mới nêu
`stair_2` chỉ giáp `study_1`, `elevator_2`, `bedroom_4`. Đột biến M49, M50. Hợp đồng đổi (`8a33bb71a10d`).
1.942 phép thử xanh. Chưa lượt thật nào trên 8.29.0.

## T77

**Lượt thật 4b0268b1 và «báo hết lỗi lối vào thấy được trong một lượt»** (25/09/2026, Haan chọn hướng 1).
Lượt GPT-6 Sol trên 8.29.0 (bốn lời gọi, 0,469 USD) không ra phương án. Lỗi thang máy chắn cầu thang
không còn (T76 có tác dụng), tầng 1 qua cả bốn vòng. Tầng 2: vòng 1 bốn lỗi, **vòng 2 chỉ một** (`bedroom_5`
không chạm hành lang), vòng 3 mười ba (vẽ lại cả tầng), vòng 4 tám (đi tiếp từ vòng 2 — (i) chạy đúng —
nhưng lộ `wc_4`, `bedroom_4` chỉ giáp ô thang). Gốc: phép kiểm bản phác dừng ở lỗi đầu tiên, luật T74 chỉ
chạy ở bộ xếp mà bộ xếp chưa được chạy tới — `wc_4` đã chỉ giáp ô thang từ vòng 2 mà mô hình không biết.

Sửa (`arrange/index.ts` `sketchNoAccess`): phân loại thêm phòng CHỈ vào được qua ô thang mà loại không nằm
trong `passage.stair_opens_to`. Khi bản phác đã hỏng vì lối vào → câu nhắc kèm «Also, … can only be entered
from the stair» (`{also}`); hỏng vì lý do khác (hụt diện tích, bộ xếp hỏng) → kèm mã `sketch_stair_only`
(gửi lại). Tự nó KHÔNG bác phương án — bản phác chưa phải hình cuối, bộ xếp còn nắn được (bài học 9d3cc059,
6c35ed79). Phòng đang bị nêu lỗi rút khỏi danh sách «phải giữ nguyên». Lời dẫn 8.30.0. Phát lại
4b0268b1 vòng 2: câu nhắc nêu `bedroom_5` kèm `wc_4`. Đột biến M51; M40, M42 cập nhật chỗ tìm. 1.944 phép
thử xanh. Chưa lượt thật nào trên 8.30.0.

Hướng chưa làm, chờ Haan: chương trình tự vá phòng thiếu lối vào (nới hành lang / đổi chỗ phòng bên), và
tăng `HOUSE_REVISIONS_MAX`.

## T78

**Lượt thật 913bc2ad và «tầng 1 được cứu im lặng»** (25/09/2026). Lượt GPT-6 Sol trên 8.30.0 (bốn lời
gọi, 0,256 USD) không ra phương án. Mô hình vẽ HAI tầng khớp nhau (ô thang hàng 12–15 cột 7–8, giếng thang
máy hàng 12–15 cột 9 — 1 × 4 ô cho giếng 1,3 × 1,4 m). Chuỗi nhân quả: (1) bản phác tầng 1 hỏng vì
`bedroom_2` căn vách ra 12,42 m² < 15 m² đầu bài — giếng 1 m phải nới ra 1,3 m, lấy của phòng bên; (2) bộ
xếp bỏ bản phác, chia lại tầng 1: ô thang dời sang mép trái, giếng thành dải 1,6 × 6,45 m dọc mép sau;
(3) ép hai ô ấy sang tầng 2 xoá sạch dải `wc_4`, mô hình nhận «bản phác không vẽ wc_4» mà nó đã vẽ, nộp
lại gần y nguyên ba lượt; `revisionBase` giữ vòng 1 (1 lỗi) làm gốc nên vòng 2–4 nhận cùng câu nhắc sai.

Sửa (Haan đồng ý cả ba, 25/09/2026):

1. **Ép ô lõi xoá phòng thì nói đúng chỗ** (`sketchStage` → `forceCore`, mã `sketch_core_overlap`, gửi
   lại): «ô thang máy phải nằm hàng 15–16, cột 7–12; `wc_4` vẽ đè lên đó». Dùng cho kỹ sư đọc; với mô
   hình thì xem mục 2.
2. **Không «cứu» tầng dưới im lặng** (`ArrangeResult.sketchFailure`, `coresMoved`; `evaluateHouse`
   `droppedBelow`): tầng dưới xếp được bằng cách chia lại thì lỗi SỬA ĐƯỢC của bản phác nó (kèm số ô,
   `withSketchCells`) và tên ô lõi đã dời được giữ lại. Tầng trên hỏng → câu nhắc kèm
   `sketch_below_replaced` + lỗi ấy («Storey 1: bedroom_2 came out at 12.42 m² from 18 cells… at least 22
   cells»). Khi tầng trên hỏng vì bị ÉP theo ô lõi đã dời (`sketch_core_overlap`, `arrange_anchor_conflict`)
   thì lỗi ép ấy KHÔNG gửi mô hình (nó là hệ quả của bản chia lại, không phải của bản phác tầng trên) và
   lỗi tầng dưới đứng ĐẦU câu nhắc. Kỹ sư vẫn thấy đủ ở `rejections[].notes`.
   Đã thử và bỏ: ghim CỨNG ô lõi theo bản phác ở tầng 1 nhà nhiều tầng (bác mọi cây dự phòng dời lõi) —
   24 phép thử phát lại đỏ: nhiều lượt tầng 1 chia lại mà tầng 2 vẫn xếp được, ghim cứng làm tầng 1 hỏng
   luôn. Giữ xếp hạng mềm `atSketch` (T73) và quy lỗi khi tầng trên hỏng.
3. **Giếng thang máy dựng đúng cỡ** (`checkElevatorStack`, mã `elevator_oversized`, gửi lại): cạnh dài >
   `shaft_max_aspect` (1,6) × cạnh ngắn, hoặc diện tích > `shaft_max_area_ratio` (2,5) × rộng × sâu khai
   → bác. Số ở `kb/brief_fidelity.yaml` `demands.elevator`; tỉ lệ diện tích cố ý rộng vì 2 × 2 ô lưới 1 m
   (4 m² tim tường) là hình nhỏ nhất vẽ được cho giếng 1,82 m². Chỉ kiểm khi đầu bài có kích thước.
4. **Nói mô hình số ô mỗi cạnh của giếng** (`briefMinCells` nhận `demands.elevator`; `BriefMinCells.
   min_side_cells`): giếng 1,3 × 1,4 m + tường 0,22 → 2 × 2 ô lưới 1 m (4 × 4 ô lưới 0,5 m). Lời dẫn
   8.32.0: «and `min_side_cells` per side when given (a lift shaft is a block, not a strip)». Lời dẫn hệ
   thống vừa 4.900 ký tự sau khi rút gọn một câu về phòng lọt trong phòng.

Phát lại 913bc2ad vòng 2: câu nhắc [1] «Your sketch of storey 1 failed the checks below…», [2] «Storey 1:
bedroom_2 … at least 22 cells», rồi lỗi lối vào tầng 2 (`wc_4`, `balcony_2` chỉ giáp ô thang); không còn
dòng bảo dời `wc_4` theo hàng cột của bản chia lại. Phép thử `ai-live-913bc2ad.test.ts`; đơn vị cho cổng
giếng và dòng `min_cells`. Đột biến M52–M55 (55 đột biến). 1.135 phép thử module xanh. Chưa lượt thật nào
trên 8.32.0. Tổng tiền lượt thật 25/09: 1,127 USD (b5202883 0,402 · 4b0268b1 0,469 · 913bc2ad 0,256).

**Còn treo, chờ Haan:** `revisionBase` chọn vòng ít lỗi nhất làm gốc — vòng sau nhiều lỗi hơn thì gửi lại
vòng cũ cùng câu nhắc cũ; đúng khi câu nhắc đúng, nhưng ba lượt cùng một câu mà không tiến thì nên đổi gốc.
Xem «Phương án để ra được mặt bằng» ở `HANDOFF_T73.md`.

## T79

**Ba hướng để ra được mặt bằng** (25/09/2026, Haan đồng ý cả ba; mục 2 kèm điều kiện «tối ưu token mỗi
lần sửa»). Ba lượt thật cùng ngày (b5202883, 4b0268b1, 913bc2ad) cùng một dạng: bản phác gần đúng, hỏng vì
câu nhắc sai / thiếu, ba lượt sửa không đủ.

1. **Bộ xếp tự nới phòng hụt ô trên bản phác** (`arrangeLevel` → `growSketchRoom`, `sketch.ts`; số lần ở
   `kb/construction_norms.yaml` `sketch.grow_tries: 3`): phòng vẽ đủ ô mà căn vách vẫn hụt mức đầu bài thì
   nới nó thêm MỘT dải ô lấy của phòng kề, thử lại, rồi mới bỏ bản phác; ghi chú `sketch_room_grown`.
   Dải phải là trọn một hàng / cột của phòng cho (cả hai vẫn chữ nhật); không lấy của ô lõi, hành lang
   (`passage.through`), hay phòng sẽ tụt dưới sàn đầu bài (không có sàn thì dưới mục tiêu trừ
   `area_slack_ratio`). Nới xong bản phác phải qua lại `sketchNoAccess` và `sketchBelowBrief`.
   **Đo thật thì hẹp:** trên ba lượt đã lưu (8efa35a6, 913bc2ad, fad0c0fa) không lượt nào nới được —
   8efa35a6: phòng kề duy nhất cùng cạnh là `bedroom_2`, cho một cột là tụt dưới sàn 20 m²; 913bc2ad:
   `dining_1` chỉ còn 6 ô. Phần dư thật của hai bản ấy nằm ở giếng thang máy 12 ô / hành lang 12 ô mà
   lưới không lấy được từng phần. Giữ vì rẻ, tất định và vô hại khi không áp; không hứa nó gỡ được nhiều.
2. **`HOUSE_REVISIONS_MAX` 3 → 5**, và tối ưu token: đo trên lượt 913bc2ad, một lượt sửa GPT-6 Sol vào
   7.137 token (7.019 ký tự lời dẫn + đầu bài + tri thức, giữ nguyên từng byte nên nhà cung cấp đọc từ bộ
   đệm; 8.193 ký tự ý định cũ), ra 3.727–4.763 token trong đó ~2.000 là NGHĨ, câu trả lời JSON ~7.000 ký
   tự; giá 2 / 10 USD mỗi triệu → ~0,05 USD, **~75 % là token ra**. Vì thế lượt sửa nay **chỉ trả về các
   tầng có lỗi** (lời dẫn `revise`, 8.32.0): chương trình ghép tầng còn lại từ ý định trước
   (`mergeRevision` trong `callHouseModel`: phòng, quan hệ giữa các phòng ấy, bản phác); `rationale` một
   câu, `assumptions` rỗng nếu không đổi. Ước tiết kiệm ~1.000 token ra mỗi lượt khi chỉ một trong hai
   tầng hỏng (~0,01 USD); năm lượt sửa ≈ 0,25 USD thay vì 0,30. Phần nghĩ không giảm được từ phía ta.
3. **Đổi gốc sửa khi đứng yên** (`revisionBase(…, stalled)`, `STALLED_AFTER = 2`): gửi lại bản tốt nhất
   hai lần liền mà không tiến thì lượt kế lấy bản mới nhất làm gốc, kèm dòng `revision_stalled`. Cả hai
   tuyến (`generateAiPlan`, Workflow) đếm `resent`.

Phép thử: `ai-revision-rounds.test.ts`, `growSketchRoom` trong `ai-arrange-sketch.test.ts`;
`ai-plan.test.ts` dựng số bản hỏng theo `HOUSE_REVISIONS_MAX`. Đột biến M56–M58 (58 đột biến). 1.144
phép thử module xanh. Chưa lượt thật nào trên 8.32.0.

## T80

**Lượt thật c8cefafc — lượt đầu trên 8.32.0** (25/09/2026, GPT-6 Sol, Haan cho phép một lượt). Bốn lời gọi,
**0,394 USD**, rồi runtime `wrangler dev` SẬP lúc đang xếp vòng 4 (log: «Workers runtime crashed
unexpectedly», `RUNTIME WEBSOCKET CLOSED 1006`, không thông báo lỗi). Lượt treo ở `running`, đã đánh dấu
`failed` bằng tay để không khoá lượt sau. Tổng tiền lượt thật 25/09: **1,521 USD**.

Diễn biến (phát lại `ai-live-c8cefafc.test.ts`, không gọi mô hình):

| Vòng | Gốc | Kết quả | Token ra (nghĩ) |
| ---- | --- | ------- | --------------- |
| 1 | — | tầng 2: 3 phòng không lối vào + `bedroom_3` chỉ giáp ô thang; cả nhà thiếu ban công trái | 10.120 (7.564) |
| 2 | 1 | mô hình sửa cả tầng 1 («Fix storey 1 too»), `living_1` mất lối vào → tệ hơn, gạt | 10.045 (7.676) |
| 3 | 1 | **chỉ còn `laundry_1`** không lối vào — lỗi 4 → 1 | 8.095 (5.178) |
| 4 | 3 | mô hình chỉ trả tầng 2 (17 phòng, 1 bản phác) — ghép đúng (`mergeRevision`), nhưng vẽ lại cả tầng thành chong chóng → 6 lỗi, gạt | 5.843 (4.142) |

Lời gọi 5 lẽ ra sửa từ vòng 3 (còn hai lượt), thì runtime sập. Phát lại cục bộ bốn vòng hết ~1,5 s,
vòng 4 xếp 1,2 s, heap không tăng — không phải treo hay tràn bộ nhớ của bộ xếp. Nghi ngờ môi trường: trước
lượt tôi khởi động lại `wrangler dev` và còn 5 tiến trình `workerd` cũ của NVG chưa chết (kill node
wrangler không kéo theo workerd). Chưa chứng minh được. Quy trình từ nay: trước lượt thật, kiểm
`ps | grep workerd` chỉ còn tiến trình con của wrangler đang sống.

Ba điều T78/T79 đã có tác dụng: (a) câu nhắc tầng 1 kèm theo được mô hình nghe — nhưng nghe quá tay
(vòng 2 vẽ lại tầng 1 và hỏng), `revisionBase` gạt đúng; (b) lượt sửa trả một tầng ghép đúng, token ra
phần viết giảm (vòng 4: ~1.700 token viết so với ~2.400 ở vòng 2), phần NGHĨ vẫn 4.000–7.700 token và là
phần đắt; (c) không lỗi nào là lỗi chương trình đưa sai như ba lượt trước — cả bốn vòng đều là lỗi thật
của bản phác. Điểm còn yếu: mô hình hay vẽ lại cả tầng dù được dặn «change only the rooms a problem
names» (vòng 2 tầng 1, vòng 4 tầng 2).

## T81

**Lượt thật 4198d692 — năm lượt sửa, ba vòng cuối bị gạt oan** (25/09/2026, GPT-6 Sol, 8.32.0, Haan cho
phép một lượt). Sáu lời gọi, **0,543 USD**, không ra phương án. Tổng tiền lượt thật 25/09: **2,064 USD**.

| Vòng | Gốc | Kết quả | Token ra (nghĩ) |
| ---- | --- | ------- | --------------- |
| 1 | — | tầng 2: chong chóng, hai ban công không ra mặt thoáng, ba phòng không lối vào; cả nhà thiếu ban công trái | 11.607 (—) |
| 2 | 1 | còn `laundry_1` không lối vào (+ tầng 1 chia lại: `bedroom_2` 13,74 / 15) | 9.124 (—) |
| 3 | 2 | còn `bedroom_5` không lối vào | 13.581 (10.427) |
| 4 | 3 | trả tầng 2 — GỠ XONG lối vào, cây dựng được; còn `bedroom_3` **14,92 / 15** và `bedroom_5` 15,67 / 17 | 4.249 (2.463) |
| 5 | 3 | y như vòng 4 (gạt vì «2 lỗi > 1 lỗi», nhận lại câu nhắc lối vào cũ) | 4.468 (2.682) |
| 6 | 3 | y như vòng 4 — hết lượt | 2.812 (1.026) |

Gốc bệnh: `setbackRank` chỉ đếm số lỗi. Vòng 4 đi xa hơn hẳn (bản phác qua mọi phép kiểm, cây dựng
được, chỉ thiếu 0,08 và 1,3 m²) mà thua vòng 3 vì 2 > 1; câu nhắc diện tích kèm số ô của vòng 4 không bao
giờ tới mô hình; «đổi gốc khi đứng yên» (T79) cần hai lần gửi lại nên chỉ kịp ở lời gọi 7. Bước nới
phòng (T79) không áp được lần nào (không phòng kề cùng cạnh còn dư).

Sửa: `LevelRejection.codes` (mã song song `messages`, `fail()` điền); `setbackRank` xét GIAI ĐOẠN
trước số lỗi — có mã `sketch_*` (chưa dựng nổi cây) tệ hơn lỗi sau khi cây đã dựng, rồi mới đếm. Phát lại:
`revisionBase(vòng 3, vòng 4)` chọn vòng 4; lời gọi 5 mang «bedroom_3 came out at 14.92 m² from N cells…
at least M cells». Phép thử `ai-live-4198d692.test.ts`; đột biến M59 (59 đột biến). 5cd78ef7 vẫn đúng
(vòng 4 của lượt ấy hỏng ngay ở bản phác).

**Chờ Haan:** `bedroom_3` 14,92 / 15 m² — hụt 0,5 % sau khi căn vách, đầu bài khai 15 là sàn cứng (T41).
Có nên cho cổng sau khi dựng một dung sai đo nhỏ (vd 2 %, số ở tệp dữ liệu) để không mất một lượt sửa vì
8 cm²? Bộ xếp vẫn nhắm đủ 15; chỉ cổng tha phần lẻ. Chưa làm — đó là nới luật, không phải sửa lỗi.

## T82

**Dung sai 3 % ở cổng sau khi dựng cho sàn đầu bài** (25/09/2026, Haan: «thiếu 8 cm² hoàn toàn có thể bỏ
qua… nếu chưa có thì để 3 %»). Trước đó cổng `belowBriefArea` làm tròn 0,1 m² rồi so thẳng: 14,92 → 14,9
< 15, bác. Nay tha phần hụt trong `sketch.floor_tolerance_ratio` (`kb/construction_norms.yaml`, 0,03; bộ
đọc bác số ngoài [0, 1)). Bộ xếp vẫn nhắm đủ sàn; bản phác vẫn dùng `area_slack_ratio` 0,1 riêng.
Phát lại 4198d692 vòng 4: chỉ còn `bedroom_5` 15,67 / 17 (hụt 8 %, lỗi thật) — câu nhắc kèm số ô cho đúng
phòng ấy. Đột biến M60 (60 đột biến). Chưa lượt thật nào sau T81/T82.

## T83

**Lượt thật e82e3a09 — runtime sập lần thứ hai** (25/09/2026, GPT-6 Sol, 8.32.0 + T81/T82, Haan cho phép
một lượt). Hai lời gọi, **0,227 USD**, rồi `wrangler dev` sập ~3 s sau khi lời gọi sửa vòng 2 xong, đúng
kiểu lượt c8cefafc. Tổng tiền lượt thật 25/09: **2,291 USD**. Lượt treo đã đánh dấu `failed` tay.

Đã loại trừ được gì:
- **Không phải bộ xếp treo hay tràn bộ nhớ.** Phát lại vòng 2 (và vòng 4 của c8cefafc) trong Node với trần
  heap 96 MB: xong trong ~1,5 s, heap dùng 30–45 MB. Lượt 4198d692 sáu vòng cùng ngày không sập.
- **Không phải tiến trình `workerd` mồ côi** (nghi ngờ ở T80): trước lượt này chỉ còn hai tiến trình con
  của wrangler đang sống.
- **Kernel ghi `traps: workerd[…] trap int3`** ở cả hai lần (17:11:50 và 23:16:43 giờ máy) — workerd tự
  huỷ vì một khẳng định nội bộ; wrangler chỉ thấy «Network connection lost», không có thông báo nào từ
  workerd. Sau đó wrangler không khởi động lại được runtime, máy chủ dev chết luôn.
- Bộ công cụ: wrangler 4.126.0, miniflare **5.20260825.0-alpha**, workerd 1.20260825.1. Bản mới nhất là
  wrangler 4.140.0 (chính wrangler gợi ý nâng cấp trong thông báo lỗi).

Điểm chung hai lần sập: xảy ra ngay sau một lời gọi sửa, trong lúc bước `arrange` bắt đầu — nhưng lượt
4198d692 đi qua đúng chỗ ấy năm lần không sao. Chưa tái hiện được ngoài runtime.

Đề xuất (chờ Haan): (1) nâng wrangler lên 4.140.0 (miniflare / workerd mới, dev-dependency, đảo ngược
được) trước lượt thật kế; (2) chương trình tự đánh dấu `failed` lượt «đang chạy» quá 10 phút không cập
nhật, để giao diện không treo và lượt sau không bị khoá. Phép thử `ai-live-e82e3a09.test.ts` chỉ canh
phần chương trình (ghép và xếp vòng 2 không treo).

**T83, tiếp — tái hiện không tốn tiền, chưa ra root cause** (25/09/2026, tối). Haan: «đây là lỗi nghiêm trọng».
- Dựng tuyến TẠM `ai_text_replay` trong `config/models.yaml` trỏ về máy chủ giả OpenAI Responses API tại
  chỗ (cổng 8799, script `replay-openai.mjs` ở thư mục nháp của phiên) trả lại đúng câu trả lời đã ghi
  của lượt e82e3a09, cả chế độ truyền luồng. Chạy trọn Workflow trong `wrangler dev` hai lần: (1) trả
  lời tức thì — 5 lời gọi, không sập; (2) nhả chữ chậm 120 s mỗi lời gọi như lượt thật — 5 lời gọi,
  không sập. Vậy nội dung câu trả lời, phép ghép tầng, bộ xếp, bảng tiến độ và nhịp thời gian đều KHÔNG
  làm workerd sập.
- Khác biệt còn lại giữa lượt thật và tái hiện: kết nối TLS / HTTP2 tới api.openai.com với luồng SSE dài
  2–5 phút. Cả hai lần sập đều cách đúng 2,7–3,0 s sau khi luồng kết thúc (dòng `[ĐO]`) — giống một bộ
  đếm giờ đóng kết nối rỗi hơn là một bước chương trình. Giả thuyết: workerd (bản alpha) hỏng khi đối
  tác đóng kết nối HTTP2/TLS sau một luồng dài, không tái hiện được với HTTP/1.1 tại chỗ.
- `ptrace_scope = 1` nên không gắn gdb vào tiến trình đang chạy. Đã thay `node_modules/@cloudflare/
  workerd-linux-64/bin/workerd` bằng script chạy `gdb -batch` bọc `workerd.real`: lần sập kế sẽ ghi
  backtrace vào `/tmp/claude-1000/workerd-gdb.log`. Kiểm: máy chủ dev vẫn chạy bình thường dưới gdb.
  **Hai thứ TẠM này phải gỡ trước khi commit / deploy**: tuyến `ai_text_replay` và script bọc workerd
  (`mv workerd.real workerd`).
- Việc kế cần Haan: một lượt thật dưới gdb để lấy backtrace (0,2–0,5 USD), hoặc nâng wrangler 4.140
  trước rồi mới chạy.

## T84

**Root cause `wrangler dev` sập — stub RPC của binding Workflow không được huỷ** (26/09/2026 rạng sáng).
Haan chọn hướng 2 (T83): nâng wrangler 4.126.0 → 4.140.0 (miniflare 5.20260923, workerd 1.20260923)
rồi chạy một lượt thật (0f80cd0b, 3 lời gọi GPT-6 Sol, 0,329 USD; tổng tiền lượt thật 25/09: **2,620
USD**). Sập lần THỨ BA, đúng chỗ (~3 s sau lời gọi sửa vòng 3) — nhưng lần này `workerd` chạy dưới `gdb`
(script bọc từ T83) nên có backtrace:

```
#35 Builtins_MathHypot                      ← bộ xếp đang tính (JS)
#32 StackGuard::HandleInterrupts → #31 Heap::CollectGarbage      ← V8 dọn rác giữa chừng
#22 SweepFinalizer → #21 jsg::Wrappable::CppgcShim::~CppgcShim  ← finalizer của một giá trị RPC
#20 deserializeRpcReturnValue … → #18 ~RpcStubDisposalGroup      ← stub RPC chưa được dispose()
#17 IoContext::logWarningOnce → #13 Isolate::logMessage → #12 stackTraceToCDP   ← inspector wrangler
#11 v8::StackTrace::CurrentStackTrace → #9 Factory::NewStackFrameInfo → #7 AllocateRaw
#5 Heap::CollectGarbage → #0 CppHeap::InitializeMarking  ← dọn rác LỒNG trong dọn rác → trap int3
```
Thông báo workerd ghi ra stderr (bắt được qua gdb): «An RPC result was not disposed properly. One of the
RPC calls you made expects you to call dispose() on the return value…».

Chuỗi nhân quả: `env.AI_DESIGN_PIPELINE.create()` (mở lượt) và `workflow.get()` (tuyến trạng thái, màn
hình hỏi mỗi vài giây khi lượt đang chạy) trả về STUB RPC `WorkflowInstance`; mã chỉ đọc `.id` /
`.status()` rồi bỏ rơi. Khi V8 dọn rác đúng lúc bộ xếp đang tính, finalizer của stub ghi cảnh báo; với
inspector của `wrangler dev` gắn vào, workerd lấy stack trace JS ngay trong finalizer → cấp phát trong
GC → GC lồng nhau → tự huỷ. Vì sao ngẫu nhiên: cần (1) stub bị dọn (2) đúng lúc bộ xếp chạy (3) cảnh
báo chưa từng ghi trong isolate này (`logWarningOnce` — isolate mới sau mỗi lần nạp lại mã), (4) cấp
phát trong finalizer phải kích một GC nữa. Nên lượt 4198d692 sáu vòng thoát, hai lần tái hiện bằng máy
chủ giả thoát, còn ba lượt thật sập. Nâng wrangler KHÔNG sửa được (lỗi ở phía ta; workerd chỉ làm nó
thành sập thay vì cảnh báo). Trên production không có inspector nên không sập, nhưng vẫn rò cảnh báo.

Sửa: `workers/src/design/workflows/rpc-stub.ts` — `disposeStub()` gọi `[Symbol.dispose]()` nếu có
(`lib: ES2022` chưa khai kiểu, đọc qua ép kiểu; bản giả trong test không có thì bỏ qua), `instanceIdOf()`
lấy `.id` rồi huỷ ngay. Áp ở năm chỗ `PIPELINE.create(` (mở lượt mặt bằng, sửa bố cục, mặt đứng, phối
cảnh, số hoá) và `workflowDead()` (`finally`). Phép thử `rpc-stub.test.ts`: hành vi huỷ + QUÉT MÃ mọi
`PIPELINE.create(` phải nằm trong `instanceIdOf(`. Đột biến M61 (61 đột biến). CLAUDE.md 8.6 thêm luật.
Giữ wrangler 4.140.0 (đã nâng, `npm install` xong, kiểu sạch). Tuyến tạm `ai_text_replay` đã gỡ; script
bọc `workerd` bằng gdb CÒN GIỮ tới khi một lượt thật xác nhận hết sập — rồi `mv workerd.real workerd`.

Lượt 0f80cd0b về mặt bằng: vòng 1 tầng 2 hai phòng không lối vào + thiếu hai ban công; vòng 2 (gốc 1)
lộ WC trên bếp, ba ban công sai mặt; vòng 3 (gốc 2) chong chóng. Chưa tới chỗ hay hỏng cũ.


## T85 — Kết quả `step.do` cũng là kết quả RPC: huỷ ở đầu `run()` (26/09/2026)

Lượt xác nhận dc949b49 (26/09/2026, GPT-6 Sol, lời dẫn 8.32.0, Haan cho phép): **sáu lời gọi, 0,613 USD,
runtime KHÔNG sập** (lần đầu một lượt đi hết `HOUSE_REVISIONS_MAX` dưới bản sửa T84). Nhưng nhật ký gdb
vẫn ghi thêm đúng một dòng «An RPC result was not disposed properly» giữa vòng 2 và 3 → còn nguồn thứ hai.

Nguồn: engine Workflows gọi `USER_WORKFLOW.run(event, stubStep)` với `stubStep = new Context(...)` là
`RpcTarget` của engine (miniflare `workflows/binding.worker.js`), nên `step` trong `run()` là stub và MỖI
`await step.do(...)` trả về một kết quả RPC mang bộ huỷ. `ai-design.ts` có mười hai chỗ `step.do`, lượt
sáu vòng để lại hàng chục kết quả cho bộ dọn rác. Cảnh báo ghi «once» mỗi isolate, nên không đếm được
bao nhiêu, chỉ biết còn. Lượt này không sập là may, không phải đã hết.

Sửa: `disposingStep(rpcStep)` trong `workflows/rpc-stub.ts` — Proxy chỉ bọc `do`, huỷ kết quả rồi trả
nguyên dữ liệu (dữ liệu thuần vẫn đọc được; chỉ đường ống RPC được nhả). Gọi bằng `Reflect.apply`, KHÔNG
`.call`/`.bind` (trên stub đó là tên phương thức từ xa). Bọc một lần ở dòng đầu cả hai `run()`
(`AiDesignPipeline`, `DigitisePipeline`) thay vì sửa từng chỗ. `workflowDead()` huỷ thêm kết quả
`status()`. Phép thử: hành vi `disposingStep` + quét mã mọi lớp `extends WorkflowEntrypoint<` bọc `step`
ngay dòng đầu. Đột biến M62 (62 đột biến).

Mặt bằng của lượt dc949b49 (fixture `ai-run-dc949b49.json`): tầng hỏng đổi qua lại —
vòng 1 tầng 1 (chong chóng, cửa từ ô thang, cửa xe sai mặt) → vòng 2 tầng 1 qua, tầng 2 mười lăm lỗi →
vòng 3 tầng 1 hỏng LẠI (cửa chính) → vòng 4 tầng 1 một lỗi lối vào → vòng 5, 6 tầng 2 lối vào + thang máy
lệch giếng. Cả năm câu trả lời sửa đều vẽ lại CẢ HAI tầng (`sketches [1, 2]`) dù lời dẫn bảo chỉ trả
tầng bị nêu — nên tầng đã qua bị vẽ lại và hỏng lại, và mỗi lượt sửa tốn ~8k token ra. Đề xuất (chờ
Haan): tầng đã qua ở vòng gốc mà vấn đề không nêu tới thì GIỮ bản cũ, bỏ phần mô hình vẽ lại.

## T86 — Lượt sửa giữ nguyên tầng đã qua (26/09/2026, Haan đồng ý)

Gốc: năm câu trả lời sửa của lượt dc949b49 đều vẽ lại cả hai tầng dù lời dẫn bảo chỉ trả tầng bị nêu;
đo trên mọi fixture lượt thật: câu trả lời sửa trả `sketches [1, 2]` ở gần hết các vòng. Tầng đã qua bị
vẽ lại rồi hỏng lại (c8cefafc vòng 2, dc949b49 vòng 3), và mỗi lượt sửa tốn ~8k token ra cho phần thừa.

Luật (`settledLevels` trong `ai/plan.ts`): tầng được GIỮ khi nằm dưới tầng hỏng thấp nhất VÀ xếp đúng
theo bản phác của mô hình. Không giữ khi: có lỗi cả nhà (tầng `0`, ví dụ thiếu ban công — có thể cần sửa
bất kỳ tầng nào); tầng trên tầng hỏng (xếp theo mốc của một tầng sắp đổi, chưa qua gì); tầng dưới mà
chương trình đã CHIA LẠI vì bản phác hỏng (câu nhắc `sketch_below_replaced` đang đòi mô hình sửa nó).

Đường đi: `evaluateHouse` trả `settled` + câu nhắc `revision_kept` («Storey N passed every check and is
kept exactly as it is; do not return it»; lời dẫn 8.33.0) → `retryPlan` mang `keep` → `callHouseModel`
→ `mergeRevision(previous, answer, keep)` BỎ phòng, bản phác và quan hệ nội tầng mà câu trả lời vẽ lại
cho tầng giữ, lấy bản cũ. Workflow: `ArrangeOutcome.keep` → `proposeHouse(…, keep)`. Tuyến đồng bộ:
`generateAiPlan`. Phép thử `ai-revision-keep.test.ts` (phát lại 4b0268b1: vòng 2 tầng 1 qua, câu trả
lời vòng 3 vẽ lại tầng 1 → ghép lấy tầng 1 của vòng 2) và `ai-design-steps.test.ts`. Đột biến M63, M64.

Đo trên fixture: vòng có tầng giữ xuất hiện ở 4198d692, 4b0268b1, c8cefafc, e82e3a09, 0f80cd0b,
2ddf782a. KHÔNG có ở dc949b49 — từ vòng 2 tầng 1 chỉ «qua» nhờ chương trình chia lại bản phác hỏng
(`technical_1` chỉ vào từ ô thang), nên nó không được giữ và câu nhắc vẫn đòi sửa; vòng 3 mô hình sửa
tầng 1 và làm hỏng hẳn (cửa chính). Mở rộng luật cho trường hợp này là câu hỏi riêng cho Haan.

### T86 bổ sung — tầng «qua nhờ chia lại» cũng giữ, gửi mô hình cách chia thật (Haan chọn phương án 1)

Đổi luật: `settledLevels` giữ MỌI tầng dưới tầng hỏng thấp nhất, kể cả tầng chương trình đã chia lại vì
bản phác hỏng. Với tầng ấy, bản phác trong ý định gửi lượt sửa được THAY bằng chính cách chia thật
(`replaceKeptSketches`): `splitMerged` tách phòng gộp (`also`, ví dụ khách + ăn) theo diện tích mục
tiêu, `partitionRows` vẽ lại trên lưới khối nhà cùng khổ `cols × rows` mô hình đã dùng (ô lấy phòng
chồng lấn NHIỀU NHẤT — toạ độ là lòng phòng, lấy theo tâm ô thì khe tường thành lỗ «.»), `absorbUnknown`
nhập ô của phòng chương trình tự thêm vào phòng giao thông kề nó. Câu nhắc của tầng trên thôi kèm lỗi
bản phác tầng dưới và câu «Fix storey N too»; lỗi ép ô lõi của tầng trên nay GỬI được (T78 từng chặn
vì mô hình không thấy ô lõi thật — nay thấy).

Đo: 913bc2ad vòng 2 — câu nhắc «elevator_2 must sit on exactly sketch rows 15–16, columns 7–12» và bản
phác tầng 1 gửi kèm có `elevator_1` đúng hàng 15–16, cột 7–12. dc949b49 — bản phác tầng 1 mới đủ 15
phòng (tách lại `dining_1`), đem xếp lại qua mà không phải chia lần nữa; câu trả lời vòng 3 (vẽ lại tầng
1) ghép lên gốc vòng 2 thì tầng 1 không còn hỏng. Phép thử cũ đổi theo: `ai-live-913bc2ad` (bốn phép),
`ai-live-4198d692` (vòng đồng bộ: tầng 1 giữ từ lời gọi 3; các câu trả lời ghi sẵn sinh trong ngữ cảnh
khác nên chỉ canh hướng đi). Đột biến M65 (không thay bản phác), M66 (vẫn đòi sửa tầng dưới) — 66 đột biến.

## T87 — Lời bác ở cổng danh mục phòng là bậc TỆ NHẤT khi chọn gốc sửa (26/09/2026)

Lượt thật 81fd3f57 (Haan cho phép, GPT-5.6 Luna, lời dẫn 8.33.0 — lượt đầu dưới T85, T86): sáu lời gọi,
**0,040 USD** (lượt đầu 11k token ra; lượt sửa chỉ trả tầng bị nêu, ~1k token ra), không ra phương án.
Runtime SẠCH: isolate nạp mới sau T86 chạy trọn lượt, nhật ký gdb không thêm dòng «RPC result was not
disposed» nào → T85 xác nhận; đã gỡ script bọc `workerd` bằng gdb (`mv workerd.real workerd`) và khởi
động lại `wrangler dev`.

Lỗi tìm ra: tầng `0` mang HAI nghĩa ngược nhau — bác ở cổng danh mục phòng (T41, chưa xếp tầng nào, giai
đoạn SỚM nhất) và lỗi liên tầng khi đã ghép đủ (giai đoạn MUỘN nhất). `setbackRank` (T81) coi mọi tầng
`0` là «mọi tầng đã xếp — nhẹ nhất». Vòng 1 bác ở cổng danh mục (phòng ngủ tầng 1 12 / 15 m²), vòng 2 sửa
xong và xếp tới tầng 1 (ba lỗi bản phác) → bị gạt «tệ hơn (3 so với 1)», lời gọi 3 và 4 nhận lại đúng câu
nhắc diện tích cũ, mô hình trả y nguyên; tới lời gọi 5 mới «bế tắc → lấy bản mới nhất».

Sửa: lời bác ở cổng danh mục mang mã `program_brief` (`PROGRAM_STAGE_CODE`, song song `messages`);
`setbackRank` xếp nó dưới mọi tầng. Phép thử `ai-live-81fd3f57.test.ts` (lời gọi 3 sửa từ vòng 2). Đột
biến M67 (67 đột biến). Bộ kiểm đầy đủ của `mutation-proof`: 1.995 phép thử xanh.

Mặt bằng lượt Luna: sau khi đúng gốc, tầng hỏng cuối là tầng 2 — ba phòng không lối vào trên bản phác.

### Lượt Luna thứ hai bc504189 (26/09/2026, Haan cho phép) — đi xa nhất từ trước tới nay

Sáu lời gọi, **0,041 USD** (tổng 25–26/09: 3,314 USD). Runtime sạch (không cảnh báo RPC, không có gdb).
Vòng 1 bác ở cổng danh mục (thiếu `ensuite_of` cho phòng ngủ chính, thang máy nhỏ hơn giếng); vòng 2
tầng 1 hai WC không lối vào + hai ban công sai mặt; **vòng 3 chỉ còn MỘT lỗi**: `bedroom_1` (phòng ông
bà) 14,91 / 20 m² — 16 ô, cần ≥ 22. Vòng 4–6 mô hình nới phòng ấy thì làm hỏng ô thang (3,89 m < 5 m cho
21 bậc) → bị gạt về vòng 3 hai lần, hết lượt. T87 chạy đúng (vòng 2 đi tiếp từ vòng 1 dù bác ở cổng).

Vì sao bộ nới phòng (T80) không cứu vòng 3: `growSketchRoom` chỉ lấy TRỌN một dải cạnh của phòng kề có
đúng cùng bề rộng. `bedroom_1` hàng 9–10 cột 1–8; trên là `living_1` cột 1–10 (50 ô, dư nhiều), dưới là
`bedroom_2` cột 1–6, phải là ô thang — không phòng nào khớp, nên không có nước đi. Đường cắt giữa hàng 8
và 9 lại LIỀN suốt bề ngang (mọi phòng trên dừng ở hàng 8, mọi phòng dưới bắt đầu ở hàng 9): dời cả
đường cắt lên một hàng giữ mọi phòng chữ nhật, `bedroom_1` 16 → 24 ô. Đề xuất cho Haan.

### T88 — ĐÃ LÀM RỒI GỠ: dời đoạn đường cắt để nới phòng thiếu ô (26/09/2026)

Haan đồng ý đề xuất trên. Đã viết: `shiftSketchCut` (dời một đoạn đường cắt sạch — đoạn cột 1–10, không
đụng thang máy để khỏi phạm «giếng quá to»), cho bước kiểm bản phác thử nới phòng vẽ thiếu ô trước khi
bác, và nới quy tắc phần dư (phòng nhường không có sàn đầu bài được lùi tới mức mục tiêu nghề; xét theo
chính phòng chứ không theo lá gộp khách + ăn + bếp). Phát lại vòng 3 vẫn hỏng: **phòng khách cũng có SÀN
ĐẦU BÀI 45 m²** — 50 ô, nhường 10 ô còn ~32 m². Cả hai phòng đều chạm sàn gia chủ khai; không cách dời
vách nào giữ được cả hai, chỉ xếp lại cả tầng mới được — việc của mô hình. Đề xuất đã dựa trên giả định
sai «phòng khách dư nhiều» (đọc mục tiêu 49 m² mà không đọc sàn đầu bài 45 m²).

Quét cả 27 lượt thật trong fixture: cơ chế mới KHÔNG cứu thêm vòng nào. Đã gỡ toàn bộ (mã không có lợi
đo được); bộ kiểm module về lại 1.181 xanh, 67 đột biến. Bài học: trước khi đề xuất nới phòng, đọc SÀN
ĐẦU BÀI của mọi phòng nhường, không chỉ mục tiêu mô hình tự đặt.

## T89 — Câu nhắc «phòng hụt sàn» nói thật khi không phòng kề nào nhường đủ (26/09/2026, Haan đồng ý)

Gốc: câu nhắc `arrange_room_below_brief_area_cells` luôn bảo «take them from a neighbour that has spare
area». Lượt bc504189 vòng 3: `bedroom_1` (sàn 20 m², 16 ô, cần ≥ 22) kề `living_1` (sàn 45 m², 50 ô),
`bedroom_2` (sàn 15 m²), `dining_1`, ô thang — không phòng nào nhường đủ 6 ô mà giữ được mức của chính nó.
Mô hình ba lần đẩy lấn, làm ô thang ngắn còn 3,89 m, hết lượt.

Sửa: `adviseShort` (`ai/arrange/index.ts`) xét từng phòng kề: nhường ĐỦ số ô còn thiếu mà vẫn giữ sàn
đầu bài (hoặc mục tiêu mô hình trừ tỉ lệ nới, khi không có sàn) không; ô lõi và hành lang không nhường.
Không phòng nào đủ → dòng mới `arrange_room_below_brief_area_tight` (lời dẫn 8.34.0): nói rõ không phòng
kề nào nhường đủ, kể tối đa ba phòng còn dư trong tầng kèm m² dư, nhắc phòng không có sàn đầu bài được
nhỏ hơn mục tiêu mô hình tự đặt, bảo xếp lại dải phòng và GIỮ ô thang, thang máy. Còn phòng kề nhường đủ
thì giữ dòng cũ. Phép thử `ai-live-bc504189.test.ts`; `ai-live-011b4adc` đổi theo (phòng khách thiếu 20
ô, không phòng kề nào đủ). Đột biến M68.

### Lượt Luna thứ ba 5a142183 (26/09/2026, lời dẫn 8.34.0 — lượt đầu dưới T89)

Sáu lời gọi, **0,050 USD** (tổng 25–26/09: 3,364 USD). Runtime sạch. Không ra phương án. Vòng 1 thiếu
`ensuite_of`; vòng 2 tầng 1 phòng khách, kho không lối vào + hai ban công sai mặt; vòng 3 tệ hơn (bị gạt);
vòng 4 còn `bedroom_1` 17,02 / 20 m² + `technical_1` chỉ vào qua ô thang → **câu nhắc T89 lần đầu tới
mô hình** (không phòng kề nào nhường đủ). Mô hình xếp lại dải phòng ngủ (vòng 5: phòng kề nay nhường đủ,
câu nhắc trở về dòng cũ), nhưng vòng 6 làm ô thang mất đường ra hành lang (`sketch_stair_isolated`) — hết
lượt. Luna đổi đúng hướng câu nhắc nhưng mỗi lần sửa phá một chỗ khác của tầng 1.

## T90 — Lượt GPT-6 Sol 02982bd7: lỗi bản phác của tầng bị chia lại đi cùng lỗi cả nhà (26/09/2026)

Lượt thật (Haan cho phép, GPT-6 Sol, lời dẫn 8.34.0): sáu lời gọi, **0,412 USD** (tổng 25–26/09: 3,776
USD). Runtime sạch. Không ra phương án — nhưng **vòng 3 XẾP XONG cả hai tầng**, chỉ hỏng kiểm cả nhà:
«thiếu ban công mặt sau».

Gốc: mô hình ĐÃ vẽ ban công ấy (tầng 2, hàng 16 — mép sau). Bản phác tầng 2 hỏng vì phòng ngủ chính
19,02 / 25 m² (sàn đầu bài); chương trình chia lại tầng 2, «giữ vùng» nhưng dời `balcony_1` sang mép trái
(x 211–449, y 761–1089). Lỗi bản phác của tầng bị chia lại chỉ được gửi khi TẦNG TRÊN hỏng (T78
`sketch_below_replaced`); tầng 2 là tầng trên cùng, nên câu nhắc chỉ còn «thêm ban công mặt sau». Mô
hình thêm ba lần (vòng 4–6), mỗi lần phá chỗ khác, hết lượt.

Sửa: kiểm cả nhà hỏng mà có tầng bị chia lại → câu nhắc mở đầu bằng `sketch_replaced` («bản phác tầng N
hỏng, chương trình chia lại và dời phòng khỏi chỗ bạn vẽ — các lỗi sau có thể do đó, sửa tầng N trước»)
kèm lỗi bản phác của tầng ấy, rồi mới tới lỗi cả nhà; ghi chú của lời bác kèm lỗi ấy cho kỹ sư. Lời dẫn
8.35.0. Phép thử `ai-live-02982bd7.test.ts`. Đột biến M69 (69 đột biến). Bộ kiểm module 1.185 xanh.

### Lượt Gemini 3.1 Pro de089989 (26/09/2026, Haan cho phép) — bị Google từ chối, không tốn tiền

Lời gọi đầu hỏng sau 432 ms: `403 PERMISSION_DENIED` — «Your project has been denied access. Please
contact support.». Không token, không tiền. Khoá `GEMINI_PAID_API_KEY` trong `workers/.dev.vars` có mặt
(53 ký tự) nhưng PROJECT Google Cloud của nó bị chặn truy cập — không phải lỗi mã. Màn hình báo đúng
«khoá API của nhà cung cấp mô hình bị từ chối». Cần Haan kiểm tài khoản Google Cloud / Gemini API.

### Lượt Claude Sonnet 5 e7caa832 (26/09/2026, Haan cho phép rồi tự bấm «Dừng»)

Hai lời gọi xong + một lời gọi bị huỷ: **65.770 và 90.845 token ra, 709 s và 916 s, 0,672 + 0,933 =
1,605 USD** (lời gọi 3 huỷ sau 86 s, dòng nhật ký không ghi tiền). Tổng chi 25–26/09: **5,381 USD**.
Vòng 1 không hơn các model khác (tầng 1 ba phòng không lối vào, thiếu ban công trái và sau). Sonnet 5
nghĩ rất dài ở tuyến này: 5–7 lần token ra của GPT-6 Sol cho cùng đầu bài, dù `reasoning_effort:
medium` đã đặt trong `config/models.yaml` (ghi chú 17/09 đã đo 58–117k token/lượt — đáng lẽ phải báo
Haan TRƯỚC khi chạy). Không dùng Sonnet 5 cho xếp mặt bằng trừ khi hạ mức suy nghĩ và đo lại.

### Lượt GPT-6 Sol 6ffe818a (26/09/2026) — OpenAI hết tín dụng, không tốn tiền

Hai lời gọi hỏng sau 2,2 s và 0,8 s: «You have no credits remaining. Add credits to continue using the
API». Không token, không tiền. Câu nhắc T90 vẫn chưa được lượt thật nào kiểm. Hiện cả ba nhà cung cấp đều
vướng: OpenAI hết tín dụng, Gemini gói trả phí bị Google chặn project (403), Claude Sonnet 5 chạy được
nhưng quá tốn cho việc này.

### Root cause: vì sao lượt Sonnet 5 hôm 26/09 tốn 1,6 USD (đối chiếu mọi lời gọi Sonnet 5 trong `design_ai_call`)

Cùng dự án demo, cùng tuyến `ai_text_anthropic_fast`, câu trả lời luôn cỡ 7–10 nghìn ký tự (~2–3k token):
phần chênh là SUY NGHĨ (Anthropic tính như token ra, 10 USD/triệu).

1. **Việc giao cho mô hình đã đổi.** 08/09 và 13/09 (lời dẫn 1.0–2.3) là `program` / `plan_level`: khai
   danh sách phòng + diện tích, hoặc ý định MỘT tầng — 6–28k token. Từ 17/09 (T45/T48) là `plan_house`:
   một lời gọi khai cả nhà VÀ vẽ bản phác lưới ô mọi tầng — suy luận không gian dài: 27k–117k token.
2. **Lời gọi sửa hôm nay khó hơn hẳn.** Hai lời gọi sửa Sonnet 5 trước đây (17/09) là sửa vặt: đổi chỗ
   bếp–ăn theo yêu cầu kỹ sư (9.034 token), nâng diện tích phòng ngủ chính 28 → 30 m² (3.584 token — chỉ
   đổi một con số). Hôm nay: ba phòng tầng 1 không lối vào + thêm ban công hai mặt → phải vẽ lại cấu trúc
   lưới hai tầng → 90.845 token.
3. **Mức suy nghĩ KHÔNG đổi.** Màn hình để «Mặc định», tuyến khai `reasoning_effort: medium` (có từ
   17/09), mã gửi `output_config.effort: medium` (`llm/anthropic.ts`). Nhật ký ghi `reasoningEffort` trống
   vì trường ấy chỉ ghi mức MÀN HÌNH chọn. Lời gọi 117k ngày 17/09 là trước khi tuyến có `medium` (mặc định
   Claude 5 là `high`). Không có trần: `max_output_tokens: 0` = 128k.
4. So sánh: GPT-6 Sol cùng việc 12,6k token lời gọi đầu, 3,6–5k lời gọi sửa.

Không phải lỗi mã, không phải cấu hình bị đổi: Sonnet 5 suy nghĩ rất dài cho việc vẽ lưới ô, và lượt hôm
nay rơi đúng vào loại sửa khó.

## T91 — Nới luật cứng (hướng D của bản phân tích thất bại), Haan 27/09/2026

Bối cảnh: `doc/design/PHAN_TICH_THAT_BAI_MAT_BANG.md` (phát lại 105 vòng của 30 lượt thật: 0 vòng ra mặt
bằng). Haan chọn làm D trước, quyết bốn mục:

1. **Ban công khai theo mặt.** Phiếu đầu bài thay ba câu cũ (mặt đặt ban công / có đua / độ vươn) bằng
   `balconies.required_sides` (mặt BẮT BUỘC), `balconies.optional_sides` (mặt CÓ THỂ), và
   `balconies.projection_by_side` (độ đua từng mặt, m; 0 = không đua — ban công nằm trong sàn; trống =
   chưa trả lời, giữ trong ranh). Mặt không nằm ở hai danh sách thì CẤM ban công (Haan chọn). Đua sang
   đất người khác (nhà hàng xóm, đất trống — Haan chọn) là `nghiem_trong`, chặn lượt chạy ở `brief/gate.ts`;
   đua ra đường, hẻm, ao hồ chỉ cảnh báo. Hợp đồng `design-brief` và `ai-brief-digest` thêm ba trường;
   trường cũ giữ để đọc đầu bài đã lưu. Một hàm đọc duy nhất `balconySides` (`shared/src/design/
   balcony-brief.ts`): đầu bài cũ đọc `sides` là bắt buộc, KHÔNG suy mặt cấm.
2. **Diện tích tối thiểu: ưu tiên sửa, hết cách thì cảnh báo.** (a) Diện tích mô hình KHAI dưới sàn đầu
   bài được nâng lên sàn trước cổng danh mục (`liftToBriefFloors`) — không bác cả vòng vì một con số.
   (b) Bản phác vẽ phòng thiếu sàn: cả tầng còn chỗ bù (phòng lớn hơn mức tối thiểu của nó — sàn đầu bài,
   không có thì `min_m2` của `kb/space_norms.yaml` — hoặc ô trống trong lưới) thì vẫn bác và câu nhắc nêu
   phòng dư; HẾT chỗ bù thì xếp tiếp, tha sàn cho phòng ấy, ghi chú `brief_area_unreachable` «đề nghị sửa
   đầu bài» (Haan chọn: vẫn ra mặt bằng kèm cảnh báo).
3. **Ban công quay ra mặt thoáng** (luật T71, `rules/nvg-mandatory.yaml`): ban công đua ra (ba cạnh
   thoáng) không xét; ban công trong sàn cạnh dài > `long_ratio: 1.5` lần cạnh ngắn mà không quay cạnh dài
   ra mặt thoáng → CHẶN; gần vuông → chỉ lưu ý, và tiêu chí điểm mới **D3** trừ điểm (`kb/plan_quality.yaml`,
   thước nâng lên `score_version: 2`).
4. **Lối vào.** Bếp vào `passage.through` và `stair_opens_to` — khách + ăn + bếp là một khu chung, không
   cần hành lang cứng. Giặt phơi mở từ ban công / sân thượng (`served_from`). Kho từ bếp, gara; gara vào
   phòng khách — đã được phép từ trước (`served_from`, `entry_through`).

Lời dẫn 8.36.0 (câu nhắc ban công ở mặt cấm). Đột biến M70–M74; M28 đổi đoạn tìm (độ đua theo mặt).

**Đo trên 105 vòng cũ:** 3 vòng đi xa hơn (81fd3f57 v1, e7caa832 v2 — hết bác vì một con số; 9d3cc059 v1),
1 vòng lùi (9d3cc059 v2: bếp thành khu đi xuyên, bộ xếp chọn cách chia tầng 1 khác, bếp nằm dưới WC tầng
2). Vẫn 0 vòng ra mặt bằng: các lượt cũ dùng đầu bài CŨ nên mục 1 chưa có tác dụng, và nhóm lỗi lớn nhất
(lối vào, 77 %) là luật «không đi được» — D không chạm tới. Lỗi thật lộ sớm hơn một vòng là lợi ích đo được.

**Việc của Haan:** đầu bài dự án demo đang khai ban công đua 1 m ở cả mặt sau, mà mặt sau là «đất trống»
→ từ nay bị CHẶN cho tới khi sửa phần ban công theo phiếu mới.

## T92 — Hướng C: lộ mọi lỗi trong một vòng, giữ ban công khi chia lại (27/09/2026, Haan: «làm phần C»)

C1 (nâng diện tích khai lên sàn đầu bài) đã làm ở T91.

**C2 — tầng 1 hỏng thì bản phác tầng trên vẫn được SOÁT.** Trước đây `evaluateHouse` dừng ngay khi tầng 1
hỏng: tầng trên cần mốc (thang, khu ướt) của tầng 1 nên không xếp được, và cũng không được soát. Nay tầng
trên chạy `arrangeFor(…, precheckOnly = true)`: chỉ soát bản phác (lối vào, sàn đầu bài), không xếp; lỗi
đi cùng lời bác và câu nhắc, kèm ghi chú `sketch_prechecked`. Đo trên 105 vòng thật: **37/41 vòng hỏng ở
tầng 1 còn lỗi bản phác tầng trên bị che** — mô hình sửa xong tầng 1 mới biết tầng 2 hỏng, mỗi tầng tốn
một lượt gọi. Ví dụ bc504189 vòng 3 trông như «chỉ còn một lỗi» (phòng ông bà 14,91 / 20 m²) nhưng tầng 2
còn ba phòng ngủ không lối vào. (Cổng danh mục hỏng thì vẫn dừng: chưa có danh mục phòng hợp lệ để soát.)

**C3 — chia lại tầng giữ ban công ở mặt bản phác đã vẽ.** Lõi thang đã có bậc ưu tiên từ T73 (`atSketch`).
Thêm bậc thứ ba `balconiesKept` trong `compareRanked`: cách chia mà ban công còn chạm đủ các mặt bản phác
vẽ ban công thắng, dù điểm thấp hơn. Lượt Sol 02982bd7 vòng 3: KHÔNG cứu được — cả 6 cách chia qua cổng
đều đặt `balcony_1` ở mép trái, bộ sinh cách chia không sinh cách nào giữ mặt sau; bậc ưu tiên chỉ chọn
được trong những gì được sinh. Sửa bộ sinh là việc lớn hơn C.

Đột biến M75 (bỏ soát tầng trên), M76 (bỏ bậc ban công). 76 đột biến. Bộ kiểm module 1.193 xanh.

## T93 — Hướng B1 (chương trình tự mở hành lang trên bản phác): làm, đo, GỠ (27/09/2026)

Haan chọn «B1 trước, đo rồi quyết B2». Bộ sửa lấy một dải dọc trọn một cạnh của phòng kề (phòng kề vẫn chữ
nhật, không hụt mức tối thiểu `roomMinimumM2`) làm hành lang mới nối phòng mất lối vào về mạng giao thông
— nhắm đúng 69 % phòng mất lối vào chỉ cách mạng một phòng. Phát lại 105 vòng: mở được ở 11 vòng, số vòng
còn lỗi lối vào không đổi (83), 0 vòng ra mặt bằng → đã gỡ mã, bộ kiểm về 1.193 xanh.

Lý do đo được và phát hiện ngân sách diện tích (mỗi tầng dư 50–70 m² nhưng nằm sai chỗ): xem
`PHAN_TICH_THAT_BAI_MAT_BANG.md` mục 7.4. Kết luận: sửa tại chỗ không đủ; cần bố trí lại có chủ đích — B2.

## T94 — B2 bước 1: chương trình tự thử biến thể trước khi bác — MẶT BẰNG ĐẦU TIÊN (27/09/2026)

Haan duyệt B2 (`doc/design/THIET_KE_B2.md`), không cố định ngưỡng kiểu hành lang. Bước 1 đổi hướng: khuôn
«dải phòng một lớp» không biểu diễn được bản phác thật (dải giữa tầng 1 lượt 02982bd7 có hai hàng phòng
chồng nhau, ô thang xuyên cả hai). Thay bằng **biến thể giữ nguyên tôpô mô hình vẽ**, chương trình tự thử
(`evaluateHouseBest`, `ai/plan.ts`; biến thể ở `ai/plan-variants.ts`):

1. phương án gốc đạt ngưỡng → trả luôn;
2. **chia lại diện tích mục tiêu**: giữ tổng mục tiêu mô hình khai cho tầng, mỗi phòng = mức tối thiểu (sàn
   đầu bài ghép lớn với lớn / diện tích gara theo số xe / mức nghề) + phần dư chia theo tỉ lệ, chặn mức tối
   đa nghề. (Ước sức chứa từ sàn xây được quá bi quan — ra phần dư 0.)
3. **phòng cùng loại cùng tầng cùng mục tiêu** = mức tối thiểu lớn nhất của loại (co cả phòng mô hình khai
   to). Bộ xếp rất nhạy với mục tiêu: phòng ngủ tầng 1 cùng 25 m² thay vì 25 / 15 là đủ để 5aba737d qua.
4. tầng còn hỏng → **chèn dải hành lang 2 ô vào từng đường cắt sạch** của bản phác tầng ấy.

Giữ biến thể tốt nhất (xếp được > không; cùng xếp được → điểm; cùng hỏng → `setbackRank`), nên không bao giờ
tệ hơn gốc; ghi chú `plan_variant` nói biến thể nào; ý định đã biến đổi là ý định gửi lại mô hình. Tuyến
đồng bộ có công tắc `planVariants` (phép thử cơ chế vòng sửa trên câu trả lời ghi sẵn tắt nó).

**Đo trên 105 vòng thật (không gọi mô hình):** gốc 0 mặt bằng → **6 mặt bằng** (5aba737d v1–v3 74,8 / 74,3
/ 74,2 %; 4a521f52 v1 69,3 %; 5fda70dc v1 65,4 %; 4a521f52 v3 56,0 %) — 5 qua ngưỡng; 19 vòng đi xa hơn,
**0 vòng lùi**. Thời gian mỗi vòng: trung vị ~1 s, lớn nhất ~8 s (Workflow có trần CPU mỗi bước — cần canh
trên production). Phép thử `ai-plan-variants.test.ts`; đột biến M77–M79.

### T91 sửa (27/09/2026) — ban công chỉ «vượt ranh» khi độ đua lớn hơn khoảng lùi

Haan chỉ ra cảnh báo sai: đầu bài demo khai ban công mặt trước và bên trái đua 1 m, phép soát báo «phía
trên đường, hẻm» — nhưng mặt trước còn khoảng lùi 4 m, bên trái 3 m: ban công vẫn trong đất nhà mình. Lỗi:
phép soát chỉ nhìn hiện trạng phía ấy, bỏ qua khoảng lùi. Sửa: độ đua đo từ MẶT NHÀ; mặt nhà cách ranh đất
bằng số lớn hơn giữa khoảng lùi quy hoạch (`site.setback_required_m`) và chiều sâu sân mong muốn
(`massing.yard_depth_m`). Chỉ phần đua VƯỢT khoảng lùi mới ra khỏi đất: sang đất người khác → chặn; ra
đường, hẻm, ao hồ → cảnh báo; không vượt → im lặng; chưa khai khoảng lùi mặt ấy → cảnh báo «chưa rõ», không
chặn. Nhãn ô trên phiếu đổi thành «Ban công đua ra khỏi mặt sàn». Soát lại đầu bài demo hiện hành: không còn
cảnh báo ban công nào.

### Lượt thật GPT-6 Sol 3e0f5e46 dưới T84–T94 (27/09/2026, Haan cho phép)

Sáu lời gọi, **0,422 USD**. Không ra mặt bằng. Runtime sạch. (Trước đó cùng buổi, ngoài phiên này: một lời
gọi Gemini bị từ chối và một lượt GPT-5.6 Luna a7e07223, 0,053 USD, hỏng ở tầng 1.) Tổng chi 25–27/09 ước
**5,86 USD**.

Tiến bộ đo được: **tầng 1 qua ở cả 6 vòng** (trước T94 chưa lượt nào như thế); vòng 2–4 (có biến thể chương
trình) tầng 2 chỉ còn MỘT lỗi — một phòng ngủ vẽ hụt ~11 % (13,4 / 15; 15,13 / 17 m²) bị bác ở phép kiểm
bản phác trước khi xếp (ngưỡng `area_slack_ratio` 0,1). Thử nới riêng ngưỡng ấy lên 0,2 (T95): phát lại 111
vòng tiến 1, lùi 0, vẫn 6 mặt bằng — nới xong thì lộ lỗi nằm sau (phòng thờ, giặt phơi không lối vào). Không
có lợi đo được → đã gỡ. Chỗ còn chặn tầng 2 lượt này vẫn là giao thông (vòng 1, 5, 6: phòng không lối vào,
chong chóng) — mô hình vẽ tầng 2 nhiều phòng (5 phòng ngủ + thờ + làm việc + giặt) vào một khối 12 × 16 ô.

Ghi nhận vận hành: `evaluateHouseBest` chạy biến thể ĐỒNG BỘ trong isolate — lúc bước xếp đang tính, API
dev không trả lời được một yêu cầu kiểm sức khoẻ trong 5 s. Trên production cần canh thời gian bước và
việc màn hình hỏi trạng thái trong lúc ấy.

### T96 (27–28/09/2026) — Haan xem sáu mặt bằng đầu tiên: lỗi nghề, không phải lỗi diện tích

Haan xem sáu mặt bằng T94 và kết luận: «diện tích không phải là vấn đề lớn… thậm chí dư». Ba lỗi chỉ ra:
WC phòng ngủ chính nằm ngay trên cửa vào phòng khách (5aba737d); hành lang 10 m² chỉ để vào kho 3 m², kèm
giếng trời không ai yêu cầu (4a521f52); vào phòng khách từ cửa chính phải qua bếp và phòng ăn (5fda70dc). Và
một tờ vẽ vách ngăn giữa phòng khách và lối đi — «không cần thiết và làm bí không gian».

**Chẩn đoán.** Ba lượt ấy ghi từ 19/09, trước khi mô hình vẽ bản phác: bố cục là của BỘ XẾP (vùng mặc định
theo loại phòng), mô hình chỉ góp danh mục và quan hệ. Lượt Sol 3e0f5e46 có bản phác thì tầng 1 ra nghề
(gara và khách trước, hành lang giữa có thang, ông bà một bên, ăn và giúp việc bên kia, bếp – WC – kho dồn
sau); tầng 2 hỏng liên thông và phòng thờ giáp WC. Nên câu trả lời cho «mô hình suy luận kém?» là: mô hình
có tư duy phân khu nhưng không giữ nổi liên thông trên hai lưới ~30 phòng; còn lỗi Haan thấy nằm ở chương
trình — bộ xếp không có ý niệm công năng, thước chấm chia đều năm nhóm nên nhóm diện tích và hình dáng bù
được cho một tầng đi lại tệ (D1 = 0, E2 = 0, C7 = 0,24 vẫn qua 65), và cổng danh mục bác phòng thiếu chứ
không bác phòng thừa (câu dẫn chiến lược còn gợi «light well»).

**Quyết định của Haan.** (1) Thước chấm theo tư duy kiến trúc sư lâu năm, không tiêu chí cứng nhắc; (2) chặn
ngay từ lúc gọi mô hình những gì đầu bài không hỏi; (3) sửa bộ xếp; (4) lượt phản biện của mô hình — chưa
cần.

**Làm.**

1. *Thước 3* (`kb/plan_quality.yaml`, `score_version: 3`): trọng số TRONG nhóm khai ở từng tiêu chí
   (`weight`, vắng = 1 — A3 phòng thờ và C1 xuyên phòng ngủ nặng 2, A6 phòng rộng hơn định mức nhẹ 0,5);
   sàn theo nhóm `accept_group_floor_percent: 40` (một nhóm dưới sàn là dưới ngưỡng, dù tổng qua 65; không có
   ngưỡng tổng thì không có sàn); ba tiêu chí mới, đều là điểm chứ không phải luật: **C9** số phòng không phải
   lối đi phải xuyên từ cửa chính tới phòng khách (sảnh, hành lang, chỗ để xe không tính — nhà phố vào qua gara
   là nếp), nặng 2; **C10** hành lang từ 4 m² mà mở cửa vào chưa tới hai phòng ngõ cụt (ô thang có tính);
   **E5** khu ướt tầng trên đè lên phòng nhóm `dry_below` tầng dưới (khách, ăn, bếp, ngủ, thờ, sảnh, bán hàng)
   từ 30 % diện tích, nặng 1,5. Nhóm `wet`, `dry_below` thêm vào từ vựng. Câu nhắc C9/C10/E5 cho lượt sửa.
   Bậc xếp hạng thứ tư của bộ xếp: phòng ngoài trời ra được mặt thoáng — thước mới đổi thứ hạng theo điểm và
   một cây có ban công thọc vào giữa nhà từng thắng (phát lại 9cce001a).
2. *Không bịa thêm* (`kb/brief_fidelity.yaml` `only_when_asked`: giếng trời, sân trong, sân thượng, cửa hàng,
   thang máy): «có hỏi» = dòng không gian yêu cầu, một dòng đòi hỏi (bác hay cảnh báo) có loại ấy, hoặc khai
   thang máy; thêm dòng `san_trong` (sân trong → sân trong / giếng trời, không bác). Cổng danh mục bác; câu dẫn
   chương trình và cả nhà dặn rõ; chiến lược AI-A/AI-B không gợi giếng trời nữa (lời dẫn 8.37.0, tỉa dưới
   trần 4.900 ký tự). Phát lại lượt cũ tắt cổng này (ý định ghi trước T96).
3. *Bộ xếp.* (a) Khu đón khách của không gian mở quay về phía cửa vào — phòng kề loại `reception_from` (sảnh
   ngoài, chỗ để xe, hành lang), không có thì mặt đường — trước cả quy tắc bếp xa phòng yên tĩnh; một nguồn
   `mergedZoning` cho cả tờ vẽ lẫn luật bắt buộc. (b) Ban công khép kín và WC khép kín không chung một dải:
   ban công lấy dải ở mặt thoáng, WC / tủ dải ở cạnh khác, phòng mẹ đứng giữa; khu ướt áp mặt tiền bị phạt
   (`wetFront`). (c) Khách / ăn kề lối đi (`passage.open_flow`) nối bằng ô thông SUỐT vách — cả cửa bộ xếp
   khai lẫn cửa chương trình thêm.

   (d) Cổng bắt buộc của bộ xếp chia lại khu của không gian mở tầng DƯỚI theo WC của chính ứng viên đang xét
   (`belowRooms`, `wetRects`) — khu bếp dời khỏi chỗ WC đè khi thứ tự khu còn đổi được, đúng cách tờ vẽ sẽ
   chia; trước đó khu bếp bị ghim từ lúc xếp tầng 1 và việc đảo khu khách về phía sảnh làm 4a521f52 vòng
   2–3 mất phương án chỉ vì nhãn.

**Đo (phát lại 111 vòng thật, không gọi mô hình; đối chứng là cùng mã với mọi thay đổi T96 tắt).**
Từng thay đổi bật riêng: thước 3 tiến 1 lùi 2 (+1 mặt bằng); bậc «ban công ra mặt thoáng» 0/0; ô thông suốt
0/0; khu khách về phía sảnh tiến 1 lùi 1 (+1); dải kép ban công / WC ở MỌI ô tiến 17 lùi 11 (+1 mặt bằng
02982bd7, −1 bản 56 % dưới ngưỡng) nhưng nhân đôi việc tìm cây (phát lại T94 6 s → 28 s, vitest báo «Timeout
calling onTaskUpdate») → thu về đúng ca dải chung đặt WC / tủ áp mặt tiền; phạt khu ướt áp mặt tiền 0/1 — giữ
(nhỏ, đúng chỗ Haan chỉ, soát bằng mắt). Thử thêm rồi GỠ: phạt «khu ướt đè bếp tầng dưới» trong bộ xếp — 5 mặt
bằng, mất 02982bd7 (không có lợi đo được).
Bản cuối: **6 → 7 mặt bằng** (4a521f52 v1–v3 70,7 / 69,9 / 69,9; 5aba737d v1–v3 77,4 / 73,0 / 76,3; 5fda70dc
v1 71,1 — đều qua 65 và sàn nhóm), **4 vòng tiến, 2 lùi** (0c86c0b1 v1–v2: thước mới chọn cây tầng 1 khác
lượt ghi, bản phác tầng 2 ghi sẵn không còn khớp — cùng hiện tượng ở phát lại 4198d692). Trung vị 1,2 s/vòng,
lớn nhất ~24 s (canh trần CPU bước Workflow). Soát bằng mắt bảy tờ vẽ lại: 5fda70dc
vào khách từ sảnh, bếp và phòng ăn lùi sâu — đúng ý Haan; 5aba737d WC phòng ngủ chính rời mặt tiền nhưng vẫn
nằm trên phòng khách, nay E5 trừ điểm (bộ xếp đặt WC theo dải, chưa đặt được ở góc phía hành lang).

Đột biến M80 (cổng không bịa thêm), M81 (sàn nhóm). Phép thử: `plan-score` (C9/C10/E5, sàn, trọng số),
`ai-program` (bịa / có hỏi), `ai-arrange-doors` (ô thông suốt), `ai-plan-check` (khu đón khách, bếp tránh
WC trên), `ai-design-steps` (sàn nhóm gọi sửa). Các bài phát lại cơ chế vòng sửa ghim ngưỡng tổng và tắt cổng
«không bịa thêm» như lúc ghi (ý định ghi trước T96). Mã chết `ai/bands/build.ts` (B2 bước 2, đã thay bằng biến
thể T94, không ai nhập) gỡ luôn.

**Còn mở:** (4) lượt phản biện của mô hình trên đồ thị phòng – cửa (Haan: chưa cần); WC khép kín ở góc phía
hành lang thay vì dải trọn cạnh; mô hình vẫn vẽ tầng 2 hỏng liên thông (3e0f5e46) — B2 bước 3 cho tầng trên.

### T97 (28/09/2026) — Lượt thật đầu tiên sau T96 hỏng vì chương trình, không vì mô hình

Haan cho chạy một lượt thật (5584bf0d, GPT-6 Sol, lời dẫn 8.37.0, đầu bài demo đã sửa ban công 26/09): ba
lời gọi, 0,35 USD, THẤT BẠI. Vòng 1: tầng 1 xếp được, tầng 2 phòng thờ và phòng làm việc không có lối vào — đúng
việc của mô hình. Vòng 2 và 3 mô hình chỉ sửa tầng 2 như được dặn, nhưng cả hai vòng đều bị bác ở **tầng 1** —
tầng chương trình vừa nói «passed every check and is kept exactly as it is». Phát lại ba vòng ghi bằng client giả
ra đúng số phận ấy; hai nguyên nhân, đều ở chương trình và đều có từ T86:

1. **`mergeRevision` gộp phòng theo MÃ, không theo tầng.** Mô hình đặt hành lang mới của tầng 2 là
   `circulation_1`, trùng mã hành lang tầng 1; phòng tầng giữ trùng mã bị bỏ, hành lang tầng 1 biến mất và bốn
   phòng quanh nó thành «không có lối vào». Sửa: mã của tầng giữ là bất khả xâm phạm — phòng mới trùng mã đổi
   sang mã trống (`type_n` chưa ai dùng), đổi cả trong bản phác và quan hệ của câu trả lời (`renameHouse`); cửa
   chính / chỗ để xe mang mã của tầng giữ vẫn trỏ về tầng giữ.
2. **`replaceKeptSketches` (T86) vẽ lại tầng đã chia thành bản phác 12×16 ô là phép làm tròn.** Phòng ngủ 20 m²
   co còn 18 ô ≈ 15–17 m², vòng sau cổng T92 bác vì dưới sàn đầu bài. Sửa: bản phác vẽ lại phải xếp lại được
   đúng tầng ấy (cùng chương trình, mốc và ý định đã dùng — `arrangedWith`), không có lỗi và không bị chia lại
   lần nữa; không qua thì giữ bản phác cũ của mô hình — bộ xếp tất định nên chia lại vẫn ra cùng cách chia.

Lượt 5584bf0d ghi thành fixture (digest suy từ `design_brief` 4b29326e bằng `digestOf`); bộ phát lại nay truyền
`keep` (tầng đã qua) như đường chạy thật. **Phát lại 114 vòng:** 7 → 8 mặt bằng, 5 vòng tiến, 1 lùi (5584bf0d
v3 — vòng 3 ghi trên gốc vòng 1, phát lại ghép lên vòng 2 đã qua nên không còn nghĩa). 5584bf0d **vòng 2 qua với
66,6 điểm** — tức mô hình đã sửa đúng tầng 2 ngay vòng 2; lượt thật đáng lẽ đã lưu ở đó. Nhóm E của bản ấy 20 %
(E2 = 0, E5 = 0,33: WC phòng ngủ chính trên góc phòng khách), dưới sàn 40 %, nên lượt thật sẽ còn dùng vòng sửa.
Ba vòng khác tiến nhờ (2): 5a142183 v4–v6 (tầng 1 không còn bị bác vì phòng co), c8cefafc v4.

Đột biến M82 (gộp trùng mã), M83 (bản phác vẽ lại không soát). Phép thử: `ai-revision-rounds` (trùng mã → mã
trống, cửa chính giữ tầng giữ), `ai-revision-keep` (bản phác vẽ lại không qua kiểm thì giữ bản cũ). Vướng mắc
V-34 mở và gỡ trong ngày.

**Còn mở:** như T96; thêm — bản phác vẽ lại co diện tích thì có nên vẽ lại ở lưới mịn hơn thay vì bỏ (chưa cần:
bỏ là đủ để vòng sau đi tiếp).


### T97 đính chính (28/09/2026) — sửa (2) nằm sót ở dạng đột biến; cả tám mặt bằng dưới sàn nhóm E

**Sửa (2) của T97 không có trong mã.** `replaceKeptSketches` nhận tham số `verify` nhưng dòng cuối vẫn là
`return { ...sketch, rows };` — đúng nguyên văn đột biến M83. Một lượt `mutation-proof` bị giết cứng
(SIGKILL không qua `finally`) đã để đột biến lại trong `ai/plan.ts`; phép thử T97 ở
`ai-revision-keep.test.ts` đỏ từ lúc ấy. Hệ quả: phát lại 5584bf0d vòng 2 bị bác ở tầng 1 («bedroom_1 chỉ
đủ 17,02 m²») thay vì qua 66,6. Đã trả lại dòng `verify(...)`. Cùng đợt: đột biến M65 có chuỗi `find` cũ
(lời gọi `replaceKeptSketches` đổi sang nhiều dòng từ T97) nên không cài được nữa — đổi sang cắt ngay đầu
hàm (`if (!redraw.size …) return intent;` → `return intent;`). Kiểm bằng tay: M65, M83 đều làm
`ai-revision-keep.test.ts` đỏ. Quét cả 83 đột biến: không còn đột biến nào khác sót trong mã.

**Sàn nhóm E chặn cả tám mặt bằng.** Bộ phát lại cố ý tắt sàn nhóm (`acceptGroupFloorPercent: null` ở
`ai-real-context.ts`), nên câu «đều qua 65 và sàn nhóm» ở T96 chưa từng được đo. Đo lại tám mặt bằng phát
lại có (sàn 40 %):

| Lượt / vòng | Điểm | Nhóm E | E2 (giá trị) | E5 (giá trị) — phòng bị nêu |
| --- | --- | --- | --- | --- |
| 4a521f52 v1 | 70,7 | 20 % | 0 (0,5) | 0,33 (0,67) — wc_3 trên bedroom_1, bedroom_2 |
| 4a521f52 v2, v3 | 69,9 | 20 % | 0 (0) | 0,33 (0,67) — wc_4 trên living_1 |
| 5584bf0d v2 | 66,6 | 20 % | 0 (0,5) | 0,33 (0,67) — laundry_1 trên bedroom_1 |
| 5aba737d v1–v3 | 77,4 / 73,0 / 76,3 | 20 % | 0 (0,5) | 0,33 (0,67) — laundry_1 trên bedroom_2 |
| 5fda70dc v1 | 71,1 | 20 % | 0 (0) | 0,33 (0,67) — laundry_1 trên bedroom_2 |

E4 không chấm được ở cả tám (không bản nào khai hộp kỹ thuật), nên nhóm E chỉ còn E2 và E5. E2 dùng thang
`zero: 0.5`: một nửa số WC tầng trên chồng lên WC tầng dưới là 0 điểm; cộng thêm cách đo khoảng cách TÂM
(V-30), E2 = 0 ở mọi bản. Trên lượt thật, cả tám bản đều sẽ bị gọi sửa vì nhóm E. Mà vị trí WC / giặt tầng
trên do bộ xếp đặt theo dải, không chắc mô hình sửa được bằng câu nhắc E2 / E5. Ghi ghi chú T97 «E5 = 0,33:
WC phòng ngủ chính trên góc phòng khách» cũng nhầm: ở 5584bf0d v2 phòng bị nêu là phòng giặt trên phòng ngủ
tầng 1; WC phòng ngủ chính (wc_3) nằm trên gara — E5 không trừ, E2 trừ.

Chờ Haan chọn hướng (Q-54 ở «Câu hỏi chờ Haan» của tờ tiến độ).

## T98 — Hướng (a) của Q-54: bộ xếp tránh khu ướt đè phòng ở — làm, đo, GỠ (28/09/2026, Haan: «làm a»)

Ba thay đổi, đều ở chương trình, không đổi thước:

1. **Chấm liên tầng khi chọn cây.** `rank` chấm ứng viên tầng trên bằng thước trên RIÊNG tầng ấy, nên E2 / E5
   (cần tầng dưới) không bao giờ vào lựa chọn. Thêm: chấm lại trên cặp (tầng dưới đã xếp + ứng viên), cộng
   các tiêu chí bản một tầng không chấm được, đúng trọng số thước.
2. **Phòng giặt vào bước dời khu ướt về trục** (`stackWetRooms`, đường bản phác): trước chỉ WC / lavabo
   (loại dùng cửa vệ sinh); thêm nhóm `wet` của từ vựng.
3. **Phạt khu ướt đè phòng ở tầng dưới** trong `pack.ts` (nhóm `dry_below`), tỉ lệ với phần diện tích bị đè,
   không ngưỡng.

**Đo (phát lại 114 vòng, đối chứng là cùng mã với ba thay đổi tắt):** 0 tiến, 0 lùi về số mặt bằng; nhóm E
của cả tám bản y nguyên (20 %, một bản 0 %); sáu vòng hỏng đổi số lỗi, lẫn cả hai chiều. Tăng trọng số phạt
(3 → 10 → 30) không dời được phòng giặt của 5aba737d. → **Gỡ cả ba.**

**Vì sao không có lợi — đây là phát hiện đáng giữ.** Nhật ký bộ xếp của 5aba737d vòng 1: tầng 2 dựng 131–135
khung mỗi vòng, gần như tất cả bị cổng bác (phòng không cửa, không đi tới được, ban công không ra mặt thoáng,
phòng thờ giáp WC); cây qua cổng đếm trên đầu ngón tay và cả ba cây của vòng thắng đặt phòng giặt / WC đúng
một chỗ. Tầng 2 của 5584bf0d vòng 2 cũng vậy: bản phác hỏng ở `sketchTrees`, rơi về xếp theo vùng. Tức là
**chỗ đặt khu ướt tầng trên do VÙNG trong ý định của mô hình quyết**, bộ xếp không có phương án thứ hai để
chọn — chấm đúng hay phạt nặng đều không đổi gì. Ví dụ cụ thể: phòng giặt 5aba737d nằm trọn trên phòng ngủ
tầng 1 trong khi ngay cạnh là dải hành lang tầng 1 chạy suốt chiều sâu — một kiến trúc sư sẽ dời sang đó,
nhưng bộ xếp không dựng được cây nào như thế mà vẫn qua cổng lối vào.

Chỉ riêng E5 đạt (không đụng E2) là nhóm E lên 60 %, qua sàn — nên đòn bẩy thật nằm ở (i) lời dẫn: câu dặn
bản phác hiện nói WC chung chồng WC tầng dưới, chưa nói phòng giặt và chưa nói «không đè phòng ở tầng dưới»
(câu ấy chỉ có trong câu nhắc sửa E5) — đo phải gọi mô hình; hoặc (ii) thước / sàn (hướng b, c của Q-54).

## T99 — Lời dẫn 8.38.0: phòng giặt chồng khu ướt, khu ướt không đè phòng ở tầng dưới; lượt thật 5bc280ff (28/09/2026, Haan cho phép)

Sau T98 (bộ xếp không có cây thứ hai để tự dời khu ướt), đòn bẩy còn lại là bản phác của mô hình. Câu dặn bản
phác đổi thành: «a shared wc or laundry over a wet room or shaft below unless impossible, an en-suite wc as near it
as its bedroom allows; no wc or laundry over a living, dining or bedroom below» (bếp / phòng thờ đã có ở luật 8).
Trần độ dài lời dẫn 4.900 → 5.000 ký tự (`token-diet.test.ts`, lý do ghi tại chỗ).

**Lượt thật 5bc280ff** (GPT-6 Sol, mức suy nghĩ mặc định, một phương án, cùng đầu bài 4b29326e với 5584bf0d):
sáu lời gọi, **0,524 USD** (vượt ước lượng 0,35 USD tôi báo trước: vòng sửa tối đa là 5, tôi đã không tính
đủ). **Lưu được một mặt bằng: 85,2 điểm** — cao nhất từ trước tới nay (A 92, B 100, C 95, D 67 %) — nhưng
nhóm E 20 %, dưới sàn, nên gắn cờ dưới ngưỡng.

- Vòng 1–2 tầng 2 hỏng (phòng không lối vào; phòng ngủ chính hụt sàn đầu bài). Vòng 3 xếp được (tầng 2 rơi về
  xếp theo vùng vì bản phác chong chóng).
- **Phòng giặt nằm trên gara** — lần đầu tiên trên mọi lượt đo; các lượt cũ phòng giặt luôn đè phòng ngủ. Một
  mẫu, chưa phải kết luận, nhưng đúng hướng câu dặn mới.
- WC phòng ngủ chính `wc_4` vẫn đè phòng ăn tầng 1; `wc_3` trên gara (E5 sạch) nhưng không trên WC nào. E2 = 0,
  E5 = 0,67 (điểm 0,33).
- Vòng 4–6 (gọi sửa vì nhóm E) đều hỏng, và lộ ra **lỗi của chương trình**: câu nhắc E2 / E5 không nêu tầng,
  mà lời dẫn sửa nói «a problem naming no storey means every storey» — mô hình vẽ lại CẢ HAI tầng (30 phòng),
  hỏng ở thang máy / thang bộ không chung hành lang. Phát lại thử giữ tầng 1 và chỉ lấy tầng 2 của câu trả lời:
  vẫn hỏng (tầng 2 vẽ theo tầng 1 mới của chính nó), nên lượt này không đo được lợi của việc sửa. Chưa sửa.

Lượt ghi thành fixture `ai-run-5bc280ff.json`; phát lại tái hiện đúng 85,2 và nhóm E 20 %.

**Còn mở:** (1) câu nhắc E2 / E5 nêu tầng trên và giữ tầng dưới — chỉ đo được bằng lượt thật; (2) nhóm E vẫn là
chỗ chặn duy nhất của bản tốt nhất từ trước tới nay — E2 (V-30) và sàn nhóm (Q-54 b, c) vẫn chờ Haan.

### Lượt thật 6bbc6d0e (28/09/2026, Haan tự chạy, lời dẫn 8.38.0) — và điều hai lượt cùng cho thấy

Sáu lời gọi, **0,531 USD**, THẤT BẠI. Tầng 1 qua từ vòng 2 và được giữ; tầng 2 hỏng cả sáu vòng vì giao thông:
phòng không lối vào (vòng 1–3), phòng làm việc hụt sàn 9,24 / 13 m² mà không phòng kề nào nhường đủ (vòng 4–5),
cuối cùng phòng ngủ không cửa và ban công lấy cửa từ ô thang. Phát lại (fixture `ai-run-6bbc6d0e.json`) ra
đúng số phận ấy — đây là điểm yếu đã biết của mô hình ở tầng trên (T96: B2 bước 3), không phải lỗi mới.

**Câu dặn T99 có tác dụng trên BẢN PHÁC.** Đếm ô: ở cả hai lượt, mọi vòng, mọi WC tầng 2 mô hình vẽ nằm trọn trên
ô WC tầng 1 (4 / 4 ô); phòng giặt trên WC (6bbc6d0e) hoặc trên bếp (5bc280ff). Vậy mà bản 85,2 của 5bc280ff ra
E2 = 0: bản phác tầng 2 của nó bị cổng bác (chong chóng), chương trình **xếp lại theo vùng và nới cả vùng**
(`sketch_fallback`, `arrange_relaxed`), nên vị trí WC mô hình vẽ đúng trục bị bỏ. Chỗ làm hỏng nhóm E của bản
tốt nhất nằm ở đường dự phòng của CHƯƠNG TRÌNH. Hướng tiếp: khi rơi về xếp theo vùng, giữ khu ướt tại ô bản phác
như một mốc (giống ô thang), đo bằng phát lại hai lượt này — không cần gọi mô hình.

Chi phí hai lượt T99: 0,524 + 0,531 = **1,055 USD**.

## T100 — Giữ chỗ mô hình đặt khu ướt / bếp / phòng thờ khi bộ xếp phải xếp lại (28/09/2026, Haan: «làm như đề xuất», kèm lưu ý hướng phòng thờ / bếp)

Haan: «đầu bài nói chung sẽ có thể xếp hướng cho phòng thờ hoặc phòng bếp, nên khi sửa / xếp lại phải chú ý điều
này». Hướng ấy hiện vào đầu bài dưới dạng CÂU CHỮ (`household.feng_shui_notes`, `amenities` của dòng không gian) —
chương trình không đọc được, chỉ mô hình đọc và thể hiện bằng CHỖ đặt phòng. Nên chỗ nào chương trình tự xếp lại
mà bỏ chỗ mô hình đặt là chỗ lời gia chủ bị bỏ âm thầm.

Ba cách đã thử, đo bằng phát lại 126 vòng (thêm hai lượt T99), bật / tắt:

1. **Khoét ô bản phác** cho WC, giặt, bếp, phòng thờ khi rơi về xếp theo vùng (cùng cơ chế ô thang) — cả nhóm,
   rồi từng phòng một. 0 tiến 0 lùi; thời gian gấp đôi. Nhật ký: mỗi ô khoét thêm đường cắt suốt tầng, phòng ngủ
   chính thành dải 2,89 × 9,49 m, các phòng khác hụt sàn đầu bài. → GỠ.
2. **Giữ vùng cho WC** ở các vòng nới: làm tầng 2 của 5bc280ff vòng 3 không xếp được nữa (mất bản 85,2). → GỠ phần
   WC. (Một lúc tưởng nhầm đây là «đối chứng hỏng»: công tắc đo không nối vào bộ phát lại — ghi lại để phiên sau
   kiểm công tắc trước khi tin đối chứng.)
3. **Giữ vùng cho bếp, phòng thờ** ở các vòng nới (như lối vào, chỗ để xe): 126 vòng y hệt, không tiến không lùi,
   không chậm hơn. **GIỮ** — không có lợi ĐO ĐƯỢC trên các vòng ghi (không vòng nào có bếp / phòng thờ bị vòng nới
   dời đi), nhưng đó là đúng điều Haan dặn và không tốn gì. Nhóm từ vựng `keep_zone` (bếp, phòng thờ); hàm
   `keepsZoneWhenRelaxed`; phép thử `ai-arrange-keep-zone.test.ts`; đột biến M84.

Còn đúng: trên hai lượt T99, mô hình vẽ WC tầng 2 thẳng WC tầng 1 ở mọi vòng, và E2 = 0 của bản 85,2 là do đường
dự phòng. Nhưng đường dự phòng của bộ xếp gần như không có phương án thứ hai (T98) — ép khu ướt về ô bản phác thì
tầng không xếp được. Đòn bẩy thật cho nhóm E vẫn là: bản phác tầng trên của mô hình QUA được cổng (giao thông tầng
trên — B2 bước 3), khi ấy vị trí mô hình vẽ được giữ nguyên.

**Báo Haan:** đầu bài demo khai hướng bàn thờ lệch nhau — ghi chú phong thuỷ «bàn thờ hướng đông», dòng phòng thờ
«hướng đông nam».

### T100 bổ sung — Cảnh báo hướng bàn thờ / bếp khai lệch nhau ngay ở đầu bài (28/09/2026, Haan)

Haan: «phần hướng bàn thờ: nên cảnh báo ngay ở đầu bài để user quyết định». Phép soát `huong_lech_nhau` trong
`checkBriefConsistency` (`shared/src/design/brief-completeness.ts`): đọc chữ «hướng <đông | tây | nam | bắc | đông
nam | …>» ở ô «Yêu cầu phong thuỷ cụ thể», «Điều kiêng kỵ khác» (chỉ mệnh đề nhắc tới bàn thờ / bếp — «cửa chính hướng
nam» không tính) và ô tiện ích của dòng Phòng thờ / Bếp; hai chỗ hai hướng khác nhau thì cảnh báo, nêu hướng nào ở ô
nào, «chọn một hướng và sửa chỗ còn lại — phần mềm không tự chọn thay gia chủ». Mức `canh_bao` (không chặn). Đầu
bài demo hiện đúng cảnh báo «đông» / «đông nam» ở ô «Chỗ chưa nhất quán». Phép thử 5 ca ở `design-brief.test.ts`;
đột biến M85.

### T101 — Đầu bài cảnh báo mọi chỗ hai câu trả lời nói ngược nhau (28/09/2026, Haan)

Haan: «khi đầu bài nhập thông tin mâu thuẫn thì nên có cảnh báo ngay để user sửa, tránh làm bài toán thêm rắc
rối». Rà 98 câu hỏi đối chiếu 39 phép soát đã có; thêm `checkCrossAnswers` (`brief-completeness.ts`), mười phép
soát — đều là hai câu trả lời của cùng một người nói ngược nhau, không phải lời khuyên nghề (T52):

| Mã | Mức | Chỏi nhau giữa |
| --- | --- | --- |
| `loi_vao_mat_khong_tiep_can` | CHẶN | lối vào chính / lối xe ↔ mặt tiếp cận được |
| `tiep_can_mat_giap_nha_xom` | cảnh báo | mặt tiếp cận ↔ hiện trạng mặt ấy là nhà hàng xóm |
| `phong_tho_lech_cach_bo_tri` | cảnh báo | không thờ / thờ chung phòng khách / không có nơi thờ ↔ dòng Phòng thờ |
| `tang_tho_lech_dong_phong_tho` | cảnh báo | tầng đặt nơi thờ ↔ tầng của dòng Phòng thờ |
| `khong_xem_phong_thuy_ma_uu_tien` | cảnh báo | không xem phong thuỷ ↔ phong thuỷ trong thứ tự ưu tiên |
| `co_gara_khong_xe` | cảnh báo | số ô tô = 0 ↔ dòng gara |
| `cua_hang_khong_kinh_doanh` | cảnh báo | không kinh doanh ↔ dòng cửa hàng |
| `ban_cong_chi_mat_tien_lech_mat` | cảnh báo | ban công chỉ mặt tiền ↔ mặt bắt buộc có ban công khác |
| `ban_cong_mat_giap_nha_xom` | CHẶN | ban công bắt buộc ở mặt giáp nhà hàng xóm ↔ không khoảng lùi, không sân mặt ấy |
| `cuc_nong_ban_cong_khong_co` | cảnh báo | cục nóng đặt ban công phụ ↔ không làm ban công |

«CHẶN» (`nghiem_trong`) dừng «AI Design» ở `brief/gate.ts` — chỉ dùng khi theo cả hai câu thì mặt bằng chắc chắn
không dựng được. Soát ba đầu bài đang lưu thật: không bản nào bị chặn nhầm (đầu bài demo chỉ còn cảnh báo hướng bàn
thờ). Phép thử mỗi mã một ca bắt, một ca không bắt nhầm; đột biến M86.

**Bốn cặp có cách hiểu không mâu thuẫn — Haan quyết 28/09/2026:** (a) ưu tiên «chi phí thấp» ↔ hoàn thiện «cao
cấp»: không cảnh báo; (b) máy sấy trong nhà ↔ ban công phơi riêng: «hoàn toàn bình thường, họ muốn sử dụng cả 2» —
không cảnh báo; (c) mặt trước là hẻm ↔ bề rộng đường lớn: không cảnh báo; (d) người đi lại khó khăn ↔ nhà nhiều tầng
không thang máy, không chừa chỗ: «cảnh báo nhẹ, không chặn gì cả» → `di_lai_kho_khan_khong_thang_may` (cảnh báo,
nói rõ nếu người ấy chỉ ở tầng 1 thì bỏ qua).

### Rà soát mã T99–T101 (29/09/2026, Haan yêu cầu, kèm phép thử)

Bốn lỗi thật trong mã mới, đều tái hiện được rồi mới sửa:

1. `co_gara_khong_xe` báo sai «0 ô tô, 2 xe máy»: dòng `garage` trên phiếu là «Chỗ để xe», gồm cả xe máy. Nay chỉ
   báo khi CẢ số ô tô lẫn số xe máy đã khai là 0; câu báo dùng nhãn của phiếu.
2. Phép soát đọc giá trị của ô ĐANG ẨN — phiếu không xoá giá trị khi ô bị ẩn vì đổi lựa chọn phía trên. Ca nặng
   nhất: chưa chọn «Ban công làm tới đâu» mà còn mặt ban công cũ → `ban_cong_mat_giap_nha_xom` CHẶN «AI Design»
   bằng một ô người dùng không thấy để sửa. Nay `shownOf` (cùng `visibleFields` bộ chấm dùng) bỏ qua ô ẩn: mặt
   ban công, tầng đặt nơi thờ, cách bố trí nơi thờ, ghi chú phong thuỷ, khoảng lùi, chiều sâu sân. Nhà phố (không
   có ô khoảng lùi / sân) thì câu chặn không bảo «khai khoảng lùi».
3. `huong_lech_nhau`: «thờ» khớp cả «thời» («thời điểm khởi công hướng tây» thành hướng bàn thờ). Nay khớp trọn từ.
4. `huong_lech_nhau` bỏ sót «bàn thờ, hướng tây» (câu bị cắt ở dấu phẩy). Nay mỗi «hướng X» thuộc phòng được nhắc
   giữa nó và chữ «hướng» trước đó trong cùng câu — «bàn thờ hướng đông, cửa chính hướng nam» vẫn không gán «nam»
   cho bàn thờ.

Phép thử thêm: mỗi lỗi một ca; chữ NFD; phát lại hai lượt thật 28/09 (`ai-live-5bc280ff.test.ts`: vòng 3 của
5bc280ff ra 85,2 và phòng giặt nằm trên gara; 6bbc6d0e hỏng tầng 2 cả sáu vòng; mọi WC chung tầng 2 trên bản phác
nằm trọn trên ô WC tầng 1). Đột biến M84–M86 kiểm tay lại sau khi sửa: đều bị bắt.

**Mở rộng sau câu hỏi «sửa hết P1 P2 chưa» (29/09/2026).** Lỗi «đọc ô đang ẩn» không chỉ ở mã mới: hai phép soát
CŨ cũng chặn «AI Design» bằng ô ẩn (`ban_cong_dua_sang_dat_khac` khi đã chọn «không làm ban công» mà còn độ đua cũ;
`tang_kinh_doanh_vuot_so_tang` khi đã chọn «không kinh doanh» mà còn số tầng cũ), và — nặng hơn — **bản gửi mô hình**
(`anonymiseForAi`) chép nguyên câu trả lời của ô ẩn: nhà phố từng tạm khai là biệt thự mang khoảng lùi hai bên vào
khối xây dựng được mà không ai thấy. Sửa gốc một chỗ: `withoutHiddenAnswers` (`shared/src/design/brief-form.ts`)
bỏ câu trả lời của ô ẩn, lặp tới khi ổn định (ô ẩn kéo theo ô ẩn), không sửa đối tượng gốc; áp cho TOÀN BỘ
`checkBriefConsistency` và cho `anonymiseForAi` (theo điều kiện của biểu mẫu gốc; giữ chiều rộng / chiều sâu vì
thửa đa giác tự dựng chúng và hợp đồng bắt buộc). Soát ba đầu bài đang lưu: không bản nào mất câu trả lời nào, nên
bản gửi mô hình của chúng không đổi. Gỡ `nha_pho_co_khoang_lui_ben` — ô khoảng lùi luôn ẩn với nhà phố nên phép
soát ấy chỉ còn bắt dữ liệu cũ, mà dữ liệu cũ nay không đi đâu nữa. Dữ liệu mẫu nhà phố trong `ai-plan.test.ts` hỏi
giếng trời bằng ô «sân trong» (ô chỉ có ở biệt thự) → đổi sang dòng «Giếng trời» như phiếu thật. Đột biến M87, M88.
