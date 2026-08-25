<?php
declare(strict_types=1);

/* ============================================================
 * Reports: sales analytics + inventory analytics (admin/manager)
 * ============================================================ */

function report_range(): array
{
    $from = query_param('from', date('Y-m-d', strtotime('-29 days')));
    $to = query_param('to', date('Y-m-d'));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from ?? '') || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to ?? '')) {
        $from = date('Y-m-d', strtotime('-29 days'));
        $to = date('Y-m-d');
    }
    return [$from, $to, $from . ' 00:00:00', $to . ' 23:59:59'];
}

$router->get('reports/sales', function () {
    require_roles(['admin', 'manager']);
    [$from, $to, $fromTs, $toTs] = report_range();

    $summary = db_one(
        "SELECT COUNT(*) AS orders,
                COALESCE(SUM(total),0) AS revenue,
                COALESCE(AVG(total),0) AS avg_order_value,
                COALESCE(SUM(discount),0) AS discounts,
                COALESCE(SUM(tax),0) AS tax_collected
         FROM sales WHERE status='completed' AND created_at BETWEEN ? AND ?",
        [$fromTs, $toTs]
    );
    $summary['items_sold'] = (int)(db_val(
        "SELECT COALESCE(SUM(si.quantity),0)
         FROM sale_items si JOIN sales s ON s.id=si.sale_id
         WHERE s.status='completed' AND s.created_at BETWEEN ? AND ?",
        [$fromTs, $toTs]
    ) ?? 0);
    $summary['voided'] = (int)(db_val(
        "SELECT COUNT(*) FROM sales WHERE status='voided' AND created_at BETWEEN ? AND ?",
        [$fromTs, $toTs]
    ) ?? 0);
    foreach (['revenue', 'avg_order_value', 'discounts', 'tax_collected'] as $k) {
        $summary[$k] = round2((float)$summary[$k]);
    }
    $summary['orders'] = (int)$summary['orders'];

    // Daily series, gap-filled
    $rows = db_all(
        "SELECT DATE(created_at) AS d, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
         FROM sales WHERE status='completed' AND created_at BETWEEN ? AND ?
         GROUP BY DATE(created_at)",
        [$fromTs, $toTs]
    );
    $indexed = [];
    foreach ($rows as $r) {
        $indexed[$r['d']] = $r;
    }
    $series = [];
    $start = strtotime($from);
    $end = strtotime($to);
    for ($t = $start; $t <= $end; $t += 86400) {
        $day = date('Y-m-d', $t);
        $r = $indexed[$day] ?? null;
        $series[] = [
            'date'    => $day,
            'orders'  => $r ? (int)$r['orders'] : 0,
            'revenue' => $r ? round2((float)$r['revenue']) : 0.0,
        ];
    }

    $payments = db_all(
        "SELECT payment_method AS method, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS amount
         FROM sales WHERE status='completed' AND created_at BETWEEN ? AND ?
         GROUP BY payment_method",
        [$fromTs, $toTs]
    );

    $topProducts = db_all(
        "SELECT si.product_name, si.sku, SUM(si.quantity) AS qty,
                SUM(si.line_total) AS revenue,
                COALESCE(p.cost_price,0) AS cost_price
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE s.status='completed' AND s.created_at BETWEEN ? AND ?
         GROUP BY si.product_name, si.sku
         ORDER BY revenue DESC LIMIT 10",
        [$fromTs, $toTs]
    );

    $topCustomers = db_all(
        "SELECT COALESCE(c.name,'Walk-in customer') AS name,
                COUNT(*) AS orders, COALESCE(SUM(s.total),0) AS spent
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.status='completed' AND s.created_at BETWEEN ? AND ?
         GROUP BY s.customer_id ORDER BY spent DESC LIMIT 8",
        [$fromTs, $toTs]
    );

    $cashiers = db_all(
        "SELECT u.full_name AS name, COUNT(*) AS orders, COALESCE(SUM(s.total),0) AS revenue
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
         WHERE s.status='completed' AND s.created_at BETWEEN ? AND ?
         GROUP BY s.user_id ORDER BY revenue DESC LIMIT 8",
        [$fromTs, $toTs]
    );

    json_out([
        'range' => ['from' => $from, 'to' => $to],
        'summary' => $summary,
        'series' => $series,
        'payments' => array_map(fn($r) => [
            'method' => $r['method'], 'count' => (int)$r['cnt'], 'amount' => round2((float)$r['amount']),
        ], $payments),
        'top_products' => array_map(fn($r) => [
            'name' => $r['product_name'], 'sku' => $r['sku'],
            'qty' => (int)$r['qty'], 'revenue' => round2((float)$r['revenue']),
            'cost_price' => round2((float)$r['cost_price']),
        ], $topProducts),
        'top_customers' => array_map(fn($r) => [
            'name' => $r['name'], 'orders' => (int)$r['orders'], 'spent' => round2((float)$r['spent']),
        ], $topCustomers),
        'cashiers' => array_map(fn($r) => [
            'name' => $r['name'] ?? 'Unknown', 'orders' => (int)$r['orders'], 'revenue' => round2((float)$r['revenue']),
        ], $cashiers),
    ]);
}, ['admin', 'manager']);

