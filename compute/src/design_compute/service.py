"""Máy chủ HTTP của Container số hoá hồ sơ cũ.

Đây là mặt tiếp xúc DUY NHẤT giữa Worker và Container (doc/design/02-architecture.md 2.2).
Container chỉ còn hai việc: trích hình học từ bản vẽ `.dxf`/`.dwg` (`/extract`) và lắp bản ghi
Knowledge Base (`/kb/record`). Bộ giải CP-SAT, xuất tờ vẽ, khối ba chiều và bảng thống kê đã gỡ
cùng bộ giải nội bộ (T58, 19/09/2026).

Ba ràng buộc kiến trúc mà tệp này phải giữ:

  · **Không giữ trạng thái.** Không có bộ nhớ đệm giữa hai lời gọi, không ghi ra đĩa. Đĩa của
    container bị xoá sạch sau mỗi lần chạy, và đó là điều kiện để đổi chỗ triển khai (Docker
    tại chỗ hôm nay, Cloudflare Container sau khi nâng gói) mà không viết lại gì.
  · **Không gọi ngược Worker.** Nhận đầu vào, trả đầu ra, không có tác dụng phụ nào khác.
  · **Không gọi mô hình ngôn ngữ.** Chuẩn hoá nhãn phòng là việc của Worker (CLAUDE.md 8.6).

Cả hai đầu đều validate ở ranh giới: Worker kiểm bằng zod, ở đây kiểm bằng chính JSON Schema
gốc. Không bên nào tin bên kia.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from design_compute.cad import (
    CadConversionError,
    OdaUnavailable,
    dwg_to_dxf,
    extract_floor_plan,
    from_payload,
    load_mapping,
    oda_available,
    to_payload,
)
from design_compute.kb import build_record
from design_compute.contracts import ContractError, available_contracts, validate

app = FastAPI(title="NVG Design Compute", version="0.2.0")


@app.get("/health")
def health() -> dict[str, Any]:
    """Kiểm tra sống — cũng là chỗ xác nhận hợp đồng và quy ước lớp đã nằm trong ảnh.

    Cố ý nạp thật quy ước lớp chứ không chỉ trả `{"ok": true}`: lỗi hay gặp nhất khi triển khai
    là quên `COPY contracts/` hay tệp `kb/`, và chúng chỉ lộ ra ở lời gọi nghiệp vụ đầu tiên nếu
    kiểm tra sống không chạm tới.
    """
    mapping = load_mapping()
    return {
        "ok": True,
        "service": "design-compute",
        "contracts": available_contracts(),
        # Đọc `.dwg` phụ thuộc một công cụ KHÔNG được commit (giấy phép Open Design Alliance),
        # nên cùng một ảnh Docker có thể có hoặc không có khả năng này. Nói ra ở đây để lớp gọi
        # biết trước, thay vì để lỗi nổ ra giữa chừng một mẻ số hoá.
        "cad": {
            "dwg_reader": oda_available(),
            "layer_mapping_version": mapping.version,
        },
    }


# Bản vẽ mặt bằng nhà phố hiếm khi vượt vài megabyte. Chặn ở đây để một tệp gửi nhầm không
# ngốn hết bộ nhớ của container — Cloudflare Containers không có bộ nhớ dư dả như máy phát triển.
MAX_UPLOAD_BYTES = 64 * 1024 * 1024

SUPPORTED_CAD_SUFFIXES = (".dxf", ".dwg")


class KbRecordPayload(BaseModel):
    """Yêu cầu lắp bản ghi Knowledge Base từ các bản vẽ ĐÃ trích."""

    tenant_id: str
    project_code: str
    building_type: str
    site: dict[str, Any]
    # Kết quả của /extract, gửi trả nguyên vẹn. Container không giữ trạng thái nên nó không
    # nhớ lần trích trước — đó là điều kiện để đổi chỗ triển khai mà không viết lại.
    plans: list[dict[str, Any]] = Field(min_length=1)
    room_types: list[list[str | None]] | None = None
    project_id: str | None = None
    tier: str = "A"
    has_brief: bool = False
    family_archetype: str | None = None
    style: str | None = None


@app.post("/extract")
async def extract(file: UploadFile = File(...)) -> JSONResponse:
    """Bước 1 — trích hình học từ một bản vẽ mặt bằng `.dxf` hoặc `.dwg`.

    Nhận tệp qua multipart chứ không qua R2: R2 cần bật thanh toán, còn cách gửi tệp nằm sau
    interface `ComputeBackend` phía Worker nên đổi sang R2 sau này là sửa một tệp. Đây là
    quyết định của giai đoạn phát triển, không phải của kiến trúc.
    """
    name = Path(file.filename or "khong-ten").name
    suffix = Path(name).suffix.lower()
    if suffix not in SUPPORTED_CAD_SUFFIXES:
        raise ValueError(
            f"phần mở rộng {suffix or '(không có)'} không đọc được. Chỉ nhận "
            f"{' và '.join(SUPPORTED_CAD_SUFFIXES)}; bản quét từ giấy và PDF đi đường khác."
        )

    data = await file.read()
    if not data:
        raise ValueError(f"tệp {name} rỗng")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"tệp {name} nặng {len(data) // (1024 * 1024)} MB, vượt hạn "
            f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
        )

    with tempfile.TemporaryDirectory(prefix="nvg-extract-") as tmp:
        source = Path(tmp) / name
        source.write_bytes(data)

        if suffix == ".dwg":
            if not oda_available():
                # Đây là vấn đề TRIỂN KHAI (image thiếu bộ cài), không phải vấn đề của tệp.
                # 503 + retryable=False: thử lại không giúp gì, nhưng cũng đừng coi là dữ liệu sai.
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": (
                            "Không đọc được tệp .dwg do bản triển khai này chưa có ODA File "
                            "Converter. Xem kb/vendor/README.md."
                        ),
                        "retryable": False,
                    },
                )
            source = dwg_to_dxf(source, Path(tmp) / "dxf").dxf

        payload = to_payload(extract_floor_plan(source))

    # Tự kiểm đầu ra của chính mình: Worker không tin Container và ngược lại.
    validate("cad-extraction", payload)
    return JSONResponse({"status": "ok", "extraction": payload})


@app.post("/kb/record")
def kb_record(payload: KbRecordPayload) -> JSONResponse:
    """Bước 2 — kiểm tra chéo và lắp bản ghi Knowledge Base từ các bản vẽ đã trích.

    `checks` trả về RIÊNG chứ không chỉ gói vào `quality_score`: người xác nhận cần biết bản
    ghi mất điểm vì lý do gì, chứ không chỉ biết nó được 0,62.
    """
    for plan in payload.plans:
        validate("cad-extraction", plan)

    record, checks = build_record(
        tenant_id=payload.tenant_id,
        project_code=payload.project_code,
        building_type=payload.building_type,
        site=payload.site,
        plans=[from_payload(plan) for plan in payload.plans],
        room_types=payload.room_types,
        project_id=payload.project_id,
        tier=payload.tier,
        has_brief=payload.has_brief,
        family_archetype=payload.family_archetype,
        style=payload.style,
    )
    return JSONResponse(
        {
            "status": "ok",
            "record": record,
            "checks": [
                {"code": c.code, "outcome": c.outcome, "detail": c.detail} for c in checks
            ],
        }
    )


@app.exception_handler(CadConversionError)
def cad_error_handler(_request: Any, exc: CadConversionError) -> JSONResponse:
    """Tệp CAD hỏng hoặc thiếu công cụ.

    Tách khỏi lỗi hợp đồng: dữ liệu vào đúng cấu trúc, chỉ là nội dung tệp không đọc được.
    Thiếu công cụ (`OdaUnavailable`) thì thử lại vô ích; tệp hỏng cũng vậy — nên cả hai đều
    `retryable: false`, và lỗi nằm ở phía dữ liệu nên trả 422.
    """
    return JSONResponse(
        status_code=503 if isinstance(exc, OdaUnavailable) else 422,
        content={"error": str(exc), "retryable": False},
    )


@app.exception_handler(ContractError)
def contract_error_handler(_request: Any, exc: ContractError) -> JSONResponse:
    """Lỗi hợp đồng dữ liệu — 422 và KHÔNG đáng thử lại.

    Lớp gọi phân biệt hai loại lỗi (02-architecture 2.5): lỗi mạng thì thử lại, lỗi schema
    thì báo ngay. Trả 5xx ở đây sẽ khiến Workflow đốt bốn lần thử vào một dữ liệu sai cấu trúc.
    """
    return JSONResponse(
        status_code=422,
        content={"error": str(exc), "retryable": False, "details": exc.errors[:20]},
    )


@app.exception_handler(ValueError)
def value_error_handler(_request: Any, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": str(exc), "retryable": False})
