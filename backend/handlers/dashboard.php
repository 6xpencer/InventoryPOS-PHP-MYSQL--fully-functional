<?php
declare(strict_types=1);

/* ============================================================
 * Dashboard: KPIs, charts and activity feeds
 * ============================================================ */

$router->get('dashboard/stats', function () {
    require_roles([]);

    $salesToday = db_one(
        "SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders
         FROM sales WHERE status='completed' AND created_at >= CURDATE()"
    );
    $yesterday = db_one(
        "SELECT COALESCE(SUM(total),0) AS revenue
         FROM sales WHERE status='completed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND created_at < CURDATE()"
    );

    // 14-day revenue series (gap-filled)
    $seriesRows = db_all(
        "SELECT DATE(created_at) AS d, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
         FROM sales
         WHERE status='completed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
         GROUP BY DATE(created_at)"
    );
    $indexed = [];
    foreach ($seriesRows as $r) {
        $indexed[$r['d']] = $r;
    }
    $series = [];
    for ($i = 13; $i >= 0; $i--) {
        $day = date('Y-m-d', strtotime("-$i day"));
        $row = $indexed[$day] ?? null;
        $series[] = [
            'date'    => $day,
            'orders'  => $row ? (int)$row['orders'] : 0,
            'revenue' => $row ? round2((float)$row['revenue']) : 0.0,
        ];
    }

    // Payment breakdown last 30 days
    $payments = db_all(
        "SELECT payment_method AS method, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS amount
         FROM sales WHERE status='completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY payment_method"
    );
    $payments = array_map(fn($r) => [
        'method' => $r['method'],
        'count'  => (int)$r['cnt'],
        'amount' => round2((float)$r['amount']),
    ], $payments);

    // Top products last 30 days
    $topProducts = db_all(
        "SELECT si.product_name, si.sku,
                SUM(si.quantity) AS qty_sold,
                SUM(si.line_total) AS revenue
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status='completed' AND s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY si.product_name, si.sku
         ORDER BY revenue DESC LIMIT 6"
    );
    $topProducts = array_map(fn($r) => [
        'name'    => $r['product_name'],
        'sku'     => $r['sku'],
        'qty'     => (int)$r['qty_sold'],
        'revenue' => round2((float)$r['revenue']),
    ], $topProducts);

    // Low stock feed
    $lowStock = db_all(
        "SELECT id, sku, name, quantity, reorder_level
         FROM products
         WHERE status='active' AND quantity <= reorder_level
         ORDER BY quantity ASC, name ASC LIMIT 8"
    );
    $lowStockCount = (int)db_val(
        "SELECT COUNT(*) FROM products WHERE status='active' AND quantity <= reorder_level"
    );
    foreach ($lowStock as &$l) {
        $l['id'] = (int)$l['id'];
        $l['quantity'] = (int)$l['quantity'];
        $l['reorder_level'] = (int)$l['reorder_level'];
    }
    unset($l);

    // Recent completed sales
    $recentSales = db_all(
        "SELECT s.id, s.reference, s.total, s.payment_method, s.created_at, u.full_name AS cashier_name
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
         ORDER BY s.created_at DESC, s.id DESC LIMIT 8"
    );
    foreach ($recentSales as &$s) {
        $s['id'] = (int)$s['id'];
        $s['total'] = round2((float)$s['total']);
    }
    unset($s);

    json_out([
        'today' => [
            'revenue'       => round2((float)$salesToday['revenue']),
            'orders'        => (int)$salesToday['orders'],
            'yesterday_rev' => round2((float)$yesterday['revenue']),
        ],
        'inventory' => (function () {
            $row = db_one(
                "SELECT
                    COALESCE(SUM(cost_price*quantity),0)  AS cost_value,
                    COALESCE(SUM(sell_price*quantity),0)  AS retail_value,
                    COALESCE(SUM(quantity),0)             AS units,
                    COUNT(*)                             AS products
                 FROM products WHERE status='active'"
            );
            return [
                'cost_value'   => round2((float)($row['cost_value'] ?? 0)),
                'retail_value' => round2((float)($row['retail_value'] ?? 0)),
                'units'        => (int)($row['units'] ?? 0),
                'products'     => (int)($row['products'] ?? 0),
            ];
        })(),
        'counts' => [
            'customers' => (int)db_val('SELECT COUNT(*) FROM customers'),
            'suppliers' => (int)db_val('SELECT COUNT(*) FROM suppliers'),
            'users'     => (int)db_val('SELECT COUNT(*) FROM users'),
            'categories'=> (int)db_val('SELECT COUNT(*) FROM categories'),
        ],
        'low_stock_count' => $lowStockCount,
        'series'          => $series,
        'payments'        => $payments,
        'top_products'    => $topProducts,
        'low_stock'       => $lowStock,
        'recent_sales'    => $recentSales,
    ]);
}, []);

$router->get('notifications', function () {
    require_roles([]);
    if (get_setting('low_stock_alerts', '1') !== '1') {
        json_out(['items' => [], 'count' => 0]);
    }
    $user = current_user();
    $items = db_all(
        "SELECT id, sku, name, quantity, reorder_level
         FROM products
         WHERE status='active' AND quantity <= reorder_level
         ORDER BY quantity ASC LIMIT 50"
    );
    foreach ($items as &$i) {
        $i['id'] = (int)$i['id'];
        $i['quantity'] = (int)$i['quantity'];
        $i['reorder_level'] = (int)$i['reorder_level'];
    }
    unset($i);

    $readMap = [];
    if ($user) {
        $rows = db_all('SELECT product_id, is_read FROM notification_states WHERE user_id = ?', [$user['id']]);
        foreach ($rows as $r) {
            $readMap[(int)$r['product_id']] = (int)$r['is_read'];
        }
    }
    foreach ($items as &$it) {
        $it['read'] = ($readMap[$it['id']] ?? 0) === 1;
    }
    unset($it);

    $unread = 0;
    foreach ($items as $it) {
        if (!$it['read']) $unread++;
    }
    json_out(['items' => $items, 'count' => $unread]);
}, []);

$router->post('notifications/mark', function () {
    require_roles([]);
    $user = current_user();
    if (!$user) {
        fail('Authentication required.', 401);
    }
    $b = body();
    $flag = !empty($b['read']) ? 1 : 0;

    if (!empty($b['all'])) {
        $ids = db_all("SELECT id FROM products WHERE status='active' AND quantity <= reorder_level");
        foreach ($ids as $r) {
            db_exec(
                'INSERT INTO notification_states (user_id, product_id, is_read) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE is_read = ?',
                [$user['id'], (int)$r['id'], $flag, $flag]
            );
        }
    } elseif (isset($b['product_id']) && is_numeric($b['product_id'])) {
        $pid = (int)$b['product_id'];
        db_exec(
            'INSERT INTO notification_states (user_id, product_id, is_read) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE is_read = ?',
            [$user['id'], $pid, $flag, $flag]
        );
    } else {
        fail('Provide "product_id" or "all".', 422);
    }
    json_out(['ok' => true]);
}, []);
