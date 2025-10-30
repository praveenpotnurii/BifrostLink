-- Create sample database
CREATE DATABASE IF NOT EXISTS testdb;
USE testdb;

-- Change root password authentication to mysql_native_password for compatibility with MariaDB client
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'rootpassword';

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    age INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO users (name, email, age) VALUES
    ('Alice Johnson', 'alice@example.com', 28),
    ('Bob Smith', 'bob@example.com', 35),
    ('Charlie Brown', 'charlie@example.com', 42),
    ('Diana Prince', 'diana@example.com', 31),
    ('Eve Davis', 'eve@example.com', 26);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0,
    category VARCHAR(50)
);

-- Insert sample products
INSERT INTO products (name, price, stock, category) VALUES
    ('Laptop', 999.99, 15, 'Electronics'),
    ('Mouse', 29.99, 50, 'Electronics'),
    ('Desk Chair', 199.99, 20, 'Furniture'),
    ('Monitor', 299.99, 25, 'Electronics'),
    ('Keyboard', 79.99, 40, 'Electronics');

-- Show tables and data
SELECT 'Database initialized successfully!' as message;
SELECT COUNT(*) as user_count FROM users;
SELECT COUNT(*) as product_count FROM products;
