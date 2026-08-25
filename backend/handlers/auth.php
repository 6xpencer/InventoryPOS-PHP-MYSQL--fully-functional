<?php
declare(strict_types=1);

/* ============================================================
 * Auth routes: setup (first admin), login, me, logout
 * ============================================================ */

function public_user_row(array $u): array
{
    return [
        'id'         => (int)$u['id'],
        'username'   => $u['username'],
        'full_name'  => $u['full_name'],
        'email'      => $u['email'],
        'role'       => $u['role'],
        'status'     => $u['status'],
        'last_login_at' => $u['last_login_at'],
        'created_at' => $u['created_at'],
    ];
}

$router->get('auth/status', function () {
    json_out(['needs_setup' => ((int)db_val('SELECT COUNT(*) FROM users')) === 0]);
});

$router->post('auth/setup', function () {
    if (((int)db_val('SELECT COUNT(*) FROM users')) > 0) {
        fail('Setup has already been completed. Please sign in.', 409);
    }
    $b = body();
    $fullName = v_str($b, 'full_name', 100);
    $email    = v_email(v_str($b, 'email', 150, false));
    $username = v_str($b, 'username', 50);
    if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $username)) {
        fail('Username must be 3-50 characters (letters, numbers, dot, dash, underscore).', 422);
    }
    $password = isset($b['password']) && is_string($b['password']) ? $b['password'] : '';
    if (strlen($password) < 8) {
        fail('Password must be at least 8 characters.', 422);
    }

    db_exec(
        'INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?,?,?,?,?)',
        [$username, password_hash($password, PASSWORD_DEFAULT), $fullName, $email, 'admin']
    );
    $id = last_id();
    $token = issue_token($id);
    $user = db_one('SELECT * FROM users WHERE id = ?', [$id]);
    json_out(['token' => $token['token'], 'user' => public_user_row($user)], 201);
});

$router->post('auth/login', function () {
    $b = body();
    $username = v_str($b, 'username', 50);
    $password = isset($b['password']) && is_string($b['password']) ? $b['password'] : '';

    $user = db_one('SELECT * FROM users WHERE username = ?', [$username]);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        fail('Invalid username or password.', 401);
    }
    if ($user['status'] !== 'active') {
        fail('This account has been disabled. Contact an administrator.', 403);
    }
    db_exec('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);
    $token = issue_token((int)$user['id']);
    json_out(['token' => $token['token'], 'user' => public_user_row($user)]);
}, null);

$router->get('auth/me', function () {
    $u = require_roles([]);
    json_out(['user' => public_user_row($u)]);
}, []);

$router->post('auth/logout', function () {
    $header = bearer_token();
    if ($header) {
        db_exec('DELETE FROM user_tokens WHERE token_hash = ?', [hash('sha256', $header)]);
    }
    json_out(['ok' => true]);
}, []);
