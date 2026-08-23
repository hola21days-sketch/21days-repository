-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "monthlyFee" DECIMAL,
    "vatExempt" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClientAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alias" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    CONSTRAINT "ClientAlias_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostConcept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isFixed" BOOLEAN NOT NULL DEFAULT true,
    "vatDeductible" BOOLEAN NOT NULL DEFAULT true,
    "irpfRate" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "CostConceptAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alias" TEXT NOT NULL,
    "costConceptId" TEXT NOT NULL,
    CONSTRAINT "CostConceptAlias_costConceptId_fkey" FOREIGN KEY ("costConceptId") REFERENCES "CostConcept" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "clientId" TEXT,
    "costConceptId" TEXT,
    "concept" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "issueDate" DATETIME,
    "dueDate" DATETIME,
    "settledDate" DATETIME,
    "grossAmount" DECIMAL NOT NULL,
    "baseAmount" DECIMAL NOT NULL,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.21,
    "vatAmount" DECIMAL NOT NULL,
    "irpfRate" DECIMAL NOT NULL DEFAULT 0,
    "irpfAmount" DECIMAL NOT NULL DEFAULT 0,
    "vatDeductible" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'FORECAST',
    "isForecast" BOOLEAN NOT NULL DEFAULT false,
    "invoiceNumber" TEXT,
    "notes" TEXT,
    "scenarioId" TEXT,
    "importKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Movement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_costConceptId_fkey" FOREIGN KEY ("costConceptId") REFERENCES "CostConcept" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "scenarioId" TEXT,
    CONSTRAINT "BudgetLine_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "year" INTEGER NOT NULL,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TaxSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "computedAmount" DECIMAL NOT NULL DEFAULT 0,
    "manualAmount" DECIMAL,
    "dueDate" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAlias_alias_key" ON "ClientAlias"("alias");

-- CreateIndex
CREATE INDEX "ClientAlias_clientId_idx" ON "ClientAlias"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CostConcept_name_key" ON "CostConcept"("name");

-- CreateIndex
CREATE INDEX "CostConcept_category_idx" ON "CostConcept"("category");

-- CreateIndex
CREATE UNIQUE INDEX "CostConceptAlias_alias_key" ON "CostConceptAlias"("alias");

-- CreateIndex
CREATE INDEX "CostConceptAlias_costConceptId_idx" ON "CostConceptAlias"("costConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_importKey_key" ON "Movement"("importKey");

-- CreateIndex
CREATE INDEX "Movement_year_month_idx" ON "Movement"("year", "month");

-- CreateIndex
CREATE INDEX "Movement_kind_year_month_idx" ON "Movement"("kind", "year", "month");

-- CreateIndex
CREATE INDEX "Movement_clientId_year_month_idx" ON "Movement"("clientId", "year", "month");

-- CreateIndex
CREATE INDEX "Movement_costConceptId_year_month_idx" ON "Movement"("costConceptId", "year", "month");

-- CreateIndex
CREATE INDEX "Movement_status_idx" ON "Movement"("status");

-- CreateIndex
CREATE INDEX "Movement_scenarioId_idx" ON "Movement"("scenarioId");

-- CreateIndex
CREATE INDEX "BudgetLine_year_month_idx" ON "BudgetLine"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_clientId_year_month_scenarioId_key" ON "BudgetLine"("clientId", "year", "month", "scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_name_year_key" ON "Scenario"("name", "year");

-- CreateIndex
CREATE INDEX "TaxSettlement_status_idx" ON "TaxSettlement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TaxSettlement_year_quarter_kind_key" ON "TaxSettlement"("year", "quarter", "kind");
