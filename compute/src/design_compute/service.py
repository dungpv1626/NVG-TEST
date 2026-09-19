"""Máy chủ HTTP của Container tính toán.

Đây là mặt tiếp xúc DUY NHẤT giữa Worker và Container (doc/design/02-architecture.md 2.2).

Ba ràng buộc kiến trúc mà tệp này phải giữ:

  · **Không giữ trạng thái.** Không có bộ nhớ đệm giữa hai lời gọi, không ghi ra đĩa. Đĩa của
    container bị xoá sạch sau mỗi lần chạy, và đó là điều kiện để đổi chỗ triển khai (Docker
    tại chỗ hôm nay, Cloudflare Container sau khi nâng gói) mà không viết lại gì.
  · **Không gọi ngược Worker.** Nhận đầu vào, trả đầu ra, không có tác dụng phụ nào khác.
  · **Không gọi mô hình ngôn ngữ.** Bộ giải phải tất định — có kiểm thử cấm `solver/` import
    phần gọi mô hình.

Cả hai đầu đều validate ở ranh giới: Worker kiểm bằng zod, ở đây kiểm bằng chính JSON Schema
gốc. Không bên nào tin bên kia.
"""

from __future__ import annotations

import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from design_compute.adapters import (
    build_solve_request,
    floor_plan_from_result,
    infeasibility_report_from_result,
)
from design_compute.sheet import render_svg
from design_compute.schedules import build_schedules, schedules_to_xlsx
from design_compute.massing import MassingError, massing_glb
from design_compute.version import solver_version
from design_compute.geometry.norms import load_construction_norms
from design_compute.cad.export import build_sheet
from design_compute.cad import (
    CadConversionError,
    DxfExportError,
    OdaUnavailable,
    TitleBlock,
    dwg_to_dxf,
    export_floor_plan,
    extract_floor_plan,
    from_payload,
    load_mapping,
    oda_available,
    to_payload,
)
from design_compute.kb import build_record
from design_compute.contracts import ContractError, available_contracts, validate
from design_compute.rules.loader import default_rules_root, load_for_locality
from design_compute.rules.messages import MessageCatalog
from design_compute.solver.model import solve_townhouse

app = FastAPI(title="NVG Design Compute", version="0.1.0")


class RulePackRef(BaseModel):
    locality: str
    version: str | None = None


class SiteRef(BaseModel):
    """Ô chữ nhật xây được, cộng những gì thửa đất áp lên phần đặt khối.

    `width_m`/`depth_m` là ô chữ nhật lớn nhất nội tiếp thửa, do Worker quy đổi — không phải
    kích thước thô của thửa. `area_m2` mới là diện tích THẬT của thửa, dùng cho mật độ xây
    dựng: lấy tích hai cạnh của ô chữ nhật là tự phạt oan mọi thửa không vuông vắn.

    `open_faces` và `access_faces` suy từ hiện trạng bốn phía trong đầu bài. Chúng là DỮ LIỆU
    của thửa, không phải một hằng số về loại hình: một căn nhà phố lô góc có ba mặt thoáng, và
    không có gì trong mã nguồn được phép giả định là hai.
    """

    width_m: float
    depth_m: float
    area_m2: float | None = None
    open_faces: list[str] | None = None
    access_faces: list[str] | None = None
    setback_required_m: dict[str, float] | None = None
    max_density: float | None = None


