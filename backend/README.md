# RMS Backend

Restaurant Management System Backend built with NestJS and Supabase.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your Supabase credentials:
```bash
cp .env.example .env
```

3. Run database migrations (execute the SQL files in `database/migrations/` in your Supabase SQL editor)

4. Start the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3001`
Swagger documentation will be available at `http://localhost:3001/api/docs`

## Project Structure

```
src/
├── modules/          # Feature modules
├── common/          # Shared utilities, guards, decorators
├── config/          # Configuration files
├── database/        # Database service and migrations
└── main.ts          # Application entry point
```

## Environment Variables

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for backend operations)
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_EXPIRES_IN`: JWT token expiration time
- `PORT`: Server port (default: 3001)
- `FRONTEND_URL`: Frontend URL for CORS (default: http://localhost:3000)

