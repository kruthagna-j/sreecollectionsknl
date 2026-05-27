const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 📁 files where data will be stored permanently
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const ORDERS_FILE = path.join(__dirname, "orders.json");

// ---------- PRODUCTS HELPER FUNCTIONS ----------
function loadProducts() {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];
    const data = fs.readFileSync(PRODUCTS_FILE);
    return JSON.parse(data);
}

function saveProducts(products) {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

// ---------- ORDERS HELPER FUNCTIONS ----------
function loadOrders() {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    const data = fs.readFileSync(ORDERS_FILE);
    return JSON.parse(data);
}

function saveOrders(orders) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// ---------- GET products ----------
app.get("/products", (req, res) => {
    const products = loadProducts();
    res.json(products);
});

// ---------- ADD product (ADMIN USE) ----------
app.post("/products", (req, res) => {
    const products = loadProducts();

    const newProduct = {
        id: Date.now(),
        name: req.body.name,
        price: req.body.price,
        image: req.body.image || ""
    };

    products.push(newProduct);
    saveProducts(products);

    res.json({ message: "Product added", product: newProduct });
});

// ---------- GET all orders ----------
app.get("/orders", (req, res) => {
    const orders = loadOrders();
    res.json(orders);
});

// ---------- CREATE new order ----------
app.post("/orders", (req, res) => {
    const orders = loadOrders();

    const newOrder = {
        id: Date.now(),
        date: new Date().toISOString(),
        items: req.body.items || [],
        total: req.body.total || 0,
        status: "Pending",
        customerName: req.body.customerName || "Guest",
        customerEmail: req.body.customerEmail || "",
        customerPhone: req.body.customerPhone || "",
        shippingAddress: req.body.shippingAddress || ""
    };

    orders.push(newOrder);
    saveOrders(orders);

    res.json({ message: "Order created successfully", order: newOrder });
});

// ---------- CANCEL order ----------
app.put("/orders/:id/cancel", (req, res) => {
    const orders = loadOrders();
    const orderId = parseInt(req.params.id);

    const order = orders.find(o => o.id === orderId);

    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "Delivered" || order.status === "Cancelled") {
        return res.status(400).json({ message: `Cannot cancel a ${order.status.toLowerCase()} order` });
    }

    order.status = "Cancelled";
    saveOrders(orders);

    res.json({ message: "Order cancelled successfully", order });
});

// ---------- GET order by ID ----------
app.get("/orders/:id", (req, res) => {
    const orders = loadOrders();
    const orderId = parseInt(req.params.id);
    const order = orders.find(o => o.id === orderId);

    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});