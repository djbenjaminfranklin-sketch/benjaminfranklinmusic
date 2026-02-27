import { cn } from "@/shared/lib/utils";

interface BadgeProps {
  variant?: "accent" | "danger" | "default";
  children: React.ReactNode;
  className?: string;
}

const variantStyles = {
  accent: "bg-accent/15 text-accent border-accent/20",
  danger: "bg-red-500/15 text-red-400 border-red-500/20",
  default: "bg-foreground/10 text-foreground/60 border-foreground/10",
};

export default function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
