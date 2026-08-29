"""Kiểm tra định dạng và tính nhất quán của rule pack.

Phép kiểm quan trọng nhất là ranh giới giữa QUY ĐỊNH PHÁP LÝ và KINH NGHIỆM NVG
(xem `doc/design/07-rule-pack.md` mục 7.2):

- quy tắc dẫn nguồn "kinh nghiệm NVG" mà đặt mức `error` thì bị TỪ CHỐI NẠP — nó sẽ chặn phát
  hành vì một thứ không bắt buộc theo luật, và kiến trúc sư sẽ bỏ dùng hệ thống;
- quy tắc dẫn văn bản quy phạm pháp luật mà chỉ cảnh báo thì bị NÊU LÊN — nó âm thầm từ bỏ
  đúng phần kiểm soát pháp lý mà hệ thống sinh ra để làm.

Không tách hai loại này thì hệ thống hoặc quá cứng, hoặc quá lỏng. Đây không phải chi tiết
trang trí — nó quyết định hệ thống có được dùng hay không.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from design_compute.rules.model import (
    VALID_AUTO_REPAIRS,
    VALID_BUILDING_TYPES,
    VALID_PREDICATES,
    VALID_SCOPES,
    Rule,
    RulePack,
    Severity,
)

IssueLevel = Literal["error", "warning"]


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    """Một vấn đề tìm được khi kiểm tra rule pack."""

    level: IssueLevel
    rule_id: str
    message: str

    def __str__(self) -> str:
        return f"[{self.level}] {self.rule_id}: {self.message}"


def validate_rule(rule: Rule) -> list[ValidationIssue]:
    """Kiểm một quy tắc. Trả về danh sách vấn đề; rỗng nghĩa là quy tắc không có vấn đề gì."""
    issues: list[ValidationIssue] = []

    def err(msg: str) -> None:
        issues.append(ValidationIssue("error", rule.id, msg))

    def warn(msg: str) -> None:
        issues.append(ValidationIssue("warning", rule.id, msg))

    # --- Ranh giới pháp lý / kinh nghiệm ----------------------------------------------
    if rule.severity is Severity.ERROR and rule.is_experience:
        err(
            "mức 'error' đòi nguồn là văn bản quy phạm pháp luật, nhưng quy tắc này dẫn "
            "kinh nghiệm NVG. Chặn phát hành vì một quy tắc không bắt buộc sẽ khiến kiến "
            "trúc sư bỏ dùng hệ thống. Dùng mức 'warning'."
        )
    if rule.severity is Severity.WARNING and rule.is_legal:
        warn(
            f"dẫn văn bản quy phạm pháp luật ({rule.source!r}) nhưng chỉ cảnh báo. Một yêu "
            "cầu bắt buộc mà không chặn phát hành là từ bỏ phần kiểm soát pháp lý."
        )
    if not rule.is_legal and not rule.is_experience:
        warn(
            f"nguồn {rule.source!r} không khớp tiền tố văn bản quy phạm pháp luật nào, cũng "
            "không đúng chuỗi 'kinh nghiệm NVG'. Không phân loại được, nên thẻ ràng buộc "
            "không nói được cho kiến trúc sư biết quy tắc này có chặn phát hành hay không."
        )

    # --- Kiểm tra cấu trúc --------------------------------------------------------------
    if rule.predicate not in VALID_PREDICATES:
        err(
            f"vị từ {rule.predicate!r} không tồn tại. Vị từ được cài đặt trong mã nguồn; thêm "
            "một vị từ mới là thay đổi mã nguồn. Kiểm tra xem một vị từ sẵn có có diễn đạt "
            "được ràng buộc này không, trước đã."
        )
    if rule.scope not in VALID_SCOPES:
        err(f"phạm vi {rule.scope!r} không hợp lệ, phải là một trong {sorted(VALID_SCOPES)}")
    if rule.auto_repair not in VALID_AUTO_REPAIRS:
        err(f"hướng nới lỏng auto_repair {rule.auto_repair!r} không hợp lệ")
    if not rule.applies_to:
        err("applies_to rỗng; quy tắc không áp cho loại hình nào là quy tắc chết")
    for bt in rule.applies_to:
        if bt not in VALID_BUILDING_TYPES:
            err(
                f"applies_to chứa {bt!r}, không phải loại hình trong phạm vi module "
                f"(hợp lệ: {sorted(VALID_BUILDING_TYPES)})"
            )

    return issues


def validate_pack(pack: RulePack) -> list[ValidationIssue]:
    """Kiểm cả pack, gồm cả các phép kiểm bắc qua nhiều quy tắc."""
    issues: list[ValidationIssue] = []

    seen: dict[str, int] = {}
    for rule in pack.rules:
        issues.extend(validate_rule(rule))
        seen[rule.id] = seen.get(rule.id, 0) + 1

    for rule_id, count in seen.items():
        if count > 1:
            issues.append(
                ValidationIssue(
                    "error",
                    rule_id,
                    f"khai {count} lần trong cùng một pack; mã quy tắc phải duy nhất vì "
                    "pack địa phương ghi đè pack nền THEO MÃ",
                )
            )

    return issues


def blocking_issues(issues: list[ValidationIssue]) -> list[ValidationIssue]:
    """Những vấn đề buộc phải chặn việc nạp pack."""
    return [i for i in issues if i.level == "error"]
