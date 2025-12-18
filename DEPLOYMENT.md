## RMS CI/CD Deployment Guide

This document explains how to deploy the NTG RMS application (frontend, backend, Redis, Elasticsearch) to **staging** and **production** using:

- Docker & Docker Compose
- GitHub Actions
- A self-hosted runner on `192.168.50.50` (`ntg-server`)

The deployment setup is designed to mirror your NTG Ticket system while being tailored for the RMS monorepo (`backend/`, `frontend/`).

---

### 1. Prerequisites

- **Server**
  - Ubuntu (or compatible Linux) server reachable at `192.168.50.50`
  - User `dev` (or equivalent) with permissions to run Docker
  - Open ports:
    - Production: `5000` (frontend), `5001` (backend), optionally `9200` (Elasticsearch)
    - Staging: `8000` (frontend), `8001` (backend), optionally `19200` (staging Elasticsearch)

- **Installed on the server**
  - **Docker** (latest stable)
  - **Docker Compose** (plugin or standalone; commands use `docker compose`)
  - **Git**
  - **GitHub Actions self-hosted runner** registered as:
    - Name: `ntg-server`
    - Labels: includes `self-hosted` and `ntg-server`

- **GitHub**
  - Repository: `https://github.com/NTGClarityPK/ntg-rms-v2` (or your actual remote)
  - Branches:
    - `main` → **Production**
    - `dev` → **Staging**
  - Workflow file: `.github/workflows/deploy.yml` (already added in this repo)

---

### 2. Directory Layout on Server

The server is structured to keep production and staging completely isolated:

```bash
/home/dev/
├── production/
│   └── ntg-rms-v2/
│       └── project/      # Docker + env files live here
└── staging/
    └── ntg-rms-v2/
        └── project/      # Docker + env files live here
```

- Each `ntg-rms-v2/` is a **separate clone** of your Git repository.
- The `project/` subdirectory is where:
  - `docker-compose.yml` (production)
  - `docker-compose-staging.yml` (staging)
  - `env.example`
  - `.env.prod`
  - `.env.staging`
  - `.gitignore`
  live and are used by Docker.

---

### 3. Initial Server Setup

#### 3.1 Create Directories

```bash
sudo mkdir -p /home/dev/production/ntg-rms-v2
sudo mkdir -p /home/dev/staging/ntg-rms-v2
sudo chown -R dev:dev /home/dev
```

#### 3.2 Clone Repositories

- **Production (main):**

```bash
cd /home/dev/production/ntg-rms-v2
git clone https://github.com/NTGClarityPK/ntg-rms-v2.git .
git checkout main
```
sudo chown -R dev:dev /home/dev

- **Staging (dev):**

```bash
cd /home/dev/staging/ntg-rms-v2
git clone https://github.com/NTGClarityPK/ntg-rms-v2.git .
git checkout dev
```

> Note: The `project/` directory and Docker files are part of the repo, so they will be present after cloning.

#### 3.3 Configure Environment Files

In each clone:

```bash
cd /home/dev/production/ntg-rms-v2/project
cp env.example .env.prod

cd /home/dev/staging/ntg-rms-v2/project
cp env.example .env.staging
```

Then edit each file with real values.

- **Production (`.env.prod`)**
  - Keep:
    - `NODE_ENV=production`
    - `BACKEND_PORT=4000`
    - `FRONTEND_ORIGIN=http://192.168.50.50:5000`
    - `NEXT_PUBLIC_API_URL=http://192.168.50.50:5001`
  - Use **production** Supabase/DB/SMTP credentials.

- **Staging (`.env.staging`)**
  - Typically:
    - `NODE_ENV=staging` (optional; many systems still use `production`)
    - `BACKEND_PORT=4000` (internal in container; stays 4000)
    - `FRONTEND_ORIGIN=http://192.168.50.50:8000`
    - `NEXT_PUBLIC_API_URL=http://192.168.50.50:8001`
  - Use **staging/test** Supabase/DB/SMTP credentials.

See `project/env.example` for the full list of required variables.

#### 3.4 Ensure Docker Permissions

Add `dev` to the `docker` group:

```bash
sudo usermod -aG docker dev
newgrp docker
docker ps    # verify you can run docker without sudo
```

#### 3.5 Configure Self-Hosted Runner

Follow GitHub’s instructions to install and register a runner for this repository or organization.

