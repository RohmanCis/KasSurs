-- CreateTable
CREATE TABLE "report_snapshots" (
    "id" TEXT NOT NULL,
    "bulan" INTEGER NOT NULL,
    "tahun" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_snapshots_bulan_tahun_key" ON "report_snapshots"("bulan", "tahun");

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
