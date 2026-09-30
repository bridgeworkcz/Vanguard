# Vanguard Global Mobility

Production architecture:
- Vercel React/Vite frontend
- Vercel `/api/*` serverless backend
- Google Sheets as operational database
- Google Drive as document vault
- Telegram for server-side notifications

## Google Sheets tabs
Canonical tabs are created/validated automatically by the backend:
Users, Dossiers, DossierDocuments, PaymentTransactions, Vacancies, Team, AuditLog, Applications, Pricing, SystemSettings, Gallery, SupportTickets, Backups.

## Required Vercel environment variables
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SPREADSHEET_ID
GOOGLE_DRIVE_ROOT_FOLDER_ID
SESSION_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

Do not put secrets in frontend code.

## Roles
A user can have multiple roles, including `ADMIN` + `MANAGER` simultaneously.

## Client portal
Applications, dossier view, direct document upload to Drive, payment submission for review, support tickets, and generated PDF drafts (service agreement, invoice/payment statement, job offer letter).

## Executive console
Overview, application CRM, dossier CRM, document review, finance review, SLA/legal queue, vacancy CRUD/archive, batch tools, users/managers, team/gallery, pricing, content/settings, audit log, Drive backup, and support.
