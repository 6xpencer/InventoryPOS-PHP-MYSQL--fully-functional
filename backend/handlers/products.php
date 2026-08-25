<?php
declare(strict_types=1);

/* ============================================================
 * Products: list / detail / create / update / delete, stats,
 * stock adjustment and movement history
 * ============================================================ */

const PRODUCT_SORTS = ['name', 'sku', 'quantity', 'sell_price', 'created_at'];

function product_row_normalize(array &$r): void
{
    $r['id'] = (int)$r['id'];
    $r['category_id'] = $r['category_id'] !== null ? (int)$r['category_id'] : null;
    $r['supplier_id'] = $r['supplier_id'] !== null ? (int)$r['supplier_id'] : null;
    $r['quantity'] = (int)$r['quantity'];
    $r['reorder_level'] = (int)$r['reorder_level'];
    $r['stock_state'] = $r['status'] !== 'active' ? 'archived'
        : ($r['quantity'] <= 0 ? 'out' : ($r['quantity'] <= $r['reorder_level'] ? 'low' : 'ok'));
}

$router->get('products/stats', function () {
    require_roles([]);
    $row = db_one(
        "SELECT
            COUNT(*)                                          AS total_products,
            COALESCE(SUM(status = 'active'),0)                AS active_products,
            COALESCE(SUM(status = 'active' AND quantity <= 0),0) AS out_of_stock,
            COALESCE(SUM(status = 'active' AND quantity > 0 AND quantity <= reorder_level),0) AS low_stock,
            COALESCE(SUM(CASE WHEN status='active' THEN cost_price * quantity END), 0) AS inventory_cost_value,
            COALESCE(SUM(CASE WHEN status='active' THEN sell_price * quantity END), 0) AS inventory_retail_value,
            COALESCE(SUM(CASE WHEN status='active' THEN quantity END), 0)              AS total_units
         FROM products"
    );
    $row['categories_count'] = (int)db_val('SELECT COUNT(*) FROM categories');
    json_out(['stats' => $row]);
}, []);

$router->get('products', function () {
    require_roles([]);
    [$page, $perPage, $offset] = paginate(10);
    $where = [];
    $params = [];

    if ($s = query_param('search')) {
        $where[] = '(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
        $like = "%$s%";
        array_push($params, $like, $like, $like);
    }
    if ($cat = int_param('category_id')) {
        $where[] = 'p.category_id = ?';
        $params[] = $cat;
    }
    if ($sup = int_param('supplier_id')) {
        $where[] = 'p.supplier_id = ?';
        $params[] = $sup;
    }
    $status = query_param('status');
    if (in_array($status, ['active', 'archived'], true)) {
        $where[] = 'p.status = ?';
        $params[] = $status;
    }
    if (int_param('low') === 1) {
        $where[] = "p.status='active' AND p.quantity > 0 AND p.quantity <= p.reorder_level";
    }
    if (int_param('out') === 1) {
        $where[] = "p.status='active' AND p.quantity <= 0";
    }

    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $sortRaw = query_param('sort', 'created_at');
    $sort = in_array($sortRaw, PRODUCT_SORTS, true) ? $sortRaw : 'created_at';
    $dir  = strtoupper(query_param('dir', 'DESC')) === 'ASC' ? 'ASC' : 'DESC';

    $total = (int)db_val("SELECT COUNT(*) FROM products p $whereSql", $params);
    $rows = db_all(
        "SELECT p.*, c.name AS category_name, s.name AS supplier_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers  s ON s.id = p.supplier_id
         $whereSql ORDER BY p.$sort $dir LIMIT $perPage OFFSET $offset",
        $params
    );
    foreach ($rows as &$r) {
        product_row_normalize($r);
    }
    unset($r);
    json_out(paged_response($rows, $total, $page, $perPage));
}, []);

