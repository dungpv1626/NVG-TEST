"""Đọc hồ sơ CAD: chuyển `.dwg` sang `.dxf` và trích hình học mặt bằng.

Một chiều, luôn luôn. Hệ thống KHÔNG nhập ngược tệp CAD đã sửa tay (CLAUDE.md 8.7): làm vậy
sẽ mất toàn bộ siêu dữ liệu ràng buộc và không còn cách nào biết ràng buộc nào đã bị phá.
"""

from design_compute.cad.convert import (
    CadConversionError,
    ConversionResult,
    OdaUnavailable,
    dwg_to_dxf,
    oda_available,
    oda_path,
)
from design_compute.cad.extract import (
    EXTRACTION_SCHEMA_VERSION,
    ExtractedFloorPlan,
    ExtractedRoom,
    ExtractionWarning,
    extract_floor_plan,
    extract_from_dwg,
    from_payload,
    to_payload,
)
from design_compute.cad.export import (
    DxfExportError,
    TitleBlock,
    export_floor_plan,
)
from design_compute.cad.layers import (
    ExportLayer,
    LayerMapping,
    LayerMappingError,
    load_mapping,
)

__all__ = [
    "EXTRACTION_SCHEMA_VERSION",
    "CadConversionError",
    "DxfExportError",
    "ExportLayer",
    "ConversionResult",
    "ExtractedFloorPlan",
    "ExtractedRoom",
    "ExtractionWarning",
    "LayerMapping",
    "LayerMappingError",
    "OdaUnavailable",
    "dwg_to_dxf",
    "export_floor_plan",
    "extract_floor_plan",
    "extract_from_dwg",
    "from_payload",
    "load_mapping",
    "oda_available",
    "oda_path",
    "TitleBlock",
    "to_payload",
]
