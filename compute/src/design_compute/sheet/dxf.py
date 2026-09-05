"""`SheetModel` → DXF bằng ezdxf. Kích thước là thực thể DIMENSION thật, khung tên là BLOCK có ATTRIB.

Vì sao DIMENSION thật chứ không phải vài đoạn LINE và một TEXT: người vẽ của NVG kéo tường
là kích thước đổi theo; hơn 10.000 DIMENSION trong hồ sơ thật (`13-ho-so-thuc-te.md` 13.6 (5))
là thứ họ nhìn vào để đánh giá bản vẽ có "thật" không. Và chính `extract.py` đọc DIMENSION như
kích thước CHỦ Ý — ground truth tốt hơn hình học đo lại.

Khung tên theo họ `semantic_kt` của `kb/title_block.yaml` (thẻ KHBV, TBV, TL, HM, HT): tệp
engine xuất ra được trình trích xuất đọc lại thành một tờ có mã — sinh và đọc cùng một quy ước.
"""

from __future__ import annotations

import io

import ezdxf
from ezdxf.document import Drawing
from ezdxf.enums import TextEntityAlignment

# Chỉ nhập để CHÚ KIỂU. Nhập lúc chạy là kéo `design_compute.cad/__init__` vào, mà gói đó lại
# nhập `cad.export` → `sheet` → vòng lặp, và service chết ngay lúc khởi động (đã xảy ra 06/09).
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from design_compute.cad.layers import LayerMapping
from design_compute.sheet.model import (
    DIM_TEXT_MM,
    DIM_TICK_MM,
    LINE_WEIGHTS_MM,
    SMALL_TEXT_MM,
    TEXT_MM,
    Arc,
    Circle,
    Dimension,
    Line,
    Polyline,
    SheetModel,
    Text,
    TitleBlockRef,
)

TITLE_BLOCK_NAME = "NVG_KHUNG_TEN"
DIMSTYLE = "NVG"
LINETYPES = {"solid": "CONTINUOUS", "dashed": "DASHED", "dashdot": "CENTER"}
# Màu ACI dùng cho poché tường trong AutoCAD (xám 8) — trên màn hình SVG tự chọn.
POCHE_ACI = 8


def _ensure_layer(doc: Drawing, mapping: LayerMapping, name: str) -> str:
    if name not in doc.layers:
        colour = 7
        for spec in mapping.export.values():
            if spec.layer == name:
                colour = spec.color
        doc.layers.add(name=name, color=colour)
    return name


def _lw(weight: str) -> int:
    # ezdxf tính bề rộng nét theo 1/100 mm.
    return int(round(LINE_WEIGHTS_MM[weight] * 100))


def render_dxf(sheet: SheetModel, mapping: LayerMapping) -> bytes:
    doc = ezdxf.new(dxfversion="R2010", setup=True)
    doc.header["$INSUNITS"] = 4  # milimét
    doc.header["$LWDISPLAY"] = 1
    doc.header["$LTSCALE"] = float(sheet.scale)
    _dimstyle(doc, sheet)
    msp = doc.modelspace()

    for e in sheet.entities:
        if isinstance(e, Line):
            layer = _ensure_layer(doc, mapping, e.layer)
            msp.add_line(
                e.a, e.b, dxfattribs={"layer": layer, "lineweight": _lw(e.weight), "linetype": LINETYPES[e.linetype]}
            )
        elif isinstance(e, Polyline):
            layer = _ensure_layer(doc, mapping, e.layer)
            if e.fill:
                hatch = msp.add_hatch(color=POCHE_ACI if e.fill == "poche" else 7, dxfattribs={"layer": layer})
                hatch.paths.add_polyline_path(list(e.points), is_closed=True)
            if not e.no_stroke:
                msp.add_lwpolyline(
                    list(e.points),
                    close=e.closed,
                    dxfattribs={"layer": layer, "lineweight": _lw(e.weight), "linetype": LINETYPES[e.linetype]},
                )
            elif e.data:
                # Đa giác phòng: vẫn ghi ra (nét mảnh, lớp riêng) để đọc ngược được diện tích phòng.
                msp.add_lwpolyline(list(e.points), close=True, dxfattribs={"layer": layer, "lineweight": _lw("thin")})
        elif isinstance(e, Arc):
            layer = _ensure_layer(doc, mapping, e.layer)
            msp.add_arc(e.center, e.radius, e.start_deg, e.end_deg, dxfattribs={"layer": layer, "lineweight": _lw(e.weight)})
        elif isinstance(e, Circle):
            layer = _ensure_layer(doc, mapping, e.layer)
            msp.add_circle(e.center, e.radius, dxfattribs={"layer": layer, "lineweight": _lw(e.weight)})
        elif isinstance(e, Text):
            layer = _ensure_layer(doc, mapping, e.layer)
            _text(msp, e.text, e.at, e.height, layer, e.anchor, e.rotation_deg)
        elif isinstance(e, Dimension):
            layer = _ensure_layer(doc, mapping, e.layer)
            _dimension(msp, e, layer)
        elif isinstance(e, TitleBlockRef):
            layer = _ensure_layer(doc, mapping, e.layer)
            _title_block(doc, msp, sheet, e, layer)

    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode("utf-8")