$router->get('reports/inventory', function () {
    require_roles(['admin', 'manager']);

    $byCategory = db_all(
        "SELECT COALESCE(c.name,'Uncategorized') AS category,
                COUNT(p.id) AS products,
                COALESCE(SUM(p.quantity),0) AS units,
                COALESCE(SUM(p.cost_price * p.quantity),0) AS cost_value,
                COALESCE(SUM(p.sell_price * p.quantity),0) AS retail_value
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'active'
         GROUP BY c.id ORDER BY cost_value DESC"
    );
    foreach ($byCategory as &$r) {
        foreach (['products', 'units'] as $k) { $r[$k] = (int)$r[$k]; }
        foreach (['cost_value', 'retail_value'] as $k) { $r[$k] = round2((float)$r[$k]); }
    }
    unset($r);

    $lowStock = db_all(
        "SELECT id, sku, name, quantity, reorder_level, cost_price, sell_price
         FROM products WHERE status='active' AND quantity > 0 AND quantity <= reorder_level
         ORDER BY quantity ASC LIMIT 50"
    );
    $outStock = db_all(
        "SELECT id, sku, name, quantity, reorder_level, cost_price, sell_price
         FROM products WHERE status='active' AND quantity <= 0
         ORDER BY name ASC LIMIT 50"
    );
    $norm = function (array $r) {
        return [
            'id' => (int)$r['id'], 'sku' => $r['sku'], 'name' => $r['name'],
            'quantity' => (int)$r['quantity'], 'reorder_level' => (int)$r['reorder_level'],
            'cost_price' => round2((float)$r['cost_price']), 'sell_price' => round2((float)$r['sell_price']),
        ];
    };

    json_out([
        'totals' => [
            'products'     => (int)(db_val("SELECT COUNT(*) FROM products WHERE status='active'") ?? 0),
            'units'        => (int)(db_val("SELECT COALESCE(SUM(quantity),0) FROM products WHERE status='active'") ?? 0),
            'cost_value'   => round2((float)(db_val("SELECT COALESCE(SUM(cost_price*quantity),0) FROM products WHERE status='active'") ?? 0)),
            'retail_value' => round2((float)(db_val("SELECT COALESCE(SUM(sell_price*quantity),0) FROM products WHERE status='active'") ?? 0)),
            'low_count'    => count($lowStock),
            'out_count'    => (int)(db_val("SELECT COUNT(*) FROM products WHERE status='active' AND quantity<=0") ?? 0),
        ],
        'by_category' => $byCategory,
        'low_stock'   => array_map($norm, $lowStock),
        'out_stock'   => array_map($norm, $outStock),
    ]);
}, ['admin', 'manager']);
