const SEVENROOMS_AUTH_URL = "https://api.sevenrooms.com/2_4/auth";

const REFRESH_MARGIN_MS = 60_000;

type EnvSource = Record<string, string | undefined> | undefined;

let cached: { token: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

function resolveCredentials(env?: EnvSource) {
  const clientId =
    env?.SEVENROOMS_CLIENT_ID ||
    (import.meta as any).env?.SEVENROOMS_CLIENT_ID ||
    (typeof process !== "undefined" ? process.env?.SEVENROOMS_CLIENT_ID : undefined);

  const clientSecret =
    env?.SEVENROOMS_CLIENT_SECRET ||
    (import.meta as any).env?.SEVENROOMS_CLIENT_SECRET ||
    (typeof process !== "undefined" ? process.env?.SEVENROOMS_CLIENT_SECRET : undefined);

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing SEVENROOMS_CLIENT_ID or SEVENROOMS_CLIENT_SECRET environment variable",
    );
  }

  return { clientId, clientSecret };
}

export async function getSevenRoomsToken(env?: EnvSource): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
    return cached.token;
  }

  if (pending) {
    return pending;
  }

  const { clientId, clientSecret } = resolveCredentials(env);

  pending = (async () => {
    try {
      const form = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
      });

      const res = await fetch(SEVENROOMS_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `SevenRooms /auth failed: ${res.status} ${res.statusText} ${body}`,
        );
      }

      const json: any = await res.json();
      const token = json?.data?.token;
      const expiresAtRaw = json?.data?.token_expiration_datetime;

      if (!token || !expiresAtRaw) {
        throw new Error(
          `SevenRooms /auth returned unexpected payload: ${JSON.stringify(json)}`,
        );
      }

      const expiresAt = new Date(expiresAtRaw).getTime();
      if (Number.isNaN(expiresAt)) {
        throw new Error(
          `SevenRooms /auth returned invalid token_expiration_datetime: ${expiresAtRaw}`,
        );
      }

      cached = { token, expiresAt };
      return token;
    } finally {
      pending = null;
    }
  })();

  return pending;
}

export function clearSevenRoomsToken() {
  cached = null;
  pending = null;
}

export async function sevenRoomsFetch(
  path: string,
  init: RequestInit & { env?: EnvSource } = {},
): Promise<Response> {
  const { env, headers, ...rest } = init;
  const token = await getSevenRoomsToken(env);
  return fetch(`https://api.sevenrooms.com/2_4${path}`, {
    ...rest,
    headers: {
      Authorization: token,
      ...(headers || {}),
    },
  });
}
