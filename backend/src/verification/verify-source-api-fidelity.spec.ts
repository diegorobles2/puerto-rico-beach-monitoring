import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { verifySourceApiFidelity } from './verify-source-api-fidelity';

const manifestPath = resolve(__dirname, 'fixtures/source-api-fidelity.v1.json');

describe('source-to-API fidelity verification', () => {
  it('compares more than 100 source, normalized, and API fields across DRNA and NWS', async () => {
    const report = await verifySourceApiFidelity({ manifestPath });
    const fields = report.comparisons.map((comparison) => comparison.field);
    const providers = new Set(report.comparisons.map((comparison) => comparison.provider));

    expect(report.totalComparisons).toBeGreaterThanOrEqual(100);
    expect(report.agreementPercent).toBe(100);
    expect(report.passed).toBe(true);
    expect(providers).toEqual(new Set(['DRNA', 'NWS_RISK', 'NWS_ALERTS']));
    expect(fields.some((field) => field.includes('stationId'))).toBe(true);
    expect(fields.some((field) => field.endsWith('.status'))).toBe(true);
    expect(fields.some((field) => field.includes('observedAt'))).toBe(true);
    expect(fields.some((field) => field.includes('alerts.0.'))).toBe(true);
  });

  it('reports a deliberately corrupted field and fails when agreement falls below the threshold', async () => {
    const singleFieldCorruption = await verifySourceApiFidelity({
      manifestPath,
      minimumAgreementPercent: 100,
      corruptApiFields: [{ caseId: 'drna-rw22-2026-09-21', apiField: 'status' }],
    });

    expect(singleFieldCorruption.mismatchCount).toBe(1);
    expect(singleFieldCorruption.comparisons.find((comparison) => comparison.field === 'api.status' && comparison.caseId === 'drna-rw22-2026-09-21'))
      .toMatchObject({ matched: false, expected: 'unknown', actual: '__deliberately_corrupted__' });
    expect(singleFieldCorruption.passed).toBe(false);

    const corruptedCase = await verifySourceApiFidelity({
      manifestPath,
      corruptCaseIds: ['drna-rw22-2026-09-21'],
    });
    expect(corruptedCase.agreementPercent).toBeLessThan(98);
    expect(corruptedCase.passed).toBe(false);
  });

  it('produces identical reports on repeated runs against the same captured fixtures', async () => {
    const first = await verifySourceApiFidelity({ manifestPath });
    const second = await verifySourceApiFidelity({ manifestPath });

    expect(second).toEqual(first);
  });

  it('keeps the manifest versioned and all cases linked to captured evidence', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      version: number;
      cases: Array<{ sourceEvidence: { fixture: string; sourceUrl: string; stationId: string | null } }>;
    };

    expect(manifest.version).toBe(1);
    expect(manifest.cases.length).toBeGreaterThanOrEqual(12);
    expect(manifest.cases.every((testCase) => testCase.sourceEvidence.fixture && testCase.sourceEvidence.sourceUrl)).toBe(true);
  });

  it('uses replay time for both sources while preserving historical DRNA status', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2040-01-01T00:00:00Z'));
    try {
      const report = await verifySourceApiFidelity({ manifestPath });
      expect(report.passed).toBe(true);
      const drna = report.comparisons.filter(row => row.provider === 'DRNA');
      expect(drna.filter(row => row.field === 'api.status').every(row => row.actual === 'unknown')).toBe(true);
      expect(drna.filter(row => row.field === 'api.availability').every(row => row.actual === 'stale')).toBe(true);
      expect(drna.filter(row => row.field === 'api.lastKnownStatus')).toHaveLength(10);
    } finally { clock.mockRestore(); }
  });

  it('does not round a below-threshold result into a passing result', async () => {
    const baseline = await verifySourceApiFidelity({ manifestPath });
    const threshold = (baseline.totalComparisons - 1) * 100 / baseline.totalComparisons + 0.000001;
    const report = await verifySourceApiFidelity({ manifestPath, minimumAgreementPercent: threshold,
      corruptApiFields: [{ caseId: 'drna-rw22-2026-09-21', apiField: 'status' }] });
    expect(report.mismatchCount).toBe(1);
    expect(report.passed).toBe(false);
  });

  describe('source mutation and fixture boundaries', () => {
    const backendRoot = resolve(__dirname, '../..');
    let directory: string;
    let path: string;
    let manifest: { cases: Array<{ provider: string; sourceEvidence: { fixture: string } }>; [key: string]: unknown };
    beforeEach(() => {
      directory = mkdtempSync(resolve(backendRoot, '.fidelity-test-'));
      path = resolve(directory, 'manifest.json');
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    });
    afterEach(() => {
      expect(dirname(resolve(directory))).toBe(backendRoot);
      rmSync(directory, { recursive: true, force: true });
    });

    it('detects corruption in raw NWS source through normalization and the HTTP API', async () => {
      const sourceCase = manifest.cases.find(row => row.provider === 'NWS_RISK')!;
      const source = JSON.parse(readFileSync(resolve(backendRoot, sourceCase.sourceEvidence.fixture), 'utf8'));
      expect(source.productText).toContain('Moderate');
      source.productText = source.productText.replace('Moderate', 'High');
      const sourcePath = resolve(directory, 'corrupted-source.json');
      writeFileSync(sourcePath, JSON.stringify(source));
      sourceCase.sourceEvidence.fixture = relative(backendRoot, sourcePath);
      writeFileSync(path, JSON.stringify(manifest));
      const report = await verifySourceApiFidelity({ manifestPath: path, minimumAgreementPercent: 100 });
      expect(report.passed).toBe(false);
      expect(report.comparisons).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: 'NWS_RISK', field: 'normalized.risk', expected: 'moderate', actual: 'high', matched: false }),
        expect.objectContaining({ provider: 'NWS_RISK', field: 'api.status', expected: 'moderate', actual: 'high', matched: false }),
      ]));
    });

    it.each(['../outside.txt', resolve(backendRoot, '../outside.txt')])('rejects escaping fixture path %s', async fixture => {
      manifest.cases[0].sourceEvidence.fixture = fixture;
      writeFileSync(path, JSON.stringify(manifest));
      await expect(verifySourceApiFidelity({ manifestPath: path })).rejects.toThrow(/Fixture path/);
    });

    it('rejects invalid replay clocks instead of silently passing', async () => {
      manifest.drnaReplayAsOf = 'invalid';
      writeFileSync(path, JSON.stringify(manifest));
      await expect(verifySourceApiFidelity({ manifestPath: path })).rejects.toThrow('Invalid replay timestamp');
    });
  });
});
