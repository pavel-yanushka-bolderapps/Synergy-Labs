// Sign-in for /ops: one shared password (OPS_PASSWORD) plus the person's name,
// kept in a signed cookie. Enough for two people and no Sanity seats; swap for
// Google sign-in limited to @bolderapps.com when more people join.
//
// The cookie is "<name>.<hmac>" signed with OPS_PASSWORD, so changing the
// password signs everyone out.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";

export const COOKIE = "ops_session";
export const PEOPLE = ["Pavel", "Andrew"] as const;
const MAX_AGE = 60 * 60 * 24 * 30;

const secret = () => process.env.OPS_PASSWORD || import.meta.env.OPS_PASSWORD || "";
const sign = (name: string) => createHmac("sha256", secret()).update(`ops:${name}`).digest("base64url");

export function isConfigured(): boolean {
  return secret().length >= 8;
}

export function checkPassword(password: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(secret());
  return isConfigured() && a.length === b.length && timingSafeEqual(a, b);
}

export function signIn(cookies: AstroCookies, name: string) {
  cookies.set(COOKIE, `${name}.${sign(name)}`, {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge: MAX_AGE,
  });
}

export function signOut(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: "/" });
}

/** The signed-in person's name, or null. */
export function currentUser(cookies: AstroCookies): string | null {
  if (!isConfigured()) return null;
  const value = cookies.get(COOKIE)?.value;
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  const name = value.slice(0, dot);
  const mac = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(name));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return (PEOPLE as readonly string[]).includes(name) ? name : null;
}

/** Headers every Ops response carries: never cached, never indexed. */
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...PRIVATE_HEADERS },
  });
