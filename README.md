# SLBFE RESTful API — CS406.3 Coursework

## Quick Start

```bash
cd server
npm install
node seed.js      # seed demo data
node server.js    # start the server
```

Then open:
- **Client App**: http://localhost:3000
- **Swagger API Docs**: http://localhost:3000/api-docs

---

## Demo Login Accounts

| Role    | Email                     | Password      |
|---------|---------------------------|---------------|
| Officer | officer@slbfe.gov.lk      | Officer@1234  |
| Company | hr@globalcompany.com      | Company@1234  |
| Citizen | kamal@example.com         | Citizen@1234  |
| Citizen | nimal@example.com         | Citizen@1234  |
| Citizen | saman@example.com         | Citizen@1234  |

---

## Project Structure

```
API create/
├── server/
│   ├── package.json
│   ├── server.js              # Express server entry point
│   ├── seed.js                # Database seeder
│   ├── src/
│   │   ├── database.js        # SQLite database (sqlite3 package)
│   │   ├── swagger.js         # OpenAPI 3.0 spec
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT authentication middleware
│   │   │   └── roles.js       # Role-based access control
│   │   └── routes/
│   │       ├── auth.js        # POST /api/auth/login
│   │       ├── citizens.js    # CRUD for citizens
│   │       ├── documents.js   # File upload & verification
│   │       ├── locations.js   # Location tracking
│   │       └── complaints.js  # Complaints system
│   └── uploads/               # Uploaded files (auto-created)
├── client/
│   └── index.html             # Single-page client web app
└── data/
    └── slbfe.db               # SQLite database (auto-created)
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | Public | Login, get JWT token |
| GET | /api/auth/me | Any | Get current user profile |
| POST | /api/citizens | Public | Register new user (i) |
| GET | /api/citizens/search | Officer/Company | Find by qualifications (iv) |
| GET | /api/citizens/:nid | Officer | Get citizen full profile (iii) |
| PUT | /api/citizens/:nid | Self/Officer | Update qualifications/verify (ii, iii) |
| DELETE | /api/citizens/:nid | Officer | Deactivate account |
| GET | /api/citizens/:nid/contacts | Officer | Get emergency contacts |
| POST | /api/citizens/:nid/documents | Self | Upload documents (ii) |
| GET | /api/citizens/:nid/documents | Self/Officer | List documents |
| PUT | /api/documents/:id/verify | Officer | Verify a document (iii) |
| POST | /api/citizens/:nid/location | Self | Update location (v) |
| GET | /api/citizens/:nid/location | Officer | Location history |
| POST | /api/complaints | Any | Submit complaint (vi) |
| GET | /api/complaints | Officer | List all complaints (vi) |
| GET | /api/complaints/mine | Self | My complaints |
| GET | /api/complaints/:id | Officer/Self | Get single complaint |
| PUT | /api/complaints/:id/reply | Officer | Reply to complaint (vi) |
| GET | /api/health | Public | Server health check |

---

## Technology Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Runtime | Node.js 23 | JavaScript-based, coursework compliant |
| Framework | Express.js 4 | Industry standard REST framework |
| Database | SQLite (sqlite3 pkg) | Zero-config, portable, no server needed |
| Auth | JWT + bcrypt | Stateless, industry-standard security |
| File Uploads | Multer v2 | Multipart form handling |
| Validation | Joi | Request schema validation |
| API Docs | Swagger UI | Auto-generated, browsable docs |
| Security | Helmet, CORS, Rate Limiting | Production-grade security headers |
| Client | Vanilla HTML/CSS/JS | No build step, runs directly |
