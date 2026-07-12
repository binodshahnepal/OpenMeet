# OpenMeet

OpenMeet is an enterprise-grade, high-availability Zoom-like video conferencing platform.

## Architecture & Stack

### Backend
- **Framework:** ASP.NET Core 9 (Web API & SignalR hubs)
- **Architecture:** Clean Architecture following SOLID principles
- **Database:** PostgreSQL
- **Caching & Session:** Redis
- **Object Storage:** MinIO / AWS S3
- **Media Server:** LiveKit (WebRTC SFU)

### Frontend
- **Framework:** Angular 20 (TypeScript, standalone components)
- **Styling:** Tailwind CSS

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- .NET 9 SDK
- Node.js & npm (v20+ recommended)

### Running Infrastructure Locally
Start the infrastructure services (PostgreSQL, Redis, MinIO, LiveKit, Elasticsearch) with:
```bash
docker compose up -d
```

### Running Backend
```bash
cd OpenMeet.Backend
dotnet run --project src/OpenMeet.WebApi
```

### Running Frontend
```bash
cd OpenMeet.Frontend
npm install
npm start
```
