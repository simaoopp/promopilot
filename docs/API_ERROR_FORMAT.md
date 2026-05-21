# Formato de erros API

Todas as novas APIs devem responder assim:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Campo inválido: name.",
    "requestId": "req_..."
  }
}
```

O `requestId` deve aparecer também nos logs para investigar incidentes.
