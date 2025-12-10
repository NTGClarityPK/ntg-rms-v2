# Docker Deployment Guide

This project is dockerized and can be deployed using Docker Compose.

## Prerequisites

- Docker installed on your system
- Docker Compose installed

## Setup Instructions

### 1. Configure Environment Variables

Before building and running the containers, you need to update the production environment file:

#### Root .env.prod
Edit `.env.prod` in the root directory and update all values:

**Frontend Variables:**
- `NEXT_PUBLIC_API_URL` - Your backend API URL (use `http://localhost:3001/api/v1` for local, or your public URL for production)
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key

**Backend Variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `JWT_SECRET` - A strong secret key for JWT tokens
- `JWT_REFRESH_SECRET` - A strong secret key for refresh tokens
- `GOOGLE_CLIENT_ID` - Your Google OAuth client ID (if using Google OAuth)
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth client secret
- `GOOGLE_CALLBACK_URL` - Your Google OAuth callback URL
- `FRONTEND_URL` - Your frontend URL for CORS configuration

### 2. Build and Run

From the root directory of the project:

**Important:** Docker Compose automatically reads `.env` file for variable substitution. The project includes both `.env.prod` (your source file) and `.env` (auto-created from `.env.prod` for Docker Compose). 

When you update `.env.prod`, you'll need to copy it to `.env`:
```bash
# Copy .env.prod to .env (Docker Compose reads .env automatically)
cp .env.prod .env
```

Or on Windows PowerShell:
```powershell
Copy-Item .env.prod .env
```

Then build and run:
```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### 3. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api/v1
- API Documentation (Swagger): http://localhost:3001/api/docs

## Docker Services

### Backend Service
- **Container Name**: `rms-backend`
- **Port**: 3001

### Frontend Service
- **Container Name**: `rms-frontend`
- **Port**: 3000
- **Depends on**: Backend service

## Production Deployment

For production deployment:

1. Update all environment variables in `.env.prod` (root directory) with production values
2. Update `FRONTEND_URL` to your production frontend URL
3. Update `NEXT_PUBLIC_API_URL` to your production backend URL
4. Consider using a reverse proxy (nginx) in front of the containers
5. Use Docker secrets or environment variable management for sensitive data
6. Set up proper SSL/TLS certificates

## Troubleshooting

### View Logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
```

### Rebuild After Changes
```bash
docker-compose up -d --build --force-recreate
```

### Check Container Status
```bash
docker-compose ps
```

### Access Container Shell
```bash
# Backend
docker-compose exec backend sh

# Frontend
docker-compose exec frontend sh
```
