// Tests con los ejemplos oficiales de la AEAT. Ejecutar con: node --test
const test = require('node:test');
const assert = require('node:assert');
const V = require('../verifactu.js');

// Documento "huella o hash", apartado 6, casos 1, 2 y 3.
test('Caso 1 AEAT: primer registro de alta (sin huella anterior)', async () => {
  const r = {
    clase: 'alta', nif: '89890001K', numSerie: '12345678/G33', fecha: '01-01-2024',
    tipo: 'F1', cuotaTotal: '12.35', importeTotal: '123.45', huellaAnterior: '',
    fechaHoraGen: '2024-01-01T19:20:30+01:00',
  };
  assert.strictEqual(
    V.cadenaAlta(r),
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024' +
      '&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00'
  );
  assert.strictEqual(await V.calcularHuella(r), '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
});

test('Caso 2 AEAT: segundo registro de alta encadenado', async () => {
  const r = {
    clase: 'alta', nif: '89890001K', numSerie: '12345679/G34', fecha: '01-01-2024',
    tipo: 'F1', cuotaTotal: '12.35', importeTotal: '123.45',
    huellaAnterior: '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
    fechaHoraGen: '2024-01-01T19:20:35+01:00',
  };
  assert.strictEqual(await V.calcularHuella(r), 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97');
});

test('Caso 3 AEAT: registro de anulación encadenado', async () => {
  const r = {
    clase: 'anulacion', nif: '89890001K', numSerie: '12345679/G34', fecha: '01-01-2024',
    huellaAnterior: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
    fechaHoraGen: '2024-01-01T19:20:40+01:00',
  };
  assert.strictEqual(await V.calcularHuella(r), '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68');
});

test('Los espacios al inicio y al final no cambian la huella', async () => {
  const base = {
    clase: 'alta', nif: '89890001K', numSerie: '12345678/G33', fecha: '01-01-2024',
    tipo: 'F1', cuotaTotal: '12.35', importeTotal: '123.45', huellaAnterior: '',
    fechaHoraGen: '2024-01-01T19:20:30+01:00',
  };
  const conEspacios = { ...base, numSerie: '  12345678/G33 ' };
  assert.strictEqual(await V.calcularHuella(conEspacios), await V.calcularHuella(base));
});

test('URL del QR: codifica los caracteres especiales (ejemplo AEAT con "&")', () => {
  const url = V.urlQR({ nif: '89890001K', numSerie: '12345678&G33', fecha: '01-01-2024', importeTotal: '241.4' });
  assert.strictEqual(
    url,
    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.4'
  );
});

test('Verificar cadena: detecta un importe manipulado', async () => {
  const r1 = {
    clase: 'alta', nif: '89890001K', numSerie: 'A-1', fecha: '01-10-2026', tipo: 'F2',
    cuotaTotal: '2.10', importeTotal: '12.10', huellaAnterior: '', fechaHoraGen: '2026-10-01T10:00:00+02:00',
  };
  r1.huella = await V.calcularHuella(r1);
  const r2 = {
    clase: 'alta', nif: '89890001K', numSerie: 'A-2', fecha: '01-10-2026', tipo: 'F2',
    cuotaTotal: '4.20', importeTotal: '24.20', huellaAnterior: r1.huella, fechaHoraGen: '2026-10-01T10:05:00+02:00',
  };
  r2.huella = await V.calcularHuella(r2);

  assert.deepStrictEqual((await V.verificarCadena([r1, r2])).map((x) => x.ok), [true, true]);

  r1.importeTotal = '1.10'; // alguien "rebaja" la primera factura
  assert.deepStrictEqual((await V.verificarCadena([r1, r2])).map((x) => x.ok), [false, true]);

  r1.huella = await V.calcularHuella(r1); // y recalcula su huella para taparlo...
  assert.deepStrictEqual((await V.verificarCadena([r1, r2])).map((x) => x.ok), [true, false]); // ...pero se rompe el enlace con la siguiente
});
