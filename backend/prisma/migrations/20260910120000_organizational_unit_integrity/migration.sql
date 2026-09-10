-- DropIndex
DROP INDEX "OrganizationalUnit_ouPath_idx";

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationalUnit_ouPath_key" ON "OrganizationalUnit"("ouPath");

-- AlterForeignKey: deleting an OU must fail while users still map to it.
ALTER TABLE "User" DROP CONSTRAINT "User_organizationalUnitId_fkey";

ALTER TABLE "User" ADD CONSTRAINT "User_organizationalUnitId_fkey" FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
