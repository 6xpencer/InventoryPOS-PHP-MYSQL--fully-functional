<?php
declare(strict_types=1);

/* ============================================================
 * Settings: public subset, full get, save
 * ============================================================ */

const SETTING_KEYS = ['store_name', 'store_address', 'store_phone', 'store_email', 'currency_symbol', 'tax_rate', 'receipt_footer', 'low_stock_alerts'];

function settings_defaults(): array
{
    return [
        'store_name'       => 'Apex POS',
        'store_address'    => '',
        'store_phone'      => '',
        'store_email'      => '',
        'currency_symbol'  => '$',
        'tax_rate'         => '12',
        'receipt_footer'   => 'Thank you for your business!',
        'low_stock_alerts' => '1',
    ];
}

function settings_all(): array
{
    $out = settings_defaults();
    foreach (db_all('SELECT setting_key, setting_value FROM settings') as $row) {
        if (in_array($row['setting_key'], SETTING_KEYS, true)) {
            $out[$row['setting_key']] = (string)$row['setting_value'];
        }
    }
    return $out;
}

$router->get('settings/public', function () {
    json_out(['settings' => [
        'store_name'      => get_setting('store_name', 'Apex POS'),
        'currency_symbol' => get_setting('currency_symbol', '$'),
    ]]);
}, null);

$router->get('settings', function () {
    require_roles([]);
    $s = settings_all();
    try {
        $server = db_one('SELECT VERSION() AS v');
        $mysqlVersion = $server ? $server['v'] : 'unknown';
    } catch (Throwable $e) {
        $mysqlVersion = 'unknown';
    }
    json_out([
        'settings' => $s,
        'system'   => [
            'php_version'   => PHP_VERSION,
            'mysql_version' => $mysqlVersion,
            'server_time'   => now_mysql(),
            'timezone'      => date_default_timezone_get(),
        ],
    ]);
}, []);

$router->put('settings', function () {
    require_roles(['admin', 'manager']);
    $b = body();
    foreach (SETTING_KEYS as $key) {
        if (!array_key_exists($key, $b)) {
            continue;
        }
        $val = is_scalar($b[$key]) ? trim((string)$b[$key]) : '';
        switch ($key) {
            case 'tax_rate':
                if (!is_numeric($val) || (float)$val < 0 || (float)$val > 100) {
                    fail('Tax rate must be a number between 0 and 100.', 422);
                }
                $val = (string)round2((float)$val);
                break;
            case 'currency_symbol':
                if (mb_strlen($val) > 5) {
                    fail('Currency symbol must be at most 5 characters.', 422);
                }
                break;
            case 'store_email':
                v_email($val !== '' ? $val : null, 'Store email');
                break;
        }
        db_exec(
            'INSERT INTO settings (setting_key, setting_value) VALUES (?,?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            [$key, $val]
        );
    }
    json_out(['settings' => settings_all()]);
}, ['admin', 'manager']);

/* ============================================================
 * Backup / restore
 * ============================================================ */

function dump_tables(): array
{
    return array_map(fn($r) => $r['TABLE_NAME'], db_all(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
        [DB_NAME]
    ));
}

function dump_sql(): string
{
    $pdo = db();
    $out = "-- Apex POS database backup\n-- Generated " . date('Y-m-d H:i:s') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";
    foreach (dump_tables() as $name) {
        $create = db_one("SHOW CREATE TABLE `$name`");
        $ddl = $create['Create Table'] ?? null;
        if (!$ddl) {
            continue;
        }
        $out .= "DROP TABLE IF EXISTS `$name`;\n";
        $out .= $ddl . ";\n\n";
        $rows = db_all("SELECT * FROM `$name`");
        if ($rows) {
            $cols = array_keys($rows[0]);
            $colList = '`' . implode('`,`', $cols) . '`';
            $chunks = [];
            foreach ($rows as $r) {
                $vals = array_map(function ($v) use ($pdo) {
                    if ($v === null) {
                        return 'NULL';
                    }
                    if (is_int($v) || is_float($v)) {
                        return (string) $v;
                    }
                    if (is_bool($v)) {
                        return $v ? '1' : '0';
                    }
                    return $pdo->quote((string) $v);
                }, array_values($r));
                $chunks[] = '(' . implode(',', $vals) . ')';
            }
            $out .= "INSERT INTO `$name` ($colList) VALUES\n" . implode(",\n", $chunks) . ";\n\n";
        }
    }
    $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
    return $out;
}

