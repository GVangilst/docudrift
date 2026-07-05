/**
 * Builds a fake `fetch` for tests. `routes` maps a URL substring to a Response
 * (or a factory). The first matching route wins; an unmatched URL 404s. No real
 * network is ever touched.
 */
export type RouteValue = Response | (() => Response);

export function fakeFetch(routes: Record<string, RouteValue>): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    for (const [needle, value] of Object.entries(routes)) {
      if (url.includes(needle)) return typeof value === 'function' ? value() : value;
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

export function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, { status: 200, ...init });
}
