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

## T102 — Khung xương trước: chương trình dựng lõi + hành lang, phòng lấp quanh hành lang (29/09/2026, Haan: «đưa ra phương án cải tiến, kể cả tái cấu trúc, rồi implement»)

**Chẩn đoán** (lịch sử `design_ai_run`: giai đoạn mặt bằng 13 xong / 64 hỏng; từ T48 tới 28/09: 1 / 17; phát lại 35
lượt ghi, 126 vòng bằng mã hiện tại: **10 vòng ra mặt bằng**, 73 vòng hỏng ở tầng 2, mã hỏng đầu bảng
`sketch_room_no_access` 59, `room_without_door` 23, `door_from_stair` 21, `sketch_stair_isolated` 18). Góc kiến trúc sư:
nghề làm LÕI trước (thang, thang máy, trục ống nước, một chỗ cho cả nhà), rồi HÀNH LANG từ chiếu nghỉ (dải ngang trước /
sau lõi, dải dọc áp lõi, chữ H / T), rồi mới lấp phòng vào các túi quanh hành lang; kích thước sau cùng. Hệ thống bắt mô
hình làm cả bốn bước cùng lúc trên bảng chữ 12 × 16 ô — bước liên thông là bước nó kém nhất, còn chương trình chỉ kiểm
rồi bác, cách cứu duy nhất (chia lại theo vùng) mù về giao thông. Bản thiết kế: `doc/design/THIET_KE_KHUNG_XUONG.md`.

**Đã làm** — `workers/src/design/ai/arrange/skeleton.ts` (mới), nối vào `arrangeLevel` (`index.ts`):

- Bản phác của mô hình vẫn đi TRƯỚC; hỏng (lối vào / sàn ở bước soát, hay không qua cổng) thì **khung xương** dựng lại
  tầng, rồi mới tới các vòng khung cũ. Lỗi bản phác đi cùng câu nhắc (`sketchFailure`, T86 / T90); ghi chú
  `skeleton_arranged`. Bước soát bản phác (T73) trước đây trả lỗi ngay — nay thử khung xương trước, vì khung GIỮ ô lõi
  đúng chỗ bản phác (điều T73 lo khi chia lại).
- Ô cố định: thang (mốc tầng dưới hay ô bản phác tầng 1), thang máy, giếng trời — phải kề thang, xếp thành các cột x liền
  nhau; khe trong cột (thang máy phủ nửa chiều sâu lõi) thành **sảnh chiếu nghỉ**. Thang máy tầng 1 đặt ĐÚNG CỠ (cạnh kỹ
  thuật × sâu đủ diện tích) áp cạnh thang, không giữ ô bản phác vẽ to (lượt 0c86c0b1: 189 × 389 cm cho giếng 1,4 × 1,6).
- Hành lang: dải dọc `V` áp lõi phía trống; dải ngang trước / sau lõi ở ba chế độ `none` / `edge` (áp lõi, phòng một
  hàng) / `mid` (giữa vùng — hai hàng phòng kẹp hành lang, V xuyên hàng trong; cho vùng sâu 7–9 m trước thang). Mọi lá
  `circulation` của tầng là MỘT ngân sách: đoạn lớn nhận mã lớn, thiếu thì thêm không gian (như V-29), thừa thì chia đoạn.
- Phòng: dải trước / sau theo tâm ô bản phác, thứ tự trái → phải; phòng nhỏ (≤ 8 m², không con, không ban công) vào cột
  phụ trợ áp V; phòng ở dải lõi mà không chứa nổi thì đẩy sang dải gần hơn; dải không chứa nổi thì dời phòng nhỏ nhất
  vào túi giữa chạm HF / HB rồi thử lại. WC khép kín = dải dọc một bên phòng mẹ, bên gần trục ống nước tầng dưới (không
  lên bếp / phòng thờ). Ban công: mặt đầu bài BẮT BUỘC trước, rồi mặt bản phác vẽ; áp mặt trước / sau của cột hay mặt bên
  của cột đầu / cuối; dải trong nhà chỉ cần phần đua chưa bù.
- Kích thước: bề rộng cột theo tỉ lệ nhu cầu, không dưới cạnh dùng được, tỉ lệ dùng được và **sàn đầu bài đổi ra theo tim
  với chiều sâu thật của dải** (`needWidth`: lọt lòng ≈ (rộng − tường)(sâu − tường)). Cây ra đi đúng đường
  `emitCandidate → gateCandidates → best`: cổng, cửa, luật T71, thước 3 giữ nguyên. Tối đa 36 biến thể / tầng.
- Bất biến lối vào đo ngay trên ô theo tim (phòng cần cửa chạm hành lang / khu chung / phòng mẹ / loại phục vụ ≥ đoạn
  đặt cửa; ô thang chạm hành lang) — biến thể không đạt bị bỏ trước cổng.

**Đo** (phát lại 35 lượt ghi = 126 vòng, cùng đầu bài biệt thự demo 15 × 20 m, 2 tầng, 24–32 phòng; đối chứng là mã
trước T102 cùng phiên):

| | Ra mặt bằng | Lùi | Vòng đổi kết quả |
| --- | --- | --- | --- |
| Đối chứng | 10 / 126 | — | — |
| Khung xương | **11 / 126** | **0** | 14 |

Vòng thêm: 6bbc6d0e vòng 4 — tầng 2 dựng theo khung (63,6 điểm, dưới ngưỡng 65 nên lượt thật vẫn xin sửa; tầng 1 của
lượt ấy qua nhờ khung ngay vòng 1, trước đây hỏng vì kho không chạm hành lang). Tầng 1 thử khung 655 lần, tầng 2 378 lần.
Phép thử: `ai-arrange-skeleton.test.ts` (nhà phố 4 × 15 không bản phác; biệt thự thang máy kề thang, bản phác hỏng lối
vào; tất định; mã hành lang thêm), `ai-live-5bc280ff.test.ts` cập nhật vòng 4; đột biến M89 (V về phía tường) kiểm tay:
5 / 7 bài đỏ.

**Vì sao tầng 2 biệt thự demo vẫn chưa ra** (lý do bỏ biến thể đầu bảng: dải trước không chứa 5.009, dải sau 1.601 — tổng
bề rộng tối thiểu vượt 12 m khoảng 0–30 %): chương trình phòng tầng 2 ~159 / 192 m² (4 phòng ngủ, học, thờ, 2 WC, giặt, 3
ban công, thang máy) — đặt lên một tầng có hành lang thật thì mỗi phòng chạy suốt chiều sâu dải, ban công 1,2 m và WC
khép kín một bên ăn thêm bề ngang; hai hàng (`mid`) không đủ sâu (7 m trước thang cần ≥ 10,4 m). Bản phác mô hình «vừa»
chỉ vì nó không có hành lang thật (đó là lỗi cổng). Đòn bẩy còn lại, theo thứ tự:

1. **Biến thể lõi cả nhà**: tầng 2 không dựng được với ô thang tầng 1 → thử lại tầng 1 với thang lật sang tường đối diện /
   lùi sâu hơn (`plan-variants.ts`) — khung xương hiện chỉ dựng khi có ô thang cố định.
2. **Ban công đua trong đất nhà**: đầu bài demo ghi «mặt trước và mặt trái đua 1 m vì vẫn trong đất nhà mình» nhưng
   `balconies.projection_over_boundary = false` nên chương trình không đua; đua được thì dải trong nhà còn 0,6 m và dải
   trước vừa. Cần Haan chốt cách đọc (Q-55).
3. Lời dẫn 9.0: bảo mô hình chương trình dựng hành lang, bản phác không cần vẽ `circulation` — đo bằng một lượt thật (xin
   phép riêng).

**Ghép với vòng sửa (T86 / T97).** Tầng dựng bằng khung xương được GIỮ ở lượt sửa như tầng qua nhờ chia lại: bản phác vẽ
lại lên lưới đưa qua `verify` — trước đây đòi bản vẽ lại tự qua cổng, nay chấp nhận cả khi nó lại phải nhờ khung xương (bộ
xếp tất định nên về đúng khung ấy). Phát lại 4198d692 (`ai-live-4198d692.test.ts`) đổi quỹ đạo: tầng 1 câu trả lời 1 được
dựng lại ngay, cả nhà chỉ còn lỗi liên tầng, nên không tầng nào giữ cho tới khi lượt sửa lấy gốc mới (lời gọi 5) — phép
thử cập nhật theo.

## T103 — Ba đòn bẩy sau khung xương: đo, hai cái gỡ, một cái chờ lượt thật (29/09/2026, Haan: «làm tiếp 3 phần đòn bẩy»)

Ba đòn bẩy ghi cuối T102. Mỗi cái đo bằng phát lại 35 lượt ghi = 126 vòng, đối chứng là mã T102 (11 / 126).

**Chẩn đoán lại tầng 2 trước khi làm** (vết `khung t2` của 21.203 lần dựng): lượt 5584bf0d có ô thang tầng 2 nằm
NGANG (5,3 × 2,05 m), dải lõi chỉ sâu 2,05 m, vùng trước sâu 8,35–9,9 m. Khung chỉ xếp một hàng phòng mỗi dải, nên 5
phòng chạy suốt 8,35 m sâu cần ~18 m trên bề ngang 12 m. Hai thử nghiệm theo đúng cách kiến trúc sư sẽ xử:

1. **Hàng giữa** — phòng xếp NGANG cạnh lõi, mỗi phòng mở ra hành lang ngang áp lõi (hành lang hai bên có phòng).
   Không dựng nổi: dải lõi 2,05 m quá nông cho phòng ngủ (cần 19 m bề ngang).
2. **Hai hàng tự cân** — chế độ `mid` (hai hàng kẹp hành lang) trước đây chia phòng vào hàng ngoài / trong cứng theo
   bản phác và chia chiều sâu hai hàng theo trọng số. Thêm: thử mọi cách chia hàng, ít phòng dời nhất trước, và dò
   chiều sâu hàng ngoài ±3 m quanh tỉ lệ. Dựng được thêm vài tầng 2, nhưng cổng bác (phòng ngủ chính 3,34 × 8,89 m
   quá dài; hai chốt tỉ lệ thêm vào thì hết bác mà cũng hết ứng viên).

Kết quả: **11 / 126, không vòng nào đổi thành ra mặt bằng**; chỉ đổi lý do hỏng ở 4198d692 vòng 4–6. **Gỡ cả hai**
(luật T93). Phép thử cho hai chốt tỉ lệ viết xong nhưng gỡ chốt vẫn xanh — không ca nào chạm tới — nên gỡ chốt luôn.
Giữ lại: câu vết «bên lõi rộng … sâu … không đủ cho …» có số, cho lần soi sau.

**Đòn bẩy 1 — biến thể lõi cả nhà (lật gương trái ↔ phải khi tầng trên hỏng): gỡ.** 11 / 126, 0 vòng thêm, 12 vòng đổi
lý do hỏng. Thêm một hại ngầm đo được khi đọc lại luồng: câu lỗi gửi mô hình ở lượt sửa tả bản phác ĐÃ LẬT (toạ độ
«hàng / cột», mặt trái / phải) trong khi mô hình vẽ bản chưa lật — mô hình sẽ sửa sai chỗ. Lật gương không đổi mật độ,
mà mật độ mới là thứ chặn tầng 2.

**Đòn bẩy 2 — Q-55 (ban công đua 1 m trong đất nhà): không đổi mã.** Mô phỏng câu trả lời «mặt trước và trái đua 1 m,
mặt sau 0» trên ba lượt có ghi chú ấy (5584bf0d, 6bbc6d0e, 5bc280ff), mặt phải để «có thể» cho khớp nghĩa đầu bài cũ:
cùng số mặt bằng (3 / 15 vòng), điểm còn giảm (85,2 → 82,8; 63,6 → 58,3). Lưu ý đây là câu trả lời mô hình GHI SẴN, vẽ
khi chưa biết được đua; lượt thật với đầu bài khai đua sẽ vẽ khác. Q-55 vẫn là câu hỏi DỮ LIỆU cho Haan: phiếu T91 đã
hỏi độ đua từng mặt, đầu bài demo chỉ cần khai lại — không suy từ ghi chú tự do (ranh giới «chỉ suy từ câu ĐÃ trả lời»).
Mô tả trường cũ trong `design-brief.schema.json` đã tính «nhô qua chỉ giới xây dựng, trên khoảng lùi» là đua.

**Đòn bẩy 3 — lời dẫn 9.0.0: đổi hướng, chờ lượt thật.** Hướng cũ («chương trình dựng hành lang, mô hình khỏi vẽ») bị số
đo bác: khung cứu tầng 2 ở 1 / 126 vòng, bỏ hành lang khỏi bản phác thì gần như mọi tầng 2 rơi vào khung và hỏng. Đổi
thành dạy mô hình đúng trình tự nghề ngay trong bản phác: câu Access về hành lang nay là «sau ô thang, TRƯỚC các phòng,
vẽ MỘT hành lang (trục, chữ L, chữ T; không mẩu rời) chạm ô thang và mọi phòng mở ra nó». Trần 5.000 ký tự của
`token-diet.test.ts` giữ nguyên — câu mới thay câu cũ, lời dẫn vẫn dưới 5.000 ký tự. Phát lại không đo được lời dẫn (câu trả lời ghi
sẵn); cần một lượt thật cả nhà, gpt-6-sol, 0,35–0,60 USD / lượt theo `design_ai_call` 27–28/09 — chờ Haan cho phép.

**Kết luận cho bước sau:** tầng 2 biệt thự demo không kẹt vì bộ xếp thiếu mẹo mà vì ~159 m² phòng (sàn đầu bài là sàn
cứng) trên 192 m² sàn, ô thang nằm ngang sát sau. Đòn bẩy còn lại nằm ở đầu vào: mô hình đặt ô thang dọc giữa nhà
(chiến lược AI-A), hay dời một phòng xuống tầng 1 — cả hai là việc của lời dẫn / lượt sửa, đo bằng lượt thật.

### T103 (tiếp) — lượt thật 7c6de305: lời dẫn 9.0.0 + đầu bài khai lại ban công (29/09/2026, Haan tự chạy)

gpt-5.6-sol, 6 lời gọi, 0,947 USD, THẤT BẠI. Đầu bài bản 20: ban công trước / trái BẮT BUỘC đua 1 m, sau CÓ THỂ
không đua (Q-55 đã khai theo phiếu T91), bỏ thang máy. Tệp ghi: `fixtures/ai-run-7c6de305.json` (digest dựng bằng
`anonymiseForAi` từ `design_briefs.structured`).

- **Lời dẫn 9.0.0 có tác dụng trên bản phác:** tầng 2 vòng 3 là một trục hành lang liền suốt chiều sâu, phòng hai
  bên áp trục — bản phác gọn nhất trong 36 lượt ghi. Chưa đủ một lượt để nói tỉ lệ, nhưng đúng hướng.
- **Chỗ hỏng của mô hình:** tầng 1 vẽ ô thang 5 hàng tới mép sau, tầng 2 vẽ 4 hàng và đặt phòng giặt vào hàng
  thứ 5; ba lượt sửa (4–6) mô hình không dời được phòng giặt dù câu nhắc chỉ đúng ô.
- **Chỗ hỏng của chương trình — đã sửa:** bản phác tầng 2 hỏng → chương trình chia lại tầng; phòng ngủ chính mang
  WC khép kín + ban công, dải chung đặt ở cạnh SAU phòng → ban công kẹp giữa WC và hành lang, không cạnh nào ra
  ngoài; cổng tầng cho qua (ban công gần vuông chỉ lưu ý), cổng cả nhà bác «thiếu ban công mặt trước». Sửa
  (`pack.ts` `placeItem`): dải chung làm ban công lọt vào trong thì thử thêm hai dải riêng (ban công ra mặt thoáng)
  — trước chỉ thử khi WC bị kéo ra mặt tiền (T96).
- **Đo:** 126 vòng cũ trùng khít (một vòng đổi lý do hỏng, trước sau vẫn hỏng); lượt mới 0 → **2 mặt bằng, 65,8
  điểm** (vòng 3 và vòng 6 — vòng cuối của lượt thật, tức lượt này sẽ thành công). Ba cách khác thử rồi gỡ: chỉ cho
  dải có ban công nằm ở cạnh thoáng (cấm cứng: 5aba737d vòng 1 mất mặt bằng), phạt thêm ban công kín (không đủ
  kéo), cổng chặn ban công không cạnh thoáng (mất 5bc280ff vòng 3, 85,2 điểm); ưu tiên mặt ban công đầu bài khi
  xếp hạng: 0 đổi → gỡ. Phép thử `ai-live-7c6de305.test.ts` (đỏ khi gỡ bản sửa), đột biến M90.

## T104 — Haan chấm mặt bằng lượt thật b1543b8c: bếp – ăn – khách, hành lang, lối lên thang, giặt phơi (30/09/2026)

Lượt b1543b8c (gpt-5.6-terra, Claude chạy theo lệnh Haan, 0,619 USD) lưu mặt bằng 69,6 điểm. Haan chỉ bốn chỗ.
Tệp ghi `fixtures/ai-run-b1543b8c.json`; mọi thay đổi đo bằng phát lại 37 lượt (138 vòng), không vòng nào lùi.

1. **Lối lên thang bị tường bít — sửa (`arrange/doors.ts` `stairEntry`).** Cửa vào thang lấy theo thứ tự đi từ lối
   vào nhà (gặp phòng khách trước) nên nằm giữa CẠNH DÀI; chiều lên tính riêng theo trục nên bậc 1 ở đầu giáp hành
   lang mà vách phía ấy kín. Nay: có phòng giao thông ở ĐẦU NGẮN thì lối vào dời về đó; chiều lên và đầu vách của ô
   mở (`place`, có sẵn từ T53) tính cùng nhau theo bảng `ENTRY_BY_SIDE` để ô mở luôn ở góc bậc 1 (tờ vẽ cho vế đầu
   xuất phát ở góc cố định theo `up`). Phát lại: 0 đổi kết quả, 7c6de305 65,8 → 65,9.
2. **Giặt phơi nên ở góc cuối — sửa (`arrange/open-face.ts`, dữ liệu `passage.open_face_first` / `windowless_ok`).**
   Hai phòng kề nhau trong một chuỗi cắt cùng trục (cùng bề ngang), phòng không cần thoáng (kỹ thuật, kho) chạm NHIỀU
   mặt thoáng hơn phòng giặt → đổi chỗ, mỗi phòng giữ kích thước. Điều kiện ban đầu «phòng giặt không chạm mặt thoáng
   nào» không bắt ca này — cả hai đã chạm mép trái (hẻm); điều Haan muốn là GÓC. Phát lại: b1543b8c vòng 6 68,2 → 69,7.
3. **Khách – ăn – bếp liền hay tách — hỏi từ đầu bài.** Phiếu chưa có câu nào; `merge_allowed` cho gộp cả ba cặp
   với mọi phương án. Thêm `lifestyle.living_dining_kitchen` (hợp đồng `design-brief` + `ai-brief-digest`, mục Gia
   đình và nếp sinh hoạt, trọng số 0): liền thông cả ba / ăn + bếp liền, khách riêng / khách + ăn liền, bếp kín riêng
   / tách riêng cả ba. Bảng `demands.open_plan` (`kb/brief_fidelity.yaml`) nói cặp nào được liền; cặp bị cấm thì lời
   dẫn không liệt kê, quan hệ `open` của mô hình thành `adjacent` (ghi chú `intent_open_forbidden`), cửa là cửa đi —
   không gộp, không ô thông, không bỏ vách (`passage.open_flow` cũng nhường). Chưa trả lời = như cũ. Phép thử
   `ai-open-plan.test.ts` (đối chứng + tách riêng) và phần đầu bài của `ai-live-b1543b8c.test.ts`.
4. **Hành lang tốn diện tích — CHƯA sửa được, gốc đã rõ.** Tầng 1 hành lang 2,44 m theo tim. Gốc: lưới bản phác ~1 m
   mỗi ô, `corridorMinCells` = ⌈(1,2 lọt lòng + tường) / 1 m⌉ = **2 ô ≈ 2 m** — lời dẫn và phép kiểm bản phác đều đòi
   thế, mô hình vẽ đúng như bị đòi. Thử giới hạn trọng số căn vách của hành lang = chiều dài bản phác × (1,2 m + một
   vách): 5bc280ff 85,2 → 87, 0f80cd0b vòng 3 tiến một giai đoạn, NHƯNG mất b1543b8c vòng 6 — phần dư dồn sang cột
   bên cạnh gồm cả ô thang (4,88 → 5,83 m), tầng 2 chồng theo thang ấy và hỏng ban công. Gỡ (luật «không vòng nào
   lùi»). Hướng tiếp: phần dư của hành lang không được dồn vào ô thang (thang giữ đúng chiều dài cần), hoặc lưới bản
   phác mịn hơn cho hành lang — cần Haan chọn.

Đột biến M91 (lối vào thang), M92 (đổi chỗ giặt phơi), M93 (khách – ăn – bếp tách mà vẫn ô thông).

### T104 (tiếp) — Hành lang: Haan chọn hướng (a) và cho khung bề rộng (30/09/2026)

Haan: tối thiểu 900 mm (đoạn giao thông chính không dưới mức này); khuyến nghị 1.000–1.200; hành lang chính 1.200;
biệt thự 1.200–1.500. «Chọn a. Phần dư hoàn toàn có thể chia cho các phòng bên trái hành lang.»

- **Dữ liệu** `kb/construction_norms.yaml` `circulation`: `corridor_min_clear_m: 0.9`, `corridor_max_clear_m`
  (`default` 1,2 · `biet_thu` 1,5); `corridor_clear_m` 1,2 giữ nguyên (bề rộng bộ xếp tự dựng, và sàn không thu
  hẹp dưới nó).
- **Cách làm** (`arrange/corridor-trim.ts`): hành lang dạng DẢI (dài ≥ 3 lần bề rộng mới) nằm trong một chuỗi cắt
  chạy ngang bề rộng của nó, rộng quá trần theo loại nhà → dời vách chung với cụm kề KHÔNG chứa thang / thang máy
  / giếng trời (hai cụm đều tự do thì cụm ở đầu toạ độ nhỏ — bên trái / phía trước); vách trong cụm ấy giãn theo tỉ
  lệ; phòng chạm đầu ngắn hành lang đủ chỗ mở cửa thì sau khi thu hẹp vẫn phải đủ.
- **Áp ở đâu — bài học của lần này:** áp thẳng vào mọi ứng viên mất hai mặt bằng (5bc280ff vòng 3 85,2; 7c6de305
  vòng 6) dù đã chặn mẩu sảnh và đầu ngắn: cửa của cả tầng suy lại theo hình học mới, một phòng ở cụm khác (phòng
  thờ) mất lối vào. Nên thu hẹp là một BIẾN THỂ CẢ NHÀ trong `evaluateHouseBest`: xếp lại cả nhà với cờ
  `trimCorridors`, giữ khi qua cổng, có phòng đổi, và điểm không thấp hơn; ghi chú `corridor_trimmed`.
- **Đo:** phát lại 138 vòng — không vòng nào lùi; 7c6de305 vòng 3 65,9 → 68,9; b1543b8c vòng 6 giữ 69,7 với hành
  lang tầng 1 2,44 → 1,54 m lọt lòng, phòng ngủ 1 rộng thêm 0,9 m. Thời gian phát lại ~5 → 7,5 phút (một lượt xếp
  cả nhà thêm mỗi vòng).
- **Sai số còn lại:** phần thu hẹp làm tròn XUỐNG theo mô-đun 5 cm nên có thể vượt trần một mô-đun (1,54 so với 1,5).
  Làm tròn lên (1,49) thì một ứng viên tầng 1 KHÁC thắng xếp hạng và hành lang của nó không thu hẹp được (còn 2,19) —
  bước chọn ứng viên nhạy tới 5 cm; ghi lại để lần sau xét.
- **Chưa làm:** `corridor_min_clear_m` mới là dữ liệu — cổng chưa báo hành lang dưới 0,9 m (bộ xếp tự dựng 1,2 m nên
  chưa gặp). Phép thử `ai-live-b1543b8c.test.ts`, đột biến M94.

### T104 (tiếp) — lượt thật 894b350d (30/09/2026, Haan tự chạy, gpt-5.6-sol, đầu bài bản 21)

0,795 USD, THẤT BẠI. Đầu bài đã trả lời khách – ăn – bếp: «ăn và bếp liền, phòng khách riêng». Tệp ghi
`fixtures/ai-run-894b350d.json`.

- **Câu trả lời mới KHÔNG tới lời gọi dựng cả nhà — sửa.** `open_pairs` gửi đi đã lọc đúng (còn ăn–bếp, khách–thờ),
  nhưng dòng dặn của `demands.open_plan` chỉ vào lời gọi chương trình không gian; lời gọi dựng cả nhà chỉ đọc đầu bài
  văn xuôi (`brief/narrative.ts`). Thêm dòng «Phòng khách, phòng ăn, bếp: …» vào mục Nếp sinh hoạt; phép thử ở
  `brief-narrative.test.ts`.
- **Chỗ chặn duy nhất: ban công phơi chạm mép phải bằng ĐẦU NGẮN.** Cả sáu vòng mọi tầng đều xếp được; cổng cả nhà
  bác vì `balcony_3` (3,9 × 1 m, cạnh dài quay ra mặt SAU — mặt «có thể») có đầu ngắn chạm mép PHẢI — mặt không khai
  nên là mặt cấm (T91), phía giáp nhà hàng xóm. Tắt riêng phép kiểm ấy thì cả sáu vòng ra mặt bằng (69,1 / 63,7).
  Ba sửa ở bộ xếp (không lấp ô trống sát mặt cấm vào ban công; phạt ban công chạm mặt cấm; đưa vào bậc xếp hạng T92)
  không đổi vòng nào — gỡ. Chờ Haan (Q-57): ban công chỉ chạm mặt cấm bằng đầu ngắn, cạnh dài quay ra mặt được phép,
  có tính là «ở mặt cấm» không.
- Phép thử `ai-plan-variants.test.ts` (phát lại 5aba737d) nâng trần 30 → 90 giây: từ T104 mỗi lượt chọn biến thể xếp
  thêm một lần cả nhà.

## T105 — Q-57: ban công «ở» mặt mà cạnh dài mở ra; quy ước trái / phải (30/09/2026)

**Ban công chạm mặt cấm bằng đầu ngắn (Haan chọn A cho Q-57).** Lượt thật 894b350d: ban công phơi 3,9 × 1 m, cạnh
dài ra mặt sau (được phép), đầu ngắn 1 m chạm mép phải (nhà hàng xóm, đầu bài không khai nên là mặt cấm theo T91).
Cổng cũ tính «chạm mép nào là ở mặt đó» nên bác cả sáu vòng. Nay ban công DÀI (cạnh dài > `long_ratio` = 1,5 lần
cạnh ngắn, đọc lại số của `balcony_on_open_face` trong `rules/nvg-mandatory.yaml`, không khai lần hai) chỉ tính
«ở mặt cấm» khi cạnh dài nằm trên mặt ấy: đầu ngắn áp ranh là tường đặc, không mở ra phía đó. Ban công gần vuông
vẫn tính mọi mặt nó chạm. Áp cho cả cổng mặt bằng (`checkBalconyDemand`) lẫn cổng bản phác
(`checkSketchBalconyDemand`), cùng hàm `shortEndOnly` trong `ai/plan-demands.ts`. Chỉ đổi phép kiểm mặt CẤM; phép
kiểm mặt BẮT BUỘC giữ như cũ (luật T71 đã buộc cạnh dài của ban công dài ra mặt thoáng).

Đo: phát lại 144 vòng — 894b350d cả sáu vòng ra mặt bằng 68,2–69,1 điểm; 138 vòng khác không đổi (15 OK như
trước). Phép thử `ai-brief-demands.test.ts` (bốn ca hình học + bản phác), `ai-live-894b350d.test.ts`; đột biến M95.

**Quy ước trái / phải — đã thống nhất, không đổi.** Trước / sau / trái / phải của đầu bài là **nhìn TỪ ĐƯỜNG VÀO
nhà** (người đứng ngoài đường, mặt hướng vào nhà), đúng câu gợi ý của mục «Hiện trạng bốn phía». Gốc toạ độ ở
**góc trước – trái** nhìn từ đường: `x` chạy dọc mặt tiền từ trái sang phải, `y` đi sâu vào lô. Bản vẽ lật trục `y`
(`draw/units.ts`) nên mặt tiền nằm ở mép DƯỚI tờ giấy, và mép trái tờ giấy chính là bên trái nhìn từ đường. Mặt
đứng mặt tiền dùng cùng gốc `x`. Bản phác gửi mô hình: dòng đầu là mặt đường, cột đầu là bên trái nhìn từ đường
(`kb/ai_design_prompts.yaml`); lời dẫn sửa mặt bằng nói gốc «front-left corner».

## T105 (tiếp) — Haan chấm lượt thật 25fdc90c: ô thang không phải lối đi; gara, kho, hành lang (30/09/2026)

Lượt 25fdc90c (gpt-5.6-terra, Claude chạy theo lệnh Haan, 0,328 USD, 4 lời gọi) lưu mặt bằng 80,7 điểm. Haan đánh
giá cao tầng 2, chỉ bốn chỗ: (1) tầng 2 lên tới bậc 21 là hành lang trước — «đi sang phòng giặt phơi kiểu gì?»;
(2) tầng 1 bậc 1 giáp tường kho, không biết đi lên thế nào; (3) kho nằm giữa gara và phòng khách — gara nên giáp
phòng khách; (4) hành lang tầng 1 rộng 1,95 m (tim tường), vượt khung Haan đặt ở T104. Tệp ghi
`fixtures/ai-run-25fdc90c.json`.

**Bộ phát lại lệch đường thật — sửa (`__tests__/ai-real-context.ts` `loadRun`).** Đường thật chạy `tidyHouse` lên câu
trả lời của mô hình trước khi dùng (mã phòng về chữ thường); tệp ghi lưu câu trả lời thô, và phát lại không chuẩn
hoá. Với 37 lượt cũ không lệch gì (mô hình vốn trả chữ thường), nhưng 25fdc90c trả «GAR», «LIV»… nên phát lại hỏng
cả bốn vòng trong khi lượt thật lưu mặt bằng ở vòng 4. Nay `loadRun` chuẩn hoá — phát lại 25fdc90c vòng 4 ra đúng
80,7. Đột biến M102.

**Ô thang là vế bậc, không phải lối đi — gốc của (1) và (2).** Bước loang cửa (`arrange/doors.ts`) coi ô thang như
một phòng giao thông: tầng 2 mở ô thang ra cả hành lang trước lẫn hành lang sau, và bước dựng cửa
(`tree/openings.ts`) còn tự mở thêm lối thứ hai để «nối» phòng không tới được. Ở sàn tầng, phần ô thang ngoài đầu bậc
là vế đang lên hay chiếu nghỉ lưng chừng — không bước ngang sang phòng bên kia được. Sửa:
- Ô thang là ĐIỂM CUỐI khi loang: tới được từ một phòng giao thông, không loang tiếp; ở tầng trên (xuất phát từ thang)
  chỉ mở MỘT lối, ưu tiên đầu ngắn nơi vế tới (`START_SIDE` theo chiều lên tầng dưới). Ô thông mô hình khai không mở
  lối thứ hai. Đột biến M96.
- Phòng giao thông / khu chung không tới được thì báo (`arrange_no_hub_wall`) — trước đây im lặng, cây sai lọt qua bộ
  xếp rồi bị «chữa» bằng cửa xuyên thang. Đột biến M98.
- Bước dựng cửa không mở lối thứ hai từ ô thang vào một phòng giao thông / khu chung (phòng ngõ cụt như kho cạnh thang
  vẫn được, V-26). Đột biến M97.
- Lối lên chỉ ở cạnh dài (không đầu ngắn nào giáp lối đi, bậc 1 áp tường) là lỗi `stair_entry_long_side` — gửi mô
  hình sửa được, có câu nhắc. Đột biến M99.

Phát lại (148 vòng): 22 → 17 vòng ra mặt bằng khi chỉ bật luật thang. Năm vòng mất (25fdc90c v4, 5584bf0d v2–v3,
5fda70dc v1, 6bbc6d0e v4) đều có phòng chỉ tới được bằng cách đi xuyên ô thang — mặt bằng không đi được ngoài thực
tế, nên giữ luật dù đếm giảm. Lối lên cạnh dài: không mất vòng nào.

**Khung xương cho ô thang đứng giữa nhà (`arrange/skeleton.ts`).** T102 chỉ dựng lõi áp một tường. Nay lõi giữa: dải
dọc V thử cả hai bên lõi, bên kia thành một cột phòng xếp dọc; khối hai hàng (`mid`) chưa dựng cho trường hợp này.
Và ở biến thể `stay`, phòng phụ trợ dải lõi không chiếm cột phụ trợ — nhà phố 4 m cần cả dải 1,6 m cạnh thang làm
hành lang (trước đó phòng sau chỉ tới được qua vế bậc). Cứu lại 5584bf0d v2 (70,1). Đột biến M103, M104.
Thử và GỠ: trả ô thang vừa rời cho phòng bị ô thang ép đè (`forceSketchRect`) — không cứu vòng nào, 5bc280ff v3 tụt
85,4 → 61,5. Lượt 25fdc90c tầng 2 vẫn chưa cứu được: sau khi ép thang về đúng ô tầng dưới, bản phác còn hành lang
vòng qua thang ở hai bên nhưng mỗi dải chỉ một ô (0,86 m), dưới mức hai ô — cần bộ xếp nới dải ấy bằng phần của phòng
ngủ bên cạnh. Ở lượt thật, vòng 4 này nay bị bác ở tầng 2 và mô hình nhận câu nhắc để vẽ lối đi vòng qua thang.

**D2 — phòng ngủ tối hẳn (`kb/plan_quality.yaml`, trừ điểm, không chặn).** Phòng ngủ 18 m² giữa nhà, giáp nhà hàng
xóm, không cửa sổ. D1 trừ theo tỷ lệ nên lọt ngưỡng. D2 đếm phòng ngủ không có cửa sổ ra mặt thoáng và không có cửa ra
ban công; trừ hết từ phòng đầu tiên, nặng 2. Nhà phố không chấm D2 (phòng ngủ phụ lấy sáng gián tiếp — hồ sơ P2 — và
phòng ngủ chính D1 đã đòi; chấm thì một tiêu chí đạt trùng việc làm loãng nhóm D dưới sàn nhóm). Haan chưa nói «bắt
buộc» nên không chặn. Câu nhắc D2 trong lời dẫn 9.1.0. Đột biến M100. Phát lại: 7c6de305 v3/v6 và 894b350d v3/v4
xuống dưới 65 — mặt bằng có phòng ngủ tối, lượt thật sẽ xin sửa.

**C11 — từ gara vào phòng khách (thay cho đổi chỗ kho – gara).** Đổi chỗ riêng hai phòng này không làm được bằng một
phép đổi: gara ở khối trái, kho ở cột giữa chồng với thang và WC, hai phòng khác chiều sâu; thao tác `swap_rooms` của ô
yêu cầu đổi ô nên gara 4,9 × 4 m sẽ rơi vào cột rộng 1,74 m. Điều Haan chỉ là nguyên tắc: từ gara phải vào được phòng
khách / sảnh đường ngắn, trong nhà. C11 đếm số phòng phải đi xuyên từ gara tới phòng khách (sảnh, hành lang, chỗ để xe
không tính); không tới được mà không vòng ra ngoài thì trừ hết. Câu nhắc C11. Đột biến M101. Phát lại: không đổi số
vòng; b1543b8c v6 71,2 → 65,4 (gara xa phòng khách).

**Hành lang tầng 1 (4) — chưa gỡ.** Biến thể thu hẹp hành lang (T104) không được chọn ở lượt này; khi luật thang đổi,
chính ý định đã lưu cũng không qua tầng 2 nên chưa đo riêng được. Để lượt sau.

Lời dẫn 9.0.0 → 9.1.0 (câu nhắc D2, `stair_entry_long_side`, C11). Phát lại cuối: 18/148 vòng (mốc có `tidyHouse`:
22). Phép thử đổi theo quỹ đạo mới, giữ ý canh: 02982bd7 (T90), 5bc280ff (phòng giặt nay trên phòng ngủ — lùi đã
biết, chưa kiểm E5 có trừ đúng phòng ấy), 6bbc6d0e v4, 5cd78ef7, 7c6de305, 8efa35a6, c8cefafc, dc949b49 (T86 — cơ chế còn bài đơn vị).

**Lượt thật 1330ce12 (30/09/2026, gpt-5.6-terra, lời dẫn 9.1.0, 0,564 USD, 6 lời gọi) — thất bại ở tầng 2.** Luật ô
thang chặn đúng: không vòng nào còn đi xuyên ô thang; tầng 1 qua từ vòng 2. Tầng 2 (13 phòng, ~83 % sàn) mỗi vòng
sửa đúng lỗi được báo mà hở chỗ khác; vòng 4 chỉ còn phòng ngủ 4 vẽ 15,1 / 17 m², vòng 5 phòng thờ 7,4 / 10 m². Tệp
ghi `fixtures/ai-run-1330ce12.json`. Thử và GỠ cả hai (phát lại 154 vòng, «không lợi đo được thì gỡ»):
- Nới phòng vẽ thiếu ô bằng một dải của phòng kề (như T79) trước khi bác: không phòng kề nào cùng bề rộng mà còn dư
  (phòng ngủ 4 kẹp giữa phòng ngủ chính rộng hơn, ô thang và hành lang chạy suốt) — 0 vòng đổi.
- Cho bộ xếp dựng đúng bố cục bản phác theo diện tích mục tiêu khi lỗi duy nhất là thiếu ô: tầng 1 của lượt này qua
  ngay vòng 1, nhưng vòng 4–5 tầng 2 vẫn hỏng vì bản phác không khớp ô thang tầng 1 đã dựng; 5584bf0d v2 mất (tầng 1
  dựng khác nên ô thang khác) — 18 → 17.
