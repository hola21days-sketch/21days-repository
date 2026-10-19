/**
 * Recoge los formularios de las webs de 21DAYS y Outoflamode en Google Sheets.
 * ---------------------------------------------------------------------------
 * Cómo ponerlo en marcha (una sola vez):
 *  1. Crea una hoja de cálculo «Leads webs» en Google Drive.
 *  2. Extensiones → Apps Script, pega este archivo y guarda.
 *  3. Implementar → Nueva implementación → Tipo «Aplicación web».
 *     Ejecutar como: tú. Quién tiene acceso: cualquier usuario.
 *  4. Copia la URL que termina en /exec y pégala en SHEETS_URL de
 *     webs/21days/index.html y webs/outoflamode/index.html.
 *
 * Cada web escribe en su pestaña: «21DAYS» (formulario ¿Encajamos?) y
 * «Outoflamode» (brief). Si la pestaña no existe, se crea con cabeceras.
 * En 21DAYS, la columna «cualificado» dice SÍ cuando el negocio factura
 * más de 100.000 € al año y puede invertir al menos 500 € al mes.
 */

const COLUMNAS = {
  '21DAYS': ['fecha', 'cualificado', 'puntuacion', 'negocio', 'sector', 'zona', 'ciudad',
             'facturacion', 'presupuesto', 'servicios', 'ideas', 'cuando',
             'nombre', 'telefono', 'email', 'instagram'],
  'Outoflamode': ['fecha_envio', 'tipo', 'marca', 'sector', 'presupuesto', 'plazo',
                  'idea', 'referencias', 'nombre', 'email'],
};

function doPost(e) {
  const datos = JSON.parse(e.postData.contents);
  const pestana = datos.origen === 'outoflamode' ? 'Outoflamode' : '21DAYS';
  const columnas = COLUMNAS[pestana];

  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(pestana);
  if (!hoja) {
    hoja = libro.insertSheet(pestana);
    hoja.appendRow(columnas);
    hoja.setFrozenRows(1);
  }
  hoja.appendRow(columnas.map((c) => datos[c] ?? ''));

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
