-- CreateTable
CREATE TABLE "ManualDirectoryOrganizationalUnit" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "distinguishedName" TEXT NOT NULL,
    "organizationalUnitPath" TEXT NOT NULL,
    "parentExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDirectoryOrganizationalUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualDirectoryUser" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "login" TEXT,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "distinguishedName" TEXT,
    "organizationalUnitPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDirectoryUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualDirectoryGroup" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "distinguishedName" TEXT,
    "organizationalUnitPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDirectoryGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualDirectoryOrganizationalUnit_externalId_key" ON "ManualDirectoryOrganizationalUnit"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualDirectoryOrganizationalUnit_distinguishedName_key" ON "ManualDirectoryOrganizationalUnit"("distinguishedName");

-- CreateIndex
CREATE UNIQUE INDEX "ManualDirectoryOrganizationalUnit_organizationalUnitPath_key" ON "ManualDirectoryOrganizationalUnit"("organizationalUnitPath");

-- CreateIndex
CREATE INDEX "ManualDirectoryOrganizationalUnit_parentExternalId_idx" ON "ManualDirectoryOrganizationalUnit"("parentExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualDirectoryUser_externalId_key" ON "ManualDirectoryUser"("externalId");

-- CreateIndex
CREATE INDEX "ManualDirectoryUser_organizationalUnitPath_idx" ON "ManualDirectoryUser"("organizationalUnitPath");

-- CreateIndex
CREATE UNIQUE INDEX "ManualDirectoryGroup_externalId_key" ON "ManualDirectoryGroup"("externalId");

-- CreateIndex
CREATE INDEX "ManualDirectoryGroup_organizationalUnitPath_idx" ON "ManualDirectoryGroup"("organizationalUnitPath");
