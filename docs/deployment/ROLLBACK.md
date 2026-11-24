# Cloud Foundry Deployment & Rollback Runbook
## Sria Info Tech AI Finance Dashboard Generator

This runbook documents release commands, health verification checks, log inspection, and zero-downtime rollback procedures.

---

### 1. Standard Cloud Foundry Deployment

#### Prerequisites
- Cloud Foundry CLI installed (`cf --version`).
- Authenticated to target BTP subaccount:
  ```bash
  cf login -a https://api.cf.<region>.hana.ondemand.com -o <ORG> -s <SPACE>
  ```

#### Deploying via Direct Manifest Push
```bash
# 1. Build shared contracts
npm run build --workspace=packages/contracts

# 2. Build CAP backend
npm run build --workspace=apps/cap

# 3. Push service to Cloud Foundry
cd apps/cap
cf push
```

#### Verifying App Status
```bash
cf app sria-cap-srv
```
Expected output: `state: started`, `instances: 1/1`.

---

### 2. Post-Deployment Smoke Tests

Execute HTTP checks against the assigned Cloud Foundry route:

1. **Public Health Endpoint**:
   ```bash
   curl -i https://<cf-app-route>/health
   ```
   Must return HTTP `200 OK` with JSON health report.

2. **Unauthenticated Access Rejection (Security Check)**:
   ```bash
   curl -i -X POST https://<cf-app-route>/api/v1/dashboards/createDashboard
   ```
   Must return HTTP `401 Unauthorized` or `403 Forbidden`, proving server-side `AuthGuard` is active.

3. **Live Container Logs**:
   ```bash
   cf logs sria-cap-srv --recent
   ```

---

### 3. Blue-Green Zero-Downtime Deployment & Rollback

For enterprise production deployments, use Cloud Foundry zero-downtime blue-green routing:

#### Step 1: Deploy New Version as Green
```bash
cf push sria-cap-srv-green -f manifest.yml
```

#### Step 2: Map Live Production Route to Green App
```bash
cf map-route sria-cap-srv-green <domain> --hostname sria-finance-api
```
At this point, both Blue and Green serve live traffic. Verify Green health endpoints.

#### Step 3: Unmap Route from Old Blue Version
```bash
cf unmap-route sria-cap-srv-blue <domain> --hostname sria-finance-api
```

#### Step 4: Emergency Rollback (If Issues Detected on Green)
If unexpected errors or performance degradation occur on the new version:
```bash
# 1. Immediately remap live route back to Blue
cf map-route sria-cap-srv-blue <domain> --hostname sria-finance-api

# 2. Unmap route from failing Green instance
cf unmap-route sria-cap-srv-green <domain> --hostname sria-finance-api

# 3. Stop Green container for diagnostic triage
cf stop sria-cap-srv-green
```
Zero downtime is experienced by end users.

