# `kb/vendor/` — công cụ bên thứ ba, KHÔNG commit

Thư mục này bị `.gitignore` (trừ chính tệp README này). Nó tồn tại để bối cảnh build Docker
luôn có thư mục này, kể cả khi chưa có tệp nào bên trong.

## Cần đặt gì vào đây

**ODA File Converter cho Linux X64, bản QT6, định dạng `.deb`.**

1. Vào `https://www.opendesign.com/guestfiles/oda_file_converter`
2. Đăng ký tài khoản (miễn phí) rồi tải bản **Linux X64 · QT6 · `.deb`**
3. Đặt tệp vào chính thư mục này, giữ nguyên tên (`ODAFileConverter_QT6_lnxX64_*.deb`)

Không commit tệp này: nó nặng khoảng 100 MB, và giấy phép của Open Design Alliance không
cho phát tán lại.

## Vì sao cần

Không thư viện mã nguồn mở nào đọc trực tiếp được `.dwg` (định dạng gốc của AutoCAD). Đường
đi là `.dwg` → ODA File Converter → `.dxf` → `ezdxf` đọc được toạ độ thật.

Dùng mô hình thị giác để "nhìn" bản vẽ là suy đoán, đắt hơn hàng chục lần và kém chính xác
hơn — với tệp vector thì toạ độ đã là số thật.

## Lưu ý khi chạy trong container

ODAFileConverter là **ứng dụng đồ hoạ**: kể cả khi chạy ở chế độ dòng lệnh nó vẫn đòi một
màn hình. Trong container phải bọc `xvfb-run` và cài các thư viện Qt. `compute/Dockerfile`
đã xử lý phần này.
