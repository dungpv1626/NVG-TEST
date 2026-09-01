"""Cây chia không gian: đọc, kiểm và tìm phần thẳng hàng giữa các tầng.

Tách khỏi `model.py` vì đây là suy luận về CẤU TRÚC, không dùng tới CP-SAT. Nhờ vậy phần khó
nhất của mô hình — quyết định đường cắt nào dùng chung giữa các tầng — kiểm thử được mà không
phải giải một mô hình nào.

Đường đi trong cây (`path`) là chuỗi các chữ `a`/`b` tính từ gốc. Gốc là chuỗi rỗng.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator, Literal

Axis = Literal["H", "V"]

# Nhánh `a` nằm phía TRƯỚC (y nhỏ) với lát cắt ngang, phía TRÁI (x nhỏ) với lát cắt dọc.
# Quy ước này đến từ hợp đồng dữ liệu: gốc toạ độ ở góc trước-trái, x sang phải, y vào sâu.
BRANCHES: tuple[str, str] = ("a", "b")


class LayoutTreeError(ValueError):
    """Cây bố cục sai cấu trúc. Sinh lại phương án, đừng vá."""


@dataclass(frozen=True, slots=True)
class Leaf:
    """Một lá của cây: một phòng, hoặc một khoảng rỗng (giếng trời, sân trong, thông tầng)."""

    path: str
    kind: Literal["room", "void"]
    ref: str
    """Mã phòng với lá `room`; loại khoảng rỗng (`lightwell`…) với lá `void`."""


def walk(node: dict[str, Any], path: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    """Duyệt mọi nút của cây kèm đường đi tới nó."""
    yield path, node
    if "split" in node:
        for branch in BRANCHES:
            yield from walk(node[branch], path + branch)


def leaves(node: dict[str, Any], path: str = "") -> list[Leaf]:
    """Các lá theo thứ tự duyệt trước, kèm đường đi."""
    found: list[Leaf] = []
    for leaf_path, leaf in walk(node, path):
        if "room" in leaf:
            found.append(Leaf(leaf_path, "room", str(leaf["room"])))
        elif "void" in leaf:
            found.append(Leaf(leaf_path, "void", str(leaf["void"])))
    return found


def check_shape(node: dict[str, Any]) -> None:
    """Bắt cây lai giữa ba dạng nút trước khi nó đi vào mô hình.

    Hợp đồng đã cấm điều này bằng `oneOf`, nhưng bộ giải cũng kiểm: Container không tin
    Worker và ngược lại (02-architecture 2.2).
    """
    for path, item in walk(node):
        kinds = [k for k in ("split", "room", "void") if k in item]
        if len(kinds) != 1:
            where = path or "gốc"
            raise LayoutTreeError(
                f"Nút {where} của cây bố cục phải là đúng một trong ba dạng "
                f"split/room/void, đang có {kinds or 'không dạng nào'}."
            )
        if kinds[0] == "split":
            if item["split"] not in ("H", "V"):
                raise LayoutTreeError(f'Lát cắt {item["split"]!r} không hợp lệ, chỉ có "H" hoặc "V".')
            for branch in BRANCHES:
                if branch not in item:
                    raise LayoutTreeError(f"Nút {path or 'gốc'} thiếu nhánh {branch!r}.")


def touches_root_face(path: str, tree_by_path: dict[str, dict[str, Any]]) -> frozenset[str]:
    """Bốn mặt của hình bao mà một lá CHẮC CHẮN tiếp giáp, suy từ cấu trúc cây.

    Đây là tính chất của cây chia đệ quy chứ không phải kết quả đo trên nghiệm: một lá chạm
    mặt trước khi và chỉ khi trên đường đi từ gốc xuống, mọi lát cắt NGANG đều rẽ nhánh `a`.
    Lát cắt dọc không ảnh hưởng tới mặt trước và mặt sau, và ngược lại.

    Suy từ cấu trúc chứ không đo trên toạ độ vì toạ độ là biến — cần biết điều này TRƯỚC khi
    giải, để đặt được ràng buộc chiếu sáng tự nhiên.
    """
    faces = {"front", "back", "left", "right"}
    for depth, branch in enumerate(path):
        parent = tree_by_path[path[:depth]]
        axis = parent["split"]
        if axis == "H":
            faces.discard("back" if branch == "a" else "front")
        else:
            faces.discard("right" if branch == "a" else "left")
    return frozenset(faces)


def structurally_adjacent(
    path_a: str, path_b: str, tree_by_path: dict[str, dict[str, Any]]
) -> bool:
    """Hai lá CHẮC CHẮN chung một đoạn biên, suy từ cấu trúc cây — không cần biết toạ độ.

    Điều kiện đủ, không phải điều kiện cần: trả `False` nghĩa là "không chứng minh được", chứ
    không phải "chắc chắn không kề nhau". Lớp gọi khi đó mới phải dựng biến ràng buộc để bộ
    giải tự quyết — và đó là phần đắt, nên chứng minh được trước thì rẻ hơn hẳn.

    Ba điều kiện, xét tại nút tổ tiên chung gần nhất (đường cắt ngăn hai lá):
      1. Lá bên nhánh `a` phải nằm sát đường cắt: mọi lát cắt CÙNG PHƯƠNG bên dưới nó đều rẽ
         `b`. Ngược lại cho lá bên nhánh `b`.
      2. Ít nhất một trong hai lá trải HẾT bề ngang của ô tổ tiên theo phương vuông góc — tức
         bên dưới nó không có lát cắt vuông góc nào. Khi đó phần chồng lấn chắc chắn dương.
    """
    if path_a == path_b:
        return False
    shared = 0
    while shared < min(len(path_a), len(path_b)) and path_a[shared] == path_b[shared]:
        shared += 1
    if shared == len(path_a) or shared == len(path_b):
        # Một lá là tổ tiên của lá kia — không thể xảy ra giữa hai lá thật.
        return False

    lca = path_a[:shared]
    axis = tree_by_path[lca]["split"]
    perpendicular = "V" if axis == "H" else "H"

    def hugs(path: str, want: str) -> bool:
        for depth in range(shared + 1, len(path)):
            if tree_by_path[path[:depth]]["split"] == axis and path[depth] != want:
                return False
        return True

    def spans_full(path: str) -> bool:
        for depth in range(shared + 1, len(path)):
            if tree_by_path[path[:depth]]["split"] == perpendicular:
                return False
        return True

    a_side_is_a = path_a[shared] == "a"
    if not hugs(path_a, "b" if a_side_is_a else "a"):
        return False
    if not hugs(path_b, "a" if a_side_is_a else "b"):
        return False
    return spans_full(path_a) or spans_full(path_b)


def aligned_cuts(trees: dict[int, dict[str, Any]]) -> dict[str, Axis]:
    """Những đường cắt dùng chung được giữa các tầng — tuyến tường chịu lực của ngôi nhà.

    Một đường cắt dùng chung được khi và chỉ khi mọi tầng CÓ CẮT tại đúng vị trí đó trong cây
    đều cắt theo cùng một phương, và toàn bộ tổ tiên của nó cũng vậy. Điều kiện tổ tiên là thứ
    làm cho việc dùng chung có nghĩa hình học: nếu cha đã lệch thì hai ô mang cùng đường đi ở
    hai tầng không còn là cùng một ô nữa.

    Đây là bản tổng quát của ba đường cắt dùng chung ở mô hình Mốc 0.2. Khác biệt: chỗ nào các
    tầng chia giống nhau thì tự động thẳng hàng, chỗ nào chia khác nhau thì tách ra — không
    phải ép mọi tầng vào cùng ba dải.
    """
    shared: dict[str, Axis] = {}
    nodes_at: dict[str, list[dict[str, Any]]] = {"": [t for t in trees.values()]}
    frontier = [""]

    while frontier:
        path = frontier.pop()
        splits = [n for n in nodes_at[path] if "split" in n]
        if not splits:
            continue
        axes = {n["split"] for n in splits}
        if len(axes) != 1:
            # Các tầng chia theo phương khác nhau tại đây. Không có tường chung, và mọi thứ
            # bên dưới cũng không còn là cùng một ô — dừng nhánh này.
            continue
        axis: Axis = axes.pop()  # type: ignore[assignment]
        shared[path] = axis
        for branch in BRANCHES:
            child = path + branch
            nodes_at[child] = [n[branch] for n in splits]
            frontier.append(child)

    return shared
