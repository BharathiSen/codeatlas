import RepoLayout from "@/components/repo-layout"
import { fetchRepoData } from "@/lib/github"
import { Metadata } from "next"
import { notFound } from "next/navigation"

interface RepoPageProps {
  params: Promise<{
    username: string
    repo: string
  }>
}

export async function generateMetadata({ params }: RepoPageProps): Promise<Metadata> {
  const { username, repo } = await params
  return {
    title: `${username}/${repo} - CodeAtlas`,
    description: `Repository intelligence for ${username}/${repo}, powered by CodeAtlas.`,
  }
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { username, repo } = await params

  try {
    // Fetch repository data first
    const repoData = await fetchRepoData(username, repo)
    if (!repoData) {
      throw new Error(`Repository ${username}/${repo} not found or inaccessible`)
    }

    return (
      <RepoLayout repoData={repoData} username={username} repo={repo} />
    )
  } catch {
    notFound()
  }
}