function dump_json(): string
{
    $data = [];
    foreach (dump_tables() as $name) {
        $data[$name] = db_all("SELECT * FROM `$name`");
    }
    return json_encode(
        ['generated_at' => date('c'), 'database' => DB_NAME, 'tables' => $data],
        JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT
    );
}

function split_sql_statements(string $sql): array
{
    $out = [];
    $buf = '';
    $len = strlen($sql);
    $i = 0;
    $s = false;
    $d = false;
    $b = false;
    while ($i < $len) {
        $c = $sql[$i];
        $n = $i + 1 < $len ? $sql[$i + 1] : '';
        if (!$s && !$d && !$b && $c === '-' && $n === '-') {
            while ($i < $len && $sql[$i] !== "\n") {
                $i++;
            }
            continue;
        }
        if (!$s && !$d && !$b && $c === '/' && $n === '*') {
            $i += 2;
            while ($i < $len && !($sql[$i] === '*' && $i + 1 < $len && $sql[$i + 1] === '/')) {
                $i++;
            }
            $i += 2;
            continue;
        }
        if ($c === "'" && !$d && !$b) {
            if ($s && $n === "'") {
                $buf .= "''";
                $i += 2;
                continue;
            }
            $s = !$s;
            $buf .= $c;
            $i++;
            continue;
        }
        if ($c === '"' && !$s && !$b) {
            if ($d && $n === '"') {
                $buf .= '""';
                $i += 2;
                continue;
            }
            $d = !$d;
            $buf .= $c;
            $i++;
            continue;
        }
        if ($c === '`' && !$s && !$d) {
            $b = !$b;
            $buf .= $c;
            $i++;
            continue;
        }
        if ($c === ';' && !$s && !$d && !$b) {
            $out[] = $buf;
            $buf = '';
            $i++;
            continue;
        }
        $buf .= $c;
        $i++;
    }
    if (trim($buf) !== '') {
        $out[] = $buf;
    }
    return $out;
}

function exec_sql_dump(string $sql): int
{
    $pdo = db();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $count = 0;
    foreach (split_sql_statements($sql) as $stmt) {
        if (trim($stmt) === '') {
            continue;
        }
        $pdo->exec($stmt);
        $count++;
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    return $count;
}

$router->get('settings/backup', function () {
    require_roles(['admin']);
    $format = query_param('format', 'sql');
    if ($format === 'json') {
        $content = dump_json();
        $ext = 'json';
        $mime = 'application/json';
    } else {
        $content = dump_sql();
        $ext = 'sql';
        $mime = 'application/sql';
    }
    $filename = 'apexpos-backup-' . date('Ymd-His') . '.' . $ext;
    header('Content-Type: ' . $mime . '; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($content));
    echo $content;
    exit;
}, ['admin']);

$router->post('settings/restore', function () {
    require_roles(['admin']);
    if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? 1) !== UPLOAD_ERR_OK) {
        fail('No SQL file uploaded.', 422);
    }
    $name = $_FILES['file']['name'] ?? '';
    if (!preg_match('/\.sql$/i', $name)) {
        fail('Please upload a .sql backup file.', 422);
    }
    $sql = file_get_contents($_FILES['file']['tmp_name']);
    if ($sql === false) {
        fail('Could not read the uploaded file.', 500);
    }
    $statements = exec_sql_dump($sql);
    json_out(['ok' => true, 'statements' => $statements]);
}, ['admin']);