def _text(msp, content: str, at, height: float, layer: str, anchor: str, rotation: float):
    align = {
        "middle": TextEntityAlignment.MIDDLE_CENTER,
        "start": TextEntityAlignment.MIDDLE_LEFT,
        "end": TextEntityAlignment.MIDDLE_RIGHT,
    }[anchor]
    entity = msp.add_text(content, dxfattribs={"layer": layer, "height": height, "rotation": rotation})
    entity.set_placement(at, align=align)
    return entity


def _dimstyle(doc: Drawing, sheet: SheetModel) -> None:
    """Kiểu kích thước kiến trúc: gạch chéo hai đầu, chữ trên đường ghi, đơn vị mm không lẻ."""
    style = doc.dimstyles.new(DIMSTYLE)
    style.dxf.dimscale = float(sheet.scale)
    style.dxf.dimtxt = DIM_TEXT_MM
    style.dxf.dimasz = DIM_TICK_MM
    style.dxf.dimexe = 1.25
    style.dxf.dimexo = 0.6
    style.dxf.dimgap = 0.6
    style.dxf.dimtad = 1  # chữ trên đường ghi
    style.dxf.dimtih = 0
    style.dxf.dimtoh = 0
    style.dxf.dimdec = 0
    style.dxf.dimzin = 8
    style.dxf.dimblk = "ARCHTICK"
    style.dxf.dimtsz = 0


def _dimension(msp, d: Dimension, layer: str) -> None:
    if d.orientation == "horizontal":
        base = (d.p1[0], d.line_at)
        angle = 0.0
    else:
        base = (d.line_at, d.p1[1])
        angle = 90.0
    dim = msp.add_linear_dim(base=base, p1=d.p1, p2=d.p2, angle=angle, dimstyle=DIMSTYLE, dxfattribs={"layer": layer})
    # Dựng hình học (block ẩn) để mọi trình xem, kể cả không phải AutoCAD, hiện được.
    dim.render()


def _title_block(doc: Drawing, msp, sheet: SheetModel, t: TitleBlockRef, layer: str) -> None:
    """BLOCK có ATTDEF; mỗi tờ là một INSERT mang ATTRIB — đọc lại được bằng chính `extract.py`."""
    h = sheet.paper(TEXT_MM)
    hs = sheet.paper(SMALL_TEXT_MM)
    pad = sheet.paper(3.0)
    row = sheet.paper(7.0)
    name = TITLE_BLOCK_NAME
    if name not in doc.blocks:
        block = doc.blocks.new(name=name)
        block.add_lwpolyline([(0, 0), (t.width, 0), (t.width, t.height), (0, t.height)], close=True, dxfattribs={"layer": layer, "lineweight": _lw("heavy")})
        c1, c2 = t.width * 0.34, t.width * 0.70
        for cx in (c1, c2):
            block.add_line((cx, 0), (cx, t.height), dxfattribs={"layer": layer})
        top = t.height - pad - hs
        statics = dict(t.statics)
        for i, key in enumerate(("company", "stage", "grid", "rules")):
            value = statics.get(key, "")
            if value:
                block.add_text(value, dxfattribs={"layer": layer, "height": h if i == 0 else hs}).set_placement((pad, top - i * row), align=TextEntityAlignment.MIDDLE_LEFT)
        columns = (
            (c1, (("Công trình", "CT"), ("Mã hồ sơ", "MHS"), ("Hạng mục", "HM"), ("Hoàn thành", "HT"))),
            (c2, (("Tên bản vẽ", "TBV"), ("Ký hiệu", "KHBV"), ("Tỷ lệ", "TL"), ("Phiên bản", "PB"))),
        )
        label_w = sheet.paper(22.0)
        for x0, rows in columns:
            for i, (label, tag) in enumerate(rows):
                y = top - i * row
                block.add_text(label, dxfattribs={"layer": layer, "height": hs}).set_placement((x0 + pad, y), align=TextEntityAlignment.MIDDLE_LEFT)
                block.add_attdef(tag, (x0 + pad + label_w, y), dxfattribs={"layer": layer, "height": hs, "prompt": label})
    insert = msp.add_blockref(name, t.origin, dxfattribs={"layer": layer})
    insert.add_auto_attribs(dict(t.attribs))
