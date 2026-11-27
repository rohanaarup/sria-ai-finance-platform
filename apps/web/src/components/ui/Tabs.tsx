import React from 'react';
import { clsx } from 'clsx';

export interface TabOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = 'View options',
}: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={clsx('tabs__item', active && 'tabs__item--active')}
          >
            {opt.icon}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  padding: '0 5px',
                  borderRadius: 999,
                  background: active ? 'var(--bg-subtle)' : 'rgba(0,0,0,0.06)',
                  color: 'var(--text-secondary)',
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

