import { COMPARISON_ROWS } from "@/lib/site-content"
import { SectionHeading } from "@/components/site/section-heading"

const COLUMNS = ["ChatGPT", "GitHub Copilot", "CodeAtlas"] as const

export function ComparisonTable() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 py-20 lg:px-8 lg:py-24">
      <SectionHeading
        align="center"
        eyebrow="Comparison"
        title="Not another code chatbot"
        description="ChatGPT and Copilot generate code from a prompt. CodeAtlas is grounded in the repository you actually work in."
        className="mb-12"
      />

      {/* Horizontal scroll keeps the four columns readable on narrow screens. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-xl border border-border">
          <thead>
            <tr>
              <th scope="col" className="border-b border-border p-4 text-left" />
              {COLUMNS.map((col) => {
                const isOurs = col === "CodeAtlas"
                return (
                  <th
                    key={col}
                    scope="col"
                    className={`border-b border-l border-border p-4 text-left font-head text-[15px] font-bold ${
                      isOurs ? "bg-primary/[0.14] text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {col}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-border p-4 text-left text-[13px] font-normal text-muted-foreground"
                >
                  {row.label}
                </th>
                <td className="border-b border-l border-border p-4 text-center text-[13px] text-faint">
                  {row.chatgpt}
                </td>
                <td className="border-b border-l border-border p-4 text-center text-[13px] text-faint">
                  {row.copilot}
                </td>
                <td className="border-b border-l border-border bg-primary/[0.14] p-4 text-center text-[13px] font-medium text-foreground">
                  {row.codeatlas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
