<?php
declare(strict_types=1);

/* ============================================================
 * Customers: CRUD with purchase aggregates
 * ============================================================ */

function customer_stats_join(): string
{
    return 'LEFT JOIN (SELECT customer_id, COUNT(*) AS orders_count,
                              COALESCE(SUM(total),0) AS total_spent,
                              MAX(created_at) AS last_order_at
                       FROM sales WHERE status = "completed" GROUP BY customer_id) agg ON agg.customer_id = c.id';
}

$router->get('customers', function () {
    require_roles([]);
    [$page, $perPage, $offset] = paginate(10);
    $where = [];
    $params = [];
    if ($s = query_param('search')) {
        $where[] = '(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
        $like = "%$s%";
        array_push($params, $like, $like, $like);
    }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $total = (int)db_val("SELECT COUNT(*) FROM customers c $whereSql", $params);
    $rows = db_all(
        'SELECT c.*, COALESCE(agg.orders_count,0) AS orders_count,
                COALESCE(agg.total_spent,0) AS total_spent, agg.last_order_at
         FROM customers c ' . customer_stats_join() . " $whereSql ORDER BY c.name ASC LIMIT $perPage OFFSET $offset",
        $params
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['orders_count'] = (int)$r['orders_count'];
        unset($r['customer_id']);
    }
    unset($r);
    json_out(paged_response($rows, $total, $page, $perPage));
}, []);

$router->get('customers/all', function () {
    require_roles([]);
    json_out(['data' => db_all('SELECT id, name, phone FROM customers ORDER BY name ASC')]);
}, []);

function validate_customer_payload(array $b): array
{
    return [
        'name'    => v_str($b, 'name', 120),
        'phone'   => v_str($b, 'phone', 30, false),
        'email'   => v_email(v_str($b, 'email', 150, false)),
        'address' => v_str($b, 'address', 255, false),
    ];
}

$router->post('customers', function () {
    require_roles([]);
    $d = validate_customer_payload(body());
    db_exec('INSERT INTO customers (name, phone, email, address) VALUES (?,?,?,?)', array_values($d));
    json_out(['customer' => db_one('SELECT * FROM customers WHERE id = ?', [last_id()])], 201);
}, []);

$router->put('customers/:id', function (array $p) {
    require_roles([]);
    $id = (int)$p['id'];
    if (!db_one('SELECT id FROM customers WHERE id = ?', [$id])) {
        fail('Customer not found.', 404);
    }
    $d = validate_customer_payload(body());
    db_exec('UPDATE customers SET name=?, phone=?, email=?, address=? WHERE id=?', [...array_values($d), $id]);
    json_out(['customer' => db_one('SELECT * FROM customers WHERE id = ?', [$id])]);
}, []);

$router->delete('customers/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    if (!db_one('SELECT id FROM customers WHERE id = ?', [$id])) {
        fail('Customer not found.', 404);
    }
    $count = (int)db_val('SELECT COUNT(*) FROM sales WHERE customer_id = ?', [$id]);
    if ($count > 0) {
        fail("Cannot delete: this customer has $count sale(s) on record.", 409);
    }
    db_exec('DELETE FROM customers WHERE id = ?', [$id]);
    json_out(['ok' => true]);
}, ['admin', 'manager']);

$router->get('customers/stats', function () {
    require_roles([]);
    $row = [
        'total'      => (int)db_val('SELECT COUNT(*) FROM customers'),
        'new_month'  => (int)db_val('SELECT COUNT(*) FROM customers WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'),
        'with_orders'=> (int)db_val('SELECT COUNT(DISTINCT customer_id) FROM sales WHERE status="completed" AND customer_id IS NOT NULL'),
        'top_name'   => null,
        'top_spent'  => 0.0,
    ];
    $top = db_one(
        'SELECT c.name, SUM(s.total) AS spent
         FROM sales s JOIN customers c ON c.id = s.customer_id
         WHERE s.status = "completed" GROUP BY s.customer_id ORDER BY spent DESC LIMIT 1'
    );
    if ($top) {
        $row['top_name'] = $top['name'];
        $row['top_spent'] = round2((float)$top['spent']);
    }
    json_out(['stats' => $row]);
}, []);
