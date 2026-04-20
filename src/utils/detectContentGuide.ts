import { contentGuides } from '../data/contentGuides';
import type { ContentGuideDetectionResult, ContentGuideId } from '../types';

// Minimum score required before we'll claim any match at all
const MIN_SCORE = 5;

// Gap required over second-best to claim "high" confidence
// (avoids high-confidence when two guides score similarly)
const MIN_GAP = 3;

// Number of distinct signal categories that must have matched
const MIN_SIGNAL_CATEGORIES = 2;

export function detectContentGuide(rawText: string): ContentGuideDetectionResult {
  const text = rawText.toLowerCase();

  const hasCdcIdentifier =
    text.includes('centers for disease control') ||
    /\bcdc\b/i.test(rawText);

  // Check for CDC DGHP first — signals are distinct from DGHT and mutually exclusive in practice.
  // Requires a CDC identifier plus any 2 of the 8 DGHP-specific signals.
  const dghpSignalChecks = [
    { label: 'CDC/DGHP identifier detected',                             matched: /cdc\/dghp/i.test(rawText) },
    { label: 'Division of Global Health Protection detected',            matched: /division of global health protection/i.test(rawText) },
    { label: 'CDC-RFA-JG- opportunity number detected',                  matched: /cdc-rfa-jg-/i.test(rawText) },
    { label: 'DGHP-SPECIFIC INSTRUCTIONS detected',                      matched: /dghp-specific instructions/i.test(rawText) },
    { label: 'DGHP NOFO Tracker detected',                               matched: /dghp nofo tracker/i.test(rawText) },
    { label: 'Global Health Security (GHS) detected',                    matched: /global health security \(ghs\)/i.test(rawText) },
    { label: 'Global Health Security Agenda (GHSA) detected',            matched: /global health security agenda \(ghsa\)/i.test(rawText) },
    { label: 'GHS cooperative agreements boilerplate detected',          matched: /we fund all global health security \(ghs\) cooperative agreements/i.test(rawText) },
  ];
  const dghpMatched = dghpSignalChecks.filter(s => s.matched);
  if (hasCdcIdentifier && dghpMatched.length >= 2) {
    return {
      detectedId: 'cdc-dghp',
      confidence: 'high',
      signals: dghpMatched.map(s => s.label),
    };
  }

  // Check for CDC/DGHT variants (more specific than CDC standard or Research).
  // Prefer cdc-dght-competitive when both competitive and SSJ signals are present.
  const hasDght = /\bdght\b/i.test(rawText);

  if (hasDght && hasCdcIdentifier) {
    const hasCompetitiveSignal =
      /\bcompetitive\b/i.test(rawText) || text.includes('build your application');
    const hasSsjSignal =
      /\bssj\b/i.test(rawText) || text.includes('prepare your application');

    if (hasCompetitiveSignal) {
      return {
        detectedId: 'cdc-dght-competitive',
        confidence: 'high',
        signals: ['CDC identifier detected', 'DGHT identifier detected', 'Competitive/Build Your Application signal detected'],
      };
    }
    if (hasSsjSignal) {
      return {
        detectedId: 'cdc-dght-ssj',
        confidence: 'high',
        signals: ['CDC identifier detected', 'DGHT identifier detected', 'SSJ/Prepare Your Application signal detected'],
      };
    }
  }

  // Check for CDC Research (more specific than CDC standard).
  // Require ≥2 of the 3 research-specific signals plus a CDC identifier.
  const researchSignals = [
    text.includes('era commons'),
    text.includes('phs 398'),
    text.includes('principal investigator'),
  ].filter(Boolean).length;

  if (researchSignals >= 2 && hasCdcIdentifier) {
    return {
      detectedId: 'cdc-research',
      confidence: 'high',
      signals: ['CDC identifier detected', 'eRA Commons / PHS 398 / principal investigator detected'],
    };
  }

  // Score every non-fast-path guide
  type ScoreEntry = {
    score: number;
    signals: string[];
    categoryHits: Set<string>; // which signal categories fired
  };

  const scoreMap: Partial<Record<ContentGuideId, ScoreEntry>> = {};

  for (const guide of contentGuides) {
    if (guide.id === 'cdc-research') continue;
    if (guide.id === 'cdc-dght-ssj') continue;
    if (guide.id === 'cdc-dght-competitive') continue;
    // cdc-dghp is detected exclusively via the fast-path above (2-of-8 DGHP signals +
    // hasCdcIdentifier). Its detectionSignals entries (abbreviations: ['CDC', 'DGHP'],
    // uniqueSections: ['DGHP Basic Information', 'Global Health Security']) would score
    // against every CDC document if included here, inflating CDC scores and causing
    // incorrect low-confidence results for standard CDC NOFOs.
    if (guide.id === 'cdc-dghp') continue;

    const guideSignals: string[] = [];
    let score = 0;
    const categoryHits = new Set<string>();

    for (const name of guide.detectionSignals.names) {
      if (text.includes(name.toLowerCase())) {
        score += 3;
        categoryHits.add('name');
        guideSignals.push(`"${name}" detected`);
      }
    }

    for (const abbr of guide.detectionSignals.abbreviations) {
      const pattern = new RegExp(`\\b${abbr}\\b`, 'i');
      if (pattern.test(rawText)) {
        score += 1;
        categoryHits.add('abbreviation');
        guideSignals.push(`"${abbr}" abbreviation detected`);
      }
    }

    if (guide.detectionSignals.contactOffice) {
      if (text.includes(guide.detectionSignals.contactOffice.toLowerCase())) {
        score += 2;
        categoryHits.add('contactOffice');
        guideSignals.push(`Contact office "${guide.detectionSignals.contactOffice}" detected`);
      }
    }

    if (guide.detectionSignals.uniqueSections) {
      for (const section of guide.detectionSignals.uniqueSections) {
        if (text.includes(section.toLowerCase())) {
          score += 1;
          categoryHits.add('uniqueSection');
          guideSignals.push(`Unique section "${section}" detected`);
        }
      }
    }

    scoreMap[guide.id] = { score, signals: guideSignals, categoryHits };
  }

  // Find best and second-best scores
  let bestId: ContentGuideId | null = null;
  let bestScore = 0;
  let secondBestScore = 0;

  for (const [id, { score }] of Object.entries(scoreMap) as [ContentGuideId, ScoreEntry][]) {
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestId = id;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (bestId === null || bestScore === 0) {
    return { detectedId: null, confidence: 'none', signals: ['No OpDiv identifiers found'] };
  }

  // At this point, bestId is guaranteed to be a ContentGuideId
  const resolvedBestId: ContentGuideId = bestId;

  // Determine HRSA sub-type
  const finalBestId: ContentGuideId = resolvedBestId.startsWith('hrsa-')
    ? detectHrsaSubtype(rawText, resolvedBestId)
    : resolvedBestId;

  const entry = scoreMap[finalBestId];
  const foundSignals = entry?.signals ?? [];
  const categoryCount = entry?.categoryHits.size ?? 0;

  // High confidence requires:
  // 1. Score meets minimum threshold
  // 2. At least 2 distinct signal categories matched
  // 3. Leads second-best by at least MIN_GAP (handles secondBestScore=0 correctly)
  const isHighConfidence =
    bestScore >= MIN_SCORE &&
    categoryCount >= MIN_SIGNAL_CATEGORIES &&
    bestScore - secondBestScore >= MIN_GAP;

  const confidence = isHighConfidence ? 'high' : (bestScore > 0 ? 'low' : 'none');

  return { detectedId: finalBestId, confidence, signals: foundSignals };
}

function detectHrsaSubtype(rawText: string, defaultId: ContentGuideId): ContentGuideId {
  const text = rawText.toLowerCase();

  if (text.includes('project description') && !text.includes('program description')) {
    return 'hrsa-construction';
  }
  if (text.includes('bureau of primary health care') || text.includes('bphc')) {
    return 'hrsa-bphc';
  }
  if (text.includes('maternal and child health bureau') || text.includes('mchb')) {
    return 'hrsa-mchb';
  }
  if (text.includes('bureau of health workforce') || text.includes('bhw')) {
    return 'hrsa-bhw';
  }

  return defaultId;
}
