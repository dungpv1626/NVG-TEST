# Bộ mã thống nhất — ĐÃ CHỐT, đã áp vào mã nguồn

> Trả lời câu **#4** của `doc/VAN_DE_CON_MO.md` và `TBD-2` của SAD (PRD Mục 10: "NVG hiện chưa có
> bộ mã thống nhất, sẽ tự tạo mẫu trước khi go-live từng giai đoạn").
>
> **Haan chốt ngày 30/09/2026**: đội triển khai tự quyết ba câu còn treo, không chờ NVG trả lời
> (mục 7). Đã áp bằng migration `0132_bo_ma_thong_nhat.sql`.

---

## 1. Năm nguyên tắc

1. **Mã là định danh, không phải nơi chứa thuộc tính.** Chỉ đưa vào mã thứ không bao giờ đổi trong
   đời hồ sơ. Nhà cung cấp đổi ngành hàng, công trình đổi chủ đầu tư, vật tư đổi nhà sản xuất — thuộc
   tính đổi được thì nằm ở cột, không nằm trong mã. Mã mang thuộc tính là mã sẽ phải đổi, mà đổi mã
   thì mọi chứng từ đã in ra trước đó không tra ngược được nữa.
2. **Mã không tái sử dụng.** Xoá mềm vẫn giữ chỗ. Cấp lại một mã đã dùng là cách chắc chắn để hai
   hồ sơ khác nhau trông như một.
3. **Bảng giao dịch mang pháp nhân, bảng dùng chung thì không.** `construction_sites` có `company_id`
   nên mã có `NVC/NVS/NVO`; `materials`, `suppliers`, `customers` **không có** `company_id` (CLAUDE.md
   3.5) nên mã **không** được mang pháp nhân — nếu mang, mã nói một điều mà dữ liệu không có, và công
   nợ của cùng một nhà cung cấp sẽ bị nhìn thành ba nhà cung cấp.
4. **Số thứ tự do CSDL cấp**, không đếm ở trình duyệt, và cấp **lúc lưu** chứ không lúc mở biểu mẫu —
   mở rồi bỏ thì không thủng dãy số.
5. **Chỉ `A–Z`, `0–9` và dấu `-`.** Không dấu tiếng Việt, không khoảng trắng, không `/`. Mã đi vào tên
   tệp, địa chỉ trang, mã vạch và Excel; dấu tiếng Việt làm hỏng cả bốn chỗ. Đây là ngoại lệ có chủ ý
   với quy tắc "giao diện tiếng Việt 100%": mã là dữ liệu máy đọc, nhãn bên cạnh mã vẫn tiếng Việt.

---

## 2. Công trình — `{PHÁP NHÂN}-CT-{NĂM}-{4 chữ số}`

```
NVC-CT-2026-0001      Công trình số 1 năm 2026 của Nhà Việt Cons
NVO-CT-2026-0014      Công trình số 14 năm 2026 của Nhà Việt One
```

- **Năm** = năm tạo hồ sơ công trình, giống mọi loại hồ sơ giao dịch khác (mục 7). Công trình
  được tạo lúc bàn giao hợp đồng, nên năm này gần như luôn là năm bắt đầu làm.
- **Số thứ tự** đếm riêng theo từng cặp (pháp nhân, năm), bắt đầu lại từ `0001` mỗi năm.
- **Không đưa vào mã**: tên khách hàng, địa bàn, loại công trình (nhà xưởng / dân dụng). Cả ba đã có
  cột riêng và cả ba đều đổi được.
- Dạng này đã dùng cho mọi hồ sơ giao dịch khác (`NVC-HD-2026-0042` hợp đồng, `NVC-DA-2026-0001` gói
  thầu…), nên công trình dùng chung dạng là nhất quán, không phải quy ước mới.

## 3. Vật tư — `{NHÓM}-{TÊN VIẾT TẮT}-{QUY CÁCH}`

```
THEP-ONG-D49X2.0      Thép ống D49 dày 2,0 mm
XM-PCB40-BAO50KG      Xi măng PCB40 bao 50 kg
GIANGIAO-NEM-150      Giàn giáo nêm cao 1,5 m (mã catalogue NVS)
```

Đúng nguyên văn KHO-02: "mã nhóm – tên viết tắt – quy cách/kích thước", một vật tư **chỉ một mã**.

