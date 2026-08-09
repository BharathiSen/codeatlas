import { cn } from "@/lib/utils"

interface LogoMarkProps {
  /** Renders the "CodeAtlas" wordmark next to the glyph. */
  withWordmark?: boolean
  className?: string
}

/**
 * The CodeAtlas brand mark: a violet-bordered square holding a monospace
 * slash, optionally followed by the wordmark. Used in the navbar, the footer
 * and the workspace header.
 */
export function LogoMark({ withWordmark = true, className }: LogoMarkProps) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="grid h-5 w-5 flex-none place-items-center rounded-[5px] border-[1.5px] border-primary font-mono text-[11px] leading-none text-primary"
      >
        /
      </span>
      {withWordmark && (
        <span className="font-head text-base font-bold tracking-[-0.01em] text-foreground">
          CodeAtlas
        </span>
      )}
    </span>
  )
}
