"""Kiểm tra dữ liệu ở ranh giới, đối chiếu thẳng JSON Schema gốc.

`contracts/*.schema.json` là nguồn gốc duy nhất (doc/design/03-data-contracts.md). Phía
TypeScript sinh zod từ đó; phía Python KHÔNG sinh mã mà nạp thẳng chính tệp JSON đó và
validate bằng `jsonschema`.

Vì sao khác tài liệu (tài liệu đề xuất `datamodel-code-generator` sinh Pydantic): bản sinh
ra là bản SAO, mà bản sao thì cần một bước kiểm tra để không lệch. Đọc thẳng nguồn gốc thì
không có gì để lệch, và bớt một công cụ phải cài trong ảnh Docker. Đổi lại mất gợi ý kiểu
tĩnh — chấp nhận được vì bộ giải đã có mô hình nội bộ riêng (`solver/model.py`).

"Cả Worker và Container đều validate ở ranh giới. Không bên nào tin bên kia."
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


class ContractError(ValueError):
    """Dữ liệu không đúng hợp đồng. KHÔNG đáng thử lại — gọi lại sẽ nhận cùng loại sai."""

    def __init__(self, name: str, errors: list[str]) -> None:
        self.contract = name
        self.errors = errors
        super().__init__(f'Dữ liệu không đúng hợp đồng "{name}": ' + "; ".join(errors[:5]))


def default_contracts_root() -> Path:
    """Thư mục `contracts/`.

    Trong ảnh Docker, `NVG_CONTRACTS_ROOT=/app/contracts`. Khi chạy từ mã nguồn thì lần ngược
    lên gốc repo — cùng cách `rules/loader.py` đã làm, để không có hai quy ước tìm đường dẫn.
    """
    env = os.environ.get("NVG_CONTRACTS_ROOT")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[3] / "contracts"


@lru_cache(maxsize=None)
def _validator(name: str) -> Draft202012Validator:
    path = default_contracts_root() / f"{name}.schema.json"
    if not path.is_file():
        raise FileNotFoundError(f"Không tìm thấy hợp đồng dữ liệu: {path}")
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate(name: str, payload: Any) -> Any:
    """Kiểm tra payload theo hợp đồng, trả lại chính payload để dùng nối chuỗi.

    `name` là tên tệp không đuôi: `design-brief`, `layout-intent`, `floor-plan`…
    """
    errors = sorted(_validator(name).iter_errors(payload), key=lambda e: list(e.path))
    if errors:
        raise ContractError(
            name,
            [f"{'.'.join(str(p) for p in e.path) or '(gốc)'} — {e.message}" for e in errors],
        )
    return payload


def available_contracts() -> list[str]:
    """Tên mọi hợp đồng tìm thấy — dùng cho kiểm tra sống và cho kiểm thử."""
    root = default_contracts_root()
    return sorted(p.name[: -len(".schema.json")] for p in root.glob("*.schema.json"))
