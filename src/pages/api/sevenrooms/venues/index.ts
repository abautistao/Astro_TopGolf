export const prerender = false;

import type { APIRoute } from "astro";
import { getSevenRoomsToken } from "../../../../lib/sevenrooms";

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime?.env;
    const token = await getSevenRoomsToken(env);

    const incoming = new URL(request.url);
    const upstream = new URL("https://api.sevenrooms.com/2_4/venues");
    incoming.searchParams.forEach((value, key) => {
      upstream.searchParams.append(key, value);
    });

    const res = await fetch(upstream, {
      headers: { Authorization: token },
    });

    const data = await res.json().catch(() => ({}));
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
