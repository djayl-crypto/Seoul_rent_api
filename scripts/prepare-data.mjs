import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './build.mjs';
import { ARCHIVE_YEARS, DISTRICTS } from '../src/config.js';
import { analysisPeriod, createAccumulator, addRecords, validateAccumulator } from '../src/analysis.js';
import { ARCHIVE_COLUMNS, detectEncoding, readCsv, normalizeArchiveRow } from './lib/csv.mjs';

export async function prepareArchives(root = PROJECT_ROOT, period = analysisPeriod()) {
  const districts = Object.fromEntries(DISTRICTS.map(({ code }) => [code, { schemaVersion: 2, district: code, fileYears: ARCHIVE_YEARS, fileCounts: { 2022: 0, 2023: 0 }, accumulator: createAccumulator(period) }]));
  const sources = [];
  for (const year of ARCHIVE_YEARS) {
    const file = resolve(root, 'data', `서울특별시_전월세가_${year}.csv`);
    const before = await stat(file), encoding = await detectEncoding(file), hash = createHash('sha256');
    let header, rows = 0, unassignedRows = 0, overlapExcluded = 0;
    const receiptYears = new Set();
    for await (const values of readCsv(file, encoding, bytes => hash.update(bytes))) {
      if (!header) {
        header = values.map(value => value.trim());
        if (new Set(header).size !== header.length || Object.entries(ARCHIVE_COLUMNS).some(([key, korean]) => !header.includes(key) && !header.includes(korean))) throw new Error('ARCHIVE_HEADERS');
        continue;
      }
      if (values.length !== header.length) throw new Error('ARCHIVE_ROW_WIDTH');
      const row = normalizeArchiveRow(Object.fromEntries(header.map((name, index) => [name, values[index]])));
      if (!/^202[123]$/.test(row.RCPT_YR) || (year === 2022 && !row.CTRT_DAY.startsWith('2022'))) throw new Error('ARCHIVE_SOURCE_BOUNDARY');
      receiptYears.add(Number(row.RCPT_YR));
      rows++;
      const district = districts[row.CGG_CD];
      if (!district) { unassignedRows++; continue; }
      district.fileCounts[year]++;
      // The 2022 contract-year export owns 2022 contracts through receipt year 2023.
      if (year === 2023 && row.CTRT_DAY.startsWith('2022')) {
        overlapExcluded++; district.accumulator.sourceRows++;
        district.accumulator.excludedCounts.archiveOverlap = (district.accumulator.excludedCounts.archiveOverlap ?? 0) + 1;
        continue;
      }
      addRecords(district.accumulator, [row]);
    }
    const after = await stat(file);
    if (!header || rows === 0 || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('ARCHIVE_CHANGED_OR_EMPTY');
    sources.push({ year, rows, unassignedRows, overlapExcluded, receiptYears: [...receiptYears].sort(), encoding, bytes: before.size, sha256: hash.digest('hex') });
  }
  const runId = randomUUID(), directory = resolve(root, '.generated', 'archives', runId);
  await mkdir(directory, { recursive: true });
  for (const archive of Object.values(districts)) {
    validateAccumulator(archive.accumulator, archive.district, period);
    archive.sourceFiles = sources;
    await writeFile(resolve(directory, `${archive.district}.json`), JSON.stringify(archive));
  }
  const manifest = { schemaVersion: 2, runId, period, sources, districts: DISTRICTS.map(({ code }) => code) };
  await writeFile(resolve(root, '.generated', 'archives', 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await prepareArchives();
    console.log(JSON.stringify({ status: 'prepared', period: result.period, sources: result.sources.map(({ year, rows, encoding, unassignedRows }) => ({ year, rows, encoding, unassignedRows })) }));
  } catch { console.error('Archive preparation failed. Check data filenames, encoding, required columns and receipt years. No raw rows were logged.'); process.exitCode = 1; }
}