class SolvePayload(BaseModel):
    """Đầu vào của một lần giải.

    `intent_ref` do WORKER cấp: Container không băm artifact và không biết mã của chúng —
    băm ở hai nơi là hai cách chuẩn hoá JSON sẽ lệch nhau. Nó đi vào `FloorPlan.intent_ref`
    để đồ thị phụ thuộc nối được mặt bằng về đúng ý đồ bố cục đã sinh ra nó.
    """

    intent: dict[str, Any]
    intent_ref: str
    program: dict[str, Any]
    site: SiteRef
    rule_pack: RulePackRef
    time_budget_s: float = Field(default=60.0, gt=0, le=600)
    building_type: str = "nha_pho"
    # Nhãn tiếng Việt của từng không gian, do Worker cấp. Container không giữ bảng từ vựng
    # (CLAUDE.md 8.7) nhưng câu thông báo vi phạm phải đọc được — thiếu nhãn thì câu rơi về
    # mã không gian, đúng chứ không đẹp.
    labels: dict[str, str] | None = None
    # Thành viên của từng nhóm mã phòng (`habitable`…). Thiếu thì nhóm được hiểu là phủ mọi
    # loại phòng — kiểm thừa chứ không bỏ sót.
    groups: dict[str, list[str]] | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    """Kiểm tra sống — cũng là chỗ xác nhận rule pack và hợp đồng đã nằm trong ảnh.

    Cố ý nạp thật rule pack chứ không chỉ trả `{"ok": true}`: hai lỗi hay gặp nhất khi triển
    khai là quên `COPY rules/` và quên `COPY contracts/`, và cả hai chỉ lộ ra ở lời gọi
    nghiệp vụ đầu tiên nếu kiểm tra sống không chạm tới chúng.
    """
    pack = load_for_locality(default_rules_root(), None)
    mapping = load_mapping()
    return {
        "ok": True,
        "service": "design-compute",
        "rule_pack": {"id": pack.id, "version": pack.version, "rules": len(pack.rules)},
        # Dấu vân của mã hình học + chuẩn cấu tạo + rule pack. Worker đưa chuỗi này vào khoá bộ
        # nhớ đệm của bước giải; thiếu nó thì một bản vá hình học không bao giờ tới được người
        # xem vì kết quả cũ được dùng lại (xem `design_compute/version.py`).
        "solver_version": solver_version(),
        "contracts": available_contracts(),
        # Đọc `.dwg` phụ thuộc một công cụ KHÔNG được commit (giấy phép Open Design Alliance),
        # nên cùng một ảnh Docker có thể có hoặc không có khả năng này. Nói ra ở đây để lớp gọi
        # biết trước, thay vì để lỗi nổ ra giữa chừng một mẻ số hoá.
        "cad": {
            "dwg_reader": oda_available(),
            "layer_mapping_version": mapping.version,
        },
    }


@app.post("/solve")
def solve(payload: SolvePayload) -> JSONResponse:
    """Layer 3b — giải massing và MỌI TẦNG trong một mô hình CP-SAT.

    Vô nghiệm KHÔNG phải lỗi. `InfeasibilityReport` là kết quả hạng nhất, quan trọng ngang
    `FloorPlan` (03-data-contracts 3.5) — nên nó cũng trả mã 200, kèm `status: "infeasible"`.
    Trả 4xx sẽ khiến lớp gọi coi đây là hỏng hóc và giấu mất lời giải thích.
    """
    site = payload.site.model_dump()

    validate("layout-intent", payload.intent)
    validate("space-program", payload.program)

    request = build_solve_request(
        intent=payload.intent,
        program=payload.program,
        site=site,
        locality=payload.rule_pack.locality,
        time_budget_s=payload.time_budget_s,
        building_type=payload.building_type,
        labels=payload.labels,
        groups=payload.groups,
    )

    messages = MessageCatalog.load(default_rules_root() / "messages.vi.yaml")

    started = time.monotonic()
    result = solve_townhouse(request)
    elapsed_ms = int((time.monotonic() - started) * 1000)

    if result.status == "infeasible":
        report = infeasibility_report_from_result(result, request=request, messages=messages)
        validate("infeasibility-report", report)
        return JSONResponse(
            {"status": "infeasible", "report": report, "solve_time_ms": elapsed_ms}
        )

    if result.status == "unknown":
        # Hết giờ mà chưa có nghiệm nào: khác hẳn vô nghiệm. Nói rõ để người dùng biết nên
        # tăng ngân sách thời gian chứ không phải sửa đầu bài.
        return JSONResponse(
            status_code=503,
            content={
                "error": (
                    "Chưa tìm được phương án trong thời gian cho phép. "
                    "Tăng ngân sách thời gian của bộ giải, hoặc giảm số phòng của đầu bài."
                ),
                "retryable": True,
                "solve_time_ms": elapsed_ms,
            },
        )

    plan = floor_plan_from_result(
        result,
        request=request,
        intent_ref=payload.intent_ref,
        site=site,
        messages=messages,
    )
    validate("floor-plan", plan)
    return JSONResponse({"status": "ok", "floor_plan": plan, "solve_time_ms": elapsed_ms})


class TitleBlockPayload(BaseModel):
    """Khung tên. Container không biết mã hồ sơ hay tên khách của NVG — Worker cấp hết."""

    project_code: str
    project_name: str
    discipline: str
    sheet: str
    version: str
    date: str


