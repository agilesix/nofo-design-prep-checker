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
  onAccept = () => {},
  onSkipNotify = () => {},
}: {
  onAccept?: (fix: AcceptedFix) => void;
  onSkipNotify?: () => void;
} = {}): React.ReactElement {
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

async function typeValue(container: HTMLDivElement, value: string): Promise<void> {
  const input = container.querySelector('input') as HTMLInputElement;
  await act(async () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickButton(container: HTMLDivElement, label: string): Promise<void> {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement;
  expect(btn).not.toBeNull();
  await act(async () => { btn.click(); });
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
    await act(async () => { root.render(<Wrapper onAccept={onAccept} />); });

    await typeValue(container, 'My test value');
    await clickButton(container, 'Skip');

    expect(container.textContent).not.toContain('Value recorded');
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('shows "Value recorded" only when resolution is accepted', async () => {
    await act(async () => { root.render(<Wrapper />); });

    await typeValue(container, 'My accepted value');
    await clickButton(container, 'Accept fix');

    expect(container.textContent).toContain('Value recorded');
    expect(container.textContent).toContain('My accepted value');
  });

  it('resets input field to empty after type → Skip → Undo', async () => {
    await act(async () => { root.render(<Wrapper />); });

    await typeValue(container, 'Typed before skip');
    await clickButton(container, 'Skip');
    await clickButton(container, '↩ Undo');

    // Input must be visible again (unreviewed) and cleared
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('');
  });

  it('resets input field to empty after type → Accept → Undo', async () => {
    await act(async () => { root.render(<Wrapper />); });

    await typeValue(container, 'Typed before accept');
    await clickButton(container, 'Accept fix');
    await clickButton(container, '↩ Undo');

    // Input must be visible again (unreviewed) and cleared
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('');
  });
});
