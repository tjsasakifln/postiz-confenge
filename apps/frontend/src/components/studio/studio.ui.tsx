'use client';

import { ChangeEvent, ComponentProps, ReactNode, useId } from 'react';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';

export const studioInputClass =
  'w-full rounded-lg border border-newTableBorder bg-newBgColorInner px-3 py-2.5 text-sm text-newTextColor placeholder:text-textItemBlur focus-visible:ring-2 focus-visible:ring-btnPrimary disabled:opacity-60';
export const studioFocusClass =
  'rounded-lg focus-visible:ring-2 focus-visible:ring-btnPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-newBgColorInner';

export const StudioButton = ({
  children,
  ...props
}: ComponentProps<typeof Button>) => (
  <Button {...props} className={clsx(studioFocusClass, props.className)}>
    {children}
  </Button>
);

export const StudioField = ({
  label,
  value,
  onChange,
  hint,
  multiline,
  rows = 3,
  type = 'text',
  placeholder,
  required,
  min,
  max,
  step,
  disabled,
  maxLength,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
  disabled?: boolean;
  maxLength?: number;
}) => {
  const id = useId();
  const inputProps = {
    id,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
    placeholder,
    required,
    disabled,
    maxLength,
    className: studioInputClass,
    'aria-describedby': hint ? `${id}-hint` : undefined,
  };
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {multiline ? (
        <textarea {...inputProps} rows={rows} />
      ) : (
        <input {...inputProps} type={type} min={min} max={max} step={step} />
      )}
      {hint && (
        <p
          id={`${id}-hint`}
          className="text-xs leading-relaxed text-textItemBlur"
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export const StudioSelect = ({
  label,
  value,
  onChange,
  children,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  hint?: string;
  disabled?: boolean;
}) => {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={studioInputClass}
      >
        {children}
      </select>
      {hint && (
        <p
          id={`${id}-hint`}
          className="text-xs leading-relaxed text-textItemBlur"
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export const StudioSection = ({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <section className="space-y-5 rounded-xl border border-newTableBorder bg-newBgColorInner p-5 mobile:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="max-w-3xl text-sm leading-relaxed text-textItemBlur">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    {children}
  </section>
);

export const StudioMessage = ({
  children,
  error,
}: {
  children: ReactNode;
  error?: boolean;
}) => (
  <div
    role={error ? 'alert' : 'status'}
    className={clsx(
      'rounded-lg border px-4 py-3 text-sm leading-relaxed',
      error
        ? 'border-red-400/60 bg-red-500/10 text-newTextColor'
        : 'border-newTableBorder bg-newBgColor text-newTextColor'
    )}
  >
    {children}
  </div>
);

export const StudioEmpty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed border-newTableBorder bg-newBgColor px-5 py-8 text-center text-sm leading-relaxed text-textItemBlur">
    {children}
  </p>
);

export const StudioCheck = ({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <label className="flex items-start gap-2.5 text-sm leading-relaxed">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      disabled={disabled}
      className="mt-1 h-4 w-4 shrink-0 accent-btnPrimary focus-visible:ring-2 focus-visible:ring-btnPrimary"
    />
    <span>{label}</span>
  </label>
);

export const studioHttpUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

export const formatStudioDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data não informada'
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(date);
};
