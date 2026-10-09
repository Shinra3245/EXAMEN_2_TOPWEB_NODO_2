# Nodo 2 - Sucursal

Servidor Administrativo de Sucursal del Sistema Bancario Distribuido (Express).
No tiene base de datos propia: todas las operaciones se hacen contra la API del Banco Central enviando la API Key de la sucursal en el header `X-API-KEY`.

## Arquitectura

```
          BANCO CENTRAL (Laravel + Supabase)
               ▲                       ▲
     X-API-KEY │                       │ X-API-KEY
               │                       │
     SUCURSAL (Express)          CAJERO ATM (Express)
```

## Funcionalidades

- Ver la conexión con el Banco Central y probarla (`/config`); la URL y la API Key solo se configuran en variables de entorno
- Abrir cuentas de clientes (`/cuentas/nueva`)
- Consultar cuentas (`/cuentas/buscar`)
- Historial de transacciones local o por cliente, con reporte de operaciones (`/historial`)
- Documentación OpenAPI en `/docs` (archivo `docs/openapi.yaml`)

## Estructura

```
app.js                 servidor y configuración
routes/                rutas web y API
controllers/           lógica de cada ruta
services/centralApi.js llamadas al Banco Central
services/mockCentral.js datos de prueba sin conexión
middlewares/           logs y manejo de errores
views/                 pantallas (EJS)
docs/openapi.yaml      documentación de la API
```

## Correr en local

```
npm install
cp .env.example .env
npm run dev
```

Abrir http://localhost:3000. En local, sin `BANCO_CENTRAL_URL` ni `BANCO_CENTRAL_API_KEY` trabaja con datos de prueba. Con `NODE_ENV=production`, una configuración incompleta devuelve 503 y no utiliza datos simulados.

## Variables de entorno

| Variable | Descripción |
|---|---|
| PORT | Puerto (Render lo asigna solo) |
| BANCO_CENTRAL_URL | URL de la API de Laravel del Banco Central, incluida su ruta base (ej. `https://.../api`) |
| BANCO_CENTRAL_API_KEY | API Key generada por el Banco Central para esta sucursal |

## Despliegue

Render (Web Service), conservando el servicio `sucursal-nodo2` existente.

Configuración recomendada: Node 24.16.0, build `npm ci --ignore-scripts && npm test`, start `npm start`, health check `/healthz` y **Auto-Deploy: On Commit**. `render.yaml` declara estos valores para un Blueprint; añadirlo al repositorio no modifica automáticamente un servicio creado manualmente. No crear otro servicio para reemplazar el existente. Conservar sus variables de entorno y aplicar estos valores en su panel si todavía no los tiene.

El repositorio tiene `master` y `main`. Conectar Render a la rama que utilice el servicio; el Blueprint propone `master`, que es la rama predeterminada. `/healthz` devuelve el commit y la rama desplegados cuando Render proporciona sus variables. Un push seguido por ese commit publicado permite comprobar el despliegue continuo.

## Pruebas y reintentos

`npm test` ejecuta pruebas HTTP contra un Central aislado en loopback, con credenciales ficticias. No abre cuentas en Supabase. GitHub Actions también ejecuta las pruebas y `npm audit --omit=dev --audit-level=moderate` en cada push y PR.

Para las pruebas reales, importar la colección y el entorno de `postman/`, completar la clave privada de sucursal y activar `permitir_aperturas=true`. Ejecutar la colección completa con una iteración. Crea tres cuentas de demostración; los casos de regresión requieren comprobar primero `/healthz`. `expected_commit` permite exigir la versión publicada que se desea validar. Los archivos exportados no contienen claves reales.

La API exige `titular` de tipo texto y `saldo_inicial` de tipo número, no negativo y con hasta dos decimales. El formulario admite el texto numérico que envía HTML. Los errores de entrada devuelven 400; los errores del Central se conservan como 401, 422, 502 o 503, según el caso.

Para reintentar `POST /api/cuentas`, enviar la misma `idempotency_key` en el JSON o `Idempotency-Key` en el header. La clave admite hasta 128 letras, números, puntos, guiones o dos puntos. La primera apertura devuelve 201; un reintento devuelve 200, la misma cuenta y `reintentada: true`. Cambiar titular o saldo con esa clave devuelve 409. El saldo devuelto es el saldo actual de la cuenta; el importe original se contrasta con el depósito de apertura.

Si se omite la clave, cada solicitud representa una apertura nueva. El formulario ya incluye una clave oculta que se conserva al reintentar o corregir un error. El número de cuenta y la clave central se derivan del intento y la sucursal, por lo que la protección sobrevive al reinicio del servidor y no necesita otra base de datos. El Central mantiene las cuentas y el ledger. Las credenciales de la sucursal deben conservarse durante un reintento.

El historial recorre todas las páginas del Central y rechaza respuestas o paginación inválidas. Los reportes se suman en centavos. Historial local significa movimientos procesados por esta sucursal; los retiros del ATM pertenecen al historial del Nodo 3, mientras que el saldo de la cuenta siempre se consulta al Central.

## Enlaces

- Sucursal: https://sucursal-nodo2.onrender.com
- Banco Central: https://banco-central-nodo1.onrender.com
- API Central: https://banco-central-nodo1.onrender.com/api
- OpenAPI Sucursal: https://sucursal-nodo2.onrender.com/docs
- Salud del proceso: https://sucursal-nodo2.onrender.com/healthz
- Cajero: pendiente de la URL y contrato reales del Nodo 3.

La prueba conjunta pendiente es apertura de $1,000, retiro real de $300 desde el ATM y saldo $700, más rechazo por falta de efectivo. El flujo y la colección conjunta están preparados en la carpeta `INTEGRACION` del workspace del examen; no se acredita el ATM antes de ejecutar esas pruebas.
