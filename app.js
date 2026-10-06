/* Interfaz de la demo. Toda la lógica VeriFactu está en verifactu.js */
(function () {
  'use strict';
  const V = window.Verifactu;
  const CLAVE = 'verifactu-demo-registros';
  const $ = (sel) => document.querySelector(sel);

  let registros = cargar();
  let verificacion = null; // resultado de la última verificación
  let seleccionado = null; // índice de la factura mostrada

  // ---------- Utilidades ----------
  const eur = (cent) => (cent / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const aDecimal = (cent) => (cent / 100).toFixed(2); // formato de importe AEAT: punto y 2 decimales
  const corta = (h) => (h ? h.slice(0, 10) + '…' + h.slice(-6) : '— (primer registro)');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function cargar() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(registros)); } catch { /* sin almacenamiento: la demo sigue funcionando */ }
  }

  // ---------- Líneas de la factura ----------
  function nuevaLinea(concepto = '', uds = 1, precio = '', iva = 10) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input name="concepto" value="${esc(concepto)}" placeholder="Café con leche" aria-label="Concepto"></td>
      <td><input name="uds" type="number" min="1" step="1" value="${uds}" aria-label="Unidades"></td>
      <td><input name="precio" type="number" min="0" step="0.01" value="${precio}" placeholder="1.50" aria-label="Precio sin IVA"></td>
      <td><select name="iva" aria-label="Tipo de IVA">
        ${[21, 10, 4].map((t) => `<option value="${t}" ${t === iva ? 'selected' : ''}>${t} %</option>`).join('')}
      </select></td>
      <td><button type="button" class="quitar" aria-label="Quitar línea">×</button></td>`;
    $('#lineas').appendChild(tr);
    recalcular();
  }

  // Trabajamos en céntimos para evitar errores de redondeo de los decimales.
  function leerLineas() {
    return [...$('#lineas').rows].map((tr) => {
      const uds = parseInt(tr.querySelector('[name=uds]').value, 10) || 0;
      const precioCent = Math.round((parseFloat(tr.querySelector('[name=precio]').value) || 0) * 100);
      const iva = parseInt(tr.querySelector('[name=iva]').value, 10);
      const baseCent = uds * precioCent;
      return {
        concepto: tr.querySelector('[name=concepto]').value.trim(),
        uds, precioCent, iva, baseCent,
        cuotaCent: Math.round((baseCent * iva) / 100),
      };
    }).filter((l) => l.concepto && l.uds > 0);
  }

  function totales(lineas) {
    const base = lineas.reduce((s, l) => s + l.baseCent, 0);
    const cuota = lineas.reduce((s, l) => s + l.cuotaCent, 0);
    return { base, cuota, total: base + cuota };
  }

  function recalcular() {
    const t = totales(leerLineas());
    $('#t-base').textContent = eur(t.base);
    $('#t-cuota').textContent = eur(t.cuota);
    $('#t-total').textContent = eur(t.total);
  }

  function siguienteNumero(serie) {
    const usados = registros.filter((r) => r.clase === 'alta' && r.serie === serie).length;
    return `${serie}-${String(usados + 1).padStart(4, '0')}`;
  }

  // ---------- Alta y anulación ----------
  async function registrarAlta(datos) {
    const anterior = registros[registros.length - 1];
    const r = {
      clase: 'alta',
      ...datos,
      huellaAnterior: anterior ? anterior.huella : '',
      fechaHoraGen: V.fechaHoraConHuso(),
    };
    r.huella = await V.calcularHuella(r);
    registros.push(r);
    guardar();
    return registros.length - 1;
  }

  async function registrarAnulacion(i) {
    const f = registros[i];
    const anterior = registros[registros.length - 1];
    const r = {
      clase: 'anulacion',
      nif: f.nif, numSerie: f.numSerie, fecha: f.fecha,
      huellaAnterior: anterior.huella,
      fechaHoraGen: V.fechaHoraConHuso(),
    };
    r.huella = await V.calcularHuella(r);
    registros.push(r);
    guardar();
  }

  async function emitir(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nif = fd.get('nif').trim().toUpperCase();
    const serie = fd.get('serie').trim();
    const lineas = leerLineas();
    const numSerie = siguienteNumero(serie);
    const errores = V.validarFactura({ nif, numSerie });
    if (!fd.get('fecha')) errores.push('Indica la fecha de expedición.');
    if (!lineas.length) errores.push('Añade al menos una línea con concepto y unidades.');
    $('#form-errores').textContent = errores.join(' ');
    if (errores.length) return;

    const t = totales(lineas);
    const i = await registrarAlta({
      nif, serie, numSerie,
      fecha: V.fechaAEAT(fd.get('fecha')),
      tipo: fd.get('tipo'),
      cuotaTotal: aDecimal(t.cuota),
      importeTotal: aDecimal(t.total),
      lineas,
    });
    verificacion = null;
    seleccionado = i;
    render();
  }

  // ---------- Verificación y manipulación ----------
  async function verificar() {
    verificacion = await V.verificarCadena(registros);
    const malos = verificacion.filter((v) => !v.ok).length;
    const el = $('#resumen-verificacion');
    el.className = 'resumen ' + (malos ? 'ko' : 'ok');
    el.textContent = !registros.length ? ''
      : malos ? `✗ Cadena rota: ${malos} registro(s) no cuadran. La AEAT lo marcaría como «Aceptado con errores».`
      : `✓ Cadena íntegra: las ${registros.length} huellas coinciden y cada registro enlaza con el anterior.`;
    render();
  }

  async function manipular(recalcularHuella) {
    const i = parseInt($('#fraude-registro').value, 10);
    const r = registros[i];
    if (!r) return;
    const cent = Math.round(parseFloat(r.importeTotal) * 100);
    r.importeTotal = aDecimal(Math.round(cent / 2));
    if (recalcularHuella) r.huella = await V.calcularHuella(r);
    guardar();
    await verificar();
  }

  // ---------- Pintado ----------
  function render() {
    $('#vacio').hidden = registros.length > 0;
    if (!registros.length) $('#resumen-verificacion').textContent = '';

    const anuladas = new Set(registros.filter((r) => r.clase === 'anulacion').map((r) => r.numSerie));

    $('#cadena').innerHTML = registros.map((r, i) => {
      const v = verificacion && verificacion[i];
      const estado = !v ? '' : v.ok ? '<span class="estado ok">✓ correcto</span>'
        : `<span class="estado ko">✗ ${!v.huellaOk ? 'los datos no cuadran con su huella' : 'no enlaza con el registro anterior'}</span>`;
      const esAlta = r.clase === 'alta';
      return `
        <li class="registro ${v ? (v.ok ? 'ok' : 'ko') : ''}">
          <div class="reg-head">
            <span class="num">#${i + 1}</span>
            <span class="tag ${r.clase}">${esAlta ? 'Alta' : 'Anulación'}</span>
            <strong>${esc(r.numSerie)}</strong>
            ${esAlta ? `<span>${eur(Math.round(parseFloat(r.importeTotal) * 100))}</span>` : ''}
            ${esAlta && anuladas.has(r.numSerie) ? '<span class="tag anulada">anulada</span>' : ''}
            ${estado}
          </div>
          <div class="hashes">
            <span title="${esc(r.huellaAnterior)}">↳ anterior: <code>${corta(r.huellaAnterior)}</code></span>
            <span title="${esc(r.huella)}">huella: <code>${corta(r.huella)}</code></span>
          </div>
          ${esAlta ? `<div class="reg-actions">
            <button type="button" class="link" data-ver="${i}">Ver factura y QR</button>
            ${anuladas.has(r.numSerie) ? '' : `<button type="button" class="link" data-anular="${i}">Anular</button>`}
          </div>` : ''}
        </li>`;
    }).join('');

    $('#fraude-registro').innerHTML = registros
      .map((r, i) => (r.clase === 'alta' ? `<option value="${i}">#${i + 1} · ${esc(r.numSerie)} (${r.importeTotal} €)</option>` : ''))
      .join('');

    renderFactura();
  }

  function renderFactura() {
    const el = $('#factura');
    const r = registros[seleccionado];
    if (!r || r.clase !== 'alta') {
      el.className = 'factura-vacia';
      el.textContent = 'Selecciona «Ver factura y QR» en un registro.';
      return;
    }
    const url = V.urlQR(r);
    const qr = qrcode(0, 'M'); // nivel de corrección M, como exige la orden
    qr.addData(url);
    qr.make();

    el.className = 'factura';
    el.innerHTML = `
      <div class="qr-bloque">
        <div class="qr-label">QR tributario:</div>
        <img src="${qr.createDataURL(4, 0)}" alt="Código QR tributario de la factura ${esc(r.numSerie)}" class="qr">
        <div class="qr-label">VERI*FACTU</div>
      </div>
      <div class="factura-datos">
        <p><strong>${r.tipo === 'F1' ? 'Factura' : 'Factura simplificada'} ${esc(r.numSerie)}</strong><br>
        Emisor: ${esc(r.nif)} · Fecha: ${esc(r.fecha)}</p>
        <table class="detalle">
          <thead><tr><th>Concepto</th><th>Uds.</th><th>IVA</th><th>Base</th></tr></thead>
          <tbody>${(r.lineas || []).map((l) => `
            <tr><td>${esc(l.concepto)}</td><td>${l.uds}</td><td>${l.iva} %</td><td>${eur(l.baseCent)}</td></tr>`).join('')}
          </tbody>
        </table>
        <p class="factura-total">Cuota IVA ${r.cuotaTotal.replace('.', ',')} € · <strong>Total ${r.importeTotal.replace('.', ',')} €</strong></p>
      </div>
      <details class="como" open>
        <summary>Cómo se ha calculado</summary>
        <p>1. Cadena de entrada (campos en el orden que fija la AEAT):</p>
        <code class="bloque">${esc(V.cadenaAlta(r))}</code>
        <p>2. SHA-256 en hexadecimal y mayúsculas = huella del registro:</p>
        <code class="bloque">${esc(r.huella)}</code>
        <p>3. URL del QR (entorno de pruebas de la AEAT):</p>
        <code class="bloque"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></code>
      </details>`;
  }

  // ---------- Ejemplo y autotest ----------
  async function cargarEjemplo() {
    registros = [];
    const hoy = new Date().toISOString().slice(0, 10);
    const tickets = [
      [['Café con leche', 2, 1.36, 10], ['Tostada con tomate', 2, 2.27, 10]],
      [['Menú del día', 3, 12.73, 10], ['Agua 1,5 l', 1, 1.82, 10]],
      [['Caña', 4, 1.82, 10], ['Tapa de ensaladilla', 2, 3.18, 10]],
    ];
    for (const t of tickets) {
      const lineas = t.map(([concepto, uds, precio, iva]) => {
        const precioCent = Math.round(precio * 100);
        const baseCent = uds * precioCent;
        return { concepto, uds, precioCent, iva, baseCent, cuotaCent: Math.round((baseCent * iva) / 100) };
      });
      const tot = totales(lineas);
      await registrarAlta({
        nif: '89890001K', serie: 'T2026', numSerie: siguienteNumero('T2026'),
        fecha: V.fechaAEAT(hoy), tipo: 'F2',
        cuotaTotal: aDecimal(tot.cuota), importeTotal: aDecimal(tot.total), lineas,
      });
    }
    await registrarAnulacion(1);
    seleccionado = 0;
    await verificar();
  }

  // Al arrancar, comprobamos que el cálculo reproduce los 3 ejemplos oficiales de la AEAT.
  async function autotest() {
    const casos = [
      [{ clase: 'alta', nif: '89890001K', numSerie: '12345678/G33', fecha: '01-01-2024', tipo: 'F1', cuotaTotal: '12.35', importeTotal: '123.45', huellaAnterior: '', fechaHoraGen: '2024-01-01T19:20:30+01:00' },
        '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60'],
      [{ clase: 'alta', nif: '89890001K', numSerie: '12345679/G34', fecha: '01-01-2024', tipo: 'F1', cuotaTotal: '12.35', importeTotal: '123.45', huellaAnterior: '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60', fechaHoraGen: '2024-01-01T19:20:35+01:00' },
        'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97'],
      [{ clase: 'anulacion', nif: '89890001K', numSerie: '12345679/G34', fecha: '01-01-2024', huellaAnterior: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97', fechaHoraGen: '2024-01-01T19:20:40+01:00' },
        '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68'],
    ];
    let ok = 0;
    for (const [r, esperado] of casos) if ((await V.calcularHuella(r)) === esperado) ok++;
    const b = $('#autotest');
    b.textContent = `Ejemplos oficiales AEAT: ${ok}/${casos.length} correctos`;
    b.className = 'badge ' + (ok === casos.length ? 'ok' : 'ko');
  }

  // ---------- Eventos ----------
  $('#form-factura [name=fecha]').value = new Date().toISOString().slice(0, 10);
  $('#form-factura').addEventListener('submit', emitir);
  $('#form-factura').addEventListener('input', recalcular);
  $('#add-linea').addEventListener('click', () => nuevaLinea());
  $('#lineas').addEventListener('click', (e) => {
    if (e.target.matches('.quitar')) { e.target.closest('tr').remove(); recalcular(); }
  });
  $('#cadena').addEventListener('click', async (e) => {
    const ver = e.target.dataset.ver;
    const anular = e.target.dataset.anular;
    if (ver != null) { seleccionado = +ver; renderFactura(); $('#factura').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    if (anular != null) { await registrarAnulacion(+anular); verificacion = null; render(); }
  });
  $('#verificar').addEventListener('click', verificar);
  $('#ejemplo').addEventListener('click', cargarEjemplo);
  $('#borrar').addEventListener('click', () => { registros = []; verificacion = null; seleccionado = null; guardar(); render(); });
  $('#fraude-a').addEventListener('click', () => manipular(false));
  $('#fraude-b').addEventListener('click', () => manipular(true));

  nuevaLinea('Café con leche', 2, '1.36', 10);
  nuevaLinea('Tostada con tomate', 1, '2.27', 10);
  autotest();
  render();
})();
