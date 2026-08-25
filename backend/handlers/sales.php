<?php
declare(strict_types=1);

/* ============================================================
 * Sales: create (POS checkout), list, detail, void
 * ============================================================ */

function sale_row_normalize(array &$r): void
{
    foreach (['id', 'user_id', 'customer_id', 'voided_by'] as $k) {
        $r[$k] = $r[$k] !== null ? (int)$r[$k] : null;
    }
    if (isset($r['items_count'])) {
        $r['items_count'] = (int)$r['items_count'];
    }
}

$router->post('sales', function () {
    require_roles([]);
    $b = body();
    $u = current_user();

    $items = isset($b['items']) && is_array($b['items']) ? $b['items'] : [];
    if (!$items) {
        fail('The sale must contain at least one item.', 422);
    }
    if (count($items) > 200) {
        fail('Too many items in a single sale.', 422);
    }

    $customerId = v_int($b, 'customer_id', 1, PHP_INT_MAX, false, 0) ?: null;
    if ($customerId && !db_one('SELECT id FROM customers WHERE id = ?', [$customerId])) {
        fail('Selected customer does not exist.', 422);
    }
    $discount = v_num($b, 'discount', 0, PHP_FLOAT_MAX, false, 0);
    $method = in_array($b['payment_method'] ?? '', ['cash', 'card', 'mobile'], true) ? $b['payment_method'] : 'cash';
    $paid = v_num($b, 'paid_amount', 0, PHP_FLOAT_MAX, false, 0);

    $taxRate = max(0.0, tax_rate_default());

    // Resolve and validate every line against live product data.
    $lines = [];
    $subtotal = 0.0;
    foreach ($items as $i => $it) {
        if (!is_array($it)) {
            fail("Item #" . ($i + 1) . " is invalid.", 422);
        }
        $pid = isset($it['product_id']) ? (int)$it['product_id'] : 0;
        $qty = isset($it['quantity']) ? (int)$it['quantity'] : 0;
        if ($pid <= 0 || $qty <= 0) {
            fail("Item #" . ($i + 1) . " needs a product and a positive quantity.", 422);
        }
        if (isset($lines[$pid])) {
            fail("Product appears more than once in the cart (item #" . ($i + 1) . ").", 422);
        }
        $prod = db_one('SELECT * FROM products WHERE id = ?', [$pid]);
        if (!$prod || $prod['status'] !== 'active') {
            fail("Item #" . ($i + 1) . ": product is unavailable.", 422);
        }
        if ((int)$prod['quantity'] < $qty) {
            fail("Insufficient stock for \"{$prod['name']}\". Available: {$prod['quantity']}.", 422);
        }
        // Price is taken from the server record to prevent tampering.
        $unit = round2((float)$prod['sell_price']);
        $lineTotal = round2($unit * $qty);
        $subtotal = round2($subtotal + $lineTotal);
        $lines[$pid] = [
            'product'   => $prod,
            'qty'       => $qty,
            'unit'      => $unit,
            'lineTotal' => $lineTotal,
        ];
    }

    if ($discount > $subtotal) {
        fail('Discount cannot exceed the order subtotal.', 422);
    }
    $taxable = round2($subtotal - $discount);
    $tax = round2($taxable * $taxRate / 100);
    $total = round2($taxable + $tax);

    if ($paid <= 0) {
        $paid = $total;
    }
    if ($paid < $total) {
        fail('Paid amount is less than the total due.', 422);
    }
    $change = round2($paid - $total);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        db_exec(
            'INSERT INTO sales (reference, user_id, customer_id, subtotal, discount, tax, total, paid_amount, change_due, payment_method)
             VALUES ("",?,?,?,?,?,?,?,?,?)',
            [$u['id'], $customerId, $subtotal, $discount, $tax, $total, $paid, $change, $method]
        );
        $saleId = last_id();
        $reference = sprintf('INV-%s-%06d', date('Ymd'), $saleId);
        db_exec('UPDATE sales SET reference = ? WHERE id = ?', [$reference, $saleId]);

        foreach ($lines as $pid => $l) {
            db_exec(
                'INSERT INTO sale_items (sale_id, product_id, product_name, sku, unit_price, quantity, line_total) VALUES (?,?,?,?,?,?,?)',
                [$saleId, $pid, $l['product']['name'], $l['product']['sku'], $l['unit'], $l['qty'], $l['lineTotal']]
            );
            $updated = db_exec(
                'UPDATE products SET quantity = quantity - ? WHERE id = ? AND quantity >= ?',
                [$l['qty'], $pid, $l['qty']]
            );
            if ($updated === 0) {
                throw new RuntimeException("Stock changed for \"{$l['product']['name']}\" during checkout.");
            }
            record_movement($pid, -$l['qty'], 'sale', $reference, null, $u['id']);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fail($e->getMessage() ?: 'Checkout failed.', 500);
    }

    json_out(['sale' => sale_detail_payload($saleId)], 201);
}, []);

