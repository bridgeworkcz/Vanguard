import type { VercelRequest, VercelResponse } from '@vercel/node';
import { mapRowToTeamMember } from '../server/utils/mappers';
import { readSheetRows } from '../server/utils/sheets';

const TEAM_SHEET_NAME = 'Team';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({
        error: `HTTP Method '${req.method}' not allowed. Allowed: GET.`,
      });
    }

    const rows = await readSheetRows(TEAM_SHEET_NAME);
    const teamMembers = rows
      .map(mapRowToTeamMember)
      .sort((a, b) => a.order - b.order);

    return res.status(200).json({ team: teamMembers });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[API Team Crash]:', errorMessage);

    return res.status(500).json({
      error: `Server Exception: ${errorMessage}`,
    });
  }
}
