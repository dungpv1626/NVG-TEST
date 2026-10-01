/**
 * Chụp ảnh màn hình cho hướng dẫn Quản trị hệ thống (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Tạo / Xác nhận — chỉ mở
 * màn hình và biểu mẫu. Ảnh «tài khoản vừa tạo» dùng phản hồi giả chặn ngay trong trình duyệt
 * (`page.route`), nên không có tài khoản nào được tạo thật.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-quan-tri.spec.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/qt';
const EMAIL = 'admin@nhavietgroup.test';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (await gotIt.isVisible()) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('chụp màn hình Quản trị hệ thống', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  await shot(page, '01-dashboard');

  await page.goto('/nen/quan-tri');
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  await shot(page, '02-nguoi-dung');

  // Thêm người dùng — điền biểu mẫu, không bấm Tạo.
  await page.getByRole('button', { name: 'Thêm người dùng' }).click();
  const form = page.getByRole('form', { name: 'Thêm người dùng' });
  await form.getByLabel(/Họ và tên/).fill('Trần Thị Mai');
  await form.getByLabel(/Email đăng nhập/).fill('mai.tran@nhavietgroup.vn');
  await form.getByLabel(/Pháp nhân/).selectOption({ label: 'NVC — Nhà Việt Cons' });
  await form.getByLabel(/^Vai trò/).selectOption({ label: 'Kế toán – Tài chính' });
  await form.getByLabel(/Chức danh/).fill('Kế toán viên');
  await form.getByLabel(/Phòng ban/).fill('NVC — Phòng Kế toán');
  await shot(page, '03-them-nguoi-dung');

  // Phản hồi giả cho đúng lượt bấm này: không tạo tài khoản thật.
  await page.route('**/admin/users', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: '00000000-0000-4000-8000-000000000000',
        email: 'mai.tran@nhavietgroup.vn',
        temporaryPassword: 'Kp7mWq3zRt8a',
      }),
    }),
  );
  await form.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Kp7mWq3zRt8a')).toBeVisible();
  await shot(page, '04-tai-khoan-vua-tao');
  await page.getByRole('button', { name: 'Đóng' }).click();

  await page.getByRole('button', { name: 'Ngừng truy cập' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, '05-ngung-truy-cap');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Hủy|Huỷ|Quay lại/ })
    .click();

  await page.goto('/nen/tham-so');
  await expect(page.getByRole('heading', { name: 'Tham số hệ thống' })).toBeVisible();
  await shot(page, '06-tham-so');
  await page.getByRole('button', { name: 'Chỉnh sửa' }).first().click();
  await expect(page.getByRole('button', { name: 'Lưu' })).toBeInViewport();
  await shot(page, '07-sua-tham-so');

  await page.goto('/nen/han-muc');
  await expect(page.getByRole('heading', { name: 'Hạn mức phê duyệt' })).toBeVisible();
  await shot(page, '08-han-muc');

  await page.goto('/nen/thoi-han');
  await expect(page.getByRole('heading', { name: 'Thời hạn xử lý' })).toBeVisible();
  await shot(page, '09-thoi-han');

  await page.goto('/nen/phan-cong');
  await expect(page.getByRole('heading', { name: 'Phân công công trường' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm phân công' }).click();
  await shot(page, '10-phan-cong');

  await page.goto('/nen/nhat-ky');
  await expect(page.getByRole('heading', { name: 'Nhật ký' })).toBeVisible();
  await page.getByText('Truy cập dữ liệu nhạy cảm', { exact: true }).click();
  await shot(page, '11-nhat-ky');

  await page.goto('/nen/bieu-mau-dau-bai');
  await expect(page.getByRole('heading', { name: 'Biểu mẫu đầu bài' })).toBeVisible();
  await shot(page, '12-bieu-mau-dau-bai');
});

test('chụp hộp Đổi mật khẩu', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  // Thẻ «Đã hiểu» của trợ giúp lần đầu nằm dưới lớp phủ của hộp thoại — đóng trước.
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (await gotIt.isVisible()) await gotIt.click();
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('menuitem', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Mật khẩu mới' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/13-doi-mat-khau.png` });
});
