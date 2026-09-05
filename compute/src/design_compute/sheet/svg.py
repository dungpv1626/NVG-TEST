"""`SheetModel` → SVG. Trình duyệt chỉ HIỂN THỊ tệp này, không dựng thêm gì (bất biến #5).

Tô màu công năng là việc của CSS phía trình duyệt: mỗi đa giác phòng mang `class="phong"` và
`data-group`, còn tệp SVG này không chọn màu — cùng bản vẽ, hai chế độ, một định nghĩa hình học.
"""

from __future__ import annotations

import math
from xml.sax.saxutils import escape

from design_compute.sheet.model import (
    LINE_WEIGHTS_MM,
    Arc,
    Circle,
    Dimension,
    Line,
    Polyline,
    SheetModel,
    Text,
    TitleBlockRef,
    DIM_TICK_MM,
    DIM_TEXT_MM,
    SMALL_TEXT_MM,
    TEXT_MM,
)

FONT = "'Be Vietnam Pro', 'Inter', Arial, sans-serif"
INK = "#172B4D"
POCHE = "#44546F"


def _n(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _dash(sheet: SheetModel, linetype: str) -> str:
    if linetype == "dashed":
        return f' stroke-dasharray="{_n(sheet.paper(3))} {_n(sheet.paper(1.5))}"'
    if linetype == "dashdot":
        return f' stroke-dasharray="{_n(sheet.paper(8))} {_n(sheet.paper(1.5))} {_n(sheet.paper(1))} {_n(sheet.paper(1.5))}"'
    return ""


def render_svg(sheet: SheetModel) -> str:
    fx, fy = sheet.frame_origin
    fw, fh = sheet.frame_size
    # Trục y của bản vẽ hướng lên, của SVG hướng xuống: lật một lần ở nhóm gốc; chữ lật lại
    # từng cái để không bị ngược.
    out: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_n(fx)} {_n(-fy - fh)} {_n(fw)} {_n(fh)}" '
        f'width="100%" data-scale="1:{sheet.scale}" font-family="{FONT}" fill="none" '
        f'stroke="{INK}" stroke-linecap="round" stroke-linejoin="round">',
        f'<rect x="{_n(fx)}" y="{_n(-fy - fh)}" width="{_n(fw)}" height="{_n(fh)}" fill="#FFFFFF" stroke="none"/>',
        '<g transform="scale(1,-1)">',
    ]
    w = {k: sheet.paper(v) for k, v in LINE_WEIGHTS_MM.items()}

    for e in sheet.entities:
        if isinstance(e, Line):
            out.append(
                f'<line x1="{_n(e.a[0])}" y1="{_n(e.a[1])}" x2="{_n(e.b[0])}" y2="{_n(e.b[1])}" '
                f'stroke-width="{_n(w[e.weight])}"{_dash(sheet, e.linetype)} data-layer="{escape(e.layer)}"/>'
            )
        elif isinstance(e, Polyline):
            pts = " ".join(f"{_n(x)},{_n(y)}" for x, y in e.points)
            attrs = "".join(f' data-{k}="{escape(v)}"' for k, v in e.data)
            fill = "none"
            if e.fill == "ink":
                fill = INK
            elif e.fill == "poche":
                fill = POCHE
            stroke = "none" if e.no_stroke else INK
            cls = ' class="phong"' if any(k == "room" for k, _ in e.data) else ""
            tag = "polygon" if e.closed else "polyline"
            out.append(
                f'<{tag}{cls} points="{pts}" fill="{fill}" stroke="{stroke}" '
                f'stroke-width="{_n(w[e.weight])}"{_dash(sheet, e.linetype)} data-layer="{escape(e.layer)}"{attrs}/>'
            )
        elif isinstance(e, Arc):
            a0, a1 = math.radians(e.start_deg), math.radians(e.end_deg)
            sweep = (e.end_deg - e.start_deg) % 360
            large = 1 if sweep > 180 else 0
            x0, y0 = e.center[0] + e.radius * math.cos(a0), e.center[1] + e.radius * math.sin(a0)
            x1, y1 = e.center[0] + e.radius * math.cos(a1), e.center[1] + e.radius * math.sin(a1)
            out.append(
                f'<path d="M {_n(x0)} {_n(y0)} A {_n(e.radius)} {_n(e.radius)} 0 {large} 1 {_n(x1)} {_n(y1)}" '
                f'stroke-width="{_n(w[e.weight])}" data-layer="{escape(e.layer)}"/>'
            )
        elif isinstance(e, Circle):
            out.append(
                f'<circle cx="{_n(e.center[0])}" cy="{_n(e.center[1])}" r="{_n(e.radius)}" '
                f'stroke-width="{_n(w[e.weight])}" data-layer="{escape(e.layer)}"/>'
            )
        elif isinstance(e, Text):
            out.append(_text(e.at, e.text, e.height, e.anchor, e.rotation_deg, e.bold, e.layer))
        elif isinstance(e, Dimension):
            out.extend(_dimension(sheet, e, w["thin"]))
        elif isinstance(e, TitleBlockRef):
            out.extend(_title_block(sheet, e, w))

    out.append("</g></svg>")
    return "\n".join(out)


