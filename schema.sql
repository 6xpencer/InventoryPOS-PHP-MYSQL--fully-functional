-- ============================================================
--  Apex POS - Inventory & Sales Management
--  MySQL Schema + Demo Seed Data
--
--  Default accounts (password for ALL: "password")
--    admin  / Spencer Admin   (admin)
--    morgan / Morgan Reyes    (manager)
--    casey  / Casey Register  (cashier)
-- ============================================================

CREATE DATABASE IF NOT EXISTS inventory_pos
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE inventory_pos;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS stock_movements, purchase_items, purchases, sale_items, sales,
  products, customers, suppliers, categories, settings, user_tokens, users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) DEFAULT NULL,
  role          ENUM('admin','manager','cashier') NOT NULL DEFAULT 'cashier',
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at DATETIME DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE user_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_token_hash (token_hash),
  KEY idx_token_user (user_id),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(120) NOT NULL,
  contact_person VARCHAR(100) DEFAULT NULL,
  phone          VARCHAR(30)  DEFAULT NULL,
  email          VARCHAR(150) DEFAULT NULL,
  address        VARCHAR(255) DEFAULT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_suppliers_name (name)
) ENGINE=InnoDB;

CREATE TABLE customers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(30)  DEFAULT NULL,
  email      VARCHAR(150) DEFAULT NULL,
  address    VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customers_name (name)
) ENGINE=InnoDB;

