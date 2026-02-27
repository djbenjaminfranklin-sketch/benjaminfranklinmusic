import { cn } from "@/shared/lib/utils";

interface CardProps {
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function Card({ hover, className, children }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card",
        hover && "transition-colors hover:border-accent/30",
        className,
      )}
    >
      {children}
    </div>
  );
}
