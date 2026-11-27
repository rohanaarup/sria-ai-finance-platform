# Field evidence (G2-03) — NOT YET GENERATED

This file will hold the field traceability table produced from the **real system's** service metadata:

```
node apps/cap/scripts/s4-discover.ts --file metadata.xml --out docs/sap/FIELD-EVIDENCE.md
```

Until it exists, no field the adapter reads has been confirmed against SAP. The adapter lists its candidate fields in `apps/cap/srv/lib/providers/s4hana/mapper.ts` (`SELECTED_FIELDS`) and refuses to query unless every one is present in the metadata it reads at runtime.

See `docs/sap/S4-CONNECTIVITY-RUNBOOK.md`, step 4.
