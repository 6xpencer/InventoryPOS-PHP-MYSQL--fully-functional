<?php
declare(strict_types=1);

/* ============================================================
 * Apex POS - API front controller
 * All requests: /backend/api.php?route=<resource/action>
 * ============================================================ */

error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set(date_default_timezone_get() ?: 'UTC');

require __DIR__ . '/lib/bootstrap.php';

/* ---------- CORS ---------- */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');
}
header('X-Content-Type-Options: nosniff');

/* ---------- Fatal error safety net (always JSON) ---------- */
set_exception_handler(function (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
});

load_auth_user();

$router = new Router();

require __DIR__ . '/handlers/auth.php';
require __DIR__ . '/handlers/dashboard.php';
require __DIR__ . '/handlers/products.php';
require __DIR__ . '/handlers/categories.php';
require __DIR__ . '/handlers/suppliers.php';
require __DIR__ . '/handlers/customers.php';
require __DIR__ . '/handlers/sales.php';
require __DIR__ . '/handlers/purchases.php';
require __DIR__ . '/handlers/users.php';
require __DIR__ . '/handlers/settings.php';
require __DIR__ . '/handlers/reports.php';

$route = isset($_GET['route']) ? (string)$_GET['route'] : '';
if ($route === '') {
    json_out([
        'name'   => 'Apex POS API',
        'status' => 'online',
        'time'   => now_mysql(),
    ]);
}

$router->dispatch($route);
