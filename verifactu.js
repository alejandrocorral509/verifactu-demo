/*
 * Núcleo VeriFactu: huella (hash) encadenada y URL del QR tributario.
 *
 * Basado en los documentos técnicos de la AEAT:
 *  - "Detalle de las especificaciones técnicas para generación de la huella o hash
 *     de los registros de facturación" (v0.1.2)
 *  - "Detalle de las especificaciones técnicas del código QR de la factura" (v0.5.0)
 *
 * Funciona igual en el navegador y en Node (para los tests).
 */
(function (global) {
  'use strict';

  const URL_QR = {
    pruebas: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
    produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
  };

  // SHA-256 -> hexadecimal en MAYÚSCULAS (64 caracteres), como pide la AEAT.
  async function sha256Hex(texto) {
    const bytes = new TextEncoder().encode(texto); // UTF-8
    const digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  // "nombre=valor" sin espacios al inicio/final; si no hay valor, solo "nombre=".
  function campo(nombre, valor) {
    return nombre + '=' + (valor == null ? '' : String(valor).trim());
  }

  // Cadena de entrada del hash para un registro de ALTA (orden fijado por la AEAT).
  function cadenaAlta(r) {
    return [
      campo('IDEmisorFactura', r.nif),
      campo('NumSerieFactura', r.numSerie),
      campo('FechaExpedicionFactura', r.fecha),
      campo('TipoFactura', r.tipo),
      campo('CuotaTotal', r.cuotaTotal),
      campo('ImporteTotal', r.importeTotal),
      campo('Huella', r.huellaAnterior),
      campo('FechaHoraHusoGenRegistro', r.fechaHoraGen),
    ].join('&');
  }

  // Cadena de entrada del hash para un registro de ANULACIÓN.
  function cadenaAnulacion(r) {
    return [
      campo('IDEmisorFacturaAnulada', r.nif),
      campo('NumSerieFacturaAnulada', r.numSerie),
      campo('FechaExpedicionFacturaAnulada', r.fecha),
      campo('Huella', r.huellaAnterior),
      campo('FechaHoraHusoGenRegistro', r.fechaHoraGen),
    ].join('&');
  }

  function cadenaRegistro(r) {
    return r.clase === 'anulacion' ? cadenaAnulacion(r) : cadenaAlta(r);
  }

  function calcularHuella(r) {
    return sha256Hex(cadenaRegistro(r));
  }

  // Recorre la cadena y devuelve, por registro, si su huella y su enlace son correctos.
  async function verificarCadena(registros) {
    const resultado = [];
    for (let i = 0; i < registros.length; i++) {
      const r = registros[i];
      const esperadoAnterior = i === 0 ? '' : registros[i - 1].huella;
      const enlaceOk = (r.huellaAnterior || '') === esperadoAnterior;
      const huellaOk = (await calcularHuella(r)) === r.huella;
      resultado.push({ enlaceOk, huellaOk, ok: enlaceOk && huellaOk });
    }
    return resultado;
  }

  // URL que va dentro del QR. Los parámetros se codifican (URL encoding, UTF-8).
  function urlQR({ nif, numSerie, fecha, importeTotal }, entorno = 'pruebas') {
    const params = [
      'nif=' + encodeURIComponent(nif),
      'numserie=' + encodeURIComponent(numSerie),
      'fecha=' + encodeURIComponent(fecha),
      'importe=' + encodeURIComponent(importeTotal),
    ];
    return URL_QR[entorno] + '?' + params.join('&');
  }

  // Fecha y hora con huso horario, p. ej. 2024-01-01T19:20:30+01:00
  function fechaHoraConHuso(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const signo = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
      `${signo}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
    );
  }

  // De "2026-10-06" (input date) a "06-10-2026" (formato AEAT).
  function fechaAEAT(iso) {
    const [a, m, d] = iso.split('-');
    return `${d}-${m}-${a}`;
  }

  // Comprobaciones mínimas de formato que también hace el servicio de cotejo del QR.
  function validarFactura({ nif, numSerie }) {
    const errores = [];
    if (!/^[0-9A-Z]{9}$/.test(nif)) errores.push('El NIF debe tener 9 caracteres (números y letras en mayúscula).');
    if (!numSerie || numSerie.length > 60) errores.push('El número de serie es obligatorio y tiene un máximo de 60 caracteres.');
    else if (!/^[\x20-\x7E]+$/.test(numSerie)) errores.push('El número de serie solo admite caracteres ASCII imprimibles (sin tildes ni ñ).');
    return errores;
  }

  const Verifactu = {
    sha256Hex, cadenaAlta, cadenaAnulacion, cadenaRegistro, calcularHuella,
    verificarCadena, urlQR, fechaHoraConHuso, fechaAEAT, validarFactura,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Verifactu;
  else global.Verifactu = Verifactu;
})(typeof globalThis !== 'undefined' ? globalThis : window);
