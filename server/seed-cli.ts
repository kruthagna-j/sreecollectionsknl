import { config } from "./config.js";
import { openDatabase } from "./db.js";
import { seedDatabase } from "./seed-data.js";

const db = openDatabase(config.databasePath);
const withCoupon = process.argv.includes("--with-dev-coupon");
seedDatabase(db, { includeDevCoupon: withCoupon });

const counts = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM categories) AS categories,
       (SELECT COUNT(*) FROM products) AS products,
       (SELECT COUNT(*) FROM product_variants) AS variants,
       (SELECT COUNT(*) FROM shipping_zones) AS zones`
  )
  .get() as { categories: number; products: number; variants: number; zones: number };

console.log(
  `Seed complete: ${counts.categories} categories, ${counts.products} products, ${counts.variants} variants, ${counts.zones} delivery zones.`
);
if (withCoupon) console.log("Development coupon DEVWELCOME was requested. Never enable it in production.");
console.log("No orders, reviews, payments or testimonials were created.");
db.close();
