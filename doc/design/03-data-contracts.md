# 03 — Hợp đồng dữ liệu

**Bắt buộc đọc trước khi viết code cho bất kỳ layer nào.**

**Nguồn gốc là JSON Schema** (lược đồ mô tả hình dạng dữ liệu JSON) trong
`packages/contracts/`, viết tay ở đó. Từ đó sinh ra
zod + TypeScript cho Worker và Pydantic v2 cho Container (xem `02-architecture.md` mục
2.4). Không viết schema tay ở hai bên — chắc chắn sẽ lệch nhau.

Cả Worker và Container **đều validate** ở ranh giới. Không bên nào tin bên kia.

Quy ước chung:
- Đơn vị độ dài: **mét**, số thực. Đơn vị nội bộ của solver: **milimét**, số nguyên.
- Hệ toạ độ: gốc ở góc trước-trái của lô đất, `x` sang phải, `y` vào sâu, đơn vị mét.
- Mọi contract có `schema_version` (semver). Đổi phá vỡ tương thích thì tăng major.
- **Mọi bảng của module mang `tenant_id` và `discipline`.** Artifact payload không cần
  lặp lại chúng — chúng nằm ở bảng, không ở nội dung băm.
- `discipline` (bộ môn) nhận `KT` (kiến trúc), `KC` (kết cấu), `DN` (điện nước). Giai
  đoạn 1 chỉ sinh bộ môn kiến trúc, nhưng trường phải có sẵn.
- Mô hình hình học giữ **ngữ nghĩa IFC** (Industry Foundation Classes — tiêu chuẩn mở
  mô tả dữ liệu công trình) để ba bộ môn tham chiếu chung một nguồn.

---

## 3.1 DesignBrief — output Layer 1

**Design Brief thay thế Phiếu tiếp nhận yêu cầu / nhiệm vụ thiết kế đã có** — một nơi
nhập duy nhất, không chạy song song hai biểu mẫu. Hệ quả bắt buộc khi triển khai:

- Phải có script di trú dữ liệu phiếu cũ sang `design_brief`.
- Các module khác (Kinh doanh, Dự toán) đang đọc phiếu cũ phải chuyển sang đọc
  `design_brief` hoặc một view tương thích. Kiểm kê trước khi đổi.
- `project_id` là khoá ngoại tới **bảng dự án sẵn có**, không tạo bảng dự án mới.


```jsonc
{
  "schema_version": "1.0.0",
  "project_id": "NVO-028",
  "building_type": "nha_pho",          // nha_pho | biet_thu | nha_vuon
  "locality": "hanoi",                 // chọn rule pack theo địa phương
  "site": {
    "width_m": 5.0,
    "depth_m": 18.0,
    "orientation": "DN",               // hướng nhà: B(bắc) BD(bắc-đông) D(đông) DN(đông-nam) N(nam) TN(tây-nam) T(tây) TB(tây-bắc)
    "access_sides": ["front"],
    "adjacent": { "left": "nha_hang_xom", "right": "hem_2m" },
    "setback_required_m": { "front": 0, "back": 0, "left": 0, "right": 0 },
    "max_density": null,               // tỉ lệ 0..1, null nếu chưa biết
    "legal_docs_available": false
  },
  "floors": 4,
  "family": [
    { "role": "ong_ba",   "count": 2, "floor_pref": "low",  "needs": ["bedroom", "private_wc"] },
    { "role": "vo_chong", "count": 2, "floor_pref": null,   "needs": ["master_bedroom", "walk_in_closet"] },
    { "role": "con",      "count": 2, "floor_pref": null,   "needs": ["private_room_each"] }
  ],
  "required_spaces": ["garage_moto", "altar_room", "drying_yard", "living"],
  "style": "hien_dai",                 // hien_dai | tan_co_dien | indochine
  "budget_range_vnd": [2.0e9, 3.0e9],
  "priorities": ["natural_light", "feng_shui", "area_efficiency"],
  "decision_maker": { "name": "…", "relationship": "chu_nha" },
  "completeness_score": 0.95,          // 0..1
  "missing_fields": ["legal_docs"]
}
```