Chỗ chặn thật của vòng 4–5 là bản phác tầng 2 không khớp ô thang tầng 1 đã dựng, không phải diện tích.

**Câu nhắc nói ngay vị trí ô thang tầng trên (Haan chọn hướng 1).** Vòng 4–5 của 1330ce12 bản phác tầng 2 vẽ ô thang
ở hàng 8–11 trong khi thang tầng 1 dựng ở hàng 6–11 — câu nhắc cũ chỉ nói vị trí ấy (`sketch_core_overlap`) khi mô
hình đã vẽ phòng khác đè lên ô thang. Nay `arrangeLevel` trả `stairCells` (ô lưới bản phác của mốc thang tầng dưới,
cùng phép làm tròn với `forcedCellBox`), và câu nhắc của tầng hỏng mở đầu bằng dòng `stair_cells`: thang cố định ở
hàng…, cột…, vẽ đúng chỗ ấy và kéo hành lang quanh nó rộng ít nhất hai ô. Không đổi cách xếp — phát lại không đổi vòng
nào (chỉ đo được ở lượt gọi thật). Lời dẫn 9.1.0 (cùng đợt). Phép thử `ai-live-25fdc90c.test.ts` (1330ce12 vòng 4),
đột biến M105.

## T106 — Loại thang bộ theo tài liệu «Các loại thang bộ phổ biến — ký hiệu mặt bằng» (30/09/2026)

Haan: «bổ sung vào đầu bài các loại thang bộ này để user lựa chọn … khi dựng bản vẽ mặt bằng, phần dựng thang bộ cũng
nên tuân thủ hình dạng, kích thước theo tài liệu trên» (`doc/design/thang-bo-mat-bang.pdf`). Haan chọn: bỏ thang xoắn ốc
khỏi thang chính (tài liệu: chỉ làm thang phụ, không làm thang thoát nạn); chưa quyết thì chương trình chọn theo nhà; bậc
171 × 260 mm theo tài liệu; làm cả năm loại một đợt.

- **Đầu bài:** `vertical.stair_shape` (mục «Khối nhà, thang và mặt ngoài», trọng số 0, không bắt buộc) — chữ U 2 vế,
  U chiếu nghỉ rộng, chữ L, thẳng 1 vế có chiếu nghỉ giữa, 3 vế quanh giếng, chưa quyết; mỗi lựa chọn ghi ô thang ≈ theo
  tài liệu. Câu «thang hở / kín» giữ nguyên. Vào bản tóm tắt gửi mô hình và câu văn đầu bài.
- **Kho (`kb/construction_norms.yaml`):** cổ bậc 0,17 → 0,171, mặt bậc 0,25 → 0,26 (hồ sơ NVG đo 0,25 — ghi lại để
  truy); bảng `stairs.shapes` (bề rộng vế, chiều sâu chiếu nghỉ, giếng). Ô thang SUY từ số bậc, không ghi cứng: tầng
  3,6 m ra đúng số tài liệu (U 2,37 × 3,6; U rộng 2,82 × 4,1; L 3,56 × 3,6; ba vế 3,78 × 2,56; thẳng 5,94 — tài liệu đo
  dọc vế đầu lọt lòng, ngang cả tường). Hình tài liệu dùng vế 1,0 m cho cả U rộng (2 × 1,0 + giếng 0,6 + tường = 2,82).
- **Hình học một chỗ (`ai/stair-geometry.ts`):** chia bậc (U, L, thẳng 10 + CN + 9; ba vế 6 + CN + 6 + CN + 6), ô lọt
  lòng tối thiểu theo chiều vế đầu, bố cục vẽ (bậc, chiếu nghỉ mang số, giếng, đường đi), phía bước ra ở tầng trên (U, ba
  vế: cạnh bậc 1; thẳng: cạnh đối diện; L: cạnh ngang).
- **Chọn loại (`ai/stair-choice.ts`):** gia chủ chọn thì dùng; chưa quyết — người từ 65 tuổi / đi lại khó khăn → U chiếu
  nghỉ rộng; khối xây dưới 4 m → thẳng; còn lại chữ U. L và ba vế chỉ khi gia chủ chọn. Gắn vào
  `construction.stairs.shape` MỘT lần ở cửa vào (`withStairShape` — ngữ cảnh workflow, bước lưu).
- **Bộ xếp:** ô thang tối thiểu theo loại (`stairMinCm`, `stairFitsEither`); lối vào thang theo loại
  (`shapedStairEntry`): cạnh mà vế đầu đi ngược lên từ đó thì ô đủ chỗ — U, thẳng chỉ đầu ngắn, L, ba vế theo chiều hợp;
  không cạnh nào hợp → `stair_entry_long_side`. Tầng trên: lối ra ở phía thang tới.
- **Hợp đồng:** `stairs[]` thêm `shape`, `flight_width`, `landing`, `gap` — tờ vẽ đọc từ artifact. Artifact cũ không có
  `shape` vẽ như trước (7 ảnh chụp vàng chỉ đổi CSS).
- **Tờ vẽ (`draw/stairs.ts`):** ký hiệu tài liệu — mỗi bậc / chiếu nghỉ một ô có số, đường cắt gấp khúc ở bậc ≈ 1/3 số
  cổ bậc (≈ 1,2 m tầng 3,6 m), phần trên mặt cắt nét đứt (lớp `stb`, `sab`), chấm ở bậc 1 (`sdt`), một mũi tên liền tới
  bậc cuối; tầng trên cùng nét liền, «XUỐNG». DXF đi theo lớp `stair`.
- **Mô hình** nhận `stair_min_m` theo loại (cạnh ngắn × cạnh dài, kèm tên loại); không thêm chữ vào lời dẫn (trần T46).

Đo phát lại (154 vòng, mô hình không được gọi): thang cũ với bậc 171 × 260 — 18 vòng, y hệt mốc. Bật loại thang theo tài
liệu — 7 vòng (mất 12, thêm 1): bản phác cũ vẽ ô thang cho cỡ 1,6 × 3,3 m, ô thang U nay rộng 2,15 m lọt lòng lấn hành
lang và phòng mô hình vẽ sát nó. Đo đúng phải là lượt gọi thật khi mô hình đã được báo cỡ mới. Phát lại mặc định giữ thang
cũ (`realContextInput(…, { stairShape: true })` để bật). Phép thử `ai-stair-geometry.test.ts`, `ai-arrange.test.ts`
(5 loại trên biệt thự mẫu), `ai-arrange-doors.test.ts`, `ai-design-steps.test.ts`; đột biến M106–M110. Hợp đồng đổi —
API và giao diện phải phát hành CÙNG lúc.

## T106 (tiếp) — Lượt thật f351115d: WC chung tầng 1, hướng bàn thờ, ban công góc (30/09/2026)

Lượt f351115d (gpt-5.6-terra, Claude chạy theo lệnh Haan, lời dẫn 9.1.0, đầu bài bản 22 — thang chữ U chiếu nghỉ rộng,
0,570 USD, 6 lời gọi) lưu mặt bằng 81,1 điểm, dưới ngưỡng vì nhóm E. Thang đúng tài liệu: ô 2,64 × 4,13 m, vào từ đầu
ngắn sau lưng bậc 1, tầng 2 một lối ra. Tệp ghi `fixtures/ai-run-f351115d.json` (digest dựng từ đầu bài bản 22). Haan chỉ
ba chỗ:

1. **«Tầng 1 thiếu phòng nhà vệ sinh chung» — sửa (`ai/program.ts`).** Đầu bài khai dòng «WC tầng 1» và một phòng ngủ tầng 1
   khép kín; mô hình vẽ đúng một WC — WC khép kín của phòng ngủ ấy — và phép kiểm danh mục đếm nó vào dòng WC. Nay dòng WC
   của đầu bài chỉ được đáp ứng bằng WC KHÔNG khép kín (WC khép kín đã có đòi hỏi riêng theo phòng ngủ khép kín; ban công gắn
   phòng ngủ vẫn đếm cho dòng ban công). Đột biến M111.
2. **«Không có cách đặt bàn thờ quay hướng đông nam — từ cửa đi vào là phía sau bàn thờ» — sửa (`ai/altar-facing.ts`,
   `arrange/doors.ts`).** Hướng bàn thờ đọc từ lời gia chủ ở ô tiện ích của dòng phòng thờ («hướng đông nam»), không suy
   đoán; đổi ra vách bàn thờ dựa lưng theo hướng nhà (`site.orientation`: mặt trước H, sau H + 180°, trái H + 90°, phải
   H + 270°; bảng `BEARINGS` dời sang tệp này). Cửa phòng thờ không mở ở vách ấy; chỉ còn lối đi ở vách ấy thì
   `altar_door_behind` (sửa được, có câu nhắc). Lời gia chủ nên được chặn (T65). Đột biến M112.
3. **«Ban công mặt trước phải nằm phần lớn ở mặt trước» — sửa (`ai/plan-demands.ts`).** Ban công GÓC (chạm hai mặt vuông
   góc) chỉ tính cho mặt nó dài gấp `long_ratio` (1,5, như Q-57) trở lên dọc mặt ấy — khối 2,4 × 2,3 m ở góc trước – trái
   không còn là ban công mặt trước. Chỉ ở cổng MẶT BẰNG: thử cả cổng bản phác thì trên lưới ô thô (~0,86 m) nó báo cả ban
   công bộ xếp còn nắn lại được, và 19 phép thử phát lại đổi quỹ đạo — gỡ ở bản phác. Ý «đi ra từ hành lang hoặc phòng
   ngủ» thì bản này đã đạt (mở từ phòng ngủ chính). Đột biến M113.

Phát lại (154 vòng, thang cũ): 18 → 14. Bốn vòng mất đều vì ban công góc — 5584bf0d v2 (ban công trước 1,0 × 1,7 và sau
2,1 × 2,2 đều ở góc), 5bc280ff v3 (ban công sau 2,2 × 2,4 ở góc sau – trái, trước tính cho cả trái lẫn sau), b1543b8c v2
(ban công trước 5,4 × 2,1 trước tính luôn cho mặt trái), 7c6de305 v6 (ban công 2,0 × 8,4 dọc mặt trái chỉ chạm góc trước,
trước tính luôn cho mặt trước). Đo lại với mã cuối (chỉ cổng mặt bằng): vẫn 14, cùng bốn vòng. WC chung và phòng thờ không mất vòng nào; f351115d nay bị bác ngay vòng 1 vì thiếu WC chung — lượt thật sẽ nhắc mô
hình từ đầu.

**Lượt thật 2c522a90 (30/09/2026, Haan tự chạy, gpt-5.6-terra, đầu bài bản 22, 0,445 USD, 6 lời gọi) — thất bại.** Từ vòng 2
cả hai tầng xếp được, vòng nào cũng bị bác ở kiểm cả nhà: thiếu ban công mặt trước / mặt trái. Tệp ghi
`fixtures/ai-run-2c522a90.json`. Không phải do quy tắc ban công góc (tắt đi vẫn hỏng). Chuỗi thật: ô thang tầng 1 là U chiếu
nghỉ rộng, rộng 3,05 m (3 ô); mô hình vẫn vẽ cột trái tầng 2 rộng 2 ô (thang 2 ô, phòng làm việc 2 ô < 2,1 m) nên bản phác
hỏng; khung xương 0 ứng viên; vòng khung NỚI vùng dời phòng ngủ chính ra sau nhà, hai ban công khép kín của nó đi theo — mặt
trước mất ban công. Câu nhắc `stair_cells` (vị trí ô thang) có từ vòng 2 nhưng mô hình không vẽ lại cột trái.
Thử và GỠ: giữ vùng (như T100) cho ban công bản phác vẽ ở mặt đầu bài bắt buộc và phòng mẹ của nó — 2c522a90 vòng 2–3 nay hỏng
vì ban công dài không quay cạnh dài ra mặt thoáng (T71), và 894b350d mất cả sáu vòng (14 → 8). Chỗ chặn thật là bản phác tầng
trên chưa theo được ô thang to hơn của loại thang mới.

**Số ô ô thang gửi mô hình ngay lời gọi đầu (Haan chọn hướng 1, sau lượt 2c522a90).** Lời gọi đầu vẽ mọi tầng cùng lúc
nên chưa có ô thang tầng dưới «đã dựng» để báo; trước đây mô hình chỉ nhận `stair_min_m` bằng mét và tự đổi ra ô — lượt
2c522a90 đổi sai ở tầng 2. Nay `stair_min_m.cells` = số ô [cạnh ngắn, cạnh dài], mỗi cạnh cộng bề dày tường ngoài rồi làm
tròn lên ô, như giếng thang máy (`briefMinCells`); thang U chiếu nghỉ rộng 3 × 5 ô. Nằm trong dữ liệu gửi kèm, không thêm chữ
vào lời dẫn (trần T46). Từ lời gọi sửa thứ hai vẫn có `stair_cells` (vị trí ô thang). Phát lại không đo được (câu trả lời
đã ghi); phép thử `ai-live-25fdc90c.test.ts`, đột biến M114.

## T107 — Tổng hợp 37 lượt thật, nâng cấp ba đợt: đợt 1 câu nhắc và vòng sửa (30/09/2026)

Haan: «tổng hợp từ nhiều lần hỏng để tiến hành nâng cấp toàn diện hơn», rồi «làm lần lượt 3 đợt». Số liệu: 37 lượt thật
23–30/09 trên bản demo, 5 ra mặt bằng (14 %), 15,69 USD — `PHAN_TICH_THAT_BAI_MAT_BANG.md` mục 9. Đợt 1 (không tốn
tiền gọi, lời dẫn 9.2.0):

1. **Dừng khi lặp** (`stuckRepeating`, `STUCK_AFTER = 3`, kiểu dừng mới `stuck` cả hai đường chạy + màn hình): ba lượt
   liền hỏng đúng cùng tập lỗi thì thôi gọi. Đo trên 37 lượt: 2/5 lượt đạt từng lặp HAI lượt rồi mới qua (dừng ở 2 là
   giết chúng); lặp ba chưa lượt nào qua, xảy ra 14 lần. Đột biến M115.
2. **Lượt sửa gọn** (`revisionView`, `fromRevisionIds`): chỉ gửi tầng chưa khoá; phòng mang mã ngắn đọc ra loại (`mb1`,
   `st2` thang, `sd1` phòng làm việc) cả trong ý định lẫn câu nhắc, câu trả lời đổi ngược trước khi ghép. Đo trên
   6bf43039: phần sửa 9.500 → 4.400 ký tự khi tầng 1 khoá, 9.200 → 6.200 khi không; bản phác trả ra ngắn ~3 lần. M116.
3. **Lỗi ban công hệ quả không tới mô hình** (`balconyMovedByRepartition`): ban công ĐÃ đúng mặt trên bản phác mà bị
   dời vì chương trình chia lại tầng thì bỏ khỏi câu nhắc; nếu mọi lỗi cả nhà đều là hệ quả, bác THEO TẦNG có bản phác
   hỏng để tầng dưới được khoá. Ban công còn nguyên mặt mà vẫn bị bác (ban công góc T106) là lỗi thật. M117.
4. **Chong chóng chỉ chỗ** (`sketch_pinwheel_at`): vùng con không còn đường chia sạch, đường bị ít phòng cắt nhất và
   các phòng cắt nó; câu nhắc thêm «hành lang là một dải thẳng, không chữ T». M118.
5. **Lỗi lối vào chỉ chỗ** (`detail` của `sketch_room_no_access`): phòng nằm hàng/cột nào, đang giáp gì, hành lang
   nối thang gần nhất cách mấy ô; bỏ đoạn giảng luật ~300 ký tự lặp mỗi câu (luật đã ở mục Access của lời dẫn).
6. **Đo bộ nhớ đệm**: `cachedInputTokens`, `reasoningTokens` vào tệp lời gọi đã lưu và dòng `[ĐO]`; chưa thành cột.

Đã thử và gỡ: nới câu nhắc ô thang về cỡ tối thiểu — chương trình ép ô thang tầng trên vào hộp ô tầng dưới dựng ra,
nới câu nhắc thì hàng mô hình vẽ thêm bị xoá. `$comment` của lược đồ vốn đã được lọc trước khi gửi (`schema-dialect`).
Tác dụng lên mô hình chỉ đo được bằng lượt thật (đợt 2).

**Đợt 2 — lời dẫn (9.2.0).** Lời dẫn tự mâu thuẫn: mục Access cho hành lang «spine, L, T» (một mã, hình không chữ
nhật), mục Sketch đòi mỗi phòng MỘT chữ nhật và tầng chia dải — gốc của lỗi chong chóng. Nay: hành lang là các dải
chữ nhật rộng `corridor_min_cells`, chỗ rẽ là dải thứ hai giáp dải đầu suốt bề rộng, không chữ T / L trong một mã; thêm
bước tự kiểm «mỗi phòng chung ≥ 2 ô tường liền với hành lang hay phòng nó được mở cửa sang». Bù chữ bằng gọn đoạn
mở đầu (lược đồ đã tả các trường), bỏ «Output only the JSON object» (đầu ra có lược đồ) — 4.996 / 5.000 ký tự. Tác
dụng chỉ đo được bằng lượt thật.

**Đợt 3 — chương trình tự nối phòng cụt: ĐO, CHƯA ĐƯỢC.** Chương trình ĐÃ có hai đường cứu lỗi lối vào: khoét hành
lang xuyên phòng (`enumerateCarved`) và khung xương (T102). Phát lại 6bf43039 (fixture mới `ai-run-6bf43039.json`):
khung xương sinh **0 ứng viên ở mọi tầng mọi vòng**; khoét thì hỏng vì phòng bị khoét hụt sàn đầu bài / thành dải quá
dài. Gốc của khung rỗng: ô thang biệt thự nằm giữa bề ngang → chế độ hai hàng kẹp hành lang (`mid`) bị tắt
(`skeleton.ts`, «chưa dựng cho trường hợp này»), nên năm – sáu phòng tầng 2 phải đứng MỘT hàng 12 m. Đã thử mở `mid` cho
lõi giữa (hàng trong phủ cả phần bên xa lõi): đo riêng, phát lại 14 = 14 — không thêm vòng nào, GỠ. (Lần đo đầu ghi
14 → 12 là đo lẫn với bản nới của mục 3 bên dưới.)

**Mục 3, bản nới — đã thử, gỡ.** Coi cả ban công «bản phác đạt, mặt bằng bị nắn thành khối góc» là hệ quả (lượt 6bf43039
vòng 3: ban công 6 × 1 ô dọc mép trước) → phát lại 14 → 12 (mất 7c6de305 vòng 3, b1543b8c vòng 6). Giữ bản hẹp: chỉ
ban công bị dời HẲN khỏi mặt đã vẽ; ca 6bf43039 vòng 3 vẫn được báo như trước. Vết chạy cho thấy chỗ vướng kế tiếp: dải 1,55 m sau ô thang (ô thang không áp tường sau) bị gán phòng
giặt + phòng thờ, và hàng trong bên phía V chỉ còn 1,9 m. Muốn đi tiếp phải chọn hướng (chờ Haan): (a) khi dựng tầng 1,
chương trình kéo ô thang áp tường sau / bên nếu bản phác để dải thừa dưới một phòng; (b) khung xương cho biệt thự lõi
giữa như một kiểu riêng (hai hàng quanh hành lang chữ U bao lõi) — việc lớn, đo từng bước.

**Đo bằng hai lượt thật (Haan cho phép, 30/09/2026, gpt-5.6-terra, lời dẫn 9.2.0).** bea4c6fa (0,550 USD) và
f1a88ac1 (0,640 USD): cả hai hỏng sau 6 lời gọi. So với 6bf43039 (9.1.0): phần VÀO lượt sửa 7.600–7.900 → 6.300–7.300
token; phần RA không đổi (3.800–9.400, phần nghĩ chiếm chủ yếu) — tiền không giảm rõ vì phần ra quyết định. Chất lượng
bản phác: từ vòng 3 lượt bea4c6fa hành lang là MỘT dải thẳng, mọi phòng áp vào — lỗi lối vào hết sau một lượt sửa (đợt 2
có tác dụng). Chặn còn lại, cả hai lượt: **phòng nhỏ có sàn đầu bài vẽ thành dải mỏng** (phòng thờ 10 m² vẽ 2 × 6 ô → 8,99
m², 9 ô → 8,35 m²) → bản phác bị bỏ, tầng 2 chia lại, **ban công bắt buộc bị dời** sang mặt cấm → hỏng cả nhà. Quy tắc
dừng khi lặp không kích hoạt (câu nhắc mỗi vòng một khác). Fixture `ai-run-bea4c6fa.json`, `ai-run-f1a88ac1.json` (vòng sửa
trả mã ngắn — bộ phát lại phải `fromRevisionIds`).

Đã thử và gỡ: `belowFloorCell` (lọc cây trước cổng) không áp dung sai 3 % của cổng — sửa cho khớp thì phát lại không
đổi vòng nào (cổng đo tường thật ra 8,99 m², hụt thật).

**Hai việc sau hai lượt thật (Haan «oke làm đi»).** (1) Số ô MỖI CẠNH cho phòng có sàn đầu bài: `min_cells` thêm
`min_side_cells` = cạnh ngắn theo cùng giả định tỉ lệ 2 mà `cells` đếm (`minSketchSideCells`; phòng thờ 10 m² → 3 ô, tức
khối 3 × 4, không phải dải 2 × 6). Lời dẫn đã có câu «`min_side_cells` per side when given», chỉ thêm dữ liệu. Phát lại
không đo được; đột biến M119. (2) Chương trình giữ ban công bắt buộc khi chia lại tầng: thử cho tiêu chí xếp hạng
`balconiesKept` biết mặt CẤM — phát lại 14 = 14, năm lượt gần nhất 0 = 0, không đổi vòng nào: trong các phương án chia
lại không phương án nào còn ban công đúng mặt, nên xếp hạng không cứu được — GỠ. Muốn giữ thật thì ban công bắt buộc phải
được GHIM vị trí trong bước chia lại như ô thang (bộ khoét liệt kê hàng chục nghìn cách chia, ban công rơi đâu tuỳ) —
việc lớn, chưa làm.

## T108 — Giặt phơi phải có chỗ phơi đồ (30/09/2026)

Haan: «phòng giặt phơi nên đặt ở nơi có ban công hoặc có cửa sổ thoáng, hoặc phòng giáp ban công hoặc gần khu sân phơi
(nếu có) — thì mới tiện cho việc phơi đồ». Không nói «bắt buộc» → kinh nghiệm nghề, TRỪ ĐIỂM, không chặn (T52).

- **D4** (`kb/plan_quality.yaml`, nhóm D, kiểu đếm, trừ hết từ phòng đầu tiên): phòng giặt phơi có chỗ phơi khi có cửa
  sổ ra mặt thoáng, hoặc có cửa ra / tường chung từ `min_shared_m` (0,9 m) với phòng nhóm `drying` của từ vựng (ban
  công, sân thượng, sân trong — giếng trời, hiên không phơi được). Phòng lưu theo lọt lòng nên «chung tường» tính cả khe
  một bề dày tường (`wall_gap_m` 0,25). Thước lên `score_version` 4 (gộp cả D2, C11 của T105 vốn quên tăng).
- Câu nhắc D4 cho lượt sửa; lời dẫn đổi «kitchen, wc and laundry grouped» → «kitchen and wc grouped; laundry by a balcony,
  terrace, yard or open-face window» (bù chữ bằng gọn câu mở đầu, vẫn 4.996 / 5.000).
- Đã có từ trước và giữ: giặt phơi mở cửa từ ban công / sân thượng (`served_from`, T91); đổi chỗ giặt phơi với phòng kỹ
  thuật / kho ra mép thoáng (`open_face_first`, T103).
- Phép thử `plan-score.test.ts` (bốn ca D4); đột biến M120 (đo chung tường không trừ bề dày tường — sống sót lần đầu vì
  giặt phơi mẫu có cửa ra sân thượng; phép thử nay bỏ cửa ấy).

## T109 — Nhắm «ra mặt bằng trong tối đa 4 lời gọi»: báo mọi lỗi ngay một lượt (30/09/2026)

Haan: «trước khi chạy tôi muốn tìm cách tối ưu để có thể gen thành công bản vẽ chỉ trong vòng tối đa 4 lần». Lượt bea4c6fa
dùng 6 lời gọi vì mỗi vòng chỉ lộ MỘT nhóm lỗi: vòng 1 danh mục (thiếu WC chung) — `evaluateHouse` trả về ngay, không
soát bản phác; vòng 2 mới lộ lối vào tầng 2 (có từ vòng 1); vòng 3 diện tích; vòng 4 ban công (chỉ thấy khi mọi tầng đã
xếp).

- **Danh mục sai vẫn soát bản phác mọi tầng** (`precheckSketches`, chế độ `precheckOnly` của T92) và ban công trên bản
  phác; câu nhắc gồm cả hai phần, ý định gửi kèm là bản đã đánh mã. Phát lại toàn kho: 13 vòng hỏng ở danh mục, 9 vòng
  nay kèm lỗi bản phác, 3 vòng đúng là lỗi vòng sau hỏng — mỗi vòng ấy tiết kiệm một lời gọi. Đột biến M121.
- **Lời khuyên ban công góc** (`sketchBalconyCornerAdvice`, câu `balcony_side_corner`): mặt bắt buộc mà ban công duy nhất
  ở mặt ấy là khối góc ngắn thì nhắc sớm, chỉ kèm lượt đã hỏng vì lý do khác (không bác — bác ở bản phác đổi 19 phép thử,
  T106). Hai lượt thật gần nhất không có ca nào; đột biến M122.
- Lời dẫn 9.3.0 (hai lượt bea4c6fa, f1a88ac1 chạy bằng 9.2.0 trước các đổi T108–T109).
- D4 (T108) đổi cách bộ xếp chọn phương án: phát lại 14 → 13 vòng xếp được, số vòng ≥ 65 điểm 12 → 11 (7c6de305 vòng 3
  lên 65,6; 894b350d vòng 3–4 xuống 64,2 vì giặt phơi giữa nhà không chỗ phơi — đúng điều Haan muốn trừ; f1a88ac1 vòng 3
  60,3 < 65 mất). Giữ, vì là yêu cầu của Haan.

Còn lại, chưa làm: ghim ban công bắt buộc khi chương trình chia lại tầng (chỗ hỏng cuối của bea4c6fa); trần lượt sửa
`HOUSE_REVISIONS_MAX` vẫn 5 — hạ về 3 (tối đa 4 lời gọi) chỉ bớt tiền lượt hỏng, không làm lượt nào thành công hơn.

**T109 (tiếp) — Haan «làm b đi, để số lần gọi tối đa là 5».**

- `HOUSE_REVISIONS_MAX` 5 → 4: lượt đầu + bốn lượt sửa = tối đa năm lời gọi mỗi phương án. Câu trên màn hình «tối đa ba
  lần» (đã lỗi thời) → «tối đa bốn lần».
- **Ghim ban công bắt buộc khi chia lại tầng** (`retryWithBalconyPins`, `arrange/index.ts`): tầng xếp được mà có ban công
  chạy dọc mặt gia chủ cấm, hoặc ban công ĐỨNG RIÊNG bản phác vẽ dọc một mặt bắt buộc THOÁNG không còn ở mặt ấy → xếp
  lại tầng với các ban công ấy làm ô mốc (như ô thang, `enumerateCarved` + dải hành lang + chữ T), nhận bản mới chỉ khi
  xếp được và ban công đúng; ghi chú `balcony_pinned`. Chỉ chạy khi bản thường đã sai → không đụng ca nào đang đúng.
  Phát lại: kho thang cũ 13 → **15** vòng xếp được, ≥ 65 điểm 11 → **12**; năm lượt gần nhất (thang theo loại) 0 → **2**
  (bea4c6fa vòng 5: 65,0; vòng 6: 71,2 — lượt thật lẽ ra ra mặt bằng ở lời gọi thứ năm). Không vòng nào lùi. Đột biến
  M123.
- Ba cách đã thử trước khi tới cách trên (đều làm lùi phép thử phát lại, gỡ): (1) luôn ghim → b1543b8c vòng 6 mất cách
  chia vốn đặt được ban công mặt trái; (2) thêm khung ghim bên cạnh khung thường cùng một suất cổng → chúng chen mất
  ứng viên thường, b1543b8c mất bản thu hẹp hành lang tầng 1 (T104); (3) bậc xếp hạng «không ban công dọc mặt cấm» đứng
  đầu → không đủ, vì cổng dừng ở vòng nới đầu có ứng viên qua. Ban công KHÉP KÍN của phòng ngủ (đi cùng phòng mẹ) chưa
  ghim.

## T110 — Hạ ngưỡng nhận phương án 65 → 60 (01/10/2026)

Haan: «hạ ngưỡng điểm xuống 60». `kb/plan_quality.yaml` `accept_percent: 60`. Sàn nhóm 40 % (T96) giữ
nguyên, nên một phương án đi lại tệ vẫn bị coi là dưới ngưỡng dù tổng ≥ 60. Phương án 60–65 điểm nay
được nhận ngay thay vì dùng tiếp lượt sửa — bớt lời gọi, đổi lại kỹ sư nhận bản vẽ điểm thấp hơn để sửa bằng ô yêu cầu.

## T111 — Hai lượt thật đầu tiên với 9.3.0 + ngưỡng 60, và ba lỗi chương trình chúng lộ ra (01/10/2026)

Haan tự chạy hai lượt gpt-5.6-terra trên đầu bài demo (cùng đầu bài bea4c6fa), cả hai hỏng sau 5 lời gọi
(46d6eff3 ~0,51 USD, fdd486b1 ~0,5 USD). Phát lại cả hai (fixture `ai-run-46d6eff3`, `ai-run-fdd486b1`) cho ra
đúng lỗi lượt thật, và ba chỗ hỏng thuộc CHƯƠNG TRÌNH, không thuộc mô hình:

1. **Mất cửa chính khi đổi mã ngắn** (46d6eff3): `fromRevisionIds` đổi mã bằng bảng chỉ gồm phòng của tầng
   gửi đi; `entry_room` / `garage_room` trỏ vào tầng 1 đã khoá nên thành null từ lời gọi 2, tới lời gọi 5 mô hình
   bị bắt vẽ lại tầng 1 đã qua. Sửa: đưa hai mã ấy vào bảng. Đã THỬ thêm «mô hình bỏ trống thì giữ bản cũ» —
   phát lại bea4c6fa vòng 5–6 hỏng lại (chương trình tự chọn cửa chính tốt hơn), gỡ.
2. **Một mã ở hai tầng** (46d6eff3 lời gọi 5: `co4` là hành lang mới ở cả tầng 1 lẫn tầng 2, cổng danh mục bác
   cả lượt): `splitClashingIds` đổi mã lần khai sau sang mã trống trong bản phác / quan hệ của chính tầng ấy.
3. **Mô hình không biết lỗi bản phác của chính nó** (fdd486b1): phòng ăn tầng 1 vẽ chữ L, chương trình cắt phần
   lồi chỉ ghi chú cho kỹ sư, tầng phải chia lại, câu nhắc chỉ nói lỗi của cách chia lại (gara giáp ô thang) — mô
   hình nộp y nguyên tầng 1 bốn vòng. Sửa: `crookedSketchRooms` đọc bản phác nguyên văn, mã mới
   `sketch_room_crooked` đứng đầu câu nhắc khi tầng hỏng hẳn VÀ vốn có lỗi sửa được. Hai lần thử trước gây lùi đo
   được: gắn vào tầng chia lại thành công (bea4c6fa 2 → 0) và dùng mã `sketch_not_rectangular` (bậc tệ
   `setbackRank` +1000 → 5bc280ff chọn biến thể khác) — nay mã riêng, `setbackRank` bỏ qua.

Thêm: lời dẫn lượt sửa giữ đúng khổ lưới (46d6eff3 nới tầng 2 từ 16 lên 20 hàng → ô nhỏ đi, phòng ngủ hụt sàn,
câu nhắc ô thang lệch theo). Lời dẫn 9.3.1.

**Ngưỡng 60 làm tụt điểm** (T110): `evaluateHouseBest` thôi thử biến thể khi phương án qua ngưỡng nhận; ở 60,
bea4c6fa vòng 6 trả bản 61,8 thay vì 71,2. Tách mức TÌM `variant_search_until_percent: 65` (`kb/plan_quality.yaml`)
khỏi ngưỡng nhận — không thêm lời gọi mô hình, chỉ thêm thời gian xếp cho phương án 60–65 điểm.

Phát lại (so t111): bộ cũ 15 → 17 vòng xếp được, ≥ 65 điểm 12 → 14; bộ năm lượt gần 2 = 2, cùng điểm; không vòng
nào lùi. Hai lượt mới vẫn hỏng trong phát lại — chỗ sửa chỉ có tác dụng từ lượt sau, khi mô hình nhận câu nhắc đúng.

## T112 — Review lời dẫn mặt bằng (01/10/2026), đợt 1: sửa phần tất định

Haan đưa một bản review lời dẫn `plan_house` 9.3.0 (`~/Documents/Doc/NVG/handoff-floorplan-prompt-review.md`,
P0-01→P2-04), chấm trên đầu bài biệt thự Hưng Yên 15 × 20 m, ba thế hệ. Đối chiếu từng mục với mã: phần
đúng là bộ sinh tri thức đưa dữ liệu tự mâu thuẫn cho mô hình. Khoảng nửa đề xuất về schema và validator thì
chương trình đã có, hoặc trái quyết định đã chốt. Haan chọn: sửa tất định trước, lời dẫn sau (phải chạy thật
mới đo được); mặt giáp đất người khác lùi **< 1 m** thì không thoáng; vượt sàn thì **chặn, không gọi mô
hình**; diện tích tối thiểu gia chủ khai **đã gồm** tủ, góc trong phòng.

Đã làm (không đổi lời dẫn, không đổi hợp đồng):

1. **Góc làm việc** (P0-01). Phiếu lưu «Góc làm việc» bằng mã `study`, trùng «Phòng làm việc» riêng → lời dẫn
   vừa đòi `study` là không gian (luật 2) vừa cấm (luật 3). `kb/brief_fidelity.yaml` `in_bedroom_as: {study:
   study_area}`; cùng tầng đã có phòng làm việc riêng thì bỏ hẳn khỏi `inside` (`program.ts` `inRoomCodes`).
2. **`open_pairs` theo tầng** (P0-05): bỏ cặp hai loại đầu bài ghim ở hai tầng khác nhau (phòng thờ tầng 2 –
   phòng khách tầng 1). Chỉ phần gửi mô hình; bộ xếp vẫn đọc đủ.
3. **Luật đi lại chỉ nhắc mã đã định nghĩa** (P1-09): `core` không còn trong `walk_through`.
4. **Mặt thoáng xét khoảng lùi** (P1-05): `kb/site_context.yaml` `min_open_setback_m: {dat_trong: 1}`,
   khoảng lùi = max(quy hoạch, sân gia chủ muốn) (`buildable.ts` `setbacksFromDigest`). Mặt bắt buộc có ban
   công hay ban công phơi phía sau mà mặt ấy không thoáng → cảnh báo trên màn hình.
5. **Chữ ban công đua**: «ĐUA RA NGOÀI ranh đất» → «mép nhà» (`brief/narrative.ts`), đúng nghĩa T91.
6. **Cục nóng ở sân thượng** → đòi hỏi `cuc_nong_san_thuong` (terrace, không chặn), như `bon_nuoc_mai` (P0-04).
7. **Phòng ngủ khép kín ghép đúng dòng đầu bài** (P1-01, phía chương trình): ghép dòng «khép kín» với phòng có
   WC khép kín trước (`pairBriefRows`), cả khi nâng diện tích mục tiêu lẫn khi kiểm. Trước đây WC khép kín gắn
   phòng giúp việc 15 m² vẫn qua mức 20 m² của phòng ông bà.
8. **Gió mát bị nhà bên chặn**: cảnh báo `gio_mat_bi_nha_ben_chan` khi gió khai ở mặt giáp nhà bên cao bằng
   hoặc hơn (P1-04, phần cảnh báo; `faces` gửi mô hình để đợt 2).
9. **Kiểm khả thi trước lời gọi đầu tiên** (từ P1-07): `ai/feasibility.ts`, mức
   `kb/plan_quality.yaml` `feasibility_max_percent: 85`. Cộng phần chắc chắn phải có (ô tối thiểu các phòng
   khai diện tích, ô thang, WC khép kín), cố ý đếm thiếu. Gắn ở cả `runVariant` (Workflow) lẫn
   `generateAiPlan`. Lượt ghi cao nhất 75 % → không lượt nào bị chặn. Đầu bài nhồi `crammedBrief` (~92 %) nay
   bị chặn thay vì ra mặt bằng hụt mức kèm cảnh báo (T91) — nhánh T91 vẫn còn cho đầu bài 85 %–sức chứa thật.
   Đột biến M124–M126.

**Phát lại (194 vòng / 46 lượt ghi, đối chứng cùng mã):** mục 7 bật riêng 17 = 17 mặt bằng, không đổi điểm.
Mục 4 bật riêng 17 → **12**: 894b350d vòng 1, 2, 5, 6 và 4a521f52 vòng 2 hỏng; năm vòng khác tụt 1–5 điểm. Câu
trả lời ghi sẵn được vẽ khi lời dẫn báo mặt sau thoáng — mô hình đặt ban công, phòng ở quay ra mặt ấy. Đầu bài
demo vốn mâu thuẫn: muốn ban công phơi phía sau và cho phép ban công mặt sau trong khi tường sau sát ranh. Giữ
vì Haan chọn; `realContextInput` mặc định tắt (như `only_when_asked`, loại thang), `openSetback: true` để đo.
Muốn bỏ: xoá dòng `dat_trong: 1`.

Không làm, kèm lý do: đổi bản phác sang `rect` 0,5 m (T48, viết lại bộ xếp, mất kho phát lại); tính Bát trạch
(T62); nhịp kết cấu, dốc xe (8.2-6, T30/T42); bỏ `adjacent` / thêm quan hệ `door` (cửa suy từ luật đi lại,
`adjacent` dùng chọn phòng mở cửa và chấm điểm); trường `cantilever` (chương trình đã suy từ đầu bài, T91);
cờ phòng giúp việc rộng (lời gia chủ là ràng buộc, T41). WC khép kín không có lối vào (P0-02): chương trình đã
đúng (`ensuite_of` là cạnh đi lại) — chỉ lời dẫn thiếu câu.

