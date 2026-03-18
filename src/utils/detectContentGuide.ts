import { contentGuides } from '../data/contentGuides';
import type { ContentGuideDetectionResult, ContentGuideId } from '../types';

export function detectContentGuide(rawText: string): ContentGuideDetectionResult {
  const text = rawText.toLowerCase();
  const signals: string[] = [];

  // Check for CDC Research first (more specific than CDC)
  const isCdcResearch =
    text.includes('era commons') ||
    text.includes('phs 398') ||
    text.includes('principal investigator');

  if (isCdcResearch && (text.includes('centers for disease control') || text.includes(' cdc '))) {
    signals.push('CDC identifier detected', 'eRA Commons / PHS 398 / principal investigator detected');
    return { detectedId: 'cdc-research', confidence: 'high', signals };
  }

  // Check each content guide by detection signals
  const scoreMap: Record<ContentGuideId, { score: number; signals: string[] }> = {} as Record<
    ContentGuideId,
    { score: number; signals: string[] }
  >;

  for (const guide of contentGuides) {
    if (guide.id === 'cdc-research') continue; // handled above
    const guideSignals: string[] = [];
    let score = 0;

    for (const name of guide.detectionSignals.names) {
      if (text.includes(name.toLowerCase())) {
        score += 3;
        guideSignals.push(`"${name}" detected`);
      }
    }

    for (const abbr of guide.detectionSignals.abbreviations) {
      // Word-boundary check for abbreviations
      const pattern = new RegExp(`\\b${abbr}\\b`, 'i');
      if (pattern.test(rawText)) {
        score += 1;
        guideSignals.push(`"${abbr}" abbreviation detected`);
      }
    }

    if (guide.detectionSignals.contactOffice) {
      if (text.includes(guide.detectionSignals.contactOffice.toLowerCase())) {
        score += 2;
        guideSignals.push(`Contact office "${guide.detectionSignals.contactOffice}" detected`);
      }
    }

    if (guide.detectionSignals.uniqueSections) {
      for (const section of guide.detectionSignals.uniqueSections) {
        if (text.includes(section.toLowerCase())) {
          score += 1;
          guideSignals.push(`Unique section "${section}" detected`);
        }
      }
    }

    scoreMap[guide.id] = { score, signals: guideSignals };
  }

  // Find best match
  let bestId: ContentGuideId | null = null;
  let bestScore = 0;
  let secondBestScore = 0;

  for (const [id, { score }] of Object.entries(scoreMap) as [ContentGuideId, { score: number; signals: string[] }][]) {
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

  // Determine HRSA sub-type more specifically
  if (bestId && (bestId as string).startsWith('hrsa-')) {
    bestId = detectHrsaSubtype(rawText, bestId);
  }

  const foundSignals = scoreMap[bestId]?.signals ?? [];
  const confidence = bestScore >= 3 && bestScore > secondBestScore * 1.5 ? 'high' : 'low';

  return { detectedId: bestId, confidence, signals: foundSignals };
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
