# Restaurant Management System (RMS)

A comprehensive, multi-tenant Restaurant Management System with offline-first architecture, built for the Iraqi and Middle Eastern markets.

## Project Structure

```
ntg-rms-new/
├── frontend/          # Next.js 14 frontend application
├── backend/           # NestJS backend API
├── ntg-rms-old/      # Reference codebase
└── RMS_Cursor_Prompt.md  # Complete project specification
```

## Quick Start

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file (see `backend/.env.example`):
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=your_jwt_secret
PORT=3001
FRONTEND_URL=http://localhost:3000
```

4. Run database migrations in Supabase SQL Editor:
   - Execute `backend/database/migrations/001_initial_schema.sql`

5. Start the backend:
```bash
npm run start:dev
```

Backend will run on `http://localhost:3001`
API docs: `http://localhost:3001/api/docs`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

4. Start the frontend:
```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## Opening as Workspace

### VS Code / Cursor

1. **Option 1: Open workspace file**
   - File → Open Workspace from File...
   - Select `rms.code-workspace`

2. **Option 2: Open folder**
   - File → Open Folder...
   - Select the `ntg-rms-new` directory
   - VS Code will detect it as a workspace

3. **Option 3: Command line**
   ```bash
   code rms.code-workspace
   # or
   cursor rms.code-workspace
   ```

## Development Workflow

1. Start backend server (Terminal 1):
   ```bash
   cd backend
   npm run start:dev
   ```

2. Start frontend server (Terminal 2):
   ```bash
   cd frontend
   npm run dev
   ```

3. Access:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - API Docs: http://localhost:3001/api/docs

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- Mantine UI v7
- TypeScript
- Zustand (state management)
- Dexie.js (IndexedDB)
- Axios

### Backend
- NestJS
- TypeScript
- Supabase (PostgreSQL)
- JWT Authentication
- Swagger/OpenAPI

## Documentation

- `RMS_Cursor_Prompt.md` - Complete project specification
- `backend/SETUP.md` - Backend setup guide
- `frontend/SETUP.md` - Frontend setup guide
- `backend/IMPLEMENTATION_STATUS.md` - Backend implementation status
- `frontend/IMPLEMENTATION_STATUS.md` - Frontend implementation status

## Features

- ✅ Multi-tenant architecture
- ✅ English/Arabic language support with RTL
- ✅ Offline-first with IndexedDB
- ✅ JWT authentication
- ✅ Dashboard layout
- ✅ All route structure in place

## Next Steps

See implementation status files for what's been completed and what's next.