Đợt 2 (lời dẫn 9.4.0, cần chạy thật, chưa làm): ghép luật theo điều kiện (thang máy, sân thượng, ông bà
chưa có tầng); câu ensuite trong Access; «bếp và WC cùng khu kỹ thuật, không chung tường, cửa không đối
diện» thay «kitchen and wc grouped»; luật 3 nói tối thiểu đã gồm phần trong phòng; gửi `faces`
(mù / nắng gắt / gió); assumptions xếp theo tác động, đề xuất loại `only_when_asked` không được vẽ. Đo: 2 lượt
9.3.1 + 2 lượt 9.4.0 trên đầu bài Hưng Yên (~2 USD) — chờ Haan cho phép.

**T112 (tiếp) — Q-60, Haan 02/10/2026:** giữ mặt thoáng theo khoảng lùi (Haan đã sửa đầu bài demo), và «đưa
cảnh báo sớm là mâu thuẫn ở đầu bài để người dùng biết mà điều chỉnh». `checkBriefConsistency` thêm
`ban_cong_mat_sat_dat_trong` (cảnh báo, không chặn): mặt giáp đất trống mà tường cách ranh dưới ngưỡng, lại có
ban công bắt buộc / tuỳ chọn / ban công phơi phía sau ở mặt ấy. Ngưỡng ở màn hình là
`OPEN_FACE_MIN_SETBACK_M` (`shared/src/design/brief-completeness.ts`), bản sao của `min_open_setback_m` — phép
thử canh hai bên khớp. Cảnh báo cạnh mặt bằng (`withClosedBalconyFaces`) vẫn giữ.

**T112 (tiếp) — đầu bài vượt sàn, Haan 02/10/2026:** chốt cách «chặn trước lời gọi đầu tiên» (kiểm khả thi
85 %, `ai/feasibility.ts`) cho đầu bài vượt mức ấy, thay cho cách T91 «vẫn xếp, ra mặt bằng hụt mức kèm cảnh
báo» ở vùng này. Nhánh T91 chỉ còn cho đầu bài dưới 85 % mà bộ xếp vẫn hết chỗ.

**T112 đợt 2 — lời dẫn 9.4.0 (02/10/2026), đã làm, chờ Haan chạy thật trên demo (2 lượt, Haan cho phép).**
`floor_level.system` thêm cú pháp `[[cờ|chữ]]` (`houseSystem`, cờ `elevator` / `terrace` / `ong_ba_unset` trong
`PlanContext.promptFlags`; cờ lạ thì ném). Đổi: câu thang máy, sân thượng, ông bà chưa ghim tầng chỉ có khi
đúng (P2-01); «A room with `ensuite_of` opens only from its parent bedroom» (P0-02); bếp và WC «one service zone,
not sharing a wall, doors not facing» thay «grouped» (P0-06); luật 3 «the bedroom's brief minimum includes
them» (P1-02); `knowledge.faces` — nhãn `open` / `blind` / `harsh_sun` / `cool_wind` từng mặt (`faceTags`) và một
câu đặt thang / WC / kho dựa mặt mù, phòng ở về mặt thoáng có gió (P1-04); chiến lược AI-A dựa thang vào mặt
mù; assumptions xếp theo tác động, được đề xuất loại `only_when_asked` mà không vẽ (P1-06, P1-10); luật 8 gom
câu «không WC / giặt trên phòng ở» từ phần Sketch (P2-04). Trần lời dẫn T46 5.000 → 5.500 ký tự, nay đo bản gửi
đi dài nhất (5.395) thay vì khuôn. Phát lại không đo được thay đổi lời dẫn — đối chứng là hai lượt 9.3.0 cùng
đầu bài (46d6eff3, fdd486b1: cả hai hỏng sau 5 lời gọi).

**T112 (tiếp) — «AI Design» trên Worker cloud, 02/10/2026.** Hai lượt thật đầu tiên của 9.4.0 lộ ra rằng
nhánh AI chưa từng chạy trên `nvg-api` cloud: (1) `design_ai_run.workflow_id varchar(64)` từ chối mã
instance mới `cf_` + 64 hex → migration 0152 nới lên 255; (2) gói Workers Free cắt 50 lời gọi ra ngoài và
10 ms CPU mỗi bước — Workflow chết với «Too many subrequests» ngay sau lời gọi mô hình (5 lời gọi mất,
~0,5 USD). Mọi lượt trước đó chạy qua `wrangler dev` tại máy, vẫn trỏ CSDL demo từ trước khi tách (C-1).
Haan chọn nâng Workers Paid; `workers/wrangler.jsonc` thêm `limits.cpu_ms: 300000`.

**T112 (tiếp) — lượt thật 8eaaee7b, lời dẫn 9.4.0 (02/10/2026).** Hỏng sau 5 lời gọi, nhưng gần hơn hai lượt
9.3.0 cùng đầu bài (46d6eff3, fdd486b1): tầng 1 qua từ vòng 2 (fdd486b1 hỏng tầng 1 cả năm vòng), từ vòng 3 mỗi
vòng một lỗi. Vòng 4–5 kẹt ở «ban công mặt bên trái»: mô hình vẽ một khối ban công góc trước – trái, tin nó phủ
cả hai mặt bắt buộc; cổng (T106) không tính khối góc cho mặt không có cạnh dài, mà câu nhắc lại nói «không ban
công nào chạm mặt ấy» — sai với bản phác mô hình đang nhìn. Sửa (9.4.1): `balcony_side_missing` mang `corner` khi
có ban công chỉ chạm ở góc, câu nhắc riêng `balcony_side_missing_corner`; đầu bài nói «mỗi mặt bắt buộc một ban
công riêng chạy dọc mặt ấy». Phép thử `ai-live-8eaaee7b.test.ts`. Một lượt (đồng thời đo 9.4.1) còn lại trong
hai lượt Haan cho phép.

## T113 — Nâng điểm sau lượt thật 182665ea: hành lang, ban công, WC hẹp, quay lui tầng 1 (03/10/2026)

**Khởi nguồn.** Lượt thật 182665ea (02/10/2026, gpt-5.6-sol, lời dẫn 9.4.1, Worker cloud, 5 lời gọi, 1,21 USD) lưu một
phương án 60,3 % (vòng 3), dưới sàn nhóm E (0 %). Haan chấm: «giao thông tầng 1 quá lớn, đang có độ rộng 2,5 m — thừa
và không hợp lý»; «ban công tầng 2 phân bổ chưa thẩm mỹ, đúng kiểu làm cho có để tuân thủ đề bài». Đo trên artifact:
`circulation_1` 12,06 × 2,40 m = 28,9 m² (mục tiêu mô hình khai 8 m², bản phác vẽ 2 hàng × 13 cột); hai ban công tầng 2
cùng thuộc phòng ngủ chính, ôm góc trước – trái, dải mặt trái 2 × 6,8 m = 13,8 m² (mục tiêu 4) chạy quá cạnh phòng
2,2 m, trong khi `bedroom_3` 5,5 m mặt tiền không có ban công. Ba WC rộng 0,92–0,98 m (một ô lưới).

**Haan chốt 03/10/2026:** (1) ngưỡng hành lang trừ điểm từ 1,5 m, trừ hết 2,4 m; (2) hạn chế góc chữ L, ban công cân
đối, ưu tiên phòng ngủ → phòng phơi đồ → phòng làm việc, ban công bám theo cạnh phòng; (3) bếp kín vẫn chỉ cảnh báo —
đầu bài lượt này còn ghi «phòng bếp và phòng ăn liền nhau, ko phân cách cứng», nên nhập bếp vào phòng ăn là đúng ý gia
chủ; (4) làm luôn.

**Vì sao thước cũ không thấy.** C2 đo tỷ lệ giao thông cả tầng (0,28 — trong khoảng đạt), C4 chỉ đo bề rộng NHỎ NHẤT;
dải 2,4 m chỉ bị trừ gián tiếp, lẫn trong A1. Không tiêu chí nào xét cách phân bổ ban công.

### Đã làm

1. **C12 — bề rộng lọt lòng lớn nhất của hành lang dạng dải** (`kb/plan_quality.yaml`, nặng 1,5; dải = dài từ 3 lần bề
   rộng; sảnh gần vuông không xét). Thước 5.
2. **D5 — số ban công bố trí lệch** (nặng 2, đếm, trừ hết ở 2): góc chữ L (hai cạnh vuông góc ở mép NGOÀI CÙNG hình bao,
   hoặc chung vách với ban công khác), không bám cạnh phòng chủ (phòng mở cửa ra ban công) quá 0,3 m, sai ưu tiên (cùng
   mặt có phòng bậc cao hơn chưa có ban công, hoặc phòng chủ đã giữ ban công khác). Thứ tự ưu tiên là dữ liệu: nhóm
   `balcony_owner_1..3` của `kb/room_vocabulary.yaml`. Đo góc theo mép ngoài cùng vì đầu ban công đua ra chạm bậc nhô
   của chính phần đua (cạnh hình bao dài bằng độ đua) — đo theo mọi cạnh thì báo oan.
3. Câu nhắc C12, D5 (`kb/ai_design_prompts.yaml`, lời dẫn 9.5.0) và một câu trong đầu bài phần Ban công
   (`brief/narrative.ts`): mỗi ban công thuộc một phòng theo thứ tự ưu tiên, bám cạnh phòng, không ôm góc.
4. **Nới phòng hẹp** (`arrange/room-widen.ts`): phòng có bề hẹp dưới mức kinh nghiệm (`rules/` `min_dimension`) lấy phần
   thiếu từ cụm kề không chứa ô cố định, miễn mọi phòng trong cụm ấy còn đủ mức của nó. Biến thể cả nhà trong
   `evaluateHouseBest`, giữ khi qua cổng và điểm không thấp hơn — cùng cách T104.
5. **Quay lui tầng 1** (`evaluateHouse`, `rankSkip` của bộ xếp): tầng trên hỏng thì thử bản tầng 1 xếp hạng thứ 2, rồi
   thứ 3 (`GROUND_BACKTRACK = 2`), nhận bản đầu tiên cho mọi tầng trên xếp được. Tầng 1 được chọn theo điểm của RIÊNG
   nó, nên đổi thước (thêm C12) là tầng 1 đổi bản và tầng trên — ép theo mốc thang, WC của tầng 1 — có thể hết cách
   xếp: phát lại với C12 mà không quay lui mất 2 mặt bằng (182665ea vòng 3, 46d6eff3 vòng 1).

### Số đo (phát lại 49 lượt ghi, 204 vòng, chấm lại bằng CÙNG thước 5)

Bộ phát lại (mẫu `zz-replay` của phiên, scratchpad) bật / tắt từng thay đổi bằng cờ tạm; mọi phương án được chấm LẠI
bằng thước 5 đầy đủ để điểm giữa các cấu hình so được (thước khác nhau thì phần trăm khác nhau chỉ vì mẫu số: thêm một
tiêu chí không chấm được cũng làm phần trăm nhích ±0,3–1,7). Tệp ghi mới `fixtures/ai-run-182665ea.json` (đầu bài =
bản 25 của hồ sơ, trùng `8eaaee7b`); phát lại khớp lượt thật: vòng 3 qua, 60,3 %, nhóm A64 B67 C79 D40 E0.

| Cấu hình (so với tắt hết) | Vòng qua | Lượt có mặt bằng | Tiến / lùi | Ghi chú |
| --- | --- | --- | --- | --- |
| Tắt hết (mốc) | 18 | 8 | — | |
| C12 một mình | 16 | 6 | 0 / 2 | tầng 1 đổi bản, tầng 2 hết cách xếp |
| Nới phòng một mình | 18 | 8 | 0 / 0 | WC hẹp TB 1,33 → 0,94 mỗi phương án; thước 5 TB 66,4 → 67,0 |
| Quay lui một mình | 19 | 8 | 1 / 0 | b1543b8c vòng 2 |
| C12 + quay lui | 19 | 8 | 1 / 0 | |
| **Bộ giữ lại** (C12, D5, nới, quay lui) | **19** | **8** | **1 / 0** | |

Theo VÒNG QUA CỔNG ĐẦU TIÊN của mỗi lượt (luồng thật dừng ở đó khi đạt ngưỡng), thước 5: trung bình 65,7 → 67,2 —
182665ea 55,9 → 60,2 (hành lang tầng 1 2,40 → 1,59 m, WC hẹp 3 → 1), 46d6eff3 68,8 → 72,3, 7c6de305 64,2 → 66,7,
bea4c6fa 64,6 → 67,5, b1543b8c qua ở vòng 2 thay vòng 6 (bớt 4 lời gọi, ~0,8 USD); thiệt: 4a521f52 68,6 → 65,8.
Vòng sau vòng qua đầu tiên đổi theo quỹ đạo (bea4c6fa vòng 6 72,9 → 65,7: vòng 5 ra bản khác nên ý định ghép cho
vòng 6 khác) — câu trả lời ghi sẵn đáp lại vòng 5 CŨ, nên không tính là lùi của bộ xếp.

**Đã gỡ vì không có lợi đo được** (bật / tắt trên 177 vòng, kết quả trùng từng vòng): thu hành lang theo từng tầng +
tầng trên theo mốc tầng 1 chưa thu (lại chậm gần gấp đôi); bậc xếp hạng ban công tính khối góc như cổng cả nhà và đưa
lên đầu `compareRanked`.

**Chi phí.** Quay lui làm vòng HỎNG ở tầng trên chậm hẳn: 5cd78ef7 (5 vòng sửa đồng bộ) một mình 8,3 s → 15,9 s (một
bản) → 22,5 s (hai bản); phát lại 204 vòng ~12,5 → ~30 phút. Trần CPU của Worker là 300 s mỗi bước nên chưa chạm, nhưng
bốn phép thử phải nới trần thời gian (ghi lý do tại chỗ). Một bản quay lui thay hai: mất mặt bằng sớm của b1543b8c và
+3,3 của 5aba737d vòng 2, được +2,8 ở 4a521f52 vòng 1 — giữ hai.

### Còn mở

- **D5 và câu đầu bài về ban công chưa đo được bằng phát lại**: ban công lấy nguyên hình từ bản phác của mô hình, mà phát
  lại dùng câu trả lời ghi sẵn. Phát lại chỉ cho thấy D5 chấm đúng (182665ea: cả hai ban công); tác dụng lên bản phác
  cần lượt thật (lời dẫn 9.5.0) — chờ Haan cho phép (một lượt ~1,2 USD).
- C12 làm hành lang hẹp đi rõ ở 182665ea nhưng trên các lượt ghi khác hầu như không đổi (6/19 phương án còn hành lang
  trên 1,5 m, 1,54–1,99 m): bộ thu hành lang T104 chỉ thu khi điểm không thấp hơn, và dải 1,5–2 m thường là hành lang
  mô hình vẽ 2 ô ở chỗ phải đi qua thang.
- Nhóm E (trục ướt) và D2 (phòng ngủ tối) — mục 2 và 5 của phương án — chưa làm: chỗ hỏng nằm ở bản phác (WC tầng 2 lệch
  trục 4,5 m, phòng ngủ giữa nhà trên lô góc), cần đo bằng lượt thật hoặc một bộ xếp đổi chỗ phòng có đo phát lại.

### T113 (tiếp) — lượt máy 0b7e4957: lời dẫn 9.5.0 lần đầu (03/10/2026, Haan bấm)

Chạy tại máy (`wrangler dev` + CSDL máy; hồ sơ `NVO-TK-2026-2737` và đầu bài bản 25 chép từ demo xuống — trên máy mang
số phiên bản 1, nội dung trùng từng ký tự; phải chép cả dòng `design_head` của `design_brief`, thiếu nó màn hình báo «Cần
xác nhận đầu bài trước»). Model **gpt-5.6-terra** (không phải sol như 182665ea — so sánh không cùng điều kiện), 5 lời
gọi, **0,58 USD**, **HỎNG**. Tệp ghi `fixtures/ai-run-0b7e4957.json`; phát lại tái hiện đủ năm vòng hỏng.

- Vòng 1: mô hình khai thiếu WC chung cả hai tầng và 6 phòng ngủ (đầu bài 5) — lỗi danh mục. Tầng 1 qua từ vòng 2.
- Vòng 2–5 kẹt tầng 2: ô thang lệch / `bedroom_5` chỉ vào từ ô thang; vòng 3 sửa tệ hơn bị gạt; vòng 4 phòng làm việc
  8,0 m² (sàn đầu bài 13); vòng 5 `bedroom_4` 14,5 m² (sàn 17). Cùng chỗ kẹt đã biết của đầu bài này: tầng 2 ~83 % sàn
  là phòng có sàn đầu bài (T102).
- **Ban công — chỗ duy nhất của T113 thấy được khi chưa xếp ra mặt bằng:** cả năm vòng, ban công trước nằm đúng 7 ô bề
  ngang phòng ngủ chính; ban công trái tách hẳn về phía sau, của phòng làm việc; không còn ôm góc chữ L như 182665ea.
  Chưa đúng thứ tự Haan đặt: phòng giặt phơi cũng áp mặt trái mà không có ban công (giặt phơi xếp trước làm việc). n = 1,
  khác model — chưa đủ để nói tỉ lệ.
- Đọc bản phác này lộ một chỗ D5 báo oan: dải ban công dọc mặt trước chạy tới sát góc nhà (đầu ngắn chạm mặt bên) bị tính
  «góc chữ L». Sửa: ban công dài rõ rệt dọc một mặt (cạnh dài > `long_ratio` của luật T106) không tính là ôm góc.

## T114 — AI Design thành module riêng: đầu bài ba phần, gộp phiếu mặt đứng, nhận bản vẽ kỹ sư tải lên (03/10/2026)

**Khởi nguồn.** Haan (03/10/2026): AI Design là công cụ hỗ trợ phòng thiết kế, làm độc lập, có tính module. Chuỗi việc:
đầu bài + khảo sát hiện trạng → mặt bằng công năng (ảnh + DXF, kỹ sư lấy về sửa tiếp) → ảnh mặt bằng có nội thất →
mặt đứng (ảnh + DXF) → ảnh mặt đứng có vật liệu → ảnh phối cảnh. Hai bước ảnh nhận nguồn là bản AI vẽ HOẶC bản kỹ sư
đã sửa / tự vẽ. «Gộp toàn bộ khảo sát của thiết kế mặt đứng vào khảo sát đầu bài, chia rõ phần chung cho cả nhà, phần
mặt bằng công năng, phần mặt đứng, để prompt chính xác và không thừa thông tin.» Ảnh phối cảnh chỉ lấy phần cần.

**Haan chốt bốn lựa chọn:** (1) tách mã + trang riêng, vẫn gắn `design_projects` để giữ RLS và artifact; (2) bản vẽ
tải lên là ảnh PNG/JPG/PDF (không đọc DXF); (3) đầu bài ba phần, gắn nhãn từng câu; (4) phần mặt đứng nằm trong đầu
bài, để trống thì AI đề xuất, kỹ sư sửa được ngay trước khi dựng mặt đứng — một nguồn dữ liệu.

**Thay một quyết định cũ.** T62 ghi «sáu mục là số đã chốt». Nay biểu mẫu có ba PHẦN và bảy mục: sáu mục cũ giữ
nguyên `id` (lớp phủ T63 không gãy), mục thứ bảy `mat_dung` là phiếu mặt đứng T59 cộng câu phong cách.

### Đợt 1 — đầu bài ba phần (đã làm)

1. `brief-form.json` 2.0.0: khoá `parts` (Chung cho cả nhà · Mặt bằng công năng · Mặt đứng), mỗi mục khai `part`.
   Chung = Công trình–khu đất, Ưu tiên–ngân sách (lên đứng thứ hai vì thuộc phần Chung). Mặt bằng = Gia đình, Công
   năng, Khối nhà–thang–lối vào–ban công, Kỹ thuật. Mặt đứng = `style`, `legacy.style_note`, `facade`.
2. Nhãn `for` từng câu: lời gọi AI nào thấy câu ấy (`plan` / `facade` / `perspective`). Không khai thì theo phần
   (`BRIEF_PART_TARGETS`). Khai hẹp lại 27 câu phần Chung chỉ mặt bằng dùng (ranh, khoảng lùi, pháp lý…), khai rộng
   ra 8 câu phần Mặt bằng mà mặt ngoài cũng cần (sân, quan hệ trong–ngoài, cốt nền, bậc tam cấp, kinh doanh tại nhà,
   nước nóng mặt trời, cục nóng điều hoà, số ô tô cho phối cảnh). Nhãn chỉ có hiệu lực từ Đợt 2.
3. Hợp đồng đầu bài 1.6.0 thêm `facade` — cùng hình dạng phiếu `ai-facade-brief`, bỏ khoá máy chủ và `style`. Phép thử
   `brief-facade-part.test.ts` canh hai bản chép khớp từng mục. Đổi qua lại: `facadeBriefFromBrief`,
   `briefFacadeFromFacadeBrief` (`shared/src/design/facade-brief-part.ts`); mục thiếu là `null`, không điền mặc định.
4. Điều khiển `facade` của biểu mẫu dùng lại đúng bộ ô của bước Mặt đứng (`FacadeBriefFields`), danh mục vẫn lấy
   từ Worker. Thanh bước xếp theo phần. Lớp phủ lưu trước T114: vá của câu đã dời mục được dời theo
   (`relocateFieldPatches`), thứ tự mục áp trong từng phần; màn hình quản trị chỉ đổi chỗ mục trong cùng phần.

**Còn hở sau Đợt 1:** bước Mặt đứng vẫn đọc phiếu `ai_facade_brief` riêng; phần mặt đứng trong đầu bài chưa đi vào
lời gọi nào (Đợt 2 nối, Đợt 3 bỏ phiếu riêng). Câu cốt nền hỏi hai chỗ, khác mốc đo — Q-61, Haan giữ cả hai (03/10/2026).

### Đợt 2 — lời dẫn chỉ nhận đúng phần cần (đã làm)

1. `brief/slice.ts`: `digestFor(digest, target)` làm trống mọi câu có nhãn `for` không chứa lời gọi đó (mảng → rỗng,
   còn lại → `null`); `compactDigest` bỏ ô trống cho lời dẫn dạng JSON. Đây là chỗ DUY NHẤT đọc nhãn. Chỉ áp cho chữ
   GỬI MÔ HÌNH — bộ kiểm đầu bài, bộ xếp, cổng, thước chấm vẫn đọc digest đầy đủ (T65).
2. Mặt bằng + chương trình: `briefNarrative` tự cắt `plan` — hết «Phong cách mong muốn» và «Về phong cách».
3. Mặt đứng: `facadeBrief` thay sáu trường nhặt tay bằng mọi câu gắn `facade` (thêm địa phương, kích thước lô, cao độ,
   mặt nắng gắt, sân, cốt nền, bậc tam cấp, kinh doanh tại nhà, nước nóng mặt trời, cục nóng, mức hoàn thiện, ưu tiên).
4. Phối cảnh: `perspectiveContext` nhận digest đã cắt `perspective`. Bộ chọn đã gọn sẵn (kích thước lô, hiện trạng
   bốn phía, hướng, số xe; phần còn lại lấy từ mặt bằng và ý tưởng mặt đứng) — nay nhãn canh nó không đọc được câu
   ngoài phần của mình.
5. Nguồn yêu cầu mặt đứng: `facadeBriefOfArtifact` — đầu bài có phần `facade` thì lượt chạy theo đầu bài
   (`facadeBriefRef` trỏ vào chính artifact đầu bài, kiểm mã danh mục trước khi chạy), chưa có thì lùi về phiếu
   `ai_facade_brief` cũ.
6. Khảo sát hiện trạng chỉ đi vào mặt bằng. Câu hỏi tự thêm: tra phần theo nhãn trong cấu hình; không tra ra thì
   coi như phần Mặt bằng, đúng chỗ chúng tới trước T114.
7. Lời dẫn 9.6.0 (chữ các khối lời dẫn không đổi, chỉ đổi phần đầu bài chèn vào). Phép thử `brief-slice.test.ts`,
   đột biến M127 (bỏ lọc nhãn).

**Không cần làm:** mục «không làm cũ mặt bằng khi chỉ sửa phần mặt đứng» của kế hoạch — không có chỗ nào đánh dấu mặt
bằng cũ theo đầu bài; dấu cũ chỉ có ở mặt đứng so với phương án mặt bằng đang chọn.

**Chưa đo:** bỏ phong cách khỏi lời dẫn mặt bằng có thể đổi chất lượng mặt bằng. Phát lại 204 vòng ghi không đo được
(phát lại dùng câu trả lời mô hình đã ghi, không gửi lời dẫn mới); đo thật cần lượt gọi trả phí — chờ Haan cho phép.

### Đợt 3 — trang AI Design riêng, phiếu mặt đứng ghi vào đầu bài (đã làm)

**Haan chốt 03/10/2026:** lưu yêu cầu mặt đứng ở bước Mặt đứng = **tự sinh phiên bản đầu bài + tự xác nhận**.

1. Route `tk/ai-design` (danh sách hồ sơ, cùng bảng với Dự án thiết kế, khác đích dòng) và `tk/ai-design/:id`; mục «AI
   Design» trên thanh phụ Module TK. Trang chi tiết (`web/src/pages/tk/ai-design-page.tsx`) có dải bốn bước: **Đầu bài
   và khảo sát** · Mặt bằng · Mặt đứng · Phối cảnh. Chưa có đầu bài đã xác nhận thì mở sẵn bước 1. Tab «AI Design» của
   trang hồ sơ chỉ còn nút «Mở AI Design» — một công cụ, một chỗ chạy.
2. Ranh giới module ở web: trang nằm ở `tk/` (được nạp hook Module TK), bước đầu bài đưa vào `AiDesignTab` qua vùng
   chèn `inputs` — `tk/ai/` không biết đầu bài sửa bằng gì. Phép thử `ai-independence.test.ts` thêm hai luật: nhánh AI
   phía Worker chỉ import trong `workers/src/design/` + tệp dữ liệu (`contracts/ kb/ rules/ config/`) + gói đã khai;
   `web/src/pages/tk/ai/` chỉ dùng thành phần giao diện chung và hook của chính nó. Đã thử cài một import cấm → đỏ.
3. `POST /design/ai/facade/brief/:projectId`: chép đầu bài đang hiệu lực sang phiên bản mới, chỉ đổi `style` và
   `facade`, nguyên nhân «Kỹ sư sửa yêu cầu mặt đứng ở bước Mặt đứng (AI Design).», rồi xác nhận bằng `confirmBrief`
   (tách khỏi route `/design/brief/confirm`, `brief/confirm.ts` — hai nơi gọi một hàm). Đầu bài đang có bản NHÁP chưa
   xác nhận thì từ chối (409): xác nhận ở đây sẽ ký nhận luôn sửa đổi dở dang ở phần khác. Nội dung không đổi thì không
   sinh phiên bản (`sameJson` — so nội dung, vì jsonb tự xếp lại khoá; bản đầu so chuỗi và đẻ phiên bản thừa, bắt được
   khi chạy thật trên CSDL máy). Phiếu `ai_facade_brief` không còn ghi mới; bản cũ vẫn đọc được.
4. `GET /design/ai/facade/brief/:projectId` đọc từ đầu bài đã xác nhận trước, phiếu cũ sau.

**Đã chạy thật trên máy** (Vite 5173 + wrangler dev 8788 + Supabase máy): danh sách, trang chi tiết, bước đầu bài với
thanh ba phần và mục Mặt đứng (danh mục tải từ Worker), nút ở tab hồ sơ; gọi route lưu ba lần — lần đầu tạo phiên bản 2
đã xác nhận, gửi y hệt trả `unchanged`, đổi độ dốc mái ra phiên bản mới. Hồ sơ demo TRÊN MÁY nay có phiên bản 2–4 do
phép kiểm này sinh (phiên bản 3 là bản thừa của lỗi đã sửa). Chưa chạy được bước Mặt đứng trên giao diện: hồ sơ máy chưa
có phương án mặt bằng, dựng một phương án là lượt gọi AI trả phí.

### Đợt 4a — kỹ sư tải bản vẽ lên làm nguồn ảnh (đã làm)

1. Artifact mới `ai_uploaded_drawing` (`contracts/ai-uploaded-drawing.schema.json`, migration 0153): PNG đúng một
   trong ba khung mô hình ảnh nhận, `drawing` mặt bằng / mặt đứng, tầng, băm, ghi chú (không gửi mô hình),
   `identity_cleared: const true`. Tên tệp gốc cố ý không lưu (hay mang tên khách).
2. Tuyến `/design/ai/uploads` (`ai/upload-routes.ts`, phần thuần ở `ai/upload.ts`): tải lên, liệt kê, đọc tệp, vẽ
   ảnh từ bản, đọc tấm mới nhất. Ảnh vẽ ra dùng LẠI `ai_plan_sheet_image` / `ai_facade_image` với `upload_ref` (hai
   hợp đồng nới `plan_ref` / `facade_ref` thành có thể rỗng, `anchor.source` thêm `engineer_upload`) và cùng hai bước
   lineage. Khác bản AI: ảnh neo do máy chủ tự đọc từ kho, nên biết chắc mô hình nhận tấm nào.
3. Lời dẫn 9.7.0, khối `upload_image`: không kể phòng (không có toạ độ), tên phòng chép đúng bản vẽ hoặc để trống,
   không chép khung tên / con dấu / tên khách. Mặt bằng lấy phong cách đầu bài; mặt đứng lấy phần Mặt đứng của đầu bài
   (cùng khối REQUIRED / để AI chọn của lời dẫn ý tưởng mặt đứng).
4. Trình duyệt chuẩn hoá (`web/src/lib/drawing-upload.ts`): PNG/JPG giải mã thẳng, PDF dựng trang đã chọn bằng
   `pdfjs-dist` (nạp khi gặp PDF), cắt lề theo phần trăm để bỏ khung tên, chọn khung theo tỷ lệ, thu vừa + đệm trắng,
   không kéo méo. XEM TRƯỚC đúng tấm sẽ gửi.
5. Hàng rào dữ liệu hạng 1 (T12) ba lớp: ô xác nhận trên màn hình (nút khoá khi chưa tick), máy chủ từ chối
   (`checkUploadRequest`, đột biến M128), hợp đồng `const true`. Ô tệp gốc ẩn sau nút tiếng Việt (CLAUDE.md 4.1).
6. Giao diện `ai-upload-panel.tsx` ở cuối bước Mặt bằng và bước Mặt đứng, không phụ thuộc bản AI; hỏi lại khi vẽ lại
   bản đã có ảnh; nhãn hai lớp trên ảnh.

**Đã chạy thật trên máy:** chọn ảnh mặt bằng mẫu có khung tên giả ở cạnh phải → xem trước 1536×1024 → cắt phải 18 % →
khung tự đổi 1024×1024, khung tên mất → tick → tải lên → hiện trong danh sách, ảnh nguồn đọc lại qua tuyến có kiểm
quyền. **Chưa chạy lượt vẽ ảnh thật** (trả phí, ~0,03 USD/tấm với GPT Image 2) — chờ Haan cho phép.

### Đợt 4b — phối cảnh từ mặt đứng tải lên (đã làm, 04/10/2026)

**Haan chốt:** cách (a), nhưng không bắt kỹ sư khai thêm — «số tầng nhà và chiều sâu nhà đã có trong đề bài rồi, chiều
cao nhà thì sẽ có trong bản vẽ mặt đứng (ảnh phối cảnh không cần chính xác 100 % về kích thước — chỉ cần tương đối đến
90 % là được)».

1. `perspectiveContextFromBrief` (`ai/perspective/context.ts`): số tầng theo đầu bài; khối nhà = thửa trừ sân mong muốn
   (`massing.yard_depth_m`), thiếu thì trừ khoảng lùi, thiếu nữa thì sát ranh; cốt nền theo đầu bài; chiều cao `null`
   → lời dẫn nói «as tall as the attached front elevation drawing shows». Cửa, ban công: để trống — nằm trên bản vẽ.
   Ba câu đầu bài thêm nhãn `perspective` cho việc này: sân mong muốn, khoảng lùi, cốt nền.
2. `facadeLookFromBrief` (`ai/facade/image.ts`): vật liệu, màu, mái, cổng–rào theo phần Mặt đứng của đầu bài; mục chưa
   chốt nói «as drawn / to suit the style», không bịa.
3. `perspectivePlanFromUpload`: đủ năm góc; tấm ban ngày neo vào chính bản vẽ tải lên (máy chủ đọc từ kho), bốn góc kia
   dựng từ tấm ban ngày. Góc nghiêng và góc trên cao KHÔNG còn bị bỏ vì thiếu tờ mái — chiều sâu có trong lời dẫn, và
   Haan chấp nhận sai số ~10 %. Cận cảnh: ban công nếu đầu bài bắt buộc ban công mặt trước, không thì cổng.
4. `POST /perspective/runs` nhận `uploadId` (thay `artifactId` + ảnh neo trình duyệt); `/redraw` đọc `upload_ref` của bộ
   ảnh. Hợp đồng `ai-image-set`: `facade_ref`, `plan_ref` có thể rỗng, thêm `upload_ref`. Tham số lượt chạy
   `facadeUploadRef`.
5. Màn hình bước Phối cảnh: chọn nguồn «Ý tưởng mặt đứng của AI / Bản vẽ kỹ sư tải lên» và chọn bản; mặc định ý tưởng AI
   nếu có (đo được), không thì bản tải lên.

**Đã chạy thật trên máy:** tải ảnh mặt đứng mẫu ở bước Mặt đứng (khung dọc 1024×1536) → bước Phối cảnh tự chọn bản tải
lên, hiện đúng bản, nút dựng sẵn sàng. **Chưa bấm dựng** (năm lượt gọi ảnh trả phí) — chờ Haan cho phép.

## T115 — Bàn giao «prompt pipeline v5»: lời dẫn 9.8.0, lược đồ hình chữ nhật (cách A), tầng mái (04/10/2026)

**Khởi nguồn.** Haan giao `handoff-claude-code-prompt-pipeline-v5.md` (03/10/2026) kèm bản review
`handoff-floorplan-prompt-review.md`. Bước T1 của bàn giao (khảo sát, ánh xạ) ở
`doc/design/prompt-v5-mapping.md`. Tài liệu đích `prompt-mat-bang-v5.md` không có trên máy; phần lời dẫn tự viết theo
tinh thần bàn giao. Nhiều mục P0 của bản review đã sửa ở T112 (9.4.0).

**Haan chốt 04/10/2026:** (1) hình học theo **cách A** — «phương án tối ưu nhất để ra bản vẽ mặt bằng tốt nhất, token
là yếu tố thứ hai»; (2) luôn vẽ tầng mái; (3) giữ quy tắc cũ cho phong thuỷ (câu ràng buộc người đã quyết, PRD 2.3) và
kết cấu (không tự kiểm); (4) chạy lượt thật SAU khi xong cải tiến.

### Đã làm

1. **Lời dẫn 9.8.0** (cả hai chế độ): tri thức không còn tên / dải diện tích / `served_from` của loại chỉ-khi-hỏi mà đầu
   bài không hỏi; đầu bài viết rõ «Mặt giáp lối đi công cộng, mở cổng được», «Số cánh nhà», «Số lõi thang» thay ba câu
   mơ hồ; vòng sửa gửi phần riêng ở **khối sau** (`promptTail`) cùng khoá đệm — OpenAI `prompt_cache_key`, Anthropic
   `cache_control` cuối khối đầu bài (Gemini không: đệm ngầm chỉ từ 4.096 token). Số token đọc từ đệm và token suy nghĩ
   đã nằm trong bản ghi lời gọi (`prompt-record`), không cần cột CSDL.
2. **Cách A — lược đồ hình chữ nhật** (`contracts/ai-house-layout`, cờ `AI_PROMPT_PIPELINE=v5`, ghi vào params lúc
   khởi động lượt): mô hình khai mỗi phòng `rect` = [x, y, rộng, sâu] mm bước 100, quan hệ `door` thay `adjacent`.
   `ai/layout.ts` bắt bước, căn vách lệch ≤ 300 mm về một đường (kể cả mép khối), cắt chồng mỏng, rồi đổi ra **bản phác
   lưới 0,5 m** và đi ĐÚNG bộ xếp hiện có. Chồng dày / lỗ giữa nhà / vượt khối là câu nhắc cho vòng sửa, không chặn.
   Khối lời dẫn `house_layout` (lời dẫn hệ thống, lấy mẫu lại, sửa, 31 câu nhắc ghi đè dòng nói «ô / hàng / cột»); tham
   số ô của lỗi đổi sang mm trước khi điền (`gridParamsInMm`). Tri thức nói mm / m²: `block_mm`, `min_rooms`
   (`rect_m2`, `min_side_mm` = số ô × cỡ ô của chính lưới bộ xếp kiểm), `corridor_min_mm`, `door_wall_mm`,
   `stair_min_mm`.
3. **Tầng mái** (`kb/roof_plan.yaml`, `ai/roof.ts`): phần `roof` riêng của `ai_floor_plan` (hợp đồng thêm trường tuỳ
   chọn) — KHÔNG phải một tầng của `levels`, nên mặt đứng, thước chấm, cổng không đổi. Tum = ô thang tầng trên cùng +
   chiếu tới 1,2 m quay ra phần mái rộng nhất; khu đầu bài đòi (sân thượng luôn có; cục nóng khi đặt ở sân thượng; bồn
   nước + NLMT khi bồn trên mái hoặc có NLMT; sân phơi khi phơi ngoài trời và không có ban công phơi) lấy từ rect mô hình
   khai ở `knowledge.roof_level`, thiếu thì chương trình tự đặt (bồn nước đè khu ướt, sân thượng là mảng lớn nhất trước
   cửa tum). Tờ «Mặt bằng — Mái» vẽ bằng chính bộ vẽ tờ mặt bằng (tầng tổng hợp chỉ để vẽ), có trong DXF; màn hình thêm
   mục «Mái», ẩn ảnh nội thất và ô yêu cầu sửa trên mái. Số kích thước ở `kb/roof_plan.yaml` là THAM KHẢO, chờ KTS duyệt.

