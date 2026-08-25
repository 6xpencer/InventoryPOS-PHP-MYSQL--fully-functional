<?php
declare(strict_types=1);

/* ============================================================
 * Categories: CRUD with product counts
 * ============================================================ */

$router->get('categories', function () {
    require_roles([]);
    $search = query_param('search');
    $sql = 'SELECT c.*, COUNT(p.id) AS products_count,
                   COALESCE(SUM(CASE WHEN p.status = "active" THEN p.quantity END), 0) AS units_count
            FROM categories c LEFT JOIN products p ON p.category_id = c.id';
    $params = [];
    if ($search) {
        $sql .= ' WHERE c.name LIKE ? OR c.description LIKE ?';
        $like = "%$search%";
        array_push($params, $like, $like);
    }
    $sql .= ' GROUP BY c.id ORDER BY c.name ASC';
    $rows = db_all($sql, $params);
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['products_count'] = (int)$r['products_count'];
        $r['units_count'] = (int)$r['units_count'];
    }
    unset($r);
    json_out(['data' => $rows]);
}, []);

function validate_category_payload(array $b, ?int $ignoreId = null): array
{
    $name = v_str($b, 'name', 100);
    $dupeSql = 'SELECT id FROM categories WHERE name = ?' . ($ignoreId ? ' AND id <> ' . $ignoreId : '');
    if (db_one($dupeSql, [$name])) {
        fail("Category \"$name\" already exists.", 422);
    }
    return ['name' => $name, 'description' => v_str($b, 'description', 1000, false)];
}

$router->post('categories', function () {
    require_roles(['admin', 'manager']);
    $d = validate_category_payload(body());
    db_exec('INSERT INTO categories (name, description) VALUES (?,?)', [$d['name'], $d['description']]);
    json_out(['category' => db_one('SELECT * FROM categories WHERE id = ?', [last_id()])], 201);
}, ['admin', 'manager']);

$router->put('categories/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    if (!db_one('SELECT id FROM categories WHERE id = ?', [$id])) {
        fail('Category not found.', 404);
    }
    $d = validate_category_payload(body(), $id);
    db_exec('UPDATE categories SET name = ?, description = ? WHERE id = ?', [$d['name'], $d['description'], $id]);
    json_out(['category' => db_one('SELECT * FROM categories WHERE id = ?', [$id])]);
}, ['admin', 'manager']);

$router->delete('categories/:id', function (array $p) {
    require_roles(['admin', 'manager']);
    $id = (int)$p['id'];
    $count = (int)db_val('SELECT COUNT(*) FROM products WHERE category_id = ?', [$id]);
    if ($count > 0) {
        fail("Cannot delete: $count product(s) are assigned to this category. Reassign them first.", 409);
    }
    db_exec('DELETE FROM categories WHERE id = ?', [$id]);
    json_out(['ok' => true]);
}, ['admin', 'manager']);
