# Vanguard — preview branch

This branch is the working site with the black-and-white glass look from earlier today.
`main` is unchanged and still holds the Google Sheets / Drive server.

In Vercel, deploy this branch (`preview`), not `main`.
Build command: `npm run build`.

Accounts and applications on this branch use the app database.
Set `DATABASE_URL` on Vercel if the data must survive a restart.
Google keys stay on `main` and are not in this branch.
