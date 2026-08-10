"use client"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Suspense, useState } from "react"
import FileExplorer from "@/components/file-explorer"
import AiAssistant from "@/components/ai-assistant"
import FileViewer from "@/components/file-viewer"
import RepoAnalyzer from "@/components/repo-analyzer"
import InsightsPanel from "@/components/insights-panel"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type CentreMode = "files" | "insights"

interface RepoLayoutProps {
    repoData: any
    username: string
    repo: string
}

export default function RepoLayout({ repoData, username, repo }: RepoLayoutProps) {
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
    const [centreMode, setCentreMode] = useState<CentreMode>("files")

    return (
        <div className="h-screen bg-background text-foreground font-sans overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="h-full w-full rounded-lg border-border">

                {/* Left Sidebar - File Explorer */}
                <ResizablePanel
                    defaultSize={20}
                    minSize={15}
                    maxSize={30}
                    collapsible={true}
                    onCollapse={() => setIsLeftCollapsed(true)}
                    onExpand={() => setIsLeftCollapsed(false)}
                    className={cn(isLeftCollapsed && "min-w-[50px] transition-all duration-300 ease-in-out")}
                >
                    <div className="h-full flex flex-col border-r border-border shadow-[4px_0_24px_-2px_rgba(0,0,0,0.1)] z-10 relative">
                        <Suspense
                            fallback={
                                <div className="p-4">
                                    <Skeleton className="h-[500px] bg-muted" />
                                </div>
                            }
                        >
                            <FileExplorer repoData={repoData} />
                        </Suspense>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Middle - File Viewer / Repository Insights */}
                <ResizablePanel defaultSize={50} minSize={30}>
                    <div className="flex flex-col h-full min-w-0 shadow-[4px_0_24px_-2px_rgba(0,0,0,0.1)] z-10 relative border-r border-border">
                        <RepoAnalyzer username={username} repo={repo} />

                        {/* Centre-pane mode switch */}
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

                        <div className="flex-1 overflow-hidden min-h-0">
                            {centreMode === "files" ? (
                                <Suspense
                                    fallback={
                                        <div className="p-4">
                                            <Skeleton className="h-[500px] bg-muted" />
                                        </div>
                                    }
                                >
                                    <FileViewer repoData={repoData} />
                                </Suspense>
                            ) : (
                                <InsightsPanel username={username} repo={repo} />
                            )}
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right - AI Assistant */}
                <ResizablePanel
                    defaultSize={30}
                    minSize={20}
                    maxSize={50}
                    collapsible={true}
                >
                    <div className="h-full flex flex-col min-w-0">
                        <AiAssistant username={username} repo={repo} />
                    </div>
                </ResizablePanel>

            </ResizablePanelGroup>
        </div>
    )
}
