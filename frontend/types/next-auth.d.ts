import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      /** GitHub numeric id — stable across username changes. */
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}
