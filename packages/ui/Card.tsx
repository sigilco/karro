import type { HTMLAttributes } from "react";

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props;
  return (
    <div
      className={`rounded-2xl bg-surface-2 border border-ink-dim/15 p-4 ${className}`}
      {...rest}
    />
  );
}
