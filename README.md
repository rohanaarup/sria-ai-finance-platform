# Sria Info Tech AI Finance Dashboard Generator

An enterprise-grade analytical system that converts natural-language financial queries into interactive, audited dashboards powered by SAP Cloud Application Programming Model (CAP) and React.

## Monorepo Architecture

```
├── apps/
│   ├── web/               # React + TypeScript + Vite frontend
│   └── cap/               # SAP CAP Node.js backend (db/, srv/)
├── packages/
│   └── contracts/         # Shared domain DTOs, interfaces, and schemas
└── docs/                  # Architecture, governance, and phase implementation guides
```

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+`

### 2. Setup
```bash
# Install all dependencies across workspaces
npm install

# Build shared contracts
npm run build --workspace=packages/contracts

# Typecheck all packages and apps
npm run typecheck

# Run test suites
npm run test
```

### 3. Running Locally
```bash
# Start backend CAP service on http://localhost:4004
npm run dev:cap

# Start frontend development server on http://localhost:5173
npm run dev:web
```

See [docs/development/LOCAL-SETUP.md](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/development/LOCAL-SETUP.md) for full setup instructions and development workflows.

