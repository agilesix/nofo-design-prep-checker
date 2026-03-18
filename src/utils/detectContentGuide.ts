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

  // Check for CDC Research first (more specific than CDC standard).
  // Require ≥2 of the 3 research-specific signals plus a CDC identifier.
  const researchSignals = [
    text.includes('era commons'),
    text.includes('phs 398'),
    text.includes('principal investigator'),
  ].filter(Boolean).length;

  const hasCdcIdentifier =
    text.includes('centers for disease control') ||
    /\bcdc\b/i.test(rawText);

  if (researchSignals >= 2 && hasCdcIdentifier) {
    return {
      detectedId: 'cdc-research',
      confidence: 'high',
      signals: ['CDC identifier detected', 'eRA Commons / PHS 398 / principal investigator detected'],
    };
  }

  // Score every non-research guide
  type ScoreEntry = {
    score: number;
    signals: string[];
    categoryHits: Set<string>; // which signal categories fired
  };

  const scoreMap: Record<ContentGuideId, ScoreEntry> = {};

  for (const guide of contentGuides) {
    if (guide.id === 'cdc-research') continue;

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

  // Preserve the originally scored id for signals and confidence
  const scoredId = bestId;
  let detectedId: ContentGuideId = scoredId;

  // Determine HRSA sub-type for the returned id only
  if ((detectedId as string).startsWith('hrsa-')) {
    detectedId = detectHrsaSubtype(rawText, detectedId);
  }

  const entry = scoreMap[scoredId];
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

  return { detectedId, confidence, signals: foundSignals };
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
