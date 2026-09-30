/**
 * Chụp ảnh màn hình cho hướng dẫn sử dụng của Ban Giám đốc (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Duyệt / Từ chối / Lưu.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-ban-giam-doc.spec.ts
 *
 * Khổ máy tính xách tay — lãnh đạo xem báo cáo và duyệt hồ sơ chủ yếu trên máy tính.
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/bgd';
const EMAIL = 'tgd@nhavietgroup.test';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(page: Page, name: string, { keepHelp = false } = {}): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (!keepHelp && (await gotIt.isVisible())) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('chụp màn hình Ban Giám đốc', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);

  await shot(page, '01-dashboard-huong-dan', { keepHelp: true });
  await shot(page, '01-dashboard');
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-dashboard-duoi.png` });

  await page.goto('/viec-can-lam');
  await shot(page, '03-hop-thu-phe-duyet');

  await page.goto('/bc/lai-lo');
  await shot(page, '05-lai-lo');
  await page
    .getByRole('link', { name: /Nhà xưởng Hưng Thịnh/ })
    .first()
    .click();
  await page.waitForURL(/tc\/cong-trinh\/[0-9a-f-]{36}/);
  await page.goto(`${page.url().split('?')[0]}?tab=ngan-sach`);
  await shot(page, '06-lai-lo-chi-tiet');

  await page.goto('/bc/hieu-qua-kinh-doanh');
  await shot(page, '07-hieu-qua-kinh-doanh');
  await page.goto('/tc/de-nghi');
  await page.getByRole('button', { name: 'Tất cả công trình' }).click();
  await shot(page, '08-theo-doi-de-nghi');

  // Thời hạn và hạn mức: Ban Giám đốc quyết, Quản trị viên nhập — màn hình thuộc phân hệ
  // Quản trị hệ thống, tài khoản Tổng Giám đốc không mở được.
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminContext.newPage();
  await admin.goto('/dang-nhap');
  await admin.locator('#email').fill('admin@nhavietgroup.test');
  await admin.locator('#password').fill(SEED_PASSWORD);
  await admin.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(admin).not.toHaveURL(/dang-nhap/);
  await admin.goto('/nen/thoi-han');
  await shot(admin, '09-thoi-han');
  await admin.goto('/nen/han-muc');
  await shot(admin, '10-han-muc');
  await adminContext.close();
});
