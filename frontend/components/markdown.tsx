"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { CodeBlock } from "@/components/code-block"
import { cn } from "@/lib/utils"

interface MarkdownProps {
  children: string
  /** Allow raw HTML. Only for trusted repository files, never model output. */
  allowHtml?: boolean
  className?: string
}

/**
 * The single markdown renderer.
 *
 * The assistant, the insights panel and the file viewer previously each carried
 * their own `ReactMarkdown` component map, which drifted apart — different link
 * colours, different table borders, one with code highlighting and one without.
 * One renderer means a rendering fix lands everywhere at once.
 *
 * `allowHtml` is opt-in because `rehypeRaw` renders embedded HTML verbatim. That
 * is reasonable for a README the user chose to open and unreasonable for model
 * output, so the assistant leaves it off.
 */
export function Markdown({ children, allowHtml = false, className }: MarkdownProps) {
  return (
    <div className={cn("prose prose-invert max-w-none break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowHtml ? [rehypeRaw] : []}
        components={{
          code({ className: codeClass, children: codeChildren, ...props }: any) {
            const match = /language-(\w+)/.exec(codeClass || "")

            if (!props.inline && match) {
              return (
                <CodeBlock
                  language={match[1]}
                  value={String(codeChildren).replace(/\n$/, "")}
                />
              )
            }

            return (
              <code
                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-primary"
                {...props}
              >
                {codeChildren}
              </code>
            )
          },

          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {children}
              </a>
            )
          },

          p({ children }) {
            return <p className="mb-3 leading-relaxed last:mb-0">{children}</p>
          },

          ul({ children }) {
            return <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
          },

          ol({ children }) {
            return <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
          },

          li({ children }) {
            return <li className="pl-1 leading-relaxed">{children}</li>
          },

          h1({ children }) {
            return <h1 className="mb-3 mt-6 font-head text-2xl font-bold first:mt-0">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="mb-2.5 mt-6 font-head text-xl font-bold first:mt-0">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="mb-2 mt-5 font-head text-base font-semibold first:mt-0">{children}</h3>
          },

          // Tables scroll inside their own container so a wide table never
          // forces the surrounding pane to scroll horizontally.
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className="border-b border-border bg-muted px-4 py-2 font-medium text-foreground">
                {children}
              </th>
            )
          },
          td({ children }) {
            return <td className="border-b border-border px-4 py-2 align-top last:border-0">{children}</td>
          },

          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-2 border-primary/60 pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            )
          },

          hr() {
            return <hr className="my-6 border-border" />
          },

          img({ src, alt }) {
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={src as string} alt={alt ?? ""} className="my-4 h-auto max-w-full rounded-lg" />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