def _text(at, text, height, anchor, rotation, bold, layer, colour=INK) -> str:
    x, y = at
    weight = ' font-weight="600"' if bold else ""
    rot = f" rotate({_n(-rotation)})" if rotation else ""
    return (
        f'<text transform="translate({_n(x)},{_n(y)}) scale(1,-1){rot}" font-size="{_n(height)}" '
        f'text-anchor="{anchor}" dominant-baseline="middle" fill="{colour}" stroke="none"{weight} '
        f'data-layer="{escape(layer)}">{escape(text)}</text>'
    )


def _dimension(sheet: SheetModel, d: Dimension, sw: float) -> list[str]:
    """Đường gióng, đường ghi, gạch chéo 45° hai đầu (kiểu kiến trúc), chữ nằm trên đường ghi."""
    tick = sheet.paper(DIM_TICK_MM)
    h = sheet.paper(DIM_TEXT_MM)
    gap = sheet.paper(0.6)
    parts: list[str] = []
    if d.orientation == "horizontal":
        y = d.line_at
        (x1, y1), (x2, y2) = d.p1, d.p2
        for x, yy in ((x1, y1), (x2, y2)):
            ext_from = yy + gap if y > yy else yy - gap
            ext_to = y + gap * 2 if y > yy else y - gap * 2
            parts.append(f'<line x1="{_n(x)}" y1="{_n(ext_from)}" x2="{_n(x)}" y2="{_n(ext_to)}" stroke-width="{_n(sw)}"/>')
        parts.append(f'<line x1="{_n(x1)}" y1="{_n(y)}" x2="{_n(x2)}" y2="{_n(y)}" stroke-width="{_n(sw)}"/>')
        for x in (x1, x2):
            parts.append(f'<line x1="{_n(x - tick)}" y1="{_n(y - tick)}" x2="{_n(x + tick)}" y2="{_n(y + tick)}" stroke-width="{_n(sw * 2)}"/>')
        parts.append(_text(((x1 + x2) / 2, y + h * 0.8), d.text, h, "middle", 0.0, False, d.layer))
    else:
        x = d.line_at
        (x1, y1), (x2, y2) = d.p1, d.p2
        for xx, yv in ((x1, y1), (x2, y2)):
            ext_from = xx + gap if x > xx else xx - gap
            ext_to = x + gap * 2 if x > xx else x - gap * 2
            parts.append(f'<line x1="{_n(ext_from)}" y1="{_n(yv)}" x2="{_n(ext_to)}" y2="{_n(yv)}" stroke-width="{_n(sw)}"/>')
        parts.append(f'<line x1="{_n(x)}" y1="{_n(y1)}" x2="{_n(x)}" y2="{_n(y2)}" stroke-width="{_n(sw)}"/>')
        for yv in (y1, y2):
            parts.append(f'<line x1="{_n(x - tick)}" y1="{_n(yv - tick)}" x2="{_n(x + tick)}" y2="{_n(yv + tick)}" stroke-width="{_n(sw * 2)}"/>')
        parts.append(_text((x - h * 0.8, (y1 + y2) / 2), d.text, h, "middle", 90.0, False, d.layer))
    return [p.replace("/>", f' data-layer="{escape(d.layer)}"/>', 1) if "data-layer" not in p else p for p in parts]


def _title_block(sheet: SheetModel, t: TitleBlockRef, w: dict[str, float]) -> list[str]:
    x, y = t.origin
    h = sheet.paper(TEXT_MM)
    hs = sheet.paper(SMALL_TEXT_MM)
    parts = [
        f'<rect x="{_n(x)}" y="{_n(y)}" width="{_n(t.width)}" height="{_n(t.height)}" stroke-width="{_n(w["heavy"])}" data-layer="{escape(t.layer)}"/>'
    ]
    attribs = dict(t.attribs)
    statics = dict(t.statics)
    # Ba cột: đơn vị + cảnh báo · công trình · tờ.
    c1, c2 = x + t.width * 0.34, x + t.width * 0.70
    for cx in (c1, c2):
        parts.append(f'<line x1="{_n(cx)}" y1="{_n(y)}" x2="{_n(cx)}" y2="{_n(y + t.height)}" stroke-width="{_n(w["medium"])}"/>')
    pad = sheet.paper(3.0)
    row = sheet.paper(7.0)
    top = y + t.height - pad - hs

    def col(x0: float, lines: list[tuple[str, str, bool]]) -> None:
        yy = top
        for label, value, bold in lines:
            if not value and not label:
                continue
            text = f"{label}: {value}" if label else value
            parts.append(_text((x0 + pad, yy), text, hs if not bold else h, "start", 0.0, bold, t.layer))
            yy -= row

    col(x, [("", statics.get("company", ""), True), ("", statics.get("stage", ""), False), ("", statics.get("grid", ""), False), ("", statics.get("rules", ""), False)])
    col(c1, [("Công trình", attribs.get("CT", ""), True), ("Mã hồ sơ", attribs.get("MHS", ""), False), ("Hạng mục", attribs.get("HM", ""), False), ("Hoàn thành", attribs.get("HT", ""), False)])
    col(c2, [("Tên bản vẽ", attribs.get("TBV", ""), True), ("Ký hiệu", attribs.get("KHBV", ""), False), ("Tỷ lệ", attribs.get("TL", ""), False), ("Phiên bản", attribs.get("PB", ""), False)])
    return parts
