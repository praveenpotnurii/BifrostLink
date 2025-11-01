// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

// Switch to testdb database (will be created automatically)
db = db.getSiblingDB('testdb');

// Create users collection with sample data
db.users.insertMany([
    {
        name: 'Alice Johnson',
        email: 'alice@example.com',
        age: 28,
        created_at: new Date()
    },
    {
        name: 'Bob Smith',
        email: 'bob@example.com',
        age: 35,
        created_at: new Date()
    },
    {
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        age: 42,
        created_at: new Date()
    },
    {
        name: 'Diana Prince',
        email: 'diana@example.com',
        age: 31,
        created_at: new Date()
    },
    {
        name: 'Eve Davis',
        email: 'eve@example.com',
        age: 26,
        created_at: new Date()
    }
]);

// Create products collection with sample data
db.products.insertMany([
    {
        name: 'Laptop',
        price: 999.99,
        stock: 15,
        category: 'Electronics'
    },
    {
        name: 'Mouse',
        price: 29.99,
        stock: 50,
        category: 'Electronics'
    },
    {
        name: 'Desk Chair',
        price: 199.99,
        stock: 20,
        category: 'Furniture'
    },
    {
        name: 'Monitor',
        price: 299.99,
        stock: 25,
        category: 'Electronics'
    },
    {
        name: 'Keyboard',
        price: 79.99,
        stock: 40,
        category: 'Electronics'
    }
]);

// Create indexes for better query performance
db.users.createIndex({ email: 1 }, { unique: true });
db.products.createIndex({ category: 1 });

// Print initialization results
print('MongoDB initialization completed!');
print('Users count: ' + db.users.countDocuments({}));
print('Products count: ' + db.products.countDocuments({}));
