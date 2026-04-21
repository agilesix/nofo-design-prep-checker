import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Tell React this is a test environment so act() works without warnings
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
import IssueCard from '../IssueCard';
import type { Issue, IssueResolution, AcceptedFix } from '../../types';

const inputIssue: Issue = {
  id: 'test-issue-1',
  ruleId: 'META-001',
  title: 'Enter a value',
  severity: 'error',
  sectionId: 'section-1',
  description: 'Please enter a value.',
  inputRequired: {
    type: 'text',
    label: 'Value',
    targetField: 'meta.value',
  },
};

/** Wrapper that owns resolution state so IssueCard re-renders after Skip/Undo */
function Wrapper({
  onAccept,
  onSkipNotify,
}: {
  onAccept: (fix: AcceptedFix) => void;
  onSkipNotify: () => void;
}): React.ReactElement {
  const [resolution, setResolution] = useState<IssueResolution>('unreviewed');
  return (
    <IssueCard
      issue={inputIssue}
      resolution={resolution}
      onAccept={(fix) => {
        setResolution('accepted');
        onAccept(fix);
      }}
      onSkip={() => {
        setResolution('skipped');
        onSkipNotify();
      }}
      onUndo={() => setResolution('unreviewed')}
    />
  );
}

describe('IssueCard – skip with a recorded text input value', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it('does not show "Value recorded" text after skipping', async () => {
    const onAccept = vi.fn();
    const onSkipNotify = vi.fn();

    await act(async () => {
      root.render(<Wrapper onAccept={onAccept} onSkipNotify={onSkipNotify} />);
    });

    // Type a value into the input
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      nativeSetter.call(input, 'My test value');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Click Skip
    const skipButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Skip',
    ) as HTMLButtonElement;
    expect(skipButton).not.toBeNull();
    await act(async () => { skipButton.click(); });

    // "✓ Value recorded" must not appear
    expect(container.textContent).not.toContain('Value recorded');
    // onAccept must not have been called
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('shows "Value recorded" only when resolution is accepted', async () => {
    const onAccept = vi.fn();
    const onSkipNotify = vi.fn();

    await act(async () => {
      root.render(<Wrapper onAccept={onAccept} onSkipNotify={onSkipNotify} />);
    });

    // Type a value into the input
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      nativeSetter.call(input, 'My accepted value');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Click Accept
    const acceptButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Accept fix',
    ) as HTMLButtonElement;
    expect(acceptButton).not.toBeNull();
    await act(async () => { acceptButton.click(); });

    // "✓ Value recorded" must appear
    expect(container.textContent).toContain('Value recorded');
    expect(container.textContent).toContain('My accepted value');
  });
});
