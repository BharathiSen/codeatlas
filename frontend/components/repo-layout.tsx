"use client"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Suspense, useState } from "react"
import { FolderTree, MessageSquare, Sparkles } from "lucide-react"
import FileExplorer from "@/components/file-explorer"
import AiAssistant from "@/components/ai-assistant"
import FileViewer from "@/components/file-viewer"
import RepoAnalyzer from "@/components/repo-analyzer"
import InsightsPanel from "@/components/insights-panel"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface RepoLayoutProps {
    repoData: any
    username: string
    repo: string
}

type CentreMode = "files" | "insights"
/** Which single pane is visible below `lg`, where three columns cannot fit. */
type MobilePane = "explorer" | "centre" | "assistant"

const MOBILE_PANES: { id: MobilePane; label: string; icon: typeof FolderTree }[] = [
    { id: "explorer", label: "Files", icon: FolderTree },
    { id: "centre", label: "Viewer", icon: Sparkles },
    { id: "assistant", label: "Chat", icon: MessageSquare },
]

function ViewerSkeleton() {
    return (
        <div className="space-y-2 p-4" aria-busy="true">
            <Skeleton className="h-5 w-1/3 bg-muted" />
            {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 bg-muted" style={{ width: `${95 - i * 7}%` }} />
            ))}
        </div>
    )
}

export default function RepoLayout({ repoData, username, repo }: RepoLayoutProps) {
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
    const [centreMode, setCentreMode] = useState<CentreMode>("files")
    const [mobilePane, setMobilePane] = useState<MobilePane>("centre")

    const explorer = (
        <Suspense fallback={<ViewerSkeleton />}>
            <FileExplorer repoData={repoData} />
        </Suspense>
    )

    const centre = (
        <div className="flex h-full min-h-0 flex-col">
            <div role="tablist" aria-label="Centre pane" className="flex flex-none gap-1 border-b border-border px-3 py-2">
                {(["files", "insights"] as const).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={centreMode === mode}
                        onClick={() => setCentreMode(mode)}
                        className={cn(
                            "rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
                            centreMode === mode
                                ? "bg-primary/[0.12] text-primary"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {mode === "files" ? "Files" : "Insights"}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
                {centreMode === "files" ? (
                    <Suspense fallback={<ViewerSkeleton />}>
                        <FileViewer repoData={repoData} />
                    </Suspense>
                ) : (
                    <InsightsPanel username={username} repo={repo} />
                )}
            </div>
        </div>
    )

    const assistant = <AiAssistant username={username} repo={repo} />

    return (
        <div className="h-screen overflow-hidden bg-background font-sans text-foreground">
            <RepoAnalyzer username={username} repo={repo} />

            {/* Desktop: three resizable panes. */}
            <div className="hidden h-full lg:block">
                <ResizablePanelGroup direction="horizontal" className="h-full w-full rounded-lg border-border">
                    <ResizablePanel
                        defaultSize={20}
                        minSize={15}
                        maxSize={30}
                        collapsible
                        onCollapse={() => setIsLeftCollapsed(true)}
                        onExpand={() => setIsLeftCollapsed(false)}
                        className={cn(isLeftCollapsed && "min-w-[50px] transition-all duration-300 ease-in-out")}
                    >
                        <div className="relative z-10 flex h-full flex-col border-r border-border">
                            {explorer}
                        </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={50} minSize={30}>
                        <div className="relative z-10 flex h-full min-w-0 flex-col border-r border-border">
                            {centre}
                        </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={30} minSize={20} maxSize={50} collapsible>
                        <div className="flex h-full min-w-0 flex-col">{assistant}</div>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>

            {/*
             * Below lg: one pane at a time with a bottom switcher. Three resizable
             * columns are unusable on a phone, and hiding two of them entirely
             * would remove half the product.
             */}
            <div className="flex h-full flex-col lg:hidden">
                <div className="min-h-0 flex-1 overflow-hidden">
                    {mobilePane === "explorer" && explorer}
                    {mobilePane === "centre" && centre}
                    {mobilePane === "assistant" && assistant}
                </div>

                <nav
                    aria-label="Workspace panes"
                    className="flex flex-none border-t border-border bg-background"
                >
                    {MOBILE_PANES.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setMobilePane(id)}
                            aria-current={mobilePane === id ? "page" : undefined}
                            className={cn(
                                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                                mobilePane === id ? "text-primary" : "text-muted-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {label}
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    )
}
