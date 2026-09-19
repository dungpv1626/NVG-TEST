"""Giải mã chữ TCVN3 trong bản vẽ cũ — bảng ở `kb/text_encoding.yaml`, không viết vào mã.

Hồ sơ NVG cũ dùng phông `.Vn*` (TCVN3, 8-bit): `cÊp l¹nh` là "cấp lạnh". Cùng một tệp có cả
chuỗi Unicode (ATTRIB) lẫn TCVN3 (TEXT), nên phải quyết theo TỪNG KIỂU CHỮ: một chuỗi ngắn như
`CHI TIÕT` không mang ký tự dấu hiệu nào, nhưng kiểu chữ của nó thì có — bằng chứng nằm trong
chính tệp đó (`13-ho-so-thuc-te.md` 13.6 (8), `13.15`).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml


def default_encoding_path() -> Path:
    from_env = os.environ.get("NVG_TEXT_ENCODING")
    if from_env:
        return Path(from_env)
    return Path(__file__).resolve().parents[4] / "kb" / "text_encoding.yaml"


@dataclass(frozen=True, slots=True)
class TextEncoding:
    table: dict[int, str]
    markers: frozenset[str]

    def looks_tcvn3(self, text: str) -> bool:
        return not self.markers.isdisjoint(text)

    def decode(self, text: str) -> str:
        """Chữ hoa TCVN3 dùng cùng mã byte với chữ thường, nên suy từ chữ ASCII cùng từ."""
        out = []
        for token in text.split(" "):
            letters = [c for c in token if c.isascii() and c.isalpha()]
            upper = bool(letters) and all(c.isupper() for c in letters)
            conv = "".join(self.table.get(ord(c), c) for c in token)
            out.append(conv.upper() if upper else conv)
        return " ".join(out)


_cache: TextEncoding | None = None


def load_text_encoding(path: Path | None = None) -> TextEncoding:
    global _cache
    if path is None and _cache is not None:
        return _cache
    target = path or default_encoding_path()
    raw = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
    enc = TextEncoding(
        table={int(k): str(v) for k, v in (raw.get("table") or {}).items()},
        markers=frozenset(str(raw.get("markers", ""))),
    )
    if path is None:
        _cache = enc
    return enc


def decode_by_style(rows: list[tuple[str, str]], enc: TextEncoding) -> list[str]:
    """Giải mã danh sách (kiểu chữ, chuỗi): kiểu nào có ≥ 1 chuỗi mang dấu hiệu thì giải cả kiểu."""
    tcvn3_styles = {style for style, text in rows if enc.looks_tcvn3(text)}
    return [
        enc.decode(text) if style in tcvn3_styles or enc.looks_tcvn3(text) else text
        for style, text in rows
    ]
