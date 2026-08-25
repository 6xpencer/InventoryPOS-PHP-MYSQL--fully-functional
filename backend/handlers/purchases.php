<?php
declare(strict_types=1);

/* ============================================================
 * Purchases (stock-in from suppliers): create, list, detail, stats
 * ============================================================ */

function purchase_row_normalize(array &$r): void
{
    foreach (['id', 'supplier_id', 'user_id'] as $k) {
        $r[$k] = $r[$k] !== null ? (int)$r[$k] : null;
    }
    if (isset($r['items_count'])) {
        $r['items_count'] = (int)$r['items_count'];
    }
}

$router->post('purchases', function () {
    require_roles(['admin', 'manager']);
    $b = body();
    $u = current_user();

    $supplierId = v_int($b, 'supplier_id', 1, PHP_INT_MAX);
    $supplier = db_one('SELECT * FROM suppliers WHERE id = ?', [$supplierId]);
    if (!$supplier) {
        fail('Selected supplier does not exist.', 422);
    }
    $notes = v_str($b, 'notes', 1000, false);

    $items = isset($b['items']) && is_array($b['items']) ? $b['items'] : [];
    if (!$items) {
        fail('The purchase order must contain at least one item.', 422);
    }
    if (count($items) > 200) {
        fail('Too many items in a single purchase.', 422);
    }

    $lines = [];
    $total = 0.0;
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
            fail("Product appears more than once (item #" . ($i + 1) . ").", 422);
        }
        $prod = db_one('SELECT * FROM products WHERE id = ?', [$pid]);
        if (!$prod) {
            fail("Item #" . ($i + 1) . ": product not found.", 422);
        }
        $cost = isset($it['cost_price']) && is_numeric($it['cost_price'])
            ? round2((float)$it['cost_price'])
            : round2((float)$prod['cost_price']);
        if ($cost < 0) {
            fail("Item #" . ($i + 1) . ": cost cannot be negative.", 422);
        }
        // Keep product master cost in sync with the latest buying price.
        $lineTotal = round2($cost * $qty);
        $total = round2($total + $lineTotal);
        $lines[$pid] = [
            'product'   => $prod,
            'qty'       => $qty,
            'cost'      => $cost,
            'lineTotal' => $lineTotal,
        ];
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        db_exec(
            'INSERT INTO purchases (reference, supplier_id, user_id, total, notes) VALUES ("",?,?,?,?)',
            [$supplierId, $u['id'], $total, $notes]
        );
        $purchaseId = last_id();
        $reference = sprintf('PO-%s-%06d', date('Ymd'), $purchaseId);
        db_exec('UPDATE purchases SET reference = ? WHERE id = ?', [$reference, $purchaseId]);

        foreach ($lines as $pid => $l) {
            db_exec(
                'INSERT INTO purchase_items (purchase_id, product_id, product_name, cost_price, quantity, line_total) VALUES (?,?,?,?,?,?)',
                [$purchaseId, $pid, $l['product']['name'], $l['cost'], $l['qty'], $l['lineTotal']]
            );
            db_exec('UPDATE products SET quantity = quantity + ?, cost_price = ? WHERE id = ?', [$l['qty'], $l['cost'], $pid]);
            record_movement($pid, $l['qty'], 'purchase', $reference, null, $u['id']);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fail('Could not record the purchase.', 500);
    }

    json_out(['purchase' => purchase_detail_payload($purchaseId)], 201);
}, ['admin', 'manager']);

function purchase_detail_payload(int $id): ?array
{
    $purchase = db_one(
        'SELECT p.*, s.name AS supplier_name, u.full_name AS received_by_name
         FROM purchases p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.id = ?', [$id]);
    if (!$purchase) {
        return null;
    }
    purchase_row_normalize($purchase);
    $items = db_all('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id ASC', [$id]);
    foreach ($items as &$it) {
        $it['id'] = (int)$it['id'];
        $it['quantity'] = (int)$it['quantity'];
        $it['product_id'] = $it['product_id'] !== null ? (int)$it['product_id'] : null;
    }
    unset($it);
    return ['purchase' => $purchase, 'items' => $items];
}

$router->get('purchases', function () {
    require_roles(['admin', 'manager']);
    [$page, $perPage, $offset] = paginate(10);
    $where = [];
    $params = [];
    if ($sup = int_param('supplier_id')) {
        $where[] = 'p.supplier_id = ?';
        $params[] = $sup;
    }
    $from = query_param('from');
    if ($from) {
        $where[] = 'p.created_at >= ?';
        $params[] = $from . ' 00:00:00';
    }
    $to = query_param('to');
    if ($to) {
        $where[] = 'p.created_at <= ?';
        $params[] = $to . ' 23:59:59';
    }
    if ($s = query_param('search')) {
        $where[] = '(p.reference LIKE ? OR s2.name LIKE ? OR u.full_name LIKE ?)';
        $like = "%$s%";
        array_push($params, $like, $like, $like);
    }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $total = (int)db_val(
        "SELECT COUNT(*) FROM purchases p
         LEFT JOIN suppliers s2 ON s2.id = p.supplier_id
         LEFT JOIN users u ON u.id = p.user_id $whereSql",
        $params
    );
    $rows = db_all(
        "SELECT p.*, s.name AS supplier_name, u.full_name AS received_by_name,
                (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS items_count
         FROM purchases p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN users u ON u.id = p.user_id
         $whereSql ORDER BY p.created_at DESC, p.id DESC LIMIT $perPage OFFSET $offset",
        $params
    );
    foreach ($rows as &$r) {
        purchase_row_normalize($r);
    }
    unset($r);
    json_out(paged_response($rows, $total, $page, $perPage));
}, []);

$router->get('purchases/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $payload = purchase_detail_payload((int)$p['id']);
    if (!$payload) {
        fail('Purchase not found.', 404);
    }
    json_out($payload);
}, ['admin', 'manager']);

$router->get('purchases/stats', function () {
    require_roles(['admin', 'manager']);
    $row = [
        'orders_total'  => (int)db_val('SELECT COUNT(*) FROM purchases'),
        'spend_total'   => round2((float)(db_val('SELECT COALESCE(SUM(total),0) FROM purchases') ?? 0)),
        'spend_month'   => round2((float)(db_val('SELECT COALESCE(SUM(total),0) FROM purchases WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)') ?? 0)),
        'suppliers_used'=> (int)db_val('SELECT COUNT(DISTINCT supplier_id) FROM purchases'),
    ];
    json_out(['stats' => $row]);
}, ['admin', 'manager']);
