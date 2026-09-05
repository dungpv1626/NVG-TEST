"""Mô hình TỜ bản vẽ — một nguồn hình học, hai đầu ra (DXF và SVG).

Nguồn: `doc/design/12-ux-ui.md` 12.8 ("một định nghĩa hình học duy nhất cho cả hai chế độ"),
`doc/design/14-phuong-an-demo.md` 14.6(b), vướng mắc V-9.

## Vì sao có lớp trung gian này

Tám yếu tố ngôn ngữ bản vẽ (trục và bong bóng, chuỗi kích thước hai lớp, tường đậm, cửa có cung
quay, cửa sổ nét đôi, thang đủ bậc, ký hiệu mặt cắt, khung tờ) phải hiện giống hệt nhau trên
màn hình và trong tệp AutoCAD. Viết hai bộ mã vẽ thì lần sửa tiếp theo chỉ sửa được một bên.
Nên bản vẽ được dựng MỘT lần thành danh sách nét/chữ/kích thước ở đây, rồi `dxf.py` và `svg.py`
chỉ chép ra — không bên nào tự nghĩ thêm hình học.

## Hệ toạ độ

Mọi toạ độ là MILIMÉT trong không gian mô hình, trục y hướng lên (đúng AutoCAD). Khung giấy A3
được vẽ ngay trong không gian mô hình, phóng theo tỷ lệ — đúng cách NVG làm ngoài đời: hồ sơ
thật không có layout khổ giấy, 22–73 tờ nằm cạnh nhau trong cùng modelspace
(`13-ho-so-thuc-te.md` 13.6 (7)).

Kích thước GIẤY (chiều cao chữ 2,5 mm, bề rộng nét 0,25 mm, bán kính bong bóng 4 mm) được nhân
với tỷ lệ để ra kích thước mô hình. Đổi tỷ lệ là mọi ghi chú tự co giãn theo.

## Tên lớp và các con số cấu tạo là DỮ LIỆU

Tên lớp lấy từ `kb/layer_mapping.yaml` (mục `export:`), kích thước cửa và cao độ từ
`kb/construction_norms.yaml`. Tệp này không viết tên lớp nào và không có ngưỡng quy chuẩn nào.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal

# Chỉ nhập để CHÚ KIỂU. Nhập lúc chạy là kéo `design_compute.cad/__init__` vào, mà gói đó lại
# nhập `cad.export` → `sheet` → vòng lặp, và service chết ngay lúc khởi động (đã xảy ra 06/09).
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from design_compute.cad.layers import LayerMapping

MM_PER_M = 1000.0
Weight = Literal["thin", "medium", "heavy"]
Anchor = Literal["start", "middle", "end"]

# Bề rộng nét trên GIẤY, milimét. Tường đậm gấp đôi nét thường (12.8 nói 2,4×; 0,5/0,25 là cặp
# bút tiêu chuẩn gần nhất mà AutoCAD có sẵn).
LINE_WEIGHTS_MM: dict[Weight, float] = {"thin": 0.13, "medium": 0.25, "heavy": 0.5}

# Cỡ chữ và ký hiệu trên GIẤY, milimét.
TEXT_MM = 2.5
SMALL_TEXT_MM = 2.0
TITLE_TEXT_MM = 3.5
BUBBLE_RADIUS_MM = 4.0
DIM_TICK_MM = 1.5
DIM_TEXT_MM = 2.5

# Khổ giấy A3 (mm) và lề.
A3 = (420.0, 297.0)
MARGIN_MM = 10.0
TITLE_STRIP_MM = 42.0

# Tỷ lệ cho phép — 1:70 là tỷ lệ NVG dùng cho mặt bằng nhà phố trên A3 (hồ sơ thật).
SCALES = (50, 60, 70, 75, 100, 125, 150, 200)

# Khoảng cách ghi chú quanh công trình, tính bằng MÉT mô hình (không phụ thuộc tỷ lệ, vì chúng
# phải né tường và cửa của chính công trình).
GRID_EXTENSION_M = 2.6
INNER_DIM_M = 1.0
OUTER_DIM_M = 1.7
SECTION_MARK_M = 3.4

# Nhãn do MÃ NGUỒN chèn, không tắt được từ giao diện (CLAUDE.md 8.7).
STAGE_NOTICE = "Phương án sơ bộ — chưa phải hồ sơ thi công"
GRID_NOTICE = "Lưới trục là đề xuất của hệ thống — kỹ sư kết cấu quyết định"

# Nhóm để tô màu công năng trên màn hình (11-design-flow 11.4b: sinh hoạt chung · phòng ngủ ·
# phụ trợ · giao thông · ngoài trời). Thứ tự = ưu tiên khi một mã phòng thuộc nhiều nhóm.
COLOUR_GROUP_ORDER = ("circulation", "sleeping", "habitable", "service", "outdoor")

# Chiều cao bậc thang thông dụng nhà ở; chỉ để VẼ số bậc, không phải ngưỡng quy chuẩn.
RISER_M = 0.17
TREAD_M = 0.25
STAIR_TYPES = frozenset({"stair", "core"})


@dataclass(frozen=True, slots=True)
class Line:
    layer: str
    a: tuple[float, float]
    b: tuple[float, float]
    weight: Weight = "medium"
    linetype: Literal["solid", "dashed", "dashdot"] = "solid"


@dataclass(frozen=True, slots=True)
class Polyline:
    layer: str
    points: tuple[tuple[float, float], ...]
    closed: bool = True
    weight: Weight = "medium"
    linetype: Literal["solid", "dashed", "dashdot"] = "solid"
    # Tô đặc (poché tường, mũi tên). `None` = không tô.
    fill: Literal["ink", "poche"] | None = None
    # Thuộc tính dữ liệu cho SVG (`data-*`) — trình duyệt tô màu công năng bằng CSS, không dựng.
    data: tuple[tuple[str, str], ...] = ()
    # Đa giác phòng: không vẽ nét (tường đã vẽ), chỉ giữ để tô màu và bắt sự kiện.
    no_stroke: bool = False


@dataclass(frozen=True, slots=True)
class Arc:
    layer: str
    center: tuple[float, float]
    radius: float
    start_deg: float
    end_deg: float
    weight: Weight = "thin"


@dataclass(frozen=True, slots=True)
class Circle:
    layer: str
    center: tuple[float, float]
    radius: float
    weight: Weight = "medium"


@dataclass(frozen=True, slots=True)
class Text:
    layer: str
    at: tuple[float, float]
    text: str
    height: float
    anchor: Anchor = "middle"
    rotation_deg: float = 0.0
    bold: bool = False


@dataclass(frozen=True, slots=True)
class Dimension:
    """Kích thước thẳng giữa hai điểm, đường ghi đặt tại `line_at` (toạ độ theo trục vuông góc)."""

    layer: str
    p1: tuple[float, float]
    p2: tuple[float, float]
    orientation: Literal["horizontal", "vertical"]
    line_at: float
    text: str


@dataclass(frozen=True, slots=True)
class TitleBlockRef:
    """Khung tên dạng BLOCK có ATTRIB — đúng cách HS-01 KT làm (kb/title_block.yaml, họ semantic_kt)."""

    layer: str
    origin: tuple[float, float]
    width: float
    height: float
    attribs: tuple[tuple[str, str], ...]
    statics: tuple[tuple[str, str], ...]


Entity = Line | Polyline | Arc | Circle | Text | Dimension | TitleBlockRef


@dataclass(slots=True)
class SheetModel:
    scale: int
    paper_mm: tuple[float, float]
    """Góc dưới trái khung giấy trong không gian mô hình (mm)."""
    frame_origin: tuple[float, float]
    entities: list[Entity] = field(default_factory=list)

    @property
    def frame_size(self) -> tuple[float, float]:
        return (self.paper_mm[0] * self.scale, self.paper_mm[1] * self.scale)

    def paper(self, mm: float) -> float:
        """Một kích thước trên giấy quy về mô hình."""
        return mm * self.scale

    def add(self, entity: Entity) -> None:
        self.entities.append(entity)


@dataclass(frozen=True, slots=True)
class SheetTitle:
    """Nội dung khung tên — lớp gọi cấp; Container không biết mã hồ sơ của NVG."""

    project_code: str
    project_name: str
    discipline: str
    sheet_name: str
    sheet_code: str
    version: str
    date: str
    rule_pack_version: str = ""


class SheetBuildError(ValueError):
    retryable = False


def _mm(v: float) -> float:
    return round(float(v) * MM_PER_M, 3)


def _fmt_mm(value_mm: float) -> str:
    return str(int(round(value_mm)))


def _axis_letter(index: int) -> str:
    # A, B, … Z, AA, AB — không dùng I và O (dễ nhầm với 1 và 0 trên bản vẽ).
    letters = [c for c in "ABCDEFGHJKLMNPQRSTUVWXYZ"]
    name = ""
    index += 1
    while index > 0:
        index, rem = divmod(index - 1, len(letters))
        name = letters[rem] + name
    return name


def choose_scale(width_m: float, depth_m: float) -> tuple[int, tuple[float, float]]:
    """Tỷ lệ nhỏ nhất (bản vẽ to nhất) mà công trình kèm vùng ghi chú lọt khổ A3.

    Thử cả hai chiều giấy; công trình sâu hơn rộng (nhà phố) thường ra khổ đứng.
    """
    need_w = (width_m + 2 * SECTION_MARK_M) * MM_PER_M
    need_h = (depth_m + 2 * SECTION_MARK_M) * MM_PER_M
    for scale in SCALES:
        for paper in (A3, (A3[1], A3[0])):
            area_w = (paper[0] - 2 * MARGIN_MM) * scale
            area_h = (paper[1] - 2 * MARGIN_MM - TITLE_STRIP_MM) * scale
            if need_w <= area_w and need_h <= area_h:
                return scale, paper
    return SCALES[-1], A3


def _polygon_contains(polygon: list[tuple[float, float]], point: tuple[float, float]) -> bool:
    x, y = point
    inside = False
    n = len(polygon)
    for i in range(n):
        x0, y0 = polygon[i]
        x1, y1 = polygon[(i + 1) % n]
        if (y0 > y) != (y1 > y):
            cross = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < cross:
                inside = not inside
    return inside


def _bbox(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def build_floor_plan_sheet(
    plan: dict[str, Any],
    *,
    level: int,
    title: SheetTitle,
    mapping: LayerMapping,
    labels: dict[str, str] | None = None,
    groups: dict[str, list[str]] | None = None,
    circulation_types: frozenset[str] = frozenset({"stair", "core", "circulation"}),
) -> SheetModel:
    """Tờ "mặt bằng công năng" của một tầng, đủ tám yếu tố ngôn ngữ bản vẽ."""
    levels = {int(item["level"]): item for item in plan.get("levels", [])}
    floor = levels.get(level)
    if floor is None:
        raise SheetBuildError(
            f"Mặt bằng không có tầng {level}. Các tầng đang có: "
            + ", ".join(str(k) for k in sorted(levels))
        )
    site = plan.get("site") or {}
    width_m = float(site.get("width_m", 0.0))
    depth_m = float(site.get("depth_m", 0.0))
    if width_m <= 0 or depth_m <= 0:
        raise SheetBuildError("Mặt bằng thiếu kích thước khu đất nên không đặt được khung bản vẽ.")

    labels = labels or {}
    groups = groups or {}
    scale, paper = choose_scale(width_m, depth_m)
    frame_w, frame_h = paper[0] * scale, paper[1] * scale

    # Đặt công trình vào giữa vùng vẽ (trên dải khung tên).
    area_x0 = MARGIN_MM * scale
    area_y0 = (MARGIN_MM + TITLE_STRIP_MM) * scale
    area_w = frame_w - 2 * MARGIN_MM * scale
    area_h = frame_h - area_y0 - MARGIN_MM * scale
    bw, bd = _mm(width_m), _mm(depth_m)
    ox = area_x0 + (area_w - bw) / 2
    oy = area_y0 + (area_h - bd) / 2
    sheet = SheetModel(scale=scale, paper_mm=paper, frame_origin=(-ox, -oy))

    layer = mapping.export_layer
    L = {
        role: layer(role).layer
        for role in (
            "site_boundary",
            "grid",
            "dimension",
            "wall",
            "hatch",
            "door",
            "window",
            "stair",
            "room_boundary",
            "room_label",
            "void",
            "title_block",
            "annotation",
        )
    }

    _frame(sheet, L["title_block"])
    # Ranh giới thửa đất — nét đứt mảnh. Nhà phố lấp kín lô nên nó trùng chân tường ngoài;
    # vẫn vẽ vì đây là ranh pháp lý, và bản vẽ đọc ngược cần nó (vai trò `site_boundary`).
    bw_, bd_ = _mm(width_m), _mm(depth_m)
    sheet.add(Polyline(L["site_boundary"], ((0.0, 0.0), (bw_, 0.0), (bw_, bd_), (0.0, bd_)), weight="thin", linetype="dashed"))
    _grid(sheet, plan, width_m, depth_m, L["grid"])
    _dimensions(sheet, plan, width_m, depth_m, L["dimension"])
    _rooms(sheet, floor, labels, groups, L["room_boundary"], L["room_label"])
    _voids(sheet, floor, L["void"])
    walls = {str(w["id"]): w for w in floor.get("walls", [])}
    _walls_and_openings(
        sheet, floor, walls, level, circulation_types, L["wall"], L["hatch"], L["door"], L["window"]
    )
    _stairs(sheet, floor, L["stair"], L["annotation"])
    _section_marks(sheet, floor, width_m, depth_m, L["annotation"])
    _title_block(sheet, title, level, L["title_block"])
    return sheet


# ── Khung giấy ──────────────────────────────────────────────────────────────────────────


def _frame(sheet: SheetModel, layer: str) -> None:
    fx, fy = sheet.frame_origin
    fw, fh = sheet.frame_size
    m = sheet.paper(MARGIN_MM)
    sheet.add(Polyline(layer, ((fx, fy), (fx + fw, fy), (fx + fw, fy + fh), (fx, fy + fh)), weight="thin"))
    sheet.add(
        Polyline(
            layer,
            ((fx + m, fy + m), (fx + fw - m, fy + m), (fx + fw - m, fy + fh - m), (fx + m, fy + fh - m)),
            weight="heavy",
        )
    )


# ── Lưới trục và bong bóng ──────────────────────────────────────────────────────────────


def _axes(plan: dict[str, Any], width_m: float, depth_m: float) -> tuple[list[float], list[float]]:
    structural = plan.get("structural_grid") or {}
    xs = sorted({round(float(v), 3) for v in structural.get("axes_x_m", [])} | {0.0, round(width_m, 3)})
    ys = sorted({round(float(v), 3) for v in structural.get("axes_y_m", [])} | {0.0, round(depth_m, 3)})
    return xs, ys


def _grid(sheet: SheetModel, plan: dict[str, Any], width_m: float, depth_m: float, layer: str) -> None:
    xs, ys = _axes(plan, width_m, depth_m)
    ext = _mm(GRID_EXTENSION_M)
    r = sheet.paper(BUBBLE_RADIUS_MM)
    h = sheet.paper(TEXT_MM)
    bw, bd = _mm(width_m), _mm(depth_m)

    # Trục dọc (x cố định) mang CHỮ CÁI, trục ngang mang CHỮ SỐ — đúng hồ sơ thật (A-B, 1-4).
    for i, x in enumerate(xs):
        X = _mm(x)
        sheet.add(Line(layer, (X, -ext), (X, bd + ext), weight="thin", linetype="dashdot"))
        for cy in (-ext - r, bd + ext + r):
            sheet.add(Circle(layer, (X, cy), r))
            sheet.add(Text(layer, (X, cy), _axis_letter(i), h))
    for j, y in enumerate(ys):
        Y = _mm(y)
        sheet.add(Line(layer, (-ext, Y), (bw + ext, Y), weight="thin", linetype="dashdot"))
        for cx in (-ext - r, bw + ext + r):
            sheet.add(Circle(layer, (cx, Y), r))
            sheet.add(Text(layer, (cx, Y), str(j + 1), h))


# ── Chuỗi kích thước hai lớp, bốn cạnh ──────────────────────────────────────────────────


def _dimensions(sheet: SheetModel, plan: dict[str, Any], width_m: float, depth_m: float, layer: str) -> None:
    xs, ys = _axes(plan, width_m, depth_m)
    bw, bd = _mm(width_m), _mm(depth_m)
    inner, outer = _mm(INNER_DIM_M), _mm(OUTER_DIM_M)

    def chain(values: list[float], orientation: str, line_at: float, other: float) -> None:
        for a, b in zip(values, values[1:]):
            A, B = _mm(a), _mm(b)
            if orientation == "horizontal":
                sheet.add(Dimension(layer, (A, other), (B, other), "horizontal", line_at, _fmt_mm(B - A)))
            else:
                sheet.add(Dimension(layer, (other, A), (other, B), "vertical", line_at, _fmt_mm(B - A)))

    # Lớp trong: từng khoảng trục. Lớp ngoài: tổng. Chỉ bỏ lớp trong khi nó trùng lớp ngoài.
    for line_at, other in ((-inner, 0.0), (bd + inner, bd)):
        if len(xs) > 2:
            chain(xs, "horizontal", line_at, other)
    for line_at, other in ((-outer, 0.0), (bd + outer, bd)):
        chain([xs[0], xs[-1]], "horizontal", line_at, other)
    for line_at, other in ((-inner, 0.0), (bw + inner, bw)):
        if len(ys) > 2:
            chain(ys, "vertical", line_at, other)
    for line_at, other in ((-outer, 0.0), (bw + outer, bw)):
        chain([ys[0], ys[-1]], "vertical", line_at, other)


# ── Phòng, nhãn, khoảng rỗng ────────────────────────────────────────────────────────────


def _colour_group(room_type: str, groups: dict[str, list[str]]) -> str:
    for name in COLOUR_GROUP_ORDER:
        if room_type in set(groups.get(name) or ()):
            return name
    return "other"


def _rooms(
    sheet: SheetModel,
    floor: dict[str, Any],
    labels: dict[str, str],
    groups: dict[str, list[str]],
    boundary_layer: str,
    text_layer: str,
) -> None:
    h = sheet.paper(TEXT_MM)
    hs = sheet.paper(SMALL_TEXT_MM)
    for room in floor.get("rooms", []):
        pts = tuple((_mm(px), _mm(py)) for px, py in room["polygon"])
        room_id = str(room["id"])
        room_type = str(room.get("type", ""))
        sheet.add(
            Polyline(
                boundary_layer,
                pts,
                weight="thin",
                no_stroke=True,
                data=(
                    ("room", room_id),
                    ("type", room_type),
                    ("group", _colour_group(room_type, groups)),
                ),
            )
        )
        x0, y0, x1, y1 = _bbox(list(pts))
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        name = (labels.get(room_id) or room.get("label") or room_type or room_id).upper()
        area = f"{float(room['area_m2']):.1f}".replace(".", ",") + " m²"
        # Phòng hẹp và dài (hành lang 0,9 m) thì xoay chữ dọc theo phòng — chữ ngang sẽ tràn
        # sang hai phòng bên cạnh và đọc như nhãn của chúng.
        approx_width = h * 0.62 * len(name)
        rotate = (x1 - x0) < approx_width and (y1 - y0) > (x1 - x0)
        if rotate:
            sheet.add(Text(text_layer, (cx - h * 0.7, cy), name, h, rotation_deg=90.0))
            sheet.add(Text(text_layer, (cx + hs * 0.9, cy), area, hs, rotation_deg=90.0))
        else:
            sheet.add(Text(text_layer, (cx, cy + h * 0.7), name, h))
            sheet.add(Text(text_layer, (cx, cy - hs * 0.9), area, hs))


def _voids(sheet: SheetModel, floor: dict[str, Any], layer: str) -> None:
    for hole in floor.get("voids", []):
        pts = tuple((_mm(px), _mm(py)) for px, py in hole["polygon"])
        sheet.add(Polyline(layer, pts, weight="thin", linetype="dashed"))
        # Hai đường chéo: ký hiệu thông tầng / giếng trời quen thuộc trên mặt bằng.
        x0, y0, x1, y1 = _bbox(list(pts))
        sheet.add(Line(layer, (x0, y0), (x1, y1), weight="thin"))
        sheet.add(Line(layer, (x0, y1), (x1, y0), weight="thin"))


# ── Tường (nét đôi có poché) và lỗ mở ───────────────────────────────────────────────────


def _wall_frame(wall: dict[str, Any]) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float], float]:
    ax, ay = _mm(wall["a"][0]), _mm(wall["a"][1])
    bx, by = _mm(wall["b"][0]), _mm(wall["b"][1])
    length = math.hypot(bx - ax, by - ay)
    if length <= 0:
        raise SheetBuildError(f"Bức tường {wall.get('id')} có độ dài bằng không.")
    u = ((bx - ax) / length, (by - ay) / length)
    n = (-u[1], u[0])
    return (ax, ay), u, n, length


def _walls_and_openings(
    sheet: SheetModel,
    floor: dict[str, Any],
    walls: dict[str, dict[str, Any]],
    level: int,
    circulation_types: frozenset[str],
    wall_layer: str,
    hatch_layer: str,
    door_layer: str,
    window_layer: str,
) -> None:
    rooms = [
        (str(r.get("type", "")), [(_mm(px), _mm(py)) for px, py in r["polygon"]])
        for r in floor.get("rooms", [])
    ]
    by_wall: dict[str, list[dict[str, Any]]] = {}
    for opening in floor.get("openings", []):
        wall_id = str(opening.get("wall"))
        if wall_id not in walls:
            raise SheetBuildError(
                f"Lỗ mở {opening.get('id')} trỏ tới bức tường {opening.get('wall')} không có ở tầng {level}."
            )
        by_wall.setdefault(wall_id, []).append(opening)

    for wall_id, wall in walls.items():
        origin, u, n, length = _wall_frame(wall)
        t = _mm(float(wall.get("thickness_m") or 0.11))
        half = t / 2

        def P(s: float, off: float) -> tuple[float, float]:
            return (origin[0] + u[0] * s + n[0] * off, origin[1] + u[1] * s + n[1] * off)

        # Cắt tường tại các lỗ mở, rồi vẽ từng đoạn đặc.
        cuts = sorted(
            (
                max(0.0, _mm(float(o["offset_m"]))),
                min(length, _mm(float(o["offset_m"]) + float(o["width_m"]))),
                o,
            )
            for o in by_wall.get(wall_id, [])
            if float(o["width_m"]) > 0
        )
        cursor = 0.0
        segments: list[tuple[float, float]] = []
        for s0, s1, _o in cuts:
            if s0 > cursor:
                segments.append((cursor, s0))
            cursor = max(cursor, s1)
        if cursor < length:
            segments.append((cursor, length))

        for s0, s1 in segments:
            quad = (P(s0, -half), P(s1, -half), P(s1, half), P(s0, half))
            sheet.add(Polyline(wall_layer, quad, weight="heavy"))
            sheet.add(Polyline(hatch_layer, quad, weight="thin", fill="poche", no_stroke=True))

        for s0, s1, o in cuts:
            kind = o.get("kind")
            w = s1 - s0
            if kind == "door":
                _door(sheet, P, s0, s1, w, half, n, rooms, circulation_types, door_layer)
            elif kind == "window":
                # Cửa sổ: hai mặt tường đi tiếp bằng nét mảnh, kính là nét đôi ở giữa.
                for off in (-half, half):
                    sheet.add(Line(window_layer, P(s0, off), P(s1, off), weight="thin"))
                for off in (-half / 3, half / 3):
                    sheet.add(Line(window_layer, P(s0, off), P(s1, off), weight="medium"))
                sheet.add(Line(window_layer, P(s0, -half), P(s0, half), weight="thin"))
                sheet.add(Line(window_layer, P(s1, -half), P(s1, half), weight="thin"))
            else:
                # Lỗ mở không cánh: chỉ hai nét mép.
                sheet.add(Line(door_layer, P(s0, -half), P(s0, half), weight="thin"))
                sheet.add(Line(door_layer, P(s1, -half), P(s1, half), weight="thin"))


def _door(
    sheet: SheetModel,
    P,
    s0: float,
    s1: float,
    w: float,
    half: float,
    n: tuple[float, float],
    rooms: list[tuple[str, list[tuple[float, float]]]],
    circulation_types: frozenset[str],
    layer: str,
) -> None:
    """Cửa đi: cánh + cung quay, mở VÀO phòng (không mở ra hành lang)."""
    mid = (s0 + s1) / 2
    probe = half + 150.0
    side = 1.0
    for sign in (1.0, -1.0):
        px, py = P(mid, sign * probe)
        for room_type, polygon in rooms:
            if _polygon_contains(polygon, (px, py)) and room_type not in circulation_types:
                side = sign
                break
    hinge = P(s0, side * half)
    tip = (hinge[0] + n[0] * side * w, hinge[1] + n[1] * side * w)
    sheet.add(Line(layer, hinge, tip, weight="medium"))
    # Cung từ đầu cánh tới mép đối diện của lỗ mở, tâm ở bản lề.
    a0 = math.degrees(math.atan2(tip[1] - hinge[1], tip[0] - hinge[0]))
    end = P(s1, side * half)
    a1 = math.degrees(math.atan2(end[1] - hinge[1], end[0] - hinge[0]))
    start_deg, end_deg = (a0, a1) if ((a1 - a0) % 360) <= 180 else (a1, a0)
    sheet.add(Arc(layer, hinge, w, start_deg, end_deg))
    # Hai nét mép lỗ mở.
    sheet.add(Line(layer, P(s0, -half), P(s0, half), weight="thin"))
    sheet.add(Line(layer, P(s1, -half), P(s1, half), weight="thin"))


# ── Thang: đủ bậc, mũi tên chiều lên ────────────────────────────────────────────────────


def _stairs(sheet: SheetModel, floor: dict[str, Any], layer: str, note_layer: str) -> None:
    height_m = float(floor.get("height_m") or 3.6)
    risers = max(2, int(round(height_m / RISER_M)))
    h = sheet.paper(SMALL_TEXT_MM)
    for room in floor.get("rooms", []):
        if str(room.get("type", "")) not in STAIR_TYPES:
            continue
        pts = [(_mm(px), _mm(py)) for px, py in room["polygon"]]
        x0, y0, x1, y1 = _bbox(pts)
        inset = _mm(0.12)
        x0, y0, x1, y1 = x0 + inset, y0 + inset, x1 - inset, y1 - inset
        along_x = (x1 - x0) >= (y1 - y0)
        run = (x1 - x0) if along_x else (y1 - y0)
        step = max(_mm(TREAD_M) * 0.8, run / risers)
        count = int(run // step)
        for k in range(1, count):
            s = k * step
            if along_x:
                sheet.add(Line(layer, (x0 + s, y0), (x0 + s, y1), weight="thin"))
            else:
                sheet.add(Line(layer, (x0, y0 + s), (x1, y0 + s), weight="thin"))
        # Mũi tên chiều LÊN chạy giữa vế thang.
        if along_x:
            start, end = (x0 + step * 0.5, (y0 + y1) / 2), (x1 - step * 0.5, (y0 + y1) / 2)
        else:
            start, end = ((x0 + x1) / 2, y0 + step * 0.5), ((x0 + x1) / 2, y1 - step * 0.5)
        sheet.add(Line(layer, start, end, weight="medium"))
        sheet.add(Circle(layer, start, sheet.paper(1.0), weight="thin"))
        _arrow_head(sheet, layer, start, end, sheet.paper(2.5))
        sheet.add(Text(note_layer, (start[0], start[1] - h * 1.4 if along_x else start[1]), "LÊN", h))


def _arrow_head(sheet: SheetModel, layer: str, start, end, size: float) -> None:
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    base = (end[0] - ux * size, end[1] - uy * size)
    left = (base[0] - uy * size * 0.4, base[1] + ux * size * 0.4)
    right = (base[0] + uy * size * 0.4, base[1] - ux * size * 0.4)
    sheet.add(Polyline(layer, (end, left, right), weight="thin", fill="ink"))


# ── Ký hiệu mặt cắt ─────────────────────────────────────────────────────────────────────


def _section_marks(sheet: SheetModel, floor: dict[str, Any], width_m: float, depth_m: float, layer: str) -> None:
    """Mặt cắt A-A cắt dọc qua thang; ký hiệu ở hai biên trên và dưới, tam giác chỉ hướng nhìn."""
    bw, bd = _mm(width_m), _mm(depth_m)
    x = bw / 2
    for room in floor.get("rooms", []):
        if str(room.get("type", "")) in STAIR_TYPES:
            x0, _, x1, _ = _bbox([(_mm(px), _mm(py)) for px, py in room["polygon"]])
            x = (x0 + x1) / 2
            break
    r = sheet.paper(BUBBLE_RADIUS_MM)
    h = sheet.paper(TEXT_MM)
    off = _mm(SECTION_MARK_M)
    for cy, direction in ((-off, 1.0), (bd + off, -1.0)):
        sheet.add(Circle(layer, (x, cy), r))
        sheet.add(Text(layer, (x, cy), "A", h, bold=True))
        # Tam giác chỉ hướng nhìn (về phía bên trái bản vẽ).
        tip = (x - r * 2.2, cy)
        sheet.add(Polyline(layer, (tip, (x - r, cy + r * 0.7), (x - r, cy - r * 0.7)), weight="thin", fill="ink"))
        # Đoạn nét cắt hướng vào công trình.
        y_edge = 0.0 if direction > 0 else bd
        sheet.add(Line(layer, (x, cy + direction * r), (x, y_edge - direction * _mm(0.3)), weight="medium", linetype="dashdot"))


# ── Khung tên (dải dưới, BLOCK có ATTRIB) ───────────────────────────────────────────────


def _title_block(sheet: SheetModel, title: SheetTitle, level: int, layer: str) -> None:
    fx, fy = sheet.frame_origin
    fw, _fh = sheet.frame_size
    m = sheet.paper(MARGIN_MM)
    strip = sheet.paper(TITLE_STRIP_MM)
    origin = (fx + m, fy + m)
    width = fw - 2 * m
    sheet.add(
        TitleBlockRef(
            layer,
            origin,
            width,
            strip,
            attribs=(
                ("KHBV", title.sheet_code),
                ("TBV", f"{title.sheet_name} — Tầng {level}"),
                ("TL", f"1:{sheet.scale}"),
                ("HM", title.discipline),
                ("HT", title.date),
                ("CT", title.project_name),
                ("MHS", title.project_code),
                ("PB", title.version),
            ),
            statics=(
                ("company", "NHÀ VIỆT ONE — Hồ sơ thiết kế kiến trúc"),
                ("stage", STAGE_NOTICE),
                ("grid", GRID_NOTICE),
                ("rules", f"Gói quy tắc {title.rule_pack_version}" if title.rule_pack_version else ""),
            ),
        )
    )
    # Nhãn giai đoạn còn hiện MỘT lần nữa ở góc trên trái vùng vẽ — không ai đọc khung tên
    # trước khi đọc bản vẽ.
    sheet.add(
        Text(
            layer,
            (fx + m + sheet.paper(3.0), fy + sheet.frame_size[1] - m - sheet.paper(5.0)),
            STAGE_NOTICE,
            sheet.paper(TITLE_TEXT_MM),
            anchor="start",
            bold=True,
        )
    )
