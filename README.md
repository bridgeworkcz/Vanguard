# Vanguard Global Mobility

When these Vercel environment variables are set, accounts, applications and files use Google. They are not stored in GitHub.

GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SPREADSHEET_ID
GOOGLE_DRIVE_ROOT_FOLDER_ID
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
SESSION_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

OAuth client id and secret belong in Vercel, not in this repo. After they are set, an admin opens Console → Зміст and presses «Підключити мій Google» with the Gmail that owns the Drive folder. The refresh token is then stored in Sheets. If those two OAuth variables are missing, the same screen still accepts a one-time paste of Client ID and secret.

On the first request the server creates any missing tabs and these Drive folders: Dossiers, Backups, Gallery, Team, Invoices, Contracts. Existing rows and files are not rewritten. A tab whose header is in a different order is left as it is and reported in the Vercel log.
