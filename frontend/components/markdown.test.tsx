// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Markdown } from "./markdown"

const links = { username: "owner", repo: "name" }

describe("Markdown — file citations", () => {
  it("turns a cited path into a link to the viewer", () => {
    render(<Markdown fileLinks={links}>{"See `lib/session.ts` for details."}</Markdown>)

    const link = screen.getByRole("link", { name: "lib/session.ts" })
    expect(link).toHaveAttribute("href", "/owner/name?file=lib%2Fsession.ts")
  })

  it("links a nested path", () => {
    render(<Markdown fileLinks={links}>{"In `app/api/gemini/route.ts`."}</Markdown>)

    expect(screen.getByRole("link", { name: "app/api/gemini/route.ts" })).toBeInTheDocument()
  })

  it("links a bare filename", () => {
    render(<Markdown fileLinks={links}>{"Check `package.json`."}</Markdown>)

    expect(screen.getByRole("link", { name: "package.json" })).toBeInTheDocument()
  })

  it("does not link code that merely looks like an identifier", () => {
    // A false positive turns prose into a dead link, which is worse than no link.
    render(<Markdown fileLinks={links}>{"Call `useState()` to begin."}</Markdown>)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText("useState()")).toBeInTheDocument()
  })

  it("does not link a shell command", () => {
    render(<Markdown fileLinks={links}>{"Run `npm run dev` first."}</Markdown>)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("does not link an absolute filesystem path", () => {
    render(<Markdown fileLinks={links}>{"Never read `/etc/passwd`."}</Markdown>)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("does not link a bare domain", () => {
    render(<Markdown fileLinks={links}>{"Hosted at `codeatlas.dev` today."}</Markdown>)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("leaves paths unlinked when no repository context is given", () => {
    // The file viewer renders READMEs; a path there must not link to itself.
    render(<Markdown>{"See `lib/session.ts`."}</Markdown>)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText("lib/session.ts")).toBeInTheDocument()
  })
})

describe("Markdown — rendering", () => {
  it("renders headings and paragraphs", () => {
    render(<Markdown>{"# Title\n\nSome body text."}</Markdown>)

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument()
    expect(screen.getByText("Some body text.")).toBeInTheDocument()
  })

  it("renders GFM tables", () => {
    render(<Markdown>{"| A | B |\n| --- | --- |\n| 1 | 2 |"}</Markdown>)

    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "A" })).toBeInTheDocument()
  })

  it("opens external links safely in a new tab", () => {
    render(<Markdown>{"[docs](https://example.com)"}</Markdown>)

    const link = screen.getByRole("link", { name: "docs" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))
  })

  it("does not execute raw HTML by default", () => {
    // Model output is untrusted; rehypeRaw stays off unless explicitly allowed.
    render(<Markdown>{'<img src="x" onerror="alert(1)" />'}</Markdown>)

    expect(document.querySelector("img")).toBeNull()
  })

  it("renders raw HTML when explicitly allowed", () => {
    render(<Markdown allowHtml>{"<strong>bold</strong>"}</Markdown>)

    expect(screen.getByText("bold").tagName).toBe("STRONG")
  })
})
