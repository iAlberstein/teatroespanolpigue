UPDATE sales AS s
JOIN pack_sales AS ps ON ps.id = s.pack_sale_id
JOIN (
  SELECT sale_id,
         SUM(CASE WHEN type <> 'service' THEN price ELSE 0 END) AS ticket_subtotal,
         SUM(CASE WHEN type = 'service' THEN price ELSE 0 END) AS services_subtotal
  FROM tickets
  GROUP BY sale_id
) AS sale_totals ON sale_totals.sale_id = s.id
JOIN (
  SELECT s2.pack_sale_id,
         SUM(CASE WHEN t.type <> 'service' THEN t.price ELSE 0 END) AS pack_ticket_subtotal
  FROM sales AS s2
  JOIN tickets AS t ON t.sale_id = s2.id
  WHERE s2.pack_sale_id IS NOT NULL
  GROUP BY s2.pack_sale_id
) AS pack_totals ON pack_totals.pack_sale_id = s.pack_sale_id
SET s.total_amount = GREATEST(
  0,
  ROUND(
    sale_totals.ticket_subtotal
      - CASE
          WHEN pack_totals.pack_ticket_subtotal > 0
            THEN ps.discount_amount * (sale_totals.ticket_subtotal / pack_totals.pack_ticket_subtotal)
          ELSE 0
        END
      + sale_totals.services_subtotal,
    2
  )
)
WHERE s.pack_sale_id IS NOT NULL
  AND s.payment_method = 'card'
  AND ps.service_fee_amount > 0;
