# Routing App

A SvelteKit application with Auth.js for authentication, SQLite for database, and Drizzle as ORM.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

3. Generate a secure Auth.js secret:
   ```bash
   bun scripts/generate-auth-secret.js
   ```

4. Create a `.env` file in the root directory with the following:
   ```
   DATABASE_URL="file:./local.db"
   AUTH_SECRET="paste-your-generated-secret-here"
   ```

5. Create a test user for login:
   ```bash
   curl -X POST http://localhost:5173/api/create-test-user
   ```
   This will create a user with:
   - Username: `testuser`
   - Password: `password123`

## Development

Run the development server:
```bash
bun run dev
```

## Authentication

This project uses Auth.js for authentication with the following features:
- Credential-based authentication (username/password)
- Session stored in SQLite database
- Protected routes
- Login/logout functionality

## Database

The application uses:
- SQLite for database storage
- Drizzle ORM for database access
- Schema includes user and session tables

## Routes

- `/` - Home page
- `/login` - Login page
- `/protected` - Protected page (requires authentication)
- `/api/create-test-user` - API endpoint to create a test user
