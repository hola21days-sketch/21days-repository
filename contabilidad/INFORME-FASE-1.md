# Fase 1 — Importación y verificación

Resultado: **41 de 57 comprobaciones cuadran al céntimo.** Las 16 diferencias
son todas deliberadas o errores del propio Excel. Ninguna es un fallo de
cálculo de la app.

Reproducir: `npm run verify`.

## Lo que cuadra exactamente

Enero a julio de 2026, mes a mes y en el total:

| Magnitud | Excel | App |
|---|---|---|
| Total ingresos | 87.168,75 € | 87.168,75 € |
| Total costes | 59.886,83 € | 59.886,83 € |
| Beneficio bruto | 27.281,92 € | 27.281,92 € |
| IVA repercutido | 14.703,25 € | 14.703,25 € |
| Retenciones IRPF (ene–jun) | 3.123,65 € | 3.123,65 € |

Los doce importes mensuales de ingresos, costes y beneficio bruto coinciden al
céntimo, y también el IVA repercutido de los siete meses.

## Las 16 diferencias, una a una

### 1. IVA soportado: −213,24 € en el año

El detalle de extras marca seis líneas como "(sense IVA)", pero la fórmula del
Excel se lleva el 21% de la línea entera igualmente.

| Mes | Línea | Importe | IVA que el Excel deduce de más |
|---|---|---|---|
| Mar | Devolució Marc (sense IVA) | 700,00 € | 121,49 € |
| Abr | Extres (sense IVA) + Giro factures + Parking | 512,13 € | 88,88 € |
| May | Giro factures (sense IVA) | 5,53 € | 0,96 € |
| Jun | Comissions bancàries (sense IVA) | 5,53 € | 0,96 € |
| Jul | Comissions bancàries (sense IVA) | 5,47 € | 0,95 € |
| | | **Total** | **213,24 €** |

La app tiene razón: no se puede deducir IVA de una comisión bancaria ni de una
devolución sin factura. Efecto: se paga **213,24 € más de IVA** del que dice el
Excel.

### 2. Retenciones de IRPF de julio: +289,02 €

El Excel pone 84 € a mano (un mes de Marina a 1.200 € × 7%). El desglose real
de julio, que está en la propia hoja, dice otra cosa:

| Proveedor | Facturado en julio | Base | Tipo | Retención |
|---|---|---|---|---|
| Marina Camp (4 facturas) | 3.693,60 € | 3.052,56 € | 7% | 213,68 € |
| Lidia Rodriguez (2 facturas) | 1.285,35 € | 1.062,27 € | 15% | 159,34 € |
| Marta Cumplido | 534,24 € | 441,52 € | — | 0,00 € |
| | | | **Total** | **373,02 €** |

Más los 450 € de los socios: **823,02 €** frente a los 534 € del Excel. Esto
va al modelo 111 del Q3, que se presenta en octubre, así que aún estás a
tiempo.

### 3. Liquidaciones trimestrales

| Trimestre | Excel | App | Diferencia | Motivo |
|---|---|---|---|---|
| Q1 (pagado abr) | 3.863,15 € | 3.984,63 € | +121,49 € | IVA no deducible de marzo |
| Q2 (pagado jul) | 5.080,84 € | 5.222,69 € | +141,85 € | 90,80 € de IVA no deducible + **51,05 € de un importe escrito a mano** |

El Q2 del Excel está escrito a mano: la fórmula da 5.131,89 € y la celda pone
5.080,84 €. Faltan 51,05 €.

**Beneficio neto ene–jul: 9.600,94 €** frente a los 9.864,28 € del Excel.
La diferencia, 263,34 €, es exactamente la suma de los dos ajustes de arriba.

### 4. Cobros: diez celdas donde la hoja 1 y la hoja 3 se contradicen

| Cliente | Mes | Hoja 3 | Hoja 1/2 | Qué pasa |
|---|---|---|---|---|
| Jaume Rey | Mar | 500,00 € | 0 | Cobrado pero no facturado en la hoja 1 |
| Odicean | Mar | 363,00 € | 0 | Ídem |
| Jaume Rey | Jun | 250,00 € | 0 | Ídem |
| Mireia Jubany | Ago | 217,80 € | 0 | Cobrado, pero la previsión de agosto la deja a 0 |
| KBcrossfit | Ago | 338,80 € | 0 | Ídem |
| Dra Nogueres | Ago | 1.270,50 € | 0 | Ídem |
| Odicean | Feb | 0 | 181,50 € | Facturado, pero la hoja 3 no lo controla |
| GMS Basket | Abr | 0 | 484,00 € | Ídem |
| Claudia Rodriguez | Abr | 0 | 1.452,00 € | Ídem |
| Tekstila | Jul | 0 | 847,00 € | Ídem |

Más **1.906,15 € de extras de ingresos** que están en la hoja 1 y que la hoja 3
no sigue en absoluto.

La app ha respetado la hoja 1 para la contabilidad, así que estas diez celdas
quedan pendientes de una decisión tuya. Son diez clics en la pantalla de cobros
cuando la tengamos (fase 3).

## Errores del Excel corregidos de oficio

1. **Los totales anuales del bloque de costes están desplazados tres filas.**
   `N31` es `=SUM(B28:M28)` en vez de `=SUM(B31:M31)`, y así todas.

   | Línea | Lo que muestra el Excel | Lo correcto |
   |---|---|---|
   | Nòmines | 87.168,75 € | 22.827,00 € |
   | Oficina | 0,00 € | 2.216,48 € |
   | Gestoria | 0,00 € | 2.603,31 € |
   | Autonom Adri | 22.827,00 € | 2.739,12 € |
   | Autonom Aina | 2.216,48 € | 2.147,80 € |
   | Softwares | 2.603,31 € | 1.156,00 € |
   | Equip | 2.739,12 € | 11.403,19 € |
   | Extres | 2.147,80 € | 11.493,93 € |
   | Envios DKSide | 1.156,00 € | 300,00 € |
   | Producció DKSide | 11.403,19 € | 3.000,00 € |

   Los totales por mes y el `TOTAL COSTOS` sí estaban bien, así que el
   beneficio nunca se vio afectado.

2. **`PENDENT DE COBRAR` estaba a cero fijo** de oct-25 a jul-26. Escondía
   1.820,90 € de Dermaesthetic en oct-25 y 217 € de Celia Zanon en jun-26.

3. **Lidia Rodriguez no tenía fila de IRPF** en la hoja 1. Ya la tiene.

4. **La etiqueta de Marina decía 15%** cuando la fórmula aplicaba el 7%. La
   etiqueta era la equivocada.

## Pendiente de decisión

- **Caja inicial de agosto**: la celda dice 25.582 € y el subtítulo de la hoja
  dice 28.582,80 €. He usado la celda, que es la que alimenta el flujo.
- **Extras previstos por duplicado** en la hoja 2: "Extres previsió 600 €" y
  "Extres detall 600 €" se suman los dos, 1.200 €/mes de septiembre a
  diciembre. Importado tal cual, pendiente de confirmar.
- **Las diez celdas** de la tabla de cobros de arriba.
