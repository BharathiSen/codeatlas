import { auth } from '@/lib/auth';
import { apiError, apiSuccess, ErrorCode, isValidRepoSegment } from '@/lib/api-response';
import { listConversations } from '@/lib/conversations';
import { isDatabaseConfigured } from '@/lib/db';
import { withRequestId } from '@/lib/request-context';

/**
 * List the signed-in user's saved conversations for a repository.
 *
 * Requires a session — a conversation belongs to someone, and there is no
 * meaningful anonymous answer to "show me my history". This is the one place
 * identity gates rather than merely tiers (D-27), because without it the
 * endpoint has nothing to return.
 */
async function handleGet(req: Request) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');

  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) {
    return apiError(
      ErrorCode.INVALID_REQUEST,
      'Query parameters "owner" and "repo" are required and must be valid repository segments.',
      400
    );
  }

  if (!isDatabaseConfigured()) {
    // Not an error: persistence is optional, and the client renders an empty
    // history rather than a failure.
    return apiSuccess({ conversations: [], persistence: false });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return apiSuccess({ conversations: [], persistence: true, signedIn: false });
  }

  const list = await listConversations(session.user.id, owner, repo);
  return apiSuccess({ conversations: list, persistence: true, signedIn: true });
}

export const GET = withRequestId(handleGet);