**Quy tắc:** `completeness_score < 0.7` thì Layer 2 **không được chạy** — trả về yêu
cầu bổ sung thông tin. Ngưỡng để trong config, không hard-code.

`decision_maker` là trường bắt buộc thu thập dù có thể để trống — thiếu người quyết
định là nguyên nhân hàng đầu khiến phương án phải sửa nhiều lần.

---

## 3.2 SpaceProgram — output Layer 2

```jsonc
{
  "schema_version": "1.0.0",
  "brief_ref": "sha256:…",
  "spaces": [
    {
      "id": "living_1",
      "type": "living",
      "floor": 1,
      "target_area_m2": 22.5,
      "min_area_m2": 16.0,
      "max_area_m2": 30.0,
      "priority": 1,                   // 1 cao nhất
      "needs_daylight": true,
      "needs_facade": true,
      "needs_ventilation": true
    }
  ],
  "adjacency": [
    { "a": "kitchen_1", "b": "dining_1", "kind": "adjacent", "weight": 1.0 },
    { "a": "kitchen_1", "b": "living_1", "kind": "separate", "weight": 0.6 }
  ],
  "floor_allocation": [
    { "floor": 1, "usable_area_m2": 80.0, "allocated_area_m2": 76.5 }
  ],
  "reference_projects": ["NVO-015", "NVO-023"],
  "priors_applied": true               // đã dùng thống kê thực nghiệm từ KB chưa
}
```

`kind` nhận: `adjacent` (phải kề nhau), `near` (cùng tầng, gần), `separate` (nên cách
nhau). `weight` là mức quan trọng, dùng làm trọng số trong hàm mục tiêu của solver.

---

## 3.3 LayoutIntent — output Layer 3a (contract quan trọng nhất)

Đây là thứ **LLM sinh ra**. Chú ý: không có toạ độ tuyệt đối, không có kích thước
chính xác. Chỉ có cấu trúc và gợi ý tỉ lệ.

```jsonc
{
  "schema_version": "1.0.0",
  "program_ref": "sha256:…",
  "variant_id": "A",                   // 3–4 variant mỗi lần chạy
  "variant_label": "Cầu thang hông, bếp mở",

  "massing": {
    "wings": [
      { "id": "W1", "x_hint": 0.0, "y_hint": 0.0, "w_hint_m": 5.0, "d_hint_m": 16.0 }
    ],
    "wing_links": []                   // [{a:"W1", b:"W2", via:"foyer"}] cho biệt thự
  },

  "cores": [
    {
      "id": "C1",
      "wing": "W1",
      "band": "left",                  // left | right | center
      "position_hint": "middle",       // front | middle | rear
      "contains": ["stair", "wc", "shaft"]
    }
  ],

  "floors": [
    {
      "level": 1,
      "wings": [
        {
          "wing_id": "W1",
          "tree": {
            "split": "H",              // H = cắt ngang, V = cắt dọc
            "ratio_hint": 0.45,
            "a": { "room": "garage_1" },
            "b": {
              "split": "H",
              "ratio_hint": 0.55,
              "a": { "room": "living_1" },
              "b": { "room": "kitchen_dining_1" }
            }
          }
        }
      ]
    }
  ],

  "rationale": "Đất 5×18, 3 thế hệ. Lõi đặt hông trái để mặt tiền dành cho gara và khách."
}
```

### Kiểu nút của `tree`

Đúng một trong ba dạng, không được lai:

```jsonc
{ "split": "H"|"V", "ratio_hint": 0.0..1.0, "a": <node>, "b": <node> }
{ "room": "<space_id trong SpaceProgram>" }
{ "void": "lightwell"|"courtyard"|"atrium" }
```

### Ràng buộc validate (kiểm tra trước khi đưa vào solver)

Những lỗi này **không gọi lại LLM để sửa** — reject và retry sinh variant mới:

1. Mọi `room` id phải tồn tại trong `SpaceProgram` và thuộc đúng `floor`.
2. Mỗi space trong `SpaceProgram` xuất hiện **đúng một lần** trong toàn bộ cây của
   tầng tương ứng.
