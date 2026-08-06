UPDATE sales AS sale
INNER JOIN pack_sales AS pack_sale ON pack_sale.id = sale.pack_sale_id
SET sale.total_amount = 0
WHERE pack_sale.discount_amount >= pack_sale.subtotal
  AND pack_sale.subtotal > 0
  AND sale.total_amount > 0;
