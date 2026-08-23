-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BudgetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "scenarioKey" TEXT NOT NULL DEFAULT 'base',
    "scenarioId" TEXT,
    CONSTRAINT "BudgetLine_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BudgetLine" ("amount", "clientId", "id", "month", "scenarioId", "year") SELECT "amount", "clientId", "id", "month", "scenarioId", "year" FROM "BudgetLine";
DROP TABLE "BudgetLine";
ALTER TABLE "new_BudgetLine" RENAME TO "BudgetLine";
CREATE INDEX "BudgetLine_year_month_idx" ON "BudgetLine"("year", "month");
CREATE UNIQUE INDEX "BudgetLine_clientId_year_month_scenarioKey_key" ON "BudgetLine"("clientId", "year", "month", "scenarioKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
