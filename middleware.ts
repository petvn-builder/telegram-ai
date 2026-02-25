import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PROTECTED_ROUTES = ["/dashboard", "/settings", "/notes", "/graph"]
const AUTH_ROUTES = ["/login", "/signup"]

export async function middleware(request: NextRequest) {
  // @supabase/ssr requires this specific pattern to propagate Set-Cookie headers.
  // Do NOT simplify — returning a plain NextResponse.next() will drop cookie updates
  // and log users out when their JWT expires.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not run any code between createServerClient and getUser()
  // that reads or writes cookies — it will break the session refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Root redirect
  if (pathname === "/") {
    const dest = user ? "/dashboard" : "/login"
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Redirect logged-in users away from auth pages
  if (user && AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Redirect unauthenticated users away from protected pages
  if (!user && PROTECTED_ROUTES.some((r) => pathname.startsWith(r))) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (Next.js image optimization)
     * - favicon.ico
     * - api/telegram  (bot webhook — no browser session)
     * - api/auth      (auth callback — must be reachable before session exists)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/telegram|api/auth/callback).*)",
  ],
}
