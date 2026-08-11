import { auth } from '@/lib/auth';
import { apiError, apiSuccess, ErrorCode } from '@/lib/api-response';
import { deleteConversation, getConversation } from '@/lib/conversations';
import { isDatabaseConfigured } from '@/lib/db';
import { withRequestId } from '@/lib/request-context';

type Params = { params: Promise<{ id: string }> };

/** Ids are generated, so anything that is not a UUID cannot be one of ours. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the caller and the target id, or the refusal that should be sent.
 *
 * Both handlers need exactly this, and a mismatch between them is how one
 * caller ends up reading another's conversation.
 */
type Authorised =
  | { ok: true; id: string; githubId: string }
  | { ok: false; response: Response };

async function authorise(ctx: Params): Promise<Authorised> {
  const { id } = await ctx.params;

  if (!UUID.test(id)) {
    return {
      ok: false,
      response: apiError(ErrorCode.INVALID_REQUEST, 'Malformed conversation id.', 400),
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      response: apiError(
        ErrorCode.NOT_CONFIGURED,
        'Conversation history is not enabled on this deployment.',
        503
      ),
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: apiError(ErrorCode.INVALID_REQUEST, 'Sign in to access saved conversations.', 401),
    };
  }

  return { ok: true, id, githubId: session.user.id };
}

async function handleGet(_req: Request, ctx: Params) {
  const resolved = await authorise(ctx);
  if (!resolved.ok) return resolved.response;

  const conversation = await getConversation(resolved.githubId, resolved.id);

  /*
   * A conversation belonging to someone else is reported as missing, not as
   * forbidden: "403" would confirm that this id exists, which is a fact the
   * caller has no business learning.
   */
  if (!conversation) {
    return apiError(ErrorCode.FILE_NOT_FOUND, 'Conversation not found.', 404);
  }

  return apiSuccess(conversation);
}

async function handleDelete(_req: Request, ctx: Params) {
  const resolved = await authorise(ctx);
  if (!resolved.ok) return resolved.response;

  const deleted = await deleteConversation(resolved.githubId, resolved.id);
  if (!deleted) {
    return apiError(ErrorCode.FILE_NOT_FOUND, 'Conversation not found.', 404);
  }

  return apiSuccess({ deleted: true });
}

export const GET = withRequestId(handleGet);
export const DELETE = withRequestId(handleDelete);