3. `ratio_hint` chỉ là gợi ý cho hàm mục tiêu; solver được phép bỏ qua.
4. Số wing trong `floors[].wings[]` khớp `massing.wings[]`.
5. Với `building_type = nha_pho`: đúng 1 wing, đúng 1 core.

**Vì sao dùng cây thay vì danh sách chữ nhật:** cây chia đệ quy **không thể sinh khe
hở hay chồng lấn** — đó là tính chất của cấu trúc dữ liệu, không phải kết quả kiểm
tra. Và LLM sinh cấu trúc rời rạc tốt hơn nhiều so với sinh toạ độ.

---

## 3.4 FloorPlan — output Layer 3b/3c

```jsonc
{
  "schema_version": "1.0.0",
  "intent_ref": "sha256:…",
  "rule_pack_version": "2026.08.1",     // BẮT BUỘC — để tái lập được

  "site": { "width_m": 5.0, "depth_m": 18.0 },
  "structural_grid": {
    "axes_x_m": [0.0, 2.8, 5.0],
    "axes_y_m": [0.0, 4.2, 8.4, 12.6, 16.0]
  },

  "levels": [
    {
      "level": 1,
      "height_m": 3.6,
      "rooms": [
        {
          "id": "living_1",
          "type": "living",
          "wing": "W1",
          "polygon": [[0.0,4.2],[5.0,4.2],[5.0,8.4],[0.0,8.4]],
          "area_m2": 21.0,
          "has_daylight": true
        }
      ],
      "voids": [],
      "walls": [
        { "id": "w_012", "a": [0.0,4.2], "b": [5.0,4.2], "thickness_m": 0.2, "load_bearing": true }
      ],
      "openings": [
        { "id": "d_003", "wall": "w_012", "kind": "door", "offset_m": 1.2, "width_m": 0.9 }
      ]
    }
  ],

  "cores": [
    { "id": "C1", "polygon": [[0,0],[2.8,0],[2.8,1.2],[0,1.2]], "levels": [1,2,3,4] }
  ],

  "constraint_report": {
    "status": "pass",                   // pass | warning | infeasible
    "violations": [
      { "rule_id": "altar_room_top_floor", "severity": "warning",
        "message": "Phòng thờ ở tầng 3, không phải tầng trên cùng",
        "involved": ["altar_1"] }
    ]
  }
}
```

**`rule_pack_version` là bắt buộc.** Không có nó thì không tái lập được phương án cũ
sau khi quy chuẩn thay đổi.

Polygon: danh sách đỉnh theo chiều kim đồng hồ, không lặp đỉnh đầu ở cuối.

---

## 3.5 InfeasibilityReport — khi solver không tìm được nghiệm

Contract này quan trọng ngang FloorPlan. Nó là thứ tạo ra tính năng Impact Analysis.

```jsonc
{
  "schema_version": "1.0.0",
  "status": "infeasible",
  "conflict_set": [
    { "rule_id": "corridor_min_width", "involved": ["corridor_2"] },
    { "rule_id": "min_area:master_bedroom", "involved": ["master_1"] },
    { "rule_id": "wc_in_master", "involved": ["wc_2"] }
  ],
  "human_message": "Trên bề rộng 5,0m không thể đồng thời có: phòng ngủ master ≥18m², hành lang ≥0,9m, và WC trong phòng.",
  "suggested_relaxations": [
    { "rule_id": "min_area:master_bedroom", "from": 18.0, "to": 15.5, "unit": "m2" },
    { "rule_id": "wc_in_master", "action": "remove" },
    { "target": "site.width_m", "from": 5.0, "to": 5.4, "unit": "m" }
  ]
}
```

`conflict_set` lấy từ **cơ chế assumptions (giả định) của bộ giải CP-SAT**: mỗi rule được gắn một literal
giả định, khi vô nghiệm (UNSAT — unsatisfiable) thì bộ giải trả về tập literal mâu thuẫn nhỏ nhất. Đây là lý do kỹ
thuật chính để chọn CP-SAT thay vì `scipy.optimize` — scipy không có cơ chế này.

`human_message` sinh từ template theo `rule_id`, không phải gọi LLM. Tất định và rẻ.

---

## 3.6 ArchModel + Schedules — output Layer 4

