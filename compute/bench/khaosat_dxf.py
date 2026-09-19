"""Khảo sát một tệp DXF hồ sơ thật: kiểm kê lớp, bóc chữ, tách tờ.

Đây là công cụ đã sinh ra mọi con số trong `doc/design/13-ho-so-thuc-te.md`. Giữ lại để đo
lại được — một báo cáo mà không ai kiểm chứng lại được thì chỉ là lời khẳng định.

    docker run --rm -v /duong/dan/ho-so:/in:ro nvg-design-compute \
        python /app/bench/khaosat_dxf.py /in/BAN_VE.dxf

Cố ý KHÔNG dùng `ezdxf`: đọc thẳng ở mức group code nên chạy được trên tệp 40 MB mà không
nạp cả mô hình vào bộ nhớ, và quan trọng hơn — nó cho thấy dữ liệu THẬT SỰ có gì, không đi
qua lớp diễn giải nào. Trình trích xuất chính thì vẫn dùng `ezdxf`.

⚠️ Hồ sơ thật là dữ liệu khách hàng (hạng 1). Công cụ này chỉ ĐỌC và in ra thiết bị đầu cuối;
   đừng ghi kết quả vào repo, và đừng chép hồ sơ vào `kb/samples/`.
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

TEXTY = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}


def _kb(name: str) -> dict:
    for base in (Path("/app/kb"), Path(__file__).resolve().parents[2] / "kb"):
        path = base / name
        if path.is_file():
            return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    raise SystemExit(f"không tìm thấy kb/{name}")


_ENC = _kb("text_encoding.yaml")
_TABLE = {int(k): v for k, v in _ENC["table"].items()}
_MARKERS = set(_ENC["markers"])


def _decode_tcvn3(text: str) -> str:
    """Giải mã một chuỗi TCVN3. Chữ hoa dùng cùng mã byte nên phải suy từ chữ ASCII cùng từ."""
    out = []
    for token in text.split(" "):
        letters = [c for c in token if c.isascii() and c.isalpha()]
        upper = bool(letters) and all(c.isupper() for c in letters)
        conv = "".join(_TABLE.get(ord(c), c) for c in token)
        out.append(conv.upper() if upper else conv)
    return " ".join(out)


def walk(path: Path) -> tuple[list[dict], Counter, Counter]:
    """Duyệt cả BLOCKS lẫn ENTITIES. Bỏ BLOCKS là bỏ 83–93% hình học (13.6)."""
    rows: list[dict] = []
    per_section = Counter()
    per_layer = Counter()
    section = etype = layer = style = tag = None
    px = py = None
    value: list[str] = []

    def flush() -> None:
        nonlocal etype, layer, style, tag, px, py, value
        if etype and layer and section in ("BLOCKS", "ENTITIES"):
            per_section[section] += 1
            per_layer[layer] += 1
        if etype in TEXTY and value:
            rows.append(
                {
                    "section": section,
                    "type": etype,
                    "layer": layer or "",
                    "style": style or "",
                    "tag": tag or "",
                    "text": "".join(value),
                    "x": px,
                    "y": py,
                }
            )
        etype = layer = style = tag = px = py = None
        value = []

    with path.open(encoding="utf-8", errors="replace") as fh:
        while True:
            code = fh.readline()
            if not code:
                break
            raw = fh.readline()
            if not raw:
                break
            code, raw = code.strip(), raw.rstrip("\r\n")
            if code == "0":
                flush()
                if raw in ("SECTION", "ENDSEC"):
                    section = "?" if raw == "SECTION" else None
                etype = raw
            elif code == "2" and section == "?":
                section = raw
            elif etype:
                if code == "8":
                    layer = raw
                elif code == "7" and etype in TEXTY:
                    style = raw
                elif code == "2" and etype in TEXTY:
                    tag = raw
                elif code in ("1", "3") and etype in TEXTY:
                    value.append(raw)
                elif code == "10" and px is None:
                    px = raw
                elif code == "20" and py is None:
                    py = raw
    flush()

    # Suy bảng mã theo KIỂU CHỮ, không theo từng chuỗi: chuỗi ngắn như `CHI TIÕT` không mang
    # ký tự dấu hiệu nào, nhưng kiểu chữ của nó thì có — bằng chứng nằm trong chính tệp đó.
    tcvn3_styles = {r["style"] for r in rows if not _MARKERS.isdisjoint(r["text"])}
    for row in rows:
        if row["style"] in tcvn3_styles or not _MARKERS.isdisjoint(row["text"]):
            row["text"] = _decode_tcvn3(row["text"])
    return rows, per_section, per_layer


def sheets(rows: list[dict]) -> dict[str, list[dict]]:
    """Tách tờ: gán mỗi chuỗi cho khung tên GẦN NHẤT.

    Một tệp DXF của NVG là trọn hồ sơ MỘT BỘ MÔN — 22 tới 73 tờ xếp cạnh nhau trong cùng
    modelspace, không có layout khổ giấy nào. Đây là lời giải cho N-3 (13.10).
    """
    families = _kb("title_block.yaml")["families"]
    placed = [r for r in rows if r["section"] == "ENTITIES" and r["x"] and r["y"]]
    tags = {r["tag"] for r in placed}
    for name, spec in families.items():
        code_tag = spec["map"].get("sheet_code")
        if code_tag and code_tag in tags:
            break
    else:
        return {}

    anchors = [(float(r["x"]), float(r["y"]), r["text"]) for r in placed if r["tag"] == code_tag]
    if not anchors:
        return {}
    buckets: dict[str, list[dict]] = defaultdict(list)
    for row in placed:
        x, y = float(row["x"]), float(row["y"])
        code = min(anchors, key=lambda a: (a[0] - x) ** 2 + (a[1] - y) ** 2)[2]
        buckets[code].append(row)
    print(f"  họ quy ước khung tên: {name} (thẻ mã tờ: {code_tag})")
    return buckets


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    for arg in argv[1:]:
        path = Path(arg)
        rows, per_section, per_layer = walk(path)
        print(f"\n{'=' * 78}\n{path.name}\n{'=' * 78}")
        print(f"thực thể: BLOCKS {per_section['BLOCKS']} · ENTITIES {per_section['ENTITIES']}")
        total = sum(per_section.values()) or 1
        print(f"tỉ lệ nằm trong block: {per_section['BLOCKS'] * 100 // total}%")
        print(f"lớp có thực thể: {len(per_layer)}")
        for layer, count in per_layer.most_common(15):
            print(f"  {count:8d}  {layer}")
        buckets = sheets(rows)
        print(f"tờ tách được: {len(buckets)}")
        for code in sorted(buckets)[:60]:
            print(f"  {code}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
