/**
 * Chụp ảnh màn hình cho hướng dẫn Hành chính – Nhân sự (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Gửi / Duyệt — chỉ mở màn
 * hình và biểu mẫu. Cần dữ liệu kịch bản `ns` (`npm run db:demo-data -- --only=ns`).
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-nhan-su.spec.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/ns';
const EMAIL = 'nhansu@nhavietgroup.test';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(page: Page, name: string, { full = false } = {}): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Trang tải phần mã theo lượt (lazy): networkidle tới trước khi trang kịp vẽ tiêu đề.
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (await gotIt.isVisible()) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

test('chụp màn hình Hành chính – Nhân sự', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  await shot(page, '01-dashboard');

  await page.goto('/ns/viec-can-xu-ly');
  await expect(page.getByRole('heading', { name: 'Việc cần xử lý' })).toBeVisible();
  await shot(page, '02-viec-can-xu-ly');

  await page.goto('/ns/cham-cong');
  await expect(page.getByRole('heading', { name: 'Chấm công 3 khối' })).toBeVisible();
  await shot(page, '03-cham-cong');
  await page.getByRole('button', { name: 'Xem bảng công' }).first().click();
  await expect(page.getByRole('heading', { name: /Bảng công khối Văn phòng/ })).toBeVisible();
  await page.getByRole('heading', { name: /Bảng công khối Văn phòng/ }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/04-bang-cong.png` });
  await page.getByRole('button', { name: 'Xem bảng công' }).first().click();
  await page.getByRole('button', { name: /Lê Văn Hùng, 26\/09\/2026/ }).click();
  await page.getByRole('button', { name: 'Lưu ngày công' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/05-sua-ngay-cong.png` });

  await page.goto('/ns/nhan-su');
  await expect(page.getByRole('heading', { name: 'Hồ sơ nhân sự' })).toBeVisible();
  await shot(page, '06-ho-so-nhan-su');
  await page
    .getByRole('link', { name: /Phạm Minh Thư/ })
    .first()
    .click();
  await page.waitForURL(/ns\/nhan-su\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: 'Phạm Minh Thư' })).toBeVisible();
  await shot(page, '07-chi-tiet');
  await page.getByRole('button', { name: 'Sửa hồ sơ' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/08-sua-ho-so.png` });
  await page.getByRole('button', { name: 'Huỷ' }).click();
  await page.getByRole('tab', { name: /Hợp đồng/ }).click();
  await page.getByRole('button', { name: 'Thêm hợp đồng' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/09-hop-dong-moi.png` });
  await page.getByRole('tab', { name: /Tiếp nhận, bàn giao/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/10-tiep-nhan.png` });

  await page.goto('/ns/nhan-su/tao-moi');
  await shot(page, '11-them-nhan-su');

  await page.goto('/ns/giay-to');
  await expect(page.getByRole('heading', { name: /Giấy tờ/ })).toBeVisible();
  await shot(page, '12-giay-to');

  await page.goto('/ns/tai-san');
  await expect(page.getByRole('heading', { name: /Tài sản/ })).toBeVisible();
  await shot(page, '13-tai-san');

  await page.goto('/ns/nghi-phep');
  await expect(page.getByRole('heading', { name: 'Nghỉ phép' })).toBeVisible();
  await shot(page, '14-nghi-phep');

  await page.goto('/viec-can-lam');
  await shot(page, '15-phe-duyet');

  await page.goto('/ns/tuyen-dung');
  await expect(page.getByRole('heading', { name: 'Tuyển dụng' })).toBeVisible();
  await page.getByRole('button', { name: 'Ứng viên' }).first().click();
  await page.waitForTimeout(800);
  await shot(page, '16-tuyen-dung');
});