CREATE TABLE products (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku           VARCHAR(50)  NOT NULL,
  name          VARCHAR(150) NOT NULL,
  category_id   INT UNSIGNED DEFAULT NULL,
  supplier_id   INT UNSIGNED DEFAULT NULL,
  barcode       VARCHAR(64)  DEFAULT NULL,
  cost_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sell_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  quantity      INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 5,
  status        ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_name (name),
  KEY idx_products_barcode (barcode),
  KEY fk_products_category (category_id),
  KEY fk_products_supplier (supplier_id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE sales (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference      VARCHAR(30)  NOT NULL,
  user_id        INT UNSIGNED DEFAULT NULL,
  customer_id    INT UNSIGNED DEFAULT NULL,
  subtotal       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  discount       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tax            DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  change_due     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  payment_method ENUM('cash','card','mobile') NOT NULL DEFAULT 'cash',
  status         ENUM('completed','voided') NOT NULL DEFAULT 'completed',
  voided_by      INT UNSIGNED DEFAULT NULL,
  voided_at      DATETIME DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_reference (reference),
  KEY idx_sales_created (created_at),
  KEY fk_sales_user (user_id),
  KEY fk_sales_customer (customer_id),
  CONSTRAINT fk_sales_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE SET NULL,
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE sale_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id      INT UNSIGNED NOT NULL,
  product_id   INT UNSIGNED DEFAULT NULL,
  product_name VARCHAR(150) NOT NULL,
  sku          VARCHAR(50)  DEFAULT NULL,
  unit_price   DECIMAL(12,2) NOT NULL,
  quantity     INT NOT NULL,
  line_total   DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  KEY fk_sale_items_sale (sale_id),
  KEY fk_sale_items_product (product_id),
  CONSTRAINT fk_sale_items_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE purchases (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference      VARCHAR(30)  NOT NULL,
  supplier_id    INT UNSIGNED DEFAULT NULL,
  user_id        INT UNSIGNED DEFAULT NULL,
  total          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notes          TEXT DEFAULT NULL,
  status         ENUM('received') NOT NULL DEFAULT 'received',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchases_reference (reference),
  KEY idx_purchases_created (created_at),
  KEY fk_purchases_supplier (supplier_id),
  CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchases_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE purchase_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_id  INT UNSIGNED NOT NULL,
  product_id   INT UNSIGNED DEFAULT NULL,
  product_name VARCHAR(150) NOT NULL,
  cost_price   DECIMAL(12,2) NOT NULL,
  quantity     INT NOT NULL,
  line_total   DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  KEY fk_purchase_items_purchase (purchase_id),
  KEY fk_purchase_items_product (product_id),
  CONSTRAINT fk_purchase_items_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_items_product  FOREIGN KEY (product_id)  REFERENCES products(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id     INT UNSIGNED NOT NULL,
  change_qty     INT NOT NULL,
  type           ENUM('initial','purchase','sale','adjustment','void_restore') NOT NULL,
  reference      VARCHAR(30) DEFAULT NULL,
  note           VARCHAR(255) DEFAULT NULL,
  user_id        INT UNSIGNED DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_movements_product (product_id),
  KEY idx_movements_created (created_at),
  CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_movements_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE settings (
  setting_key   VARCHAR(60) NOT NULL,
  setting_value TEXT,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

-- ============================================================
--  SEED DATA
-- ============================================================

-- Users (password = "password" for every account)
INSERT INTO users (id, username, password_hash, full_name, email, role, status, last_login_at) VALUES
(1, 'admin',  '$2y$10$AaxXbsjfpuTK9Op7D9hwRu3I.9GcBB8JX3.44SBWNZR7w7xREoTkm', 'Spencer Admin', 'admin@apexpos.test',  'admin',   'active', NOW()),
(2, 'morgan', '$2y$10$AaxXbsjfpuTK9Op7D9hwRu3I.9GcBB8JX3.44SBWNZR7w7xREoTkm', 'Morgan Reyes',  'morgan@apexpos.test', 'manager', 'active', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(3, 'casey',  '$2y$10$AaxXbsjfpuTK9Op7D9hwRu3I.9GcBB8JX3.44SBWNZR7w7xREoTkm', 'Casey Register','casey@apexpos.test',  'cashier', 'active', DATE_SUB(NOW(), INTERVAL 2 HOUR));

-- Categories
INSERT INTO categories (id, name, description) VALUES
(1, 'Beverages', 'Juices, water and soft drinks'),
(2, 'Snacks',    'Chips, chocolate and confectionery'),
(3, 'Bakery',    'Fresh bread and pastries'),
(4, 'Dairy',     'Milk, yogurt and chilled goods'),
(5, 'Household', 'Cleaning and home essentials');

-- Suppliers
INSERT INTO suppliers (id, name, contact_person, phone, email, address) VALUES
(1, 'Fresh Farms Distribution',      'John Doe',      '555-0101', 'sales@freshfarms.test',   '18 Orchard Road, Greenfield'),
(2, 'Golden Grain Bakery Supplies',  'Maria Lopez',   '555-0102', 'orders@goldengrain.test', '42 Mill Lane, Eastwood'),
(3, 'Nordic Dairy Co',               'Erik Johansson','555-0103', 'hello@nordicdairy.test',  '7 Cold Storage Ave, Northgate'),
(4, 'Home Essentials Ltd',           'Aisha Bello',   '555-0104', 'trade@homeessentials.test','210 Commerce Blvd, Southport');

-- Customers
INSERT INTO customers (id, name, phone, email, address) VALUES
(1, 'Laura Smith',   '555-0202', 'laura.smith@mail.test',   '12 Cedar Close, Riverton'),
(2, 'James Okafor',  '555-0203', 'james.okafor@mail.test',  '88 Birch Street, Midtown'),
(3, 'Priya Patel',   '555-0204', 'priya.patel@mail.test',   '5 Elm Gardens, Westhill'),
(4, 'Daniel Kim',    '555-0205', 'daniel.kim@mail.test',    '31 Maple Drive, Lakeview'),
(5, 'Sofia Alvarez', '555-0206', 'sofia.alvarez@mail.test', '76 Willow Lane, Brookside');

-- Products (quantities = opening + purchased - sold, kept consistent with ledger below)
INSERT INTO products (id, sku, name, category_id, supplier_id, barcode, cost_price, sell_price, quantity, reorder_level, status) VALUES
(1,  'BEV-001', 'Orange Juice 1L',      1, 1, '4001001000011', 0.80, 1.50, 148, 10, 'active'),
(2,  'BEV-002', 'Mineral Water 500ml',  1, 1, '4001001000028', 0.20, 0.60, 294, 24, 'active'),
(3,  'BEV-003', 'Cola 330ml',           1, 1, '4001001000035', 0.45, 1.00, 215, 24, 'active'),
(4,  'SNK-001', 'Salted Chips 150g',    2, 1, '4001001000042', 0.60, 1.10, 120, 12, 'active'),
(5,  'SNK-002', 'Chocolate Bar 90g',    2, 2, '4001001000059', 0.55, 1.20, 149, 15, 'active'),
(6,  'BAK-001', 'Sourdough Loaf',       3, 2, '4001001000066', 1.10, 2.40,  52, 60, 'active'),
(7,  'BAK-002', 'Croissant',            3, 2, '4001001000073', 0.50, 1.15, 145, 20, 'active'),
(8,  'DAI-001', 'Whole Milk 1L',        4, 3, '4001001000080', 0.70, 1.30, 218, 15, 'active'),
(9,  'DAI-002', 'Greek Yogurt 500g',    4, 3, '4001001000097', 0.95, 1.85,  85, 10, 'active'),
(10, 'HSE-001', 'Dish Soap 500ml',      5, 4, '4001001000103', 0.85, 1.65, 118, 10, 'active'),
(11, 'HSE-002', 'Glass Cleaner 750ml',  5, 4, '4001001000110', 1.20, 2.30,   0,  6, 'active');

-- Purchases (stock-in)
INSERT INTO purchases (id, reference, supplier_id, user_id, total, notes, status, created_at) VALUES
(1, 'PO-20260812-000001', 1, 1, 235.50, 'Weekly beverage restock',        'received', '2026-08-12 08:30:00'),
(2, 'PO-20260815-000002', 2, 2, 160.00, 'Bakery + confectionery delivery','received', '2026-08-15 09:10:00'),
(3, 'PO-20260818-000003', 3, 1, 162.00, 'Chilled goods delivery',         'received', '2026-08-18 07:45:00'),
(4, 'PO-20260820-000004', 4, 2,  68.00, 'Household shelf replenishment',  'received', '2026-08-20 10:00:00');

INSERT INTO purchase_items (purchase_id, product_id, product_name, cost_price, quantity, line_total) VALUES
(1, 1, 'Orange Juice 1L',     0.80, 100,  80.00),
(1, 2, 'Mineral Water 500ml', 0.20, 200,  40.00),
(1, 3, 'Cola 330ml',          0.45, 150,  67.50),
(1, 4, 'Salted Chips 150g',   0.60,  80,  48.00),
(2, 5, 'Chocolate Bar 90g',   0.55, 120,  66.00),
(2, 6, 'Sourdough Loaf',      1.10,  40,  44.00),
(2, 7, 'Croissant',           0.50, 100,  50.00),
(3, 8, 'Whole Milk 1L',       0.70, 150, 105.00),
(3, 9, 'Greek Yogurt 500g',   0.95,  60,  57.00),
(4, 10,'Dish Soap 500ml',     0.85,  80,  68.00);

-- Sales (tax 12% applied after discount; totals verified)
INSERT INTO sales (id, reference, user_id, customer_id, subtotal, discount, tax, total, paid_amount, change_due, payment_method, status, voided_by, voided_at, created_at) VALUES
(1,  'INV-20260811-000001', 1, NULL,  4.30, 0.00, 0.52,  4.82,  5.00, 0.18, 'cash',   'completed', NULL, NULL,              '2026-08-11 10:15:00'),
(2,  'INV-20260811-000002', 3, 1,    10.60, 0.00, 1.27, 11.87, 12.00, 0.13, 'card',   'completed', NULL, NULL,              '2026-08-11 15:40:00'),
(3,  'INV-20260812-000003', 2, NULL,  5.20, 0.00, 0.62,  5.82, 10.00, 4.18, 'cash',   'completed', NULL, NULL,              '2026-08-12 11:05:00'),
(4,  'INV-20260813-000004', 3, 2,     7.30, 0.00, 0.88,  8.18,  8.18, 0.00, 'mobile', 'completed', NULL, NULL,              '2026-08-13 09:30:00'),
(5,  'INV-20260814-000005', 1, 3,     7.60, 0.00, 0.91,  8.51,  9.00, 0.49, 'cash',   'completed', NULL, NULL,              '2026-08-14 16:20:00'),
(6,  'INV-20260815-000006', 3, NULL, 10.40, 0.00, 1.25, 11.65, 20.00, 8.35, 'card',   'completed', NULL, NULL,              '2026-08-15 12:45:00'),
(7,  'INV-20260816-000007', 2, 4,     8.80, 0.00, 1.06,  9.86, 10.00, 0.14, 'cash',   'completed', NULL, NULL,              '2026-08-16 13:10:00'),
(8,  'INV-20260817-000008', 3, NULL,  4.45, 0.00, 0.53,  4.98,  5.00, 0.02, 'cash',   'completed', NULL, NULL,              '2026-08-17 08:55:00'),
(9,  'INV-20260818-000009', 1, 5,    17.10, 0.00, 2.05, 19.15, 20.00, 0.85, 'card',   'completed', NULL, NULL,              '2026-08-18 17:25:00'),
(10, 'INV-20260819-000010', 3, NULL,  8.30, 0.00, 1.00,  9.30, 10.00, 0.70, 'cash',   'completed', NULL, NULL,              '2026-08-19 10:40:00'),
(11, 'INV-20260820-000011', 2, 1,     7.30, 0.00, 0.88,  8.18,  8.18, 0.00, 'mobile', 'completed', NULL, NULL,              '2026-08-20 14:00:00'),
(12, 'INV-20260821-000012', 3, NULL,  9.10, 0.00, 1.09, 10.19, 11.00, 0.81, 'cash',   'completed', NULL, NULL,              '2026-08-21 09:20:00'),
(13, 'INV-20260822-000013', 1, 4,     9.30, 1.00, 1.00,  9.30, 10.00, 0.70, 'card',   'completed', NULL, NULL,              '2026-08-22 15:15:00'),
(14, 'INV-20260823-000014', 3, NULL, 13.05, 0.00, 1.57, 14.62, 15.00, 0.38, 'cash',   'completed', NULL, NULL,              '2026-08-23 11:35:00'),
(15, 'INV-20260824-000015', 2, NULL,  8.60, 0.00, 1.03,  9.63, 10.00, 0.37, 'cash',   'completed', NULL, NULL,              '2026-08-24 09:05:00'),
(16, 'INV-20260824-000016', 3, 3,     6.00, 0.00, 0.72,  6.72,  7.00, 0.28, 'card',   'completed', NULL, NULL,              '2026-08-24 10:30:00'),
(17, 'INV-20260824-000017', 1, NULL, 12.05, 0.00, 1.45, 13.50, 14.00, 0.50, 'cash',   'voided',    1,   '2026-08-24 11:30:00', '2026-08-24 11:00:00');

INSERT INTO sale_items (sale_id, product_id, product_name, sku, unit_price, quantity, line_total) VALUES
(1,  1, 'Orange Juice 1L',     'BEV-001', 1.50,  2,  3.00),
(1,  8, 'Whole Milk 1L',       'DAI-001', 1.30,  1,  1.30),
(2,  6, 'Sourdough Loaf',      'BAK-001', 2.40,  2,  4.80),
(2,  7, 'Croissant',           'BAK-002', 1.15,  4,  4.60),
(2,  2, 'Mineral Water 500ml', 'BEV-002', 0.60,  2,  1.20),
(3,  3, 'Cola 330ml',          'BEV-003', 1.00,  3,  3.00),
(3,  4, 'Salted Chips 150g',   'SNK-001', 1.10,  2,  2.20),
(4,  5, 'Chocolate Bar 90g',   'SNK-002', 1.20,  3,  3.60),
(4,  9, 'Greek Yogurt 500g',   'DAI-002', 1.85,  2,  3.70),
(5,  8, 'Whole Milk 1L',       'DAI-001', 1.30,  4,  5.20),
(5,  6, 'Sourdough Loaf',      'BAK-001', 2.40,  1,  2.40),
(6,  1, 'Orange Juice 1L',     'BEV-001', 1.50,  3,  4.50),
(6,  7, 'Croissant',           'BAK-002', 1.15,  2,  2.30),
(6,  2, 'Mineral Water 500ml', 'BEV-002', 0.60,  6,  3.60),
(7,  4, 'Salted Chips 150g',   'SNK-001', 1.10,  4,  4.40),
(7,  3, 'Cola 330ml',          'BEV-003', 1.00,  2,  2.00),
(7,  5, 'Chocolate Bar 90g',   'SNK-002', 1.20,  2,  2.40),
(8,  8, 'Whole Milk 1L',       'DAI-001', 1.30,  2,  2.60),
(8,  9, 'Greek Yogurt 500g',   'DAI-002', 1.85,  1,  1.85),
(9,  6, 'Sourdough Loaf',      'BAK-001', 2.40,  3,  7.20),
(9,  7, 'Croissant',           'BAK-002', 1.15,  6,  6.90),
(9,  1, 'Orange Juice 1L',     'BEV-001', 1.50,  2,  3.00),
(10, 2, 'Mineral Water 500ml', 'BEV-002', 0.60, 12,  7.20),
(10, 4, 'Salted Chips 150g',   'SNK-001', 1.10,  1,  1.10),
(11, 10, 'Dish Soap 500ml',     'HSE-001', 1.65,  2,  3.30),
(11, 3, 'Cola 330ml',          'BEV-003', 1.00,  4,  4.00),
(12, 1, 'Orange Juice 1L',     'BEV-001', 1.50,  1,  1.50),
(12, 8, 'Whole Milk 1L',       'DAI-001', 1.30,  3,  3.90),
(12, 9, 'Greek Yogurt 500g',   'DAI-002', 1.85,  2,  3.70),
(13, 5, 'Chocolate Bar 90g',   'SNK-002', 1.20,  5,  6.00),
(13, 4, 'Salted Chips 150g',   'SNK-001', 1.10,  3,  3.30),
(14, 3, 'Cola 330ml',          'BEV-003', 1.00,  6,  6.00),
(14, 2, 'Mineral Water 500ml', 'BEV-002', 0.60,  6,  3.60),
(14, 7, 'Croissant',           'BAK-002', 1.15,  3,  3.45),
(15, 1, 'Orange Juice 1L',     'BEV-001', 1.50,  4,  6.00),
(15, 8, 'Whole Milk 1L',       'DAI-001', 1.30,  2,  2.60),
(16, 6, 'Sourdough Loaf',      'BAK-001', 2.40,  2,  4.80),
(16, 5, 'Chocolate Bar 90g',   'SNK-002', 1.20,  1,  1.20),
(17, 8, 'Whole Milk 1L',       'DAI-001', 1.30,  5,  6.50),
(17, 9, 'Greek Yogurt 500g',   'DAI-002', 1.85,  3,  5.55);

-- Stock movement ledger (opening + purchases - completed sales + void restore)
INSERT INTO stock_movements (product_id, change_qty, type, reference, note, user_id, created_at) VALUES
-- opening stock
(1, 60,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(2, 120, 'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(3, 80,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(4, 50,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(5, 40,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(6, 20,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(7, 60,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(8, 80,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(9, 30,  'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
(10, 40, 'initial', NULL, 'Opening stock', 1, '2026-08-11 09:00:00'),
-- purchases in
(1, 100,  'purchase', 'PO-20260812-000001', NULL, 1, '2026-08-12 08:30:00'),
(2, 200,  'purchase', 'PO-20260812-000001', NULL, 1, '2026-08-12 08:30:00'),
(3, 150,  'purchase', 'PO-20260812-000001', NULL, 1, '2026-08-12 08:30:00'),
(4, 80,   'purchase', 'PO-20260812-000001', NULL, 1, '2026-08-12 08:30:00'),
(5, 120,  'purchase', 'PO-20260815-000002', NULL, 2, '2026-08-15 09:10:00'),
(6, 40,   'purchase', 'PO-20260815-000002', NULL, 2, '2026-08-15 09:10:00'),
(7, 100,  'purchase', 'PO-20260815-000002', NULL, 2, '2026-08-15 09:10:00'),
(8, 150,  'purchase', 'PO-20260818-000003', NULL, 1, '2026-08-18 07:45:00'),
(9, 60,   'purchase', 'PO-20260818-000003', NULL, 1, '2026-08-18 07:45:00'),
(10, 80,  'purchase', 'PO-20260820-000004', NULL, 2, '2026-08-20 10:00:00'),
-- sales out
(1, -2, 'sale', 'INV-20260811-000001', NULL, 1, '2026-08-11 10:15:00'),
(8, -1, 'sale', 'INV-20260811-000001', NULL, 1, '2026-08-11 10:15:00'),
(6, -2, 'sale', 'INV-20260811-000002', NULL, 3, '2026-08-11 15:40:00'),
(7, -4, 'sale', 'INV-20260811-000002', NULL, 3, '2026-08-11 15:40:00'),
(2, -2, 'sale', 'INV-20260811-000002', NULL, 3, '2026-08-11 15:40:00'),
(3, -3, 'sale', 'INV-20260812-000003', NULL, 2, '2026-08-12 11:05:00'),
(4, -2, 'sale', 'INV-20260812-000003', NULL, 2, '2026-08-12 11:05:00'),
(5, -3, 'sale', 'INV-20260813-000004', NULL, 3, '2026-08-13 09:30:00'),
(9, -2, 'sale', 'INV-20260813-000004', NULL, 3, '2026-08-13 09:30:00'),
(8, -4, 'sale', 'INV-20260814-000005', NULL, 1, '2026-08-14 16:20:00'),
(6, -1, 'sale', 'INV-20260814-000005', NULL, 1, '2026-08-14 16:20:00'),
(1, -3, 'sale', 'INV-20260815-000006', NULL, 3, '2026-08-15 12:45:00'),
(7, -2, 'sale', 'INV-20260815-000006', NULL, 3, '2026-08-15 12:45:00'),
(2, -6, 'sale', 'INV-20260815-000006', NULL, 3, '2026-08-15 12:45:00'),
(4, -4, 'sale', 'INV-20260816-000007', NULL, 2, '2026-08-16 13:10:00'),
(3, -2, 'sale', 'INV-20260816-000007', NULL, 2, '2026-08-16 13:10:00'),
(5, -2, 'sale', 'INV-20260816-000007', NULL, 2, '2026-08-16 13:10:00'),
(8, -2, 'sale', 'INV-20260817-000008', NULL, 3, '2026-08-17 08:55:00'),
(9, -1, 'sale', 'INV-20260817-000008', NULL, 3, '2026-08-17 08:55:00'),
(6, -3, 'sale', 'INV-20260818-000009', NULL, 1, '2026-08-18 17:25:00'),
(7, -6, 'sale', 'INV-20260818-000009', NULL, 1, '2026-08-18 17:25:00'),
(1, -2, 'sale', 'INV-20260818-000009', NULL, 1, '2026-08-18 17:25:00'),
(2, -12,'sale', 'INV-20260819-000010', NULL, 3, '2026-08-19 10:40:00'),
(4, -1, 'sale', 'INV-20260819-000010', NULL, 3, '2026-08-19 10:40:00'),
(10, -2,'sale', 'INV-20260820-000011', NULL, 2, '2026-08-20 14:00:00'),
(3, -4, 'sale', 'INV-20260820-000011', NULL, 2, '2026-08-20 14:00:00'),
(1, -1, 'sale', 'INV-20260821-000012', NULL, 3, '2026-08-21 09:20:00'),
(8, -3, 'sale', 'INV-20260821-000012', NULL, 3, '2026-08-21 09:20:00'),
(9, -2, 'sale', 'INV-20260821-000012', NULL, 3, '2026-08-21 09:20:00'),
(5, -5, 'sale', 'INV-20260822-000013', NULL, 1, '2026-08-22 15:15:00'),
(4, -3, 'sale', 'INV-20260822-000013', NULL, 1, '2026-08-22 15:15:00'),
(3, -6, 'sale', 'INV-20260823-000014', NULL, 3, '2026-08-23 11:35:00'),
(2, -6, 'sale', 'INV-20260823-000014', NULL, 3, '2026-08-23 11:35:00'),
(7, -3, 'sale', 'INV-20260823-000014', NULL, 3, '2026-08-23 11:35:00'),
(1, -4, 'sale', 'INV-20260824-000015', NULL, 2, '2026-08-24 09:05:00'),
(8, -2, 'sale', 'INV-20260824-000015', NULL, 2, '2026-08-24 09:05:00'),
(6, -2, 'sale', 'INV-20260824-000016', NULL, 3, '2026-08-24 10:30:00'),
(5, -1, 'sale', 'INV-20260824-000016', NULL, 3, '2026-08-24 10:30:00'),
(8, -5, 'sale', 'INV-20260824-000017', NULL, 1, '2026-08-24 11:00:00'),
(9, -3, 'sale', 'INV-20260824-000017', NULL, 1, '2026-08-24 11:00:00'),
-- voided sale restored
(8, 5,  'void_restore', 'INV-20260824-000017', 'Sale voided', 1, '2026-08-24 11:30:00'),
(9, 3,  'void_restore', 'INV-20260824-000017', 'Sale voided', 1, '2026-08-24 11:30:00');

-- Settings
INSERT INTO settings (setting_key, setting_value) VALUES
('store_name',      'Apex Trading Co.'),
('store_address',   '128 Market Street, Springfield'),
('store_phone',     '(555) 240-1180'),
('store_email',     'hello@apextrading.test'),
('currency_symbol', '$'),
('tax_rate',        '12'),
('receipt_footer',  'Thank you for your business!');

-- ---------------------------------------------------------------------------
-- Performance indexes
-- These keep list pages, dashboards and reports fast as row counts grow.
-- Safe to include on a fresh import; for an existing database run the same
-- CREATE INDEX statements once (they are no-ops for queries once present).
-- ---------------------------------------------------------------------------
CREATE INDEX idx_sales_status_created    ON sales (status, created_at);
CREATE INDEX idx_sales_created           ON sales (created_at);
CREATE INDEX idx_sales_user              ON sales (user_id);
CREATE INDEX idx_sale_items_sale         ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product      ON sale_items (product_id);
CREATE INDEX idx_products_status_qty     ON products (status, quantity);
CREATE INDEX idx_products_category       ON products (category_id);
CREATE INDEX idx_products_supplier       ON products (supplier_id);
CREATE INDEX idx_stock_movements_product ON stock_movements (product_id);
CREATE INDEX idx_stock_movements_created ON stock_movements (created_at);
CREATE INDEX idx_purchases_status        ON purchases (status, created_at);
CREATE INDEX idx_purchase_items_product  ON purchase_items (product_id);

-- ---------------------------------------------------------------------------
-- Notification read-state
-- Low-stock alerts are derived from products; this table tracks which ones
-- each user has marked read/unread so the bell can show an unread count.
-- ---------------------------------------------------------------------------
CREATE TABLE notification_states (
  user_id    INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT fk_ns_user    FOREIGN KEY (user_id)    REFERENCES users (id)     ON DELETE CASCADE,
  CONSTRAINT fk_ns_product FOREIGN KEY (product_id) REFERENCES products (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
