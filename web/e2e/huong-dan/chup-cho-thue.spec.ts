/**
 * Chụp ảnh màn hình cho hướng dẫn Cho thuê giàn giáo — Xưởng Nhà Việt Steel (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Thu hồi — chỉ mở màn hình
 * và biểu mẫu.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-cho-thue.spec.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/sx';
const EMAIL = 'sanxuat.nvs@nhavietgroup.test';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(page: Page, name: string, { keepHelp = false } = {}): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Trang tải phần mã theo lượt (lazy): networkidle tới trước khi trang kịp vẽ tiêu đề.
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (!keepHelp && (await gotIt.isVisible())) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('chụp màn hình Cho thuê giàn giáo', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  await shot(page, '01-trang-dau');

  await page.goto('/sx/tai-san-cho-thue');
  await shot(page, '02-danh-sach-hop-dong');
  await page.getByRole('button', { name: 'Lập hợp đồng thuê' }).click();
  await shot(page, '03-lap-hop-dong');

  await page.goto('/sx/tai-san-cho-thue');
  await page
    .getByRole('link', { name: /Đông Đô|NVS-HDT-2026-0001/ })
    .first()
    .click();
  await page.waitForURL(/tai-san-cho-thue\/[0-9a-f-]{36}/);
  await expect(page.getByText('Giàn giáo trong hợp đồng')).toBeVisible();
  await shot(page, '04-hop-dong-dong-do');
  await page.getByRole('button', { name: 'Thu hồi giàn giáo' }).click();
  await page.getByRole('heading', { name: 'Thu hồi giàn giáo' }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/05-thu-hoi.png` });

  await page.goto('/kho/gian-giao');
  await shot(page, '06-so-gian-giao');

  await page.goto('/sx/lenh-san-xuat');
  await shot(page, '07-lenh-san-xuat');

  /*
   * Biên bản thu hồi (0145). Ảnh 08 (chờ ký) và 09 (khung ký) chụp lúc biên bản Đông Đô trên
   * CSDL máy còn chưa ký; ký là thao tác không hoàn tác được, nên phép chụp này chỉ chụp lại
   * trạng thái hiện có (10 — đã ký) và KHÔNG bấm ký.
   */
  await page.goto('/sx/tai-san-cho-thue');
  await page
    .getByRole('link', { name: /Đông Đô|NVS-HDT-2026-0001/ })
    .first()
    .click();
  await page.waitForURL(/tai-san-cho-thue\/[0-9a-f-]{36}/);
  await page.getByRole('tab', { name: /Biên bản thu hồi/ }).click();
  await expect(page.getByText(/Biên bản NVS-BBTH/).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/10-bien-ban-da-ky.png` });
});
