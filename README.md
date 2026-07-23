# PromoPilot

![React](https://img.shields.io/badge/React-19-blue)
![Node.js](https://img.shields.io/badge/Node.js-Express-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

PromoPilot is a production-ready SaaS platform that helps retail teams create promotional campaigns, generate product labels, manage product catalogues and automate commercial workflows.

## 🌐 Live Demo

**https://promopilot.pt**

## Screenshots

### Dashboard

![Dashboard](dashboard.png)

### Campaign Creation

![Campaign](campaign.png)

### Labels

![Labels](label.png)

### Commercial Dossier

![Dossier](dossier.pdf)

## Highlights

- Built entirely from scratch
- Production-ready SaaS
- Multi-tenant architecture
- Cloud deployed
- Secure authentication & authorization
- Used by real users

## Key Features

- Promotional campaign management
- Automatic label generation
- Product catalogue
- Commercial dossier generation
- Authentication & authorization
- Multi-tenant architecture
- Audit logging
- Email automation
- PDF generation
- REST API
- Cloud deployment

## Tech Stack

Layer	Technologies
Frontend	React, JavaScript, CSS, Tailwind CSS
Backend	Node.js, Express
Database	PostgreSQL, Supabase
Cloud	Google Cloud Run, Render
Authentication	Supabase Auth
Integrations	Resend, Playwright

## Architecture

![Campaign](tree.promopilot.png)

## Security

- Row Level Security
- Tenant isolation
- Server-side secret management
- Authentication middleware
- Rate limiting
- Webhook validation

## Running Locally

```bash
git clone https://github.com/simaoopp/promopilot.git

cd promopilot

npm install

cp .env.example .env

npm run dev
```

## Why I Built It

PromoPilot was created to simplify the process of managing promotional campaigns for retail businesses.

The goal was to build a production-ready SaaS application capable of handling authentication, multi-tenancy, cloud deployment, PDF generation and email automation while maintaining a scalable architecture.

## License

MIT