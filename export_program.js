const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

const olanSequence = process.argv[2];

if (!olanSequence) {
	console.error("Error: no provided aresti (OLAN format) sequence.");
	process.exit(1);
}

(async () => {
	const browser = await firefox.launch({
		headless: false,
		acceptDownloads: true,
		slowMo: 100,
		args: [
            '--allow-file-access-from-files',
            '--disable-features=InsecureDownloadWarnings'
        ]
	});

	const page = await browser.newPage();

	const openaeroPath = path.join(__dirname, 'OpenAero', 'index.html');

	await page.goto(`file://${openaeroPath}`);

	// --- GESTION DE LA POPUP ---
	console.log("Waiting for introduction popup...");
	try {
		const closeButton = await page.waitForSelector('#t_closeAlert', { state: 'visible', timeout: 5000 });
		await page.waitForTimeout(500);
		await closeButton.click();
		await page.waitForSelector('#t_closeAlert', { state: 'hidden', timeout: 5000 });
		console.log("Annoying popup closed");
	} catch (error) {
		console.log("wtf no popup?");
	}

	await page.fill('#sequence_text', olanSequence);

	// FORM B generation
	console.log("Generating form B...");
	await page.click('#t_view');
	await page.click('#t_formB');

	const downloadFormBPromise = page.waitForEvent('download');
	await page.click('#t_file');
	await page.click('#t_saveFigsSeparate');
	await page.click('#t_saveFile');
    const dirFormB = path.join(__dirname, 'output', 'Form_B');

    if (!fs.existsSync(dirFormB)) {
        fs.mkdirSync(dirFormB, { recursive: true });
    }

	const downloadFormB = await downloadFormBPromise;
    await downloadFormB.saveAs(path.join(dirFormB, downloadFormB.suggestedFilename()));
    console.log("Form B downloaded.");

	// FORM C generation
	console.log("Generating form C...");
	await page.click('#t_view');
	await page.click('#t_formC');

	const downloadFormCPromise = page.waitForEvent('download');
	await page.click('#t_file');
	await page.click('#t_saveFigsSeparate');
	await page.click('#t_saveFile');

    const dirFormC = path.join(__dirname, 'output', 'Form_C');
    if (!fs.existsSync(dirFormC)) {
        fs.mkdirSync(dirFormC, { recursive: true });
    }

	const downloadFormC = await downloadFormCPromise;
    await downloadFormC.saveAs(path.join(dirFormC, downloadFormC.suggestedFilename()));
    console.log("Form C downloaded.");


	console.log("DONE.");
	await browser.close();
})();
