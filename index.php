<?php
/**
 * Redirect the project root (http://localhost/InventoryPOS) into the
 * compiled app at /public so the app is reachable without the /public suffix.
 * The API (../backend/api.php, resolved from within /public) keeps working.
 */
header('Location: public/');
exit;
