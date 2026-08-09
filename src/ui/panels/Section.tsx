import type { ReactNode } from 'react';
import { Toggle } from '../controls/Toggle.tsx';

interface SectionProps {
  title: string;
  children?: ReactNode;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

export function Section({ title, children, enabled, onToggle }: SectionProps) {
  const toggleable = onToggle !== undefined;
  return (
    <section className="panel">
      <header className="panel-header">
        {toggleable ? (
          <Toggle label={title} checked={enabled === true} onChange={onToggle} />
        ) : (
          <h2>{title}</h2>
        )}
      </header>
      {(!toggleable || enabled === true) && children !== undefined && (
        <div className="panel-body">{children}</div>
      )}
    </section>
  );
}