- Ensure the runner:
  - Runs as `dev` (or a user with access to `/home/dev/...`)
  - Has label `ntg-server`
  - Is **online** and assigned to the `ntg-rms-v2` repo

The workflow in `.github/workflows/deploy.yml` is configured with:

```yaml
runs-on: [self-hosted, ntg-server]
```

So it will bind specifically to this runner.

---

### 4. How the CI/CD Workflow Works

Workflow file: `.github/workflows/deploy.yml`

- **Triggers**
  - `push` to `main` → production deployment
  - `push` to `dev` → staging deployment
  - Manual: `workflow_dispatch` from GitHub UI

- **Branch → Environment Mapping**
  - `main`:
    - `ENVIRONMENT=production`
    - `DEPLOY_PATH=/home/dev/production/ntg-rms-v2/project`
    - External ports:
      - Frontend: `5000` → container `3000`
      - Backend: `5001` → container `4000`
    - Command:
      - `docker compose --env-file .env.prod up -d --build`

  - `dev`:
    - `ENVIRONMENT=staging`
    - `DEPLOY_PATH=/home/dev/staging/ntg-rms-v2/project`
    - External ports:
      - Frontend: `8000` → container `3000`
      - Backend: `8001` → container `4000`
    - Command:
      - `docker compose --env-file .env.staging -f docker-compose-staging.yml up -d --build`

- **Steps Overview**
  1. **Determine environment** based on `github.ref_name` (`main` or `dev`) and set:
     - `ENVIRONMENT`
     - `DEPLOY_PATH`
     - `BACKEND_PORT`
     - `FRONTEND_PORT`
     - `COMPOSE_CMD`
  2. **Update code** at the target path:
     - `git fetch origin`
     - `git reset --hard origin/<branch>`
  3. **Build & start** services with Docker Compose for that environment.
  4. **Health check** the backend:
     - Polls `http://localhost:<backend_port>/health` until HTTP 200 or timeout.

---

### 5. Docker Compose Layout

#### 5.1 Production (`project/docker-compose.yml`)

- **Name**: `ntg-rms-production`
- **Services**:
  - `redis`:
    - Image: `redis:7-alpine`
    - Healthcheck: `redis-cli ping`
  - `elasticsearch`:
    - Image: `docker.elastic.co/elasticsearch/elasticsearch:8.11.0`
    - Single-node:
      - `discovery.type=single-node`
      - `xpack.security.enabled=false`
  - `backend`:
    - Build:
      - `context: ../backend`
      - `dockerfile: Dockerfile`
    - Env:
      - `env_file: .env.prod`
    - Ports:
      - `5001:4000` (external 5001 → internal 4000)
    - Command:
      - `node dist/src/main.js`
    - Depends on:
      - `redis` (healthy)
  - `frontend`:
    - Build:
      - `context: ../frontend`
      - `dockerfile: Dockerfile`
      - Build args:
        - `NEXT_PUBLIC_SUPABASE_URL`
        - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
        - `NEXT_PUBLIC_API_URL`
        - `NODE_ENV`
    - Env:
      - `env_file: .env.prod`
    - Ports:
      - `5000:3000` (external 5000 → internal 3000)

#### 5.2 Staging (`project/docker-compose-staging.yml`)

- **Name**: `ntg-rms-staging`
- **Differences from production**:
  - Container names have `-staging` suffix.
  - Network: `rms-network-staging`.
  - Ports:
    - Backend: `8001:4000`
    - Frontend: `8000:3000`
  - Env file: `.env.staging`.
  - Optional: staging Elasticsearch exposed on `19200` (not required if you don’t want external access).

Each environment has its **own Docker network** to avoid cross-contamination.

---

### 6. Deploying to Staging vs Production

#### 6.1 Deploy to Staging (`dev` branch)

1. Commit and push your changes to `dev`:

   ```bash
   git checkout dev
   git add .
   git commit -m "Your feature or fix"
   git push origin dev
   ```

2. GitHub Actions will automatically:
   - Run the `Deploy RMS (Staging & Production)` workflow.
   - Use `/home/dev/staging/ntg-rms-v2/project`.
   - Rebuild and restart containers with `docker-compose-staging.yml`.

3. After it completes, access:
   - Staging frontend: `http://192.168.50.50:8000`
   - Staging backend (API): `http://192.168.50.50:8001`

