# RMS Frontend

Restaurant Management System Frontend built with Next.js 14, Mantine UI, and offline-first architecture.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

3. Run development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
├── lib/              # Utilities and services
│   ├── api/         # API client
│   ├── sync/        # Offline sync service
│   └── utils/       # Helper functions
├── locales/         # Translation files
├── styles/          # Global styles and theme
└── types/           # TypeScript types
```

## Features

- ✅ Next.js 14 with App Router
- ✅ Mantine UI with RTL support
- ✅ English/Arabic language switching
- ✅ JWT authentication
- ✅ Offline-first with Dexie.js
- ✅ API client with Axios interceptors

