/**
 * Mười cảnh demo của Module Thiết kế — chạy liền mạch trên dự án NVO-028 đã nạp.
 *
 * Đây là "điều kiện demo xong" của doc/design/14-phuong-an-demo.md 14.2: bài này xanh nghĩa là
 * mười cảnh chạy được trên máy phát triển ngay trước giờ trình diễn. Bài KHÔNG bấm "Phát hành"
 * (mỗi lần bấm là một phiên bản tài liệu mới) và KHÔNG gọi Gemini thật.
 *
 * Tài khoản: người có quyền sửa TK trong bộ seed (`db/src/seed/data.ts`), mật khẩu seed —
 * ghi đè bằng E2E_EMAIL / E2E_PASSWORD. Dự án: E2E_PROJECT_CODE (mặc định NVO-TK-2026-0028).
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../db/src/seed/data';

const EMAIL = process.env.E2E_EMAIL ?? 'thietke.nvo@nhavietgroup.test';
const PASSWORD = process.env.E2E_PASSWORD ?? SEED_PASSWORD;
const PROJECT_CODE = process.env.E2E_PROJECT_CODE ?? 'NVO-TK-2026-0028';

async function login(page: Page): Promise<void> {
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
}

async function openProject(page: Page): Promise<void> {
  await page.goto('/tk/du-an');
  await page.getByPlaceholder(/Tìm theo tên, mã/).fill(PROJECT_CODE);
  // Danh sách dựng cả bảng máy tính lẫn thẻ di động, một trong hai bị ẩn theo bề rộng màn hình.
  const row = page.getByText(PROJECT_CODE, { exact: true }).locator('visible=true').first();
  await expect(row, `Chưa có dự án demo ${PROJECT_CODE} — chạy seed-demo-design.ts`).toBeVisible();
  // Mã hồ sơ là dòng phụ; liên kết vào chi tiết nằm ở tên dự án cùng ô — bấm vào liên kết đó.
  const link = page.locator('tr, li', { hasText: PROJECT_CODE }).locator('a[href*="/tk/du-an/"]');
  await link.locator('visible=true').first().click();
  await expect(page).toHaveURL(/\/tk\/du-an\//);
}

/**
 * Mở một phần của hồ sơ thiết kế.
 *
 * Từ 06/09/2026 màn hình có bố cục HAI CẤP: ba tab cấp một trên thanh tab, còn sáu bước quy
 * trình là màn hình con mở từ thẻ công cụ ở Tổng quan. Hàm này đi đúng đường người dùng đi —
 * bấm thẻ, không nhảy thẳng bằng URL — nên nó cũng là phép kiểm rằng các thẻ trỏ đúng chỗ.
 *
 * Nhắm theo `href` chứ không theo nhãn: nhãn trên thẻ và tiêu đề màn hình con cố ý khác nhau
 * ở một chỗ (thẻ "AI phương án kiến trúc" mở màn hình "Phương án kiến trúc"), nên tìm theo
 * chữ sẽ bắt nhầm liên kết mà vẫn bấm được — hỏng ở bước khẳng định sau đó chứ không ở đây.
 */
async function tab(page: Page, tabId: string, heading: string): Promise<void> {
  const strip = page.getByRole('tab', { name: heading, exact: true });
  if ((await strip.count()) > 0) {
    await strip.first().click();
    return;
  }
  // Đang ở một màn hình con khác thì quay về Tổng quan trước — thẻ công cụ chỉ có ở đó.
  const back = page.getByRole('button', { name: 'Tổng quan' });
  if ((await back.count()) > 0) await back.first().click();
  await page.locator(`a[href$="?tab=${tabId}"]`).first().click();
  await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
}

