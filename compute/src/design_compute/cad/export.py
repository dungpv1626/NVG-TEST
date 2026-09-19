"""Xuất mặt bằng ra DXF — MỘT CHIỀU.

Nguồn: `doc/design/08-milestones.md` Mốc 5 ("xuất DXF mặt bằng với khung tên và mã phiên bản
đúng quy ước Nhà Việt Group"), CLAUDE.md 8.7.

## Vì sao một chiều

Không nhập ngược tệp CAD đã sửa. Mặt bằng của hệ thống là một CÂY RÀNG BUỘC đã giải; tệp DXF
chỉ là hình chiếu phẳng của nó. Đọc ngược một tệp ai đó đã kéo tay thì toàn bộ siêu dữ liệu
ràng buộc mất sạch, và không có cách nào biết ràng buộc nào đã bị phá. Muốn sửa thì sửa trong
trình chỉnh sửa của hệ thống rồi xuất lại.

## Tên lớp là DỮ LIỆU

Không dòng nào dưới đây viết một chuỗi như `"A-AREA-ROOM"`. Tên lớp lấy từ mục `export:` của
`kb/layer_mapping.yaml`, và các tên ở đó được chọn sao cho khớp lại chính những mẫu ở mục
`roles:`/`ignore:` — bản vẽ hệ thống xuất ra, đọc ngược vào lại đúng vai trò cũ.

## Đơn vị

Bản vẽ ghi bằng **milimét** (`$INSUNITS = 4`), đúng thói quen của hồ sơ kiến trúc Việt Nam.
Hợp đồng dữ liệu nói bằng mét, nên mọi toạ độ nhân 1000 ngay tại ranh giới này.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from design_compute.cad.layers import LayerMapping, load_mapping

from design_compute.sheet.model import GRID_NOTICE, STAGE_NOTICE, SheetBuildError, SheetTitle, build_floor_plan_sheet
from design_compute.sheet.dxf import render_dxf

MM_PER_M = 1000.0


class DxfExportError(ValueError):
    """Mặt bằng không đủ dữ liệu để xuất. Không đoán bù."""

    retryable = False


@dataclass(frozen=True, slots=True)
class TitleBlock:
    """Khung tên. Mọi trường do lớp gọi cấp — Container không biết mã hồ sơ của NVG."""

    project_code: str
    project_name: str
    discipline: str
    sheet: str
    version: str
    date: str
    rule_pack_version: str = ""
    sheet_code: str = ""


def _sheet_title(title: TitleBlock, level: int) -> SheetTitle:
    return SheetTitle(
        project_code=title.project_code,
        project_name=title.project_name,
        discipline=title.discipline,
        sheet_name=title.sheet,
        # Mã tờ theo họ `kt/NN` của hồ sơ thật khi lớp gọi không cấp.
        sheet_code=title.sheet_code or f"kt/{level:02d}",
        version=title.version,
        date=title.date,
        rule_pack_version=title.rule_pack_version,
    )


def build_sheet(
    plan: dict[str, Any],
    *,
    level: int,
    title: TitleBlock,
    mapping: LayerMapping | None = None,
    labels: dict[str, str] | None = None,
    groups: dict[str, list[str]] | None = None,
):
    """Mô hình tờ của một tầng — đầu vào chung của DXF và SVG."""
    mapping = mapping or load_mapping()
    try:
        return build_floor_plan_sheet(
            plan, level=level, title=_sheet_title(title, level), mapping=mapping, labels=labels, groups=groups
        )
    except SheetBuildError as exc:
        raise DxfExportError(str(exc)) from exc


def export_floor_plan(
    plan: dict[str, Any],
    *,
    level: int,
    title: TitleBlock,
    mapping: LayerMapping | None = None,
    labels: dict[str, str] | None = None,
    groups: dict[str, list[str]] | None = None,
) -> bytes:
    """Một tầng của `FloorPlan` thành một tệp DXF — qua mô hình tờ (`sheet/`)."""
    mapping = mapping or load_mapping()
    sheet = build_sheet(plan, level=level, title=title, mapping=mapping, labels=labels, groups=groups)
    return render_dxf(sheet, mapping)


__all__ = ["DxfExportError", "GRID_NOTICE", "STAGE_NOTICE", "TitleBlock", "build_sheet", "export_floor_plan"]
