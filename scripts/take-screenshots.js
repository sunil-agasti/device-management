const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const dir = 'docs/screenshots';
  const fs = require('fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const pages = [
    { name: 'dashboard-light', url: '/device-management-portal', theme: 'light' },
    { name: 'dashboard-dark', url: '/device-management-portal', theme: 'dark' },
    { name: 'admin-light', url: '/admin-access', theme: 'light' },
    { name: 'admin-dark', url: '/admin-access', theme: 'dark' },
    { name: 'github-light', url: '/github-access', theme: 'light' },
    { name: 'github-dark', url: '/github-access', theme: 'dark' },
    { name: 'hostname-light', url: '/update-hostname', theme: 'light' },
    { name: 'hostname-dark', url: '/update-hostname', theme: 'dark' },
    { name: 'cleanup-light', url: '/cleanup', theme: 'light' },
    { name: 'cleanup-dark', url: '/cleanup', theme: 'dark' },
    { name: 'reports-light', url: '/reports', theme: 'light' },
    { name: 'reports-dark', url: '/reports', theme: 'dark' },
  ];

  for (const p of pages) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: p.theme,
    });
    const page = await context.newPage();
    try {
      await page.goto(`http://localhost:3000${p.url}`, { waitUntil: 'networkidle', timeout: 15000 });
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
