// BEFORE
import { readSheetRows, appendSheetRow } from '../server/utils/sheets';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../server/utils/auth';
import { mapRowToUser, mapUserToRow } from '../server/utils/mappers';
import { sendSafeTelegramAlert } from '../server/utils/telegram';

// AFTER
import { readSheetRows, appendSheetRow } from '../server/utils/sheets.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../server/utils/auth.js';
import { mapRowToUser, mapUserToRow } from '../server/utils/mappers.js';
import { sendSafeTelegramAlert } from '../server/utils/telegram.js';
import type { User } from '../src/types.js';
