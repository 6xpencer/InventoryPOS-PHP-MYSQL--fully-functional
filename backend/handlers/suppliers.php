<?php
declare(strict_types=1);

/* ============================================================
 * Suppliers: CRUD with purchase aggregates
 * ============================================================ */

function supplier_stats_join(): string
{
    return 'LEFT JOIN (SELECT supplier_id, COUNT(*) AS purchases_count,
                              COALESCE(SUM(total),0) AS total_purchased
                       FROM purchases GROUP BY supplier_id) agg ON agg.supplier_id = s.id';
}

$router->get('suppliers', function () {
    require_roles([]);
    [$page, $perPage, $offset] = paginate(10);
    $where = [];
    $params = [];
    if ($s = query_param('search')) {
        $where[] = '(s.name LIKE ? OR s.contact_person LIKE ? OR s.email LIKE ? OR s.phone LIKE ?)';
        $like = "%$s%";
        array_push($params, $like, $like, $like, $like);
    }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $total = (int)db_val("SELECT COUNT(*) FROM suppliers s $whereSql", $params);
    $rows = db_all(
        'SELECT s.*, COALESCE(agg.purchases_count,0) AS purchases_count, COALESCE(agg.total_purchased,0) AS total_purchased
         FROM suppliers s ' . supplier_stats_join() . " $whereSql ORDER BY s.name ASC LIMIT $perPage OFFSET $offset",
        $params
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['purchases_count'] = (int)$r['purchases_count'];
        unset($r['supplier_id']);
    }
    unset($r);
    json_out(paged_response($rows, $total, $page, $perPage));
}, []);

$router->get('suppliers/all', function () {
    require_roles([]);
    json_out(['data' => db_all('SELECT id, name FROM suppliers ORDER BY name ASC')]);
}, []);

function validate_supplier_payload(array $b): array
{
    return [
        'name'           => v_str($b, 'name', 120),
        'contact_person' => v_str($b, 'contact_person', 100, false),
        'phone'          => v_str($b, 'phone', 30, false),
        'email'          => v_email(v_str($b, 'email', 150, false)),
        'address'        => v_str($b, 'address', 255, false),
    ];
}

$router->post('suppliers', function () {
    require_roles(['admin', 'manager']);
    $d = validate_supplier_payload(body());
    db_exec(
        'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?,?,?,?,?)',
        array_values($d)
    );
    json_out(['supplier' => db_one('SELECT * FROM suppliers WHERE id = ?', [last_id()])], 201);
}, ['admin', 'manager']);

$router->put('suppliers/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    if (!db_one('SELECT id FROM suppliers WHERE id = ?', [$id])) {
        fail('Supplier not found.', 404);
    }
    $d = validate_supplier_payload(body());
    db_exec(
        'UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=? WHERE id=?',
        [...array_values($d), $id]
    );
    json_out(['supplier' => db_one('SELECT * FROM suppliers WHERE id = ?', [$id])]);
}, ['admin', 'manager']);

$router->delete('suppliers/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    if (!db_one('SELECT id FROM suppliers WHERE id = ?', [$id])) {
        fail('Supplier not found.', 404);
    }
    $count = (int)db_val('SELECT COUNT(*) FROM purchases WHERE supplier_id = ?', [$id]);
    if ($count > 0) {
        fail("Cannot delete: this supplier has $count purchase order(s) on record.", 409);
    }
    db_exec('DELETE FROM suppliers WHERE id = ?', [$id]);
    json_out(['ok' => true]);
}, ['admin', 'manager']);

$router->get('suppliers/stats', function () {
    require_roles([]);
    $row = [
        'total'      => (int)db_val('SELECT COUNT(*) FROM suppliers'),
        'with_orders'=> (int)db_val('SELECT COUNT(DISTINCT supplier_id) FROM purchases WHERE supplier_id IS NOT NULL'),
        'spend_total'=> round2((float)(db_val('SELECT COALESCE(SUM(total),0) FROM purchases') ?? 0)),
        'spend_month'=> round2((float)(db_val('SELECT COALESCE(SUM(total),0) FROM purchases WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)') ?? 0)),
    ];
    json_out(['stats' => $row]);
}, []);
