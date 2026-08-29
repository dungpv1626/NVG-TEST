"""Nạp rule pack, kiểm tra định dạng, và đánh giá vị từ hình học.

Đây là NƠI DUY NHẤT cài đặt vị từ hình học. Phía Worker đọc rule pack để hiển thị cho người
dùng nhưng không bao giờ tự đánh giá quy tắc — hai bản thực thi sẽ lệch nhau.
"""

from design_compute.rules.model import Rule, RulePack, Severity
from design_compute.rules.loader import default_rules_root, load_pack, load_for_locality
from design_compute.rules.validator import ValidationIssue, validate_pack

__all__ = [
    "Rule",
    "RulePack",
    "Severity",
    "default_rules_root",
    "load_pack",
    "load_for_locality",
    "ValidationIssue",
    "validate_pack",
]
