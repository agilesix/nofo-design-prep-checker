export const content = {
  app: {
    title: 'NOFO Design Prep Checker',
    subtitle: 'Prepare your NOFO for design',
    tagline: 'Check your NOFO document for common issues before sending it to design.',
    notice: {
      heading: 'Internal tool — not for public distribution',
      body: 'This tool is for HHS staff and contractors working on NOFO design preparation. Do not share this URL publicly.',
    },
    privacy: {
      heading: 'Your document stays on your computer',
      body: 'This tool processes your NOFO entirely in your browser. No content is uploaded to a server, saved, or shared. When you close this tab, all data is cleared automatically.',
    },
    privacyNoticeFooter: 'No document content is transmitted to any server. All checks run in your browser.',
  },

  steps: {
    upload: {
      label: 'Upload',
      heading: 'Upload your NOFO',
    },
    parsing: {
      label: 'Analyzing',
      heading: 'Analyzing your document',
    },
    guideSelection: {
      label: 'Content guide',
      heading: 'Confirm content guide',
    },
    review: {
      label: 'Review',
      heading: 'Review issues',
    },
    summary: {
      label: 'Summary',
      heading: 'Summary report',
    },
    download: {
      label: 'Download',
      heading: 'Download your updated NOFO',
    },
  },

  upload: {
    helperText: 'Upload your NOFO Word document to prepare it for design. This tool checks formatting and structural issues — it does not modify your document\'s regulatory or policy content. The downloaded file is ready for design handoff; your original remains your source of truth.',
    dropzone: {
      label: 'Upload a .docx file',
      instruction: 'Drag and drop your NOFO .docx file here, or',
      buttonLabel: 'choose file',
      hint: 'Accepted file type: .docx. Maximum file size: 20 MB.',
      dragActiveLabel: 'Drop your file here',
    },
    errors: {
      invalidType: 'This tool only works with .docx files. Please re-save your document in Word as a .docx and try again.',
      tooLarge: 'This file is larger than expected for a NOFO document. Make sure you\'ve selected the right file. Very large files may take longer to process.',
      readError: 'Unable to read the file. Make sure it is a valid .docx file and try again.',
      parseError: 'We weren\'t able to read this file. It may be corrupted or in an unexpected format. Try re-saving it from Word as a new .docx file and uploading again. If the problem continues, email simplerNOFOs@agile6.com.',
      generic: 'An unexpected error occurred. Please try again.',
    },
    warnings: {
      mammoth: 'Some document elements may not have been parsed correctly.',
    },
    buttonHelperText: 'Checking usually takes a few seconds. Only .docx files are supported. If you have a .doc file, save it as .docx in Word first (File → Save As → Word Document).',
  },

  parsing: {
    status: 'Analyzing your document…',
    statusSteps: {
      reading: 'Reading document structure',
      detecting: 'Detecting content guide',
      running: 'Running checks',
      done: 'Analysis complete',
    },
  },

  guideSelection: {
    heading: 'Confirm content guide',
    intro: 'We detected the following content guide based on your document. Confirm or change the selection before continuing.',
    detectedLabel: 'Detected',
    confidenceHigh: 'High confidence',
    confidenceLow: 'Low confidence — please verify',
    confidenceNone: 'Not detected — please select manually',
    noneDetected: 'We could not automatically detect the content guide. Please select the appropriate guide.',
    changeLabel: 'Change content guide',
    selectLabel: 'Select a content guide',
    selectPlaceholder: '— Select a content guide —',
    continueButton: 'Continue with this guide',
    selectRequired: 'Select a content guide to continue. A content guide is required to run OpDiv-specific checks.',
    signals: {
      heading: 'Detection signals',
      intro: 'The following signals were used to identify the content guide:',
    },
    guides: {
      acf: 'ACF Content Guide',
      acl: 'ACL Content Guide',
      cdc: 'CDC Content Guide (Standard)',
      'cdc-research': 'CDC Content Guide (Research)',
      cms: 'CMS Content Guide',
      ihs: 'IHS Content Guide',
      'hrsa-bhw': 'HRSA BHW R&R Content Guide',
      'hrsa-bphc': 'HRSA BPHC Content Guide',
      'hrsa-construction': 'HRSA Construction Content Guide',
      'hrsa-mchb': 'HRSA MCHB R&R Content Guide',
      'hrsa-rr': 'HRSA R&R Content Guide',
    },
  },

  review: {
    heading: 'Review issues',
    intro: 'Review each issue and decide how to handle it. Changes will be applied when you download the updated document.',
    noIssues: {
      heading: 'No issues found',
      body: 'Your document passed all checks. Proceed to download your document.',
    },
    issueCount: (count: number): string => `${count} issue${count === 1 ? '' : 's'} found`,
    autoApplied: {
      heading: 'Auto-applied changes',
      intro: 'The following changes were applied automatically and do not require your review:',
    },
    filters: {
      label: 'Filter by severity',
      all: 'All issues',
      error: 'Errors',
      warning: 'Warnings',
      suggestion: 'Suggestions',
    },
    severity: {
      error: 'Error',
      warning: 'Warning',
      suggestion: 'Suggestion',
    },
    actions: {
      accept: 'Accept fix',
      skip: 'Skip',
      instructionOnlySkip: "I'll do it later",
      keepAsBold: 'Keep as bold',
      edit: 'Edit value',
    },
    resolution: {
      accepted: 'Fix accepted',
      skipped: 'Skipped',
      keptAsBold: 'Kept as bold',
      unreviewed: 'Not yet reviewed',
    },
    navigation: {
      previous: 'Previous issue',
      next: 'Next issue',
      backToList: 'Back to issue list',
    },
    progress: {
      label: (reviewed: number, total: number): string => `${reviewed} of ${total} reviewed`,
    },
    continueButton: 'Continue to summary',
    continueWarning: (unreviewed: number): string =>
      `${unreviewed} issue${unreviewed === 1 ? '' : 's'} not yet reviewed. You can continue, but unreviewed issues will not have fixes applied.`,
  },

  summary: {
    heading: 'Summary report',
    intro: 'Review the results of your document check.',
    sections: {
      accepted: 'Fixes accepted',
      skipped: 'Issues skipped',
      autoApplied: 'Auto-applied changes',
      noAction: 'Issues with no action',
    },
    empty: 'None',
    downloadButton: 'Continue to download',
    printButton: 'Print summary',
    startOverButton: 'Check another document',
  },

  download: {
    heading: 'Download your updated document',
    intro: 'Your document has been updated with the accepted fixes. Download it and review before sending to design.',
    button: 'Download updated .docx',
    filename: {
      suffix: '-design-prep',
    },
    noChanges: {
      heading: 'No changes to apply',
      body: 'No fixes were accepted, so no changes have been made to your document. You can still download the original.',
      button: 'Download original .docx',
    },
    startOver: 'Check another document',
    postDownload: {
      heading: 'Next steps',
      body: 'Review the downloaded document before sending it to design. If you find additional issues, you can run the checker again.',
    },
  },

  errors: {
    generic: {
      heading: 'Something went wrong',
      body: 'An unexpected error occurred. Please refresh the page and try again.',
      button: 'Refresh page',
    },
    boundary: {
      heading: 'Unexpected error',
      body: 'An error occurred while processing your request. Please try again.',
    },
  },

  metadata: {
    author: {
      label: 'Document author',
      hint: 'Should be the full OpDiv name followed by the abbreviation in parentheses, e.g., "Administration for Children and Families (ACF)".',
    },
    subject: {
      label: 'Document subject',
      hint: 'A one-sentence description of the NOFO. Begin with "A notice of funding opportunity from the…"',
    },
    keywords: {
      label: 'Keywords',
      hint: 'Comma-separated list of 8–10 specific terms from the NOFO.',
    },
    tagline: {
      label: 'Tagline',
      hint: 'A one-line summary of the NOFO, ~15–20 words.',
    },
  },

  headings: {
    matchTypes: {
      exact: 'Exact match in content guide',
      partial: 'Partial match in content guide',
      positional: 'Positional match — heading present but may differ',
      none: 'Not found in content guide',
    },
    issues: {
      wrongLevel: 'Heading level may be incorrect',
      missingRequired: 'Required heading not found',
      outOfOrder: 'Heading may be out of order',
    },
  },

  links: {
    issues: {
      rawUrl: 'Link uses raw URL as display text',
      clickHere: '"Click here" or similar non-descriptive link text',
      broken: 'Broken or malformed link',
      missingProtocol: 'Link is missing protocol (http:// or https://)',
      bookmark: 'Internal bookmark link may be broken',
    },
  },

  accessibility: {
    skipNav: 'Skip to main content',
    loadingSpinner: 'Loading…',
    fileInput: {
      label: 'Choose a .docx file to upload',
    },
  },
} as const;

export type ContentKey = typeof content;
