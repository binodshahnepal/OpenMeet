# OpenMeet

OpenMeet is a Zoom-like video conferencing platform built as a local-development MVP toward the larger enterprise SRS.

## Architecture & Stack

### Backend
- **Framework:** ASP.NET Core / .NET 10 Web API with SignalR hubs
- **Architecture:** Clean Architecture style with Domain, Application, Infrastructure, and WebApi projects
- **Database:** PostgreSQL by default, with SQLite still supported through configuration
- **Object Storage:** MinIO / S3-compatible storage for avatars, with local file fallback
- **Media Server:** LiveKit for WebRTC audio, video, and screen sharing
- **Realtime App Events:** SignalR for chat, reactions, hand raise, and whiteboard strokes

### Frontend
- **Framework:** Angular 22 with standalone components and signals
- **Styling:** Tailwind CSS
- **Media Client:** livekit-client

### Local Infrastructure
The Docker Compose file provisions PostgreSQL, Redis, MinIO, and LiveKit. Redis is available for future caching/session work but is not currently used by the application code.

## Getting Started

### Prerequisites
- Docker & Docker Compose
- .NET 10 SDK
- Node.js & npm

### Running Infrastructure Locally
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

## Configuration

Do not commit real SMTP, JWT, storage, or LiveKit production secrets. Use environment variables or user secrets for local overrides.

Useful environment variable examples:

```bash
JwtSettings__Secret=your-local-secret-at-least-32-characters
EmailSettings__Host=smtp.example.com
EmailSettings__Username=your-user
EmailSettings__Password=your-password
Storage__AccessKey=minioadmin
Storage__SecretKey=minioadminpassword
LiveKit__ApiSecret=devsecretkey_openmeet_development_only_12345
```

To use SQLite instead of PostgreSQL:

```bash
Database__Provider=Sqlite
ConnectionStrings__DefaultConnection=Data Source=openmeet.db
```
