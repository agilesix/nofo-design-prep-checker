import { describe, it, expect } from 'vitest';
import { RuleRunner } from '../../utils/RuleRunner';
import type { Rule, ParsedDocument } from '../../types';
import JSZip from 'jszip';

function makeMinimalDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    html: '<p>Test document</p>',
    sections: [
      {
        id: 'section-preamble',
        heading: 'Document start',
        headingLevel: 0,
        html: '<p>Test document</p>',
        rawText: 'Test document',
        startPage: 1,
      },
    ],
    rawText: 'Test document',
    zipArchive: new JSZip(),
    documentXml: '',
    footnotesXml: '',
    endnotesXml: '',
    activeContentGuide: null,
    ...overrides,
  };
}

describe('RuleRunner', () => {
  it('runs universal rules regardless of contentGuideId', () => {
    const universalRule: Rule = {
      id: 'TEST-001',
      check: () => [
        {
          id: 'TEST-001-a',
          ruleId: 'TEST-001',
          title: 'Test issue',
          severity: 'warning',
          sectionId: 'section-preamble',
          description: 'A test issue.',
        },
      ],
    };

    const runner = new RuleRunner([universalRule]);
    const result = runner.run(makeMinimalDoc(), { contentGuideId: null });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.ruleId).toBe('TEST-001');
  });

  it('does not run OpDiv-specific rules when no contentGuideId is selected', () => {
    const opdivRule: Rule = {
      id: 'STRUCT-999',
      contentGuideIds: ['acf'],
      check: () => [
        {
          id: 'STRUCT-999-a',
          ruleId: 'STRUCT-999',
          title: 'OpDiv issue',
          severity: 'error',
          sectionId: 'section-preamble',
          description: 'An OpDiv-specific issue.',
        },
      ],
    };

    const runner = new RuleRunner([opdivRule]);
    const result = runner.run(makeMinimalDoc(), { contentGuideId: null });
    expect(result.issues).toHaveLength(0);
  });

  it('runs OpDiv-specific rules when the matching contentGuideId is selected', () => {
    const opdivRule: Rule = {
      id: 'STRUCT-999',
      contentGuideIds: ['acf'],
      check: () => [
        {
          id: 'STRUCT-999-a',
          ruleId: 'STRUCT-999',
          title: 'OpDiv issue',
          severity: 'error',
          sectionId: 'section-preamble',
          description: 'An OpDiv-specific issue.',
        },
      ],
    };

    const runner = new RuleRunner([opdivRule]);
    const result = runner.run(makeMinimalDoc(), { contentGuideId: 'acf' });
    expect(result.issues).toHaveLength(1);
  });

  it('does not run OpDiv-specific rules when a different contentGuideId is selected', () => {
    const opdivRule: Rule = {
      id: 'STRUCT-999',
      contentGuideIds: ['acf'],
      check: () => [
        {
          id: 'STRUCT-999-a',
          ruleId: 'STRUCT-999',
          title: 'OpDiv issue',
          severity: 'error',
          sectionId: 'section-preamble',
          description: 'An OpDiv-specific issue.',
        },
      ],
    };

    const runner = new RuleRunner([opdivRule]);
    const result = runner.run(makeMinimalDoc(), { contentGuideId: 'cms' });
    expect(result.issues).toHaveLength(0);
  });

  it('runs auto-apply rules and collects AutoAppliedChange results', () => {
    const autoRule: Rule = {
      id: 'AUTO-001',
      autoApply: true,
      check: () => [{ ruleId: 'AUTO-001', description: 'Auto-applied change' }],
    };

    const runner = new RuleRunner([autoRule]);
    const result = runner.run(makeMinimalDoc(), { contentGuideId: null });
    expect(result.autoAppliedChanges).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it('returns empty results for an empty rule list', () => {
    const runner = new RuleRunner([]);
    const result = runner.run(makeMinimalDoc(), { contentGuideId: null });
    expect(result.issues).toHaveLength(0);
    expect(result.autoAppliedChanges).toHaveLength(0);
  });
});

describe('detectContentGuide utility', () => {
  it('can be imported without errors', async () => {
    const { detectContentGuide } = await import('../../utils/detectContentGuide');
    expect(typeof detectContentGuide).toBe('function');
  });

  it('returns none confidence for an empty document', async () => {
    const { detectContentGuide } = await import('../../utils/detectContentGuide');
    const result = detectContentGuide('');
    expect(result.confidence).toBe('none');
    expect(result.detectedId).toBeNull();
  });

  it('detects ACF from full name', async () => {
    const { detectContentGuide } = await import('../../utils/detectContentGuide');
    const result = detectContentGuide(
      'This is a notice of funding opportunity from the Administration for Children and Families.'
    );
    expect(result.detectedId).toBe('acf');
  });

  it('detects CDC Research when eRA Commons is present', async () => {
    const { detectContentGuide } = await import('../../utils/detectContentGuide');
    const result = detectContentGuide(
      'Centers for Disease Control and Prevention CDC eRA Commons principal investigator PHS 398'
    );
    expect(result.detectedId).toBe('cdc-research');
  });
});

describe('getCategoryLabel utility', () => {
  it('returns correct label for known prefixes', async () => {
    const { getCategoryLabel } = await import('../../utils/getCategoryLabel');
    expect(getCategoryLabel('META-001')).toBe('Document metadata');
    expect(getCategoryLabel('LINK-001')).toBe('Links');
    expect(getCategoryLabel('TABLE-002')).toBe('Tables');
    expect(getCategoryLabel('NOTE-001')).toBe('Footnotes and endnotes');
    expect(getCategoryLabel('IMG-001')).toBe('Images');
    expect(getCategoryLabel('LIST-001')).toBe('Lists');
    expect(getCategoryLabel('STRUCT-001')).toBe('Required sections');
  });

  it('returns the prefix for unknown rule IDs', async () => {
    const { getCategoryLabel } = await import('../../utils/getCategoryLabel');
    expect(getCategoryLabel('UNKNOWN-001')).toBe('UNKNOWN');
  });
});

describe('contentGuides data', () => {
  it('exports all 13 content guides', async () => {
    const { contentGuides } = await import('../../data/contentGuides');
    expect(contentGuides).toHaveLength(13);
  });

  it('all content guides have required fields', async () => {
    const { contentGuides } = await import('../../data/contentGuides');
    for (const guide of contentGuides) {
      expect(guide.id).toBeTruthy();
      expect(guide.displayName).toBeTruthy();
      expect(guide.opDiv).toBeTruthy();
      expect(guide.version).toBeTruthy();
      expect(guide.updatedAt).toBeTruthy();
      expect(guide.detectionSignals.names.length).toBeGreaterThan(0);
      expect(guide.detectionSignals.abbreviations.length).toBeGreaterThan(0);
    }
  });

  it('getContentGuideById returns the correct guide', async () => {
    const { getContentGuideById } = await import('../../data/contentGuides');
    const guide = getContentGuideById('acf');
    expect(guide?.opDiv).toBe('ACF');
    expect(guide?.displayName).toBe('ACF Content Guide');
  });

  it('getContentGuideById returns undefined for unknown ID', async () => {
    const { getContentGuideById } = await import('../../data/contentGuides');
    const guide = getContentGuideById('unknown-guide');
    expect(guide).toBeUndefined();
  });
});

describe('rules index', () => {
  it('exports all rules without errors', async () => {
    const { allRules } = await import('../../rules');
    expect(allRules.length).toBeGreaterThan(0);
  });

  it('all rules have an id and check function', async () => {
    const { allRules } = await import('../../rules');
    for (const rule of allRules) {
      expect(rule.id).toBeTruthy();
      expect(typeof rule.check).toBe('function');
    }
  });

  it('auto-apply rules are flagged correctly', async () => {
    const { allRules } = await import('../../rules');
    const autoRules = allRules.filter(r => r.autoApply === true);
    expect(autoRules.length).toBeGreaterThan(0);
    for (const rule of autoRules) {
      expect(rule.autoApply).toBe(true);
    }
  });
});