- **Không pháp nhân, không năm.** Danh mục vật tư dùng chung cả ba công ty; cùng một cây thép mà ba
  mã thì so giá và cộng tồn kho đều sai.
- **Một mã = một đơn vị tính.** Đổi đơn vị tính (cây → mét) là **mã mới**, không sửa mã cũ — nếu
  không, phiếu nhập cũ và phiếu xuất mới cộng vào nhau thành một con số vô nghĩa.
- **Quy cách phải phân biệt được**: kích thước, mác, độ dày. Số thập phân trong mã dùng dấu **chấm**
  (`D49X2.0`) — mã là chuỗi máy đọc, quy tắc dấu phẩy thập phân của CGD 4.3 áp cho chữ hiển thị.
- **Không đưa vào mã**: nhà sản xuất, xuất xứ, giá, kho chứa.
- **Giàn giáo NVS** giữ nguyên mã của Catalogue (Phụ lục D) làm hai đoạn sau, nhóm luôn là
  `GIANGIAO`. Danh mục đã có sẵn thì đừng đánh số lại.
- **Mười nhóm khởi tạo** giữ như `MATERIAL_GROUPS` hiện nay: `THEP` · `XM` · `CATDA` · `GACH` ·
  `DIEN` · `NUOC` · `HOANTHIEN` · `GIANGIAO` · `CCDC` · `KHAC`. Thêm nhóm là thêm một dòng danh mục,
  không phải sửa lại mã cũ.
- **Độ dài tối đa 24 ký tự** — mã vật tư được in lên tem, quét bằng máy và gõ tay ở công trường.

## 4. Nhà cung cấp — `NCC-{5 chữ số}`

```
NCC-00001
NCC-00042
```

- **Không có nhóm hàng trong mã.** Đây là chỗ khác với ô gợi ý đang hiện trên màn hình Nhà cung cấp
  (`NCC-THEP-001`). Một nhà cung cấp bán nhiều nhóm hàng, và nhóm hàng đổi được; để nhóm trong mã
  nghĩa là hoặc phải đổi mã (hỏng chứng từ cũ), hoặc phải sống với một mã nói sai. Nhóm hàng vẫn giữ,
  ở cột `suppliers.category` — lọc được, sửa được, không đụng tới định danh.
- **Không có pháp nhân, không có năm.** Bảng dùng chung; cả ba công ty mua của cùng một nhà cung cấp
  và công nợ phải cộng được thành một dòng.
- Dãy số phẳng, cấp liên tục, không đặt lại theo năm.

### Kéo theo: khách hàng cũng vậy

`customers` cũng là bảng dùng chung nhưng mã cũ là `NVC-KH-2026-0002` — mang pháp nhân mà bảng
không có cột pháp nhân. Cùng một lý do, đã đổi sang `KH-{5 chữ số}`: hai bảng dùng chung mà hai quy
ước khác nhau là chỗ người nhập liệu sẽ nhầm.

---

## 5. Hiện trạng trước khi áp, và đính chính bản đề xuất

Bản đề xuất ghi "không có cơ chế cấp số ở CSDL" và "mọi mã đang gõ tay". **Cả hai câu sai.** Rà mã
nguồn khi áp mới thấy:

- CSDL **đã có** bộ cấp số từ migration 0007 (`record_sequences` + `next_record_code`), cấp theo
  (pháp nhân, loại, năm). Mười một loại hồ sơ được CSDL cấp thẳng trong hàm nghiệp vụ (báo giá, đề
  nghị mua, đơn hàng, giao nhận, công trình, hợp đồng, hợp đồng cho thuê, nghiệm thu, kiểm kê, hồ sơ
  nhân sự, đề nghị thanh toán và tạm ứng); bảy loại khác do màn hình xin số từ CSDL rồi mới ghi.
- Chỉ ba chỗ thật sự gõ tay hoặc sai họ mã:

| Chỗ | Trước | Sau |
| --- | --- | --- |
| Khách hàng | Màn hình xin `NVC-KH-2026-0002` theo pháp nhân đang chọn — mang pháp nhân mà bảng không có | CSDL cấp `KH-00001` lúc ghi |
| Nhà cung cấp | Gõ tay, gợi ý `NCC-THEP-001` | CSDL cấp `NCC-00001` lúc ghi; bỏ ô nhập |
| Tài sản | Gõ tay, được để trống — và để trống thì **kẹt vĩnh viễn** «Chưa có mã», vì mã bị khoá sau khi tạo | CSDL cấp `NVC-TS-2026-0001` lúc ghi; bỏ ô nhập |

- `shared/src/codes.ts` khai lệch với CSDL: thiếu `GN` (giao nhận) và `TS`, khai `TU` trong khi CSDL
  cấp `DNTU`. Đã đồng bộ; phép thử `shared/src/__tests__/codes.test.ts` canh hai bên từ nay.

---

## 6. Đã áp những gì

1. **CSDL — migration 0132**:
   - Tách lõi cấp số của `next_record_code` ra `issue_record_code` (không kiểm phiên, chỉ trigger
     gọi); `next_record_code` giữ nguyên chữ ký và hành vi.
   - Bảng `catalog_sequences` + hàm `issue_catalog_code` cho dãy số phẳng của danh mục chung.
   - Ba trigger cấp mã lúc INSERT: `customers_assign_code`, `suppliers_assign_code`,
     `assets_assign_code`. Trình duyệt không gọi thẳng được hai hàm cấp số nội bộ.
   - Đổi mã dữ liệu đang có sang dạng mới, theo thứ tự tạo.
2. **Quy tắc ghi đè**: lượt ghi có phiên đăng nhập **luôn** nhận mã do CSDL cấp, mã gửi kèm bị bỏ
   qua — người dùng không gõ một thứ rồi thấy một thứ khác, vì ô nhập đã bỏ. Tiến trình hệ thống không
   có phiên (nạp dữ liệu, bộ kiểm thử) được đặt sẵn mã; đó là đường duy nhất để nhận lại một bộ mã có
   sẵn nếu sau này cần.
3. **`shared/src/codes.ts`**: thêm `CATALOG_TYPES`, `buildCatalogCode`, `parseCatalogCode`; tách
   khách hàng và nhà cung cấp khỏi `RECORD_TYPES`; bỏ chú thích "GIẢ ĐỊNH".
4. **Màn hình**: Khách hàng thôi xin mã; Nhà cung cấp và Tài sản bỏ ô nhập mã, thay bằng dòng gợi ý
   "Mã do hệ thống cấp khi lưu". Vật tư giữ ô mã theo quy tắc KHO-02.
5. **Phép thử**: `shared/src/__tests__/codes.test.ts` (dạng mã, đồng bộ loại mã với CSDL, không màn
   hình nào tự đặt mã) và `db/src/__tests__/bo-ma.test.ts` (ghi đè, dạng mã, không trùng khi tạo cùng
   lúc, mã vẫn bị khoá, hàm nội bộ không gọi được từ trình duyệt).

---

## 7. Ba câu từng treo — đội triển khai tự chốt

| Câu | Quyết định | Vì sao |
| --- | --- | --- |
| Số thứ tự công trình đặt lại mỗi năm? | **Có**, và **năm là năm tạo hồ sơ**, không phải năm khởi công theo hợp đồng | Mọi loại hồ sơ giao dịch khác đã đếm theo năm tạo; một loại đếm khác đi thì cùng một bộ đếm phải biết hai quy tắc. Công trình được tạo lúc bàn giao hợp đồng, nên hai năm gần như luôn trùng |
| Nhận lại bộ mã Excel cũ của NVG cho nhà cung cấp, khách hàng? | **Không** — đánh số mới từ `00001` | Chưa ai đưa ra bộ mã cũ nào. Nếu sau này có, đường nhận lại đã để sẵn: nạp bằng tiến trình hệ thống thì mã được giữ nguyên |
| Nhận bảng mã vật tư có sẵn? | **Không có bảng nào để nhận** — dùng quy tắc KHO-02 như mục 3 | Riêng giàn giáo NVS giữ mã Catalogue như đã ghi ở mục 3 |

Việc còn lại **không** thuộc bộ mã: công trình demo `NVC-CT-2026-DEMO01` được nhập tay trước khi có
hàm cấp số, còn nguyên. Công trình tạo qua luồng bàn giao hợp đồng đã đúng dạng.
