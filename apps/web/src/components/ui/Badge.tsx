import React from 'react';
import { clsx } from 'clsx';

export interface BadgeProps {
  tone?: 'neutral' | 'brand' | 'positive' | 'negative' | 'warning' | 'info';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  dot = false,
  children,
  className,
}) => {
  return (
    <span className={clsx('badge', `badge--${tone}`, className)}>
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'currentColor',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};

