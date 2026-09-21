/**
 * Drives the traffic sign assistant in a real browser and says what it did.
 *
 * Chromium plays the generated video through its fake camera, and the position is moved along so
 * that the GPS reports a real speed. That covers everything the unit tests cannot: opening the
 * camera, reading frames back off a canvas, the detection loop, the GPS, and the recording.
 *
 * Screenshots land in the work directory, and every step prints what it found, so a run either
 * confirms the page works or says where it stopped.
 */
const fs = require('fs');
const path = require('path');

const { PORT, SHOTS_DIR, VIDEO_FILE, WORK_DIR, requirePlaywright } = require('./paths');

const URL = `http://127.0.0.1:${PORT}/index.html`;

// A country road in Lower Austria, heading north.
const START = { latitude: 48.2, longitude: 16.0 };
const SPEED_KMH = 60;
const METRES_PER_DEGREE_LAT = 111320;

const shouldRecord = !process.argv.includes('--no-record');

const textOf = async (page, selector) => {
  const element = await page.$(selector);
  return element ? (await element.textContent()).trim() : null;
};

/** Waits until the head-up display shows a limit, or gives up. */
const waitForLimit = async (page, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await textOf(page, '[class*="limitValue"]');
    if (value && value !== '–') {
      return value;
    }
    await page.waitForTimeout(250);
  }
  return null;
};

(async () => {
  if (!fs.existsSync(VIDEO_FILE)) {
    console.error(`No video at ${VIDEO_FILE}. Run makeDriveVideo.js first.`);
    process.exit(1);
  }
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${VIDEO_FILE}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 430, height: 940 },
    deviceScaleFactor: 2,
    permissions: ['geolocation'],
    geolocation: { ...START, accuracy: 8 },
    acceptDownloads: true,
    locale: 'de-AT',
  });

  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', message => {
    // The marketplace logo is a remote asset this preview cannot reach; that is not a page fault.
    if (message.type() === 'error' && !message.text().includes('ERR_TUNNEL')) {
      problems.push(`console: ${message.text()}`);
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Vor der Fahrt', { timeout: 15000 });
  await page.screenshot({ path: path.join(SHOTS_DIR, '1-start.png'), fullPage: true });
  console.log('start screen ok');

  // Move the position once a second, which is what gives the GPS a speed to report.
  let seconds = 0;
  const ticker = setInterval(() => {
    seconds++;
    context
      .setGeolocation({
        latitude: START.latitude + ((SPEED_KMH / 3.6) * seconds) / METRES_PER_DEGREE_LAT,
        longitude: START.longitude,
        accuracy: 8,
      })
      .catch(() => {});
  }, 1000);

  await page.click('button:has-text("Assistent starten")');
  await page.waitForSelector('[class*="limitSign"]', { timeout: 15000 });
  await page.click('button:has-text("Erkennung anzeigen")');

  const limit = await waitForLimit(page, 45000);
  console.log('limit recognised:', limit);
  await page.screenshot({ path: path.join(SHOTS_DIR, '2-drive.png'), fullPage: true });

  if (shouldRecord) {
    console.log('recording …');
    await page.click('button:has-text("Aufnahme starten")');
    await page.waitForTimeout(20000);
    await page.click('button:has-text("Aufnahme stoppen")');
    await page.waitForTimeout(1500);
    console.log('recorded:', await textOf(page, '[class*="recordCount"]'));
  }

  // Let the warning come due: it waits a few seconds of sustained speed before it speaks.
  await page.waitForTimeout(6000);
  const speed = await textOf(page, '[class*="speedValue"]');
  const debug = await page.$$eval('[class*="debugRow"]', rows =>
    rows.map(r => r.textContent.trim())
  );
  console.log('speed:', speed, '| debug:', JSON.stringify(debug));
  await page.screenshot({ path: path.join(SHOTS_DIR, '3-warning.png'), fullPage: true });

  await page.click('button:has-text("Beenden")');
  clearInterval(ticker);

  if (shouldRecord) {
    const reviewButton = await page.waitForSelector('button:has-text("Aufnahme ansehen")', {
      timeout: 10000,
    });
    console.log('review:', (await reviewButton.textContent()).trim());
    await reviewButton.click();
    await page.waitForSelector('canvas[class*="frame"]', { timeout: 10000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS_DIR, '4-review.png'), fullPage: true });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('button:has-text("Als ZIP herunterladen")'),
    ]);
    const archive = path.join(WORK_DIR, 'export.zip');
    await download.saveAs(archive);
    console.log(`export: ${archive} (${(fs.statSync(archive).size / 1024).toFixed(0)} kB)`);
  }

  await browser.close();

  console.log(`screenshots: ${SHOTS_DIR}`);
  if (problems.length) {
    console.log('PROBLEMS:');
    problems.slice(0, 10).forEach(problem => console.log(`  ${problem}`));
    process.exit(1);
  }
  console.log('no console errors');
})().catch(error => {
  console.error('FAILED', error.message);
  process.exit(1);
});
