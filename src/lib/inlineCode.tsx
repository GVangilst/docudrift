import { Fragment, type ReactNode } from 'react';

/**
 * Renders text containing backtick-wrapped `code` spans as React nodes, wrapping
 * the code segments in <code>. Pure string → ReactNode: the input is only ever
 * used as escaped text children, never as HTML, so it is XSS-safe.
 */
export function renderInlineCode(text: string): ReactNode {
  return text.split('`').map((segment, index) =>
    index % 2 === 1 ? (
      <code
        key={index}
        className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-gray-800 dark:text-gray-200"
      >
        {segment}
      </code>
    ) : (
      <Fragment key={index}>{segment}</Fragment>
    ),
  );
}
