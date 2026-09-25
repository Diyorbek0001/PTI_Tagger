# PTI Telegram Management

Next.js, PostgreSQL, and Telegram bot application for unit registration, PTI media collection, weekly compliance tracking, fleet review, and driver reminders.

## Local development

1. Install Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the real values. `.env.local` is ignored by Git.
3. Run `npm run db:start` to start persistent local PostgreSQL, apply migrations, and load the development units.
4. Run `npm run dev` for the website and `npm run bot` for the Telegram bot.

The website is available at `http://localhost:3000`.

## Railway deployment

The repository is configured to run the website, Telegram bot, reminder scheduler, and database migrations in one Railway service. `railway.json` tells Railpack to build the app, run migrations before deployment, check `/api/health`, and start both long-running processes.

1. Push the project to a private GitHub repository and create a Railway project from it.
2. Add a Railway PostgreSQL service to the same project. In the application service's Variables tab, add `DATABASE_URL=${{Postgres.DATABASE_URL}}` (replace `Postgres` if you gave the database service another name).
3. Add these application-service variables:
   - `TELEGRAM_BOT_TOKEN` — token from BotFather.
   - `TELEGRAM_ADMIN_USERNAME` — the only Telegram username allowed to configure reminders in the bot's private chat; enter it without `@`.
   - `PTI_ARCHIVE_CHAT_ID` — archive supergroup ID beginning with `-100`.
   - `PTI_TIME_ZONE` — timezone used for `@lastPTI` and `@lastNotified`, for example `America/New_York`.
   - `NODE_ENV=production`.
4. Generate a Railway public domain for the application service and deploy.
5. Keep this service at exactly **one replica**. The Telegram bot uses long polling, so multiple replicas using the same token would compete for updates and duplicate the reminder scheduler.

Railway injects `PORT`; the production runner passes it to Next.js automatically. Database migrations are transactional and protected by a PostgreSQL advisory lock. Production deployment does not load the local development seed.

Do not commit a real bot token. Before pushing, replace secrets in `.env.example` with placeholders and keep the real values only in Railway Variables.

## Telegram usage

Add the bot to each truck group and the PTI archive group. Run `/chatid` in the archive supergroup to obtain `PTI_ARCHIVE_CHAT_ID`.

- Generate an activation code from the Assigned Units page, then activate a truck group with `/activate CODE @driverusername`.
- Reply directly to a photo or video with `/pti` to submit it for fleet review.
- Use `/status` to check the group registration.
- Weekly reminders tag the registered driver. Missing units can be notified individually or together from the website; automatic reminders run at most twice weekly and at least three days apart.

### Configure reminder messages

Open a private chat with the bot from the account named in `TELEGRAM_ADMIN_USERNAME`, then use `/adminhelp`.

- `/setreminder MESSAGE` changes the text while keeping the existing attachment.
- To set a photo or video, send it to the bot with the template as its caption, then reply to that media with `/setreminder`.
- `/reminderconfig` shows the saved template and attachment.
- `/clearremindermedia` removes the attachment without changing the text.

Available placeholders are `@driver`, `@lastNotified`, `@lastPTI`, `@unit`, and `@company`.

## Commands

- `npm run dev` — local Next.js website.
- `npm run bot` — local Telegram bot using `.env.local`.
- `npm run db:start` — embedded local PostgreSQL.
- `npm run migrate` — apply pending migrations to `DATABASE_URL`.
- `npm run build` — create the isolated production build in `.next-build`.
- `npm start` — run the production website and bot together.
- `npm test` — run unit tests.

## Security note

The current test stage has no website authentication. Do not expose the Railway domain to untrusted users until authentication and authorization are added. PostgreSQL remains server-only; browser code does not receive `DATABASE_URL` or the Telegram token.
