import { cn } from "@/lib/utils"

interface SectionHeadingProps {
  /** Small uppercase mono label above the title. */
  eyebrow: string
  title: string
  /** Optional supporting sentence. */
  description?: string
  align?: "left" | "center"
  className?: string
}

/**
 * The eyebrow / title / description stack that opens every marketing section.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.08em] text-primary">
        {eyebrow}
      </div>
      <h2 className="m-0 font-head text-[clamp(26px,4vw,34px)] font-bold leading-tight tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]",
            align === "center" ? "mx-auto max-w-lg" : "max-w-xl"
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
}
