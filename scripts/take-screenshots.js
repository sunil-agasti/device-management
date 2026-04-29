const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-web-security'] });
  const dir = 'docs/screenshots';
  const fs = require('fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const BASE = process.env.BASE_URL || 'http://localhost:3000';

  const simple = [
    { name: '01-dashboard-light', url: '/', theme: 'light' },
    { name: '02-dashboard-dark', url: '/', theme: 'dark' },
    { name: '03-admin-access-form', url: '/admin-access', theme: 'light' },
    { name: '07-github-access-form', url: '/github-access', theme: 'light' },
    { name: '12-cleanup-utility', url: '/cleanup', theme: 'light' },
    { name: '13-reports-analytics', url: '/reports', theme: 'light' },
    { name: '15-admin-access-form-dark', url: '/admin-access', theme: 'dark' },
    { name: '16-github-access-form-dark', url: '/github-access', theme: 'dark' },
    { name: '17-cleanup-utility-dark', url: '/cleanup', theme: 'dark' },
    { name: '18-reports-analytics-dark', url: '/reports', theme: 'dark' },
    { name: '19-hostname-update-form', url: '/update-hostname', theme: 'light' },
    { name: '20-hostname-update-form-dark', url: '/update-hostname', theme: 'dark' },
  ];

  const clickTabs = [
    { name: '21-reports-admin-logs', url: '/reports', theme: 'light', tabText: 'Admin Logs' },
    { name: '22-reports-github-logs', url: '/reports', theme: 'light', tabText: 'GitHub Logs' },
    { name: '23-reports-all-logs', url: '/reports', theme: 'light', tabText: 'All Logs' },
    { name: '24-reports-visitors', url: '/reports', theme: 'light', tabText: 'Visitors' },
    { name: '25-reports-visitors-dark', url: '/reports', theme: 'dark', tabText: 'Visitors' },
  ];

  for (const p of simple) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: p.theme,
      extraHTTPHeaders: { 'X-Forwarded-For': '17.0.0.1' },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    // Intercept visitor tracking to avoid CSRF issues
    await page.route('**/api/visitor', route => route.fulfill({ status: 200, body: '{"success":true}' }));
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${dir}/${p.name}.png`, fullPage: true });
      console.log(`✓ ${p.name}`);
    } catch (e) {
      console.log(`✗ ${p.name}: ${e.message}`);
    }
    await context.close();
  }

  for (const p of clickTabs) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: p.theme,
      extraHTTPHeaders: { 'X-Forwarded-For': '17.0.0.1' },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.route('**/api/visitor', route => route.fulfill({ status: 200, body: '{"success":true}' }));
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: p.tabText }).click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${dir}/${p.name}.png`, fullPage: true });
      console.log(`✓ ${p.name}`);
    } catch (e) {
      console.log(`✗ ${p.name}: ${e.message}`);
    }
    await context.close();
  }

  await browser.close();
  console.log('Done!');
})();
