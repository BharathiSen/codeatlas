// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const push = vi.fn()
let searchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/owner/name",
  useSearchParams: () => searchParams,
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

import FileExplorer from "./file-explorer"

/** A tree whose only match for "queries" is three levels deep. */
const repoData = {
  files: [
    {
      name: "src", path: "src", type: "directory" as const,
      children: [
        {
          name: "lib", path: "src/lib", type: "directory" as const,
          children: [
            { name: "queries.ts", path: "src/lib/queries.ts", type: "file" as const },
            { name: "driver.ts", path: "src/lib/driver.ts", type: "file" as const },
          ],
        },
      ],
    },
    { name: "README.md", path: "README.md", type: "file" as const },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  searchParams = new URLSearchParams()
})

describe("FileExplorer — search", () => {
  it("finds a file nested inside collapsed folders", async () => {
    // The regression this guards: filtering used to run per level, so a folder
    // whose own name did not match was dropped before its children were seen —
    // making every nested file unreachable by search.
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    expect(screen.queryByText("queries.ts")).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/search files/i), "queries")

    expect(screen.getByText("queries.ts")).toBeInTheDocument()
  })

  it("keeps the parent chain of a match visible", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    await user.type(screen.getByLabelText(/search files/i), "queries")

    expect(screen.getByText("src")).toBeInTheDocument()
    expect(screen.getByText("lib")).toBeInTheDocument()
  })

  it("excludes non-matching siblings", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    await user.type(screen.getByLabelText(/search files/i), "queries")

    expect(screen.queryByText("driver.ts")).not.toBeInTheDocument()
    expect(screen.queryByText("README.md")).not.toBeInTheDocument()
  })

  it("reports how many files matched", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    await user.type(screen.getByLabelText(/search files/i), "queries")

    expect(screen.getByRole("status")).toHaveTextContent("1 file")
  })

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    await user.type(screen.getByLabelText(/search files/i), "zzzznope")

    expect(screen.getByText(/no files match/i)).toBeInTheDocument()
  })

  it("clears the search with the clear button", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    const input = screen.getByLabelText(/search files/i)
    await user.type(input, "queries")
    await user.click(screen.getByLabelText(/clear search/i))

    expect(input).toHaveValue("")
    expect(screen.queryByText("queries.ts")).not.toBeInTheDocument()
  })
})

describe("FileExplorer — navigation", () => {
  it("expands a folder on click", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    await user.click(screen.getByText("src"))

    expect(screen.getByText("lib")).toBeInTheDocument()
  })

  it("opens a file with its path encoded in the query string", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    await user.click(screen.getByText("README.md"))

    expect(push).toHaveBeenCalledWith("/owner/name?file=README.md")
  })

  it("marks the currently open file as selected", () => {
    searchParams = new URLSearchParams("file=README.md")
    render(<FileExplorer repoData={repoData} />)

    const item = screen.getByText("README.md").closest("button")
    expect(item).toHaveAttribute("aria-selected", "true")
  })

  it("does not re-navigate when the open file is clicked again", async () => {
    searchParams = new URLSearchParams("file=README.md")
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    await user.click(screen.getByText("README.md"))

    expect(push).not.toHaveBeenCalled()
  })
})

describe("FileExplorer — accessibility", () => {
  it("exposes the tree with proper roles", () => {
    render(<FileExplorer repoData={repoData} />)

    const tree = screen.getByRole("tree", { name: /repository files/i })
    expect(within(tree).getAllByRole("treeitem").length).toBeGreaterThan(0)
  })

  it("marks directory expansion state for assistive technology", async () => {
    const user = userEvent.setup()
    render(<FileExplorer repoData={repoData} />)

    const folder = screen.getByText("src").closest("button")!
    expect(folder).toHaveAttribute("aria-expanded", "false")

    await user.click(folder)
    expect(folder).toHaveAttribute("aria-expanded", "true")
  })

  it("renders tree items as buttons so they are keyboard reachable", () => {
    // They were click-handling <div>s, which no keyboard user could reach.
    render(<FileExplorer repoData={repoData} />)

    for (const item of screen.getAllByRole("treeitem")) {
      expect(item.tagName).toBe("BUTTON")
    }
  })
})
