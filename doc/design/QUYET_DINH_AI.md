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

**Lý do / đánh đổi:** Đo 19/09/2026 trên lượt thật đã ghi: khu vệ sinh chung tầng 2 xích lại gần — `58688ead` 9,31 → 4,04 m, `fd3b0b86` 9,95 → 5,69 m; điểm giữ 70,3 % và 71,2 → 71,1 %. **E2 vẫn 0 ở mọi bản đã lưu**, vì hai chỗ chặn nằm ngoài tầm với của bộ xếp: (1) trên CẢ HAI lượt thật, bản phác của mô hình không qua được cổng (thiếu phòng ở tầng trên; phòng tầng 1 hụt sàn đầu bài — living_1 53,67 so với 55 m²) nên tầng nào cũng rơi về xếp theo vùng, và mọi cơ chế ép Ô (cả ô thang lẫn ô khu vệ sinh) chỉ chạy ở đường bản phác; (2) E2 đo khoảng cách TÂM ≤ 1,5 m, nên hai khu vệ sinh khác cỡ nằm chồng nhau vẫn trượt — đo trên nhà phố mẫu: cùng vùng, chồng nhau, tâm cách 2,41 m. Hai chỗ ấy ghi ở `HANDOFF.md` chờ Haan quyết.

## T57

**Ảnh mặt bằng công năng CÓ NỘI THẤT, mô hình ảnh vẽ từ ẢNH NEO** (19/09/2026, Haan chốt). Sau khi có mặt bằng từng tầng, kỹ sư bấm vẽ một tấm trình khách: tường tô đậm, đồ đạc từng phòng, vật liệu sàn, cây cối quanh nhà, khung tên tiếng Việt. **KHÔNG đảo T22**: tờ SVG vector vẫn là tờ CHÍNH, vẫn hiện mặc định, vẫn là thứ đo được và xuất DXF; tấm ảnh ở panel RIÊNG bên dưới, cùng vai trò với ảnh phối cảnh. (a) **Ảnh neo** — `ai/draw/anchor.ts` dựng tờ chỉ phần hình (`renderPlanBody`, dùng chung với DXF), nền trắng, đệm về một trong ba khung chuẩn 1024×1024 / 1536×1024 / 1024×1536; tuyến RIÊNG `GET /plan/:id/anchor`, không phải tham số của `/sheet`. **Không khung tên** — bảo đảm bằng cấu trúc (không gọi `renderTitleBlock`), vì khung tên mang mã hồ sơ là dữ liệu hạng 1 mà tuyến ảnh chỉ nhận tới hạng 2. (b) **Rasterise ở TRÌNH DUYỆT** (`web/src/lib/rasterise.ts`): Worker không có canvas. (c) `POST /plan/:id/sheet-image` ghép lời dẫn từ dữ liệu THẬT (tên phòng tiếng Việt, m², kích thước mm, hướng bắc, bốn dòng khung tên, phong cách theo lineage), gửi kèm ĐÚNG MỘT ảnh neo, lưu qua `render-store` và đúc artifact `ai_plan_sheet_image` (`setHead: false`). (d) Lời dẫn 8.6.0, migration 0127 mở lại `kind` + `step` mà 0125 đã đóng. (e) Nhãn HAI LỚP: `stampWatermark` in lên pixel + `AI_DISCLAIMERS.aiSheetImage` bằng chữ trong trang. (f) Máy chủ **dựng lại ảnh neo và đối chiếu KÍCH THƯỚC** đọc từ khối IHDR của tệp PNG (`pngSize`), lệch thì 400 và không gọi mô hình; tuyến chỉ nhận PNG, hẹp hơn hợp đồng. (g) **Sáu tuyến ảnh, tên mô hình lấy từ lượt LIỆT KÊ THẬT** (19/09/2026, Haan cho phép hai lượt 0 USD): OpenAI `gpt-image-2` · `gpt-image-2.5-sunburst` (hãng nói rõ bản này dành cho luồng cần độ chính xác khi SỬA ảnh — đúng việc của T57) · `gpt-image-2.5-flare`; Gemini `gemini-3.1-flash-image` · `gemini-3-pro-image` · `gemini-3.1-flash-lite-image`. Ô chọn model hiện TÊN MÔ HÌNH lấy thẳng từ cấu hình, vì nhật ký `design_ai_call` ghi theo tên ấy. **Giá mỗi ảnh của OpenAI khai 0,19 USD là sai gấp hơn sáu lần**: hãng tính theo token (4,00 USD/1M token ảnh vào, 15,00 USD/1M token ra) và lượt thật đã ghi (2.353 vào, 1.372 ra) ra **0,030 USD**. Đã sửa cấu hình; giá Gemini giữ số hãng công bố dù token đo được cho ra 0,135–0,175 USD — chỗ chưa khớp ghi trong `config/models.yaml`, chỉ hoá đơn mới phân xử được.

