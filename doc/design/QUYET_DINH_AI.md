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
