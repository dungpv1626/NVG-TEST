"""Chuyển `.dwg` sang `.dxf` bằng ODA File Converter.

Không thư viện mã nguồn mở nào đọc trực tiếp được `.dwg` — định dạng gốc của AutoCAD là
định dạng đóng. Đường đi bắt buộc là `.dwg` → ODA File Converter → `.dxf` → `ezdxf`
(`doc/design/06-knowledge-base.md` mục 6.1).

Hai điều bất ngờ về công cụ này, đã kiểm chứng trực tiếp trong container:

1. **Nó là ứng dụng đồ hoạ.** Kể cả ở chế độ dòng lệnh nó vẫn mở kết nối tới một màn hình.
   Không có màn hình thì tiến trình treo hoặc thoát im lặng với mã 0 mà không sinh tệp nào.
   Vì vậy mọi lời gọi đều bọc `xvfb-run`.
2. **Nó nhận THƯ MỤC, không nhận tệp.** Không có cách nào chỉ đích danh một tệp; công cụ
   quét cả thư mục nguồn theo mẫu tên. Nên chuyển một tệp cũng phải dựng một thư mục tạm
   chứa đúng tệp đó — nếu không sẽ vô tình chuyển luôn mọi tệp nằm cạnh nó.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

# Phiên bản DXF xuất ra. Chọn bản đủ mới để giữ được entity hiện đại, đủ cũ để `ezdxf` đọc
# chắc chắn. Đây là định dạng TRUNG GIAN của quy trình trích xuất, không phải hồ sơ giao cho
# ai — nên chọn theo khả năng đọc, không theo yêu cầu của khách.
DXF_VERSION = "ACAD2018"

_ODA_BINARY = "ODAFileConverter"


class CadConversionError(RuntimeError):
    """Không chuyển đổi được tệp CAD."""


class OdaUnavailable(CadConversionError):
    """Không có ODA File Converter trong môi trường đang chạy.

    Tách riêng khỏi `CadConversionError` vì hai tình huống này cần phản ứng khác hẳn nhau:
    thiếu công cụ là vấn đề TRIỂN KHAI (image build thiếu bộ cài, xem `kb/vendor/README.md`),
    còn chuyển đổi thất bại là vấn đề của chính TỆP đó.
    """


@dataclass(frozen=True, slots=True)
class ConversionResult:
    """Kết quả chuyển đổi một tệp."""

    source: Path
    dxf: Path
    stderr: str


def oda_path() -> str | None:
    """Đường dẫn tới ODA File Converter, hoặc `None` nếu chưa cài."""
    return shutil.which(os.environ.get("NVG_ODA_BINARY", _ODA_BINARY))


def oda_available() -> bool:
    """Môi trường hiện tại có đọc được `.dwg` không.

    Dùng để bỏ qua kiểm thử và để endpoint `/health` nói thật về khả năng của mình, thay vì
    để lỗi nổ ra giữa chừng một mẻ số hoá.
    """
    return oda_path() is not None


def _run_converter(src_dir: Path, out_dir: Path, out_format: str, pattern: str, timeout_s: int) -> str:
    binary = oda_path()
    if binary is None:
        raise OdaUnavailable(
            "không tìm thấy ODAFileConverter. Bộ cài không được commit (giấy phép Open Design "
            "Alliance không cho phát tán lại) — đặt tệp .deb vào kb/vendor/ rồi build lại image. "
            "Xem kb/vendor/README.md."
        )

    # `xvfb-run -a` tự chọn số màn hình còn trống, nên nhiều lượt chuyển đổi chạy song song
    # không giẫm lên nhau.
    cmd = [
        "xvfb-run",
        "-a",
        binary,
        str(src_dir),
        str(out_dir),
        DXF_VERSION,
        out_format,
        "0",  # không đệ quy: thư mục nguồn do chính hàm này dựng, chỉ có đúng một tệp
        "1",  # audit: sửa lỗi cấu trúc nhẹ trong tệp nguồn thay vì bỏ cuộc
        pattern,
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
    except FileNotFoundError as exc:  # thiếu chính `xvfb-run`
        raise OdaUnavailable(f"thiếu công cụ trong môi trường chạy: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CadConversionError(
            f"ODA File Converter quá {timeout_s} giây chưa xong. Thường là do thiếu màn hình ảo "
            f"(xvfb) nên tiến trình chờ vô hạn, hoặc tệp nguồn quá lớn."
        ) from exc

    # Mã trả về 0 KHÔNG bảo đảm có tệp ra: công cụ vẫn thoát êm khi bỏ qua tệp nó không đọc
    # được. Hàm gọi phải tự kiểm tệp kết quả — đó là lý do `dwg_to_dxf` không tin mã này.
    if proc.returncode != 0:
        raise CadConversionError(
            f"ODA File Converter trả mã {proc.returncode}: {proc.stderr.strip()[:500] or '(không có thông báo)'}"
        )
    return proc.stderr.strip()


def dwg_to_dxf(source: Path, out_dir: Path, *, timeout_s: int = 240) -> ConversionResult:
    """Chuyển một tệp `.dwg` thành `.dxf` và trả về đường dẫn tệp kết quả.

    `out_dir` được tạo nếu chưa có. Tệp kết quả mang cùng tên gốc, đổi phần mở rộng.
    """
    source = Path(source).resolve()
    if not source.is_file():
        raise CadConversionError(f"không tìm thấy tệp nguồn: {source}")

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Thư mục tạm chỉ chứa đúng tệp cần chuyển — xem ghi chú (2) ở đầu tệp.
    with tempfile.TemporaryDirectory(prefix="nvg-dwg-") as tmp:
        staged = Path(tmp) / source.name
        shutil.copy2(source, staged)
        stderr = _run_converter(Path(tmp), out_dir, "DXF", "*.DWG", timeout_s)

    produced = out_dir / f"{source.stem}.dxf"
    if not produced.is_file():
        raise CadConversionError(
            f"ODA File Converter chạy xong nhưng không sinh ra {produced.name}. Tệp nguồn có thể "
            f"hỏng, được bảo vệ bằng mật khẩu, hoặc thuộc phiên bản DWG mà bản công cụ đang cài "
            f"chưa đọc được."
        )
    return ConversionResult(source=source, dxf=produced, stderr=stderr)


def dxf_to_dwg(source: Path, out_dir: Path, *, timeout_s: int = 240) -> ConversionResult:
    """Chiều ngược lại — chỉ dùng để KIỂM THỬ đường đi khi chưa có hồ sơ `.dwg` thật.

    Không phải một phần của quy trình số hoá. Xuất bản vẽ cho người dùng đi theo hướng khác
    hẳn (DXF một chiều, CLAUDE.md 8.7) và không đi qua hàm này.
    """
    source = Path(source).resolve()
    if not source.is_file():
        raise CadConversionError(f"không tìm thấy tệp nguồn: {source}")

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="nvg-dxf-") as tmp:
        staged = Path(tmp) / source.name
        shutil.copy2(source, staged)
        stderr = _run_converter(Path(tmp), out_dir, "DWG", "*.DXF", timeout_s)

    produced = out_dir / f"{source.stem}.dwg"
    if not produced.is_file():
        raise CadConversionError(f"không sinh ra {produced.name}")
    return ConversionResult(source=source, dxf=produced, stderr=stderr)