function sale_detail_payload(int $id): ?array
{
    $sale = db_one(
        'SELECT s.*, u.full_name AS cashier_name, c.name AS customer_name,
                vb.full_name AS voided_by_name
         FROM sales s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN users vb ON vb.id = s.voided_by
         WHERE s.id = ?', [$id]);
    if (!$sale) {
        return null;
    }
    sale_row_normalize($sale);
    $items = db_all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC', [$id]);
    foreach ($items as &$it) {
        $it['id'] = (int)$it['id'];
        $it['quantity'] = (int)$it['quantity'];
        $it['product_id'] = $it['product_id'] !== null ? (int)$it['product_id'] : null;
    }
    unset($it);
    return ['sale' => $sale, 'items' => $items];
}

$router->get('sales/stats', function () {
    require_roles([]);
    $from = query_param('from');
    $to = query_param('to');
    $params = ["completed"];
    $rangeSql = '';
    if ($from && $to) {
        $rangeSql = ' AND s.created_at BETWEEN ? AND ?';
        $params[] = $from . ' 00:00:00';
        $params[] = $to . ' 23:59:59';
    } else {
        $rangeSql = ' AND s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }
    $row = db_one(
        "SELECT COUNT(*) AS orders_count,
                COALESCE(SUM(s.total),0) AS revenue,
                COALESCE(AVG(s.total),0) AS avg_order_value,
                COALESCE(SUM(s.discount),0) AS discounts_total,
                COALESCE(SUM(s.tax),0) AS tax_total
         FROM sales s WHERE s.status = ?" . $rangeSql,
        $params
    );
    $row['items_sold'] = (int)(db_val(
        "SELECT COALESCE(SUM(si.quantity),0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed'" . $rangeSql,
        $params
    ) ?? 0);
    $row['revenue'] = round2((float)$row['revenue']);
    $row['avg_order_value'] = round2((float)$row['avg_order_value']);
    $row['discounts_total'] = round2((float)$row['discounts_total']);
    $row['tax_total'] = round2((float)$row['tax_total']);
    $row['orders_count'] = (int)$row['orders_count'];

    // Payment breakdown over the same range
    $payRows = db_all(
        "SELECT s.payment_method AS method, COUNT(*) AS cnt, COALESCE(SUM(s.total),0) AS amount
         FROM sales s WHERE s.status = 'completed'" . $rangeSql .
        " GROUP BY s.payment_method",
        $params
    );
    $payments = array_map(fn($r) => [
        'method' => $r['method'],
        'count'  => (int)$r['cnt'],
        'amount' => round2((float)$r['amount']),
    ], $payRows);

    // Daily series
    $series = db_all(
        "SELECT DATE(s.created_at) AS d, COUNT(*) AS orders, COALESCE(SUM(s.total),0) AS revenue
         FROM sales s WHERE s.status = 'completed'" . $rangeSql .
        " GROUP BY DATE(s.created_at) ORDER BY d ASC",
        $params
    );

    json_out(['stats' => $row, 'payments' => $payments, 'series' => $series]);
}, []);

$router->get('sales', function () {
    require_roles([]);
    [$page, $perPage, $offset] = paginate(10);
    $where = [];
    $params = [];

    $status = query_param('status');
    if (in_array($status, ['completed', 'voided'], true)) {
        $where[] = 's.status = ?';
        $params[] = $status;
    }
    $method = query_param('method');
    if (in_array($method, ['cash', 'card', 'mobile'], true)) {
        $where[] = 's.payment_method = ?';
        $params[] = $method;
    }
    $from = query_param('from');
    if ($from) {
        $where[] = 's.created_at >= ?';
        $params[] = $from . ' 00:00:00';
    }
    $to = query_param('to');
    if ($to) {
        $where[] = 's.created_at <= ?';
        $params[] = $to . ' 23:59:59';
    }
    if ($s = query_param('search')) {
        $where[] = '(s.reference LIKE ? OR u.full_name LIKE ? OR c.name LIKE ?)';
        $like = "%$s%";
        array_push($params, $like, $like, $like);
    }

    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $total = (int)db_val("SELECT COUNT(*) FROM sales s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN customers c ON c.id=s.customer_id $whereSql", $params);
    $rows = db_all(
        "SELECT s.*, u.full_name AS cashier_name, c.name AS customer_name,
                (SELECT COALESCE(SUM(quantity),0) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
         FROM sales s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         $whereSql ORDER BY s.created_at DESC, s.id DESC LIMIT $perPage OFFSET $offset",
        $params
    );
    foreach ($rows as &$r) {
        sale_row_normalize($r);
    }
    unset($r);
    json_out(paged_response($rows, $total, $page, $perPage));
}, []);

$router->get('sales/:id', function (array $p) {
    require_roles([]);
    $payload = sale_detail_payload((int)$p['id']);
    if (!$payload) {
        fail('Sale not found.', 404);
    }
    json_out($payload);
}, []);

$router->post('sales/:id/void', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    $sale = db_one("SELECT * FROM sales WHERE id = ?", [$id]);
    if (!$sale) {
        fail('Sale not found.', 404);
    }
    if ($sale['status'] === 'voided') {
        fail('This sale has already been voided.', 409);
    }
    $u = current_user();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $items = db_all('SELECT * FROM sale_items WHERE sale_id = ?', [$id]);
        foreach ($items as $it) {
            if ($it['product_id'] === null) continue;
            $pid = (int)$it['product_id'];
            db_exec('UPDATE products SET quantity = quantity + ? WHERE id = ?', [(int)$it['quantity'], $pid]);
            record_movement($pid, (int)$it['quantity'], 'void_restore', $sale['reference'], 'Sale voided', $u['id']);
        }
        db_exec("UPDATE sales SET status='voided', voided_by=?, voided_at=NOW() WHERE id=?", [$u['id'], $id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fail('Could not void the sale.', 500);
    }
    json_out(['ok' => true]);
}, ['admin', 'manager']);
