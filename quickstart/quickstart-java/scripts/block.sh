curl -X POST http://localhost:8080/api/license/activate \
  -H "Content-Type: application/json" \
  -d '{ "tenantId": "tenant-2", "licenseKey": "XXXX" }'
