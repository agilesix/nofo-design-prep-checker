import type JSZip from 'jszip';

// Supported content guide identifiers
export type ContentGuideId =
  | 'acf'
  | 'acl'
  | 'cdc'
  | 'cdc-research'
  | 'cms'
  | 'ihs'
  | 'hrsa-bhw'
  | 'hrsa-bphc'
  | 'hrsa-construction'
  | 'hrsa-mchb'
  | 'hrsa-rr';

export interface ContentGuideEntry {
  id: ContentGuideId;
  displayName: string;
  opDiv: string;
  subType?: string;
  version: string;
  updatedAt: string;
  detectionSignals: {
    names: string[];
    abbreviations: string[];
    contactOffice?: string;
    uniqueSections?: string[];
  };
}

export interface ContentGuideDetectionResult {
  detectedId: ContentGuideId | null;
  confidence: 'high' | 'low' | 'none';
  signals: string[];
}

export interface ActiveContentGuide {
  id: ContentGuideId;
  entry: ContentGuideEntry;
  source: 'detected' | 'user-selected';
}

export interface ParsedDocument {
  html: string;
  sections: Section[];
  rawText: string;
  zipArchive: JSZip;
  /** Raw XML of word/document.xml — available synchronously so rules can parse OOXML. */
  documentXml: string;
  activeContentGuide: ActiveContentGuide | null;
}

export interface Section {
  id: string;
  heading: string;
  headingLevel: number;
  html: string;
  rawText: string;
  startPage: number;
}

export interface IssueInputSpec {
  type: 'text' | 'textarea' | 'text-list';
  label: string;
  fieldDescription?: string;
  placeholder?: string;
  prefill?: string;
  prefillNote?: string;
  hint?: string;
  maxLength?: number;
  validationPattern?: string;
  validationMessage?: string;
  targetField: string;
}

export interface Issue {
  id: string;
  ruleId: string;
  title: string;
  severity: 'error' | 'warning' | 'suggestion';
  sectionId: string;
  description: string;
  suggestedFix?: string;
  instructionOnly?: boolean;
  location?: string;
  page?: number | null;
  nearestHeading?: string | null;
  inputRequired?: IssueInputSpec;
  headingCard?: {
    boldText: string;
    matchType: 'exact' | 'partial' | 'positional' | 'none';
    matchGuideName?: string;
    suggestedLevel?: number;
    precedingLevel?: number;
    precedingText?: string;
  };
}

export interface AutoAppliedChange {
  ruleId: string;
  description: string;
}

export interface AcceptedFix {
  issueId: string;
  ruleId: string;
  targetField?: string;
  value?: string;
}

export interface Rule {
  id: string;
  contentGuideIds?: ContentGuideId[];
  autoApply?: boolean;
  check: (doc: ParsedDocument, options: RuleRunnerOptions) => Issue[] | AutoAppliedChange[] | (Issue | AutoAppliedChange)[];
}

export interface RuleRunnerOptions {
  contentGuideId: ContentGuideId | null;
}

export type IssueResolution = 'accepted' | 'skipped' | 'keptAsBold' | 'unreviewed';

export interface ReviewState {
  issues: Issue[];
  autoAppliedChanges: AutoAppliedChange[];
  resolutions: Record<string, IssueResolution>;
  activeContentGuide: ActiveContentGuide | null;
}

export type AppStep = 'upload' | 'parsing' | 'guide-selection' | 'review' | 'summary' | 'download';
