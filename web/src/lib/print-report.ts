/**
 * Xuất PDF cho báo cáo (BC-06) — mở một cửa sổ in RIÊNG chỉ chứa nội dung báo cáo, rồi gọi
 * `window.print()`. Người dùng chọn đích "Lưu dưới dạng PDF" ở hộp thoại in của trình duyệt —
 * đây không phải file `.pdf` tự tải xuống, giống cách "Xuất Excel" thực chất là CSV.
 *
 * KHÔNG dùng thư viện dựng PDF (jsPDF…): font mặc định của các thư viện đó không có glyph
 * tiếng Việt có dấu — phải tự nhúng font base64 mới hiển thị đúng, đúng kiểu rủi ro CLAUDE.md
 * Mục 4.1 đã cảnh báo (chữ do một tầng khác sinh ra, trông đúng lúc đọc code, sai lúc hiển thị
 * thật, không có cách kiểm bằng cách đọc mã nguồn). Cửa sổ in dùng font hệ thống của người
 * dùng — trình duyệt tự lo phần dựng chữ có dấu, không có khâu nhúng font nào có thể sai.
 *
 * Mở cửa sổ mới thay vì phủ `@media print` lên toàn App Shell: tránh phải làm print-safe cho
 * sidebar/top bar/bottom nav mà MỌI màn hình dùng chung — đổi CSS toàn cục chỉ để phục vụ hai
 * trang báo cáo là rủi ro không tương xứng lợi ích.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PAGE_STYLE = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #172B4D;
    margin: 24px;
    font-size: 13px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 20px 0 8px; }
  .meta { color: #44546F; font-size: 11px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #DCDFE4; padding: 6px 8px; text-align: left; font-size: 12px; vertical-align: top; }
  th { background: #F7F8F9; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .loss { color: #CA3521; font-weight: 600; }
  .profit { color: #22A06B; font-weight: 600; }
  .muted { color: #44546F; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 0 0 20px; }
  dt { font-size: 11px; color: #44546F; }
  dd { margin: 2px 0 0; font-size: 13px; }
  @media print {
    body { margin: 0.5cm; }
  }
`;

/**
 * Mở cửa sổ in cho một báo cáo. `bodyHtml` do trang gọi tự dựng sẵn (bảng/danh sách đã escape
 * chữ động) — hàm này chỉ lo khung trang in (tiêu đề, thời điểm xuất, style) và gọi in.
 */
export function openPrintReport(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) return; // popup bị chặn — không có cách ép, người dùng tự cho phép rồi bấm lại

  const generatedAt = new Date().toLocaleString('vi-VN');
  win.document.write(`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Nhà Việt Group — Xuất lúc ${escapeHtml(generatedAt)}</p>
${bodyHtml}
</body>
</html>`);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}
