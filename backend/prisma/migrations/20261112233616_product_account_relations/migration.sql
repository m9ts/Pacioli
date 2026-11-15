-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_cmvAccountId_fkey" FOREIGN KEY ("cmvAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
