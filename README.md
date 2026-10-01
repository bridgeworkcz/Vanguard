# Vanguard Global Mobility

When these Vercel environment variables are set, accounts, applications and files use Google. They are not stored in GitHub.

GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SPREADSHEET_ID
GOOGLE_DRIVE_ROOT_FOLDER_ID
SESSION_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

On the first request the server creates any missing tabs and these Drive folders: Dossiers, Backups, Gallery, Team, Invoices, Contracts. Existing rows and files are not rewritten. A tab whose header is in a different order is left as it is and reported in the Vercel log.
