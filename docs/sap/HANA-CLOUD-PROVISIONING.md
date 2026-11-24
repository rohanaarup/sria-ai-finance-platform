# SAP HANA Cloud Provisioning & Deployment Runbook
## Sria Info Tech AI Finance Dashboard Generator

This runbook guides the human SAP BTP Administrator through provisioning SAP HANA Cloud when enterprise entitlements and budget are confirmed.

> [!IMPORTANT]
> **Current Status**: **BLOCKED / PENDING APPROVAL**
> For local development and CI testing, the application utilizes `@cap-js/sqlite`.
> Do not attempt to provision paid cloud resources until subaccount entitlements and project funding are approved.

---

### 1. Prerequisites (Human BTP Administrator)
1. Active SAP BTP Global Account with Enterprise Subaccount in a region supporting SAP HANA Cloud (e.g., `us10`, `eu10`, `ap21`).
2. Entitlements added in BTP Cockpit:
   - Service: **SAP HANA Cloud**
   - Service Plan: `hana` (or `hana-free` if exploring in trial/free tier)
   - Quota: Minimum 1 Compute Unit (2 vCPUs) and 30 GB Memory.
3. User assigned role collection: `HANA Cloud Administrator`.

---

### 2. Provisioning Steps via BTP Cockpit

1. Log in to **SAP BTP Cockpit** and navigate to your subaccount.
2. In the left navigation, select **SAP HANA Cloud** → **Instances**.
3. Click **Create Instance** → Select **SAP HANA Database**.
4. Configure Instance Settings:
   - **Instance Name**: `sria-finance-hana`
   - **Administrator Password**: Set master DB password (store securely in password manager).
   - **Memory & Storage**: 30 GB Memory (1 Compute unit).
5. Configure Network Access:
   - **Connections**: Select "Allow all IP addresses" or restrict to your Cloud Foundry org IP range.
   - Select "Allow other SAP BTP subaccounts and Cloud Foundry spaces".
6. Click **Create Instance** and wait until Status turns green (**Running**).

---

### 3. Binding to Cloud Foundry Application

1. In the target Cloud Foundry Space:
   ```bash
   cf create-service hana hdi-shared sria-finance-hdi
   ```
2. The `mta.yaml` deployment descriptor in `apps/cap/mta.yaml` will bind this HDI container:
   ```yaml
   resources:
     - name: sria-finance-hdi
       type: org.cloudfoundry.managed-service
       parameters:
         service: hana
         service-plan: hdi-shared
   ```

---

### 4. Verification Check
When provisioned and bound, verify from Cloud Foundry CLI:
```bash
cf service sria-finance-hdi
```
Status must indicate `create succeeded`.

If access or entitlements are unavailable, keep production persistence marked **BLOCKED** and proceed with local development using the SQLite adapter.

