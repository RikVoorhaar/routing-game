# Routing App

A SvelteKit application with Auth.js for authentication, PostgreSQL for database, and Drizzle as ORM.

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the PostgreSQL database:

   ```bash
   cd ../routing_server
   docker compose up -d postgres
   ```

4. Generate a secure Auth.js secret:

   ```bash
   npm run generate-auth-secret
   ```

5. Create a `.env` file in the root directory with the following:

   ```
   DATABASE_URL="postgresql://routing_user:routing_password@localhost:5432/routing_game"
   AUTH_SECRET="paste-your-generated-secret-here"
   ```

6. Initialize the database:
   ```bash
   npm run init-db:force
   ```
   This will create a test user with:
   - Username: `testuser`
   - Password: `password123`

## Development

Run the development server:

```bash
npm run dev
```

## Authentication

This project uses Auth.js for authentication with the following features:

- Credential-based authentication (username/password)
- Session stored in PostgreSQL database
- Protected routes
- Login/logout functionality

## Database

The application uses:

- PostgreSQL for database storage
- Drizzle ORM for database access
- JSONB for storing complex data structures
- Schema includes user, game state, employee, and route tables

## Drizzle migrations workflow

This repo uses **Drizzle migrations** (SQL files in `routing-app/drizzle/`) applied by **`drizzle-kit migrate`**.

- **Generate a migration** (after editing `src/lib/server/db/schema.ts`):

  ```bash
  npx drizzle-kit generate
  ```

- **Apply migrations** to the configured database:

  ```bash
  npx drizzle-kit migrate
  ```

- **Do not hand-edit** `routing-app/drizzle/meta/_journal.json`.
  - Drizzle uses the `when` timestamps in that file to decide what is “new”.
  - If a migration’s `when` is **older** than the most recently-applied migration, `drizzle-kit migrate` will **silently skip it** (even if the SQL file exists and the DB schema is missing the changes).

- **If you must rename a migration file/tag**, also update the corresponding journal entry (and ensure its `when` stays **monotonically increasing**).

## Routes

- `/` - Home page
- `/login` - Login page
- `/protected` - Protected page (requires authentication)
- `/game` - Main game interface
- `/character-select` - Character selection page
