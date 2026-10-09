# Nodo 2 corregido y publicado

**9 de octubre de 2026.** https://sucursal-nodo2.onrender.com

Se corrigieron la validación de tipos, el manejo de errores async, la paginación completa del historial y los reportes en centavos. La conexión ahora exige una respuesta válida de una ruta autenticada; en producción una configuración incompleta devuelve 503 y no activa datos simulados.

Los reintentos con la misma clave recuperan la misma cuenta y un solo depósito. Cambiar los datos con esa clave devuelve 409. El formulario conserva la clave automáticamente; los clientes de API deben conservar `idempotency_key` o `Idempotency-Key`.

README y OpenAPI incluyen las URL, validaciones y errores. Se agregó Postman al repositorio, GitHub Actions y un Blueprint de referencia. **El despliegue automático se comprobó:** después del push, `/healthz` publicó el commit `5a2230229ef6beca12bf33f048e124d30b2a6aa7`, sin activar un despliegue manual. Render usa `main` y GitHub ahora tiene esa misma rama predeterminada. No se creó otro servicio.

## Validación

- **36 pruebas locales aprobadas**, incluyendo 1,051 movimientos, tipos incorrectos, reintentos simultáneos, respuesta perdida y reinicio real del proceso. Cero vulnerabilidades en `npm audit --omit=dev --audit-level=moderate`.
- **35 solicitudes Postman y 71 aserciones sin fallos** sobre el servicio publicado: apertura, consulta, saldo central, historial, reportes, errores y reintentos. [Resultados sin secretos](evidencias/nodo2_corregido_resultados.json).
- Formulario publicado: apertura de $1,000, reintento con la misma cuenta y un único depósito; titular enviado como array devuelve 400. [Resultado](evidencias/nodo2_corregido_ui.json), [captura de apertura](evidencias/nodo2_corregido_apertura.png) y [captura de historial](evidencias/nodo2_corregido_historial.png).
- Primera ejecución de CI completada correctamente: [GitHub Actions](https://github.com/Shinra3245/EXAMEN_2_TOPWEB_NODO_2/actions/runs/38005235460).

Las pruebas publicadas crearon cuatro cuentas nuevas de demostración. No se realizaron retiros ni cambios a cuentas existentes. Las pruebas locales usaron un Central aislado y credenciales ficticias.

## Continuación

Descargar las correcciones desde `main`, conservando primero cualquier cambio local. En el workspace de Omar, el código actualizado está en `NODE2_CORRECCIONES`; se conservó la carpeta anterior `NODE2` porque tenía commits y cambios propios.

Importar la [colección](../postman/verificacion_nodo2.postman_collection.json) y el [entorno sin credenciales](../postman/verificacion_nodo2.postman_environment.json). La ejecución completa crea tres cuentas; las carpetas 00 y 04 revisan una publicación posterior sin crear cuentas, reutilizando el entorno privado exportado y actualizando `expected_commit`.

**Pendiente del Nodo 3:** URL y contrato del ATM, retiro de $300 sobre una cuenta de $1,000, saldo $700, efectivo local correcto y rechazo sin efectivo. La colección conjunta está preparada; esas pruebas todavía no se han ejecutado.
