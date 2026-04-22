import React, { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import type {
  AppStep,
  ParsedDocument,
  ActiveContentGuide,
  ReviewState,
  AcceptedFix,
  IssueResolution,
  ContentGuideId,
} from './types';
import { content } from './content';
import { RULES_REFERENCE_URL } from './constants';
import { parseDocx } from './utils/parseDocx';
import { detectContentGuide } from './utils/detectContentGuide';
import { detectPreNofo } from './utils/detectPreNofo';
import { buildDocx } from './utils/buildDocx';
import { RuleRunner } from './utils/RuleRunner';
import { allRules } from './rules';
import { getContentGuideById, contentGuides } from './data/contentGuides';
import StepIndicator from './components/StepIndicator';
import UploadStep from './components/UploadStep';
import ReviewStep from './components/ReviewStep';
import SummaryReport from './components/SummaryReport';
import DownloadStep from './components/DownloadStep';
import AboutPage from './pages/AboutPage';

export default function App(): React.ReactElement {
  const location = useLocation();
  const [step, setStep] = useState<AppStep>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [acceptedFixes, setAcceptedFixes] = useState<AcceptedFix[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reviewBannerDismissed, setReviewBannerDismissed] = useState(false);
  const [isPreNofo, setIsPreNofo] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, step]);

  const handleFileSelected = useCallback(async (file: File) => {
    setUploadedFile(file);
    setParseError(null);
    setAcceptedFixes([]);
    setIsProcessing(true);
    setReviewBannerDismissed(false);
    setStep('parsing');

    try {
      // First pass: parse with no content guide to detect it
      const initialDoc = await parseDocx(file, null);

      // Pre-NOFO detection: runs before rules to catch wrong template uploads
      const preNofoResult = detectPreNofo(initialDoc.html, file.name);
      setIsPreNofo(preNofoResult.detected);

      // Detect content guide
      const detection = detectContentGuide(initialDoc.rawText);

      let activeGuide: ActiveContentGuide | null = null;
      if (detection.detectedId) {
        const entry = getContentGuideById(detection.detectedId);
        if (entry) {
          activeGuide = {
            id: detection.detectedId,
            entry,
            source: 'detected',
          };
        }
      }

      // Re-parse with active guide attached
      const doc: ParsedDocument = { ...initialDoc, activeContentGuide: activeGuide };
      setParsedDoc(doc);

      // High-confidence detection → skip guide selection, run rules immediately
      if (detection.confidence === 'high' && activeGuide) {
        const runner = new RuleRunner(allRules);
        const result = runner.run(doc, { contentGuideId: activeGuide.id });

        const resolutions: Record<string, IssueResolution> = {};
        for (const issue of result.issues) {
          resolutions[issue.id] = 'unreviewed';
        }

        setReviewState({
          issues: result.issues,
          autoAppliedChanges: result.autoAppliedChanges,
          resolutions,
          activeContentGuide: activeGuide,
        });

        setStep('review');
      } else {
        // Low/no confidence → show guide selection screen
        setStep('guide-selection');
      }
    } catch (err) {
      console.error('Parse error:', err);
      setParseError(err instanceof Error ? err.message : content.upload.errors.parseError);
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleGuideConfirmed = useCallback((guideId: ContentGuideId | null) => {
    if (!parsedDoc) return;

    let activeGuide: ActiveContentGuide | null = null;
    if (guideId) {
      const entry = getContentGuideById(guideId);
      if (entry) {
        activeGuide = {
          id: guideId,
          entry,
          source: parsedDoc.activeContentGuide?.id === guideId ? 'detected' : 'user-selected',
        };
      }
    }

    const updatedDoc: ParsedDocument = { ...parsedDoc, activeContentGuide: activeGuide };
    setParsedDoc(updatedDoc);

    // Run rules
    const runner = new RuleRunner(allRules);
    const result = runner.run(updatedDoc, { contentGuideId: guideId });

    const resolutions: Record<string, IssueResolution> = {};
    for (const issue of result.issues) {
      resolutions[issue.id] = 'unreviewed';
    }

    setAcceptedFixes([]);
    setReviewState({
      issues: result.issues,
      autoAppliedChanges: result.autoAppliedChanges,
      resolutions,
      activeContentGuide: activeGuide,
    });

    setStep('review');
  }, [parsedDoc]);

  const handleGuideChangeFromReview = useCallback((guideId: ContentGuideId) => {
    if (!parsedDoc) return;
    const entry = getContentGuideById(guideId);
    if (!entry) return;

    const activeGuide: ActiveContentGuide = { id: guideId, entry, source: 'user-selected' };
    const updatedDoc: ParsedDocument = { ...parsedDoc, activeContentGuide: activeGuide };
    setParsedDoc(updatedDoc);

    const runner = new RuleRunner(allRules);
    const result = runner.run(updatedDoc, { contentGuideId: guideId });

    const resolutions: Record<string, IssueResolution> = {};
    for (const issue of result.issues) {
      resolutions[issue.id] = 'unreviewed';
    }

    setReviewState({
      issues: result.issues,
      autoAppliedChanges: result.autoAppliedChanges,
      resolutions,
      activeContentGuide: activeGuide,
    });
  }, [parsedDoc]);

  const handleReviewComplete = useCallback((fixes: AcceptedFix[], resolutions: Record<string, IssueResolution>) => {
    setAcceptedFixes(fixes);
    if (reviewState) {
      setReviewState({ ...reviewState, resolutions });
    }
    setStep('summary');
  }, [reviewState]);

  // Sync in-progress accepted fixes from ReviewStep to App state so that
  // navigating away (e.g. About page) and back does not lose user-entered values.
  const handleLiveFixesChange = useCallback((fixes: AcceptedFix[]) => {
    setAcceptedFixes(fixes);
  }, []);

  const handleProceedToDownload = useCallback(() => {
    setStep('download');
  }, []);

  const handleDownload = useCallback(async () => {
    if (!parsedDoc) return;

    // Detect iOS synchronously before any await. iOS blocks window.open() calls
    // that occur after an async gap, so we must open the target window here —
    // within the synchronous user-gesture context — and navigate it to the blob
    // URL once the document is ready.
    const isLegacyIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isIPadOSDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isIOS = (isLegacyIOSDevice || isIPadOSDesktopMode) && !(window as unknown as Record<string, unknown>).MSStream;
    const iosWindow = isIOS ? window.open('about:blank', '_blank') : null;
    if (iosWindow) {
      iosWindow.opener = null;
    }

    let blob: Blob;
    try {
      blob = await buildDocx(
        parsedDoc.zipArchive,
        acceptedFixes,
        reviewState?.autoAppliedChanges ?? []
      );
    } catch (err) {
      iosWindow?.close();
      throw err;
    }

    const originalName = uploadedFile?.name ?? 'nofo.docx';
    const downloadName = originalName.replace(/\.docx$/i, `${content.download.filename.suffix}.docx`);

    if (isIOS) {
      // Use a binary blob URL (not a data URI) so iOS gets the actual DOCX bytes.
      // iOS opens the blob in its built-in document viewer, where the user can
      // tap Share → Open in Word / Save to Files.
      const url = URL.createObjectURL(blob);
      let navigated = false;
      if (iosWindow && !iosWindow.closed) {
        try {
          iosWindow.location.href = url;
          navigated = true;
        } catch {
          // Window was closed or cross-origin blocked between open and navigate.
        }
      }
      if (!navigated) {
        // Pre-opened window unavailable; fall back to the current tab.
        window.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [parsedDoc, acceptedFixes, reviewState, uploadedFile]);

  const handleBack = useCallback(() => {
    if (step === 'download') setStep('summary');
    else if (step === 'summary') setStep('review');
    else if (step === 'review') setStep('upload');
  }, [step]);

  const handleStartOver = useCallback(() => {
    setStep('upload');
    setUploadedFile(null);
    setParsedDoc(null);
    setReviewState(null);
    setAcceptedFixes([]);
    setParseError(null);
    setReviewBannerDismissed(false);
    setIsPreNofo(false);
  }, []);

  const mainAppContent = (
    <main id="main-content" className="usa-section">
      <div className="grid-container">
        {step !== 'parsing' && step !== 'guide-selection' && (
          <StepIndicator currentStep={step} onBack={handleBack} />
        )}

        {step === 'upload' && (
          <UploadStep
            onFileSelected={handleFileSelected}
            isProcessing={isProcessing}
            error={parseError}
          />
        )}

        {step === 'parsing' && (
          <div className="margin-top-4" role="status" aria-live="polite">
            <h1 className="usa-h1">{content.steps.parsing.heading}</h1>
            <div className="usa-prose">
              <p>{content.parsing.status}</p>
            </div>
          </div>
        )}

        {step === 'guide-selection' && parsedDoc && (
          <GuideSelectionStep
            doc={parsedDoc}
            onConfirm={handleGuideConfirmed}
          />
        )}

        {step === 'review' && reviewState && parsedDoc && (
          <ReviewStep
            doc={parsedDoc}
            reviewState={reviewState}
            initialAcceptedFixes={acceptedFixes}
            onComplete={handleReviewComplete}
            onGuideChange={handleGuideChangeFromReview}
            onStartOver={handleStartOver}
            bannerDismissed={reviewBannerDismissed}
            onDismissBanner={setReviewBannerDismissed}
            isPreNofo={isPreNofo}
            onLiveFixesChange={handleLiveFixesChange}
          />
        )}

        {step === 'summary' && reviewState && (
          <SummaryReport
            reviewState={reviewState}
            onProceedToDownload={handleProceedToDownload}
            onGoBackToReview={handleBack}
          />
        )}

        {step === 'download' && (
          <DownloadStep
            acceptedFixes={acceptedFixes}
            autoAppliedCount={reviewState?.autoAppliedChanges.length ?? 0}
            fileName={uploadedFile?.name ?? 'nofo.docx'}
            onDownload={handleDownload}
            onStartOver={handleStartOver}
          />
        )}
      </div>
    </main>
  );

  return (
    <div className="usa-app">
      <a className="usa-skipnav" href="#main-content">
        {content.accessibility.skipNav}
      </a>

      <header className="usa-header usa-header--basic" role="banner">
        <div className="usa-nav-container">
          <div className="usa-navbar">
            <div className="usa-logo">
              <em className="usa-logo__text">
                <Link to="/" className="usa-logo__text">
                  {content.app.title}
                </Link>
              </em>
            </div>
            <button type="button" className="usa-menu-btn">Menu</button>
          </div>
          <nav aria-label="Primary navigation" className="usa-nav">
            <button type="button" className="usa-nav__close">
              <img src="/uswds/img/usa-icons/close.svg" role="img" alt="Close" />
            </button>
            <ul className="usa-nav__primary usa-accordion">
              <li className="usa-nav__primary-item">
                <Link to="/about" className="usa-nav__link">
                  <span>About</span>
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={mainAppContent} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>

      <footer role="contentinfo" className="site-footer">
        {/* ── Upper band: light mint background, brand + nav link ── */}
        <div className="site-footer__upper">
          <div className="site-footer__inner grid-container">
            <div className="site-footer__brand">
              <p className="margin-0 font-body-sm text-bold">SimplerNOFOs</p>
              <p className="margin-top-05 margin-bottom-0 font-body-xs text-base-dark">
                A tool for the HHS SimplerNOFOs initiative
              </p>
            </div>
            <nav aria-label="Footer navigation">
              <a
                href={RULES_REFERENCE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="font-body-sm"
                aria-label="Rules reference (opens in a new tab)"
              >
                Rules reference
                <span className="usa-sr-only"> (opens in a new tab)</span>
              </a>
              <Link to="/about" className="font-body-sm">About this tool</Link>
            </nav>
          </div>
        </div>

        {/* ── Lower band: dark forest green, privacy + copyright ── */}
        <div className="site-footer__lower">
          <div className="site-footer__inner site-footer__lower-inner grid-container">
            <p className="margin-0 font-body-3xs site-footer__privacy">
              🔒 {content.app.privacyNoticeFooter}
            </p>
            <p className="margin-0 font-body-3xs site-footer__copyright">
              © 2026 SimplerNOFOs — Apache 2.0 License
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Guide Selection Step ─────────────────────────────────────────────────────

interface GuideSelectionStepProps {
  doc: ParsedDocument;
  onConfirm: (guideId: ContentGuideId | null) => void;
}

function GuideSelectionStep({ doc, onConfirm }: GuideSelectionStepProps): React.ReactElement {
  const [selectedId, setSelectedId] = useState<ContentGuideId | ''>(
    doc.activeContentGuide?.id ?? ''
  );

  const detected = doc.activeContentGuide;

  return (
    <div className="margin-top-4">
      <h1 className="usa-h1">{content.steps.guideSelection.heading}</h1>
      <div className="usa-prose">
        <p>{content.guideSelection.intro}</p>
      </div>

      {detected && (
        <div className="usa-alert usa-alert--success usa-alert--slim margin-bottom-3">
          <div className="usa-alert__body">
            <p className="usa-alert__text">
              <strong>{content.guideSelection.detectedLabel}:</strong>{' '}
              {detected.entry.displayName} —{' '}
              {detected.entry.version}
            </p>
          </div>
        </div>
      )}

      {!detected && (
        <div className="usa-alert usa-alert--warning usa-alert--slim margin-bottom-3">
          <div className="usa-alert__body">
            <p className="usa-alert__text">{content.guideSelection.noneDetected}</p>
          </div>
        </div>
      )}

      <div className="usa-form-group margin-top-3">
        <label className="usa-label" htmlFor="content-guide-select">
          {content.guideSelection.selectLabel}
        </label>
        <select
          className="usa-select"
          id="content-guide-select"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value as ContentGuideId | '')}
          aria-describedby={selectedId.startsWith('cdc') ? 'content-guide-cdc-hint' : undefined}
        >
          <option value="">{content.guideSelection.selectPlaceholder}</option>
          {contentGuides.map(guide => (
            <option key={guide.id} value={guide.id}>
              {guide.displayName} ({guide.version})
            </option>
          ))}
        </select>
        {selectedId.startsWith('cdc') && (
          <span id="content-guide-cdc-hint" className="usa-hint display-block font-body-xs margin-top-1">
            {content.guideSelection.cdcHint}
          </span>
        )}
      </div>

      <div className="margin-top-4">
        <button
          type="button"
          className="usa-button"
          disabled={!selectedId}
          onClick={() => onConfirm(selectedId !== '' ? selectedId : null)}
        >
          {content.guideSelection.continueButton}
        </button>
      </div>

      {!selectedId && (
        <div className="usa-alert usa-alert--warning usa-alert--slim margin-top-3">
          <div className="usa-alert__body">
            <p className="usa-alert__text">{content.guideSelection.selectRequired}</p>
          </div>
        </div>
      )}
    </div>
  );
}
