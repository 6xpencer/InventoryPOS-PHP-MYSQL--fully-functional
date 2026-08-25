<?php
declare(strict_types=1);

/* ============================================================
 * Users (admin only): list, create, update, enable/disable
 * ============================================================ */

$router->get('users', function () {
    require_roles(['admin']);
    [$page, $perPage, $offset] = paginate(10);
    $where = [];
    $params = [];
    if ($s = query_param('search')) {
        $where[] = '(u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)';
        $like = "%$s%";
        array_push($params, $like, $like, $like);
    }
    $role = query_param('role');
    if (in_array($role, ['admin', 'manager', 'cashier'], true)) {
        $where[] = 'u.role = ?';
        $params[] = $role;
    }
    $status = query_param('status');
    if (in_array($status, ['active', 'disabled'], true)) {
        $where[] = 'u.status = ?';
        $params[] = $status;
    }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $total = (int)db_val("SELECT COUNT(*) FROM users u $whereSql", $params);
    $rows = db_all(
        "SELECT u.id, u.username, u.full_name, u.email, u.role, u.status, u.last_login_at, u.created_at,
                COALESCE(sales_cnt.cnt, 0) AS sales_count
         FROM users u
         LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM sales GROUP BY user_id) sales_cnt ON sales_cnt.user_id = u.id
         $whereSql ORDER BY u.created_at ASC LIMIT $perPage OFFSET $offset",
        $params
    );
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['sales_count'] = (int)$r['sales_count'];
    }
    unset($r);
    json_out(paged_response($rows, $total, $page, $perPage));
}, ['admin']);

$router->get('users/stats', function () {
    require_roles(['admin']);
    json_out(['stats' => [
        'total'     => (int)db_val('SELECT COUNT(*) FROM users'),
        'admins'    => (int)db_val("SELECT COUNT(*) FROM users WHERE role='admin'"),
        'managers'  => (int)db_val("SELECT COUNT(*) FROM users WHERE role='manager'"),
        'cashiers'  => (int)db_val("SELECT COUNT(*) FROM users WHERE role='cashier'"),
        'disabled'  => (int)db_val("SELECT COUNT(*) FROM users WHERE status='disabled'"),
        'online_24h'=> (int)db_val("SELECT COUNT(*) FROM users WHERE last_login_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"),
    ]]);
}, ['admin']);

function validate_user_payload(array $b, bool $isCreate): array
{
    $fullName = v_str($b, 'full_name', 100);
    $email    = v_email(v_str($b, 'email', 150, false));
    $username = v_str($b, 'username', 50);
    if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $username)) {
        fail('Username must be 3-50 characters (letters, numbers, dot, dash, underscore).', 422);
    }
    $role = in_array($b['role'] ?? '', ['admin', 'manager', 'cashier'], true) ? $b['role'] : null;
    if (!$role) {
        fail('Role must be admin, manager or cashier.', 422);
    }
    $status = in_array($b['status'] ?? '', ['active', 'disabled'], true) ? $b['status'] : 'active';
    return [$username, $fullName, $email, $role, $status];
}

function ensure_last_admin_safe(int $targetId, string $newRole, string $newStatus): void
{
    $target = db_one('SELECT * FROM users WHERE id = ?', [$targetId]);
    if (!$target || $target['role'] !== 'admin') {
        return;
    }
    if ($newRole === 'admin' && $newStatus === 'active') {
        return;
    }
    $activeAdmins = (int)db_val("SELECT COUNT(*) FROM users WHERE role='admin' AND status='active' AND id <> ?", [$targetId]);
    if ($activeAdmins === 0) {
        fail('At least one active administrator is required.', 409);
    }
}

$router->post('users', function () {
    require_roles(['admin']);
    $b = body();
    [$username, $fullName, $email, $role, $status] = validate_user_payload($b, true);
    $password = isset($b['password']) && is_string($b['password']) ? $b['password'] : '';
    if (strlen($password) < 8) {
        fail('Password must be at least 8 characters.', 422);
    }
    if (db_one('SELECT id FROM users WHERE username = ?', [$username])) {
        fail("Username \"$username\" is already taken.", 422);
    }
    db_exec(
        'INSERT INTO users (username, password_hash, full_name, email, role, status) VALUES (?,?,?,?,?,?)',
        [$username, password_hash($password, PASSWORD_DEFAULT), $fullName, $email, $role, $status]
    );
    $user = db_one('SELECT id, username, full_name, email, role, status, last_login_at, created_at FROM users WHERE id = ?', [last_id()]);
    json_out(['user' => $user], 201);
}, ['admin']);

$router->put('users/:id', function (array $p) {
    require_roles(['admin']);
    $id = (int)$p['id'];
    $existing = db_one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$existing) {
        fail('User not found.', 404);
    }
    $b = body();
    [$username, $fullName, $email, $role, $status] = validate_user_payload($b, false);
    if (db_one('SELECT id FROM users WHERE username = ? AND id <> ?', [$username, $id])) {
        fail("Username \"$username\" is already taken.", 422);
    }
    ensure_last_admin_safe($id, $role, $status);

    $password = isset($b['password']) && is_string($b['password']) ? $b['password'] : '';
    db_exec(
        'UPDATE users SET username=?, full_name=?, email=?, role=?, status=? WHERE id=?',
        [$username, $fullName, $email, $role, $status, $id]
    );
    if ($password !== '') {
        if (strlen($password) < 8) {
            fail('New password must be at least 8 characters.', 422);
        }
        db_exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $id]);
        // Force re-login everywhere.
        db_exec('DELETE FROM user_tokens WHERE user_id = ?', [$id]);
    } elseif ($status === 'disabled') {
        db_exec('DELETE FROM user_tokens WHERE user_id = ?', [$id]);
    }
    $user = db_one('SELECT id, username, full_name, email, role, status, last_login_at, created_at FROM users WHERE id = ?', [$id]);
    json_out(['user' => $user]);
}, ['admin']);
