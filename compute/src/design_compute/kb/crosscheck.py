"""Kiểm tra chéo tự động giữa các phần đã trích, và chấm `quality_score`.

Bước 2 của pipeline số hoá (`doc/design/06-knowledge-base.md` mục 6.1). Mục đích không phải
chấm điểm cho đẹp báo cáo, mà là **loại phần lớn hồ sơ kém TRƯỚC KHI chúng làm hỏng kết quả
truy hồi** — một bản ghi sai đưa vào few-shot dạy mô hình ngôn ngữ sinh sai.

Điều quan trọng nhất về cách chấm ở đây: **phép kiểm không chạy được thì KHÔNG tính là đạt.**
Tài liệu liệt kê bốn phép đối chiếu, trong đó ba phép cần bản vẽ mặt cắt và bảng thống kê —
những thứ trình trích xuất hiện chưa đọc. Nếu bỏ qua chúng rồi vẫn cho điểm tuyệt đối thì
`quality_score` nói dối: nó báo "đã kiểm kỹ" trong khi thực ra mới kiểm hai thứ dễ nhất. Nên
phép kiểm bỏ qua được ghi rõ và **kéo điểm xuống một mức có trần**, chứ không biến mất.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Sequence

from shapely.geometry import Polygon

Outcome = Literal["pass", "fail", "skipped"]

# Trọng số của mỗi phép kiểm khi trượt. Tổng không cần bằng 1: điểm được kẹp về [0, 1].
_WEIGHTS: dict[str, float] = {
    "rooms_present": 0.40,
    "no_overlap": 0.25,
    "inside_site": 0.15,
    "columns_inside_footprint": 0.10,
    "levels_consistent": 0.10,
    "labels_normalised": 0.15,
    "units_declared": 0.10,
    "slicing_tree": 0.20,
}

# Trần điểm khi còn phép kiểm chưa chạy được. Một hồ sơ chỉ qua được các phép kiểm dễ thì
# không thể đạt hạng cao nhất — đó là điều `quality_score` phải nói ra.
_SKIPPED_PENALTY = 0.08


@dataclass(frozen=True, slots=True)
class CrossCheck:
    """Một phép đối chiếu và kết quả của nó."""

    code: str
    outcome: Outcome
    detail: str

    @property
    def failed(self) -> bool:
        return self.outcome == "fail"


def _polygons(rooms: Sequence[Any]) -> list[Polygon]:
    return [Polygon(getattr(r, "polygon_m", r)) for r in rooms]


def check_floor_plan(plan: Any, *, slicing_tree: Any = None) -> list[CrossCheck]:
    """Đối chiếu trong phạm vi MỘT bản vẽ mặt bằng."""
    checks: list[CrossCheck] = []
    rooms = list(plan.rooms)

    if rooms:
        checks.append(CrossCheck("rooms_present", "pass", f"{len(rooms)} phòng"))
    else:
        checks.append(
            CrossCheck("rooms_present", "fail", "không dựng được phòng nào — bản ghi không dùng được")
        )
        return checks

    polygons = _polygons(rooms)

    # Phòng chồng lên nhau nghĩa là ranh phòng bị vẽ trùng hoặc trích nhầm cả đường bao ngoài
    # lẫn từng phòng. Dùng giao có diện tích đáng kể, không dùng `intersects`: hai phòng cạnh
    # nhau luôn chạm nhau ở cạnh chung.
    overlaps: list[str] = []
    for i in range(len(polygons)):
        for j in range(i + 1, len(polygons)):
            shared = polygons[i].intersection(polygons[j]).area
            smaller = min(polygons[i].area, polygons[j].area)
            if smaller > 0 and shared / smaller > 0.05:
                overlaps.append(f"{i}↔{j} ({shared:.1f} m²)")
    checks.append(
        CrossCheck("no_overlap", "pass", "không có phòng chồng lấn")
        if not overlaps
        else CrossCheck("no_overlap", "fail", "phòng chồng lấn: " + ", ".join(overlaps))
    )

    if plan.site_boundary_m:
        site = Polygon(plan.site_boundary_m)
        outside = [i for i, p in enumerate(polygons) if p.difference(site).area > 0.5]
        checks.append(
            CrossCheck("inside_site", "pass", "mọi phòng nằm trong ranh đất")
            if not outside
            else CrossCheck("inside_site", "fail", f"phòng nằm ngoài ranh đất: {outside}")
        )
    else:
        checks.append(CrossCheck("inside_site", "skipped", "bản vẽ không có lớp ranh đất"))

    if plan.columns_m:
        from shapely.geometry import Point
        from shapely.ops import unary_union

        # Cột nằm trên tường nên thường ở MÉP phòng chứ không trong lòng phòng. Nới footprint
        # ra 0,5 m trước khi kiểm — nếu không thì mọi bản vẽ có cột đều trượt.
        footprint = unary_union(polygons).buffer(0.5)
        stray = [i for i, c in enumerate(plan.columns_m) if not footprint.contains(Point(c))]
        checks.append(
            CrossCheck("columns_inside_footprint", "pass", f"{len(plan.columns_m)} cột nằm trong mặt bằng")
            if not stray
            else CrossCheck(
                "columns_inside_footprint",
                "fail",
                f"cột nằm ngoài mặt bằng: {stray} — thường do trích nhầm ký hiệu hoặc lớp cột "
                f"chứa cả khung tên bản vẽ",
            )
        )
    else:
        checks.append(CrossCheck("columns_inside_footprint", "skipped", "chưa trích được lưới cột"))

    labelled = sum(1 for r in rooms if getattr(r, "label_raw", None))
    checks.append(
        CrossCheck("labels_normalised", "pass", f"{labelled}/{len(rooms)} phòng có nhãn")
        if labelled == len(rooms)
        else CrossCheck(
            "labels_normalised",
            "fail",
            f"chỉ {labelled}/{len(rooms)} phòng có nhãn — phần còn lại phải nhập tay",
        )
    )

    checks.append(
        CrossCheck("units_declared", "pass", f"đơn vị {plan.units} đọc từ bản vẽ")
        if not plan.units_assumed
        else CrossCheck(
            "units_declared",
            "fail",
            f"bản vẽ không khai đơn vị; đã giả định {plan.units}. Diện tích có thể sai theo bội số 1000",
        )
    )

    checks.append(
        CrossCheck("slicing_tree", "pass", "dựng được cây chia không gian")
        if slicing_tree is not None
        else CrossCheck(
            "slicing_tree",
            "fail",
            "mặt bằng không thuộc lớp slicing — bản ghi vẫn dùng cho thống kê nhưng KHÔNG dùng "
            "làm few-shot cho Layer 3a",
        )
    )

    return checks


def check_across_levels(plans: Sequence[Any]) -> list[CrossCheck]:
    """Đối chiếu GIỮA các tầng của cùng một công trình."""
    if len(plans) < 2:
        return [CrossCheck("levels_consistent", "skipped", "chỉ có một tầng, không có gì để đối chiếu")]

    areas = [sum(r.area_m2 for r in p.rooms) for p in plans]
    ground = areas[0]
    if ground <= 0:
        return [CrossCheck("levels_consistent", "fail", "tầng trệt không có diện tích")]

    # Tầng trên rộng hơn tầng trệt đáng kể là dấu hiệu trích sai (thường do bắt nhầm cả đường
    # bao lô đất), chứ không phải kiến trúc — nhà phố không có tầng đua ra 30%.
    worst = max(areas[1:], key=lambda a: a / ground)
    if worst / ground > 1.3:
        return [
            CrossCheck(
                "levels_consistent",
                "fail",
                f"một tầng trên rộng {worst / ground:.0%} so với tầng trệt ({worst:.1f} m² / "
                f"{ground:.1f} m²) — nhiều khả năng trích nhầm ranh lô đất thành phòng",
            )
        ]
    return [CrossCheck("levels_consistent", "pass", f"{len(plans)} tầng, diện tích nhất quán")]


def quality_score(checks: Sequence[CrossCheck]) -> float:
    """Điểm chất lượng trong khoảng 0–1, suy từ các phép kiểm — không phải người chấm.

    Phép kiểm chưa chạy được cũng kéo điểm xuống: xem ghi chú ở đầu tệp.
    """
    score = 1.0
    for check in checks:
        if check.outcome == "fail":
            score -= _WEIGHTS.get(check.code, 0.1)
        elif check.outcome == "skipped":
            score -= _SKIPPED_PENALTY
    return round(min(max(score, 0.0), 1.0), 2)


def blocking_failures(checks: Sequence[CrossCheck]) -> list[CrossCheck]:
    """Những thất bại khiến bản ghi không dùng được, chứ không chỉ kém chất lượng."""
    return [c for c in checks if c.failed and c.code in ("rooms_present", "no_overlap")]
