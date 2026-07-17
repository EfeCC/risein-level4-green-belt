import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card p-5 sm:p-6", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

type BadgeTone = "brand" | "grain" | "neutral" | "safe" | "warn" | "danger";
const badgeTones: Record<BadgeTone, string> = {
  brand: "bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200",
  grain: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  neutral: "bg-black/5 text-[var(--text-muted)] dark:bg-white/10",
  safe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  loading,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide muted">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-24" />
      ) : (
        <div
          className={cn(
            "mt-1 text-xl font-semibold tabular-nums sm:text-2xl",
            accent && "gradient-text",
          )}
        >
          {value}
        </div>
      )}
      {hint && <div className="mt-1 text-xs muted">{hint}</div>}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  onMax,
  suffix,
  placeholder = "0.00",
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onMax?: () => void;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs muted">{hint}</span>}
      </div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-[var(--bg)] px-3",
          "border-[var(--border)] focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-[var(--ring)]",
          disabled && "opacity-60",
        )}
      >
        <input
          inputMode="decimal"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder={placeholder}
          className="h-12 w-full bg-transparent text-lg tabular-nums outline-none placeholder:text-[var(--text-muted)]"
        />
        {suffix && <span className="shrink-0 text-sm font-medium muted">{suffix}</span>}
        {onMax && (
          <button
            type="button"
            onClick={onMax}
            disabled={disabled}
            className="shrink-0 rounded-lg bg-brand-100 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-200 dark:bg-brand-900/50 dark:text-brand-200"
          >
            MAX
          </button>
        )}
      </div>
    </label>
  );
}