```jsonc
{
  "schema_version": "1.0.0",
  "floorplan_ref": "sha256:…",
  "style": "hien_dai",
  "style_template_version": "1.2.0",
  "massing": { "levels": [ { "level": 1, "extrude_from_m": 0.0, "extrude_to_m": 3.6 } ] },
  "roof": { "kind": "flat", "parapet_h_m": 0.9 },
  "facades": [
    {
      "direction": "front",
      "openings": [ { "level": 1, "x_m": 1.0, "w_m": 2.4, "h_m": 2.2, "kind": "window" } ],
      "materials": [ { "zone": "base", "material": "exposed_concrete" } ]
    }
  ],
  "sections": [ { "id": "A-A", "plane": { "axis": "y", "at_m": 8.0 } } ]
}
```

```jsonc
// Schedules — sinh tự động, tự cập nhật khi FloorPlan đổi
{
  "schema_version": "1.0.0",
  "floorplan_ref": "sha256:…",
  "doors":     [ { "code": "D1", "w_m": 0.9, "h_m": 2.2, "count": 6, "material": "wood" } ],
  "windows":   [ { "code": "W1", "w_m": 2.4, "h_m": 2.2, "count": 4 } ],
  "areas":     [ { "level": 1, "room_type": "living", "area_m2": 21.0 } ],
  "materials": [ { "code": "M1", "name": "gạch ốp 600x600", "area_m2": 48.2 } ]
}
```

---

## 3.7 RenderRequest / RenderResult — Layer 5

Interface `RenderBackend` để đổi nơi chạy mà không sửa code gọi.

```jsonc
// RenderRequest
{
  "schema_version": "1.0.0",
  "arch_ref": "sha256:…",
  "views": [
    { "id": "v1", "camera": "street_level", "clay_png": "r2://…", "depth_png": "r2://…", "edge_png": "r2://…" }
  ],
  "style_preset": "hien_dai_afternoon",
  "workflow": "comfy/exterior_v3.json",
  "variants_per_view": 3,
  "data_class": 3
}
```

```jsonc
// RenderResult
{
  "images": [ { "view": "v1", "variant": 1, "uri": "r2://…", "watermark_applied": true } ],
  "backend": "local_workstation",       // local_workstation | serverless | api_service
  "duration_s": 142
}
```

`watermark_applied` phải là `true` trước khi ảnh được hiển thị cho khách. Kiểm tra
trong code, không tin tưởng.

---

## 3.8 Artifact và lineage

Bảng Postgres trong cùng database với phần mềm quản trị, prefix `design_` để phân biệt.

```sql
design_artifact (
  id             text primary key,      -- 'sha256:...' băm payload đã chuẩn hoá
  tenant_id      uuid not null,
  project_id     uuid not null references projects(id),   -- BẢNG SẴN CÓ
  discipline     text not null,         -- KT | KC | DN
  kind           text not null,         -- design_brief | space_program | layout_intent | floor_plan | ...
  schema_version text not null,
  payload_uri    text not null,         -- r2://…
  created_at     timestamptz not null,
  created_by     uuid references users(id)                 -- BẢNG SẴN CÓ
)

design_artifact_edge (
  tenant_id   uuid not null,
  from_id     text references design_artifact(id),   -- input
  to_id       text references design_artifact(id),   -- output
  step        text not null,                          -- 'layer3b_solve'
  params_hash text not null,                          -- băm config đã dùng
  primary key (from_id, to_id, step)
)

design_head (
  tenant_id   uuid not null,
  project_id  uuid not null references projects(id),
  kind        text not null,
  artifact_id text references design_artifact(id),    -- bản ĐANG CÓ HIỆU LỰC
  primary key (project_id, kind)
)
```

**Quy tắc:**
- Băm trên payload đã chuẩn hoá (JSON canonical: sort key, không khoảng trắng thừa).
- Không bao giờ `UPDATE` một artifact. Sửa = tạo artifact mới + đổi `design_head`.
- `params_hash` trả lời "cùng input, cùng config → đã có kết quả chưa" để bỏ qua tính lại.
- RLS trên cả ba bảng kiểm tra `tenant_id`.