**Lý do / đánh đổi:** Haan chốt hai điều: **mô hình viết cả chữ lẫn số**, và **chưa gọi API thật** đợt này. Đánh đổi đã biết và đã chấp nhận: tờ ảnh KHÔNG đo được — dấu tiếng Việt có thể hỏng, số mét vuông in trên hình có thể lệch bảng diện tích; đó là lý do nhãn hai lớp là bắt buộc và thẻ tờ vector phải ở ngay cạnh. Khác biệt DUY NHẤT với T21 (đã bị T22 gỡ 12/09) là ảnh neo: T21 cố ý chỉ gửi chữ nên mô hình vẽ một ngôi nhà KHÁC. Bỏ ảnh neo đi thì không gì hỏng — lời gọi vẫn chạy, vẫn ra ảnh, vẫn mất tiền — nên có phép thử riêng canh `images` có đúng một phần tử. Ba chỗ yếu đã ghi: byte ảnh neo do trình duyệt gửi nên máy chủ không so được từng điểm ảnh — binding `IMAGES` của Cloudflare KHÔNG chữa được (tra 19/09: «does not resize SVG files and will ignore any optimization parameters»), nên chỉ đối chiếu được kích thước, và đóng hẳn thì phải nhúng bộ rasterise WebAssembly vào Worker (V-32); phông ngoài không nạp trong `<img>` nên chữ trên ảnh neo rơi về phông hệ thống; nhà càng dài càng lấp ít khung — đo trên nhà phố 4,2 × 15,2 m chỉ lấp ~40 %, và xoay ngang cũng vậy. **Đo thật 19/09/2026** trên hồ sơ «Biệt thự nhà vườn (demo)», tầng 1, hai lượt (báo 0,257 USD theo giá niêm yết lúc ấy; **giá đúng ≈ 0,097 USD** — xem (g)): `gemini-3.1-flash-image` 22,6 s / 0,067 USD và `gpt-image-2` 39,3 s / 0,190 USD — **cả hai bám ảnh neo**, dựng lại đúng bố cục, chuỗi kích thước chép đúng (13000 = 220+5440+2450+1800+3090+220), có nội thất, vật liệu sàn, xe, cây cối, hoa gió, thước tỉ lệ và khung tên. Dấu tiếng Việt sống sót ở cả hai. Khác nhau ở phần SỐ: GPT Image chép đúng **mọi** diện tích (28,9 · 6,9 · 5,7 · 4,2 · 18,1 · 15,8 · 10,8 · 13,1 · 16,6 · 55,1 · 27,1 m²), Gemini ghi nhầm hai khu vệ sinh thành cùng 5,7 m² — đúng kiểu sai mà nhãn hai lớp sinh ra để phòng. Lượt đo bắt thêm **ba lỗi im lặng** đã sửa: header `X-Anchor-*` chưa khai trong `exposeHeaders` của CORS (có phép thử canh hai danh sách từ nay); tuyến `/sheet-image` khai `max-age=300` trong khi nó trỏ tới «tấm MỚI NHẤT» — một con trỏ đổi được — nên sau khi trả tiền cho tấm mới màn hình hiện lại tấm cũ (695 KB thay vì 2,48 MB), nay `no-cache` + `ETag`; và ảnh neo phải tải bỏ qua bộ đệm vì nó là đầu vào của một lượt tính tiền.

---

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

