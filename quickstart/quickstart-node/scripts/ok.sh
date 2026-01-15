curl -X POST http://localhost:3000/api/license/activate \
  -H "Content-Type: application/json" \
  -d '{ "tenantId": "tenant-1", "licenseKey": "XXXX" }'
