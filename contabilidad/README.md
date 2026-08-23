# 21Days · Contabilidad

Aplicación interna de contabilidad, cobros y previsión de caja. Sustituye a
`CONTABILITAT_CORRECTE.xlsx`.

## Arrancar

```bash
npm install
npm run dev
```

No hace falta nada más. `dev` aplica las migraciones, y si la base de datos
está vacía carga el Excel de `data/` automáticamente. Después:
<http://localhost:3000>.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Migra, importa si hace falta y arranca |
| `npm run import` | Reimporta el Excel (idempotente, no duplica) |
| `npm run verify` | Compara los totales de la app con los del Excel, celda a celda |
| `npm run db:studio` | Explorador visual de la base de datos |
| `npm run db:reset` | Borra la base de datos y la vuelve a crear |

## Modelo de datos

`prisma/schema.prisma`. Las piezas:

- **Client** / **ClientAlias** — el alias hace que "Kreps Innova" y
  "Krepsinnova" acaben en la misma ficha, y que reimportar sea repetible.
- **CostConcept** — categoría, si es fijo, si su IVA es deducible y qué
  retención de IRPF lleva.
- **Movement** — la tabla central. **Un solo registro recorre previsto →
  facturado → cobrado**: cambia `status` y se rellena `settledAmount` y
  `settledDate`. Eso es lo que elimina las dos matrices de la hoja 3.
  `settledAmount` admite cobros parciales.
- **BudgetLine** — lo que esperamos cobrar por cliente y mes.
- **Scenario** — previsiones alternativas (optimista, conservadora).
- **TaxSettlement** — liquidación trimestral de IVA (303) e IRPF (111), con
  `computedAmount` (lo que calcula la app) y `manualAmount` (lo que se
  presentó de verdad, si difiere).
- **Setting** — caja inicial, tipo de IVA, etc.

### Migrar a Postgres

Cambia el `provider` del bloque `datasource` a `postgresql` y pon la cadena de
conexión en `DATABASE_URL`. No hay SQL crudo ni tipos específicos de SQLite en
la lógica, así que no hay nada más que tocar.

## Reglas de cálculo

En `src/lib/finance.ts`. Reproducen el Excel, corregido:

- Base imponible = importe con IVA ÷ 1,21
- IVA repercutido = base de ingresos × 21%, **excluyendo a Jaume Rey**, que se
  factura sin IVA
- IVA soportado = base de los gastos con IVA deducible × 21%
- IVA neto del trimestre = repercutido − soportado
- Retención de IRPF por colaborador (Marina Camp 7%, Lidia Rodriguez 15%,
  socios 15%)
- Beneficio bruto = ingresos − costes
- Beneficio neto = bruto − liquidaciones del mes en que se pagan
- Liquidaciones en enero, abril, julio y octubre, del trimestre anterior

**Sobre el redondeo:** el IVA se calcula sobre el total del mes
(`suma × 21/121`), no sumando el IVA de cada línea redondeado. Es lo que hace
el Excel y evita derivas de céntimos.

## Criterio contable

Criterio de **caja**: un movimiento cuenta en el mes en que entra o sale el
dinero. Cada movimiento guarda además `issueDate`, así que cambiar a criterio
de devengo es un cambio de configuración, no volver a meter datos.

## Importación

`scripts/import-excel.ts` lee las tres hojas de `data/CONTABILITAT_CORRECTE.xlsx`.
Es **idempotente**: cada movimiento lleva un `importKey` derivado de su celda
de origen, así que reimportar actualiza en vez de duplicar.

Qué manda cuando las hojas se contradicen:

| Dato | Fuente |
|---|---|
| Contabilidad 2026 (ene–jul) | Hoja 1 |
| Detalle de extras y del equipo de julio | Hoja 1, bloques de detalle |
| Previsión ago–dic | Hoja 2 |
| Lo que esperamos cobrar | Hoja 3, matriz superior |
| Estado de cobro | Hoja 3, matriz inferior |
| Cobros de oct–dic 2025 | Hoja 3 (no hay hoja 1 de 2025) |

## Verificación

`npm run verify` compara 57 magnitudes contra el Excel. Las diferencias que
quedan son deliberadas y están documentadas en `INFORME-FASE-1.md`.