### Số đo (miễn phí, không gọi mô hình)

- Lời dẫn ca Hưng Yên: lược đồ đầu ra 5.422 → 3.200 ký tự; tổng gửi đi ~18.300 → ~16.200 ký tự.
- **Bộ xếp với lưới 0,5 m** (phát lại 51 lượt / 209 vòng, bản phác cũ nhân đôi độ phân giải, cùng thước 5): 19 → 18 vòng
  qua, điểm TB 67,0 → 66,8; hành lang > 1,5 m 6/19 → 5/18; B1 (phòng hẹp) TB 1,32 → 1,22. Chỉ 2/209 vòng lệch — bộ xếp
  gần như không phụ thuộc cỡ ô, nên lưới mịn giữ được độ chính xác của rect mà không mất phương án.
- Khứ hồi bản phác → rect → bản phác trên hơn 100 tầng thật toàn phòng chữ nhật: y nguyên.

### Còn mở

- Lợi thật của cách A (ít lỗi hơn, ít token suy nghĩ hơn) chỉ đo được bằng lượt thật — Haan chốt chạy sau cùng.
- Vòng sửa đã gửi theo TẦNG (T86); «delta theo phòng» của bàn giao (T9) chưa làm — lợi token, không lợi chất lượng.
- Bộ xếp chưa đọc kích thước rect làm mục tiêu cạnh (mới dùng diện tích suy từ rect).
- `kb/roof_plan.yaml`: chiếu tới tum, cỡ tối thiểu từng khu — KTS NVG duyệt.

### T115 (tiếp) — Theo đúng `prompt-mat-bang-v5.md` (Haan gửi tài liệu đích 04/10/2026)

**Haan chốt thêm 04/10/2026:** danh mục phòng **theo v5, có nới** (chương trình cấp danh mục có mã từ đầu bài; mô hình
chỉ tự thêm hành lang `gt_`, thang `thang`, sảnh `sanh`, ban công `bc_`, và `wc_` / `kho_` / `hkt_` khi cần — thay
T41/T45 ở chế độ hình chữ nhật); ngân sách giao thông **giữ trừ điểm** (T49), không thành luật.

Đã làm (chỉ chế độ hình chữ nhật, cờ `AI_PROMPT_PIPELINE=v5`; bản phác lưới không đổi):

1. **Hợp đồng theo mục 5**: `ai-house-layout` chỉ còn `rooms {id, level «1»/«2»/«roof», rect}`, `doors`, `open`,
   `cantilevers {id, from_room, face, depth}`, `design_notes`, `entry_room`, `garage_room` (rỗng = không có). Gốc toạ
   độ **góc lô**. Loại, phòng mẹ, diện tích mục tiêu do chương trình suy (`ai/house-program.ts`, `kb/house_program.yaml`).
   Mã danh mục giữ nguyên tới bản vẽ (`programFromProposal({ keepIds })`) — vòng sửa gửi lại đúng mã ấy.
2. **Danh mục phòng** (mục 4 `program`): ghép phòng ngủ đầu bài với thành viên theo tầng + loại (khép kín trước, rồi
   thứ tự `bedroom_role_order`); WC riêng / ban công riêng có phòng mẹ; tiện ích trong phòng vào tên phòng; thang máy
   mỗi tầng một dòng; khu mái từ `kb/roof_plan.yaml`. Ca Hưng Yên ra đúng danh sách tài liệu (phép thử).
3. **Lời dẫn mục 2 + catalog luật mục 3** (`house_layout.rules`, 19 luật có `when`, lọc và đánh số theo ca —
   `ai/layout-prompt.ts`); thân lời gọi `<rules><knowledge><brief>`; câu nhắc vòng sửa mang số luật («R10 Storey 2: …»).
   Tri thức theo mục 4: `site` (lô, vùng xây, mật độ, mặt có hướng la bàn, lối vào, cao độ), thang, ban công
   (mặt đua + độ đua, mặt bắt buộc / tuỳ), chỗ đỗ, `min_side_mm`, **đồ đạc + khoảng trống** (`kb/furniture.yaml`, số
   của tài liệu, chờ KTS duyệt), danh mục, khả thi từng tầng, ưu tiên. Đầu bài rút gọn theo mục (`brief_sections`).
4. **Ban công đua không chiếm sàn** (`cantilevers`): bộ dựng ô gắn một ô ban công ngoài khối, áp đúng cạnh ngoài của
   phòng chủ (`tree/index.ts#attachCantilever`), độ đua hạ về mức đầu bài; không gắn được là lỗi `cantilever_dropped`
   gửi mô hình sửa. Sửa đúng chỗ lượt 182665ea: ban công cũ sâu 2 m, ăn 1 m sàn.
5. **Vòng sửa trả delta** (mục 6, `contracts/ai-house-layout-delta`): gửi `<plan>` mới nhất + `<errors>` ở khối sau;
   chương trình gộp (`mergeLayoutDelta`), bỏ phần đụng tầng đã khoá.

Số đo (không gọi mô hình): lời dẫn ca Hưng Yên **~18.300 → ~12.900 ký tự** (hệ thống 5.217 → 1.853; lược đồ 5.422 →
2.758; thân 7.645 → 8.287, vì thêm danh mục, đồ đạc, luật). Lượt 182665ea vòng 3 qua đường v5: **63,4 %** (lưới 1 m
60,2; lưới 0,5 m 56,9).

Chưa làm so với tài liệu: mặt thành thoáng khi khối lùi ≥ 2 m (mặt thoáng còn cố định theo khảo sát); `footprints`
khai riêng (chương trình suy từ hợp các rect); cao độ đầy đủ và ghi chú tam cấp trong `site`.

**Phát lại đường v5 (04/10/2026) — không đo được v5, cần lượt thật.** 209 vòng ghi (bản phác lưới cũ) đổi sang rect
bằng `layoutFromRecorded` rồi đi đường v5: qua 4–5 vòng, so với 19 (lưới 1 m) và 18 (lưới 0,5 m). Soát từng vòng tụt,
lỗi nằm ở BỘ ĐỔI, không phải ở v5: 7 vòng (lượt `4a521f52`, `5aba737d`, `5fda70dc`) ghi trước T48, không có bản phác;
WC khép kín bản phác cũ vẽ chung ô với phòng mẹ (đã sửa: cắt một dải phía tâm khối, cạnh ≥ 1,2 m); dòng danh mục ghép
sai phòng mẹ theo diện tích (đã sửa: ưu tiên phòng có phòng con cùng loại); còn lại hành lang chữ L không biểu diễn
bằng một rect và ban công cũ không thành `cantilevers`. Mô hình nhận lời dẫn v5 khai rect ngay từ đầu, nên con số
phát lại là cận dưới lỏng — quyết định giữ / bỏ v5 phải đợi lượt thật. Kết quả ở `.sao-luu/t115-phat-lai/r-h-v5*.txt`.

**Lượt thật đầu tiên (04/10/2026, Haan cho 2 lượt):** cùng đầu bài «Biệt thự nhà vườn (demo)» (NVO-TK-2026-2737),
GPT-5.6 Terra, 1 phương án, không gói kinh nghiệm, Worker tại máy. Cả hai HỎNG sau 1 lời gọi đầu + 4 vòng sửa:
lưới hiện tại (`83e5c327`) qua tầng 1, hỏng tầng 2 (`wc_3` không chữ nhật, cửa từ ô thang, phòng không lối vào) —
0,465 USD; v5 (`124a1fa2`) hỏng ngay tầng 1 (cửa gara chỉ đặt được trên cạnh giáp ranh; `wc_1` không đủ tường chung
với đường về thang, `storage_1` chỉ vào qua ô thang) — 0,458 USD. Token vào v5 ít hơn ~20 % (3.253 so với 4.533 lời gọi
đầu; ~4.990 so với ~6.020 mỗi vòng sửa), token ra ngang nhau. Một cặp lượt không đủ kết luận v5 tốt hay tệ hơn; lỗi
v5 nằm ở chỗ rect của mô hình đi qua bộ xếp lưới (lối vào gara, đường về thang) — đúng phần cách A còn mở.

**Lượt thật thứ hai — nhà ống (04/10/2026, Haan cho 2 lượt).** Hồ sơ demo NVO-TK-2026-2799 «Nhà ống 5 × 18 m Hoàng
Mai» (Claude dựng theo yêu cầu Haan; đầu bài lưu ở `.sao-luu/t115-phat-lai/nhaong-brief.json`): nhà phố 4 tầng, Hà Nội,
ba mặt giáp nhà, ngõ 6 m; vợ chồng + 2 con + bà nội; tầng 1 gara–khách–bếp ăn–giếng trời, tầng 2 phòng bà khép kín,
tầng 3 bố mẹ + con trai, tầng 4 con gái + thờ + giặt + sân thượng; thang chữ U; ban công mặt tiền đua 0,9 m. Cả hai hỏng:
- Lưới (`fee82b18`, 0,365 USD): hỏng tầng 1 — gara / WC không giáp lối đi, khách–ăn phải xuyên ô thang, cửa sảnh còn
  78 cm vách; các vòng cuối mô hình trả gần như y nguyên.
- v5 (`139e1a3f`, 0,370 USD): lời gọi đầu sai lược đồ (`assumptions` > 200 ký tự, `rooms` rỗng); bốn vòng sau bác ở
  cổng danh mục «cần 3 phòng ngủ, đề xuất có 2». **Lỗi chương trình**, không phải mô hình: `houseProgram` đánh số phòng
  ngủ theo từng DÒNG thành viên, hai dòng «con» mỗi dòng 1 người cùng ra mã `ngu_con`. Đã sửa: đánh số theo vai trò
  trên cả nhà (`ngu_con_1`, `ngu_con_2`); phép thử `ai-house-program.test.ts` (đỏ khi gỡ sửa).
- Phát hiện kèm: `anonymiseForAi` bỏ câu trả lời của ô đang ẩn; nhà phố ẩn ô khoảng lùi / sân, nên lùi sau 1,5 m của
  đầu bài không tới mô hình (khối 5 × 18 m). Trong khi đó `brief-completeness` vẫn cảnh báo «ban công đua nhưng chưa
  khai khoảng lùi mặt trước» — bảo người nhập điền ô họ không thấy. Chờ Haan: nhà phố có cần ô khoảng lùi sau không.

**Tiếp (04/10/2026).** Haan: khoảng lùi «do chủ nhà quyết trong đầu bài» → ô `site.setback_required_m` hiện với mọi
loại hình (mật độ, sân vẫn ẩn với nhà phố); câu chặn ban công mặt giáp nhà xóm chỉ nhắc ô người nhập thấy. Chạy lại v5
nhà ống (`e34f8f58`, 0,348 USD, khối nay 5 × 16,5 m): qua cổng danh mục, hỏng tầng 1 còn MỘT lỗi — nhưng mặt bằng
đi xuống qua các vòng (bản ghi lời gọi ở `.sao-luu/t115-phat-lai/e34f8f58/`):
1. Vòng 1 đúng kiểu nhà ống (sảnh → gara 5 m → khách → thang + bếp ăn → WC, kho, giếng trời); lỗi chỉ ở kho / WC.
2. Bước «chương trình tự sửa» (`plan.ts`, `hallVariants`) chèn `hall_auto_1` giữa sảnh và gara, giữ vì «đỡ hơn» dù
   vẫn hỏng; câu nhắc vòng 3 báo «`hall_auto_1` không có lối vào» — mô hình bỏ luôn sảnh.
3. Mất sảnh, R11 đòi «phòng khách chạm mép đường»: mô hình đưa khách ra trước, gara ra SAU khách (xe đi xuyên khách).
Gốc: nhà ống 5 m có gara mặt tiền, người ở vào nhà qua lối cạnh xe — luật cứng cấm đường đi hằng ngày xuyên gara;
lời giải hợp luật là hành lang dọc cạnh gara (gara còn ~3,8 m), câu nhắc không gợi ý. Chờ Haan quyết (xem báo cáo).

**Haan chọn (a) (04/10/2026): nhà phố vào nhà qua gara, người đi cạnh xe.** Luật `entry_through: [garage, porch]` vốn
đã cho vào nhà qua gara; chỗ chặn là chương trình. Đã sửa (không gọi mô hình):
1. `arrange/doors.ts` vốn định cho gara-lối-vào HAI cửa (cửa cuốn + cửa đi) nhưng khoá khử trùng `phòng|outside`
   nuốt cửa đi → cổng báo «không có cửa ra ngoài (trừ cửa xe)». Khoá nay tách cửa xe / cửa người (cả ở
   `tree/openings.ts#normaliseDoors`); cửa cuốn sát một đầu vách (`place: start`), cửa đi sát đầu kia (`end`) — đặt
   giữa thì mặt tiền 5 m còn ~1 m mỗi bên. Chỉ khi loại hình có khai (`ArrangeInput.garageEntry`).
2. `kb/room_vocabulary.yaml` `passage.entry_room_by_building_type: { nha_pho: [garage] }` — biệt thự KHÔNG khai, hành
   vi giữ nguyên (lượt 81fd3f57 là biệt thự mô hình chọn gara làm lối vào: vẫn bác như trước).
3. `entryAlternatives`: nhà phố thử gara làm phòng lối vào (cuối danh sách) trước khi gọi lại mô hình.
4. Lời dẫn 9.9.1: luật `R_entry_garage` (`when: entry_via_garage` — nhà phố, có gara tầng 1, cửa xe cùng mặt cửa
   chính): gara được làm entry_room, không đưa phòng khách ra trước gara.
5. Bước tự sửa chỉ giữ dải `hall_auto_*` khi chính tầng ấy qua — hết câu nhắc về phòng mô hình chưa vẽ.
Đo: phát lại vòng 3 của e34f8f58 (`.sao-luu/t115-phat-lai/zz-e34.test.ts`) — tầng 1 QUA (trước: «phòng khách cần cửa ra
ngoài»), lỗi còn ở tầng 2–3 là lỗi bố cục thật. Phát lại 209 vòng lưới 1 m: 19 / 67,0 — y hệt đối chứng (không hại,
không lợi đo được: bộ ghi gần như không có nhà ống gara mặt tiền). Logic 1.872 + web 560 xanh.

## T116 — Handoff v6: luật theo loại nhà, «LLM xếp dải, chương trình tính kích thước» (04/10/2026)

Đầu vào: `~/Documents/Doc/NVG/design/handoff-v6-tong-hop.md`; phương án đối chiếu kho: `doc/design/PHUONG_AN_V6.md`
(bộ giải dải sinh `ai-plan-tree` để dùng lại cổng `ai/tree/`). Haan trả lời 04/10/2026:

1. **Oracle:** hiện chỉ có hồ sơ MR Dương (Thành phố Thái Bình) — `KT01-05 - MẶT BẰNG CÔNG NĂNG.dxf`,
   `KT06-07 - MẶT BẰNG.dxf` trong `~/Documents/Doc/NVG/hồ sơ/Hồ sơ Duong TL 0831/…/dxf/`.
2. **Nhà ống** xét theo **khối xây**, đủ cả ba: bề rộng khối xây ≤ 6 m, chiều sâu ≥ 2 lần bề rộng, giáp nhà hoặc ranh ở
   ít nhất một mặt bên. Lô góc hẹp vẫn là nhà ống, có thêm một mặt thoáng bên. **Thêm ô cho KTS ghi đè loại nhà** trong
   đầu bài.
3. **Ban công mặt thoáng (T71) tách hai:** CHẶN — ban công phải có ít nhất một cạnh ra mặt thoáng (toàn giáp ranh / nhà
   xóm là vô dụng, trái luật mở cửa); TRỪ ĐIỂM NẶNG — ban công dài quay cạnh ngắn ra mặt thoáng (lô gia, ban công phơi).
4. **Giếng trời / sân trong: giữ T96** — không tự vẽ; model chỉ đề xuất bằng lời trong `assumptions`. Nhà ống sâu ≥ 12 m
   có phòng ở không mặt thoáng: chương trình báo «nên có giếng trời» cho KTS quyết, không tự thêm.
5. **Sàn nhóm 40 %: chưa đổi, quyết bằng số liệu** — chạy oracle và phát lại 209 vòng ở cả 40 % và 25 %. Bản vẽ thật qua
   ở 40 % thì giữ; bị bác chỉ vì sàn nhóm C thì hạ sàn nhóm đó (giữ 40 % cho nhóm A). Báo cáo số rồi Haan chốt.
6. **Cửa phòng thờ (T106): sửa nghĩa, tách hai mức.** CHẶN — không có cửa đi hay lối đi trên bức tường sau lưng bàn thờ.
   TRỪ ĐIỂM — mặt bàn thờ lệch hướng gia chủ chọn, hoặc cửa phòng thờ nằm chéo ngay trước mặt bàn thờ. Bàn thờ tựa tường
   đặc; chương trình tự chọn bức tường phù hợp trước khi báo lỗi. Haan sẽ xác nhận lại câu chữ.
7. **Cục nóng trong hộp kỹ thuật: giữ chặn** (lựa chọn gia chủ khai), nhưng chương trình **tự thêm hộp kỹ thuật**
   (~0,6 × 0,8 m cạnh WC / khu ướt, liên tục các tầng) thay vì bác hay gửi model.
8. **Diện tích tối thiểu: giữ T41 (sàn cứng).** Bộ giải v6 tính diện tích nên không còn hụt vặt; không đủ chỗ thì cổng khả
   thi dừng trước khi gọi model và hiện lựa chọn nới cho KTS.
9. **Mở ô mật độ cho nhà phố, không bắt buộc.** Trống = không giới hạn ngoài khoảng lùi và vùng xây; có số thì theo chủ
   nhà khai.

Còn mở: câu 4 của phương án (validator = đường cây `ai/tree/` có sẵn) — hỏi lại trước Bước 3.

### T116 (tiếp) — Oracle MR Dương: bản vẽ thật qua cổng hiện tại (04/10/2026)

Hồ sơ MR Dương = đúng «nhà 16,43 × 5 m có thang máy» của handoff: 5 tầng, lưới trục 1–4 (5.020 / 5.500 / 5.140 mm),
khối 4.780 mm thông thuỷ, mặt tiền phía trục 4. Trình trích xuất của Container không dựng được phòng (`no_rooms` —
lớp ranh phòng chưa có trong `kb/layer_mapping.yaml`), nên mã hoá tay: kết xuất 5 tờ ra ảnh + lấy toạ độ tường từ DXF
(`NV-Tuong`, `NV-Thay`, quy về trục 1 / trục A), viết thành cây chia ô (`.sao-luu/t116-oracle/zz-oracle.test.ts`).

- **Tầng 2** (không gian mở) và **tầng 5** (khách + bếp ăn, WC, sảnh thang): QUA.
- **Tầng 1** (để xe / kinh doanh 12 m, WC + thang cuối nhà): BÁC — cửa WC cần 95 cm vách (0,75 + 2 × 0,1), nhà thật còn
  81 cm.
- **Tầng 3 = tầng 4** (2 phòng ngủ + phòng chính có WC / tủ đồ, **hành lang dọc theo cạnh dài**, thông thuỷ ~95 cm):
  BÁC — lỗ thông hành lang ↔ hành lang và hành lang ↔ sảnh thang bị đòi 110 cm vách như một cửa; mất lỗ thông thì cả
  tầng «không đi tới được từ thang» (1 lỗi kéo 8 lỗi). Hai phòng ngủ giữa nhà KHÔNG có cửa sổ (hai bên giáp nhà) — D2
  sẽ trừ hết điểm.
- Thử số đo nhà ống của handoff (cửa 0,8 / WC 0,7 / lề 0,05) ngay trong phép thử: chưa đủ — lỗ thông giữa hai không
  gian giao thông vẫn bị đòi vách cửa. Cần luật riêng: hai phòng cùng nhóm giao thông nối bằng ô thông, bề rộng tối
  thiểu = bề rộng thông thuỷ hành lang của profile, không cộng lề.
- Mẫu dải: nhà thật đặt **thang ở cuối nhà, hành lang dọc một bên** — khác mẫu 5.1 của handoff (thang giữa nhà, sảnh
  0,9 m cạnh thang). Cả hai nên có trong `<patterns>` của ỐNG.

### T116 (tiếp 2) — Đường v6 làm xong Bước 1–5 của `PHUONG_AN_V6.md` (05/10/2026)

Haan: «làm xong hết các bước thì mới cho phép test 1 lần». Bật bằng `AI_PROMPT_PIPELINE=v6`; đường lưới và v5 giữ
nguyên sau cờ. Chưa lượt thật nào chạy đường này. Mọi số mang ⚑ là số chưa ai duyệt.

- **Loại nhà** (`shared/src/design/house-profile.ts` + `.json`): `ong / pho / bt / vuon` + cờ `kd`, suy từ KHỐI XÂY
  (≤ 6 m ngang, sâu ≥ 2 × ngang, ≥ 1 mặt bên kín); ô đầu bài `house_profile_override` cho KTS ghi đè (trọng số 0).
- **Số đo theo loại nhà** (`kb/construction_norms.yaml` `by_house_profile` ⚑, gắn bằng `withHouseProfile` cùng chỗ
  `withStairShape`): cửa / cửa WC / lề / hành lang thông thuỷ; ban công nhà ống cạnh ngắn 0,5 m.
- **Bộ giải dải** (`workers/src/design/ai/bands/`): mô hình trả dải (`contracts/ai-house-bands` + delta), chương trình
  tính kích thước, dựng `ai-plan-tree` từng tầng, chọn cặp cửa; cổng `ai/tree/` có sẵn kiểm như mọi cây. Thang tầng
  trên chồng đúng toạ độ tầng 1 (cửa sổ `stairWindow` đo cả nhà trước khi đặt thang tầng 1). Dựng lại tầng 3 MR Dương
  lệch ≤ 30 cm (`ai-bands.test.ts`). Lời dẫn `house_bands` + mẫu dải theo loại nhà ở `kb/ai_design_prompts.yaml`.
- **Vòng sửa (Bước 5)**: lỗi cấu trúc của bộ giải (thiếu chiều sâu, dải trước thang quá sâu…) đi đường SỬA với chính
  bộ dải ấy trong `<plan>` (`HouseAttempt.bandsBase` → `retryPlan`), không lấy mẫu lại cả nhà; tầng đã qua khoá (T86)
  như cũ. Đường v6 tối đa **3** vòng sửa (`houseRevisionsMax`) và dừng sớm khi cùng bộ lỗi lặp **2** vòng
  (`stuckAfter`); đường cũ giữ 4 / 3. Câu nhắc của cổng cây cho đường dải ngắn, tả hiện trạng (khối `house_bands.hints`).
  **Không làm** «vòng sửa mức suy nghĩ `low`»: đổi tham số suy nghĩ giữa các lượt làm mất bộ nhớ đệm lời dẫn ở tuyến
  Anthropic — đúng điều kiện loại trừ handoff tự ghi.
- **Quyết định 2.3 đã áp**:
  - Ban công: CHẶN khi không có cạnh nào ra mặt thoáng; ban công dài quay cạnh ngắn ra mặt thoáng chỉ lưu ý, D3 nặng
    2,5. Hai phát lại lượt thật (5584bf0d, e82e3a09) nay bác ở tầng 2 vì ban công kín bốn phía — trước đó chỉ lưu ý
    vì gần vuông, cả hai vẫn bị bác ở bước sau.
  - Phòng thờ: ưu tiên phòng chủ ở vách khác vách bàn thờ dựa lưng; chỉ còn vách ấy thì vẫn mở cửa ở đó và bàn thờ
    chuyển vách đặc khác — thôi báo `altar_door_behind` (cả đường cũ lẫn bộ chọn cửa của đường dải). **Chưa có** tiêu
    chí trừ điểm «hướng lệch / cửa chéo trước mặt bàn thờ» — cần đo vị trí bàn thờ, việc còn mở.
  - Cục nóng trong hộp kỹ thuật: giữ chặn; chương trình tự thêm mỗi tầng một `shaft` 0,48 m² (`per_storey`, `min_m2`
    ở `kb/brief_fidelity.yaml`), cạnh ngắn dùng được 0,6 m. Đặt cạnh khu ướt là việc lời dẫn.
  - Giếng trời: giữ T96; nhà ống sâu hơn 12 m (⚑ `light_well_advice_depth_m`) không có giếng / sân trong → lưu ý
    `light_well_advice` trên phương án, không trừ điểm, không đòi mô hình.
  - Mật độ: ô `site.max_density` / `site.setback_required_m` hiện cho mọi loại hình, không bắt buộc.
- **Thước chấm theo loại nhà** (handoff 3.5 ⚑): `by_building_type` của `kb/plan_quality.yaml` nhận thêm khoá loại nhà,
  chồng lên loại hình đầu bài (`criterionFor(spec, buildingType, houseProfile)`), ghi đè được cả `weight`. Mới áp các
  dòng RIÊNG nhà ống: C2 0,15–0,30 · C3 trừ hết ở 3 · C4 đạt 0,9 / hết 0,8 · E2 nặng 2,5. **Chưa áp** các dòng đổi số
  chung (trọng số B1/B2, khoảng C2 nhà phố / biệt thự, C8 nhà vườn, C10 đầu cụt mở, D1/D2 sáng gián tiếp) — đổi điểm
  của mọi loại nhà, chờ Haan.
- **Sàn nhóm 40 %**: giữ — số liệu phát lại đã báo (nhóm ràng là E / D, không phải C), chờ Haan quyết.
- Đột biến mới: M129 (lô hai mặt đường bị coi là nhà ống), M130 (thang tầng trên lệch), M131 (cửa người của gara bị
  nuốt), M132 (thước chấm bỏ lớp loại nhà); M73 đổi theo luật ban công mới.

### T116 (tiếp 3) — Lượt thật đầu tiên của đường v6: 03718834 (05/10/2026)

Haan cho MỘT lượt sau khi xong Bước 1–5. Nhà ống demo 5 × 18 m (NVO-TK-2026-2799), GPT-5.6 Terra, mức suy nghĩ mặc định,
một phương án. **3 lời gọi, 0,150 USD** (0,104 + 0,027 + 0,019; lượt v5 cùng đầu bài trước đó 0,35–0,46 USD), **không ra
mặt bằng**. Dừng sớm đúng thiết kế (cùng lỗi lặp 2 vòng). Nguyên văn ở `.sao-luu/t116-v6/03718834/`, câu trả lời ở
`workers/src/design/__tests__/fixtures/ai-bands-run-03718834.json`.

- Vòng 1: câu trả lời hợp lệ ngay, đúng mẫu B (thang giữa, giếng trời), gara là lối vào, mọi tầng có thang. Bộ giải chỉ
  báo «dining_1 thiếu 400 mm bề ngang»: mô hình ghi MỌI hành lang rộng 1.500 mm, dải tầng 1 [gt_t2 1.500 | bếp 1.500 |
  ăn 2.000] trong nhà rộng 5 m.
- Vòng 2: mô hình xếp bếp, ăn theo chiều sâu → tầng 1 sâu quá khối → tệ hơn, bị gạt.
- Vòng 3: câu nhắc chỉ nhắc lại lỗi phòng ăn, không nói vì sao vòng 2 bị gạt → mô hình trả y nguyên → dừng.

Phát lại tại máy cho thấy vòng 1 vốn KHÔNG khả thi về chiều sâu: tầng 1 thiếu 2,0 m (gara + WC chung dải 5,6 m; dải
[hành lang | bếp | ăn] 5,2 m), tầng 4 thiếu 0,5 m. Bộ giải dừng ở lỗi bề ngang nên che mất lỗi chiều sâu, và mô hình sửa
nhầm chỗ. Ba chỗ sửa (miễn phí, có phép thử `ai-live-03718834.test.ts`, `ai-bands.test.ts`):

1. **Bộ giải tự thu hẹp hành lang** rộng hơn mức thông thuỷ của loại nhà khi ô cùng dải thiếu bề ngang (theo T104 —
   chương trình tự làm, không gửi mô hình), có ghi chú tự sửa.
2. **Câu nhắc lỗi chiều sâu nói chiều sâu tối thiểu TỪNG dải** («B1 [garage_1, wc_1] 5600 mm · …»); câu
   `band_before_stair_too_deep` viết lại (câu cũ «storey 1 leaves before its stair» nói về tầng 1 với chính nó).
3. **Lượt sửa bị gạt kèm lỗi chính của nó** (`revision_setback_why`) — áp cho mọi đường.

Chưa biết mô hình có xếp lại đúng chỗ khi nhận câu nhắc mới hay không: phát lại không trả lời được câu này, cần một lượt
thật nữa (chờ Haan).

### T116 (tiếp 4) — Lượt thật thứ hai của đường v6: 619f0438, GPT-5.6 Sol (05/10/2026)

Haan cho một lượt với GPT-5.6 Sol, sau ba chỗ sửa của «T116 (tiếp 3)». Cùng hồ sơ nhà ống demo. **2 lời gọi, 0,393 USD**
(0,178 + 0,215), **không ra mặt bằng**. Nguyên văn ở `.sao-luu/t116-v6/619f0438/`, câu trả lời ở
`workers/src/design/__tests__/fixtures/ai-bands-run-619f0438.json`. Phát lại cho thấy CẢ HAI câu trả lời hỏng vì chỗ của
chương trình trước khi mô hình kịp sửa — sáu chỗ, đều đã sửa, có phép thử `ai-live-619f0438.test.ts`, `ai-bands.test.ts`:

1. **`doors_prefer` mang «THANG» làm hỏng cả hợp đồng** → lời gọi 1 bị bỏ, mô hình vẽ lại từ đầu. Nay cặp sai khuôn bị
   bỏ (`dropBadDoorPairs`) — cặp cửa chỉ là gợi ý.
2. **Chiều sâu dải mô hình ghi bị coi là số cứng** → ô [WC / giếng trời] trong dải thang 4.000 mm còn 30 cm cho giếng.
   Nay là mức sàn.
3. **Chia bề ngang theo diện tích bỏ quên cạnh tối thiểu** → kho thiếu 10 cm khi bếp, ăn còn dư. Nay ô dưới mức bị ghim
   ở mức rồi chia lại.
4. **Hộp kỹ thuật cùng mã ở mọi tầng** (`hkt_1` tầng 2 → mái) bị bác ở tầng 3. Nay mã của hộp kỹ thuật / giếng trời từ
   tầng thứ hai mang hậu tố tầng (`hkt_1_t3`).
5. **Lỗi cửa / lối đi / phòng hẹp không gửi mô hình** (`REVISABLE_CODES` viết cho đường bản phác, nơi bộ xếp tự lo) →
   lời gọi 2 hỏng vì WC tầng 2 không giáp hành lang và lượt DỪNG. Nay đường dải gửi các mã ấy (`BAND_REVISABLE_CODES`).
6. **`generateAiPlan` chấm bằng lời dẫn gốc**, không qua `promptsFor` như Workflow thật → phát lại ra câu nhắc khác lượt
   thật. Nay cùng lời dẫn.

Sau sửa, phát lại lời gọi 1 của Sol: dùng được, chỉ còn lỗi chiều sâu thật (tầng 1 thừa 1,0 m, tầng 4 thừa 1,9 m) kèm số
từng dải; lời gọi 2: tầng 1 qua, tầng 2–3 còn lỗi bố cục thật (phòng không giáp hành lang), đi đường sửa. Hai lượt thật
v6 đến nay chưa vòng nào được mô hình sửa trên câu nhắc đúng — chưa đo được mô hình có sửa trúng không.

### T116 (tiếp 5) — Handoff v6 «sửa lỗi đợt 1» (05/10/2026)

Haan gửi bản rà lượt 619f0438 (P0-1…P0-4, cắt token T1–T7, mâu thuẫn lời dẫn). Đối chiếu với bản ghi thật và mã:

- **P0-1 đúng, đã sửa.** Knowledge gửi `corridor_min_mm: 1500`, `door_wall_mm: 1500` — làm tròn lên bội ô lưới 0,5 m của
  đường bản phác — trong khi mẫu dải dạy 900 và `THANG (2400)` dưới `rect_min_mm` 2.500. Hành lang 1.500 mm mọi tầng ở lượt
  Terra 03718834 chính là do số này. Nay đường dải gửi đúng số bộ giải dùng (`bandsKnowledge`, `plan.ts`): hành lang
  thông thuỷ theo loại nhà (ống 900), vách cửa = cửa + 2 × lề (ống 900), ô thang = ô bộ giải (2.500 × 4.140). Mẫu dải không
  ghi số THANG. Phép thử `ai-v6-prompt-consistency.test.ts` canh mọi số `gt (N)` / `hub (N)` ≥ hành lang tối thiểu.
- **P0-2 một phần.** `hkt_1` cùng mã các tầng — đã sửa ở «tiếp 4». Câu «Ý định tầng 2 bỏ sót … vùng mặc định» KHÔNG phải
  dải bị bỏ: cây dải vẫn được dùng, câu ấy là ghi chú vùng của bộ xếp cũ (`intentFor`) — nay bỏ khỏi đường dải.
  `THANG`, ô xếp chồng, `level` chuỗi đều đọc đúng (phát lại).
- **P0-3 không xảy ra ở lượt này**, nhưng là lỗ hổng: tầng thiếu cây dải sẽ rơi về bộ xếp cũ. Nay báo `band_level_missing`
  (`ArrangeInput.bandsOnly`). Thực tế cổng danh mục bắt trước («Tầng 3 không có không gian nào»). Câu màn hình
  `retry: none` thôi nói «bộ xếp đã thử mọi cách chia». B0 (oracle), B1 (cổng `ai/tree/`), B3 (bộ giải) đã xong.
- **P0-4 không khớp bản ghi.** Lượt 2 là lấy mẫu lại vì lượt 1 sai hợp đồng (`THANG` trong `doors_prefer`, sửa ở «tiếp
  4»), không phải lượt sửa hình học. Dòng «≈93 m² vs 81 m² over» tính bằng diện tích THƯỜNG DÙNG — bộ dải viết tay cho
  đúng đầu bài vẫn vừa. Haan chọn: một ước lượng theo mức TỐI THIỂU (`storeyLoads`, `ai/feasibility.ts`) cho cả dòng gửi
  mô hình (chỉ tầng chật / vượt, một dòng: `{"1": "tight: 80 of 81 m²"}`) và cổng chặn trước lời gọi đầu
  (`briefInfeasible`); vượt thì dừng với câu gợi ý nới, không thêm ô màn hình.
- **Token.** T1: không đặt trần token ra (Haan chọn — trần 4.000 sẽ cắt cụt, đã đo 7.879–9.822 token ra); để mức nghĩ mặc
  định thì vòng sửa đường dải trên OpenAI hạ `low` (`houseCallEffort`), Anthropic giữ một mức; tuyến vẫn chọn tự do. T2 bỏ
  `furniture`, `clearances`; T3 đầu bài chỉ giữ lời gia chủ và khảo sát chưa mã hoá; T4 nhà ống chèn MỘT mẫu (B khi có
  giếng trời, không thì A); T5 bỏ `strategy`; T6 khả thi một dòng; gộp hai dòng lỗi chiều sâu trùng nhau. Lời dẫn đầu bài
  nhà ống demo (fixture): **8.490 → 6.447 ký tự (−24 %)**, knowledge 3.549 → 2.554.
- **Mục 3 handoff.** Mẫu B: phòng ngủ sau phải giáp giếng trời khi mặt sau kín; `walk_through` bỏ `core`; nhà có gara là
  lối vào chỉ một luật lối vào (`not_entry_via_garage` / `entry_via_garage`).

Phát lại ba câu trả lời đã ghi qua mã mới: mọi lỗi còn lại là lỗi bố cục thật của mô hình — chiều sâu tầng 1 vượt 1,0–2,7 m
theo cách mô hình xếp (WC chung dải gara, hành lang trong dải bếp), tầng 4 vượt 0,5–1,9 m; WC tầng 2 không giáp hành
lang. Không còn lỗi của chương trình chặn trước khi mô hình kịp sửa. Đột biến mới M133 (số làm tròn ô lưới), M134 (v6
không chặn đầu bài vượt sàn).

### T116 (tiếp 6) — lượt thật 36fb8000: tầng 1 nhà ống quá sâu (05/10/2026)

Lượt Terra sau đợt sửa 1: 4 lời gọi, 0,253 USD (lượt đầu 0,105 USD với 6.700 token nghĩ; vòng sửa mức `low` ~0,05 USD),
không ra mặt bằng. Không còn lỗi chương trình chặn trước mô hình; mô hình hội tụ dần (tầng 1 thừa sâu 5.340 → 1.440 →
1.240 → 560 mm). Gốc: tầng 1 (gara, khách, thang, giếng trời, WC, bếp, ăn) mỗi phòng một dải nguyên bề ngang thì sâu
18,1 m trên 16,5 m; ước lượng diện tích chỉ thấy «chật 80/81 m²» nên lời dẫn không nói gì về chiều sâu.

Ba chỗ sửa (Haan đồng ý):

1. **Cổng khả thi đo chiều sâu** (`storeyDepth`, `ai/feasibility.ts`): mỗi tầng tính chiều sâu khi mỗi phòng một dải
   và chiều sâu khi ghép phòng cạnh nhau tốt nhất (quy hoạch động trên tập con, ≤ 12 ô, chưa tính hành lang nên là
   chặn dưới). Ghép tốt nhất vẫn vượt → «vượt», chặn trước lời gọi (không oan vì là chặn dưới); mỗi phòng một dải vượt →
   dòng `knowledge.feasibility` nói cả hai số và một cách nhóm phòng, thứ tự trước–sau để mô hình chọn.
