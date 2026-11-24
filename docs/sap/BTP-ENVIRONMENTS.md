# SAP BTP Landscape & Cloud Foundry Runtime Guide
## Sria Info Tech AI Finance Dashboard Generator

This document explains the enterprise cloud architecture, SAP Business Technology Platform (BTP) hierarchy, and Cloud Foundry runtime concepts governing the Sria Info Tech deployment.

---

### 1. SAP BTP Architectural Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SAP BTP GLOBAL ACCOUNT                          │
│                   Enterprise Commercial Agreement                      │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    ENTERPRISE SUBACCOUNT                         │  │
│  │               (Regional Infrastructure e.g. us10, eu10)          │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │              CLOUD FOUNDRY ENVIRONMENT (Org)              │  │  │
│  │  │                                                           │  │  │
│  │  │  ┌───────────────────────┐   ┌─────────────────────────┐  │  │  │
│  │  │  │  SPACE: 'development' │   │   SPACE: 'production'   │  │  │  │
│  │  │  │                       │   │                         │  │  │  │
│  │  │  │ • sria-cap-srv (App)  │   │ • sria-cap-srv (App)    │  │  │  │
│  │  │  │ • sria-xsuaa (Binding)│   │ • sria-xsuaa (Binding)  │  │  │  │
│  │  │  │ • sria-dest (Binding) │   │ • sria-dest (Binding)   │  │  │  │
│  │  │  └───────────────────────┘   └─────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Definitions:
1. **Global Account**: The top-level administrative and billing agreement with SAP.
2. **Subaccount**: An independent, isolated operational unit representing a region, legal entity, or environment tier.
3. **Cloud Foundry Org**: A multi-tenant organizational container inside a subaccount sharing quotas and domains.
4. **Cloud Foundry Space**: An isolated runtime environment (e.g. `dev`, `stage`, `prod`) housing application containers and service instances.
5. **Service Instance**: An instantiated BTP platform capability (e.g., `xsuaa`, `destination`, `connectivity`).
6. **Service Binding**: An authenticated link between an application container and a service instance providing runtime credentials via the standard `VCAP_SERVICES` environment variable.

---

### 2. Service Bindings & Injected Environment

When deployed to Cloud Foundry, CAP reads bound service credentials dynamically from the `VCAP_SERVICES` container environment.

| Bound Service | Service Name | Service Plan | Injected Purpose |
| :--- | :--- | :--- | :--- |
| **Identity Service** | `xsuaa` | `application` | JWT validation, client ID, client secret, public key, and OAuth token endpoints. |
| **Destination Service** | `destination` | `lite` | Runtime lookup of S/4HANA OData endpoint credentials and certificates. |
| **Connectivity Service** | `connectivity` | `lite` | *(Conditional)* Proxy credentials for SAP Cloud Connector if S/4HANA is on-premise. |
| **Database** | `hana` | `hdi-shared` | *(Conditional)* Host, port, user, and schema credentials for SAP HANA Cloud. |

> [!IMPORTANT]
> Developers and applications never hardcode connection strings. SAP CAP's `@sap/cds` runtime automatically parses `VCAP_SERVICES` and configures service clients on boot.

---

### 3. Cloud Foundry Deployment Options

The project supports two deployment mechanisms:
1. **Multi-Target Application (MTA)** via `mta.yaml`:
   - Enterprise standard packaging web, backend, and security descriptors into a single `.mtar` archive deployed via `cf deploy`.
2. **Direct Manifest Push** via `manifest.yml`:
   - Lightweight alternative for rapid staging deployment using standard Cloud Foundry CLI:
     ```bash
     cd apps/cap
     npm run build
     cf push
     ```