test('Mười cảnh demo Module Thiết kế chạy liền mạch', async ({ page }) => {
  await login(page);
  await openProject(page);

  // Cảnh 1 — Đầu bài đã xác nhận, độ đầy đủ có số.
  await tab(page, 'dau-bai', 'Đầu bài thiết kế');
  await expect(page.getByText(/Đã xác nhận/)).toBeVisible();
  await expect(page.getByText(/Mức độ đầy đủ/)).toBeVisible();

  // Cảnh 2 — Khảo sát hiện trạng có chỗ đính ảnh ngay trên biên bản.
  await tab(page, 'khao-sat', 'Khảo sát hiện trạng');
  await expect(page.getByText(/Ảnh hiện trạng/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Thêm ảnh hiện trạng/ }).first()).toBeVisible();

  // Cảnh 3 — Chương trình không gian đã chốt.
  await tab(page, 'chuong-trinh-khong-gian', 'Chương trình không gian');
  await expect(page.getByText(/Đã chốt, các bước sau đang dùng bản này/)).toBeVisible();

  // Cảnh 4 — Ba phương án, bảng so sánh bằng ngôn ngữ khách.
  await tab(page, 'phuong-an', 'Phương án kiến trúc');
  // Chờ lâu hơn mặc định 5 giây: khối này đọc kết quả bộ giải qua Worker, và lần gọi đầu sau
  // khi Worker vừa khởi động mất khoảng mười giây. Hết giờ ở đây là bài đỏ vì CHẬM chứ không
  // phải vì sai — đúng loại báo động giả mà CLAUDE.md 4.7 cảnh báo.
  await expect(page.getByText(/phương án khả thi trên/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('cell', { name: 'Số phòng ngủ' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Phòng thờ', exact: true })).toBeVisible();
  await expect(page.getByText('Đang hiệu lực').first()).toBeVisible();

  // Cảnh 5 — Bản vẽ đọc được: tờ SVG do Container dựng, phòng mang lớp tô màu.
  const sheet = page.getByTestId('to-ban-ve');
  await expect(sheet.locator('svg')).toBeVisible();
  expect(await sheet.locator('svg .phong').count()).toBeGreaterThan(3);
  await expect(sheet.locator('svg text', { hasText: 'Phương án sơ bộ' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Tầng 2' }).click();
  await expect(sheet.locator('svg')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Tô màu công năng' }).uncheck();
  await page.getByRole('checkbox', { name: 'Tô màu công năng' }).check();

  // Cảnh 8 — Bàn giao: DXF và XLSX tải về với đúng tên tệp.
  const dxf = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tải DXF tầng 2/ }).click();
  expect((await dxf).suggestedFilename()).toMatch(/_KT_MatBang_T2_V[0-9a-f]{8}\.dxf$/);
  const xlsx = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tải XLSX/ }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);
  await expect(page.getByText('Thống kê cửa', { exact: true })).toBeVisible();
  await expect(page.getByText('Tổng sàn xây dựng', { exact: true })).toBeVisible();

  // Cảnh 6 — Khối ba chiều xoay được (canvas WebGL), nhãn do mã chèn.
  const massing = page.getByTestId('khoi-ba-chieu');
  await expect(massing.locator('canvas')).toBeVisible();
  await expect(
    page.getByText('Khối sơ bộ — chưa thể hiện vật liệu và mặt đứng').first(),
  ).toBeVisible();

  // Cảnh 9 — Phối cảnh: chụp ảnh khối, nhãn in lên ảnh; tuyến sinh ảnh không chạy được thì
  // NÓI RÕ LÝ DO và giữ ảnh khối. Khẳng định dưới cố ý nhận mọi lý do đọc được, không liệt kê
  // từng câu: nhà cung cấp đã đổi hai lần (Gemini → Hugging Face → Pollinations) và mỗi lần
  // đổi lại thêm một lý do mới — liệt kê cứng thì test đỏ vì một câu tiếng Việt hợp lệ.
  await page.getByRole('button', { name: 'Chụp ảnh khối' }).click();
  await expect(page.getByAltText('Ảnh khối sơ bộ có nhãn cảnh báo')).toBeVisible();
  await page.getByRole('button', { name: /Dựng ảnh phối cảnh/ }).click();
  await expect(
    page
      // Ba khung hình (ngày, đêm, góc nghiêng) nên có tới ba lý do hoặc ba ảnh — cảnh này chỉ
      // cần khẳng định khung đầu tiên nói được điều gì đó, không phải cả ba giống nhau.
      .getByText(/Chưa dựng được ảnh phối cảnh/)
      .or(page.getByAltText(/Ảnh phối cảnh tham khảo/))
      .first(),
  ).toBeVisible();

  // Cảnh 7 — Đổi ý: đợt trước còn nguyên kèm câu tác động.
  await expect(page.getByText(/Đợt trước \(\d+\)/)).toBeVisible();
  await expect(
    page.getByText(/Tổng sàn (tăng|giảm)|Thêm tầng|chuyển từ tầng/).first(),
  ).toBeVisible();

  // Cảnh 10 — Kho hồ sơ cũ mở được (danh mục tờ hiện khi có bản ghi).
  await page.goto('/tk/ho-so-cu');
  await expect(page.getByRole('heading', { name: /Hồ sơ cũ/ }).first()).toBeVisible();
});
