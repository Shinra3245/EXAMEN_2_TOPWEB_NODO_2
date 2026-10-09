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

Abrir http://localhost:3000. Sin `BANCO_CENTRAL_URL` ni `BANCO_CENTRAL_API_KEY` trabaja con datos de prueba.

## Variables de entorno

| Variable | Descripción |
|---|---|
| PORT | Puerto (Render lo asigna solo) |
| BANCO_CENTRAL_URL | URL de la API de Laravel del Banco Central, incluida su ruta base (ej. `https://.../api`) |
| BANCO_CENTRAL_API_KEY | API Key generada por el Banco Central para esta sucursal |

## Despliegue

Render (Web Service): build `npm install`, start `npm start`, despliegue automático en cada push.

## Enlaces

- Sucursal: _pendiente_
- Banco Central: _pendiente_
- Cajero: _pendiente_
