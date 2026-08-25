<?php
declare(strict_types=1);

/* ============================================================
 * Core bootstrap: DB connection, CORS, JSON helpers,
 * validation helpers and the tiny route dispatcher.
 * ============================================================ */

const DB_HOST = '127.0.0.1';
const DB_NAME = 'inventory_pos';
const DB_USER = 'root';
const DB_PASS = '';
const TOKEN_TTL_DAYS = 30;

/* ---------- JSON output ---------- */

function json_out(array $payload, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $code = 400, array $details = []): void
{
    $payload = ['error' => $message];
    if ($details) {
        $payload['details'] = $details;
    }
    json_out($payload, $code);
}

/* ---------- Request body / params ---------- */

function body(): array
{
    static $cache = null;
    if ($cache === null) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode($raw ?: '', true);
        $cache = is_array($decoded) ? $decoded : [];
    }
    return $cache;
}

function query_param(string $key, ?string $default = null): ?string
{
    if (!isset($_GET[$key]) || $_GET[$key] === '') {
        return $default;
    }
    return trim((string)$_GET[$key]);
}

function int_param(string $key, ?int $default = null): ?int
{
    $v = query_param($key);
    if ($v === null || !preg_match('/^-?\d+$/', $v)) {
        return $default;
    }
    return (int)$v;
}

/* ---------- Validation ---------- */

function v_str(array $b, string $key, int $max = 190, bool $required = true, string $label = null): ?string
{
    $label = $label ?? ucwords(str_replace('_', ' ', $key));
    $val = isset($b[$key]) && is_scalar($b[$key]) ? trim((string)$b[$key]) : '';
    if ($val === '') {
        if ($required) {
            fail("$label is required.", 422);
        }
        return null;
    }
    if (mb_strlen($val) > $max) {
        fail("$label must not exceed $max characters.", 422);
    }
    return $val;
}

function v_num(array $b, string $key, float $min = 0.0, ?float $max = null, bool $required = true, float $fallback = 0.0): float
{
    $val = isset($b[$key]) && is_numeric($b[$key]) ? (float)$b[$key] : null;
    if ($val === null) {
        if ($required) {
            fail(ucwords(str_replace('_', ' ', $key)) . ' is required.', 422);
        }
        return $fallback;
    }
    if ($val < $min || ($max !== null && $val > $max)) {
        $range = $max !== null ? "between $min and $max" : "at least $min";
        fail(ucwords(str_replace('_', ' ', $key)) . " must be $range.", 422);
    }
    return round($val, 2);
}

function v_int(array $b, string $key, int $min = 0, ?int $max = null, bool $required = true, int $fallback = 0): int
{
    $val = isset($b[$key]) && is_numeric($b[$key]) && (string)(int)$b[$key] === (string)$b[$key] ? (int)$b[$key] : null;
    if ($val === null) {
        if ($required) {
            fail(ucwords(str_replace('_', ' ', $key)) . ' is required.', 422);
        }
        return $fallback;
    }
    if ($val < $min || ($max !== null && $val > $max)) {
        fail(ucwords(str_replace('_', ' ', $key)) . ' is invalid.', 422);
    }
    return $val;
}

function v_email(?string $email, string $label = 'Email'): ?string
{
    if ($email === null || $email === '') {
        return null;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 150) {
        fail("$label address is not valid.", 422);
    }
    return $email;
}

function round2(float $n): float
{
    return round($n + 0.0000001, 2);
}

function now_mysql(): string
{
    return date('Y-m-d H:i:s');
}

/* ---------- Database ---------- */

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            fail('Database connection failed. Verify that MySQL is running and schema.sql has been imported.', 500);
        }
    }
    return $pdo;
}

function db_all(string $sql, array $params = []): array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function db_one(string $sql, array $params = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $row = $st->fetch();
    return $row === false ? null : $row;
}

function db_val(string $sql, array $params = [])
{
    $row = db_one($sql, $params);
    return $row === null ? null : reset($row);
}

function db_exec(string $sql, array $params = []): int
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->rowCount();
}

function last_id(): int
{
    return (int)db()->lastInsertId();
}

/* ---------- Auth / tokens ---------- */

function current_user(): ?array
{
    global $__auth_user;
    return $__auth_user ?? null;
}

