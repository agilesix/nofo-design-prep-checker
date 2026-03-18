import React from 'react';
import type { AppStep } from '../types';
import { content } from '../content';

interface StepIndicatorProps {
  currentStep: AppStep;
}

interface StepConfig {
  id: AppStep;
  label: string;
}

const STEPS: StepConfig[] = [
  { id: 'upload', label: content.steps.upload.label },
  { id: 'review', label: content.steps.review.label },
  { id: 'summary', label: content.steps.summary.label },
  { id: 'download', label: content.steps.download.label },
];

// Map internal-only steps to their nearest visible step for the indicator
function resolveDisplayStep(step: AppStep): AppStep {
  if (step === 'parsing' || step === 'guide-selection') return 'upload';
  return step;
}

function getStepStatus(
  stepId: AppStep,
  currentStep: AppStep
): 'complete' | 'current' | 'pending' {
  const displayStep = resolveDisplayStep(currentStep);
  const stepIds = STEPS.map(s => s.id);
  const currentIndex = stepIds.indexOf(displayStep);
  const stepIndex = stepIds.indexOf(stepId);

  if (stepIndex < currentIndex) return 'complete';
  if (stepIndex === currentIndex) return 'current';
  return 'pending';
}

export default function StepIndicator({ currentStep }: StepIndicatorProps): React.ReactElement {
  const displayStep = resolveDisplayStep(currentStep);

  const currentIndex = STEPS.findIndex(s => s.id === displayStep);
  const currentStepNumber = currentIndex + 1;
  const currentLabel = STEPS[currentIndex]?.label ?? '';

  return (
    <div className="usa-step-indicator margin-bottom-4">
      <ol className="usa-step-indicator__segments">
        {STEPS.map(step => {
          const status = getStepStatus(step.id, displayStep);
          // Pending steps use only the base class — USWDS has no --pending modifier.
          // --complete and --current are the only valid USWDS segment modifiers.
          const segmentClass = [
            'usa-step-indicator__segment',
            status === 'complete' ? 'usa-step-indicator__segment--complete' : null,
            status === 'current' ? 'usa-step-indicator__segment--current' : null,
          ].filter(Boolean).join(' ');
          return (
            <li
              key={step.id}
              className={segmentClass}
              aria-current={status === 'current' ? true : undefined}
            >
              <span className="usa-step-indicator__segment-label">
                {step.label}
                {status === 'complete' && (
                  <span className="usa-sr-only"> completed</span>
                )}
                {status !== 'complete' && status !== 'current' && (
                  <span className="usa-sr-only"> not completed</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="usa-step-indicator__header">
        <h2 className="usa-step-indicator__heading">
          <span className="usa-step-indicator__heading-counter">
            <span className="usa-sr-only">Step </span>
            <span className="usa-step-indicator__current-step">{currentStepNumber}</span>
            <span className="usa-step-indicator__total-steps"> of {STEPS.length}</span>
          </span>
          <span className="usa-step-indicator__heading-text">{currentLabel}</span>
        </h2>
      </div>
    </div>
  );
}
