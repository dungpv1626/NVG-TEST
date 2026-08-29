"""Lắp bản ghi Knowledge Base từ các bản vẽ đã trích.

Đây là chỗ hội tụ của Bước 1 (trích xuất), Bước 2 (kiểm tra chéo) và phần suy ngược cây chia
không gian. Kết quả được **validate theo `contracts/kb-record.schema.json` trước khi trả về**:
bản ghi đi từ Container sang Worker nên nó là dữ liệu vượt ranh giới runtime, và ranh giới nào
cũng phải có hợp đồng (nguyên tắc bất biến 3).

Hai thứ mô-đun này CỐ Ý không làm:

- **Không chuẩn hoá nhãn phòng.** Nhận `room_types` từ ngoài vào; ai gọi thì người đó đã có
  kết quả chuẩn hoá từ mô hình ngôn ngữ ở Worker. Thiếu thì trường `type` để rỗng và bản ghi
  vẫn hợp lệ — chỉ mất phần few-shot.
- **Không đoán `tier`.** Ở quy mô hiện tại mọi hồ sơ là hạng A và phải có người xem
  (mục 6.0); để mã nguồn tự phong hạng B là bỏ qua bước người xác nhận.
"""

from __future__ import annotations

from typing import Any, Sequence

from design_compute.contracts import validate
from design_compute.kb.crosscheck import CrossCheck, check_across_levels, check_floor_plan, quality_score
from design_compute.kb.slicing import SlicingError, infer_slicing_tree, to_layout_node

SCHEMA_VERSION = "1.0.0"


def _rooms_payload(plan: Any, types: Sequence[str | None] | None) -> list[dict[str, Any]]:
    rooms: list[dict[str, Any]] = []
    for index, room in enumerate(plan.rooms):
        room_type = types[index] if types is not None and index < len(types) else None
        rooms.append(
            {
                "type": room_type,
                "label_raw": room.label_raw,
                # Hợp đồng kiểm theo JSON Schema, mà tuple của Python không phải kiểu `array`.
                # `ExtractedRoom` dùng tuple cho bất biến, nên phải đổi kiểu ở đúng chỗ này.
                "polygon": [[float(x), float(y)] for x, y in room.polygon_m],
                "area_m2": room.area_m2,
            }
        )
    return rooms


def build_record(
    *,
    tenant_id: str,
    project_code: str,
    building_type: str,
    site: dict[str, Any],
    plans: Sequence[Any],
    room_types: Sequence[Sequence[str | None]] | None = None,
    project_id: str | None = None,
    tier: str = "A",
    has_brief: bool = False,
    family_archetype: str | None = None,
    style: str | None = None,
) -> tuple[dict[str, Any], list[CrossCheck]]:
    """Lắp và kiểm bản ghi. Trả về `(bản ghi, danh sách phép kiểm)`.

    `plans` xếp theo tầng, phần tử đầu là tầng trệt. `room_types[i]` là mã phòng đã chuẩn hoá
    của tầng thứ `i`, cùng thứ tự với `plans[i].rooms`; bỏ trống nếu chưa chuẩn hoá.

    Danh sách phép kiểm được trả về RIÊNG chứ không chỉ gói vào điểm số: người xác nhận cần
    biết bản ghi mất điểm vì lý do gì, chứ không chỉ biết nó được 0,62.
    """
    if not plans:
        raise ValueError("cần ít nhất một bản vẽ mặt bằng để lắp bản ghi")

    checks: list[CrossCheck] = []
    floor_plans: list[dict[str, Any]] = []
    tree_payload: Any = None

    for index, plan in enumerate(plans):
        level = index + 1
        types = room_types[index] if room_types is not None and index < len(room_types) else None
        tree = infer_slicing_tree(plan.rooms)
        checks.extend(check_floor_plan(plan, slicing_tree=tree))

        # Cây chia không gian của TẦNG TRỆT là thứ đi vào few-shot. Các tầng trên vẫn được
        # kiểm nhưng chưa lưu — hợp đồng mới có một trường `slicing_tree`, và mở rộng thành
        # cây theo từng tầng thuộc Mốc 5 khi Layer 3a thật sự sinh nhiều tầng.
        if level == 1 and tree is not None and types is not None:
            try:
                tree_payload = to_layout_node(tree, types)
            except SlicingError:
                # Nhãn chưa chuẩn hoá đủ. Không phải lỗi của bản ghi — chỉ là chưa dùng được
                # làm few-shot, và phép kiểm `labels_normalised` đã nói ra điều đó rồi. Bắt
                # ĐÚNG loại lỗi này thôi: nuốt mọi ngoại lệ ở đây sẽ giấu luôn lỗi lập trình.
                tree_payload = None

        floor_plans.append({"level": level, "rooms": _rooms_payload(plan, types)})

    checks.extend(check_across_levels(plans))

    warnings = [
        {"code": w.code, "detail": w.detail} for plan in plans for w in getattr(plan, "warnings", ())
    ]

    record: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "project_code": project_code,
        "tier": tier,
        "quality_score": quality_score(checks),
        "building_type": building_type,
        "site": site,
        "floors": len(plans),
        "family_archetype": family_archetype,
        "style": style,
        "floor_plans": floor_plans,
        "slicing_tree": tree_payload,
        "has_brief": has_brief,
        "extraction_warnings": warnings,
    }

    grid_x = sorted({round(c[0], 2) for plan in plans for c in getattr(plan, "columns_m", ())})
    grid_y = sorted({round(c[1], 2) for plan in plans for c in getattr(plan, "columns_m", ())})
    if grid_x or grid_y:
        record["structural_grid"] = {"axes_x_m": grid_x, "axes_y_m": grid_y}

    validate("kb-record", record)
    return record, checks
