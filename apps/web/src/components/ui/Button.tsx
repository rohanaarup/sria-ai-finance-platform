import React from 'react';
import { clsx } from 'clsx';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'sm',
  loading = false,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx('btn', `btn--${variant}`, `btn--${size}`, className)}
      {...rest}
    >
      {loading ? (
        <span
          className="animate-spin"
          style={{
            width: 13,
            height: 13,
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
          }}
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
};

