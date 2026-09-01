"""Xuất mặt bằng ra DXF — MỘT CHIỀU.

Nguồn: `doc/design/08-milestones.md` Mốc 5 ("xuất DXF mặt bằng với khung tên và mã phiên bản
đúng quy ước Nhà Việt Group"), CLAUDE.md 8.7.

## Vì sao một chiều

Không nhập ngược tệp CAD đã sửa. Mặt bằng của hệ thống là một CÂY RÀNG BUỘC đã giải; tệp DXF
chỉ là hình chiếu phẳng của nó. Đọc ngược một tệp ai đó đã kéo tay thì toàn bộ siêu dữ liệu
ràng buộc mất sạch, và không có cách nào biết ràng buộc nào đã bị phá. Muốn sửa thì sửa trong
trình chỉnh sửa của hệ thống rồi xuất lại.

## Tên lớp là DỮ LIỆU

Không dòng nào dưới đây viết một chuỗi như `"A-AREA-ROOM"`. Tên lớp lấy từ mục `export:` của
`kb/layer_mapping.yaml`, và các tên ở đó được chọn sao cho khớp lại chính những mẫu ở mục
`roles:`/`ignore:` — bản vẽ hệ thống xuất ra, đọc ngược vào lại đúng vai trò cũ.

## Đơn vị

Bản vẽ ghi bằng **milimét** (`$INSUNITS = 4`), đúng thói quen của hồ sơ kiến trúc Việt Nam.
Hợp đồng dữ liệu nói bằng mét, nên mọi toạ độ nhân 1000 ngay tại ranh giới này.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

import ezdxf
from ezdxf.document import Drawing

from design_compute.cad.layers import LayerMapping, load_mapping

MM_PER_M = 1000.0

# Nhãn bắt buộc do MÃ NGUỒN chèn, không phụ thuộc người dùng nhớ bật và không tắt được từ
# giao diện (CLAUDE.md 8.7). Lưới trục là ĐỀ XUẤT của hệ thống; kỹ sư kết cấu quyết định.
GRID_NOTICE = "Lưới trục là đề xuất của hệ thống — kỹ sư kết cấu quyết định"
STAGE_NOTICE = "Phương án sơ bộ — chưa phải hồ sơ thi công"

TITLE_BLOCK_WIDTH_MM = 180.0 * 1000 / 180.0  # giữ tỉ lệ đọc được ở mọi cỡ bản vẽ
TITLE_ROW_MM = 900.0


class DxfExportError(ValueError):
    """Mặt bằng không đủ dữ liệu để xuất. Không đoán bù."""

    retryable = False


@dataclass(frozen=True, slots=True)
class TitleBlock:
    """Khung tên. Mọi trường do lớp gọi cấp — Container không biết mã hồ sơ của NVG."""

    project_code: str
    project_name: str
    discipline: str
    sheet: str
    version: str
    date: str
    rule_pack_version: str = ""


def _mm(value: float) -> float:
    return round(value * MM_PER_M, 3)


def _layer(doc: Drawing, mapping: LayerMapping, role: str) -> str:
    spec = mapping.export_layer(role)
    if spec.layer not in doc.layers:
        doc.layers.add(name=spec.layer, color=spec.color)
    return spec.layer


def export_floor_plan(
    plan: dict[str, Any],
    *,
    level: int,
    title: TitleBlock,
    mapping: LayerMapping | None = None,
) -> bytes:
    """Một tầng của `FloorPlan` thành một tệp DXF."""
    mapping = mapping or load_mapping()

    levels = {int(item["level"]): item for item in plan.get("levels", [])}
    floor = levels.get(level)
    if floor is None:
        raise DxfExportError(
            f"Mặt bằng không có tầng {level}. Các tầng đang có: "
            + ", ".join(str(k) for k in sorted(levels))
        )

    doc = ezdxf.new(dxfversion="R2010", setup=True)
    doc.header["$INSUNITS"] = 4  # milimét
    msp = doc.modelspace()

    site = plan.get("site") or {}
    width = float(site.get("width_m", 0.0))
    depth = float(site.get("depth_m", 0.0))
    if width <= 0 or depth <= 0:
        raise DxfExportError("Mặt bằng thiếu kích thước khu đất nên không đặt được khung bản vẽ.")

    boundary = _layer(doc, mapping, "site_boundary")
    msp.add_lwpolyline(
        [(0, 0), (_mm(width), 0), (_mm(width), _mm(depth)), (0, _mm(depth))],
        close=True,
        dxfattribs={"layer": boundary},
    )

    grid = _layer(doc, mapping, "grid")
    structural = plan.get("structural_grid") or {}
    for x in structural.get("axes_x_m", []):
        msp.add_line((_mm(float(x)), 0), (_mm(float(x)), _mm(depth)), dxfattribs={"layer": grid})
    for y in structural.get("axes_y_m", []):
        msp.add_line((0, _mm(float(y))), (_mm(width), _mm(float(y))), dxfattribs={"layer": grid})

    rooms_layer = _layer(doc, mapping, "room_boundary")
    text_layer = _layer(doc, mapping, "room_label")
    for room in floor.get("rooms", []):
        polygon = [(_mm(float(px)), _mm(float(py))) for px, py in room["polygon"]]
        msp.add_lwpolyline(polygon, close=True, dxfattribs={"layer": rooms_layer})
        cx = sum(p[0] for p in polygon) / len(polygon)
        cy = sum(p[1] for p in polygon) / len(polygon)
        label = f"{room.get('label') or room['id']}\n{float(room['area_m2']):.1f} m2"
        _text(msp, label.replace("\n", "  "), (cx, cy), 250, text_layer, centred=True)

    voids_layer = _layer(doc, mapping, "void")
    for hole in floor.get("voids", []):
        polygon = [(_mm(float(px)), _mm(float(py))) for px, py in hole["polygon"]]
        msp.add_lwpolyline(polygon, close=True, dxfattribs={"layer": voids_layer})

    walls_layer = _layer(doc, mapping, "wall")
    walls: dict[str, dict[str, Any]] = {}
    for wall in floor.get("walls", []):
        walls[str(wall["id"])] = wall
        a = (_mm(float(wall["a"][0])), _mm(float(wall["a"][1])))
        b = (_mm(float(wall["b"][0])), _mm(float(wall["b"][1])))
        msp.add_line(a, b, dxfattribs={"layer": walls_layer})

    door_layer = _layer(doc, mapping, "door")
    window_layer = _layer(doc, mapping, "window")
    for opening in floor.get("openings", []):
        wall = walls.get(str(opening.get("wall")))
        if wall is None:
            # Lỗ mở trỏ tới một bức tường không có trong tầng này là dữ liệu hỏng. Bỏ qua im
            # lặng sẽ cho ra bản vẽ thiếu cửa mà không ai biết, nên nói ra.
            raise DxfExportError(
                f"Lỗ mở {opening.get('id')} trỏ tới bức tường {opening.get('wall')} "
                f"không có ở tầng {level}."
            )
        start, end = _opening_segment(wall, opening)
        layer = door_layer if opening.get("kind") == "door" else window_layer
        msp.add_line(start, end, dxfattribs={"layer": layer})

    _title_block(msp, doc, mapping, title, level=level, width_m=width, depth_m=depth)

    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode("utf-8")


def _opening_segment(
    wall: dict[str, Any], opening: dict[str, Any]
) -> tuple[tuple[float, float], tuple[float, float]]:
    ax, ay = float(wall["a"][0]), float(wall["a"][1])
    bx, by = float(wall["b"][0]), float(wall["b"][1])
    length = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5
    if length <= 0:
        raise DxfExportError(f"Bức tường {wall.get('id')} có độ dài bằng không.")
    ux, uy = (bx - ax) / length, (by - ay) / length
    offset = float(opening["offset_m"])
    span = float(opening["width_m"])
    start = (_mm(ax + ux * offset), _mm(ay + uy * offset))
    end = (_mm(ax + ux * (offset + span)), _mm(ay + uy * (offset + span)))
    return start, end


def _text(msp, content: str, at: tuple[float, float], height: float, layer: str, *, centred=False):
    entity = msp.add_text(content, dxfattribs={"layer": layer, "height": height})
    if centred:
        entity.set_placement(at, align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    else:
        entity.set_placement(at, align=ezdxf.enums.TextEntityAlignment.LEFT)
    return entity


def _title_block(
    msp,
    doc: Drawing,
    mapping: LayerMapping,
    title: TitleBlock,
    *,
    level: int,
    width_m: float,
    depth_m: float,
) -> None:
    """Khung tên đặt bên phải bản vẽ, cùng hệ toạ độ để in ra là thấy ngay.

    Nội dung do lớp gọi cấp, trừ hai nhãn cảnh báo — chúng do MÃ NGUỒN chèn và không tắt được.
    """
    layer = _layer(doc, mapping, "title_block")
    left = _mm(width_m) + 1500
    rows = [
        ("Công trình", title.project_name),
        ("Mã hồ sơ", title.project_code),
        ("Bộ môn", title.discipline),
        ("Tên bản vẽ", f"{title.sheet} — tầng {level}"),
        ("Phiên bản", title.version),
        ("Ngày", title.date),
    ]
    if title.rule_pack_version:
        rows.append(("Gói quy tắc", title.rule_pack_version))
    rows.append(("", STAGE_NOTICE))
    rows.append(("", GRID_NOTICE))

    height = TITLE_ROW_MM * (len(rows) + 1)
    right = left + TITLE_ROW_MM * 9
    top = _mm(depth_m)
    msp.add_lwpolyline(
        [(left, top - height), (right, top - height), (right, top), (left, top)],
        close=True,
        dxfattribs={"layer": layer},
    )

    y = top - TITLE_ROW_MM
    for label, value in rows:
        text = f"{label}: {value}" if label else value
        _text(msp, text, (left + 200, y), 300, layer)
        y -= TITLE_ROW_MM