$router->get('products/:id', function (array $p) {
    require_roles([]);
    $id = (int)$p['id'];
    $product = db_one(
        'SELECT p.*, c.name AS category_name, s.name AS supplier_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers  s ON s.id = p.supplier_id
         WHERE p.id = ?', [$id]);
    if (!$product) {
        fail('Product not found.', 404);
    }
    product_row_normalize($product);
    $movements = db_all(
        'SELECT m.*, u.full_name AS user_name
         FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.product_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 15', [$id]);
    json_out(['product' => $product, 'movements' => $movements]);
}, []);

function validate_product_payload(array $b, ?int $ignoreId = null): array
{
    $name = v_str($b, 'name', 150);
    $sku  = v_str($b, 'sku', 50);
    if (!preg_match('/^[A-Za-z0-9_-]{2,50}$/', $sku)) {
        fail('SKU must be 2-50 characters (letters, numbers, dash, underscore).', 422);
    }
    $dupeSql = 'SELECT id FROM products WHERE sku = ?' . ($ignoreId ? ' AND id <> ' . $ignoreId : '');
    if (db_one($dupeSql, [$sku])) {
        fail("SKU \"$sku\" is already used by another product.", 422);
    }

    $categoryId = v_int($b, 'category_id', 1, PHP_INT_MAX, false, 0) ?: null;
    if ($categoryId && !db_one('SELECT id FROM categories WHERE id = ?', [$categoryId])) {
        fail('Selected category does not exist.', 422);
    }
    $supplierId = v_int($b, 'supplier_id', 1, PHP_INT_MAX, false, 0) ?: null;
    if ($supplierId && !db_one('SELECT id FROM suppliers WHERE id = ?', [$supplierId])) {
        fail('Selected supplier does not exist.', 422);
    }

    return [
        'sku'           => $sku,
        'name'          => $name,
        'category_id'   => $categoryId,
        'supplier_id'   => $supplierId,
        'barcode'       => v_str($b, 'barcode', 64, false),
        'cost_price'    => v_num($b, 'cost_price', 0),
        'sell_price'    => v_num($b, 'sell_price', 0),
        'quantity'      => v_int($b, 'quantity', 0, 1000000000),
        'reorder_level' => v_int($b, 'reorder_level', 0, 1000000),
        'status'        => in_array($b['status'] ?? '', ['active', 'archived'], true) ? $b['status'] : 'active',
    ];
}

$router->post('products', function () {
    require_roles(['admin', 'manager']);
    $data = validate_product_payload(body());
    $pdo = db();
    $pdo->beginTransaction();
    try {
        db_exec(
            'INSERT INTO products (sku,name,category_id,supplier_id,barcode,cost_price,sell_price,quantity,reorder_level,status)
             VALUES (?,?,?,?,?,?,?,?,?,?)',
            array_values($data)
        );
        $id = last_id();
        if ($data['quantity'] > 0) {
            record_movement($id, $data['quantity'], 'initial', null, 'Opening stock on product creation', current_user()['id']);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fail('Could not save product.', 500);
    }
    json_out(['product' => db_one('SELECT * FROM products WHERE id = ?', [$id])], 201);
}, ['admin', 'manager']);

$router->put('products/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    $existing = db_one('SELECT * FROM products WHERE id = ?', [$id]);
    if (!$existing) {
        fail('Product not found.', 404);
    }
    // Quantity is managed via purchases/sales/adjustments; the edit form never sends it,
    // so fall back to the stored quantity to satisfy validation.
    $payload = body();
    if (!isset($payload['quantity'])) {
        $payload['quantity'] = (int)$existing['quantity'];
    }
    $data = validate_product_payload($payload, $id);

    // Quantity is managed via purchases/sales/adjustments; editing a product never changes stock directly.
    db_exec(
        'UPDATE products SET sku=?, name=?, category_id=?, supplier_id=?, barcode=?, cost_price=?, sell_price=?, reorder_level=?, status=? WHERE id=?',
        [$data['sku'], $data['name'], $data['category_id'], $data['supplier_id'], $data['barcode'],
         $data['cost_price'], $data['sell_price'], $data['reorder_level'], $data['status'], $id]
    );
    json_out(['product' => db_one('SELECT * FROM products WHERE id = ?', [$id])]);
}, ['admin', 'manager']);

$router->delete('products/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    $existing = db_one('SELECT * FROM products WHERE id = ?', [$id]);
    if (!$existing) {
        fail('Product not found.', 404);
    }
    $referenced = db_one(
        'SELECT id FROM sale_items WHERE product_id = ? UNION SELECT id FROM purchase_items WHERE product_id = ? LIMIT 1',
        [$id, $id]
    );
    if ($referenced || (int)$existing['quantity'] !== 0) {
        // Keep ledger integrity: archive instead of hard delete.
        db_exec("UPDATE products SET status='archived' WHERE id = ?", [$id]);
        json_out(['ok' => true, 'archived' => true]);
    }
    db_exec('DELETE FROM products WHERE id = ?', [$id]);
    json_out(['ok' => true, 'deleted' => true]);
}, ['admin', 'manager']);

$router->post('stock/adjust', function () {
    require_roles(['admin', 'manager']);
    $b = body();
    $productId = v_int($b, 'product_id', 1, PHP_INT_MAX);
    $change = isset($b['change_qty']) && is_numeric($b['change_qty']) ? (int)$b['change_qty'] : 0;
    if ($change === 0) {
        fail('Adjustment quantity cannot be zero.', 422);
    }
    $note = v_str($b, 'note', 255);
    $product = db_one('SELECT * FROM products WHERE id = ?', [$productId]);
    if (!$product) {
        fail('Product not found.', 404);
    }
    $newQty = (int)$product['quantity'] + $change;
    if ($newQty < 0) {
        fail('Adjustment would result in negative stock. Current quantity: ' . $product['quantity'] . '.', 422);
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        db_exec('UPDATE products SET quantity = ? WHERE id = ?', [$newQty, $productId]);
        record_movement($productId, $change, 'adjustment', null, $note, current_user()['id']);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fail('Could not adjust stock.', 500);
    }
    json_out(['product' => db_one('SELECT * FROM products WHERE id = ?', [$productId])]);
}, ['admin', 'manager']);

$router->get('stock/movements', function () {
    require_roles([]);
    [$page, $perPage, $offset] = paginate(15);
    $where = [];
    $params = [];
    if ($pid = int_param('product_id')) {
        $where[] = 'm.product_id = ?';
        $params[] = $pid;
    }
    $type = query_param('type');
    if (in_array($type, ['initial', 'purchase', 'sale', 'adjustment', 'void_restore'], true)) {
        $where[] = 'm.type = ?';
        $params[] = $type;
    }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $total = (int)db_val("SELECT COUNT(*) FROM stock_movements m $whereSql", $params);
    $rows = db_all(
        "SELECT m.*, pr.name AS product_name, pr.sku, u.full_name AS user_name
         FROM stock_movements m
         LEFT JOIN products pr ON pr.id = m.product_id
         LEFT JOIN users u ON u.id = m.user_id
         $whereSql ORDER BY m.created_at DESC, m.id DESC LIMIT $perPage OFFSET $offset",
        $params
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['product_id'] = $r['product_id'] !== null ? (int)$r['product_id'] : null;
        $r['change_qty'] = (int)$r['change_qty'];
        $r['user_id'] = $r['user_id'] !== null ? (int)$r['user_id'] : null;
    }
    unset($r);
    json_out(paged_response($rows, $total, $page, $perPage));
}, []);
