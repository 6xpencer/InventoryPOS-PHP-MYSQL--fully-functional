/* Apex POS launcher: verifies Apache + MySQL are serving the API, then opens the app. */

const http = require('http');
const { exec } = require('child_process');

const API_URL = 'http://localhost/InventoryPOS/backend/api.php';
const APP_URL = 'http://localhost/InventoryPOS/public/';

function reachable(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode > 0 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}

(async () => {
  process.stdout.write('Checking Apex POS services...\n');

  const apiUp = await reachable(API_URL);
  if (!apiUp) {
    process.stderr.write(
      '\n  ERROR: The API at ' + API_URL + ' is not reachable.\n' +
      '  Start Apache and MySQL from the XAMPP Control Panel, then run "npm start" again.\n' +
      '  If the database is missing, import schema.sql via phpMyAdmin or:\n' +
      '    mysql -u root --default-character-set=utf8mb4 -e "SOURCE C:/xampp/htdocs/InventoryPOS/schema.sql"\n\n'
    );
    process.exit(1);
  }

  process.stdout.write('  API online.\n  Opening ' + APP_URL + '\n\n');
  process.stdout.write('  Default accounts (password for all: "password")\n' +
    '    admin  - full access\n' +
    '    morgan - manager\n' +
    '    casey  - cashier\n\n');

  openBrowser(APP_URL);
})();