2. **Bộ giải cho ô thiếu bề ngang mượn ô cùng dải** (`bands/solve.ts`): chỉ phần trên cạnh tối thiểu của ô cho; hành
   lang và ô thang không cho. Vòng cuối lượt này «giặt thiếu 100 mm» trong khi phòng thờ cùng dải dư hơn 1 m.
   Gỡ lỗi ấy làm lộ chỗ hỏng thứ hai: **chiều sâu dải mô hình ghi bị coi là mức sàn** (T116 tiếp 4 đặt ra cho số ghi
   NHỎ hơn mức cần) — dải sân thượng tầng 4 ghi 7.760 mm chiếm hết phần sau thang, ép thang tầng 1, báo thừa 3.700 mm.
   Nay số ghi lớn hơn mức cần chỉ là mong muốn: phép kiểm dùng mức cần, phần dư lấp tới số ấy trước khi chia theo ưu tiên.
3. **Mẫu `ong_b`** thêm ví dụ khi tầng 1 chật chiều sâu: [THANG | dining] hoặc [THANG | gt | stack(wc, giếng trời)],
   bốn dải, không dải thứ năm.

Phát lại lượt ấy qua mã mới (`ai-live-36fb8000.test.ts`): vòng cuối chỉ còn tầng 1 thừa 400 mm — lỗi bố cục của mô
hình; dòng chiều sâu chỉ có tác dụng từ lượt đầu, phát lại không đo được (câu trả lời đã ghi). Đột biến M135–M138.

### T116 (tiếp 7) — lượt thật 93d212a2: hai lỗi chương trình làm mất vòng sửa (05/10/2026)

Lượt Terra sau T116 tiếp 6: 4 lời gọi, 0,245 USD (lượt đầu 0,130 USD, 8.455 token nghĩ), không ra mặt bằng. Dòng chiều
sâu có tác dụng: lượt đầu mô hình tự xếp phòng cạnh nhau (WC cạnh thang, khách cạnh hành lang, bếp cạnh ăn). Hai lỗi
của chương trình:

1. **Hành lang cùng mã ở nhiều dải một tầng** (`gt_1` ở dải 2, 3, 4) bị bác «xuất hiện hai lần» — vòng 2 chỉ để đổi mã.
   Ý mô hình (một hành lang chạy suốt dọc nhà) hợp lý: `bands/layout.ts` nay đổi mã từ đoạn thứ hai thành `gt_1_b<dải>`,
   như hộp kỹ thuật trùng mã giữa các tầng. Chỉ loại `circulation`; phòng khác trùng mã vẫn là lỗi.
2. **Tầng đặt mốc thang hỏng thì tầng trên đo theo ô thang tầng 2** — vị trí ấy do phần dư của tầng 2 quyết, nên tầng 4
   dùng 13,9 m trên 16,5 m vẫn bị báo thiếu 1.200 mm và gửi mô hình. `solveBands` nay giữ mốc chỉ từ tầng thấp nhất; hỏng
   thì các tầng khác chỉ tự kiểm.

Phát lại (`ai-live-93d212a2.test.ts`): vòng sau lượt đầu chỉ còn lỗi chiều sâu tầng 1, không còn lỗi đổi mã, không còn
lỗi tầng trên giả. Vòng cuối tầng 1 thừa 1.340 mm — lỗi bố cục của mô hình; đầu bài tầng 1 nhà ống demo rất sát (ghép tốt
nhất ~15,3 m chưa kể hành lang trên 16,5 m). Đột biến M139, M140.

### T116 (tiếp 8) — chương trình dựng lại tầng 1 khi dải mô hình không vừa (05/10/2026, Haan chọn hướng (a))

Sau ba lượt thật cùng hỏng ở tầng 1 nhà ống demo, Haan chọn: khi dải tầng 1 không vừa khối, **chương trình dựng lại tầng
1** từ cùng các phòng mô hình đặt (giống «khung xương» T102), thay vì để mô hình tốn thêm vòng sửa.

- **Bộ dựng lại** (`ai/bands/rebuild.ts`): duyệt mọi cách chia ô (phòng + ô thang) thành dải vừa bề ngang, giữ 40 cách ít
  sâu nhất (`bandMinDepth`, dùng chung với cổng khả thi); dải lối vào đứng đầu; thử các thứ tự còn lại, ưu tiên giống thứ
  tự trước–sau mô hình ghi; ô thang giữ phía mô hình đặt; có biến thể thêm hành lang sát ô thang. Hành lang mô hình ghi bị
  bỏ — chương trình tự thêm.
- **Chấm bằng chính cổng** (`rescueFirstStorey`, `ai/plan.ts`; gọi ở `generateAiPlan` và `arrangeHouseStep` của
  Workflow): lọc rẻ trước (bộ giải dựng được, lối vào giáp mặt đường, mọi phòng tầng 1 đi tới được, tầng trên không tệ
  hơn mốc «tầng trên tự dựng không có tầng 1»), rồi qua `evaluateHouse`. Tầng 1 phải qua trọn; cách qua cả nhà thì dừng;
  không thì lấy cách ít lỗi tầng trên nhất — lỗi ấy gửi mô hình, tầng 1 khoá (`settled`). Không cách nào qua → mô hình
  nhận lỗi của chính nó như cũ.
- Chỉ kích hoạt khi mọi lỗi bộ giải là chiều sâu (mọi tầng) hoặc bề ngang ở tầng 1.

Dựng lại làm lộ năm chỗ đo lệch của chương trình, sửa cùng đợt:

1. **Cạnh tối thiểu là lọt lòng** mà bộ giải so với bề rộng theo tim tường — WC 90 cm tim tường chỉ 63 cm lọt lòng, cổng
   bác sau. Nay cộng phần tường của chính ô (mép khối: tường ngoài + nửa vách; trong nhà: một vách). Bước mượn bề ngang
   tính theo cm, không làm tròn bước 10 cm.
2. **Vách chung trừ 28 cm ở mọi vách** khi đặt cửa → đầu hành lang 900 mm không bao giờ có cửa (phòng ngủ tầng 2 «không đi
   tới được»). Nay trừ theo từng đầu: chạm mép khối trừ tường ngoài, trong nhà trừ nửa vách.
3. **Ô thông giữa ô thang và gara** — bộ chọn cửa mở ô thông giữa mọi cặp phòng đi xuyên được, quên luật T74. Nay theo
   `stairOpensTo`.
4. **Hành lang cùng mã ở nhiều tầng** (`gt_1` mọi tầng) bị coi là một phòng — thêm vào loại đổi mã theo tầng như hộp kỹ thuật.
5. **Ô thang tầng trên dài theo dải** khi dải thang tầng ấy sâu hơn ô thang tầng 1 (ô WC/giặt xếp chồng cạnh thang) → thang
   lệch 60–110 cm giữa các tầng. Nay ô thang giữ đúng ô thang tầng 1, phần dư sau nó thành sảnh `gt_s<tầng>`.

Phát lại bốn lượt thật: `93d212a2` — chương trình dựng lại tầng 1, cổng xác nhận tầng 1 qua và khoá, mô hình chỉ còn sửa
tầng 4 (hành lang dải sau lệch, chỉ đi qua phòng thờ). Ba lượt kia không có cách dựng lại nào qua cổng; mô hình nhận đúng
lỗi bề ngang lọt lòng / chiều sâu của nó (trước kia một phần lọt qua bộ giải rồi cổng mới bắt). Một lượt phát lại trọn
chuỗi ~0,5 giây. Đột biến M141–M148.

### T116 (tiếp 9) — lượt thật 822e699d: lượt đã vừa khối bị gạt (05/10/2026)

Lượt Terra sau T116 tiếp 8: 4 lời gọi, 0,264 USD, không ra mặt bằng — dù lời gọi 2 và 4 đã vừa khối (mô hình tự đặt
[thang | ăn] cạnh nhau), chỉ thiếu WC chung tầng 2. Ba chỗ của chương trình (Haan đồng ý sửa):

1. **`setbackRank` xếp lỗi bộ giải là nhẹ nhất**: câu trả lời không dùng được ghi `{ level: 0 }` không mã, hàm hiểu là «mọi
   tầng đã xếp» → lời gọi 2 bị gạt «tệ hơn (1 lỗi so với 2)», mô hình sửa lại từ lời gọi 1, mất hai vòng. Nay mang mã
   `answer_unusable` (`ANSWER_STAGE_CODE`, cả `generateAiPlan` lẫn Workflow), xếp tệ hơn mọi lượt đã có ý định.
2. **Cổng danh mục phòng chạy thẳng trên dải khi bộ giải hỏng** (`bandsProgramIssues`): dựng danh mục như `layoutToIntent`
   (phòng mái không tính, ô thang là phòng `stair` từng tầng, ban công đua thuộc tầng phòng mẹ, mã trùng giữa tầng mang
   hậu tố), qua cùng chuỗi gộp / nâng sàn / `checkProposal`. Lỗi «thiếu WC chung tầng 2» nay đi cùng lỗi chiều sâu từ vòng 2.
3. **Dựng lại tầng 1 cả khi tầng khác cũng hỏng ở bộ giải**: tầng 1 phải hết lỗi khi ghép cả nhà (kể cả lỗi chung mốc
   thang); không được gây thêm lỗi bộ giải ở tầng nào; tầng còn hỏng thì tạm bỏ khi chấm cổng, rồi gửi mô hình với tầng 1
   khoá (`bandsKeep`). Thứ tự ứng viên ưu tiên cách có thang nằm trong khoảng các tầng trên chịu được
   (`upperStairWindow`) — trước đó 80 lần thử đều giữ thứ tự mô hình, thang sau phòng khách, tầng trên hết chỗ. Mốc «tầng
   trên» so trên đúng các tầng mốc có (mốc bỏ tầng hỏng ban đầu mà ứng viên tính cả thì cách tốt nhất bị loại oan).

Phát lại `ai-live-822e699d.test.ts`: sau lời gọi 1 chương trình dựng lại tầng 1 [gara] [thang | ăn] [khách | WC] [bếp |
giếng trời], cả nhà qua bộ giải và cổng; vòng 2 chỉ còn một dòng «thiếu WC chung tầng 2». Đột biến M149–M153.

### T116 (tiếp 10) — Haan chấm phương án đầu tiên của đường dải (lượt a68c50bb) (06/10/2026)

Lượt Terra `a68c50bb` (4 lời gọi, 0,213 USD) là phương án đầu tiên của đường v6 được lưu (55,9 điểm, dưới ngưỡng 60).
Haan chấm sáu điểm; ba quyết định qua câu hỏi: giếng trời không thông là **chặn**; WC gầm thang **làm ngay**; nhà ống
chưa chọn thang thì **loại nhỏ nhất vừa nhà**.

1. **Bậc 1 thang đâm vào tường** — lỗi chương trình: đường dải gán cứng `up: '+y'`, bỏ qua lối vào thang T103/T105.
   Nay `placeStairEntry` (dùng lại logic bộ xếp) đặt ô mở ở đầu ngắn sát bậc 1 ở tầng 1; tầng 1 thử từng đầu ngắn có lối
   đi, lấy đầu khiến ít tầng trên bị chặn nhất; mọi tầng trên chung chiều lên ấy và phải có lối đi ở đầu bậc 1 và đầu
   bước ra (`stairSidesNeeded`: U cùng đầu, thẳng hai đầu, L cạnh ngang). Thiếu → `stair_entry_long_side` /
   `stair_end_blocked`, gửi mô hình. Bộ dải viết tay cũ (hành lang chạy dọc cạnh dài thang) bị chính luật này bắt —
   đã thêm sảnh trước đầu ngắn ở tầng trên.
2. **Giếng trời chỉ ở tầng 1** — luật CHẶN mới (`lightWellIssues`, `light_well_not_stacked`): giếng ở tầng nào thì mọi
   tầng trên phải có giếng trời phủ ≥ 80 % chỗ ấy hoặc để trống (« . », sân); không phòng có mái nào đè quá 20 %. Bộ
   giải hỏng thì soát thô ngay trên dải (`bandsLightWellHints`) để lỗi đi cùng vòng. Cả bốn lượt thật 822e699d,
   93d212a2, 619f0438, 36fb8000 đều bị lỗi này — mô hình chưa từng lặp giếng lên trên.
3. **WC hẹp dài** — `max_aspect.wc: 3` riêng nhà ống (`by_house_profile.ong.max_aspect`, mức chung 6 giữ cho bộ xếp
   cũ); câu nhắc chỉ cách xếp chồng ô.
4. **Bếp liền phòng ăn; thang nhỏ nhất** — tiêu chí C13 (phòng ăn không liền bếp, nặng 2, chỉ nhà ống — `only_profile`;
   hai lượt nhà phố cũ tụt điểm khi áp chung nên giới hạn đúng lời Haan); mẫu dải sửa. Nhà ống đầu bài chưa chọn thang →
   loại chiếm ít diện tích nhất vừa khối (thẳng 5,9 m² thay U 7,7 m²); đầu bài nhà ống demo đã chọn U nên giữ U.
5. **Giặt phơi gần sân thượng / ban công** — D4 nặng 2; luật `B_laundry` trong lời dẫn.
6. **WC gầm thang** (thang thẳng): `stairs.under_use_height_m: 2,2` (⚑ suy luận) → phần gầm dùng được ~1,6 m
   (`underStairCm`). Tầng 1 ô [THANG / WC] xếp chồng: thang giữ phần thấp, WC dưới đầu cao, chiều lên hướng về WC;
   hợp đồng cây thêm `stair.over`; cổng vẽ và kiểm chiều dài trên ô gộp, mốc tầng trên là ô gộp. Lời dẫn báo
   `knowledge.stair.under_mm` khi có.

Bộ dải viết tay nhà ống demo (đã thêm sảnh trước thang tầng trên, WC xếp trước giếng trời) qua cổng 68,2 điểm. Đột
biến M154–M160. Hợp đồng `ai-plan-tree` / `ai-floor-plan` đổi (`stair.over`) — phát hành phải cùng lúc API và giao diện.

### T116 (tiếp 11) — lượt thật 41ffe1e5: bốn lỗi chương trình

Lượt thật 06/10/2026 (Haan cho một lượt): nhà ống demo, GPT-5.6 Terra, 4 lời gọi, **0,281 USD, không ra mặt bằng**.
Phát lại (`ai-live-41ffe1e5.test.ts`) cho thấy cả bốn chỗ hỏng đều ở chương trình:

1. **Mã kèm đường dẫn** — lời gọi 1 viết `knowledge.model_added.gt_t1`; hợp đồng bác cả bộ, vòng sau lấy mẫu lại
   (0,09 USD mất). Nay `stripKnowledgePaths` bỏ tiền tố trước khi kiểm hợp đồng — chỉ chuỗi trọn là một đường dẫn.
2. **Giếng trời cùng mã mọi tầng** — bộ dải đổi thành `light_well_1_t2`… (như hộp kỹ thuật), nhưng mã chương trình
   `light_well_1` không có tiền tố `model_added` nên mã đổi mất loại → «không có trong danh mục» ở cả bốn vòng. Nay mã
   đổi mang loại của mã gốc.
3. **Câu nhắc đổ sai tầng** — mái đặt sân phơi + sân thượng 10,5 m TRƯỚC thang, đẩy mốc thang chung lùi về sau; câu cũ
   «tầng 1 sâu hơn khối 1,96 m» → mô hình nén tầng 1 ba vòng, tới đúng bằng bộ dải viết tay mà vẫn hỏng. Nay mã mới
   `band_stair_clash`: một dòng nói tầng nào dồn trước thang, tầng nào dồn sau, kèm dải của cả hai, và **tầng lệch** là
   tầng tự nó sâu quá khối, không thì tầng còn nhiều chiều sâu trống hơn (mái trống 1,8 m, tầng 1 trống 0,26 m). Luật
   `B_roof` thêm: dải mái trước thang không sâu hơn tầng 1, sân thượng / phơi để cạnh hoặc sau đầu thang.
4. **Bộ dựng lại tầng 1** — đẩy THANG ra sát tường trong khi mô hình đặt giữa → mọi tầng trên `band_cell_too_narrow`;
   và lỗi giếng trời của tầng 4 chặn luôn cách dựng lại. Nay giữ thứ tự trái–phải mô hình ghi cho thang và hành lang;
   chỉ còn lỗi kiểm bố cục ở tầng khác thì giữ tầng 1 (`bandsKeep`), lỗi kia đi mô hình. Bộ dựng lại chạy cả khi tầng 1
   là một bên của cặp tầng ép mốc thang; lỗi `band_stair_clash` đếm chung cả nhà (tầng gắn nhãn đổi theo cách dựng).

Phát lại lời gọi 2: tầng 1 dựng lại thành [gara] [khách] [giếng trời | THANG | WC] [ăn | bếp] — đúng cách mô hình tự
tìm ra ở lời gọi 4 — khoá tầng 1, câu nhắc chỉ còn mái lệch và thiếu WC chung tầng 2. Đột biến M161–M165.

### T116 (tiếp 12) — lượt thật df9da65a: giếng trời chia lệch trong ô xếp chồng

Lượt thật 06/10/2026 (Haan «test 1 lần»), sau tiếp 11: Terra, 4 lời gọi, **0,218 USD, không ra mặt bằng**. Câu nhắc
`band_stair_clash` có tác dụng: lời gọi 2 dời thang lên dải 2 ở mọi tầng, mốc thang thống nhất ngay (lượt 41ffe1e5 mất
cả bốn vòng ở chỗ này). Hỏng vì một lỗi chương trình mới lộ khi bộ giải dựng được (lời gọi 3, 4): mô hình ghi ô xếp
chồng [WC / giếng trời] mọi tầng và [bồn nước / giếng trời] trên mái — bộ giải chia chiều sâu ô theo diện tích phòng
cùng ô, WC mỗi tầng một cỡ, bồn nước + NLMT cần 2,1 m, nên giếng trời mỗi tầng một đoạn và «giếng tầng 1 bị che ở mái».
Hai bản sửa đúng của mô hình bị bác bằng lỗi giả (lời gọi 3 còn bị coi là tệ hơn và gạt).

Sửa (`bands/solve.ts`): giếng trời trong ô xếp chồng của tầng trên neo đúng đoạn trước–sau của giếng tầng dưới cùng
cột, phòng cùng ô nhận phần còn lại (chỉ khi vẫn đủ chiều sâu tối thiểu); còn lệch thì dựng thêm một lượt với đoạn
giếng CHUNG mọi tầng — bắt đầu sau phần trước sâu nhất — áp cả tầng 1, chỉ nhận khi không thêm lỗi. Phát lại lời gọi
2 + 3: hết lỗi giếng trời; còn lỗi thật của mô hình — tầng 2–4 không có hành lang / sảnh ở đầu ô thang. Đột biến
M166–M167. Báo cáo từng đợt: `.sao-luu/t116-v6/df9da65a/BAO_CAO_df9da65a.md`.

### T116 (tiếp 13) — chương trình tự chèn sảnh đầu thang

Haan, sau lượt df9da65a: «cho chương trình tự chèn sảnh đầu thang» (lượt ấy tầng 2–4 không có hành lang ở đầu ô thang).

- **Ở bộ giải** (`addStairLandings`, `ai/plan.ts`): tầng trên có đầu thang trước / sau không giáp lối đi
  (`stair_end_blocked`) → chèn một dải hành lang suốt bề ngang sát đầu ấy (mã `gt_h<tầng>a|b`), giải lại, chỉ nhận khi
  số lỗi giảm. Phòng ở dải bên cạnh cũng có lối vào từ sảnh. Đầu trái / phải (thang quay ngang) không chèn. Bộ dải trả
  về là bộ đã chèn — mô hình thấy sảnh trong `<plan>` nếu còn phải sửa.
- **Sau cổng** (`landStairEnds`, gọi ở `generateAiPlan` và bước Workflow): tầng có phòng chỉ ra được ô thang / chỉ
  vào qua phòng riêng / không đi tới được → thử sảnh ở đầu trước, đầu sau, cả hai; lấy cách ít lỗi cổng nhất, chỉ nhận
  khi ít hơn bản gốc.
- Không đủ chiều sâu thì không chèn — lỗi gửi mô hình như cũ (phát lại df9da65a: tầng 1 [gara] ngay trước [THANG | WC],
  thêm sảnh thì thừa 750 mm; tầng 3 thừa 250 mm). Sảnh tối thiểu ~1,01 m (hành lang thông thuỷ + vách).

Cùng đợt, lỗi chương trình lộ ra khi phát lại: giếng trời mô hình ghi lại ở tầng trên bằng mã chương trình
(`light_well_1`) ra cây mang mã `light_well_1_t2` — cổng cây bác `leaf_unknown` mọi tầng trên (bộ dải viết tay dùng «.»
nên chưa từng lộ). Nay ra cây là lỗ thông tầng `void_N`, không tính là phòng. Đột biến M168–M170.

### T116 (tiếp 14) — handoff v6 sửa lỗi đợt 2 (sau lượt 41ffe1e5)

Haan gửi handoff «sửa lỗi đợt 2» và bảo áp. Đối chiếu từng mục với mã trước khi làm:

**1.1 Lối vào ngay trên dải, mọi lỗi một lần.** `bands/access.ts` (`bandAccessIssues`) suy đồ thị kề từ dải không cần
toạ độ (ô liền nhau trong dải; ô xếp chồng chỉ phần ĐẦU chạm dải trước, phần CUỐI chạm dải sau; hai dải liền nhau kề khi
khoảng ngang ước chồng nhau), đi từ lối vào / ô thang theo `walk_through`, `stair_opens_to`, phòng mẹ, `served_from`.
Chỉ chạy khi bộ giải hỏng (dựng được thì cổng kiểm thật). Câu nhắc `band_no_access`. Bộ giải đo tiếp chiều sâu dù ô thiếu
bề ngang (lỗi chiều sâu / mốc thang cùng lượt với lỗi bề ngang); ô hẹp tính như đã nới tới cạnh tối thiểu để số không
thổi phồng. Phát lại 41ffe1e5: báo `ngu_ob` (tầng 2), `ngu_vc` (tầng 3) không lối vào như handoff đoán, và cả tầng 4
(hành lang `gt_t6` đứng trước WC trong ô xếp chồng, không chạm ô thang). Luật «In a stack only the FIRST room touches the
band in front…» vào lời dẫn.

**1.2 Kích thước.** Handoff giả định bộ giải theo tim tường — SAI cho v6: `min_side_mm` / `corridor_min_mm` đã là lọt
lòng (bộ giải cộng tường từ lượt 93d212a2). Chỗ lệch thật: `w` mô hình ghi cho phòng thường bị hiểu tim tường, hành lang
lại lọt lòng. Nay MỌI bề rộng / chiều sâu mô hình ghi là lọt lòng (trừ ô thang), lời dẫn nói rõ. Haan chọn **cả bảng KTS
cho nhà ống**: ngủ 2,4 · ngủ chính 2,8 · khách 3,0 · WC 1,1 · giếng trời 1,2 m lọt lòng (`by_house_profile.ong.min_side_m`;
không gửi mô hình — `forModel` bỏ như `usable`). Hệ quả đo được: nhà 5 m thang U 2,5 m KHÔNG còn chỗ cho [hành lang | THANG
| ô bên] (ô bên còn 1,05 m) — mẫu tầng trên của handoff mục 1.1 ([giếng trời | THANG | hành lang]) không vừa. Mẫu `ong_a`
/ `ong_b` viết lại: thang SAU, dải thang [THANG | một ô xếp chồng], hành lang dọc ở các dải trước thang + sảnh ngang trước
đầu ngắn ô thang. Bộ dải viết tay theo mẫu ấy qua cổng **65,2 điểm** (64,3 khi mái do chương trình dựng) — «đáp án» 5.2.

**2 Mái do chương trình dựng.** `buildRoof` vốn đã tự đặt khu đầu bài đòi mà mô hình không vẽ. Đường v6 thôi bắt mô hình
vẽ: tri thức không có mã mái, bỏ luật `B_roof`, bỏ «roof» khỏi thứ tự làm việc, hợp đồng gọn không có `level: roof`, tầng
«roof» mô hình gửi bị bỏ (`withoutRoof`).

**3 Xử lý câu trả lời.** 3.1 `normalizeBandsAnswer`: đường dẫn knowledge, chữ hoa / khoảng trắng → thường, «thang» /
«stair» → `THANG`, trường thiếu → rỗng, ghi lại mọi chỗ đổi. 3.2 Câu trả lời đủ khung dải mà sai hợp đồng → vòng sau SỬA
chính bộ ấy; bản sửa hỏng hợp đồng → sửa tiếp từ bản cũ; chỉ lấy mẫu lại khi JSON hỏng hẳn. 3.3 **Thang tầng 1 là mốc cố
định**: tầng 1 vừa khối thì tầng trên không khớp khoảng thang tầng 1 là tầng lệch (thay quy tắc «tầng còn trống nhiều
hơn»); tầng 1 tự sâu quá khối thì nêu tầng 1 với số thừa của chính nó. Bộ dựng lại tầng 1 chỉ chạy khi tầng 1 có lỗi riêng;
giữ nguyên ô xếp chồng mô hình ghi như một khối. 3.4 Hai lượt cùng hỏng ở bộ giải so THEO TỪNG TẦNG: chỉ gạt lượt mới khi
nó không khá hơn ở tầng nào. 3.5 Nhãn màn hình «trả về sai hợp đồng» → «chưa dựng được mặt bằng».

**4 Token.** 4.2 Hợp đồng mô hình dạng gọn `contracts/ai-house-bands-compact` (+ delta): ô là chuỗi (`"wc_1/light_well_1"`,
`"gt_1:900"`); chương trình bung ra hợp đồng nội bộ (`bands/compact.ts`); `<plan>` vòng sửa cũng dạng gọn và không gửi lại
chữ của mô hình. 4.3 `design_notes` ≤ 5 dòng ≤ 20 từ, `rationale` ≤ 2 câu. 4.4 Đo trên 12 lời gọi (3 lượt): bộ nhớ đệm chỉ
trúng giữa hai lời gọi cùng schema (delta) và cùng mức suy nghĩ, mỗi lần đúng 1.345 token ≈ lời dẫn hệ thống + schema;
phần lời dẫn ~4.000 token giống từng byte KHÔNG lần nào được đệm dù `prompt_cache_key` cố định. Chưa sửa mò — cần một
phép đo có trả phí.

Đột biến M171–M181 (M163 trỏ lại vào quy tắc mốc thang mới); M143, M156, M166, M167 có phép thử mới (giữ bộ dải viết tay cũ `NHAONG_BANDS_PRE_KTS`, phép thử thẳng bộ giải cho giếng trời). Phát lại 209 vòng v5: bảng KTS không đổi vòng nào (đối chứng = KTS); cả hai chỉ còn 4/209 vòng qua so với ~20 ngày 04/10 — sụt từ thay đổi T116 TRƯỚC đợt này (lượt ghi đời cũ chỉ có vùng ra 0 phòng ở tầng 1; cửa phòng chỉ giáp ô thang…), chưa dò ra thay đổi nào.

Hợp đồng đổi (thêm hai hợp đồng gọn) — phát hành cùng lúc API và giao diện.

### T116 (tiếp 15) — lượt thật affaf12b (Haan tự chạy, sau đợt 2)

GPT-5.6 Sol (tuyến `ai_text_openai_deep`), 4 lời gọi, 0,307 USD, không ra mặt bằng. Lời gọi 1 (0,199 USD, 9.122 token ra / 8.235 suy nghĩ) theo đúng mẫu mới và dạng gọn:
**tầng 1, 2, 3 qua mọi phép kiểm và được khoá ngay**; chỉ còn «giếng trời tầng 3 bị che ở tầng 4». Lời gọi 2–4 rẻ (534–1.443
token ra, cache trúng 1.266 token) nhưng xoay vòng ở tầng 4. Nguyên nhân lỗi lời gọi 1: phép kiểm giếng trời đòi cả phần
giếng thừa của tầng 3 (chiếm trọn cột cạnh thang) phải thông, trong khi trục giếng từ tầng 1 vẫn thông lên trời — nay chỉ
xét phần giếng nằm trên trục giếng tầng thấp nhất (M182). Phát lại: lời gọi 1 còn lỗi tầng 4 «hành lang `gt_8` / `gt_9` /
`gt_10` chung vách quá ngắn để đặt cửa» — hình học giống tầng 3 (qua), chưa rõ vì sao; lời gọi 4 qua cổng 64,3 điểm. Cùng đợt: `doors_prefer` gộp qua 4 vòng sửa thành 31 cặp > trần 24 của hợp đồng — `mergeBandsDelta` nay bỏ trùng, giữ 24 cặp mới nhất (M183). Báo cáo từng đợt: `.sao-luu/t116-v6/affaf12b/BAO_CAO_affaf12b.md`.

### T116 (tiếp 16) — lượt thật f0c97c06 (Haan tự chạy): tên tầng bằng chữ, ô thông giữa hai hành lang

GPT-5.6 Sol, 4 lời gọi, 0,276 USD, không ra mặt bằng. Lời gọi 1 là bộ dải đúng mẫu (giống bộ dải viết tay) nhưng ghi
tầng «Tầng 1»… — schema có mẫu cho `level` mà nhà cung cấp không chặn; hai vòng sau mô hình chỉ đổi tên tầng. Vòng 3 tầng
1–3 qua và khoá, tầng 4 lại gặp lỗi lượt affaf12b: ô thông giữa hai ô hành lang 0,9 m bị cổng đòi đủ quy cách cửa đi (0,8
+ hai má = 90 cm), vách chung chỉ 87 cm vì một đầu giáp sân thượng (vách ngoài dày hơn) — cả tầng 4 không đi tới được.

Sửa: chuẩn hoá mềm đổi tầng ghi bằng chữ thành số tầng / `roof` (M184); ô thông HÀNH LANG – HÀNH LANG không chừa má cửa
(`ai/tree/openings.ts`, M185; Haan 18/09: không lắp cửa giữa hai khu vực đều là hành lang). Nới cả hành lang – thang thì
bộ xếp đời cũ chọn cách xếp khác, phát lại 58688ead / 4198d692 tệ đi — nên chỉ hành lang – hành lang. Phát lại: lời gọi 1
của f0c97c06 và của affaf12b đều **qua cổng 63,8 điểm** (A 100 · B 67 · C 82 · D 73 · E 8; sàn nhóm bật vẫn qua).

Lượt `e2904e86` ngay trước chết giữa chừng vì Claude chạy công cụ đột biến (sửa mã nguồn tạm) đúng lúc ấy — `wrangler dev`
nạp lại giết lượt đang chạy. Từ nay công cụ đột biến chạy trên bản sao kho ở thư mục tạm.

### T116 (tiếp 17) — handoff v6 sửa lỗi đợt 3; hai chỗ nới cho nhà ống; đầu bài demo sửa

Handoff đợt 3 (Haan dán sau lượt f0c97c06: «qua cổng 63,8 mà nhóm E 8 % là không chấp nhận được»). Làm theo thứ tự
handoff:

- **Hành lang là một vùng** — hai ô hành lang kề nhau nối bằng ô thông suốt cạnh chung, không cửa, chỉ cần vách chung từ
  một lối đi 60 cm; cặp `doors_prefer` hành lang – hành lang bỏ.
- **Giếng trời như ô thang** — ký hiệu `LW` trong hợp đồng; mô hình chỉ khai giếng ở tầng thấp nhất, chương trình ghim
  giếng đúng chỗ mọi tầng trên (`bands/light-well.ts`), dải giếng giữa nhà neo theo giếng tầng 1 như dải thang. Tầng 1
  nay chừa đủ chỗ trước giếng cho tầng trên sâu nhất (`wellLo`, M186) — trước đó phần dư tầng 1 có thể dồn vào dải giếng.
- **Lời dẫn đồng bộ với cổng** — luật chỉ trừ điểm sang khối «Scored, not rejected».
- **Hai luật CHẶN mới** (Haan chọn): nhà ống, WC / giặt tầng trên đè khách / ăn / ngủ / thờ / bếp tầng dưới quá 10 %
  diện tích (`wet_over_living`); «lấy sáng» trong hai ưu tiên đầu thì phòng ngủ / làm việc / thờ phải chạm mặt thoáng,
  giếng trời, sân thượng hay ban công (`habitable_no_window`).

**Dò khả thi bằng bộ giải:** đầu bài demo (5 × 18 m, thang U sau) KHÔNG vừa hai luật mới với bảng KTS — tầng 3 cần 9,6 m
trước giếng giữa nhà, tầng 1 chỉ cho tới khoảng 8,5 m. Ba nhánh của «ý 1» (WC trên bếp / hành lang, bỏ WC chung tầng 2)
không gỡ được: WC trên bếp vốn bị T71 chặn, WC trên hành lang vốn được, tầng 2 vốn xếp được. Haan (07/10/2026) chọn:

1. **Nhà ống: WC RIÊNG của phòng ngủ được đè khách / ăn tầng dưới** (WC chung, giặt, và mọi WC trên ngủ / thờ / bếp vẫn
   chặn) — `ENSUITE_OVER_OK`, M187.
2. **Nhà ống: mỗi tầng chỉ phòng ngủ CHÍNH bị đòi mặt thoáng** (phòng ngủ chính, không có thì phòng ngủ rộng nhất);
   phòng ngủ thứ hai trở đi chỉ trừ điểm ở D2 (`by_building_type.ong`: một phòng tối trừ nửa, hai phòng trừ hết — trừ hết
   ở phòng đầu thì nhóm D rơi dưới sàn, hoá ra vẫn chặn). Phòng làm việc, phòng thờ vẫn chặn. M188.
3. **Sửa đầu bài demo:** phòng ngủ chính 18 → 16 m², phòng ngủ con tầng 3 và tầng 4 12 → 10 m² (mức nhỏ nhất vừa — dò
   16/10 và 15/11 vừa, 16/11, 17/10, 18/9 thiếu 300 mm). Tệp đầu bài ghi của các lượt thật giữ nguyên (phát lại phải đúng
   đầu bài lúc chạy); phép thử bộ dải mẫu dùng `withDemoAreas`. **Đầu bài demo trong ứng dụng phải sửa tay** cho khớp.

Bộ dải viết tay mới (`NHAONG_BANDS`, mẫu C): giếng trời giữa nhà cột PHẢI (đầu ô thang ở bên trái phải chạm hành lang —
giếng bên trái thì chương trình phải chèn sảnh, không còn chỗ), WC riêng đứng cạnh phòng ngủ trên gara và chồng nhau, WC
chung tầng 2 chồng WC tầng 1, tầng 4 thờ + giặt mặt tiền và sân thượng giữa nối giặt (`served_from`). Một lời gọi, qua cổng
73 % (A 100 · B 67 · C 67 · D 79 · E 38).

Ba chỗ sửa đi kèm, gặp khi dựng bộ dải ấy:

- **B1 nhà ống chấm theo bảng KTS** (`profileMinSide`, M190): hành lang 0,9 m và ban công 0,9 m bị B1 trừ theo ngưỡng
  nhà phố (1,0 / 1,2 m) trong khi bộ giải và cổng dùng bảng KTS — điểm B tụt 6,7 điểm vì đúng thứ cổng cho qua.
- **Lỗi WC / mặt thoáng không dừng sớm bước dựng** (M189): dừng trước kiểm đầu thang thì chương trình không chèn sảnh,
  câu nhắc mang «không có lối vào» ước trên bộ dải chưa chèn (phát lại df9da65a).
- **Bộ dựng lại tầng 1 không giữ tầng 1 chưa qua cổng** khi tầng khác chỉ vướng WC / mặt thoáng (M191, phát lại 93d212a2)
  — chỉ lỗi thang / giếng trời mới cho giữ (lượt 41ffe1e5).

Phát lại: lời gọi 1 của affaf12b và f0c97c06 (trước qua 63,8) nay bị bác đúng ba lỗi — giặt tầng 4 đè phòng ngủ, phòng
làm việc tầng 2 và phòng thờ tầng 4 không mặt thoáng; không còn lỗi lối vào hay giếng bị che.

Còn treo của handoff đợt 3: sàn nhóm E ≥ 40 %, D ≥ 60 % (3.4) — bộ dải mẫu mới E 38 % sẽ rơi dưới sàn ấy (E2: WC riêng
tầng 2 trên gara và WC tầng 4 không chồng WC); tuyến deep chỉ lời gọi đầu (4.1); dò bộ nhớ đệm (4.2); phát lại thêm đầu
bài (5.3). Đột biến: M182–M184, M186–M191 bị bắt; **M185 sống sót** — đường v6 nay nối hành lang – hành lang bằng ô thông suốt vách (lối đi 60 cm, mục 1 đợt 3), vách 87 cm không còn tới đoạn chừa má; má chỉ còn ý nghĩa ở vách 60–70 cm, chưa có ca thật nào để thử. Công cụ đột biến tin báo cáo JSON khi mọi phép thử xanh mà vitest thoát mã 1 vì quá tải.

### T116 (tiếp 18) — handoff đợt 3: sàn từng nhóm, deep chỉ lời gọi đầu, bộ nhớ đệm vòng sửa

- **Sàn từng nhóm (3.4):** `accept_group_floor_by_group` đè sàn chung — D ≥ 60 %, nhóm khác giữ 40 %
  (`groupsBelowFloor`, M192). Sàn chỉ xét ở luồng chạy thật (`ai-design-steps.ts`), không ở `generateAiPlan`.
  Bộ dải mẫu cũ (tiếp 17) có nhóm E 38 % — đã dưới sàn 40 % hiện hành; bộ dải mới thêm WC chung tầng 3 ở dải giếng
  để WC tầng 1 → 4 một trục, sân thượng ra sau nhà (đúng «phía sau» của đầu bài): 74,6 % (A 100 · B 67 · C 67 ·
  D 68 · E 75).
- **C1 bỏ phòng không cửa** (`no_door_required` — hộp kỹ thuật, giếng trời): hộp kỹ thuật sau WC bị C1 trừ trọn vì
  «không tới được» (M193).
- **Deep chỉ lời gọi đầu (4.1):** tuyến khai `revise_route` (kiểm lúc đọc cấu hình: có thật, cùng nhà cung cấp,
  hạng dữ liệu không chặt hơn); `ai_text_openai_deep` sửa bằng `ai_text_openai` (Terra); nhật ký ghi đúng tuyến và
  giá của vòng sửa (M194). Trần ~4.000 token nghĩ của handoff KHÔNG đặt: OpenAI không có trần riêng cho token nghĩ
  (`max_output_tokens` tính chung), mà lời gọi đầu thật nghĩ 5.696 (f0c97c06) và 8.235 (affaf12b) — trần ấy cắt
  ngang cả hai, tốn tiền không ra câu trả lời. Thay bằng `reasoning_effort: medium` và trần an toàn 12.000 token ra;
  đo ở lượt thật kế tiếp rồi mới hạ.
