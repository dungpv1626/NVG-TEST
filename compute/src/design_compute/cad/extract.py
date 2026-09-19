"""Trích đa giác ranh phòng và nhãn phòng từ một tệp `.dxf`.

Đây là Bước 1 của quy trình số hoá (`doc/design/06-knowledge-base.md` mục 6.1), phần dành
cho bản vẽ mặt bằng. Nguyên tắc: **đọc vector, không dùng mô hình thị giác** — với tệp CAD
thì toạ độ đã là số thật, "nhìn" bản vẽ chỉ là suy đoán đắt hơn và kém chính xác hơn.

Ba ranh giới cố ý:

- **Không quy chuẩn hoá nhãn.** Trích xuất trả về nguyên văn chuỗi trong bản vẽ ("PN2",
  "P.NGỦ 2", "BEDROOM 2"). Việc quy về `bedroom` là của lớp mô hình ngôn ngữ ở Worker; đặt
  nó ở đây sẽ vi phạm ranh giới hai runtime (CLAUDE.md 8.3) và biến một bảng từ đồng nghĩa
  thành mã nguồn.
- **Không đoán khi thiếu.** Bản vẽ không khai đơn vị thì dùng mặc định trong bảng ánh xạ và
  ĐÁNH DẤU `units_assumed`. Một diện tích sai hệ số 1000 mà không có dấu hiệu gì còn nguy
  hiểm hơn không trích được.
- **Không bỏ qua cái không hiểu.** Lớp chưa ánh xạ được liệt kê ra để bổ sung vào
  `kb/layer_mapping.yaml`, thay vì im lặng biến mất.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import ezdxf
from ezdxf.document import Drawing
from shapely.geometry import Point, Polygon

from design_compute.cad.layers import INSUNITS_TO_METRES, LayerMapping, load_mapping
from design_compute.cad.sheets import Attrib, Sheet, detect_family, load_families, sheets_to_payload, split_sheets
from design_compute.cad.text import decode_by_style, load_text_encoding

# Đa giác nhỏ hơn ngưỡng này gần như chắc chắn là ký hiệu, chú thích hay mảnh vụn chứ không
# phải phòng. Ngưỡng cố ý rộng: thà giữ lại một thứ đáng ngờ và để người xác nhận loại bỏ,
# còn hơn âm thầm nuốt mất một phòng vệ sinh nhỏ.
MIN_ROOM_AREA_M2 = 0.8

# Bán kính tìm nhãn gần nhất khi không có đa giác nào chứa nó. Nhãn thường đặt trong phòng,
# nhưng ở phòng hẹp (vệ sinh, kho) người vẽ hay kéo chữ ra ngoài kèm đường dẫn.
LABEL_SEARCH_RADIUS_M = 3.0


@dataclass(frozen=True, slots=True)
class ExtractionWarning:
    """Một chỗ trích xuất không chắc chắn hoặc phải bỏ qua."""

    code: str
    detail: str

    def __str__(self) -> str:
        return f"[{self.code}] {self.detail}"


@dataclass(frozen=True, slots=True)
class ExtractedRoom:
    """Một phòng đọc được từ bản vẽ. Toạ độ đã quy về MÉT."""

    polygon_m: tuple[tuple[float, float], ...]
    area_m2: float
    layer: str
    label_raw: str | None = None
    # "contains" = nhãn nằm trong đa giác · "nearest" = nhãn gần nhất trong bán kính
    # · "none" = không tìm được nhãn. Người xác nhận cần biết mức độ chắc chắn, không chỉ
    # biết kết quả.
    label_source: str = "none"


@dataclass(frozen=True, slots=True)
class ExtractedFloorPlan:
    """Kết quả trích xuất một bản vẽ mặt bằng.

    Đây KHÔNG phải artifact theo hợp đồng dữ liệu: `floor-plan.schema.json` mô tả kết quả
    của bộ giải, còn bản ghi Knowledge Base (mục 6.2 của tài liệu) thuộc Mốc 3 và chưa có
    lược đồ. Cấu trúc này là kết quả trung gian trong Container, chưa từng vượt ranh giới
    runtime — đặt tên nó là "artifact" khi chưa có lược đồ sẽ vi phạm nguyên tắc 3.
    """

    source_file: str
    units: str
    units_assumed: bool
    rooms: tuple[ExtractedRoom, ...] = ()
    columns_m: tuple[tuple[float, float], ...] = ()
    site_boundary_m: tuple[tuple[float, float], ...] | None = None
    unmatched_labels: tuple[str, ...] = ()
    layers_seen: tuple[str, ...] = ()
    layers_unmapped: tuple[str, ...] = ()
    warnings: tuple[ExtractionWarning, ...] = ()
    # Bậc 1 của số hoá (14-phuong-an-demo 14.4 V-8): danh mục tờ đọc từ ATTRIB khung tên, họ
    # quy ước nhận ra được, và số thực thể nằm trong block — thứ trước đây bị bỏ qua im lặng.
    sheets: tuple[Sheet, ...] = ()
    title_block_family: str | None = None
    entities_top: int = 0
    entities_in_blocks: int = 0

    @property
    def total_area_m2(self) -> float:
        return round(sum(r.area_m2 for r in self.rooms), 2)

    @property
    def labelled_ratio(self) -> float:
        """Tỷ lệ phòng có nhãn — chỉ báo thô về chất lượng của lần trích này."""
        if not self.rooms:
            return 0.0
        return sum(1 for r in self.rooms if r.label_raw) / len(self.rooms)


@dataclass
class _Collector:
    """Trạng thái tích luỹ trong lúc quét, gom lại để hàm chính đọc được từ trên xuống."""

    scale: float
    boundaries: list[tuple[str, Polygon]] = field(default_factory=list)
    # (kiểu chữ, chuỗi NGUYÊN VĂN, điểm chèn) — giải mã TCVN3 theo kiểu chữ ở bước sau.
    labels: list[tuple[str, str, Point]] = field(default_factory=list)
    # ATTRIB của mọi INSERT (kiểu chữ, thẻ, chuỗi, x, y, tên khối) — khung tên nằm ở đây.
    attribs: list[tuple[str, str, str, float, float, str]] = field(default_factory=list)
    entities_top: int = 0
    entities_in_blocks: int = 0
    columns: list[tuple[float, float]] = field(default_factory=list)
    site: Polygon | None = None
    layers: dict[str, None] = field(default_factory=dict)
    warnings: list[ExtractionWarning] = field(default_factory=list)


def _resolve_units(doc: Drawing, mapping: LayerMapping) -> tuple[str, float, bool]:
    """Đơn vị của bản vẽ: (tên, hệ số sang mét, có phải suy ra không)."""
    code = 0
    try:
        code = int(doc.header.get("$INSUNITS", 0) or 0)
    except (TypeError, ValueError):
        code = 0

    known = INSUNITS_TO_METRES.get(code)
    if known is not None:
        return known[0], known[1], False
    return mapping.default_units, mapping.default_unit_scale, True


def _points_of(entity: Any) -> list[tuple[float, float]]:
    """Toạ độ đỉnh của một entity đa tuyến, ở đơn vị gốc của bản vẽ."""
    kind = entity.dxftype()
    if kind == "LWPOLYLINE":
        return [(float(p[0]), float(p[1])) for p in entity.get_points("xy")]
    if kind == "POLYLINE":
        return [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in entity.vertices]
    return []


def _is_closed(entity: Any, points: list[tuple[float, float]]) -> bool:
    """Đa tuyến có khép kín không.

    Cờ `closed` của DXF là cách khai chuẩn, nhưng nhiều bản vẽ khép kín bằng cách cho đỉnh
    cuối trùng đỉnh đầu. Bỏ qua trường hợp thứ hai sẽ đánh rơi phần lớn phòng ở những hồ sơ
    vẽ theo lối cũ.
    """
    # LWPOLYLINE dùng thuộc tính `closed`, POLYLINE dùng `is_closed` — hai lớp entity khác
    # nhau trong ezdxf, hỏi cả hai để không phụ thuộc người vẽ chọn kiểu nào.
    if getattr(entity, "closed", False) or getattr(entity, "is_closed", False):
        return True
    if len(points) >= 3:
        return math.dist(points[0], points[-1]) < 1e-6
    return False


def _text_of(entity: Any) -> str:
    kind = entity.dxftype()
    if kind == "MTEXT":
        return str(entity.plain_text()).strip()
    return str(entity.dxf.text).strip()


def _insert_point_of(entity: Any) -> tuple[float, float] | None:
    for attr in ("insert", "align_point"):
        location = entity.dxf.get(attr, None)
        if location is not None:
            return float(location[0]), float(location[1])
    return None


def _walk(entities: Any, depth: int = 0):
    """Duyệt modelspace VÀ đi vào block (`virtual_entities`), tới ba tầng lồng nhau.

    83–93 % hình học của hồ sơ thật nằm trong block (13-ho-so-thuc-te 13.6 (1)); chỉ duyệt
    modelspace là nhìn thấy một phần sáu bản vẽ mà không có lỗi nào báo.
    """
    for entity in entities:
        yield entity, depth
        if entity.dxftype() == "INSERT" and depth < 3:
            try:
                nested = list(entity.virtual_entities())
            except Exception:  # noqa: BLE001 — block hỏng thì bỏ block đó, không bỏ cả tệp
                nested = []
            yield from _walk(nested, depth + 1)


def _collect(doc: Drawing, mapping: LayerMapping, scale: float) -> _Collector:
    """Quét modelspace kèm block, phân loại entity theo vai trò của lớp."""
    acc = _Collector(scale=scale)

    for entity, depth in _walk(doc.modelspace()):
        layer = str(entity.dxf.get("layer", "0"))
        acc.layers[layer] = None
        kind = entity.dxftype()
        if depth == 0:
            acc.entities_top += 1
        else:
            acc.entities_in_blocks += 1

        # Khung tên: ATTRIB của INSERT — mã tờ, tên tờ, tỷ lệ, ngày đều nằm ở đây, không ở TEXT.
        if kind == "INSERT":
            origin = entity.dxf.get("insert", None)
            for attrib in getattr(entity, "attribs", []) or []:
                text = str(attrib.dxf.get("text", "") or "").strip()
                if not text or origin is None:
                    continue
                acc.attribs.append(
                    (
                        str(attrib.dxf.get("style", "") or ""),
                        str(attrib.dxf.get("tag", "") or ""),
                        text,
                        float(origin[0]),
                        float(origin[1]),
                        str(entity.dxf.get("name", "") or ""),
                    )
                )

        role = mapping.role_of(layer)
        if role is None:
            continue

        if role in ("room_boundary", "site_boundary") and kind in ("LWPOLYLINE", "POLYLINE"):
            points = _points_of(entity)
            if len(points) < 3:
                continue
            if not _is_closed(entity, points):
                acc.warnings.append(
                    ExtractionWarning(
                        "open_polyline",
                        f"đa tuyến trên lớp {layer!r} không khép kín ({len(points)} đỉnh) nên không "
                        f"dựng được ranh phòng. Thường do người vẽ dùng nhiều đoạn rời thay vì một "
                        f"đa tuyến.",
                    )
                )
                continue

            scaled = [(x * scale, y * scale) for x, y in points]
            polygon = Polygon(scaled)
            if not polygon.is_valid:
                # `buffer(0)` là cách chuẩn của shapely để sửa đa giác tự cắt.
                polygon = polygon.buffer(0)
            if polygon.is_empty or polygon.geom_type != "Polygon":
                acc.warnings.append(
                    ExtractionWarning("invalid_polygon", f"đa giác trên lớp {layer!r} tự cắt, không sửa được")
                )
                continue

            if role == "site_boundary":
                acc.site = polygon
            else:
                acc.boundaries.append((layer, polygon))

        elif role == "room_label" and kind in ("TEXT", "MTEXT"):
            text = _text_of(entity)
            location = _insert_point_of(entity)
            if text and location is not None:
                style = str(entity.dxf.get("style", "") or "")
                acc.labels.append((style, text, Point(location[0] * scale, location[1] * scale)))

        elif role == "structural_column":
            if kind in ("LWPOLYLINE", "POLYLINE"):
                points = _points_of(entity)
                if len(points) >= 3:
                    centre = Polygon([(x * scale, y * scale) for x, y in points]).centroid
                    acc.columns.append((round(centre.x, 4), round(centre.y, 4)))
            elif kind in ("CIRCLE", "INSERT"):
                # Hỏi đúng thuộc tính theo loại: ezdxf ném lỗi khi hỏi `center` của INSERT — lộ
                # ra trên hồ sơ thật, nơi cột kết cấu là INSERT chứ không phải CIRCLE.
                location = entity.dxf.get("center" if kind == "CIRCLE" else "insert", None)
                if location is not None:
                    acc.columns.append((round(float(location[0]) * scale, 4), round(float(location[1]) * scale, 4)))

    return acc


def _match_labels(acc: _Collector) -> tuple[list[ExtractedRoom], list[str]]:
    """Ghép mỗi nhãn với đa giác chứa nó; nhãn không nằm trong đa giác nào thì tìm gần nhất.

    Một đa giác chỉ nhận MỘT nhãn: mặt bằng thường có cả tên phòng lẫn số diện tích trên
    cùng một chỗ, và ghép cả hai vào thì bản ghi có hai "tên phòng" mâu thuẫn. Nhãn thừa đi
    vào `unmatched_labels` để người xác nhận nhìn thấy, không bị vứt đi.
    """
    assigned: dict[int, tuple[str, str]] = {}
    leftover: list[str] = []

    # Giải mã TCVN3 theo KIỂU CHỮ, dùng cả nhãn lẫn ATTRIB làm bằng chứng cho kiểu.
    enc = load_text_encoding()
    rows = [(style, text) for style, text, _ in acc.labels] + [(a[0], a[2]) for a in acc.attribs]
    decoded = decode_by_style(rows, enc)
    labels = [(decoded[i], point) for i, (_, _, point) in enumerate(acc.labels)]

    for text, point in labels:
        placed = False
        for index, (_, polygon) in enumerate(acc.boundaries):
            if index in assigned:
                continue
            if polygon.contains(point):
                assigned[index] = (text, "contains")
                placed = True
                break
        if placed:
            continue

        best_index, best_distance = None, LABEL_SEARCH_RADIUS_M
        for index, (_, polygon) in enumerate(acc.boundaries):
            if index in assigned:
                continue
            distance = polygon.distance(point)
            if distance < best_distance:
                best_index, best_distance = index, distance
        if best_index is not None:
            assigned[best_index] = (text, "nearest")
        else:
            leftover.append(text)

    rooms: list[ExtractedRoom] = []
    for index, (layer, polygon) in enumerate(acc.boundaries):
        label, source = assigned.get(index, (None, "none"))
        rooms.append(
            ExtractedRoom(
                polygon_m=tuple((round(x, 4), round(y, 4)) for x, y in polygon.exterior.coords[:-1]),
                area_m2=round(polygon.area, 2),
                layer=layer,
                label_raw=label,
                label_source=source,
            )
        )
    return rooms, leftover


def extract_floor_plan(dxf_path: Path, *, mapping: LayerMapping | None = None) -> ExtractedFloorPlan:
    """Trích một bản vẽ mặt bằng `.dxf` thành đa giác phòng kèm nhãn."""
    dxf_path = Path(dxf_path)
    mapping = mapping if mapping is not None else load_mapping()

    try:
        doc = ezdxf.readfile(dxf_path)
    except (OSError, ezdxf.DXFError) as exc:
        raise ValueError(f"không đọc được tệp DXF {dxf_path.name}: {exc}") from exc

    units, scale, assumed = _resolve_units(doc, mapping)
    acc = _collect(doc, mapping, scale)

    kept: list[tuple[str, Polygon]] = []
    for layer, polygon in acc.boundaries:
        if polygon.area < MIN_ROOM_AREA_M2:
            acc.warnings.append(
                ExtractionWarning(
                    "tiny_polygon",
                    f"bỏ qua đa giác {polygon.area:.2f} m² trên lớp {layer!r} (dưới ngưỡng "
                    f"{MIN_ROOM_AREA_M2} m²). Nếu đây thật sự là phòng thì đơn vị bản vẽ đang bị "
                    f"hiểu sai.",
                )
            )
            continue
        kept.append((layer, polygon))
    acc.boundaries = kept

    rooms, leftover = _match_labels(acc)

    # Danh mục tờ từ ATTRIB khung tên — tất định, theo họ quy ước nhận ra được.
    enc = load_text_encoding()
    attrib_rows = [(a[0], a[2]) for a in acc.attribs]
    attrib_text = decode_by_style(attrib_rows, enc) if attrib_rows else []
    attribs = [
        Attrib(tag=a[1], text=attrib_text[i], x=a[3], y=a[4], block=a[5])
        for i, a in enumerate(acc.attribs)
    ]
    family = detect_family(attribs, load_families())
    sheets = split_sheets(attribs, family, scale=scale) if family else []
    if acc.attribs and not family:
        acc.warnings.append(
            ExtractionWarning(
                "title_block_unknown",
                f"tệp có {len(acc.attribs)} thuộc tính khối nhưng không khớp họ khung tên nào trong "
                "kb/title_block.yaml — chưa tách được tờ. Bổ sung họ mới vào tệp đó.",
            )
        )

    if assumed and rooms:
        acc.warnings.append(
            ExtractionWarning(
                "units_assumed",
                f"bản vẽ không khai $INSUNITS; đã dùng mặc định {units!r} từ bảng ánh xạ. Tổng diện "
                f"tích {sum(r.area_m2 for r in rooms):.1f} m² — nếu con số này vô lý thì đơn vị sai.",
            )
        )
    if not rooms:
        acc.warnings.append(
            ExtractionWarning(
                "no_rooms",
                "không dựng được ranh phòng nào. Kiểm tra `layers_unmapped`: nhiều khả năng lớp chứa "
                "ranh phòng của bản vẽ này chưa có mẫu trong kb/layer_mapping.yaml.",
            )
        )

    layers = list(acc.layers)
    return ExtractedFloorPlan(
        source_file=dxf_path.name,
        units=units,
        units_assumed=assumed,
        rooms=tuple(rooms),
        columns_m=tuple(acc.columns),
        site_boundary_m=(
            tuple((round(x, 4), round(y, 4)) for x, y in acc.site.exterior.coords[:-1]) if acc.site else None
        ),
        unmatched_labels=tuple(leftover),
        layers_seen=tuple(layers),
        layers_unmapped=mapping.unmapped(layers),
        warnings=tuple(acc.warnings),
        sheets=tuple(sheets),
        title_block_family=family.name if family else None,
        entities_top=acc.entities_top,
        entities_in_blocks=acc.entities_in_blocks,
    )


def extract_from_dwg(dwg_path: Path, work_dir: Path, *, mapping: LayerMapping | None = None) -> ExtractedFloorPlan:
    """Trích thẳng từ `.dwg`: chuyển sang DXF rồi đọc.

    Tệp DXF trung gian được giữ lại trong `work_dir` một cách có chủ đích — khi kết quả trích
    trông sai, thứ đầu tiên cần xem là bản chuyển đổi, không phải mã nguồn.
    """
    from design_compute.cad.convert import dwg_to_dxf

    result = dwg_to_dxf(Path(dwg_path), Path(work_dir))
    return extract_floor_plan(result.dxf, mapping=mapping)


# ---------------------------------------------------------------------------
# Chuyển đổi qua lại với hợp đồng `cad-extraction`
# ---------------------------------------------------------------------------

EXTRACTION_SCHEMA_VERSION = "1.0.0"


def to_payload(plan: ExtractedFloorPlan) -> dict[str, Any]:
    """Đổi kết quả trích sang dạng hợp đồng `cad-extraction`.

    Mọi tuple phải thành danh sách: hợp đồng kiểm bằng JSON Schema, mà `jsonschema` không coi
    tuple của Python là kiểu `array`. Dùng tuple trong dataclass để bất biến là đúng, nhưng
    ranh giới runtime nói JSON.
    """
    return {
        "schema_version": EXTRACTION_SCHEMA_VERSION,
        "source_file": plan.source_file,
        "units": plan.units,
        "units_assumed": plan.units_assumed,
        "rooms": [
            {
                "polygon_m": [[float(x), float(y)] for x, y in room.polygon_m],
                "area_m2": room.area_m2,
                "layer": room.layer,
                "label_raw": room.label_raw,
                "label_source": room.label_source,
            }
            for room in plan.rooms
        ],
        "columns_m": [[float(x), float(y)] for x, y in plan.columns_m],
        "site_boundary_m": (
            [[float(x), float(y)] for x, y in plan.site_boundary_m] if plan.site_boundary_m else None
        ),
        "unmatched_labels": list(plan.unmatched_labels),
        "layers_seen": list(plan.layers_seen),
        "layers_unmapped": list(plan.layers_unmapped),
        "warnings": [{"code": w.code, "detail": w.detail} for w in plan.warnings],
        "sheets": sheets_to_payload(list(plan.sheets)),
        "title_block_family": plan.title_block_family,
        "entity_counts": {"modelspace": plan.entities_top, "in_blocks": plan.entities_in_blocks},
    }


def from_payload(payload: dict[str, Any]) -> ExtractedFloorPlan:
    """Dựng lại kết quả trích từ dạng hợp đồng.

    Cần vì Container **không giữ trạng thái**: lắp bản ghi Knowledge Base là một lời gọi
    riêng, nên Worker gửi trả chính kết quả trích mà nó đã nhận. Không có bước này thì
    Container phải nhớ lần trích trước — đúng thứ khiến nó không đổi chỗ triển khai được.
    """
    return ExtractedFloorPlan(
        source_file=payload["source_file"],
        units=payload["units"],
        units_assumed=bool(payload["units_assumed"]),
        rooms=tuple(
            ExtractedRoom(
                polygon_m=tuple((float(p[0]), float(p[1])) for p in room["polygon_m"]),
                area_m2=float(room["area_m2"]),
                layer=room["layer"],
                label_raw=room.get("label_raw"),
                label_source=room.get("label_source", "none"),
            )
            for room in payload["rooms"]
        ),
        columns_m=tuple((float(c[0]), float(c[1])) for c in payload.get("columns_m") or ()),
        site_boundary_m=(
            tuple((float(p[0]), float(p[1])) for p in payload["site_boundary_m"])
            if payload.get("site_boundary_m")
            else None
        ),
        unmatched_labels=tuple(payload.get("unmatched_labels") or ()),
        layers_seen=tuple(payload.get("layers_seen") or ()),
        layers_unmapped=tuple(payload.get("layers_unmapped") or ()),
        warnings=tuple(
            ExtractionWarning(w["code"], w["detail"]) for w in payload.get("warnings") or ()
        ),
        sheets=tuple(
            Sheet(
                code=str(s["code"]),
                name=s.get("name"),
                scale=s.get("scale"),
                discipline=s.get("discipline"),
                date=s.get("date"),
                x_m=float((s.get("origin_m") or [0, 0])[0]),
                y_m=float((s.get("origin_m") or [0, 0])[1]),
            )
            for s in payload.get("sheets") or ()
        ),
        title_block_family=payload.get("title_block_family"),
        entities_top=int((payload.get("entity_counts") or {}).get("modelspace", 0)),
        entities_in_blocks=int((payload.get("entity_counts") or {}).get("in_blocks", 0)),
    )
