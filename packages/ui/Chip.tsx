import type { ButtonHTMLAttributes } from "react";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Chip(props: ChipProps) {
  const { active = false, className = "", type, ...rest } = props;
  const state = active
    ? "bg-accent text-surface border-accent"
    : "bg-surface-2 text-ink-dim border-ink-dim/25";
  return (
    <button
      type={type ?? "button"}
      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium ${state} ${className}`}
      {...rest}
    />
  );
}