- **Bộ nhớ đệm vòng sửa (4.2):** so nguyên văn lời gọi f0c97c06 — ba vòng sửa chung 8.700 ký tự đầu (~4.000 token
  cùng câu dẫn + lược đồ) mà chỉ trúng 0 / 1.266 / 1.266, đúng cỡ câu dẫn + lược đồ; lời gọi 1, trùng TRỌN tin nhắn
  với lượt trước, trúng 4.067 / 4.070. Đệm ngắt ở ranh giới tin nhắn: đầu bài và phần lỗi chung MỘT tin nhắn nên
  đuôi khác nhau làm mất cả đầu bài. Sửa: phần nối của vòng sửa là tin nhắn thứ hai (`openai.ts`, M195). Vòng sửa
  đầu tiên vẫn không trúng vì lược đồ delta khác lược đồ lời gọi đầu (lược đồ nằm trước tin nhắn). Chưa đo thật.
- **Ngưỡng ghi cứng:** `CORRIDOR_PASS_CM = 60` (chỗ nối hai ô hành lang) chuyển thành
  `circulation.corridor_pass_clear_m` trong `kb/construction_norms.yaml` (M196). Đột biến M192–M196 đều bị bắt.
- Ghi lại, chưa sửa: ô `.` (sân không xây) đặt cạnh ô thang làm cạnh thang thành tường ngoài dày hơn, lọt lòng thang
  hụt (dựng thử `[THANG | .]` ở tầng 3: «ô thang chỉ dài 2,06 m … cần 2,15 m»). Bộ giải chưa cộng phần tường ngoài
  cho ô thang giáp phần không xây.

### T117 — Giao diện AI Design làm lại; gỡ ô «Yêu cầu sửa» khỏi giao diện (07/10/2026)

Haan, trước khi viết tài liệu hướng dẫn module: giao diện phải gọn và dễ thao tác (tham khảo BỐ CỤC các công cụ
thiết kế AI hai cột, không tham khảo nội dung).

- **Hai cột**: trái = thiết lập (mô hình, mức suy nghĩ, số phương án, gói quy tắc, một dòng chi phí) và MỘT nút
  chính; phải = dải chọn phương án + tờ vẽ. Phần giải thích cách chạy thu vào «Cách AI xếp mặt bằng». Ảnh từ bản
  vẽ kỹ sư là thẻ cuối cột trái.
- **Tên «Phương án 1, 2, 3…»** theo thứ tự tạo (`ai/variant-name.ts`), chỉ ở giao diện — artifact bất biến, không
  đổi dữ liệu. Mã `AI-A` chỉ còn trong nhật ký chi tiết.
- **Tiến độ thu gọn**: một dòng tóm tắt + «Xem chi tiết». Danh sách bước, câu lỗi của bộ xếp, theo dõi lượt gọi,
  chi phí lượt chạy và «Phương án chưa xếp được» chỉ hiện khi bung.
- **Gỡ khung «Yêu cầu sửa» khỏi giao diện** (T53 mục e). Hợp đồng `ai-plan-edit`, `POST /design/ai/plan/edit`,
  `ai/edit/` và hook `useEditAiPlan` GIỮ NGUYÊN — chỉ không còn đường vào từ màn hình. Điểm và ngưỡng chuyển lên
  đầu tờ vẽ; bản sửa cũ vẫn hiện nguyên văn yêu cầu trong «Về phương án này».
- **«Nhật ký gọi AI» của hồ sơ tạm ẩn** (`AiCallLedger` còn mã, sẽ xoá).
- Mục chi tiết dưới tờ vẽ (ý định, lỗi, đối chiếu) thành mục gấp; lỗi chặn tự mở; panel điểm vẫn đứng SAU lỗi (T24).
- Sáng / Tối / Theo hệ thống cho TOÀN ứng dụng (`web/src/lib/theme.tsx`, DESIGN_SYSTEM §6, §7.2).

**T117 (tiếp, cùng ngày).** Haan: ẩn mục «Điểm chất lượng» (`PlanScorePanel` còn mã; điểm tổng và ngưỡng vẫn ở
chip đầu tờ vẽ). Thêm: trang `/tk/ai-design` dạng THẺ mặc định (`pages/tk/ai-design-cards.tsx` — ảnh tầng 1 của
phương án hiệu lực, bốn bước bằng chữ, ô tìm; dữ liệu AI chỉ tải khi thẻ lọt vào màn hình; còn chế độ Bảng); ảnh
thu nhỏ tầng 1 trên thẻ chọn phương án; «Xem toàn màn hình» cho tờ mặt bằng và mặt đứng (`ai/sheet-zoom.tsx`, lớp
phủ tự dựng — KHÔNG dùng Fullscreen API vì trình duyệt tự chèn dòng nhắc tiếng Anh). Soát ở 390px: hết tràn ngang
(lưới `grid-cols-1`, ô «Tầng vẽ» cuộn trong khung).

### T118 — AI Design tách hẳn khỏi quy trình Dự án thiết kế (07/10/2026)

Haan: «AI Design là một module độc lập nhằm hỗ trợ phòng thiết kế, chứ không nằm trong quy trình, pipeline thiết
kế. Cần tách bạch tránh gây hiểu lầm và tạo những ràng buộc không đúng.» T114 đã tách trang, nhưng màn hình Dự án
thiết kế vẫn nối AI vào quy trình ở bốn chỗ — đều ở giao diện, CSDL và Worker không có ràng buộc nào:

1. **Dải tiến trình** có bước «AI Design» thứ ba, điều kiện xong là «đã chọn phương án AI» — chưa chạy AI thì Hồ sơ
   kỹ thuật, Dự toán, Trình khách đều «chưa mở». Gỡ: dải còn NĂM bước (`overview/steps.ts`).
2. **Màn hình con `?tab=thiet-ke-ai`** khiến nút bước trước/sau đi Khảo sát → AI Design → Hồ sơ kỹ thuật. Gỡ khỏi
   `design-detail.tsx`.
3. **Thẻ AI Design** nằm trong lưới bước quy trình, câu «chưa chọn phương án» đọc như việc hồ sơ còn nợ. Chuyển
   thành khối «Công cụ hỗ trợ» cuối cột phải (`AiDesignSupportPanel`), chỉ nói số bản phác và lối mở module.
4. **«Hoạt động gần đây»** của hồ sơ ghi lượt lưu phương án AI. Gỡ — bản phác AI không phải hoạt động của hồ sơ.

Trên trang AI Design: đầu trang bỏ trạng thái, bước quy trình và hạn bàn giao của hồ sơ (thay bằng «Công cụ hỗ trợ —
không thuộc quy trình thiết kế của hồ sơ» và nút «Mở hồ sơ thiết kế»); «Chọn phương án này / Đang hiệu lực» đổi
thành «Dùng để dựng mặt đứng / Dùng cho mặt đứng» — việc chọn chỉ có nghĩa BÊN TRONG AI Design.

**Đầu bài và khảo sát: CHỈ XEM trên trang AI Design** (Haan chốt cùng ngày: «chuyển thành chỉ xem, nếu muốn sửa
thì phải quay lại đầu bài để sửa»). AI Design vẫn đọc đầu bài đã xác nhận và khảo sát của hồ sơ (một nguồn dữ liệu),
nhưng không sửa, không xác nhận: bước «Đầu bài và khảo sát» dựng `BriefPanel`/`SurveyPanel` với `readOnly`, kèm nút
«Sửa đầu bài» / «Sửa khảo sát» dẫn về hồ sơ thiết kế. Phiếu «Yêu cầu mặt đứng» ở bước Mặt đứng (lưu thành phiên bản
đầu bài mới — T114) cũng chỉ xem; lối «Sửa ở đầu bài của hồ sơ» do trang ngoài chèn vào (`briefLink`) vì `tk/ai/`
không nhập router. Quyền và artifact vẫn theo hồ sơ.

**T117 (tiếp 2) — bỏ đoạn chú thích trên giao diện AI Design** (Haan, 07/10/2026). Gỡ khỏi màn hình: dòng mô tả
«Công cụ hỗ trợ — không thuộc quy trình…» ở đầu trang; «Giá niêm yết…» và câu riêng tư dưới ô chọn model; «Nghĩ càng
nhiều…»; câu chi phí «mỗi phương án / mỗi góc / mỗi tấm là một lượt gọi tính tiền»; câu «ảnh AI không đo được»
(`AI_DISCLAIMERS.aiSheetImage/aiFacadeImage/aiImageSet`) dưới ảnh; chip «Ảnh trình khách — không thay tờ vẽ»; câu
«tờ vẽ dựng từ toạ độ… đo được»; câu gợi ý từng bước; lời dẫn phiếu mặt đứng; ghi chú «Dừng thì huỷ…», «Bản hiệu lực
là…», «Số xe lấy theo đầu bài…». Giữ: dấu in TRÊN ảnh (watermark — đi theo ảnh khi tải về), câu `noCodeCheck` trong
mục gấp «Đối chiếu thói quen thiết kế» (CLAUDE.md 8.3), câu báo lỗi, trạng thái rỗng (rút gọn), các mục gấp «Cách AI…»,
giá trên từng thẻ model khi mở bộ chọn.

**T117 (tiếp 3) — một khung «Ảnh mặt bằng có nội thất», hai nguồn** (Haan, 07/10/2026: «gộp làm một, vì cùng vẽ
mặt bằng nội thất, chỉ khác input»). Khung T57 (vẽ từ tờ vector của phương án) và khung T114 Đợt 4 (vẽ từ bản vẽ kỹ
sư tải lên, trước ở cột trái) gộp thành `ai/ai-plan-image.tsx` dưới tờ mặt bằng, ô chọn «Vẽ từ: Mặt bằng của phương
án AI / Bản vẽ kỹ sư tải lên». Hai khối cũ nhận cờ `bare` để nhúng không khung. Chưa có phương án AI thì khung vẫn
hiện, mở sẵn nguồn bản vẽ kỹ sư. Khung cũ ẩn ở tờ Mái nay luôn hiện — ô «Tầng vẽ» của nó tự chọn tầng. Bước Mặt
đứng chưa gộp (cùng kiểu trùng: ảnh mặt đứng có vật liệu / ảnh mặt đứng từ bản vẽ kỹ sư).

**T117 (tiếp 4) — tiến độ chỉ còn số tiền; quá trình chạy vào báo cáo `.md`** (Haan, 07/10/2026: «toàn bộ phần thông
tin… không cần thiết, chỉ cần hiện số tiền tiêu tốn; quá trình chạy: prompt, lỗi, sửa, nên có một nút xuất file
report dạng md để dev tải về»). Khối tiến độ (`ai/ai-run-progress.tsx`, dùng chung Mặt bằng / Mặt đứng / Phối
cảnh) chỉ còn: trạng thái (kèm «n/m bước» khi đang chạy), «Chi phí: ≈ … USD» (`useRunCalls` trong `ai-usage.tsx`,
gói miễn phí tính 0), nút «Dừng lượt chạy» / «Chạy lại» / «Tải báo cáo (.md)». Gỡ khỏi màn hình: danh sách bước,
câu lỗi của bộ xếp, «Theo dõi lượt gọi AI» (`AiPlanLive` không còn nơi dùng), dòng token, «Phương án chưa xếp được»,
«Ý tưởng chưa dùng được». Báo cáo (`ai/run-report.ts`, hàm thuần): thông tin lượt chạy, chi phí, lỗi, bảng các
bước, phần riêng của bước (`failedVariantsMarkdown`), bảng lượt gọi, NGUYÊN VĂN lời gọi từng lượt (tải tuần tự qua
`fetchAiCallPrompt`), kết quả thô JSON. Dựng trong trình duyệt, không thêm tuyến Worker. Nút Dừng riêng của bước
Phối cảnh gộp vào khối chung.

**T117 (tiếp 5) — ô chọn model dạng viên + bảng nổi; thêm các bản Claude; lỗi nhà cung cấp hiện ra** (Haan,
07/10/2026). (a) `ModelChooser` (`ai/ai-model-cards.tsx`): thu gọn là một nút dạng viên — biểu tượng nhà cung cấp
(biểu tượng chung, không logo), tên model, mũi tên; bấm mở BẢNG NỔI (không đẩy bố cục): tiêu đề «Chọn model AI và nhà
cung cấp», thẻ nhà cung cấp có biểu tượng, danh sách thẻ model (nhãn, mô tả, mã model · giá), đóng khi chọn / Esc / bấm
ra ngoài. Tên model thật chuyển vào `title` của nút. (b) `config/models.yaml`: Anthropic có sáu tuyến — Opus 5.5, Opus
5, Opus 4.7, Sonnet 5.5, Sonnet 5, Fable 5.1; không thêm Haiku 4.5 (không nhận `thinking: adaptive` mà
`llm/anthropic.ts` luôn gửi → 400). (c) Lượt Gemini 3.1 Pro lúc 22:32 hỏng vì tài khoản Google HẾT TÍN DỤNG, mà khối
tiến độ T117 (tiếp 4) chỉ nói «Chưa xếp được» và «có lượt chưa có giá»: nay khi MỌI lượt gọi đều lỗi (hỏng ở nhà cung
cấp) thì câu lỗi hiện ra; lượt gọi lỗi không token tính 0 USD. Lỗi của bộ xếp vẫn chỉ ở báo cáo.

**T119 — đầu bài thiết kế: gỡ 10 câu, làm lại giao diện biểu mẫu** (Haan, 07/10/2026: «tinh chỉnh UX–UI mục đầu bài
sao cho việc khảo sát thuận tiện, giao diện đẹp hơn»). (a) Gỡ khỏi `brief-form.json`: phong thuỷ + yêu cầu phong thuỷ
cụ thể, nếp nấu ăn, bếp phụ, tần suất tiếp khách, làm việc tại nhà, ca đêm, thú nuôi, quan hệ của người quyết định,
những thứ cần chỗ cất. Trường VẪN trong hợp đồng `design-brief` (đầu bài cũ hợp lệ); `brief/narrative.ts`,
`ai/brief-demands.ts` đọc chúng theo kiểu chỉ suy từ câu đã trả lời, nên đầu bài mới chỉ thiếu các ý ấy, không lỗi.
Gỡ quy tắc nhất quán «không xem phong thuỷ mà ưu tiên phong thuỷ»; kiểm hướng bàn thờ / bếp nay đọc «Điều kiêng kỵ
khác». (b) Giao diện (`brief-panel.tsx`): ô xếp HAI cột (ô viết dài, chọn nhiều, bốn mặt, bảng, khoảng ngân sách và
hàng chọn hơn ba lựa chọn trải cả hàng); đầu bước có tên phần · «Bước n/7», tên bước lớn hơn, «Đã trả lời a/b câu»;
thanh bước dạng viên, bước đủ câu bắt buộc mang dấu tích; thanh «Quay lại / Tiếp / Lưu» dính đáy màn hình.

**T117 (tiếp 6) — chi phí theo thời gian thực khi đang chạy** (Haan, 07/10/2026). Nhật ký `design_ai_call` chỉ có
dòng khi lượt gọi XONG, nên trong lúc mô hình nghĩ / viết (vài phút) con số đứng yên. `ai/live-cost.ts`
(`estimateLiveCost`, hàm thuần) ước từ `run.progress.partial.live` mà Worker ghi sẵn (`LivePlanBoard`): tiền thật
của lượt đã xong + lượt đang chạy (ký tự đã sinh ÷ 3,5 × giá token ra, cộng token vào trung bình các lượt trước × giá
token vào; giá lấy theo tuyến từ danh mục model). Màn hình ghi «≈ … USD · ước tính khi đang chạy», không bao giờ thấp
hơn tiền thật đã ghi nhật ký; xong lượt thì thay bằng tiền thật. Ước tính thường THẤP hơn thật: phần suy nghĩ ẩn của
mô hình không trả ký tự về. Có ở Mặt bằng và Mặt đứng (luồng `ai-design.ts`); Phối cảnh không có dữ liệu trực tiếp
nên tăng theo từng ảnh xong.

### T117 (tiếp 7) — Biểu mẫu đầu bài: khung ô thống nhất, câu soát theo mức (07/10/2026, Haan)

- Mọi ô nhập / ô chọn / ô nhiều dòng tự dựng dùng chung `FIELD_BOX` / `TEXTAREA_BOX`
  (`web/src/components/ui/field-box.ts`): bo 9px, viền đậm, cao 40px — trước đó `<select>` bo 4px còn `Input` bo 9px.
  Bề rộng theo nội dung: ô số ~7rem, ô bốn phía ~6rem / ô chọn bốn phía 11rem, phiếu mặt đứng xếp cột 14–18rem.
- Câu soát nhất quán tô theo mức: `canh_bao` vàng («Cảnh báo»), `nghiem_trong` đỏ («Lỗi»), luôn kèm chữ và biểu
  tượng (`brief-issue.tsx`). Dưới từng ô trước đó mọi câu đều đỏ.
- Câu soát ở khung bên phải bấm được: chế độ sửa sang đúng bước rồi cuộn tới ô đầu tiên trong `paths`; chế độ xem
  cuộn tới dòng tương ứng; ô đích được viền sáng một lúc.
- Gỡ thêm câu «Có khách ở lại qua đêm» (`lifestyle.overnight_guests`) khỏi biểu mẫu; trường giữ trong hợp đồng,
  `brief-demands` vẫn đọc theo kiểu «chỉ suy từ câu đã trả lời» cho đầu bài cũ.

### T118 (tiếp) — Bước Mặt đứng không bày phiếu yêu cầu (08/10/2026, Haan)

Haan: «tất cả khảo sát nằm ở khảo sát đầu bài, không nằm trong AI Design. AI Design chỉ thừa hưởng khảo sát thôi».
Gỡ hẳn phiếu «Yêu cầu mặt đứng của kỹ sư» (bản chỉ xem T117) khỏi bước Mặt đứng; khung «Dựng mặt đứng» chỉ còn một
dòng nguồn «Dựng theo phần Mặt đứng của đầu bài đã xác nhận» kèm liên kết sửa ở đầu bài. Nhãn nguồn trong bảng ý
tưởng đổi «theo yêu cầu kỹ sư» → «theo đầu bài». Lượt chạy vốn đọc phần `facade` của đầu bài đã xác nhận phía
Worker, nên không đổi gì ngoài giao diện.

### T147 — Tờ mặt đứng chi tiết như hồ sơ thật; lưới trục cho mặt bằng và mặt đứng (10/10/2026, Haan)

Haan đưa tờ KT07-08 «MẶT ĐỨNG» của hồ sơ Mạnh – An Bình (M5) cạnh tờ mặt đứng của một nhà thử, và đề nghị
«lên phương án để bản vẽ mặt đứng được chi tiết như bản vẽ thật». Đo tờ thật bằng ezdxf: 1/60, A3; trục nét chấm
gạch (`CENTERX2`) có bóng tròn; cao độ ở cả hai bên; mỗi bên ba hàng kích thước (chi tiết 450 / 3200 / 400 / 100 /
3100 / 400 / 100 / 750 / 50, rồi tầng, rồi tổng); chuỗi lỗ mở đặt trong hình; dải dầm 400 cộng phào 100×50 đua 50
ở mỗi sàn; tường chắn mái tô xám, phào đỉnh 50×20; chân nhà ốp đá (AR-CONC); cửa vẽ khung, nẹp cắt góc 45°, kính
xiên, tay nắm, phào bo cửa 100; lan can trụ 20, nan 20 bước 120; 24 ghi chú dẫn chữ 2 mm.

Haan chốt bốn điểm:

1. **Kết hợp.** Bộ chi tiết NVG nằm trong **`kb/facade_detail.yaml`** và luôn được vẽ. Mảng trang trí mô hình đã
   chọn được vẽ thành chi tiết thật thay cho hình chữ nhật tô nhạt: phào có gờ, ron là dãy rãnh ngang, lam là dãy
   nan, cột có đầu và chân, ô văng có nét đáy, chóp có thân tam giác. Mô hình vẫn chỉ khai khung bao (T15). Phào mô
   hình đặt trùng dải phào mặc định thì **thay** dải ấy.
2. **Tô vật liệu như bản vẽ thật.** Điểm này thay phần «vật liệu chỉ ghi bằng chữ» của T59.
   - Sơn tối hơn ngưỡng `paint_solid_below` thì tô xám, độ xám suy từ mã màu và kẹp trong `tone_range`.
   - Đá, gạch, gỗ, chấm, ngói vẽ bằng nét ký hiệu (`material_hatch`).
   - Tên vật liệu vẫn ghi, nay bằng ghi chú dẫn.
   - Tờ vẫn là bản vẽ đen trắng.
3. **Lưới trục ở cả hai tờ, cùng một hàm.** `draw/axes.ts › deriveAxes` suy trục từ tim tường vì mặt bằng không
   có cột.
   - Hai tường bao luôn là trục. Tường trong là trục khi ở một tầng nào đó tổng chiều dài đạt `min_span_share`
     chiều sâu. Trục cách nhau dưới `merge_mm` thì gộp.
   - Trục dọc đánh số từ trái, trục ngang đánh chữ từ mặt tiền.
   - Toạ độ trục là tim tường thật, không làm tròn, để hàng trục cộng khớp hàng chi tiết.
   - Tờ mặt bằng (và DXF mặt bằng) có ba hàng kích thước: chi tiết, trục, tổng. Ảnh neo mặt bằng không có trục.
4. **Đợt này chỉ làm mặt tiền.** Mặt bên và mặt sau cần đổi hợp đồng (`face`) và suy lỗ mở theo từng mặt.

**Không đổi hợp đồng, không gọi AI.** Tờ được dựng lúc xem từ `ai_facade_concept`, nên mọi ý tưởng đã lưu tự hiện
chi tiết mới. Tuyến `/facade/:id/sheet` và `/dxf` đọc thêm mặt bằng (`concept.plan_ref`) để có trục và bậc tam cấp;
mặt bằng mất thì tờ vẫn vẽ, chỉ không có trục.

**Ảnh neo mặt đứng bỏ lớp chú thích** (trục, cao độ, kích thước, ghi chú) và không đọc mặt bằng. Máy chủ dựng lại
ảnh neo để so cỡ khung với tệp trình duyệt gửi lên, nên ảnh neo không được phụ thuộc một thứ mà nơi gọi này có còn
nơi kia không.

**DXF**:
- Thêm vai trò lớp `grid` (đã có `NV-Truc` trong kb) và `detail` (`NV-ChiTiet`).
- Thêm linetype `CENTER`.
- Mảng tô thành thực thể `SOLID`, vì R12 không có HATCH.
- Chữ ghi chú giữ căn trái hoặc phải.
- Sửa lỗi cũ: nét đứt khai bằng CSS (vạch sàn, hàng rào, ranh mềm, bậc trên mặt cắt) ra DXF thành nét liền. Nay
  linetype lấy theo lớp CSS.

**Tệp**:
- `kb/facade_detail.yaml`, `kb/facade-detail.ts`
- `draw/axes.ts`, `draw/hatch.ts`, `draw/leaders.ts`, `draw/elevation-parts.ts`
- `draw/dims.ts`: `chainRows` cho N hàng hai phía, `inFieldChain`, đoạn ngắn liền nhau đưa chữ sang phía kia
- `draw/units.ts`: `DrawInsets`
- Mẫu đối chứng `MANH_FACADE` (số chép từ KT08) có ảnh vàng `mat-dung-manh.svg` để so với tờ thật

**Còn lại / chờ Haan**:
- Ghi chú dẫn in hoa theo M5 (`notes.uppercase`, cùng lý do với `room_label.uppercase`).
- Bảng mẫu vật liệu dạng ô ký hiệu chưa làm: khung tên vẫn liệt kê vật liệu bằng chữ, ghi chú dẫn gọi tên tại chỗ.
- Ron đứng hai bên cửa sổ của M5 không có trong danh mục phần tử, nên chưa vẽ.
- Mặt bên và mặt sau.
- Ảnh vật liệu dựng lại từ ảnh neo mới chưa chạy thử (lượt trả phí).

### T152 — Chọn nền ngay trong bước: mặt đứng chọn mặt bằng; phối cảnh chọn mặt bằng + mặt đứng (10/10/2026, Haan)

Haan: «khi dựng mặt đứng cần có mục chọn mặt bằng để base trên đó… mặt đứng sẽ chọn 1 phương án để xây dựng
dựa trên đó + thông tin đầu bài», rồi «tương tự, ảnh phối cảnh cũng cần lựa chọn bản mặt bằng và mặt đứng».

Trước đó bước Mặt đứng luôn dựng trên mốc «Dùng cho mặt đứng», và mốc ấy chỉ đặt được ở bước Mặt bằng. Bước Phối
cảnh luôn dựng trên bản mặt đứng hiệu lực. Không bước nào có chỗ chọn.

**Thiết kế: ô chọn đặt chính MỐC hiệu lực, không giữ lựa chọn riêng.** Mọi nơi đọc «phương án làm nền» đều nói về
cùng một cái: đầu bài lấy bề rộng cửa, nhãn «theo phương án cũ / mặt đứng cũ», và lối sang Phối cảnh.
- **Bước Mặt đứng:** ô «Dựng trên mặt bằng» → `/plan/choose`.
  - Lượt dựng gửi kèm `planArtifactId`. Worker từ chối 409 khi mã này khác mốc, tức mốc vừa bị đổi ở tab khác hoặc
    bởi người khác. Như vậy không dựng nhầm trên một ngôi nhà người bấm không chọn.
  - Dải bước chỉ chặn khi chưa có phương án nào («Cần xếp mặt bằng trước»). Có phương án mà chưa chọn thì nút
    dựng chờ ô chọn.
  - Tờ mặt đứng mang nhãn «Dựng trên Phương án N».
- **Bước Phối cảnh** (nguồn «Ý tưởng mặt đứng của AI»): hai ô «Dựng trên mặt bằng» và «Dựng trên mặt đứng».
  - Ô mặt đứng chỉ liệt kê bản dựng trên phương án đã chọn, vì chọn chéo là trộn hai ngôi nhà. Phương án chưa có
    mặt đứng thì ghi rõ và không cho dựng.
  - Đổi phương án: đặt mốc mặt bằng, rồi mốc mặt đứng sang bản đang hiệu lực nếu nó thuộc phương án ấy, không thì
    bản mới nhất của phương án ấy.
  - Nguồn «Bản vẽ kỹ sư tải lên» giữ nguyên.
- **`/state`** trả `planRef` cho từng bản mặt đứng, đọc từ cạnh lineage bằng MỘT truy vấn
  (`ArtifactRepository.inputsAmong`), không tải payload từng bản.
  - Phương án đã ẩn thì `planRef` rỗng.
  - Giao diện vẫn chạy với máy chủ cũ chưa trả trường này: bản hiệu lực dùng `facadePlanRef`, và chỉ chặn khi
    biết chắc.

### T153 — Lượt hỏng 75ba5793: ba lỗi của chương trình làm hỏng một bố cục đúng (11/10/2026, Haan: «làm cả 4»)

Lượt xếp mặt bằng trên máy, nhà ống 5 × 18 m 4 tầng, gara mặt tiền («Nhà ống Hoàng Mai (demo)»), tốn năm lượt
gọi (0,499 USD) mà không ra phương án. Phát lại ở máy, không gọi mô hình, cho thấy vòng 1 tầng 1 đã đúng bố cục:
gara → khách → ăn + bếp → thang + hành lang + WC → giếng trời, vào nhà qua gara như Haan duyệt 04/10. Chương trình
làm hỏng nó theo bốn đường.

1. **Ô thang giáp giếng trời hụt 1,5 cm, mà chính bộ xếp gán con số ấy.**
   - `sketchMinExtent` chừa thêm một bề dày VÁCH NGĂN (11 cm) khi đòi chiều dài ô thang. Bộ kiểm
     (`shortStairs`) lại đo LỌT LÒNG: đầu giáp giếng trời là tường bao, nên lọt lòng = 375 − 11 − 5,5 = 358,5 cm,
     trong khi bộ kiểm đòi 360 cm.
   - Sửa: chừa theo TƯỜNG BAO (`walls.exterior_m`), trường hợp xấu nhất.
   - Phát lại 209 vòng ghi: 19 = 19 mặt bằng qua, 0 tiến, 0 lùi. Bộ ghi cũ gần như toàn biệt thự 15 × 20 m,
     không có ô thang giáp giếng trời.
2. **Lỗi bị che.** Lối vào qua gara (T51) đã được thử nhưng hỏng vì đúng lỗi thang ở mục 1. Lỗi báo lại là của
   phương án đầu, «phòng khách không có cửa ra mặt tiền», nên mô hình sửa sai chỗ bốn vòng liền và vòng 4 dời
   gara ra sau nhà.
   - Sửa: đã thử nhiều phòng mang cửa chính mà không cách nào qua thì báo lỗi của cách thử ÍT lỗi chặn nhất, kèm
     ghi chú `entry_room_tried`.
3. **Ô kho 2 m² kẹt góc làm cả tầng 1 bị gửi lại mô hình.**
   - Sửa: `ai/stranded.ts` nhập phòng phụ nhỏ không chạm lối đi nào vào phòng kề chung nhiều cạnh nhất, trước khi
     xếp. Ý định đã nhập cũng là ý định gửi lượt sửa.
   - Phạm vi đặt ở kb: `kb/construction_norms.yaml` `sketch.absorb_stranded` (kho, tủ đồ, ≤ 4 m²).
   - Ba ngoại lệ: không đụng phòng đầu bài yêu cầu ở tầng ấy; không nhập vào thang, thang máy, gara, hiên; có
     ghi chú cho kỹ sư.
   - Phát lại 213 vòng: 19 = 19, 0 lùi; chỉ lượt 75ba5793 đổi (tầng 1 vòng 1 qua).
4. **Vòng sửa không nhận ra câu trả lời lặp.** Chốt `unchanged` chỉ so với ý định VỪA gửi, nhưng lượt sửa gửi lại
   lượt hỏng nhẹ nhất cũ hơn (T73 i), nên vòng 3 y hệt vòng 2 vẫn lọt.
   - Sửa: `houseAnswerKey` gồm bản phác, danh mục, quan hệ, lối vào; bỏ lời văn tự do. Vòng lặp (Workflow và
     đường đồng bộ) nhớ mọi câu trả lời đã chấm; gặp lại thì dừng như `unchanged`.

**Kết quả phát lại lượt 75ba5793 với mã mới:**
- Vòng 1: chỉ còn lỗi tầng 3, lỗi thật của mô hình.
- Vòng 2: **qua với 64,5 điểm**, ngưỡng nhận 60.
- Lượt chạy lẽ ra xong sau 2 lượt gọi (khoảng 0,32 USD).

**Hàng rào:**
- `__tests__/ai-run-75ba.test.ts` với tệp lượt ghi `fixtures/ai-run-75ba5793.json`. Từ nay lượt này cũng vào bộ
  phát lại.
- `__tests__/ai-stranded.test.ts`.
- Đột biến M203 (chừa theo vách ngăn), M204 (tắt nhập kho), M205 (khoá bỏ bản phác). Số M203+ vì nhánh
  `ai-design-duong-so-do` đã dùng M199–M202.
- Bộ phát lại lưu ở `.sao-luu/75ba5793/`.

