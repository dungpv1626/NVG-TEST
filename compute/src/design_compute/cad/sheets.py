"""Tách TỜ trong một modelspace xếp cạnh nhau — theo khung tên, quy ước ở `kb/title_block.yaml`.

Một tệp DXF của NVG là trọn hồ sơ MỘT BỘ MÔN: 22–73 tờ nằm cạnh nhau, không có layout khổ giấy
(`13-ho-so-thuc-te.md` 13.6 (7)). Ở ba trên năm tập, mỗi tờ mang một INSERT khối khung tên với
ATTRIB chứa mã tờ, tên, tỷ lệ, ngày — nên tách tờ là việc TẤT ĐỊNH: mỗi khung tên là một tờ.
Tập không có khối khung tên thì trả về rỗng và nói rõ, không gom cụm đoán mò (đó là bậc 2).

Mã nguồn không viết tên thẻ nào (`KHBV`, `TBV`…): chúng là quy ước của từng thời kỳ và từng
người vẽ, thuộc về dữ liệu.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


def default_title_block_path() -> Path:
    from_env = os.environ.get("NVG_TITLE_BLOCK")
    if from_env:
        return Path(from_env)
    return Path(__file__).resolve().parents[4] / "kb" / "title_block.yaml"


@dataclass(frozen=True, slots=True)
class Attrib:
    tag: str
    text: str
    x: float
    y: float
    block: str


@dataclass(frozen=True, slots=True)
class Sheet:
    code: str
    name: str | None
    scale: str | None
    discipline: str | None
    date: str | None
    x_m: float
    y_m: float


@dataclass(frozen=True, slots=True)
class SheetFamily:
    name: str
    detect_tags: tuple[str, ...]
    field_tags: dict[str, tuple[str, ...]]  # sheet_code → (KHBV,), sheet_name → (TBV, TENBANVE02)


def load_families(path: Path | None = None) -> list[SheetFamily]:
    raw = yaml.safe_load((path or default_title_block_path()).read_text(encoding="utf-8")) or {}
    families: list[SheetFamily] = []
    for name, spec in (raw.get("families") or {}).items():
        mapping = spec.get("map") or {}
        fields: dict[str, tuple[str, ...]] = {}
        for field, tags in mapping.items():
            fields[str(field)] = tuple(str(t) for t in (tags if isinstance(tags, list) else [tags]))
        families.append(
            SheetFamily(
                name=str(name),
                detect_tags=tuple(str(t) for t in (spec.get("detect_tags") or [])),
                field_tags=fields,
            )
        )
    return families


def detect_family(attribs: list[Attrib], families: list[SheetFamily]) -> SheetFamily | None:
    tags = {a.tag for a in attribs}
    for family in families:
        if family.detect_tags and all(t in tags for t in family.detect_tags):
            return family
    return None


def split_sheets(attribs: list[Attrib], family: SheetFamily, *, scale: float) -> list[Sheet]:
    """Mỗi INSERT khung tên (nhận ra bằng thẻ mã tờ) là một tờ; các thẻ còn lại lấy từ cùng
    một INSERT (cùng gốc chèn) — không đoán theo khoảng cách."""
    code_tags = family.field_tags.get("sheet_code", ())
    if not code_tags:
        return []
    by_origin: dict[tuple[float, float, str], dict[str, str]] = {}
    for a in attribs:
        by_origin.setdefault((round(a.x, 3), round(a.y, 3), a.block), {})[a.tag] = a.text

    def pick(fields: dict[str, str], key: str) -> str | None:
        parts = [fields[t] for t in family.field_tags.get(key, ()) if fields.get(t)]
        return " ".join(p.strip() for p in parts) or None

    sheets: list[Sheet] = []
    for (x, y, _block), fields in by_origin.items():
        code = pick(fields, "sheet_code")
        if not code:
            continue
        sheets.append(
            Sheet(
                code=code.strip(),
                name=pick(fields, "sheet_name"),
                scale=pick(fields, "scale"),
                discipline=pick(fields, "discipline"),
                date=pick(fields, "date"),
                x_m=round(x * scale, 3),
                y_m=round(y * scale, 3),
            )
        )
    sheets.sort(key=lambda s: (-s.y_m, s.x_m, s.code))
    return sheets


def sheets_to_payload(sheets: list[Sheet]) -> list[dict[str, Any]]:
    return [
        {
            "code": s.code,
            "name": s.name,
            "scale": s.scale,
            "discipline": s.discipline,
            "date": s.date,
            "origin_m": [s.x_m, s.y_m],
        }
        for s in sheets
    ]
