const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------- SECURITY HELPERS ----------------

const otpStore = new Map();

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateIndianPhone(phone) {
    return /^[6-9]\d{9}$/.test(phone);
}

function sanitize(value = "") {
    return String(value).replace(/[<>]/g, "");
}

// ---------------- FILE PATHS ----------------

const PRODUCTS_FILE = path.join(__dirname, "products.json");
const ORDERS_FILE = path.join(__dirname, "orders.json");

// ---------------- PRODUCTS ----------------

function loadProducts() {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];

    try {
        return JSON.parse(fs.readFileSync(PRODUCTS_FILE));
    } catch {
        return [];
    }
}

function saveProducts(products) {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

// ---------------- ORDERS ----------------

function loadOrders() {
    if (!fs.existsSync(ORDERS_FILE)) return [];

    try {
        return JSON.parse(fs.readFileSync(ORDERS_FILE));
    } catch {
        return [];
    }
}

function saveOrders(orders) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// ---------------- PRODUCTS API ----------------

app.get("/products", (req, res) => {
    return res.json(loadProducts());
});

app.post("/products", (req, res) => {

    const products = loadProducts();

    const name = sanitize(req.body.name);
    const image = sanitize(req.body.image);

    if (!name) {
        return res.status(400).json({
            success: false,
            message: "Product name required"
        });
    }

    const newProduct = {
        id: Date.now(),
        name,
        price: Number(req.body.price || 0),
        image
    };

    products.push(newProduct);
    saveProducts(products);

    return res.json({
        success: true,
        product: newProduct
    });
});

// ---------------- ORDERS API ----------------

app.get("/orders", (req, res) => {
    return res.json(loadOrders());
});

app.get("/orders/:id", (req, res) => {

    const orders = loadOrders();

    const order = orders.find(
        o => o.id === Number(req.params.id)
    );

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found"
        });
    }

    return res.json(order);
});

app.post("/orders", (req, res) => {

    const {
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        items,
        total
    } = req.body;

    if (!validateEmail(customerEmail || "")) {
        return res.status(400).json({
            success: false,
            message: "Invalid email"
        });
    }

    if (!validateIndianPhone(customerPhone || "")) {
        return res.status(400).json({
            success: false,
            message: "Invalid phone number"
        });
    }

    const orders = loadOrders();

    const order = {
        id: Date.now(),
        date: new Date().toISOString(),
        customerName: sanitize(customerName),
        customerEmail: sanitize(customerEmail),
        customerPhone: sanitize(customerPhone),
        shippingAddress: sanitize(shippingAddress),
        items: Array.isArray(items) ? items : [],
        total: Number(total || 0),
        status: "Pending"
    };

    orders.push(order);

    saveOrders(orders);

    return res.json({
        success: true,
        order
    });
});

app.put("/orders/:id/cancel", (req, res) => {

    const orders = loadOrders();

    const order = orders.find(
        o => o.id === Number(req.params.id)
    );

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found"
        });
    }

    if (
        order.status === "Delivered" ||
        order.status === "Cancelled"
    ) {
        return res.status(400).json({
            success: false,
            message: "Cannot cancel order"
        });
    }

    order.status = "Cancelled";

    saveOrders(orders);

    return res.json({
        success: true,
        order
    });
});

// ---------------- OTP API ----------------

app.post("/api/send-otp", async (req, res) => {

    const email = sanitize(req.body.email || "");

    if (!validateEmail(email)) {
        return res.status(400).json({
            success: false,
            message: "Invalid email"
        });
    }

    const otp = Math.floor(
        100000 + Math.random() * 900000
    );

    otpStore.set(email, {
        otp,
        expires: Date.now() + (5 * 60 * 1000)
    });

    // Integrate EmailJS / email provider here

    return res.json({
        success: true
    });
});

app.post("/api/verify-otp", (req, res) => {

    const email = sanitize(req.body.email || "");
    const otp = sanitize(req.body.otp || "");

    const data = otpStore.get(email);

    if (!data) {
        return res.status(400).json({
            success: false,
            message: "OTP not found"
        });
    }

    if (Date.now() > data.expires) {

        otpStore.delete(email);

        return res.status(400).json({
            success: false,
            message: "OTP expired"
        });
    }

    if (String(data.otp) !== String(otp)) {
        return res.status(400).json({
            success: false,
            message: "Invalid OTP"
        });
    }

    otpStore.delete(email);

    return res.json({
        success: true
    });
});

// ---------------- RAZORPAY VERIFY ----------------

app.post("/api/verify-payment", async (req, res) => {

    try {

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        const generated = crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_SECRET
            )
            .update(
                `${razorpay_order_id}|${razorpay_payment_id}`
            )
            .digest("hex");

        if (generated !== razorpay_signature) {

            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });
        }

        return res.json({
            success: true,
            message: "Payment verified"
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});

// ---------------- START SERVER ----------------

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