class ExportDxfPayload(BaseModel):
    floor_plan: dict[str, Any]
    level: int = Field(default=1, ge=1, le=12)
    title_block: TitleBlockPayload
    # Nhãn tiếng Việt của từng không gian và nhóm mã phòng — Worker cấp từ `kb/`, Container không
    # tự tra (cùng lý do với /solve).
    labels: dict[str, str] | None = None
    groups: dict[str, list[str]] | None = None
    sheet_code: str | None = None


def _title_of(payload: ExportDxfPayload) -> TitleBlock:
    return TitleBlock(
        project_code=payload.title_block.project_code,
        project_name=payload.title_block.project_name,
        discipline=payload.title_block.discipline,
        sheet=payload.title_block.sheet,
        version=payload.title_block.version,
        date=payload.title_block.date,
        rule_pack_version=str(payload.floor_plan.get("rule_pack_version", "")),
        sheet_code=payload.sheet_code or "",
    )


@app.post("/export/dxf")
def export_dxf(payload: ExportDxfPayload) -> Response:
    """Xuất một tầng của mặt bằng ra DXF. MỘT CHIỀU — không có đường nhập ngược.

    Trả thẳng byte của tệp chứ không trả đường dẫn: Container không giữ trạng thái và không
    ghi ra đĩa, nên không có chỗ nào để tệp nằm lại chờ ai tới lấy.
    """
    validate("floor-plan", payload.floor_plan)
    try:
        data = export_floor_plan(
            payload.floor_plan,
            level=payload.level,
            title=_title_of(payload),
            labels=payload.labels,
            groups=payload.groups,
        )
    except DxfExportError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc), "retryable": False})
    return Response(content=data, media_type="application/dxf")


@app.post("/export/svg")
def export_svg(payload: ExportDxfPayload) -> Response:
    """Cùng tờ bản vẽ đó, dạng SVG để trình duyệt HIỂN THỊ — cùng một `SheetModel` với DXF.

    Trình duyệt không dựng hình (bất biến #5): nó nhận tệp này và chỉ tô màu bằng CSS.
    """
    validate("floor-plan", payload.floor_plan)
    try:
        sheet = build_sheet(
            payload.floor_plan,
            level=payload.level,
            title=_title_of(payload),
            labels=payload.labels,
            groups=payload.groups,
        )
    except DxfExportError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc), "retryable": False})
    return Response(content=render_svg(sheet), media_type="image/svg+xml")


class MassingPayload(BaseModel):
    floor_plan: dict[str, Any]
    # Nhóm mã phòng (`kb/room_vocabulary.yaml`) — cần nhóm `outdoor` để dựng lan can thay vì
    # tường ở cạnh hở của ban công. Worker cấp, giống hệt tuyến xuất tờ bản vẽ.
    groups: dict[str, list[str]] | None = None


@app.post("/export/glb")
def export_glb(payload: MassingPayload) -> Response:
    """Khối ba chiều sơ bộ (glTF nhị phân) đùn từ mặt bằng — trình duyệt chỉ xem (bất biến #5)."""
    validate("floor-plan", payload.floor_plan)
    try:
        data = massing_glb(payload.floor_plan, payload.groups)
    except MassingError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc), "retryable": False})
    return Response(content=data, media_type="model/gltf-binary")


class SchedulesPayload(BaseModel):
    floor_plan: dict[str, Any]
    floorplan_ref: str
    labels: dict[str, str] | None = None
    title: str = ""


@app.post("/schedules")
def schedules(payload: SchedulesPayload) -> JSONResponse:
    """Bảng thống kê cửa · cửa sổ · diện tích · khối lượng sơ bộ, tính lại từ mặt bằng mỗi lần gọi."""
    validate("floor-plan", payload.floor_plan)
    result = build_schedules(payload.floor_plan, floorplan_ref=payload.floorplan_ref, norms=load_construction_norms())
    validate("schedules", result)
    return JSONResponse(result)


@app.post("/export/xlsx")
def export_xlsx(payload: SchedulesPayload) -> Response:
    """Cùng bảng thống kê đó, dạng XLSX để bàn giao — nhãn cảnh báo ở dòng đầu mỗi sheet."""
    validate("floor-plan", payload.floor_plan)
    result = build_schedules(payload.floor_plan, floorplan_ref=payload.floorplan_ref, norms=load_construction_norms())
    validate("schedules", result)
    data = schedules_to_xlsx(result, labels=payload.labels, title=payload.title)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


# ---------------------------------------------------------------------------
# Số hoá hồ sơ cũ (Mốc 3)
# ---------------------------------------------------------------------------

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