#### 6.2 Deploy to Production (`main` branch)

1. Merge `dev` into `main` (via PR or locally):

   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```

2. GitHub Actions will:
   - Use `/home/dev/production/ntg-rms-v2/project`.
   - Rebuild and restart containers with `docker-compose.yml`.

3. After it completes, access:
   - Production frontend: `http://192.168.50.50:5000`
   - Production backend (API): `http://192.168.50.50:5001`

---

### 7. Rollback Strategy

There are two primary rollback approaches:

#### 7.1 Git-Based Rollback (Recommended)

1. Identify a previous working commit SHA (e.g., `abc1234`) on the relevant branch.
2. Locally or via GitHub:

   ```bash
   # For staging
   git checkout dev
   git revert <bad_commit_sha>  # or reset/move branch to previous SHA
   git push origin dev

   # For production
   git checkout main
   git revert <bad_commit_sha>
   git push origin main
   ```

3. The CI workflow will:
   - Deploy the reverted code.
   - Rebuild containers with that version.

#### 7.2 Manual Container Rollback (If You Keep Tagged Images)

If you start tagging images, you can:

1. SSH into the server.
2. Manually stop current containers and start older images:

```bash
cd /home/dev/production/ntg-rms-v2/project
docker ps
docker stop <container_ids>
docker run <previous_image_tags> ...
```

Currently, the default setup always builds from the latest code; explicit image tagging is not configured but can be added later.

---

### 8. Troubleshooting

#### 8.1 Workflow Fails on Health Check

- Symptom: GitHub Actions step `Wait for backend to be healthy` fails.
- Checks:
  - From the server:

    ```bash
    cd /home/dev/production/ntg-rms-v2/project   # or staging path
    docker compose ps
    docker logs rms-backend                      # or rms-backend-staging
    curl -v http://localhost:5001/health         # or 8001 for staging
    ```

  - Ensure:
    - The backend actually listens on port `4000` inside the container.
    - NestJS `main.ts` exposes a `/health` endpoint.

#### 8.2 Ports Already in Use

- Symptom: Docker fails with `port is already allocated`.
- Fix:
  - Check which process is using the port:

    ```bash
    sudo lsof -i:5000
    sudo lsof -i:5001
    sudo lsof -i:8000
    sudo lsof -i:8001
    ```

  - Stop conflicting services or update the port mapping in the compose files (and corresponding envs).

#### 8.3 Env Variables Missing or Misconfigured

- Symptom: 500 errors, connection failures to Supabase, DB, or SMTP.
- Fix:
  - Verify `.env.prod` or `.env.staging` under `project/`:

    ```bash
    cd /home/dev/production/ntg-rms-v2/project   # or staging
    cat .env.prod                                # or .env.staging
    ```

  - Ensure values are non-empty and correct.
  - Re-run deployment (push a no-op commit or trigger `workflow_dispatch`).

#### 8.4 Self-Hosted Runner Not Picking Up Jobs

- Symptom: Workflow stays in “queued” state.
- Fix:
  - Check runner service on the server:

    ```bash
    # From the runner installation directory
    ./run.sh
    # or check the systemd service if configured
    ```

  - Ensure the runner:
    - Is online in GitHub.
    - Has the `ntg-server` label.

#### 8.5 Docker Build Failures

- Symptom: Build step fails in GitHub Actions.
- Fix:
  - SSH into the server and run:

    ```bash
    cd /home/dev/staging/ntg-rms-v2/project   # or production
    docker compose build
    ```

  - Check:
    - `backend/Dockerfile` build succeeds.
    - `frontend/Dockerfile` has correct build args (`NEXT_PUBLIC_*`).
    - Node / npm / pnpm installs succeed.

---

### 9. Summary of Key Commands

- **Manual local test of staging compose:**

```bash
cd /home/dev/staging/ntg-rms-v2/project
docker compose --env-file .env.staging -f docker-compose-staging.yml up -d --build
```

- **Manual local test of production compose:**

```bash
cd /home/dev/production/ntg-rms-v2/project
docker compose --env-file .env.prod up -d --build
```

- **Check running services:**

```bash
docker ps
docker compose ps
```

This setup gives you a clear, repeatable deployment flow:

- `dev` branch → **staging** (`8000/8001`)
- `main` branch → **production** (`5000/5001`)

All coordinated via a self-hosted GitHub Actions runner and Docker Compose. 

