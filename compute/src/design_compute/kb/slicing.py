"""Suy ngược cây chia không gian (slicing tree) từ hình học đã trích.

`slicing_tree` là trường quan trọng nhất của bản ghi Knowledge Base
(`doc/design/06-knowledge-base.md` mục 6.2). Lý do: mặt bằng tham chiếu được đưa vào prompt
của Layer 3a làm few-shot, và **few-shot phải đúng định dạng mà mô hình ngôn ngữ cần sinh
ra**. Đưa toạ độ vào rồi mong nó sinh ra cây là dạy sai.

Cách làm: đệ quy tìm một đường cắt ngang hoặc dọc chia mặt bằng thành hai phần **mà không
cắt qua phòng nào**. Không tồn tại đường cắt như vậy nghĩa là mặt bằng không thuộc lớp
slicing — khi đó trả `None`, và nơi gọi phải hạ `quality_score`. Bản ghi đó vẫn dùng được
cho thống kê nhưng không dùng làm few-shot.

**Lá của cây mang CHỈ SỐ phòng, không mang tên phòng.** Trích xuất trong Container giữ nhãn
nguyên văn ("PN2", "P.NGỦ 2"); việc quy về `bedroom` thuộc lớp mô hình ngôn ngữ ở Worker
(mục 6.1, CLAUDE.md 8.3). Nên mô-đun này giải phần HÌNH HỌC, còn `to_layout_node()` ghép
phần TỪ VỰNG vào sau — hai việc tách rời, kiểm thử được riêng.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal, Sequence, Union

# Sai số khi so cạnh phòng. Bản vẽ thật có bề dày tường, và người vẽ hiếm khi cho hai phòng
# dùng chung đúng một đường. Quá chặt thì gần như mọi mặt bằng đều "không thuộc lớp slicing";
# quá lỏng thì hai phòng lệch hẳn nhau vẫn bị coi là thẳng hàng.
DEFAULT_TOLERANCE_M = 0.25

# Cùng ràng buộc với `room_type` trong hợp đồng — kiểm ở đây để lỗi lộ ra ngay tại chỗ sinh,
# thay vì tới lúc validate cả bản ghi mới biết lá nào sai.
ROOM_TYPE_PATTERN = re.compile(r"^[a-z0-9_]+$")

Axis = Literal["H", "V"]


class SlicingError(ValueError):
    """Không dựng được nút hợp lệ theo hợp đồng."""


@dataclass(frozen=True, slots=True)
class SliceLeaf:
    """Một phòng, trỏ bằng chỉ số trong danh sách phòng đã trích."""

    room_index: int


@dataclass(frozen=True, slots=True)
class SliceSplit:
    """Một lát cắt.

    `axis` theo đúng quy ước của hợp đồng và của bộ giải: gốc toạ độ ở góc trước-trái, `y`
    đi vào sâu. Nên `H` (cắt ngang) tách TRƯỚC khỏi SAU, nhánh `a` ở phía mặt tiền; `V`
    (cắt dọc) tách TRÁI khỏi PHẢI, nhánh `a` ở bên trái.
    """

    axis: Axis
    ratio: float
    a: "SliceNode"
    b: "SliceNode"


SliceNode = Union[SliceLeaf, SliceSplit]

_Box = tuple[float, float, float, float]  # (min_x, min_y, max_x, max_y)


def _boxes_of(rooms: Sequence[Any]) -> list[_Box]:
    """Hộp bao của mỗi phòng.

    Nhận cả `ExtractedRoom` lẫn danh sách đỉnh trần, để mô-đun này không buộc phải phụ thuộc
    ngược vào lớp trích xuất khi dùng lại ở chỗ khác.
    """
    boxes: list[_Box] = []
    for room in rooms:
        points = getattr(room, "polygon_m", room)
        xs = [float(p[0]) for p in points]
        ys = [float(p[1]) for p in points]
        if len(xs) < 3:
            raise SlicingError("mỗi phòng cần ít nhất 3 đỉnh để có hộp bao")
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes


def _extent(boxes: list[_Box], indices: Sequence[int], axis: Axis) -> tuple[float, float]:
    """Khoảng chiếm chỗ của một nhóm phòng theo trục của lát cắt."""
    lo_i, hi_i = (1, 3) if axis == "H" else (0, 2)
    return (
        min(boxes[i][lo_i] for i in indices),
        max(boxes[i][hi_i] for i in indices),
    )


def _try_cut(
    boxes: list[_Box], indices: Sequence[int], axis: Axis, cut: float, tol: float
) -> tuple[list[int], list[int]] | None:
    """Chia nhóm phòng bằng một đường cắt; `None` nếu có phòng bị cắt qua hoặc một bên rỗng."""
    lo_i, hi_i = (1, 3) if axis == "H" else (0, 2)
    near: list[int] = []
    far: list[int] = []

    for i in indices:
        lo, hi = boxes[i][lo_i], boxes[i][hi_i]
        if hi <= cut + tol:
            near.append(i)
        elif lo >= cut - tol:
            far.append(i)
        else:
            return None  # phòng nằm vắt qua đường cắt

    if not near or not far:
        return None
    return near, far


def _best_cut(boxes: list[_Box], indices: Sequence[int], tol: float) -> tuple[Axis, list[int], list[int], float] | None:
    """Đường cắt hợp lệ cân đối nhất.

    Nhiều đường cắt cùng hợp lệ thì cây dựng ra khác nhau nhưng tương đương về hình học. Chọn
    đường gần giữa nhất chỉ để kết quả TẤT ĐỊNH và cây không lệch hẳn về một phía — đây là
    quy tắc phá hoà, không mang ý nghĩa kiến trúc nào.
    """
    best: tuple[Axis, list[int], list[int], float] | None = None
    best_imbalance = float("inf")

    for axis in ("H", "V"):
        lo_i, hi_i = (1, 3) if axis == "H" else (0, 2)
        span_lo, span_hi = _extent(boxes, indices, axis)  # type: ignore[arg-type]
        span = span_hi - span_lo
        if span <= 0:
            continue

        # Ứng viên là các cạnh phòng: đường cắt không cắt qua phòng nào thì phải trùng một cạnh.
        candidates = sorted({boxes[i][hi_i] for i in indices} | {boxes[i][lo_i] for i in indices})
        for cut in candidates:
            parts = _try_cut(boxes, indices, axis, cut, tol)  # type: ignore[arg-type]
            if parts is None:
                continue
            near, far = parts
            near_hi = max(boxes[i][hi_i] for i in near)
            ratio = (near_hi - span_lo) / span
            imbalance = abs(ratio - 0.5)
            if imbalance < best_imbalance - 1e-9:
                best_imbalance = imbalance
                best = (axis, near, far, ratio)  # type: ignore[arg-type]

    return best


def _build(boxes: list[_Box], indices: Sequence[int], tol: float) -> SliceNode | None:
    if len(indices) == 1:
        return SliceLeaf(indices[0])

    cut = _best_cut(boxes, indices, tol)
    if cut is None:
        return None

    axis, near, far, ratio = cut
    a = _build(boxes, near, tol)
    b = _build(boxes, far, tol)
    if a is None or b is None:
        return None

    # Hợp đồng đòi `ratio_hint` nằm HẲN trong khoảng (0, 1). Làm tròn có thể đẩy ra biên khi
    # một bên rất mỏng, nên kẹp lại — thà gợi ý hơi lệch còn hơn sinh ra artifact không hợp lệ.
    return SliceSplit(axis=axis, ratio=min(max(round(ratio, 3), 0.001), 0.999), a=a, b=b)


def infer_slicing_tree(rooms: Sequence[Any], *, tolerance_m: float = DEFAULT_TOLERANCE_M) -> SliceNode | None:
    """Dựng cây chia không gian từ các phòng đã trích.

    Trả `None` khi mặt bằng không thuộc lớp slicing — nơi gọi phải hạ `quality_score` và
    không dùng bản ghi làm few-shot.
    """
    if not rooms:
        return None
    boxes = _boxes_of(rooms)
    return _build(boxes, list(range(len(boxes))), tolerance_m)


def leaf_order(node: SliceNode) -> list[int]:
    """Chỉ số phòng theo thứ tự duyệt cây — từ mặt tiền vào sâu, từ trái sang phải.

    Cùng quy ước với `_flatten_rooms` của bộ giải: nhánh `a` luôn ở phía trước/bên trái, nên
    thứ tự duyệt CHÍNH LÀ thứ tự hình học, không cần đọc lại toạ độ.
    """
    if isinstance(node, SliceLeaf):
        return [node.room_index]
    return leaf_order(node.a) + leaf_order(node.b)


def to_layout_node(node: SliceNode, room_types: Sequence[str | None]) -> dict[str, Any]:
    """Đổi cây sang `layout_node` của hợp đồng, ghép tên phòng ĐÃ chuẩn hoá vào lá.

    Tách khỏi `infer_slicing_tree` có chủ đích: hình học giải trong Container, từ vựng chuẩn
    hoá ở Worker. Lá chưa có tên thì báo lỗi thay vì bịa một mã phòng — một few-shot mang mã
    phòng sai còn tệ hơn không có few-shot.
    """
    if isinstance(node, SliceLeaf):
        try:
            name = room_types[node.room_index]
        except IndexError as exc:
            raise SlicingError(f"không có tên cho phòng chỉ số {node.room_index}") from exc
        if not name:
            raise SlicingError(
                f"phòng chỉ số {node.room_index} chưa chuẩn hoá được nhãn. Cây chia không gian chỉ "
                f"dùng làm few-shot khi MỌI lá có mã phòng hợp lệ."
            )
        if not ROOM_TYPE_PATTERN.match(name):
            raise SlicingError(
                f"mã phòng {name!r} không khớp {ROOM_TYPE_PATTERN.pattern} — hợp đồng chỉ nhận chữ "
                f"thường, số và gạch dưới."
            )
        return {"room": name}

    return {
        "split": node.axis,
        "ratio_hint": node.ratio,
        "a": to_layout_node(node.a, room_types),
        "b": to_layout_node(node.b, room_types),
    }
