const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SLBFE RESTful API',
      version: '1.0.0',
      description: `
## Sri Lanka Bureau of Foreign Employment — Web API

This API facilitates:
- **Citizen Registration** — Free online membership for any Sri Lankan citizen
- **Job Seeker Profiles** — Upload qualifications, CVs, passports, birth certificates
- **Officer Verification** — Bureau staff validate job seeker information
- **Company Candidate Search** — Find workers based on qualifications
- **Location Tracking** — Citizens update their location upon arriving at foreign employers
- **Complaints System** — Citizens submit complaints; officers review and reply

---

### Authentication
All protected endpoints require a **Bearer token** (JWT) obtained via \`POST /api/auth/login\`.
Add it to the \`Authorization\` header: \`Authorization: Bearer <token>\`

### Demo Accounts (after running seed.js)

| Role | Email | Password |
|---|---|---|
| Officer | officer@slbfe.gov.lk | Officer@1234 |
| Company | hr@globalcompany.com | Company@1234 |
| Citizen | kamal@example.com | Citizen@1234 |
      `,
      contact: { name: 'SLBFE Tech Team', email: 'tech@slbfe.gov.lk' },
      license: { name: 'ISC' }
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Obtain a token via POST /api/auth/login'
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
