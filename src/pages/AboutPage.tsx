import React, { useEffect, useRef, useState } from 'react';
import BackLink from '../components/BackLink';

// ─── Impact stats ─────────────────────────────────────────────────────────────

const IMPACT_STATS: { headline: string; description: string }[] = [
  {
    headline: '2.5–3.5 hrs saved per NOFO',
    description: 'of staff time returned to program work',
  },
  {
    headline: '750–1,050 hrs saved annually',
    description: 'across 300 SimplerNOFOs per year',
  },
  {
    headline: 'Every link, every time',
    description:
      'a typical NOFO has 60–100+ hyperlinks — the manual check was often done partially or skipped entirely',
  },
  {
    headline: 'Consistent quality',
    description:
      'the same checks applied to every document, across all OpDivs, regardless of who prepared it',
  },
  {
    headline: 'Less precision-intensive, repetitive work',
    description:
      'the issue, the reason it matters, and exactly what to do are surfaced together — no context switching, no hunting through a dense content guide',
  },
];

// ─── Accordion (React-state driven, USWDS markup) ─────────────────────────────

function Accordion({
  id,
  heading,
  children,
}: {
  id: string;
  heading: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="usa-accordion margin-top-4">
      <h4 className="usa-accordion__heading">
        <button
          type="button"
          className="usa-accordion__button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(o => !o)}
        >
          {heading}
        </button>
      </h4>
      <div
        id={id}
        className="usa-accordion__content usa-prose about-prose"
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage(): React.ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main id="main-content" className="about-main">

      {/* ── Top back navigation ───────────────────────────────────────────── */}
      <div className="grid-container padding-top-3 padding-bottom-0">
        <BackLink to="/">← Back to the checker</BackLink>
      </div>

      {/* ── Hero heading ──────────────────────────────────────────────────── */}
      <div className="about-hero padding-y-6">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-8">
              <h1
                className="usa-h1 margin-0"
                tabIndex={-1}
                ref={headingRef}
              >
                About the NOFO Design Prep Checker
              </h1>
              <p className="font-body-md margin-top-2 margin-bottom-0">
                A tool built for the HHS SimplerNOFOs initiative to reduce
                administrative burden and improve document quality before design
                handoff.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 1: Impact ─────────────────────────────────────────────── */}
      <section aria-labelledby="about-impact" className="usa-section bg-base-lightest">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-10">
              <h2 id="about-impact" className="usa-h2 margin-top-0">Impact</h2>
              <div className="usa-prose about-prose">
                <p className="font-body-md">
                  Before this tool, preparing a NOFO Word document for design was a
                  manual process that took{' '}
                  <strong>3 to 4 hours</strong> — working through a dense content
                  guide section by section, checking metadata fields, verifying
                  dozens of hyperlinks, reviewing table structures, and fixing each
                  problem found directly in the Word document.
                </p>
                <p>
                  This tool automates that process. Upload your document, review the
                  flagged issues inline, accept the fixes you want applied, and
                  download a corrected file — in about{' '}
                  <strong>10 minutes</strong>.
                </p>
              </div>

              <div className="about-impact-card margin-top-4">
                {IMPACT_STATS.map((row, i) => (
                  <div
                    key={row.headline}
                    className={i < IMPACT_STATS.length - 1 ? 'about-impact-card__row about-impact-card__row--divided' : 'about-impact-card__row'}
                  >
                    <p className="about-impact-card__headline text-primary-darker">{row.headline}</p>
                    <p className="about-impact-card__description">{row.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: What this tool does ────────────────────────────────── */}
      <section aria-labelledby="about-what" className="usa-section">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-8">
              <h2 id="about-what" className="usa-h2 margin-top-0">What this tool does</h2>
              <div className="usa-prose about-prose">
                <p>
                  The NOFO Design Prep Checker helps you prepare Word documents by
                  checking them against a set of structural and formatting rules,
                  flagging issues that are known to cause problems during PDF
                  generation, and telling you exactly how to fix them — including
                  specific instructions for filling in missing metadata fields.
                </p>
              </div>

              <div className="usa-alert usa-alert--info margin-top-4" role="note">
                <div className="usa-alert__body">
                  <h3 className="usa-alert__heading">Your document never leaves your device</h3>
                  <p className="usa-alert__text">
                    All checks run entirely in your browser. No content is transmitted
                    to any server, stored in any database, or retained after you close
                    the tab. This is intentional: NOFO drafts are pre-decisional agency
                    documents and are not for public release until published on
                    grants.gov.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Who this tool is for ───────────────────────────────── */}
      <section aria-labelledby="about-who" className="usa-section bg-base-lightest">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-8">
              <h2 id="about-who" className="usa-h2 margin-top-0">Who this tool is for</h2>
              <div className="usa-prose about-prose">
                <p>
                  Anyone who uses NOFO Builder, or who prepares documents that will
                  be imported into it.
                </p>
                <p>
                  Right now, that's primarily{' '}
                  <strong>coaches and designers</strong> who run design prep before
                  import. As NOFO Builder scales to more users, this tool extends
                  with it — to HHS OG policy makers, OpDiv grant writers, and anyone
                  else in the NOFO authoring workflow who wants to catch structural
                  and formatting issues before their document reaches the design prep
                  stage.
                </p>
                <p>
                  You do not need technical knowledge of Word formatting or document
                  structure to use this tool. Every issue it flags comes with a
                  plain-language explanation of what is wrong, why it matters, and
                  exactly what to do about it.
                </p>
                <div className="usa-summary-box margin-top-4" role="note">
                  <div className="usa-summary-box__body">
                    <h3 className="usa-summary-box__heading">What this tool does not do</h3>
                    <div className="usa-summary-box__text">
                      <p>
                        This tool does not check, modify, or comment on the substantive
                        content of your NOFO — the regulatory language, program
                        requirements, eligibility criteria, or award details. Those are
                        yours. This tool only checks whether your document is correctly
                        structured and formatted to produce a high-quality, accessible
                        PDF.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 4: How AI shaped this tool ────────────────────────────── */}
      <section aria-labelledby="about-ai" className="usa-section">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-8">
              <h2 id="about-ai" className="usa-h2 margin-top-0">How AI shaped this tool</h2>
              <div className="usa-prose about-prose">
                <p>
                  This tool was built in support of the SimplerNOFOs initiative at
                  the U.S. Department of Health and Human Services (HHS).
                </p>
                <p>
                  The development of this tool used AI assistance — specifically,
                  large language model tools were used to accelerate coding, review
                  logic, and draft documentation. That approach reflects federal
                  policy encouraging the responsible use of AI to reduce
                  administrative burden and improve the quality of government
                  technology.
                </p>
                <p>Specifically, this tool was developed in alignment with:</p>
                <ul>
                  <li>
                    <strong>HHS AI Strategy (December 2025)</strong> — Establishes a
                    "OneHHS" approach to integrating AI across internal operations,
                    research, and public health. One of its five pillars promotes
                    workforce development and burden reduction — using AI to free up
                    staff from repetitive administrative tasks so they can focus on
                    mission-critical work.
                  </li>
                  <li>
                    <strong>
                      Executive Order 14179 — Removing Barriers to American Leadership
                      in Artificial Intelligence (January 23, 2025)
                    </strong>{' '}
                    — Directs federal agencies to remove obstacles to AI adoption and
                    develop an action plan to advance U.S. AI leadership.
                  </li>
                  <li>
                    <strong>
                      OMB Memorandum M-25-21 — Accelerating Federal Use of AI through
                      Innovation, Governance, and Public Trust (February 2025)
                    </strong>{' '}
                    — Directs agencies to accelerate the use of AI to improve
                    government services. This tool follows those principles: AI was
                    used in the development process, not in the document review
                    process itself, which is 100% deterministic and rule-based.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: Policy alignment ───────────────────────────────────── */}
      <section aria-labelledby="about-policy-alignment" className="usa-section bg-base-lightest">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-8">
              <h2 id="about-policy-alignment" className="usa-h2 margin-top-0">Policy alignment</h2>
              <div className="usa-prose about-prose">
                <p>
                  This tool was designed to support compliance with the following
                  laws, executive orders, and federal policies. This section is
                  provided for transparency.
                </p>
              </div>

              <Accordion id="policy-plain-language" heading="Plain language in federal funding announcements">
                <ul className="usa-list">
                  <li>
                    <strong>Plain Writing Act of 2010 (Pub. L. 111-274)</strong> —
                    Requires federal agencies to write &ldquo;clear government
                    communication that the public can understand and use.&rdquo; NOFOs
                    are covered documents under this Act. This tool helps NOFO writers
                    catch structural and formatting issues before those documents are
                    finalized.
                  </li>
                  <li>
                    <strong>
                      Executive Order 14332 &mdash; Improving Oversight of Federal
                      Grantmaking (August 7, 2025)
                    </strong>{' '}
                    &mdash; Requires that all funding opportunity announcements be
                    &ldquo;written in plain language&rdquo; with the goal of minimizing
                    the need for legal or technical expertise to understand them. It
                    applies directly to HHS, identified in the Order as the largest
                    federal grantmaking agency. This tool helps NOFO authors produce
                    cleaner, more readable documents before submission.
                  </li>
                </ul>
              </Accordion>

              <Accordion id="policy-accessibility" heading="Accessible federal digital services">
                <ul className="usa-list">
                  <li>
                    <strong>
                      Section 508 of the Rehabilitation Act of 1973, as amended
                      (29 U.S.C. &sect; 794d)
                    </strong>{' '}
                    &mdash; Requires federal agencies to ensure that electronic and
                    information technology is accessible to people with disabilities.
                    NOFO Builder produces accessible, 508-compliant PDFs. This tool
                    helps ensure that the Word documents imported into NOFO Builder are
                    correctly structured &mdash; with proper heading hierarchy,
                    accessible tables, and alt text on images &mdash; so that the
                    downstream PDF output meets 508 standards.
                  </li>
                  <li>
                    <strong>
                      21st Century Integrated Digital Experience Act (21st Century
                      IDEA), Pub. L. 115-336 (2018)
                    </strong>{' '}
                    &mdash; Requires federal agencies to modernize their websites,
                    digitize services, and improve digital experiences. This tool is a
                    digitized, browser-based alternative to a manual paper checklist,
                    consistent with the Act&rsquo;s mandate to move government services
                    online.
                  </li>
                  <li>
                    <strong>
                      Executive Order &mdash; Improving Our Nation Through Better
                      Design (&ldquo;America by Design,&rdquo; August 21, 2025)
                    </strong>{' '}
                    &mdash; Directs federal agencies to deliver digital and physical
                    experiences that are &ldquo;both beautiful and efficient,&rdquo;
                    mandates government-wide compliance with the 21st Century IDEA Act,
                    and calls on GSA to update the U.S. Web Design System. This tool
                    uses USWDS 3.x &mdash; the same version used in NOFO Builder
                    &mdash; consistent with this direction.
                  </li>
                </ul>
              </Accordion>

              <Accordion id="policy-ai-operations" heading="AI in federal operations">
                <ul className="usa-list">
                  <li>
                    <strong>HHS AI Strategy (December 4, 2025)</strong> &mdash;
                    HHS&rsquo;s department-wide strategy for integrating AI across
                    operations, structured around five pillars including workforce
                    development and burden reduction. This tool was built with AI
                    assistance as a direct application of that pillar.
                  </li>
                  <li>
                    <strong>
                      Executive Order 14179 &mdash; Removing Barriers to American
                      Leadership in Artificial Intelligence (January 23, 2025)
                    </strong>{' '}
                    &mdash; Directs federal agencies to remove obstacles to AI
                    adoption. This tool demonstrates a model for responsible AI use in
                    government technology development: AI in the build process,
                    deterministic rules in the product.
                  </li>
                  <li>
                    <strong>
                      OMB Memorandum M-25-21 &mdash; Accelerating Federal Use of AI
                      through Innovation, Governance, and Public Trust (February 2025)
                    </strong>{' '}
                    &mdash; Directs agencies to accelerate responsible AI adoption.
                    This project follows the governance principle by keeping AI out of
                    the document review engine while using it in the development
                    process.
                  </li>
                </ul>
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: No AI in the review engine ─────────────────────────── */}
      <section aria-labelledby="about-policy" className="usa-section">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-8">
              <h2 id="about-policy" className="usa-h2 margin-top-0">
                No AI in the review engine — and that's deliberate
              </h2>
              <div className="usa-prose about-prose">
                <p>
                  The document checks in this tool are entirely deterministic. Every
                  rule is a specific, auditable TypeScript function. The same document
                  will always produce the same results, every time, with no
                  variability.
                </p>
                <p>We made this choice deliberately, for three reasons:</p>
                <ol>
                  <li>
                    <strong>Your documents are sensitive.</strong> NOFO drafts are
                    pre-decisional agency documents. Sending them to an external AI
                    model API would transmit their contents off your device and off
                    the HHS network. We don't do that.
                  </li>
                  <li>
                    <strong>You need to be able to explain the results.</strong> If
                    this tool flags an issue, you should be able to point to the exact
                    rule that triggered it. Deterministic rules make that possible. AI
                    model outputs don't.
                  </li>
                  <li>
                    <strong>Consistency matters.</strong> A rule-based system gives
                    the same result every time. AI models can produce different outputs
                    for the same input, which is not appropriate for a compliance
                    checking tool.
                  </li>
                </ol>
              </div>

              <Accordion
                id="about-ai-future"
                heading="What AI could do here — if the data sensitivity problem were solved"
              >
                <p>
                  That said, there are real use cases where AI assistance could add
                  meaningful value to NOFO document preparation, if document content
                  could be processed in a secure, on-premises or FedRAMP-authorized
                  environment. Examples include:
                </p>
                <ul>
                  <li>
                    <strong>Plain language scoring</strong> — An AI model could assess
                    whether a section is written at an appropriate reading level for
                    grant applicants, flagging dense or jargon-heavy passages for
                    revision. This would directly support the plain language
                    requirements in EO 14332.
                  </li>
                  <li>
                    <strong>Consistency checking</strong> — A model could detect when
                    a scoring criterion mentioned in the Merit Review section is not
                    defined earlier in the document, or when a date appears in one
                    section but not another.
                  </li>
                  <li>
                    <strong>Draft content suggestions</strong> — For sections where
                    metadata or standard language is missing, a model could propose
                    draft text based on the document context, which a writer could
                    then review and accept or edit.
                  </li>
                </ul>
                <p>
                  None of these features are in this tool today. If HHS or a future
                  vendor builds them, the data sensitivity and governance questions
                  would need to be addressed first — likely through an on-premises or
                  FedRAMP High environment — and all AI-generated suggestions would
                  need to be clearly labeled as suggestions requiring human review.
                </p>
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: About SimplerNOFOs ─────────────────────────────────── */}
      <section aria-labelledby="about-simpler" className="usa-section bg-base-lightest">
        <div className="grid-container">
          <div className="grid-row">
            <div className="desktop:grid-col-8">
              <h2 id="about-simpler" className="usa-h2 margin-top-0">About SimplerNOFOs</h2>
              <div className="usa-prose about-prose">
                <p>
                  SimplerNOFOs is an initiative at the U.S. Department of Health and
                  Human Services to make federal grant notices easier to write, easier
                  to read, and more accessible to the people who need them. The
                  program develops tools, content guides, and design standards used by
                  HHS Operating Divisions to author and publish Notices of Funding
                  Opportunity on grants.gov.
                </p>
                <p>
                  The NOFO Design Prep Checker is one part of that ecosystem. It
                  works alongside the{' '}
                  <a
                    href="https://github.com/HHS/simpler-grants-pdf-builder"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    NOFO Builder
                    <span className="usa-sr-only"> (opens in a new tab)</span>
                  </a>
                  , which converts finalized Word documents into accessible,
                  USWDS-styled PDFs for publication. The two tools are independent —
                  this checker runs before the document reaches NOFO Builder, catching
                  structural and formatting issues early so the design step goes
                  smoothly.
                </p>
                <p>
                  Questions about SimplerNOFOs or this tool? Email{' '}
                  <a href="mailto:simplerNOFOs@agile6.com">simplerNOFOs@agile6.com</a>.
                </p>
              </div>

              <div className="margin-top-5">
                <BackLink to="/">← Back to the checker</BackLink>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
