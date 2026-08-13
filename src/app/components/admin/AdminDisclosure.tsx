import { useState, type ReactNode } from 'react';

/**
 * Native details needs its open state to survive editor re-renders. Passing a
 * fixed `open` prop made every field change force cards back to their initial
 * state, so cards after the first one were effectively impossible to edit.
 */
export default function AdminDisclosure({
  children,
  initialOpen = false,
  summary,
}: {
  children: ReactNode;
  initialOpen?: boolean;
  summary: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <details
      className="admin-disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