### Vì sao không dùng hệ quản lý tài liệu sẵn có

Hai thứ khác bản chất và cần cả hai:

| | Hệ tài liệu sẵn có | Artifact + lineage |
|---|---|---|
| Quản lý phiên bản của cái gì | Tệp (PDF, DWG — định dạng gốc AutoCAD) | JSON có cấu trúc giữa các bước tính |
| Phục vụ ai | Con người: phê duyệt, "bản nào hiệu lực" | Máy: regenerate, idempotency, truy vết phụ thuộc |
| Có đồ thị phụ thuộc | Không | Có |

Ép artifact vào hệ tài liệu sẽ mất tính idempotent và mất đồ thị phụ thuộc.

## 3.8b Publish bridge — cầu nối sang hệ tài liệu

Khi KTS/Trưởng phòng **phê duyệt** một phương án, hệ thống publish sang hệ quản lý tài
liệu sẵn có như một phiên bản chính thức. Đây là **điểm giao duy nhất** giữa hai cơ chế.

```jsonc
// PublishRequest
{
  "schema_version": "1.0.0",
  "tenant_id": "…",
  "project_id": "…",
  "artifact_ids": {                       // artifact nguồn, để truy ngược
    "floor_plan": "sha256:…",
    "arch_model": "sha256:…"
  },
  "discipline": "KT",                     // MỘT publish = MỘT bộ môn
  "documents": [
    { "kind": "dxf",  "name": "MatBang",   "uri": "r2://…" },
    { "kind": "pdf",  "name": "PhuongAn",  "uri": "r2://…" },
    { "kind": "png",  "name": "PhoiCanh",  "uri": "r2://…" }
  ],
  "signed_by": "…",                       // người CHỊU TRÁCH NHIỆM CHUYÊN MÔN bộ môn này
  "signed_at": "…"
}
```

**Ký theo từng bộ môn, không ký gộp.** Một lần publish chỉ mang một `discipline`, và
`signed_by` phải là người có thẩm quyền chuyên môn của đúng bộ môn đó. KTS không ký được
hồ sơ kết cấu, kể cả khi họ là trưởng phòng. Cưỡng chế bằng kiểm tra quyền
`design.publish.<discipline>`, không bằng quy ước.

Bộ hồ sơ hoàn chỉnh = tập hợp các lần publish của cả ba bộ môn. Hệ thống kiểm tra đầy đủ
trước khi cho phát hành ra ngoài.

**Bắt buộc:**
- Tên file theo quy ước sẵn có của NVG: `NVO026_NhaAnhA_KT_MatBang_V03_11082026`.
  Số phiên bản do hệ tài liệu cấp, không phải module tự đặt.
- Mỗi tài liệu publish ra giữ tham chiếu ngược về `artifact_ids` — để sau này truy được
  "bản vẽ này sinh ra từ đầu bài nào".
- Publish là **một chiều**. Sửa tài liệu trong hệ tài liệu không đẩy ngược vào artifact.

## 3.9 Quyền truy cập (Row Level Security — phân quyền mức từng dòng dữ liệu)

| Vai trò | DesignBrief | FloorPlan | Renders | DXF | Phê duyệt |
|---|---|---|---|---|---|
| `guest` | tạo + đọc của mình | đọc preview | đọc | không | không |
| `sales` | đọc | đọc | đọc | không | không |
| `architect` | đọc + sửa | đọc + sửa | đọc + tạo | xuất | không |
| `design_lead` | đọc + sửa | đọc + sửa | đọc + tạo | xuất | **có** |
| `executive` | đọc | đọc | đọc | không | không |

Vai trò **dùng chung với phần mềm quản trị** — không định nghĩa bộ vai trò riêng cho
module. Ánh xạ tên vai trò thực tế của hệ thống vào bảng trên khi triển khai.

Viết bằng chính sách RLS trên bảng, không phải câu lệnh `if` trong tầng API. Mọi policy kiểm tra
**cả `tenant_id` lẫn vai trò**.

Kỹ sư kết cấu và điện nước thuê ngoài: tài khoản đầy đủ, giới hạn theo dự án được phân công và bộ môn phụ trách (D17).
