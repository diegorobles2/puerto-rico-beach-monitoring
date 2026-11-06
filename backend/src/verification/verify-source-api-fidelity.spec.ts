import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      .toMatchObject({ matched: false, expected: 'advisory', actual: '__deliberately_corrupted__' });
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
});