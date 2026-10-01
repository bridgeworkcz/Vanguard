# Vanguard Global Mobility

When these Vercel environment variables are set, accounts, applications and files use Google. They are not stored in GitHub.

GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SPREADSHEET_ID
GOOGLE_DRIVE_ROOT_FOLDER_ID
SESSION_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

Registration writes a row on the Users tab and sends a Telegram message. The password is stored as a hash in `passwordHash`, the same way the previous server did. Documents go to the Drive folder.