function bearer_token(): ?string
{
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION', 'HTTP_X_AUTH_TOKEN'] as $key) {
        if (!empty($_SERVER[$key]) && preg_match('/(?:Bearer\s+)?([A-Fa-f0-9]{64})/', $_SERVER[$key], $m)) {
            return $m[1];
        }
    }
    return null;
}

function load_auth_user(): void
{
    global $__auth_user;
    $__auth_user = null;

    $raw = bearer_token();
    if (!$raw) {
        return;
    }
    $hash = hash('sha256', $raw);
    $user = db_one(
        'SELECT u.* FROM user_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.expires_at > NOW() AND u.status = "active"',
        [$hash]
    );
    if ($user) {
        unset($user['password_hash']);
        $__auth_user = $user;
    }
}

function issue_token(int $userId): array
{
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', time() + TOKEN_TTL_DAYS * 86400);
    db_exec(
        'INSERT INTO user_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)',
        [$userId, hash('sha256', $token), $expires]
    );
    db_exec('DELETE FROM user_tokens WHERE expires_at < NOW()');
    return ['token' => $token, 'expires_at' => $expires];
}

function require_roles(array $roles): array
{
    $u = current_user();
    if (!$u) {
        fail('Authentication required.', 401);
    }
    if ($roles && !in_array($u['role'], $roles, true)) {
        fail('You do not have permission to perform this action.', 403);
    }
    return $u;
}

/* ---------- Shared lookups / mutations ---------- */

function get_setting(string $key, string $default = ''): string
{
    $v = db_val('SELECT setting_value FROM settings WHERE setting_key = ?', [$key]);
    return $v === null ? $default : (string)$v;
}

function tax_rate_default(): float
{
    return (float)get_setting('tax_rate', '12');
}

function record_movement(int $productId, int $changeQty, string $type, ?string $reference, ?string $note, ?int $userId): void
{
    db_exec(
        'INSERT INTO stock_movements (product_id, change_qty, type, reference, note, user_id) VALUES (?,?,?,?,?,?)',
        [$productId, $changeQty, $type, $reference, $note, $userId]
    );
}

/* ---------- Pagination helper ---------- */

function paginate(int $defaultPerPage = 10, int $maxPerPage = 100): array
{
    $page = max(1, int_param('page', 1));
    $perPage = min($maxPerPage, max(1, int_param('per_page', $defaultPerPage)));
    return [$page, $perPage, ($page - 1) * $perPage];
}

function paged_response(array $data, int $total, int $page, int $perPage): array
{
    return [
        'data'     => $data,
        'meta'     => [
            'total'    => $total,
            'page'     => $page,
            'per_page' => $perPage,
            'pages'    => (int)ceil($total / max(1, $perPage)),
        ],
    ];
}

/* ---------- Router ---------- */

class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, array|callable $handler, ?array $roles = null): void
    {
        $this->routes[] = [
            'method'  => strtoupper($method),
            'parts'   => explode('/', trim($pattern, '/')),
            'handler' => $handler,
            'roles'   => $roles,
        ];
    }

    public function get(string $p, $h, ?array $r = null): void    { $this->add('GET', $p, $h, $r); }
    public function post(string $p, $h, ?array $r = null): void   { $this->add('POST', $p, $h, $r); }
    public function put(string $p, $h, ?array $r = null): void    { $this->add('PUT', $p, $h, $r); }
    public function delete(string $p, $h, ?array $r = null): void { $this->add('DELETE', $p, $h, $r); }

    public function dispatch(string $route): void
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD']);
        if ($method === 'OPTIONS') {
            json_out(['ok' => true]);
        }

        $given = explode('/', trim($route, '/'));
        foreach ($this->routes as $r) {
            if ($r['method'] !== $method || count($r['parts']) !== count($given)) {
                continue;
            }
            $params = [];
            $matched = true;
            foreach ($r['parts'] as $i => $part) {
                if (str_starts_with($part, ':')) {
                    $params[substr($part, 1)] = urldecode($given[$i]);
                } elseif ($part !== $given[$i]) {
                    $matched = false;
                    break;
                }
            }
            if (!$matched) {
                continue;
            }

            $handler = $r['handler'];
            if ($r['roles'] !== null) {
                require_roles($r['roles']); // exits with 401/403 on failure
            }

            if (is_array($handler)) {
                [$fn, $args] = $handler;
                $fn(...array_values(array_merge([$params], $args)));
            } else {
                $handler($params);
            }
            return;
        }

        fail('API endpoint not found.', 404);
    }
}
