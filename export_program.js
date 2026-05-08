const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const { parseArgs } = require('node:util');

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
	const browser = await firefox.launch({
		headless: headless,
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

	await page.fill('#sequence_text', arestiSequenceText);

	// FORM B generation
	console.log("Generating form B...");
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
	console.log("Form B downloaded.");

	// FORM C generation
	console.log("Generating form C...");
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
	console.log("Form C downloaded.");


	console.log("DONE.");
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
		outputdir = path.join(__dirname, 'output');
		console.log("ALLO: ", outputdir);
	}
	else {
		console.log("ALLO: ", outputdir)
	}

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
