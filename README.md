# Demo VeriFactu

Demo de un sistema de facturación que aplica la parte técnica central de **VERI\*FACTU**, el sistema de la Agencia Tributaria (AEAT) contra el fraude en la facturación:

- **Huella (hash) SHA-256 encadenada**: cada registro de facturación incluye la huella del anterior.
- **Registros de alta y de anulación**, cada uno con su propia cadena de entrada.
- **Verificación de la cadena**: detecta si alguien ha cambiado una factura ya emitida.
- **QR tributario** con la URL del servicio de cotejo de la AEAT (entorno de pruebas), nivel de corrección M.

**Demo en vivo:** https://alejandrocorral509.github.io/verifactu-demo/

Sin dependencias ni build: HTML, CSS y JavaScript. Solo carga la librería del QR desde cdnjs.

## Cómo usarla

```bash
npx serve .
```

Abre la URL que aparece en la consola, pulsa **Cargar ejemplo** y después **Verificar cadena**. En **Simular una manipulación** puedes ver cómo se rompe la cadena.

Tests con los ejemplos oficiales de la AEAT:

```bash
node --test
```

## Cómo funciona

### 1. La huella de cada registro

Se concatenan unos campos concretos, en un orden fijo, con el formato `campo=valor&campo=valor…`:

| Alta | Anulación |
|---|---|
| IDEmisorFactura | IDEmisorFacturaAnulada |
| NumSerieFactura | NumSerieFacturaAnulada |
| FechaExpedicionFactura | FechaExpedicionFacturaAnulada |
| TipoFactura | Huella (del registro anterior) |
| CuotaTotal | FechaHoraHusoGenRegistro |
| ImporteTotal | |
| Huella (del registro anterior) | |
| FechaHoraHusoGenRegistro | |

A esa cadena (en UTF-8) se le aplica SHA-256, y el resultado se escribe en hexadecimal y en mayúsculas (64 caracteres). En el primer registro, la huella anterior va vacía (`Huella=`).

### 2. Por qué el encadenamiento impide el fraude

- Si cambias el importe de una factura, su huella ya no coincide con sus datos.
- Si además recalculas su huella, el **siguiente** registro deja de enlazar con ella.
- Para taparlo tendrías que recalcular toda la cadena hasta el final. Y en VeriFactu cada registro se envía a la AEAT al emitirse, así que Hacienda ya tiene las huellas originales.

### 3. El QR

Lleva una URL con 4 parámetros (`nif`, `numserie`, `fecha`, `importe`) codificados con URL encoding. Quien recibe la factura la escanea y la AEAT le dice si consta como registrada.

## Validación

`verifactu.js` reproduce exactamente los tres ejemplos del documento oficial de la AEAT (alta inicial, alta encadenada y anulación). La página lo comprueba al arrancar y lo muestra arriba a la derecha.

## Qué no incluye (y haría falta en un sistema real)

- Generar el XML del registro según los esquemas de la AEAT y enviarlo por servicio web SOAP con certificado electrónico.
- Registros de evento del sistema, declaración responsable del fabricante y persistencia en base de datos en lugar de `localStorage`.

## Fuentes

- AEAT: *Detalle de las especificaciones técnicas para generación de la huella o hash de los registros de facturación* (v0.1.2).
- AEAT: *Detalle de las especificaciones técnicas del código QR de la factura y de la URL del servicio de cotejo* (v0.5.0).
- Real Decreto 1007/2023 (reglamento de los sistemas de facturación) y Real Decreto-ley 15/2025, que retrasa la obligatoriedad a 2027.

Proyecto de aprendizaje de Alejandro Corral. Usa el NIF y el entorno de **pruebas** de la AEAT: no envía nada a Hacienda ni es un sistema certificado.
