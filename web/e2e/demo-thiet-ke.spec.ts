/**
 * Bốn cảnh demo của Module Thiết kế — chạy liền mạch trên dự án NVO-028 đã nạp.
 *
 * Mười cảnh cũ (doc/design/14-phuong-an-demo.md 14.2) có sáu cảnh của bộ giải nội bộ; bộ giải
 * đã gỡ (T58) nên bài chỉ còn phần không thuộc bộ giải. Bài KHÔNG bấm "Phát hành" (mỗi lần bấm
 * là một phiên bản tài liệu mới) và KHÔNG gọi API AI.
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
  await expect(row, `Chưa có dự án demo ${PROJECT_CODE}`).toBeVisible();
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
 * Nhắm theo `href` chứ không theo nhãn: dải tiến trình và thẻ công cụ có liên kết trùng tên,
 * tìm theo chữ dễ bắt nhầm liên kết mà vẫn bấm được — hỏng ở bước khẳng định sau đó.
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

test('Bốn cảnh demo Module Thiết kế chạy liền mạch', async ({ page }) => {
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

  // Cảnh 3 — AI Design mở được từ thẻ công cụ (bộ giải nội bộ đã gỡ, T58).
  await tab(page, 'thiet-ke-ai', 'AI Design');

  // Cảnh 4 — Kho hồ sơ cũ mở được (danh mục tờ hiện khi có bản ghi).
  await page.goto('/tk/ho-so-cu');
  await expect(page.getByRole('heading', { name: /Hồ sơ cũ/ }).first()).toBeVisible();
});
