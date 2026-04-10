'use client';

// Design Ref: §10.2 -- Mobile fixed bottom action bar for ticket detail
// Plan SC: FR-22 Mobile action affordances

import Button from 'react-bootstrap/Button';
import { useIsMobile } from '@/hooks/use-media-query';

interface ActionDef {
  label: string;
  onClick: () => void;
  variant: string;
}

interface MobileActionBarProps {
  actions: ActionDef[];
}

/**
 * Fixed bottom action bar for mobile ticket detail page.
 * Renders action buttons in a row above the bottom navigation.
 * Only visible on mobile viewports (< 768px).
 */
export function MobileActionBar({ actions }: MobileActionBarProps) {
  const isMobile = useIsMobile();

  if (!isMobile || actions.length === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="티켓 액션"
      className="fixed-bottom bg-white border-top d-flex gap-2 align-items-center px-3 d-md-none"
      style={{
        height: 'var(--bottom-action-bar-height)',
        bottom: 'var(--bottom-nav-height)',
        zIndex: 1030,
      }}
    >
      {actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant}
          size="sm"
          className="flex-fill"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