**Đánh số:** quyết định này là T153, phần chọn nền mặt đứng / phối cảnh là T152. Nhánh `ai-design-duong-so-do`
(chưa merge) đã dùng T147–T151. T147 «tờ mặt đứng chi tiết» (PR #22) trùng số với T147 «sửa tay» của nhánh ấy —
phải đổi một trong hai khi merge.

### T154 — Bỏ dấu in trên ảnh do mô hình ảnh vẽ (11/10/2026, Haan)

Haan gửi ảnh chụp dải chữ «Ảnh minh hoạ do AI vẽ — không đo được trên hình» in đè góc dưới ảnh, và bảo: «bỏ dòng
chữ này khi gen ảnh bằng model image». T117 đã bỏ các câu chú thích trong trang nhưng còn giữ dấu in lên pixel; nay
bỏ nốt dấu ấy, ở MỌI ảnh mô hình ảnh vẽ, cho nhất quán:
- mặt bằng có nội thất;
- ảnh mặt đứng có vật liệu;
- bộ phối cảnh;
- ảnh vẽ từ bản vẽ kỹ sư tải lên;
- ảnh bìa thẻ AI Design.

**Thay đổi trong mã:**
- Ảnh hiện và tải về đúng như mô hình trả. Nút «Tải ảnh có nhãn» đổi thành «Tải ảnh».
- Bỏ câu dự phòng «trình duyệt không in được nhãn».
- Xoá `web/src/lib/watermark.ts`. Ảnh bìa đã dùng bản xem trước thu nhỏ ở máy chủ (`&w=`), nên không cần canvas.

**Giữ nguyên:**
- Hợp đồng `watermark_applied: false`: byte trong kho vốn chưa bao giờ đóng dấu.
- Các câu `AI_DISCLAIMERS.*Stamp` mà máy chủ còn trả ở trường `watermark`.
- Tờ vector vẫn là tờ chính, ảnh vẫn đứng ở panel riêng bên dưới.

### T155 — Lượt hỏng 79669685: ban công đúng trên bản phác, lỗi gốc không tới mô hình (11/10/2026, Haan: «làm cả 3»)

Lượt xếp mặt bằng trên máy, biệt thự nhà vườn 15 × 20 m, 2 tầng, ba thế hệ; ban công BẮT BUỘC ở mặt trước và bên
trái, đua 1 m. Năm lượt gọi gpt-6-sol (0,406 USD), không ra phương án. Câu lỗi cuối: «ban công "balcony_1" chỉ chạm mặt
trước ở góc». Phát lại ở máy (không gọi mô hình) cho thấy bản phác vòng 4 có `bc1` 8 × 1 ô chạy suốt mép trước — ban
công đúng. Chuỗi thật:

1. Để kéo ban công dọc mặt trước, mô hình dời giặt phơi xuống góc sau – trái. Ở đó nó chỉ giáp `bc2` (ban công RIÊNG
   của phòng ngủ `bd4`) và một phòng ngủ.
2. Phép kiểm lối vào trên bản phác (`sketchNoAccess`) cho qua: `served_from.laundry` có `balcony`. Bộ đặt cửa thì
   không nhận (`doors.ts`: chủ cửa phải đã tới được và không là phòng con) → cổng bác bản phác, mã `room_without_door`.
3. Mã ấy không nằm trong `REVISABLE_CODES`, nên bị lọc khỏi `sketchFailure`. Không có câu mở «Your sketch of storey 2
   failed…», hàng rào T90 / T107 (`balconyMovedByRepartition`) không bật.
4. Chương trình tự chia lại tầng 2 và nắn `balcony_1` thành khối góc ~11–12 m²; cổng mặt bằng báo «chỉ chạm ở góc».
5. Mô hình nhận một câu sai về chính bản phác của nó, trả lại y nguyên; chốt «lượt sửa trả về đúng bố cục» dừng ở vòng 5.

Vòng 2–3 cùng kiểu: bản phác tầng 2 hỏng vì `bedroom_5` 2,75 × 7,37 m (`arrange_room_too_narrow`, cũng ngoài
`REVISABLE_CODES`). Phản chứng: bỏ riêng giặt phơi khỏi bản phác vòng 4 thì lỗi ban công biến mất.

**Ba sửa:**

1. **Lỗi bản phác không rơi khi tầng phải chia lại** — `SKETCH_FAILURE_CODES` = `REVISABLE_CODES` ∪
   `BAND_REVISABLE_CODES` (`arrange/issues.ts`), cùng lẽ với đường dải T116: phòng không cửa, phòng hẹp là chỗ mô hình
   vẽ. Bộ xếp giữ thêm `bestSketchFailure` bên cạnh `bestRevisable` (cái sau lọc mất các mã ấy). Chỉ đổi
   `sketchFailure` (câu nhắc, giữ tầng); lượt chạy dừng hay gọi lại vẫn theo `REVISABLE_CODES`.
2. **Phòng phục vụ không là phòng con** (`sketchNoAccess`): một phòng `served_from` chỉ là chỗ mở cửa khi nó không
   mang `ensuite_of` — đúng như bộ đặt cửa (`doors.ts`, chủ cửa không có `parent`). Lời dẫn 9.9.2 thêm câu «serves no
   other room: no laundry off a bedroom's own balcony». Bản đầu đòi thêm phòng phục vụ tự giáp hành lang — phát lại
   bác oan 46d6eff3 vòng 1 (qua cổng 73 điểm: giặt ← ban công tự do ← phòng làm việc, bộ đặt cửa nhận chuỗi ấy) → GỠ;
   phép kiểm bản phác chỉ bắt chỗ CHẮC CHẮN sai.
3. **Câu ban công khối góc nói đúng sự thật** (`truthfulBalconyIssues`, `plan-demands.ts`): bản phác ĐÃ có ban công
   chạy dọc mặt ấy mà mặt bằng thành khối góc → tầng bị chia lại thì câu nhắc nói khối góc là do chia lại
   (`balcony_side_missing_reshaped`, đứng sau dòng lỗi bản phác; khối `house_layout` có bản «Your layout…» vì chế độ hình
   chữ nhật cấm chữ «sketch»); không bị chia lại thì câu `fitted` (khớp vào tường
   nó thành khối góc — vẽ dài hơn, tránh góc; bản đầu bỏ hẳn câu, rà soát chỉ ra câu nhắc có thể rỗng — xem T157). Cổng vẫn bác cả nhà như cũ — KHÔNG lặp «bản nới» T107 (coi khối góc là hệ quả,
   phát lại 14 → 12).

**Phát lại lượt 79669685 với mã mới:** vòng 4 bị bác ngay ở bản phác tầng 2 với câu «"ld1" has no way in… touches
"bc2", "bd5"», tầng 1 khoá. Vòng 2 nhận đủ: câu mở «sketch of storey 2 failed», `study_1` hụt diện tích, `bedroom_5`
thành dải, rồi «Your sketch already runs "bc1" along the front edge; it became a corner block only because the program
had to partition storey 2 itself».

**Đo phát lại toàn kho** (213 vòng / 50 lượt ghi, đối chứng = cùng mã với cả ba sửa tắt; 20 mặt bằng qua):
- Sửa 1: 20 → **21**, 2 vòng tiến, 0 lùi. f1a88ac1 vòng 5 nay ra mặt bằng 72 điểm (vòng trước đó hỏng ở tầng 2 trong cả hai
  cấu hình; khác nhau ở tầng nào được khoá khi ghép lượt sửa); f1a88ac1 vòng 3 từ lỗi tầng 2 tiến tới lỗi cả nhà.
  Câu mở «sketch of storey N failed» xuất hiện ở 31 vòng thay vì 29.
- Sửa 2, bản đầu (đòi ban công tự giáp hành lang): 20 → 19, lùi 46d6eff3 vòng 1 — đã gỡ phần ấy, xem trên.
- Sửa 3: 20 = 20, 0 tiến, 0 lùi — chỉ đổi câu nhắc: 7 vòng nhận câu `reshaped` thay câu khối góc sai sự thật; không vòng
  nào bị bỏ hết câu nhắc (không có lượt nào bị dừng thêm).
- Sửa 2 bản hẹp (chỉ cấm phòng con): 20 = 20, 0 tiến, 0 lùi — 46d6eff3 vòng 1 qua lại như đối chứng.
- **Cả ba cùng bật: 20 → 21, 2 vòng tiến, 0 lùi**; 12 vòng nhận câu `reshaped`, 33 vòng có câu mở «sketch of storey N
  failed» (đối chứng 29); không vòng nào bị bỏ hết câu nhắc. Lượt 79669685 (4 vòng, không có trong đối chứng): vòng 1 và
  4 bác ngay ở bản phác vì giặt phơi, vòng 2–3 nhận lỗi bản phác + câu ban công `reshaped`.

**Hàng rào:** `__tests__/ai-run-79669685.test.ts` với `fixtures/ai-run-79669685.json` (vòng 1 ghép tầng 2 của lời gọi
2 với tầng 1 đã khoá của lời gọi 3); ba ca `truthfulBalconyIssues` trong `ai-revision-view.test.ts`. `mutation-proof` 4/4 bị bắt — đột biến M207
(bỏ mã đường dải khỏi `SKETCH_FAILURE_CODES`), M208 (ban công riêng phục vụ được), M209 (không gắn `fitted` khi tầng
không bị chia lại), M210 (không gắn `reshaped`). Bộ phát lại ở `.sao-luu/t155/`,
`.sao-luu/79669685/`.

Từ T157 vòng 2 lượt 79669685 dừng sớm hơn (bản phác chắn đầu thang), nên M207 chuyển sang canh trên vòng 1 lượt
458d9a91 (`ai-live-458d9a91.test.ts`): tầng 1 chia lại vì `wc_1` không có cửa — câu nhắc nói đúng lỗi ấy sau câu «sketch
of storey 1 failed».

**Đánh số:** T155 và M207+ vì nhánh `ai-design-duong-so-do` đã tới T153 / M206.

### T156 — Mặt đứng: thân tầng là khối kín, không gồm ban công đua (11/10/2026, Haan)

Haan (lượt mặt đứng 6e155ce6 trên bản demo, biệt thự 15 × 20 m): «tầng 2 ở mặt bên trái chỉ có ban công thò ra thôi,
nhưng mặt đứng lại vẽ cả tường thẳng lên + mái ở phần ban công thò ra».

**Gốc:** khung mặt đứng (`facade/frame.ts`) lấy bề ngang mỗi tầng từ HÌNH BAO tầng. Hình bao tầng 2 gồm cả ban công trái
đua 1 m ra ngoài (T91, `tree/balcony-projection.ts`): x 150–1500, trong khi khối kín là 250–1500. Bộ vẽ dựng thân tường,
phào sàn và tường chắn mái theo bề ngang ấy. Mô hình cũng nhận «storey 2: x 150 to 1500» nên đặt phào và diềm mái từ
x 150.

**Sửa:**
- `enclosedSpan(level)`: bề ngang khối kín = mép ngoài các tường bao (`k: 'e'`); ban công không có tường bao, mép ngoài
  của nó là lan can (`k: 'r'`). Kẹp trong hình bao — mặt bằng mẫu đặt trục tường bao ngay trên hình bao.
- Khung dùng nó cho thân từng tầng; bề ngang cả khung vẫn là hợp hình bao (lan can trái vẽ ngoài thân tường).
- Ý tưởng mặt đứng là artifact bất biến, nên ý tưởng đã lưu được nắn LÚC VẼ khi có mặt bằng (`withEnclosedLevels`, gọi ở
  tờ SVG, ảnh neo, DXF): thu thân tầng về khối kín, cắt phào / diềm mái / ron theo thân tầng chứa chúng (dải trên mái theo
  tầng trên cùng). Chỉ thu hẹp; không có mặt bằng thì giữ nguyên. Không phải dựng lại mặt đứng (không tốn lượt gọi).

**Hàng rào:** hai ca trong `ai-facade-frame.test.ts` trên `fixtures/facade-6e155ce6.json` (mặt bằng + ý tưởng thật của
lượt ấy); đột biến M211 (thân tầng theo hình bao), M212 (không nắn lúc vẽ), M213 (không cắt dải) — 3/3 bị bắt. Bộ thử
mặt đứng 134/134 xanh, ảnh chụp vàng không đổi (mặt bằng mẫu không có ban công đua).

Còn mở: phần nối `withEnclosedLevels` vào `facade/index.ts` không có phép thử riêng — vitest không nạp được
`facade/index.ts` (kb nạp dạng văn bản của Worker).

### T157 — Thang tầng trên: lối ra ở đầu người bước ra, không ở cạnh dài giữa vế bậc (11/10/2026, Haan)

Haan (phương án 6 hồ sơ c815a6e6, mặt bằng 08/10/2026 trên bản demo): «thang bộ lên tầng 2, vách quây kín 3 góc, một góc
mở thì không thể đi lại qua đó vì nằm ở giữa thang».

**Gốc:** đường bản phác lưới (đường đang chạy trên bản thật — `AI_PROMPT_PIPELINE` không đặt). Ở tầng trên, bộ đặt cửa
(`arrange/doors.ts`) mở đúng MỘT lối ra từ ô thang, chọn theo `stairExitRank`: đầu người từ tầng dưới bước ra
(`stairArrival` — thang U: cùng đầu với bậc 1 tầng dưới) đứng đầu, rồi đầu ngắn kia, rồi cạnh dài. Đó chỉ là ƯU TIÊN: đầu
bước ra không giáp lối đi thì lặng lẽ mở cạnh dài. Phương án 6: tầng 1 vào thang từ phòng khách ở đầu phía mặt tiền, tầng
2 bản phác đặt phòng ngủ chắn đầu ấy, hành lang chạy dọc cạnh dài → ô thông 2,52 m giữa vế bậc. Đường dải (v6) đã chặn ca
này từ trước (`stair_end_blocked`); đường lưới thì chưa.

**Sửa:**
- `deriveDoors`: tầng trên, khi có thông số loại thang, lối ra không nằm ở cạnh bước ra (`arrivalSide`) → lý do
  `stair_arrival_blocked`. Không có thông số là mô hình thang cũ (lượt ghi trước T105, thang U vào theo cạnh dài) — bỏ qua;
  bản chạy thật luôn có (`chooseStairShape` lùi về chữ U).
- `gateCandidates`: lý do ấy LOẠI ứng viên (`GATE_REASON_CODES`), không chỉ xếp sau — trước đó mọi ứng viên vướng thì cây
  ít tệ nhất vẫn qua. Loại trước khi tính suất qua cổng, để cây bị chặn rẻ phạt hơn không đẩy cây đi được ra khỏi suất.
- `stair_arrival_blocked` vào `REVISABLE_CODES`: chỗ sai là bản phác đặt phòng chắn đầu thang; câu nhắc nói đầu nào và
  đang giáp gì, «put the corridor or the living space along that whole side». Luật cứng vì «không đi được» (T49).

**Phương án 6 phát lại:** bộ xếp dựng lại tầng 2 — ô thang kín ba phía, đầu có bậc 20 / «XUỐNG» mở suốt ra một hành
lang ngang 14,3 m²; qua 76,8 điểm. Phương án đã lưu trên demo không tự đổi (mặt bằng đã lưu giữ cửa) — phải xếp lại.

**Đo phát lại toàn kho** (217 vòng / 52 lượt ghi, đối chứng = cùng mã tắt phép chặn): 21 → 19 mặt bằng qua, 0 tiến,
3 «lùi», cả ba của bea4c6fa: vòng 5 (67,3) và vòng 6 (64,8) có lối ra thang tầng 2 là ô thông 2,69 m ở cạnh dài — đúng
lỗi Haan chỉ, chặn đúng; vòng 4 chỉ đổi từ lỗi cả nhà sang lỗi tầng 2. Thêm: 75ba5793 vòng 2 (T153: «qua với 64,5»; mã
hiện tại 66,9) mở thang ở cạnh dài tầng 2 và 3 — phương án đi được tốt nhất còn 58,4 < 60, lượt chạy thật sẽ gọi mô hình
sửa tiếp. Lượt 79669685 vòng 2–3: bản phác tầng 2 đặt phòng làm việc chắn đầu bước ra — nay bác theo tầng với câu nhắc
đúng chỗ, trước khi tới phần ban công T155.

**Rà soát mã (11/10/2026, 10 phát hiện):** sửa — câu ban công khối góc không bỏ mà gửi câu `fitted` (bỏ có thể làm câu
nhắc rỗng, lượt dừng); khung bao tờ mặt đứng thêm mép phải ban công (T156 làm thân tầng hẹp lại); ứng viên bị chặn không
chiếm suất cổng; câu nhắc dùng «side» cho đúng cả thang L. Bác — v6 không chạy bản thật và đã có `stair_end_blocked`;
`sketchFailure` lúc tính chỉ có ứng viên từ bản phác; đổi việc giữ tầng là có chủ ý (T155, đã đo); mã mới thay vì dùng lại
`stair_end_blocked` vì câu của mã ấy nói bằng chữ «THANG» của đường dải. Đề xuất «không có thông số thì mặc định đầu bậc 1»
đã thử và gỡ: bác oan 5aba737d, 2ddf782a (mô hình thang cũ vào theo cạnh dài).

**Hàng rào:** `ai-run-1f3acd9f.test.ts` + `fixtures/ai-run-1f3acd9f.json` (ý định đã lưu của phương án 6); cập nhật
`ai-run-79669685`, `ai-run-75ba`, `ai-live-bea4c6fa` theo sự thật mới. Đột biến M214 (bỏ phép kiểm), M215 (lý do chặn
chỉ xếp sau).

**Còn mở:**
- T109 (ban công ghim khi chia lại) và T111 (không dừng tìm biến thể ở ngưỡng nhận) mất ca canh: hai ca của bea4c6fa dựa
  trên mặt bằng có thang không bước ra được. Đã thử bốn lượt ghi khác còn ra mặt bằng — biến thể đầu đều vượt mức tìm.
- Tầng trên cùng nhà ống 75ba5793: ô thang có thêm cửa trượt ra sân thượng ở cạnh dài — phép kiểm chỉ đòi CÓ lối ra ở đầu
  bước ra, chưa cấm lối thứ hai ở cạnh dài.
- Tầng giữa nhà nhiều tầng với thang thẳng (đầu bước ra khác đầu bậc 1) chưa đòi cả hai đầu như đường dải.

### T158 — Tầng 1: lối vào thang ở đầu bậc 1 là luật cứng; mọi tầng một tỷ lệ bản vẽ (11/10/2026, Haan)

Haan (lượt e1c432f4 hồ sơ c815a6e6, claude-opus-5-5, bản demo): «đã dùng đến model cao cấp opus 5.5 mà phần thang bộ
vẫn bị lỗi vách ngăn bao đường lên/xuống». Rồi: «tầng 2 kích thước đang để tràn khung, nhưng vẫn hiện nhỏ so với mặt
bằng tầng 1».

**Gốc — không phải mô hình.** Mô hình chỉ vẽ bản phác; cửa và vách do chương trình đặt.
- Tầng 2: WC chắn đầu bước ra, lối ra mở ở cạnh dài — đúng lỗi T157. Bản demo phát hành 11:50, T157 commit 16:37:
  lượt chạy 18:10 dùng mã cũ. Phát lại với mã hiện tại: tầng 2 có sảnh ngang đầu thang, bước ra đúng đầu.
- Tầng 1: bản phác đặt kho chắn đầu bậc 1, hành lang dọc cạnh dài. `shapedStairEntry` không tìm được đầu ngắn giáp lối
  đi → giữ cửa ở cạnh dài, báo `stair_entry_long_side` (T105 đã gọi tên đúng ca này: «bậc 1 giáp tường kho»). Nhưng mã
  ấy chỉ XẾP ứng viên sau; mọi ứng viên vướng thì cây ít tệ nhất vẫn qua.
- Bản vẽ: `renderPlanSheet` chọn tỷ lệ và hướng giấy theo khung RIÊNG từng tầng. Tầng 2 có ban công đua 1 m hai mặt
  (13,72 m so với 12,72 m) → 1:100 khổ ngang; tầng 1 → 1:80 khổ đứng. Đặt cạnh nhau, tầng trên trông nhỏ hẳn.

**Sửa:**
- `stair_entry_long_side` vào `GATE_REASON_CODES` (`arrange/index.ts`): loại ứng viên, như `stair_arrival_blocked`.
  Chỉ khi biết loại thang (`construction.stairs.shape`) — bản chạy thật luôn có. Câu nhắc mô hình đã có từ T105.
- `houseBounds` (`draw/plan-sheet.ts`): tỷ lệ, hướng giấy và chỗ đặt hình theo khung chung mọi tầng (+ tầng đang vẽ,
  cho tờ mái đua). Mọi tờ cùng tỷ lệ; trục và tường thẳng hàng giữa các tờ. Lượt e1c432f4: hai tầng 1:100 khổ ngang.

**Đo phát lại** (219 vòng / 53 lượt ghi, đối chứng = cùng mã tắt chốt):
- Lần đầu chặn cả khi không có thông số loại thang: 20 → 18. Ba vòng mất đều là mô hình thang CŨ (trước T105);
  b1543b8c vòng 2 đúng là thang vào cạnh dài, còn 7c6de305 vòng 3 và b1543b8c vòng 6 vào đúng đầu bậc 1 mà vẫn mất vì
  quỹ đạo tìm đổi. Như T157: chỉ chặn khi có thông số.
- Lần hai: **20 = 20, 0 tiến, 0 mất mặt bằng**. Đổi: e1c432f4 vào thang đúng đầu (74,4 → 69,9 — giá của lối vào đi
  được); fdd486b1 vòng 2–5 và 75ba5793 vòng 4 nay báo lỗi thang tầng 1 thay vì lỗi của cách chia lại; bea4c6fa vòng
  4–6 đổi sang lỗi đầu bước ra tầng 2 (cmp tính vòng 6 là «lùi» giai đoạn, không mất mặt bằng).

**Hàng rào:** `ai-run-e1c432f4.test.ts` + `fixtures/ai-run-e1c432f4.json` (ý định đã lưu); `ai-draw.test.ts` «mọi tầng
cùng tỷ lệ». Đột biến M216 (bỏ mã khỏi cổng), M217 (khung riêng từng tầng). Phép thử cập nhật theo sự thật mới:
`VILLA_CRAMMED` có sảnh giữa gara và đầu bậc 1 (bản phác mẫu để gara chắn đầu ngắn — ca T91 đo diện tích, không đo
thang); 75ba5793 cắt hàng đầu ô thang thay hàng cuối để vẫn tới cách thử đổi phòng mang cửa chính; fdd486b1 vòng 2 lỗi
cách chia lại nay là lối vào thang; 79669685 vòng 2 hạn 120 giây (cả nhóm chạy song song vượt 30 giây).

**Còn mở:** phương án đã lưu trên demo không tự đổi — phải phát hành `nvg-api` rồi xếp lại. Tầng giữa nhà nhiều tầng
thang thẳng vẫn như T157.

**Bổ sung (11/10/2026, Haan xem phát lại e1c432f4):** đo lỗ mở trên dữ liệu bản vẽ thì tầng 2 mở 2,57 m GIỮA cạnh ô
4,67 m (y 1616→1873) — vế tới chỉ trùng ~1 m, phần còn lại mở ra khe giữa và vế đầu (ở tầng trên là khoảng thông xuống
chân thang). Tầng 1 căn theo vế đầu (`shapedStairEntry`), tầng trên chưa căn gì. Sửa: `deriveDoors`, thang `chu_u` /
`chu_u_rong` tầng trên → lỗ mở ra sát phía vế tới (`firstFlightAtLowEnd`, dùng chung với tầng 1); e1c432f4 nay mở
y 1711→1968, phủ trọn vế tới. Nhãn «XUỐNG» ở tầng trên chuyển từ bậc 1 sang bậc cuối (`draw/stairs.ts`) — bậc 1 ở tầng
trên là khoảng thông tầng. Thang ba vế, chữ L, thẳng: chưa căn. Bản vẽ phát lại xuất ở
`~/Documents/Doc/NVG/test/mat-bang-e1c432f4-phat-lai-tang-{1,2}.{svg,png}` và ảnh so sánh `thang-e1c432f4-so-sanh-tang-*.png`.
Hàng rào: phép thử e1c432f4 đo khoảng lỗ mở và vị trí nhãn; đột biến M221, M222.

**Bổ sung 2 — giữ bố cục, khoét sảnh đầu thang (11/10/2026, Haan xem phát lại):** «thang thì oke rồi, nhưng bếp và
phòng ăn sắp lại không hợp lý. Ở bản vẽ chính thức có thể giữ lại hướng thang, chỉ cần điều chỉnh vách và không gian
hành lang ở điểm lên xuống thang». Gốc: chốt cổng bác cả cây, bộ xếp tìm cây khác hẳn (quay thang, xáo bếp + phòng ăn).
- `emitCandidate`: bộ đặt cửa báo thang bị chặn (`stair_entry_long_side` khi biết loại thang, `stair_arrival_blocked`)
  → `landStairEnd` thử GIỮ cây: `arrange/stair-landing.ts` lấy dãy ô cùng cột với ô thang theo trục dọc thang (chuỗi
  nhát cắt cùng trục), chèn dải sảnh sâu max(hành lang thông thuỷ + vách, `doorShared`) giữa ô thang và phòng chắn, rồi
  chia lại vách các phòng liền nhau phía ấy — phòng chắn nhường dải, hụt cạnh kỹ thuật / diện tích đầu bài khai thì
  phòng kế tiếp nhường bù. Ô thang và khối không phải phòng đơn giữ nguyên chỗ. Dải là lá giao thông mới (chương trình
  thêm một space). Tầng 1 thử từng đầu ngắn; tầng trên dùng `stairSidesNeeded`. Nhận khi dựng lại cửa hết chặn và dải
  nối được về lối đi; không thì cổng bác như trước. Ghi chú `stair_landing_carved` nói phòng nào nhường, vách nào dời.
- e1c432f4: tầng 1 giữ nguyên bố cục mô hình vẽ và thang `+y`; sảnh 4,6 m² giữa kho và thang, vách kho | gara lùi lên
  (kho 8,9 m² ≥ 8 đầu bài khai, gara 24 m²); tầng 2 sảnh từ WC phòng ngủ chính. Lỗ mở tầng 1 trên vế đầu, tầng 2 trên
  vế tới (đo trên dữ liệu bản vẽ).
- Phát lại 219 vòng (đối chứng = cùng mã tắt bước khoét): **20 → 21 mặt bằng, 5 tiến, 0 lùi** — bea4c6fa vòng 6 ra mặt
  bằng (lối ra tầng 2 ở đầu `y1`), 6bf43039 vòng 3, 5 và 79669685 vòng 2, 3 qua được tầng 2, dừng ở kiểm cả nhà. Xem
  bằng mắt: 75ba5793 vòng 2 (nhà ống 5 m) sảnh 4,7 m² ngay đầu bậc 1, bea4c6fa vòng 6 sảnh 8 m² ở đầu bước ra.
- Phép thử cập nhật theo sự thật mới: `VILLA_HOUSE` thêm sảnh hai tầng (chỉ thêm loại giao thông); bea4c6fa vòng 6 qua,
  vòng 5 vẫn bác; 75ba5793 vòng 1+2 lên 63,8 ≥ 60; 79669685 vòng 2 hỏng ở ban công cả nhà, câu nhắc vẫn nói hai đầu thang
  của bản phác. e1c432f4: hướng thang như bản đã lưu, mọi phòng tầng 1 trùng ≥ 60 % chỗ cũ, thêm đúng một sảnh. Đột
  biến M223 (bỏ bước khoét), M224 (không dời vách bù).

### T159 — Tên phương án / mặt đứng / bộ ảnh: số cố định, bản sửa mang số gốc + lần sửa (11/10/2026, Haan)

Haan: «sau khi xoá 1 phương án thì phải re-load lại web thì phương án đó mới biến mất». Hai gốc:
1. Hộp thoại đóng lúc lệnh xoá xong, còn `/state` trên demo mất 1,8–4 giây → mục đã xoá nằm trên dải suốt quãng ấy.
   Sửa: `hideFromState` (`web/src/hooks/use-ai-design.ts`) bỏ mục khỏi `/state` đang giữ ngay, rồi nạp lại.
2. Tên đánh theo VỊ TRÍ trong danh sách đang hiện (T 07/10/2026): xoá «Phương án 2» thì bản thứ ba thành «Phương án 2»;
   dải chỉ hiện 12 bản nên bản thứ 13 trồi lên lấy chỗ — nhìn như không xoá được.

Haan chọn (trong ba hướng đề xuất: số cố định + lần sửa + ngày giờ; thêm tên kỹ sư tự đặt; «theo …» cho mặt đứng và
phối cảnh): **số cố định + lần sửa + ngày giờ, và «theo …»**; không ghi tên model; chưa làm tên tự đặt.

- Máy chủ đánh nhãn (`ai/variant-labels.ts`, gọi ở `/state`): bản gốc số theo thứ tự tạo trong CẢ hồ sơ, tính cả bản
  đã xoá khỏi dải — số không đổi; bản sửa (cạnh lineage từ bản cùng loại: ô yêu cầu, sửa tay, sửa mặt đứng) mang số gốc
  + lần sửa trong cả nhánh gốc ấy (3.1, 3.2 — sửa tiếp từ 3.1 là 3.2, không 3.1.1). `/state` đọc mã + ngày của mọi bản
  (tối đa 500 mỗi loại, không payload) và cạnh lineage chia lô 60 mã (địa chỉ GET dài).
- Mặt đứng mang `planLabel` (phương án dựng theo — có cả khi phương án ấy đã xoá khỏi dải), bộ ảnh mang `facadeLabel`;
  bản sửa không có cạnh sang loại kia thừa hưởng của bản gốc. `planRef` giữ nghĩa cũ (chỉ khi phương án còn hiện).
- Giao diện: «Phương án 3.1», «Mặt đứng 2 · theo Phương án 3.1», «Bộ ảnh 1 · theo Mặt đứng 2», dòng ngày giờ dưới tên.
  Máy chủ cũ không trả nhãn thì lùi về đếm theo vị trí.

**Hệ quả Haan sẽ thấy ngay:** hồ sơ c815a6e6 trên demo đã tạo 19 phương án, 13 bản cũ đã xoá → 6 phương án đang hiện
đổi tên từ 1–6 thành 14–19; mặt đứng 2–5 ghi «theo Phương án 11» (phương án đã xoá mà chúng thật sự dựng theo).

**Hàng rào:** `ai-variant-labels.test.ts`, `use-ai-hide.test.tsx`, phép thử nhãn ở bước Mặt bằng / Mặt đứng. Đột biến
M218 (xoá chỉ nạp lại), M219 (giao diện bỏ nhãn máy chủ), M220 (bản sửa đánh số như bản mới). Gỡ
`ArtifactRepository.inputsAmong` (thay bằng `edgesInto`).

### T160 — Kích thước chi tiết: hành lang, WC khép kín, chiếu nghỉ; chấm sảnh thừa và ban công (13/10/2026, Haan)

Haan (phương án d084a46e hồ sơ c815a6e6, 12/10/2026, gpt-6-sol, bản demo): «về bố trí phòng là khá tốt, nhưng về kích
thước chi tiết + thang bộ + công năng + thẩm mỹ là chưa tốt». Sáu điểm: tầng 1 ô giao thông 16,9 m²; WC trong phòng ngủ
dài 5,6 m; tầng 2 hành lang rộng 2,15 m — «thu lại còn khoảng 1.5m, phần diện tích còn lại bù vào phòng giặt phơi và
WC»; thang tầng 2 không có lối ra (bậc 20 giáp vách phòng ngủ) và chiếu nghỉ quá rộng (12,8 m²); ban công mặt tiền nên
mở từ giao thông chung và lớn, ban công hông nhỏ hơn; hai tầng hiện lệch cỡ ở cùng lựa chọn «Tràn khung».

**Hai điểm đã có bản sửa nhưng chưa phát hành.** `nvg-api` trên demo là bản 11/10 11:50, trước T157 (lối ra thang tầng
trên) và T158 (mọi tầng một tỷ lệ). Phát lại ý định đã lưu bằng main: cổng bác tầng 2 (`stair_arrival_blocked`), bước
khoét sảnh không khoét được (phòng ngủ chính không phủ trọn cạnh dãy) — lượt thật sẽ gọi mô hình sửa. Tờ vẽ dựng lúc
xem, nên phương án đã lưu hiện cùng 1:100 ngay khi API mới chạy. Haan chọn phát hành ngay: `nvg-api` da25c2d5 (13/10),
hợp đồng `5e6bfa324d9e`.

**Gốc của bốn điểm còn lại — chương trình theo sát bản phác.** Mô hình khai `circulation_2` 17 m², vẽ WC khép kín sáu ô
suốt bề ngang phòng ngủ, và khai hành lang 9 m² cho dải 5,4 m. Thu hẹp hành lang T104 CÓ chạy (2,00 → 1,65 m theo tim)
nhưng vô hiệu vì ba chỗ:
1. `tree/sizing.ts` căn vách theo tỉ lệ diện tích chương trình; hành lang thuộc `noShrinkTypes` mang trọng số = max(số
   mô hình khai, hiện có) → nới lại về 2,1 m.
2. Biến thể thu hẹp chỉ nhận khi điểm không thấp hơn, mà A1 (lệch diện tích so với chương trình) và A5 (ô dưới định mức)
   phạt chính việc thu hẹp: hành lang nhỏ hơn số mô hình đoán, WC / giặt phơi lớn hơn số mô hình đoán (đầu bài không khai
   diện tích hai phòng ấy), mẩu hành lang 2,9 m² «dưới 3 m²».
3. Mô hình vẽ hành lang tầng 1 thành HAI ô nối nhau (`circulation_4` + `circulation_1`) — từng ô không phải dải.

**Sửa:**
- `resizeTree` nhận `corridorMax`: hành lang dải (lá hoặc chồng lá hành lang) không căn rộng quá mức nghề (biệt thự 1,5 m
  lọt lòng). Bật cùng điều kiện với T104 (`trimCorridors`).
- `trimCorridors` coi chồng ô hành lang nối tiếp là một dải. Cả hai bên nhận được thì chọn bên mà vách bị dời ít nối
  thẳng hàng với vách ngoài khối, trừ khi phòng nhận vượt diện tích tối đa của nghề (`space_norms`).
- Biến thể thu hẹp so điểm KHÔNG tính A1 (`percentWithoutAreaFit`); A5 không tính ô hành lang (bề rộng đã có C4).
- WC khép kín dài quá `ensuite.wc_max_length_m` (2,7 m theo tim, `kb/construction_norms.yaml`) → WC ở đầu chạm mép khối
  + «Tủ đồ» (`closet`, phòng khép kín của cùng phòng ngủ) phần còn lại (`arrange/ensuite-closet.ts`, Haan chọn). Vẽ lại
  bản phác tầng giữ cho lượt sửa thì tủ đồ trả về WC (`foldClosets`) — không thì `absorbUnknown` nhập nó vào phòng ngủ,
  phòng ngủ lồi vào dải WC (phát lại b1543b8c vòng 5).
- Thang U và ba vế: phần ô dư dồn về đầu bậc 1 thành sàn đứng / sàn bước ra, chiếu nghỉ vẽ đúng `landing` (1,5 m) —
  trước đó dồn hết vào chiếu nghỉ (d084a46e: 2,26 m).
- Thước chấm (Haan chọn: chỉ trừ điểm): C14 diện tích lớn nhất của ô giao thông có cạnh ngắn lọt lòng > 1,6 m (sảnh
  thừa); D6 ban công chính mặt tiền (lớn nhất chạm `y0`) phải có cửa từ nhóm `shared_access` (hành lang, sảnh, khách,
  ăn) — nhà ống không chấm; D7 ban công hông lớn hơn ban công chính mặt tiền. Câu nhắc ba mã trong lời dẫn 9.9.3.
- Lời dẫn tự mâu thuẫn (rà 14/10/2026, Haan hỏi lỗi gốc ở mô hình hay dựng hình): bản phác bắt hành lang
  `corridor_min_cells` ô (biệt thự 1,475 m → 2 ô lưới 1 m) mà câu nhắc C12 bảo «one cell wide» — C12 nay theo
  `corridor_min_cells`; D5 dạy «bedroom first» cho mọi ban công, trái D6 — bỏ thứ tự khỏi D5 (thứ tự ban công sẽ nằm ở
  câu luật, T161); câu nhắc C14 viết sai nghĩa («leads to no room») — sửa thành «as large as a room».

**Phương án d084a46e phát lại** (bản phác tầng 2 sửa tay để có hành lang trước thang, `hand_level2`): hành lang tầng 2
2,14 → 1,50 m, WC + giặt phơi nhận phần dư; hành lang tầng 1 1,84 → 1,54 m; WC khép kín tầng 1 2,7 m + tủ đồ 4,5 m²;
chiếu nghỉ 1,5 m; C14 = 16,9 m², D6 = `balcony_1`, D7 = `balcony_2`.

**Đo phát lại toàn kho** (220 vòng / 54 lượt ghi, đối chứng = cùng mã tắt mọi thay đổi T160): **22 = 22 mặt bằng, 0
tiến, 0 lùi**, 25 vòng khác chi tiết. Hành lang hẹp lại ở 182665ea vòng 3 (2,40 → 1,59 m), 5aba737d vòng 1–3, e1c432f4
vòng 1 (1,74 → 1,50–1,54 m), bea4c6fa vòng 6, d084a46e. Điểm đổi phần lớn do ba tiêu chí mới (nhóm C, D có thêm phần).
Hai lần đo trước đó dẫn tới hai chỉnh:
- Tách tủ đồ áp thẳng vào MỌI ứng viên: 22 → 23 nhưng mất e1c432f4 vòng 1 (thứ hạng ứng viên tầng 2 đổi, ban công mặt
  trái ôm góc) → chuyển thành biến thể cả nhà sau T104 / T113, chỉ thử khi bản đang giữ có WC khép kín dài quá mức
  (`longEnsuiteWc`, khỏi tốn một lượt xếp cả nhà). Thử tính tủ đồ vào mốc khu ướt tầng dưới: cứu b1543b8c vòng 6 nhưng
  WC tầng 2 nằm trên tủ đồ (E2 trừ) — gỡ, không cần nữa khi tách là biến thể.
- Chốt bề rộng trong bước căn vách làm phần dư dồn sang ô thang tầng 1 (b1543b8c vòng 6: 5,15 → 5,74 m, tầng 2 hỏng) →
  chốt chỉ áp khi phía nhận không chứa thang / lõi / thang máy / giếng (`noGrowTypes`), và căn có chốt không qua cổng
  lần nào thì căn như cũ.

**Hàng rào:** `ai-run-d084a46e.test.ts` + `fixtures/ai-run-d084a46e.json` (`round1` = ý định đã lưu; `hand_level2`
không phải lượt thật — không mang tên `roundN` để bộ phát lại toàn kho bỏ qua); `plan-score.test.ts` (C14, D6 chấm
được ở nhà phố mẫu); `ai-plan.test.ts`, `ai-design-steps.test.ts` nhận phòng chương trình tự thêm là tủ đồ. Đột biến
M225–M232 đều bị bắt; M94 cập nhật `find`. Lượt đầu M225 (cài vào nửa chốt `capB`) và M227 sống sót: nửa chốt có tác
dụng ở d084a46e là `capA`; còn so điểm không tính A1 thì phát lại toàn kho khi gỡ nó cho thấy đúng hai vòng đổi
(1f3acd9f vòng 1: 1,84 → 1,89 m; d084a46e vòng 1 mô hình thang cũ: 1,49 → 1,58 m) — thêm ca canh thứ ba vào
`ai-run-d084a46e.test.ts` (ý định đã lưu, không thông số loại thang: phải có ghi chú `corridor_trimmed`).

**Còn mở:**
- Ô 16,9 m² sau thang tầng 1 của d084a46e vẫn nguyên — Haan chọn chỉ trừ điểm (C14); phương án vẫn 62,4 ≥ 60 nên không
  gọi mô hình sửa.
- Phần dư hành lang tầng 1 d084a46e trả cho cột phòng ngủ (vách lệch 30 cm so với vách gara / phòng ngủ phía trước) vì
  trả cho kho thì kho vượt 10 m² định mức. Muốn thẳng hàng thì phải dời cả dãy vách — chưa làm.
- WC tầng 2 d084a46e còn 2,6 m² (cột 1,13 m chồng đúng trục WC tầng 1), giặt phơi nhận gần hết phần dư (8,5 m²).
- Tủ đồ là phòng chương trình tự thêm: không có trong `level.intent`, lượt sửa bằng ô yêu cầu xếp lại từ ý định thì tủ
  đồ chỉ quay lại nếu biến thể tách lại thắng.
- D6 / D7 / C14 là suy luận nghề (n = 0) — chờ Haan / KTS chấm.

### T161 — Đầu bài và lời dẫn cho bản phác chuẩn hơn: hành lang, đầu lên / xuống thang, ban công chính (14/10/2026, Haan)

**Gốc.** Haan hỏi lỗi của phương án d084a46e (T160) xuất phát từ đầu ra mô hình hay phần dựng hình. Đối chiếu bản phác
và diện tích mục tiêu mô hình khai: một nửa là dựng hình (T160 đã sửa), nửa kia là mô hình — và phần của mô hình phần lớn
do **chính lời dẫn / đầu bài kéo nó vẽ sai**:
- Hành lang: lời dẫn bắt `corridor_min_cells` ô (biệt thự 1,2 m lọt lòng + tường = 1,475 m → 2 ô lưới 1 m), câu nhắc
  C12 lại bảo «one cell wide» (gỡ ở T160).
- Thang: tri thức gửi mô hình có loại và cỡ ô thang, không có chỗ người lên / xuống. Mô hình đặt phòng ngủ chính ở đầu
  bước ra tầng 2 (thang U bước ra cùng đầu với bậc 1); bộ xếp tầng 1 chọn đầu vào thang không nhìn tầng trên (đầu trước
  — cửa sẵn có từ phòng khách), nên cổng T157 bác cả nhà dù đầu sau giáp hành lang ở cả hai tầng.
- Ban công: `B_balcony`, `R_balcony`, câu nhắc D5 và câu văn đầu bài dạy «mỗi ban công thuộc một phòng, ưu tiên phòng
  ngủ» — mô hình gắn ban công mặt tiền cho phòng ngủ chính (`ensuite_of`), trái D6. Đầu bài không hỏi ban công chính mở
  từ đâu, sâu bao nhiêu.

**Haan chọn** (14/10/2026): hỏi gia chủ «ban công chính mặt tiền mở ra từ đâu», đã trả lời thì là **bắt buộc**; thêm câu
**độ sâu ban công chính**; **giữ lưới 1 m**, sửa lời dẫn (chương trình thu hẹp hành lang — T160).

**Sửa.**
- Lời dẫn 9.10.0, khối `floor_level.system` (đường đang chạy): luật 6 thêm «hành lang hoặc khu sinh hoạt chạy dọc trọn
  `arrival` của ô thang ở mọi tầng»; hành lang «đúng `corridor_min_cells` ô; sàn rộng hơn là phòng, không phải sảnh»; luật
  10 thêm «ban công chính mặt tiền lớn nhất, mở từ hành lang / khu chung; ban công khác nhỏ». Vừa trần T46 (5.500 ký tự)
  bằng cách rút câu cũ trùng ý (câu mở đầu kể lại lược đồ, «Relationships…» đã có trong lược đồ, «habitable rooms on
  open_faces» trùng `knowledge.faces`, «the stair where it is on storey 1» trùng luật 6) — không nới trần. `B_balcony`,
  `R_balcony` (v5 / v6) và câu văn đầu bài sửa cùng ý.
- Tri thức `stair_min_m.arrival` (`plan.ts`, `STAIR_ARRIVAL_SENT` theo `stairArrival`): `one_short_end` (U, U chiếu nghỉ
  rộng, ba vế), `both_short_ends` (thẳng — tầng trên bước ra đầu kia, vế kế tiếp lên từ đầu cũ), `short_end_and_long_side`
  (chữ L). Gửi ngay lượt đầu, không chờ cổng bác.
- Dựng hình: tầng trên hỏng mà thang tầng 1 còn cạnh khác vào được → thử tầng 1 với `stairEntryAvoid` (cạnh đang dùng
  xếp cuối trong `shapedStairEntry`, không cấm) TRƯỚC bước quay lui xếp hạng (T113). Chỉ khi lượt mang loại thang.
- Đầu bài: `balconies.main_front_access` (`chung` / `phong_ngu_chinh` / `chua_quyet`) và `balconies.main_front_depth_m`
  (0,6–3 m, chỉ khi mặt trước không khai độ đua). Hai hợp đồng, `anonymise`, `brief-form.json` (trọng số 0, cùng điều kiện
  hiện với các câu ban công khác), câu văn `<brief>`, `BalconyDemand.mainAccess / mainDepthM`, dòng `brief_demands`.
  Chỉ suy từ câu đã trả lời và chỉ khi mặt trước có ban công; «chưa quyết» không đòi gì.
- Cổng (`plan-check.ts` `checkMainBalcony`): ban công chính mặt tiền (lớn nhất chạm mặt trước, khối góc không tính —
  `mainFrontBalconies`) phải có cửa sang loại gia chủ chọn — nhóm `shared_access` (cùng nhóm D6 đọc) hoặc
  `demands.balcony.main_master_types` — mã `balcony_main_access`; không nông hơn độ sâu đã khai quá
  `main_depth_tolerance_m` (0,3 m, tường bao + lan can) — `balcony_main_depth`. Cả hai trong `REVISABLE_CODES`, có câu
  nhắc. Gia chủ đã chọn thì D6 không chấm (chấm thì trừ điểm chính điều gia chủ chọn «phòng ngủ chính»).
- Không đổi cách đặt cửa ban công: ban công không khai `ensuite_of` đã mở từ hành lang trước (thứ tự `door_hosts`), lỗi
  nằm ở `ensuite_of` của mô hình — cổng + câu nhắc báo đúng chỗ ấy.

**Đo.** Phát lại 220 vòng (đối chứng cùng mã, tắt bước thử cạnh vào thang): **21 → 22, 1 tiến, 0 lùi, 1 khác** — tiến là
d084a46e vòng 1: ý định gốc của mô hình nay qua cả nhà, 67 điểm (tầng 1 vào thang từ hành lang sau, tầng 2 bước ra
`circulation_6` sâu 1,54 m; WC tầng 2 giữ 3,2 m², giặt phơi 7,7 m² — không cần bản phác sửa tay của T160). Thay đổi lời
dẫn và đầu bài **không phát lại được** (phát lại dùng đầu ra đã ghi) — cần lượt thật, xin phép riêng.

**Hàng rào.** `ai-run-d084a46e.test.ts` (ý định gốc qua; `chung` bị bác kèm câu nhắc, `phong_ngu_chinh` qua; độ sâu 3 m bị
bác, 1,2 m qua; `arrival` đúng năm loại thang), `ai-brief-demands.test.ts`, `brief-narrative.test.ts`. Đột biến M233–M237.

**Còn mở:**
- Bộ xếp chưa căn ban công theo độ sâu đã khai — mới có cổng và câu cho mô hình. Lượt thật hay bị bác `balcony_main_depth`
  thì làm bước nắn trong `tree/sizing.ts` như bề rộng hành lang.
- Ban công hông bị chương trình nới (d084a46e: khai 4 m², ra ~12 m² sau khi đua) — mới chỉ trừ điểm (D7).
- `knowledge.balcony_main_depth_cells` trong kế hoạch chưa làm: độ sâu đã tới mô hình qua `brief_demands` và `<brief>`,
  thêm khoá là tốn trần tri thức cho cùng một ý.

### T162 — «AI Design» thành bốn bước: Đầu vào → Mặt bằng → Mặt ngoài → Bộ kết quả (22/10/2026, Đợt 5B)

Vấn đề 7 của chủ dự án («AI Design chưa gọn và chưa công thái học», `doc/MOC_CAI_TIEN_UX.md`) và dòng 5B của
`doc/KE_HOACH_LAM_HO.md`: có giá ước tính trước khi chạy, so được phương án, dùng được trên hồ sơ đã bàn giao. Chỉ sắp
xếp lại giao diện và luồng — không đổi `contracts/`, `workers/`, `kb/`, `rules/`, không migration.

- **Dải bốn bước** (`ai/ai-design-tab.tsx`): Đầu vào (đầu bài + khảo sát của hồ sơ, chỉ xem — T118) · Mặt bằng ·
  **Mặt ngoài** = mặt đứng + phối cảnh (hai phần chọn bằng một ô phân đoạn; phối cảnh chưa dựng được thì nói lý do
  ngay cạnh) · **Bộ kết quả**. `?buoc=` / `?phan=` của địa chỉ mở thẳng bước (trang ngoài đọc rồi đưa vào
  `initialStep` — thư mục `tk/ai/` không nhập router, `ai-independence.test.ts`); bấm đổi bước không điều hướng.
- **Chi phí ước tính trên nút** «Xếp mặt bằng» và «Sửa lại» (`ai/run-cost-estimate.ts`, `ai/ai-cost-estimate.tsx`):
  trung bình TIỀN ĐÃ TRẢ THẬT của các lượt chạy trước cùng tuyến mô hình — một lượt (`design_ai_run`, xong / hỏng) gom
  các dòng `design_ai_call` cùng hồ sơ, cùng nhóm mục đích, trong khoảng thời gian của lượt (đúng cách `useRunCalls`
  cộng tiền), tuyến = tuyến của lượt gọi ĐẦU (vòng sửa chạy `revise_route` vẫn cộng vào), chia số phương án đã yêu
  cầu, nhân số phương án đang chọn. Lượt có dòng chưa có giá niêm yết thì bỏ. Chưa có lượt nào → «Chưa đủ dữ liệu».
  **Không** nhân giá token với một số token tự đặt: token của một lượt xếp phụ thuộc số tầng, số lượt sửa và phần
  suy nghĩ ẩn — con số ấy là bịa (CLAUDE.md 5.2). Đọc qua RLS của hai bảng nhật ký, không gọi mô hình.
- **So phương án cạnh nhau** (`ai/ai-plan-compare.tsx`): «Xem một phương án» / «So sánh N phương án»; mỗi cột cùng một
  tầng, điểm + ngưỡng, số tầng / phòng / tổng diện tích phòng, lỗi chặn, ba lý do trừ điểm, «Xem chi tiết», «Dùng để
  dựng mặt đứng».
- **Ba lý do trừ điểm lớn nhất** (`ai/plan-deductions.ts`): đọc thước chấm ĐÃ LƯU (`score.criteria`); điểm mất =
  (1 − điểm tiêu chí) × trọng số tuyệt đối; tiêu chí không chấm được (cổng / thiếu đầu vào) không phải lý do trừ. Hiện
  dưới tờ vẽ (khối riêng, không gấp) và trong cột so sánh. Panel điểm chi tiết vẫn ẩn (T117).
- **Đặt lại ô «Yêu cầu sửa»** (T53 mục e) — **đảo một phần T117**: kế hoạch 5B ghi «sửa bằng ô yêu cầu» ở bước Mặt
  bằng. `ai/ai-plan-edit.tsx` lấy lại từ git, bỏ chip điểm (đã ở đầu tờ vẽ) và câu nguyên văn yêu cầu (đã ở «Về
  phương án này»), thêm chi phí ước tính. Hồ sơ chỉ xem / đã bàn giao không có ô này. Haan muốn giữ T117 thì gỡ
  `editPanel` ở `ai-plan-step.tsx`.
- **Bộ kết quả** (`ai/ai-result-bundle.tsx`, `ai/result-bundle.ts`): chọn phương án (mặc định bản dùng cho mặt
  đứng) → một tệp `<MÃ HỒ SƠ>_AI-Design_<phuong-an-N>.zip`: tờ mặt bằng SVG từng tầng + mái, DXF cả nhà, ảnh mặt bằng
  có nội thất (nếu đã vẽ), mặt đứng dựng TRÊN phương án ấy (SVG, DXF, ảnh vật liệu nếu có), bộ ảnh phối cảnh dựng
  trên mặt đứng ấy (nếu có), `DOC-TRUOC.txt` (bản phác tham khảo, `noCodeCheck`, điểm, ba lý do, danh sách tệp, tệp
  chưa có). Mọi tệp mang tiền tố mã hồ sơ. Byte tải qua đúng các tuyến đọc có kiểm quyền; ảnh 404 = «chưa vẽ», bỏ
  qua và ghi vào «Đọc trước»; lỗi khác thì báo và KHÔNG tải gói thiếu. Gói dựng trên trình duyệt bằng `pizzip` 3.3.0
  (đã có trong kho cho mẫu hợp đồng, nạp khi bấm) — không thêm thư viện. Dùng được trên hồ sơ đã bàn giao.

**Hàng rào.** `ai-design-tab.test.tsx` (bốn bước, mở thẳng bộ kết quả, Mặt ngoài gồm hai phần), `ai-plan-step.test.tsx`
(chi phí «Chưa đủ dữ liệu» / con số × số phương án, ba lý do theo thứ tự, so sánh, ô yêu cầu gửi đúng phương án),
`ai-result-bundle.test.ts` (ước tính, lý do trừ, tên tệp), `ai-result-bundle-ui.test.tsx` (zip thật bằng `pizzip`:
đúng tên, đúng tệp, ảnh chưa vẽ bỏ qua, lỗi 502 không tải). Đột biến đo tay: bỏ điều kiện «lượt chưa có giá thì bỏ» →
đỏ; nuốt mọi lỗi tải tệp như 404 → đỏ.

**Còn mở:** chưa có ước tính cho mặt đứng / ảnh (các nút ấy đã có giá ảnh niêm yết trên thẻ mô hình); số lượt mẫu tối
thiểu cho ước tính để ở 1 (ghi rõ «trung bình n lượt trước») — chưa có tham số NVG.

### T163 — Sửa chỗ khó dùng sau lượt chạy AI Design thật đầu tiên (23/10/2026, anh Dũng, mạch A)

**Bối cảnh.** Lượt chạy thật đầu tiên trên máy (hồ sơ `NVO-TK-2026-THU5`, nhà phố 5 × 18 m 4 tầng, GPT-5.6 Terra):
hai lượt «Xếp mặt bằng» hỏng, ≈ 0,74 USD, 0 phương án (CLAUDE.md 9.3 «Bước tiếp theo» 2b, phần A — phần giao diện,
không tốn lượt gọi mô hình nào). Mười ba chỗ, đã làm như sau.

**Lượt hỏng nói được vì sao — đảo một phần quyết định 07/10/2026 («câu lỗi của bộ xếp chỉ nằm trong báo cáo»).**
- Worker: vòng lặp vốn giữ lượt hỏng nhẹ nhất để gửi lại mô hình (`revisionBase`, T73 i). Nay mang lượt ấy ra kết quả
  (`result.failed[].main = { round, levels }`, `workflows/plan-main-rejection.ts`) khi nó nhẹ hơn hẳn lượt cuối — chọn
  bằng đúng phép so của vòng lặp, không đặt thước thứ hai. Bước «Xếp lại» hỏng ghi lý do của vòng ấy vào `error` của
  bước. Lượt ef5fbffc: lượt cuối là «Sai cấu trúc ở rooms…», lý do thật nằm ở các lượt trước.
- Màn hình: khối «Vì sao chưa xếp được» dưới thẻ tiến độ — lý do của lượt chính (hoặc lượt cuối với lượt chạy cũ;
  lượt cuối không dùng được thì nói thẳng ra), mã phòng đổi sang tên phòng của danh mục, số thập phân dấu phẩy, kèm
  «Gợi ý sửa đầu bài» theo NHÓM mã lỗi (lối vào / diện tích / lối đi / câu trả lời hỏng). Danh sách bước, bảng lượt
  gọi, lý do từng vòng vẫn chỉ ở báo cáo `.md` (giữ phần còn lại của quyết định 07/10).
- Câu do bộ xếp viết (`arrange/`, mạch B) vẫn mang dấu chấm thập phân; màn hình đổi lúc hiện (`plan-failure.ts`).

**Chi phí trước khi bấm.** Chưa có lượt nào bằng mô hình đang chọn thì ước tính bằng **bảng giá niêm yết của mô hình
này × số token ĐO ĐƯỢC ở các lượt trước bằng mô hình khác** (`estimateFromPricing`) — cả hai đều là số thật, không đặt
số token nào; câu chữ ghi rõ «ước tính theo bảng giá… số thật có thể lệch nhiều». Không có lượt nào ghi token → vẫn
«Chưa đủ dữ liệu». Bấm «Xếp mặt bằng» / «Chạy lại» → hộp hỏi lại: ước tính, nguồn của số, số lượt sửa tối đa mỗi
phương án (`GET /design/ai/models` trả `limits.planCallsMax` = `houseRevisionsMax() + 1`, đọc cùng hàm vòng lặp dùng)
và **trần** nếu phải dùng hết (giá trung bình một lượt gọi × số lượt × số phương án). Trần là con số để hỏi, **chưa
phải hạn mức chặn** — chặn cứng theo tiền cần sửa vòng lặp Workflow, để anh Dũng quyết.

**Đầu bài.**
- Mật độ xây dựng: ô vẫn hỏi PHẦN TRĂM, hợp đồng vẫn lưu TỈ LỆ (`value_scale` 0,01) — một nghĩa, không đổi dữ liệu.
  Gõ dưới 1 vào ô phần trăm (0,9 với ý 90 %) thì cảnh báo `mat_do_nghi_ghi_ti_le` («đang là 0,9% — có phải 90%?»),
  không chặn, không tự đổi số.
- «Còn thiếu» chỉ đếm câu bắt buộc; câu «(tùy chọn)» chưa trả lời gấp riêng («Câu tùy chọn chưa trả lời (n)»).
- «Xác nhận đầu bài»: khoá kèm lý do ngay dưới nút khi mức đầy đủ dưới `brief_completeness_min` hoặc còn mâu thuẫn
  nghiêm trọng; đủ điều kiện thì hộp hỏi lại (xác nhận xong muốn đổi phải lập phiên bản mới). Worker xác nhận không
  tự chặn theo điểm — chặn ở đây vì bản đã xác nhận dưới ngưỡng không dựng được gì (cổng Lớp 2 / nhánh AI chặn).
- «Lưu nháp» giữa chừng lưu rồi ở lại bước đang sửa; bước cuối «Lưu và đóng».
- Mục dài: câu tùy chọn CHƯA trả lời (không dính câu soát nào) gấp sau «Hiện thêm N câu chi tiết (tùy chọn)» — mục 1
  từ 26 câu còn ~13 trên màn hình. Không bỏ trường nào khỏi biểu mẫu hay hợp đồng, `scoreBrief` không đổi nên web và
  Worker vẫn chấm một con số (T63). Tập câu gấp CHỤP lúc vào bước / bấm mở-gấp — tính lại mỗi lần gõ thì xoá chữ trong
  một ô tùy chọn làm ô ấy biến mất giữa lúc gõ. Bấm một câu tùy chọn ở khung phải thì mục tự mở.
- Bộ đếm bước một kiểu «Bước X trên Y» (đầu mục đầu bài, thanh bước, thanh chuyển màn hình hồ sơ, tiến trình thiết
  kế). Hai con số tổng vẫn khác nhau có chủ ý: thanh chuyển đếm MÀN HÌNH con (5), tiến trình đếm GIAI ĐOẠN (6, có
  «Dự toán» và «Bàn giao» dùng chung màn hình).

**AI Design khác.** Ô chọn model ghi nhãn bậc ngay dưới nút («Cân bằng», «Nhanh, rẻ nhất»), thẻ mặc định của công ty
mang nhãn «Mặc định của công ty», bảng chọn có câu gợi ý. Chưa có mặt bằng thì khối «Ảnh mặt bằng có nội thất» gấp sau
một dòng («Đã có bản vẽ mặt bằng của kỹ sư?…») — lối vẽ từ bản tải lên (T114 Đợt 4) vẫn còn. Dải bốn bước ghi «Đang
chạy» / «Hỏng» (nạp lại `/state` khi bắt đầu lượt; trước đó dải đọc trạng thái cũ và ghi «Chưa chạy» suốt lượt).

**Trùng khoá React.** «Việc cần làm» của hồ sơ (`thieu_ban_ve` lặp theo bộ môn), «Chỗ chưa nhất quán» của đầu bài
(`dien_tich_vuot_san_xay_duoc` lặp theo tầng), ghi chú tờ vẽ — khoá kèm bộ môn / vị trí. Kiểm bằng Playwright: không
còn cảnh báo trên hồ sơ, đầu bài, AI Design.

**Hàng rào.** `brief-form.test.tsx` (còn thiếu / tùy chọn, lưu nháp ở lại, xác nhận khoá + hỏi lại, gấp câu tùy chọn,
bộ đếm), `design-brief.test.ts` + `balcony-brief.test.ts` (mật độ, dấu phẩy), `plan-failure.test.ts` (dữ liệu nguyên
văn hai lượt thật), `plan-main-rejection.test.ts` (Worker), `ai-result-bundle.test.ts` (ước tính theo bảng giá, trần),
`ai-plan-step.test.tsx` (hộp hỏi lại, lý do hiện, khối ảnh gấp), `ai-design-tab.test.tsx` («Hỏng»),
`ai-model-cards.test.tsx` (nhãn bậc, gợi ý).

**Chờ anh Dũng quyết:** (1) trần chi phí có thành hạn mức CHẶN không (dừng vòng sửa khi vượt số tiền); (2) giữ khoá
«Xác nhận đầu bài» khi dưới ngưỡng, hay chỉ cảnh báo; (3) nhóm gợi ý sửa đầu bài có cần thêm nhóm nào.

### T164 — Anh Dũng chốt ba câu của T163 (23/10/2026)

1. **Trần chi phí CHẶN thật**: mỗi lượt AI Design có mức tối đa (tham số do Quản trị đặt; demo 0,5 USD ghi rõ DEMO; để
   trống = không giới hạn). Lượt sửa kế tiếp có thể vượt mức thì dừng, báo «đã dừng vì chạm mức chi phí» kèm lý do hỏng
   của lượt chính. Lý do: hai lượt thật 23/10 tốn ≈ 0,74 USD mà không ra phương án. Làm SAU khi gộp mạch B (sửa vòng
   lặp Workflow mà B đang đụng).
   **Đã làm (23/10/2026, sau khi gộp mạch B).** Mức ở `design_setting.ai_run_cost_cap_usd` theo tenant (migration 0219
   khai khoá, giá trị `null` = không giới hạn; kịch bản demo `mac-dinh` đặt 0,5 USD, ghi chú DEMO). Tuyến khởi động đọc
   mức một lần và chốt vào `params.costCapUsd` (cả «Xếp mặt bằng» lẫn sửa theo yêu cầu). Vòng lặp
   (`workflows/ai-design.ts`): mỗi lời gọi xong cộng giá niêm yết của nó (giá tuyến `revise_route` cho vòng sửa) vào sổ
   CHUNG của lượt — mọi phương án cộng chung; trước mỗi lời gọi sửa kế tiếp (`runVariant` vòng ≥ 2 hoặc vòng đầu của
   lượt sửa bố cục, `runEdit` lời gọi ≥ 2), `costCapDecision` (`ai/cost-cap.ts`, hàm thuần): đã tiêu + trung bình một
   lời gọi đã có > mức thì dừng; có lời gọi không tính được tiền thì cũng dừng (không bảo đảm được mức). Quyết định nằm
   trong một `step.do` riêng để Workflow phát lại thấy đúng quyết định lần đầu. Dừng mà đã có bản xếp được dưới ngưỡng
   thì lưu bản ấy như mọi đường dừng khác; không thì phương án hỏng với `error` = «Đã dừng vì chạm mức chi phí X USD (đã
   tiêu Y USD).», `costCap`, và vẫn mang `main` / `reasons` của lượt chính. Màn hình: hộp hỏi lại nói mức chặn
   (`GET /design/ai/models` trả `limits.runCostCapUsd`) hoặc «Chưa đặt mức chi phí tối đa»; khối «Vì sao chưa xếp được»
   đặt câu dừng lên đầu. Chưa có chỗ trên giao diện để Quản trị sửa mức — sửa bằng SQL / Supabase. Mặt đứng và phối cảnh
   chưa áp mức. Hàng rào: `ai-cost-cap.test.ts` (hàm thuần + quét mã Workflow), `plan-failure.test.ts`,
   `ai-plan-step.test.tsx`; bốn đột biến đo tay đều đỏ.
2. **Giữ khoá «Xác nhận đầu bài»** dưới `brief_completeness_min` hoặc còn mâu thuẫn nghiêm trọng, và chặn cả ở Worker
   (`briefConfirmBlock` trong `brief/gate.ts`, `confirmBrief` gọi trước khi đúc artifact, trả 422). Lý do: đầu bài thiếu
   làm bộ xếp hỏng mà lượt hỏng vẫn tốn tiền; đầu bài đã xác nhận bất biến nên chặn ở đây rẻ nhất; trước đây chỉ nút trên
   màn hình chặn. Thay câu «Worker xác nhận không tự chặn theo điểm» của T163.
3. **Giữ hiện lý do hỏng chính trên màn hình** (đảo một phần quyết định 07/10/2026 «lý do chỉ ở báo cáo»); danh sách bước
   vẫn ẩn. Lý do: người dùng cần biết sửa đầu bài hay chạy lại mà không phải tải báo cáo `.md`.

### T165 — Nhà phố 5 m có ô tô: lời dẫn lưới cho gara làm lối vào, câu nhắc nói đúng chỗ bản phác không dựng nổi (23/10/2026, mạch B)

**Đầu vào.** Hai lượt «Xếp mặt bằng» THẬT của hồ sơ thử NVO-TK-2026-THU5 (23/10/2026, GPT-5.6 Terra, lời dẫn 9.10.0,
đường lưới): nhà phố 4 tầng, lô 5 × 18 m, lùi sau 1,5 m (khối 5 × 16,5 m), mặt trước giáp đường, ba mặt giáp nhà, 1 ô tô
+ 2 xe máy, thang chữ U. Lượt `ef5fbffc` 5 lời gọi (0,46 USD), lượt `e5ec68a6` 4 lời gọi (0,28 USD), không phương án.

**Câu trả lời của mô hình CÓ được lưu** — `ai_calls/<callId>.json` trường `output` (từ 15/09/2026), cả lời gọi bị bác.
Chỗ thiếu là tệp chữ `formatPromptText` (và báo cáo `.md` dựng từ nó) không in ra, nên tưởng đã mất. Nay có phần 4 «Câu
trả lời của mô hình». Phát lại dựng lại chín lời gọi khớp TỪNG KÝ TỰ với bản ghi (đầu bài `anonymiseForAi` của đầu bài
đã xác nhận, ngữ cảnh đúng `ai-design-steps.ts`), nên phép thử phát lại là đúng lượt thật.

**Nguyên nhân (đo trên phát lại).**
1. Lô 5 m: gara cần 3,1 m, phòng khách 3,3 m (`sketchMinExtent`) — không đặt cạnh nhau được ở hàng đường. Lời giải nhà
   ống là gara trọn hàng đường, vào nhà qua gara (T115). Bộ xếp ĐÃ cho việc đó (`entry_room_by_building_type`,
   `entryAlternatives`), nhưng lời dẫn LƯỚI (`floor_level`) chưa từng nói — luật T115 chỉ ở `house_layout` / `house_bands`.
2. `ef5fbffc` vòng 1–3: mô hình vẽ đúng kiểu nhà ống (gara trọn hàng đường, phòng khách sau) nhưng chọn phòng khách làm
   `entry_room`; câu nhắc `door_outside_on_boundary` bảo «vẽ phòng khách chạm hàng đường». Vòng 4 mô hình đưa phòng
   khách RA TRƯỚC gara (xe đi xuyên phòng khách, mất lối vào); vòng 5 mô hình tự viết «không thể vừa giữ gara vừa để
   phòng khách chạm mặt tiền trên lô 5 ô» và trả danh mục rỗng. Các lỗi khác của vòng 1–3 (phòng không lối vào, phòng làm
   việc 10 ô < 12 ô `min_cells`, phòng thờ 9 ô < 11, thang tầng 4 cô lập, lên thang từ cạnh dài) là lỗi bản phác thật của
   mô hình, câu nhắc đúng.
3. `e5ec68a6`: mô hình vẽ gara 3 ô cạnh phòng khách 2 ô ở hàng đường. Bộ xếp chia lại tầng, phòng khách ra sau gara, câu
   nhắc vẫn «vẽ phòng khách chạm hàng đường» — trong khi bản phác ĐANG chạm. Ba lượt sửa nộp lại y nguyên.
4. Mặt tiền / cạnh giáp đường lấy từ đầu bài là ĐÚNG (mặt thoáng duy nhất = trước; cửa chính, cửa xe = trước). Lỗi
   «cửa chỉ đặt được trên cạnh giáp nhà hàng xóm» là hệ quả của việc bộ xếp phải đẩy phòng khách ra sau gara.

**Đã sửa (không gọi mô hình).**
- `arrange/index.ts#sketchRowTooNarrow`, mã `sketch_row_too_narrow` (sửa được): hàng bản phác đặt cạnh nhau những phòng
  cộng cạnh tối thiểu vượt bề ngang tầng. CHỈ thêm vào câu nhắc khi tầng đã hỏng, đứng đầu danh sách — không bác thêm
  tầng nào. Gara trong hàng ấy (nhà phố) thì câu nói luôn «gara làm entry_room».
- `plan.ts#withGarageEntryHint`: tầng 1 nhà phố hỏng vì cửa chính, gara ở hàng đường của bản phác → câu
  `door_outside_on_boundary_garage` / `entrance_wrong_side_garage` thay cho «vẽ phòng khách chạm hàng đường».
- Lời dẫn 9.11.0: luật 7 của `floor_level` có `[[entry_garage|…]]` (cờ `entry_garage`: loại hình cho gara làm lối vào,
  có ô tô, cửa xe cùng mặt cửa chính) — mô hình biết ngay lượt đầu.
- `prompt-record.ts#formatPromptText`: phần 4 câu trả lời thô.

**Đo.** Phát lại 221 vòng của 55 lượt ghi (`fixtures/ai-run-*.json`), đối chứng là cùng mã với thay đổi gỡ: ngữ cảnh
mặc định của phép thử 21 / 221 vòng ra mặt bằng ở cả hai, không vòng nào đổi mã lỗi; ngữ cảnh như Workflow hiện nay (loại
thang, số đo nhà ống, mặt thoáng) 10 / 221 ở cả hai, chỉ bốn vòng của `e5ec68a6` thêm `sketch_row_too_narrow`. Đúng dự
kiến: thay đổi chỉ đổi CÂU gửi mô hình, không đổi bộ xếp. Lợi chỉ đo được bằng lượt thật:
hai lượt THU5 nay nhận câu nhắc giải được (phép thử `ai-live-thu5-nhapho.test.ts`). Không lượt ghi nào ra mặt bằng nhờ
riêng bộ xếp: vòng 3 của `ef5fbffc` với gara làm lối vào còn hỏng vì phòng ăn + bếp gộp thông 2,16 × 7,68 m (tỉ lệ
3,55 > 3,2 của `usable.max_aspect.dining`) — dải 2 m cạnh thang U 2,4 m. Có nên đo tỉ lệ cho cặp gộp thông
(`open_pairs`) theo từng phần thay vì cả khối là câu hỏi cho Haan, chưa đổi.

### T166 — Phòng lồi nắn bản phác không được ăn cạnh tối thiểu của phòng nhường ô (ô thang); câu thang thiếu bề ngang nói đúng chiều (23/10/2026, mạch B)

**Đầu vào.** Lượt thật thứ ba của THU5 `4eade9b1` (sau T165, 5 lời gọi, 0,29 USD): mô hình vẽ đúng kiểu nhà ống ngay lời
gọi 1 (gara trọn hàng đường làm lối vào, phòng khách sau, thang chữ U 3 × 4 ô, bếp ăn, WC, giếng trời). Phát lại dựng lại
5 lời gọi khớp từng ký tự (fixture `ai-run-4eade9b1.json`).

**Nguyên nhân.** Vòng 4 mô hình sửa đúng phòng khách (20 ô). Phòng ăn + bếp gộp thông vẽ hình chữ L; `rectangularise`
(`arrange/sketch.ts`) cho nó «ăn trọn khung bao» (`expandToBox`) — khung bao trùm cột thứ ba của ô thang, mà điều kiện
duy nhất là phòng nhường ô vẫn chữ nhật. Ô thang còn 2 ô (cần 2,4 m theo tim), bộ xếp ra lọt lòng 2,07 m < 2,15 m ngang
hai vế, phòng khách bị ép còn 12,79 m². Vòng ấy bị gạt là «tệ hơn» (2 lỗi so với 1), lượt dừng ở lỗi phòng khách 13,7 m²
của vòng 3 (bản phác vòng 3 vẽ phòng khách 15 ô < 18 ô `min_cells` — lỗi thật của mô hình). Câu báo thang thiếu bề NGANG
lại nói «dài … theo chiều đi lên», nên mô hình không biết phải làm thang rộng hơn. Phòng khách 16 m² VỪA tầng 1: bản phác
vòng 4 cho 5 × 3,88 m theo tim (~17,8 m² lọt lòng) — không phải đầu bài quá sức.

Vòng 1 (thang 3,53 < 3,6 m) không phải lỗi căn vách bản phác: bản phác hỏng vì hành lang không cửa / WC chỉ giáp thang,
các vòng khung dự phòng mới rút ngắn ô thang — giữ nguyên.

**Đã sửa.** `expandToBox` nhận `fits`: ô LÕI (thang bộ, thang máy — `fixedCore`) đang đủ cạnh tối thiểu (`minExtent`)
thì không được thành thiếu; không ăn được thì đi đường cắt phần lồi như cũ. Áp cho mọi phòng thì hai phép thử cũ đỏ
(`ai-run-75ba`, `ai-run-d084a46e` — hành lang / phòng thường nhường ô là cách nắn đúng), nên chỉ giữ ô lõi. `stairShortfall` đánh dấu `across`; câu tiếng Việt «chỉ rộng …
ngang các vế», câu nhắc `arrange_stair_too_short` mang `{dir}` / `{fix}` (draw the stair wider / longer).

**Đo.** Phát lại 226 vòng (55 lượt cũ + 4eade9b1), đối chứng cùng mã với thay đổi gỡ: ngữ cảnh mặc định 23 / 226 vòng ra
mặt bằng ở cả hai (3 vòng đổi mã lỗi), ngữ cảnh như Workflow 10 / 226 ở cả hai (6 vòng đổi mã lỗi; `2c522a90` vòng 4 từ
lỗi cả nhà sang lỗi phòng hẹp tầng 2 — vẫn hỏng). Số tầng hỏng 217 → 217 và 246 → 248. Lợi đo được nằm ở lượt mới: vòng 4 của 4eade9b1 nay qua tầng 1 và 2, câu nhắc lời
gọi 5 chỉ còn lỗi bản phác thật của tầng 3–4 (hành lang không chữ nhật, thiếu WC tầng 4, đầu bước ra của thang chỉ giáp
phòng) — trước là «phòng khách 13,7 m²» của bản đã bị gạt. Câu trả lời ghi của lời gọi 5 trả cho câu nhắc cũ nên không
phát lại được tiếp: lượt này vẫn chưa ra mặt bằng trong năm câu trả lời đã có.

Biến thể đầu bài phòng khách tối thiểu 13 m² (anh Dũng chọn cho bản đầu bài mới), phát lại cùng năm câu trả lời: tầng 1
qua ngay vòng 3 (bản phác 15 ô), nhưng cũng dừng ở cùng lỗi bản phác tầng 3–4. Các lỗi ấy có từ lời gọi 1 mà không lời
nhắc nào nói tới, vì khi tầng 1 hỏng thì tầng trên chỉ được SOÁT bản phác (`sketch_prechecked`: lối vào, sàn đầu bài),
không soát phòng không chữ nhật / thiếu phòng / đầu bước ra của thang — việc nên làm tiếp: soát thêm ba lỗi ấy ngay khi
tầng dưới hỏng, để một lượt sửa gỡ cả nhà.

### T167 — Tầng 1 hỏng thì tầng trên vẫn được soát phòng THIẾU trên bản phác (24/10/2026, mạch B, anh Dũng đồng ý)

**Vì sao.** Lượt thật 4eade9b1 (THU5): tầng 4 thiếu WC ngay từ lời gọi 1, nhưng tầng 1 hỏng nên tầng trên chỉ được soát
lối vào và sàn đầu bài (`precheckOnly`, T92) — mô hình chỉ nghe về WC ở lời gọi 5, khi đã hết lượt.

**Đã làm.** `arrange/index.ts#sketchShapeIssues`: khi chỉ soát (`precheckOnly`), thêm `sketch_room_missing` — phòng của
tầng không có ô nào trên bản phác, cùng phép kiểm `sketchTrees` vẫn làm khi tầng được xếp thật. Không thêm luật, không đổi
đường xếp thật. Cân nhắc rồi KHÔNG làm:
- phòng không chữ nhật: bộ nắn tự gỡ phần lớn — tầng 2 của chính lượt 4eade9b1 có hành lang chữ L vẫn qua khi được xếp; báo
  sớm là bắt mô hình vẽ lại tầng đang đạt (thử trên phát lại: câu nhắc lời gọi 2 thêm ba dòng «không chữ nhật» cho tầng 2–4);
- đầu bước ra của thang: phụ thuộc chiều thang tầng 1 đã dựng — tầng 1 hỏng thì không có, đoán là bịa.

**Đo.** Độ chính xác: trong mọi vòng ghi, 9 / 9 tầng có bản phác thiếu phòng đều hỏng khi được xếp thật (tầng 1 đã qua).
Phát lại 226 vòng ngữ cảnh Workflow, đối chứng 605ec3d: 10 / 226 vòng ra mặt bằng ở cả hai; 8 vòng của 4 lượt (182665ea,
4eade9b1, f1a88ac1, fdd486b1) thêm `sketch_room_missing` cho tầng trên ngay vòng tầng 1 hỏng, không vòng nào đổi gì khác.
4eade9b1: câu nhắc lời gọi 2 nay có «Storey 4: … leaves out wc5» (trước: lời gọi 5).

### T168 — Lỗi tầng trên tới mô hình đúng chỗ: hàng quá hẹp của tầng chia lại, ban công khối góc là hệ quả, đầu bước ra thang (24/10/2026, mạch B)

**Đầu vào.** Hai lượt thật THU5 sau T167 (đầu bài giữ phòng khách 16 m²), phát lại khớp từng ký tự (fixture
`ai-run-4a25b460.json`, `ai-run-b1859741.json`):
- `4a25b460` (5 lời gọi): tầng 1–3 qua từ vòng 1, hỏng ở kiểm cả nhà «ban công `balcony_1` chỉ chạm mặt trước ở góc» +
  «ban công ở mặt bên phải, tầng 3».
- `b1859741` (4 lời gọi, dừng vì trần 0,5 USD): tầng 4 «đầu bước ra phía mặt tiền chỉ giáp `light_well_4`» + phòng giặt
  chạm hành lang dưới một cửa.

**Nguyên nhân.**
1. `4a25b460` tầng 3: mô hình vẽ phòng ngủ 2 ô cạnh ô thang ở hàng 8–14. Thang (≥ 2,4 m theo `minExtent`; mốc tầng dưới
   thực 3,4 m) + phòng ngủ (≥ 2,7 m) không vừa 5 m. Bản phác hỏng, chương trình CHIA LẠI tầng được, nhưng cách chia nắn ban
   công mặt tiền (mô hình vẽ trọn hàng đường) thành khối góc bên phải. Lỗi bản phác của tầng ấy không có mã nào (chỉ «không
   ép được mốc»), nên tầng 3 không nằm trong `droppedBelow`: kiểm cả nhà coi lỗi ban công là lỗi của mô hình, gửi câu
   `_fitted` («vẽ dài hơn, tránh góc») và «chuyển ban công khỏi mặt phải» — lỗi thật không bao giờ tới.
2. `b1859741` tầng 4: bản phác có hành lang suốt đầu bước ra của thang; câu «chỉ giáp giếng trời» đến từ một cách chia lại
   (vòng khung), không phải bản phác. Lỗi thật còn lại là của mô hình (phòng giặt, hành lang chữ L).

**Đã sửa.**
- `arrange/index.ts`: tầng chia lại được thì `sketchFailure` kèm `sketch_row_too_narrow` (T165) — tầng ấy vào
  `droppedBelow`, lỗi ban công cả nhà thành hệ quả (T90), câu nhắc nói hàng quá hẹp + `_reshaped`.
- `plan.ts` (vẽ lại tầng giữ, T86/T97): bản phác vẽ lại từ cách chia của chương trình không được mang thêm lỗi ban công so
  với bản phác của mô hình — không thì giữ bản phác cũ. Thiếu điều này thì sửa trên làm vòng 2 báo «ban công ở mặt bên phải»
  như lỗi bản phác.
- `arrange/index.ts#sketchArrivalOpen`: trên bản phác (đã ép thang về mốc) mọi đầu thang cần giáp lối đi đều giáp phòng đi
  xuyên được TRỌN đầu ấy → bỏ `stair_arrival_blocked` khỏi câu nhắc khi còn lỗi sửa được khác.

**Đo.** Phát lại 234 vòng (58 lượt), ngữ cảnh Workflow, đối chứng d62e581: 10 / 234 vòng ra mặt bằng ở cả hai. 21 vòng bỏ
câu đầu thang (bản phác đã có lối đi trọn đầu ấy); `02982bd7` vòng 4–5 đổi mã lỗi theo (dây chuyền vòng sửa); không vòng
nào thêm lỗi. Phát lại vòng lặp thật: `4a25b460` ba lời gọi đầu y nguyên, lời gọi 4 nay nói «hàng 8–14 đặt "st3", "bd2"
cạnh nhau … cần 5,1 m, tầng 5 m» và «ban công thành khối góc chỉ vì chương trình chia lại tầng 3»; `b1859741` lời gọi 2–3
không còn câu giếng trời. Không vòng ghi nào của THU5 qua cổng — chưa lưu phương án phát lại nào (việc 2 của anh Dũng).

Còn mở (chưa làm): ô thang tầng 1 dựng rộng 3,4 m (`phac-dien-tich` thắng nhờ điểm) trong khi thang U chỉ cần 2,4 m — mọi
tầng trên mất 1 m bề ngang cạnh thang; muốn sửa phải để chọn phương án tầng 1 biết tầng trên.
