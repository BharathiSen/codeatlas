import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request correlation id, carried implicitly.
 *
 * A user reporting "it failed" gives us a timestamp and a message; neither
 * isolates their request in a log holding everyone else's. Every response now
 * carries an id that also prefixes the log lines that produced it.
 *
 * It rides in `AsyncLocalStorage` rather than being threaded through every
 * function that might log or respond. Threading it would have touched three
 * dozen call sites and would still be forgotten at the next one added — the
 * cost of a parameter nobody wants to pass is that eventually nobody does.
 */
const storage = new AsyncLocalStorage<{ requestId: string }>();

/** The id of the in-flight request, if this code is running inside one. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Take the caller's id when it is well-formed, otherwise mint one.
 *
 * Honouring an inbound `x-request-id` lets a proxy's id survive into our logs,
 * so one identifier spans the whole hop. It is bounded and character-checked
 * first: an unbounded header value would flow straight into every log line.
 */
export function resolveRequestId(req?: Request): string {
  const inbound = req?.headers.get('x-request-id')?.trim();
  if (inbound && inbound.length <= 64 && /^[A-Za-z0-9._-]+$/.test(inbound)) return inbound;
  return crypto.randomUUID();
}

/** Generic over the request type, because routes take either `Request` or `NextRequest`. */
type RouteHandler<Req extends Request, Args extends unknown[]> = (
  req: Req,
  ...args: Args
) => Promise<Response> | Response;

/**
 * Wrap a route handler so everything it calls can reach the request id.
 *
 * Applied once per route, at the export.
 */
export function withRequestId<Req extends Request, Args extends unknown[]>(
  handler: RouteHandler<Req, Args>
): RouteHandler<Req, Args> {
  return (req, ...args) =>
    storage.run({ requestId: resolveRequestId(req) }, () => handler(req, ...args));
}
