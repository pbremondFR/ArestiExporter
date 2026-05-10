const { firefox } = require('playwright-core');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const { parseArgs } = require('node:util');

// Small stupid function just to have the number of messages in front of the log. Could be useful for a progress bar, for example.
var log_message_count = 0;
function logOutput(...args) {
	log_message_count++;
	console.log('#' + log_message_count, ...args);
}

// process.pkg is undefined when running with node in dev, but truthy when in the packaged exe
const baseDir = process.pkg ? path.dirname(process.execPath) : __dirname;

function processArchive(zipPath, targetDir, formIdentifier, prefix) {
	const zip = new AdmZip(zipPath);
	zip.extractAllTo(targetDir, true);

	const files = fs.readdirSync(targetDir);

	files.forEach(file => {
		if (file.endsWith('.zip')) {
			return;
		}

		// Extract the sequence number from the original filename
		const match = file.match(/(\d+)/);
		const figureNumber = match ? match[1].padStart(2, '0') : "00";
		const extension = path.extname(file);

		const newName = `${prefix}${formIdentifier}_Fig${figureNumber}${extension}`;

		fs.renameSync(
			path.join(targetDir, file),
			path.join(targetDir, newName)
		);
	});

	fs.unlinkSync(zipPath);
}

async function exportImages(arestiSequenceText, prefix, headless, outputdir) {
	// process.pkg is falsy when running with node in dev, but truthy when in the packaged exe
	// executablePath to undefined is the default behaviour, playwright will look for Firefox in its storage or wherever
	// Otherwise, we specify the Firefox install location (bundled with the app)
	const executablePath = process.pkg
		? path.join(path.dirname(process.execPath), 'firefox', 'firefox.exe')
		: undefined;

	const browser = await firefox.launch({
		executablePath,
		headless: headless,
		acceptDownloads: true,
		slowMo: 100,
		args: [
			'--allow-file-access-from-files',
			'--disable-features=InsecureDownloadWarnings'
		]
	});

	const page = await browser.newPage();

	const openaeroPath = path.join(baseDir, 'OpenAero', 'index.html');

	await page.goto(`file://${openaeroPath}`);

	// OpenAero launches this popup the first time site is open. But with Playwright, it's always the first time, so it always appears.
	logOutput("Waiting for first-time popup...");
	try {
		const closeButton = await page.waitForSelector('#t_closeAlert', { state: 'visible', timeout: 5000 });
		await closeButton.click();
		await page.waitForSelector('#t_closeAlert', { state: 'hidden', timeout: 5000 });
		logOutput("First-time popup closed");
	} catch (error) {
		logOutput("No first-time popup found, continue");
	}

	// Override default OpenAero values to have thicker lines, necessary for visibility on the overlay
	await page.evaluate(() => {
		OA.style.pos = 'stroke: black; stroke-width: 5px; fill: none; vector-effect: non-scaling-stroke;';
		OA.style.neg = 'stroke-dasharray: 5, 3; stroke: red; stroke-width: 5px; fill: none; vector-effect: non-scaling-stroke;';
		OA.style.negBW = 'stroke-dasharray: 4, 4; stroke: black; stroke-width: 3px; fill: none; vector-effect: non-scaling-stroke;';

		OA.style['openFigureStartMarker'] = 'stroke: black; stroke-width: 5px; fill: none; vector-effect: non-scaling-stroke;';
		OA.style['openFigureStartMarker-additional'] = 'stroke: #6060ff; stroke-width: 5px; fill: none; vector-effect: non-scaling-stroke;';
		OA.style['openFigureStartMarker-correct'] = 'stroke: #7cb342; stroke-width: 5px; fill: none; vector-effect: non-scaling-stroke;';
		OA.style['openFigureStartMarker-error'] = 'stroke: #ff6040; stroke-width: 5px; fill: none; vector-effect: non-scaling-stroke;';
	});

	await page.fill('#sequence_text', arestiSequenceText);

	// FORM B generation
	logOutput("Generating form B...");
	await page.click('#t_view');
	await page.click('#t_formB');

	const downloadFormBPromise = page.waitForEvent('download');
	await page.click('#t_file');
	await page.click('#t_saveFigsSeparate');
	await page.click('#t_saveFile');
	const dirFormB = path.join(outputdir, 'Form_B');

	if (!fs.existsSync(dirFormB)) {
		fs.mkdirSync(dirFormB, { recursive: true });
	}

	const downloadFormB = await downloadFormBPromise;
	const pathFormB = path.join(dirFormB, downloadFormB.suggestedFilename());
	await downloadFormB.saveAs(pathFormB);
	processArchive(pathFormB, dirFormB, "FormB", prefix);
	logOutput("Form B downloaded.");

	// FORM C generation
	logOutput("Generating form C...");
	await page.click('#t_view');
	await page.click('#t_formC');

	const downloadFormCPromise = page.waitForEvent('download');
	await page.click('#t_file');
	await page.click('#t_saveFigsSeparate');
	await page.click('#t_saveFile');

	const dirFormC = path.join(outputdir, 'Form_C');
	if (!fs.existsSync(dirFormC)) {
		fs.mkdirSync(dirFormC, { recursive: true });
	}

	const downloadFormC = await downloadFormCPromise;
	const pathFormC = path.join(dirFormC, downloadFormC.suggestedFilename());
	await downloadFormC.saveAs(pathFormC);
	processArchive(pathFormC, dirFormC, "FormC", prefix);
	logOutput("Form C downloaded.");


	logOutput("DONE.");
	await browser.close();
};

function exportFromSeqFile(filePath, headless, outputdir) {
	const xmlData = fs.readFileSync(filePath, 'utf8');

	// The default configuration ignores attributes. To parse attributes, use:
	// const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "_" });
	const parser = new XMLParser();

	const jsonObj = parser.parse(xmlData);

	const properties = {
		pilot: jsonObj.sequence.pilot,
		aircraftType: jsonObj.sequence.actype,
		aircraftReg: jsonObj.sequence.acreg,
		programName: jsonObj.sequence.program,
		sequenceText: jsonObj.sequence.sequence_text,
	}

	console.log(properties);

	const prefix = `${properties.pilot}_${properties.programName}_`;

	exportImages(properties.sequenceText, prefix, headless, outputdir);
}

const options = {
	sequencetext: {
		type: 'string',
		short: 't',
	},
	file: {
		type: 'string',
		short: 'f',
	},
	pilot: {
		type: 'string',
	},
	program: {
		type: 'string',
	},
	headless: {
		type: 'boolean',
	},
	outputdir: {
		type: 'string',
	},
};

function main() {
	const exitWithUsage = () => {
		console.error("Usage: node export_program.js [--sequencetext | --file] [sequence-text | .seq-file]");
		process.exit(1);
	};

	const { values, positionals } = parseArgs({
		options,
		strict: true,
		allowPositionals: false
	});

	var outputdir = values.outputdir;
	if (!outputdir) {
		outputdir = path.join(baseDir, 'output');
		console.log("Output directory: ", outputdir);
	}
	else {
		console.log("Output directory: ", outputdir)
	}

	// Clear directory before writing to it
	fs.emptyDirSync(outputdir)

	if (values.file) {
		exportFromSeqFile(values.file, !!values.headless, outputdir);
	}
	else if (values.sequencetext) {
		exportImages(values.sequencetext, `${values.pilot}_${values.program}_`, !!values.headless, outputdir);
	}
	else {
		exitWithUsage();
	}
}

(async () => {
	main();
})();
