"""Mô hình dữ liệu của rule pack.

Quy tắc kiến trúc là DỮ LIỆU, không phải mã nguồn. Không chỗ nào trong tệp này hard-code một
ngưỡng quy chuẩn — mọi con số đến từ các tệp YAML dưới `rules/`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal

BuildingType = Literal["nha_pho", "biet_thu", "nha_vuon"]

# Loại hình công trình mà rule pack được phép nhắm tới. `nha_xuong` cố ý KHÔNG có: nhà xưởng
# công nghiệp nằm ngoài phạm vi module này.
VALID_BUILDING_TYPES: frozenset[str] = frozenset({"nha_pho", "biet_thu", "nha_vuon"})

VALID_SCOPES: frozenset[str] = frozenset({"site", "building", "floor"})

# Vị từ được cài đặt trong MÃ NGUỒN; quy tắc chỉ tham chiếu tên và tham số.
# Thêm một vị từ mới là thay đổi mã nguồn. Thêm một quy tắc mới thì không.
VALID_PREDICATES: frozenset[str] = frozenset(
    {
        "min_area",
        "max_area",
        "min_dimension",
        "aspect_ratio_max",
        "requires_daylight",
        "requires_access",
        # Phòng phải tiếp giáp một MẶT cụ thể của hình bao (`face: access | open`). Khác
        # `requires_daylight` ở chỗ nó không nhận giếng trời thay thế — chỗ để xe lấy sáng
        # qua giếng trời vẫn là chỗ để xe mà ô tô không vào được.
        "requires_face",
        "adjacency",
        "floor_preference",
        # Cầu thang không nằm thẳng trục cửa chính (16/09/2026). CHỈ nhánh AI đo
        # (`ai/rule-warnings.ts`); bộ giải không có vị từ này nên bỏ qua, nhưng vẫn phải nhận tên
        # để đọc được `rules/nvg-experience.yaml`.
        "stair_faces_entry",
        "aligned_across_floors",
        "setback",
        "max_density",
        "module_multiple",
    }
)

VALID_AUTO_REPAIRS: frozenset[str] = frozenset(
    {"shrink_adjacent", "move_to_floor", "remove", "none"}
)

# Tiền tố nhận diện nguồn là văn bản quy phạm pháp luật. CHỈ quy tắc dẫn một trong các văn
# bản này mới được đặt mức `error` (mức chặn phát hành). Xem `rules/README.md`.
LEGAL_SOURCE_PREFIXES: tuple[str, ...] = (
    "QCVN",
    "TCVN",
    "Luật",
    "Nghị định",
    "Thông tư",
    "Quyết định",
)

# Chuỗi chính xác dùng cho quy tắc đến từ kinh nghiệm thực tế của NVG chứ không từ một văn
# bản đã ban hành. Quy tắc loại này chỉ được CẢNH BÁO, không bao giờ được chặn.
EXPERIENCE_SOURCE = "kinh nghiệm NVG"

# Chuỗi chính xác cho ràng buộc BỐ CỤC của bộ giải — thang, hộp kỹ thuật thẳng hàng; phòng nào
# cũng có lối vào. Không phải văn bản pháp quy, nhưng được đặt mức `error`: vi phạm là ra một
# ngôi nhà không dùng được. Thêm 13/09/2026 khi gói quy chuẩn `rules/base/` bị gỡ khỏi bộ giải
# (Haan: «bỏ quy chuẩn VN đi») và ba ràng buộc này chuyển sang `rules/structure/`.
STRUCTURE_SOURCE = "nguyên lý bố cục"


class Severity(str, Enum):
    """Bộ giải xử lý một quy tắc bị vi phạm như thế nào."""

    ERROR = "error"
    """Ràng buộc cứng. Vi phạm làm mô hình vô nghiệm và sinh ra `InfeasibilityReport`.
    Chặn phát hành hồ sơ."""

    WARNING = "warning"
    """Trọng số trong hàm mục tiêu. Vi phạm được ghi vào `constraint_report.violations`
    nhưng bộ giải vẫn trả về một nghiệm."""


@dataclass(frozen=True, slots=True)
class Rule:
    """Một quy tắc kiến trúc, nạp nguyên văn từ YAML."""

    id: str
    applies_to: tuple[str, ...]
    scope: str
    predicate: str
    severity: Severity
    source: str
    auto_repair: str = "none"
    # Tham số riêng của từng vị từ: target, value_m, value_m2, a, b, kind, side…
    params: dict[str, Any] = field(default_factory=dict)

    @property
    def is_legal(self) -> bool:
        """Đúng khi quy tắc dẫn một văn bản quy phạm pháp luật."""
        return self.source.startswith(LEGAL_SOURCE_PREFIXES)

    @property
    def is_experience(self) -> bool:
        """Đúng khi quy tắc đến từ kinh nghiệm NVG chứ không từ văn bản đã ban hành."""
        return self.source.strip() == EXPERIENCE_SOURCE

    @property
    def is_structural(self) -> bool:
        """Đúng khi quy tắc là ràng buộc bố cục của bộ giải (`rules/structure/`)."""
        return self.source.strip() == STRUCTURE_SOURCE

    def applies_to_type(self, building_type: str) -> bool:
        return building_type in self.applies_to


@dataclass(frozen=True, slots=True)
class RulePack:
    """Một tập quy tắc có phiên bản, có thể giới hạn theo một địa phương."""

    id: str
    version: str
    rules: tuple[Rule, ...]
    locality: str | None = None
    extends: str | None = None
    description: str = ""

    def by_id(self) -> dict[str, Rule]:
        return {r.id: r for r in self.rules}

    def for_building_type(self, building_type: str) -> tuple[Rule, ...]:
        return tuple(r for r in self.rules if r.applies_to_type(building_type))

    def errors(self) -> tuple[Rule, ...]:
        return tuple(r for r in self.rules if r.severity is Severity.ERROR)

    def warnings(self) -> tuple[Rule, ...]:
        return tuple(r for r in self.rules if r.severity is Severity.WARNING)
