"""Nạp rule pack từ YAML.

Pack địa phương GHI ĐÈ pack nền theo `rule_id`. Quy tắc không có trong pack địa phương thì
lấy từ pack nền. Đây chính là cơ chế cho phép NVG thi công ở nhiều tỉnh có khoảng lùi và mật
độ xây dựng khác nhau mà không phải sửa mã nguồn.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from design_compute.rules.model import Rule, RulePack, Severity
from design_compute.rules.validator import blocking_issues, validate_pack

# Khoá do chính lớp `Rule` tiêu thụ; mọi khoá còn lại trở thành tham số của vị từ.
_STRUCTURAL_KEYS = frozenset({"id", "applies_to", "scope", "predicate", "severity", "source", "auto_repair"})


class RulePackError(RuntimeError):
    """Ném ra khi không nạp được pack, hoặc pack không qua được trình kiểm tra."""


def default_rules_root() -> Path:
    """Rule pack nằm ở đâu.

    Trong container, ảnh Docker chép `rules/` sang `/app/rules` và đặt `NVG_RULES_ROOT`. Ngoài
    container thì lần ngược từ chính tệp này lên gốc repo. KHÔNG bao giờ đoán theo thư mục làm
    việc của tiến trình gọi — cách đó âm thầm cho ra kết quả khác nhau tuỳ chỗ khởi động.
    """
    from_env = os.environ.get("NVG_RULES_ROOT")
    if from_env:
        return Path(from_env)
    # loader.py -> rules/ -> design_compute/ -> src/ -> compute/ -> gốc repo
    return Path(__file__).resolve().parents[4] / "rules"


def _parse_rule(raw: dict[str, Any], origin: Path) -> Rule:
    try:
        rule_id = raw["id"]
        applies_to = tuple(raw["applies_to"])
        scope = raw["scope"]
        predicate = raw["predicate"]
        severity = Severity(raw["severity"])
        source = raw["source"]
    except (KeyError, ValueError) as exc:
        raise RulePackError(f"{origin}: quy tắc sai định dạng {raw!r}: {exc}") from exc

    params = {k: v for k, v in raw.items() if k not in _STRUCTURAL_KEYS}
    return Rule(
        id=rule_id,
        applies_to=applies_to,
        scope=scope,
        predicate=predicate,
        severity=severity,
        source=source,
        auto_repair=raw.get("auto_repair", "none"),
        params=params,
    )


def load_pack(directory: Path, *, strict: bool = True) -> RulePack:
    """Nạp mọi tệp `*.yaml` trong thư mục thành một pack.

    `00-meta.yaml` khai danh tính của pack; các tệp còn lại chứa quy tắc. Tệp được đọc theo
    thứ tự sắp xếp để kết quả tất định.
    """
    directory = Path(directory)
    if not directory.is_dir():
        raise RulePackError(f"không tìm thấy thư mục rule pack: {directory}")

    meta: dict[str, Any] = {}
    rules: list[Rule] = []

    for path in sorted(directory.glob("*.yaml")):
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
        if loaded is None:
            continue
        if isinstance(loaded, dict) and "pack" in loaded:
            meta = loaded["pack"]
            continue
        if not isinstance(loaded, list):
            raise RulePackError(
                f"{path}: cần một danh sách quy tắc hoặc một mục `pack:`, "
                f"nhận được {type(loaded).__name__}"
            )
        rules.extend(_parse_rule(raw, path) for raw in loaded)

    if not meta:
        raise RulePackError(f"{directory}: thiếu 00-meta.yaml có khoá `pack:`")

    pack = RulePack(
        id=meta["id"],
        version=meta["version"],
        rules=tuple(rules),
        locality=meta.get("locality"),
        extends=meta.get("extends"),
        description=meta.get("description", ""),
    )

    issues = validate_pack(pack)
    blocking = blocking_issues(issues)
    if blocking and strict:
        detail = "\n".join(f"  {i}" for i in blocking)
        raise RulePackError(f"rule pack {pack.id!r} bị từ chối:\n{detail}")

    return pack


def merge(base: RulePack, override: RulePack) -> RulePack:
    """Đặt pack địa phương chồng lên pack nền.

    Quy tắc có ở cả hai thì lấy bản của pack địa phương; quy tắc chỉ có ở pack nền thì giữ
    nguyên. Thứ tự được bảo toàn: quy tắc bị ghi đè giữ đúng vị trí cũ, quy tắc mới nối vào cuối.
    """
    override_by_id = override.by_id()
    merged: list[Rule] = [override_by_id.get(r.id, r) for r in base.rules]

    base_ids = {r.id for r in base.rules}
    merged.extend(r for r in override.rules if r.id not in base_ids)

    return RulePack(
        id=f"{base.id}+{override.id}",
        version=f"{base.version}+{override.version}",
        rules=tuple(merged),
        locality=override.locality,
        extends=base.id,
        description=override.description or base.description,
    )


def load_for_locality(rules_root: Path, locality: str | None) -> RulePack:
    """Nạp pack đang có hiệu lực cho một địa phương: pack nền, rồi pack địa phương ghi đè.

    `locality` lấy từ `DesignBrief.locality`. `None` thì chỉ nạp pack nền.

    **Tỉnh chưa có gói riêng thì lùi về gói nền, KHÔNG ném lỗi.** Trước 29/08/2026 hàm này
    ném `RulePackError`, và điều đó đúng khi đầu bài chỉ cho chọn một tỉnh duy nhất. Từ khi
    biểu mẫu mở ra đủ 34 đơn vị hành chính, ném lỗi nghĩa là: người dùng chọn "Hải Phòng",
    Lớp 2 chạy bình thường (Worker vốn đã lùi về gói nền), rồi Lớp 3b đổ ở bước giải ràng
    buộc — hai lớp đọc cùng một rule pack mà kết luận khác nhau về chính sự tồn tại của nó.

    Gói nền đã mang đủ khoảng lùi và mật độ theo QCVN 01:2021/BXD nên bản lùi về vẫn đúng
    quy chuẩn quốc gia; `pack.locality is None` là cách gọi lại kết quả đó.
    """
    rules_root = Path(rules_root)
    base = load_pack(rules_root / "base")

    if locality is None:
        return base

    # Tên thư mục dùng gạch nối; giá trị trong đầu bài dùng gạch dưới (hung_yen -> hung-yen).
    locality_dir = rules_root / "locality" / locality.replace("_", "-")
    if not locality_dir.is_dir():
        return base

    return merge(base, load_pack(locality_dir))
