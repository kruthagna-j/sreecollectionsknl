import { newId, nowIso, transaction } from "./db.js";
const categories = [
    { id: "cat-birthday", slug: "birthday", name: "Birthday", description: "Little joys for another year of stories.", sort: 1 },
    { id: "cat-anniversary", slug: "anniversary", name: "Anniversary", description: "For the years shared and the ones ahead.", sort: 2 },
    { id: "cat-personalised", slug: "personalised", name: "Personalised", description: "Made specific to a name, a date or a memory.", sort: 3 },
    { id: "cat-soft-toys", slug: "soft-toys", name: "Soft Toys", description: "Warm, huggable companions for every age.", sort: 4 },
    { id: "cat-wedding", slug: "wedding", name: "Wedding", description: "Quietly beautiful gifts for a new beginning.", sort: 5 },
    { id: "cat-all-gifts", slug: "all-gifts", name: "All Gifts", description: "Thoughtful choices for every occasion.", sort: 6 }
];
// Development catalogue. Replace or extend through the admin API before launch.
const products = [
    {
        slug: "rose-keepsake-box",
        sku: "SC-BD-001",
        name: "Rose Velvet Keepsake Box",
        category: "cat-birthday",
        price: 149900,
        mrp: 179900,
        salePrice: 149900,
        costPrice: 85000,
        stock: 0,
        featured: true,
        personalizable: true,
        short: "A velvet-lined box for letters, trinkets and small birthday treasures.",
        description: "A structured keepsake box finished in soft velvet, with a hinged lid, satin lining and a slim gold ribbon. Its interior has room for letters, jewellery and the small things worth keeping.",
        tags: ["birthday", "her", "keepsake", "velvet", "under-2000", "gift-wrap"],
        variants: [
            { name: "Blush velvet", sku: "SC-BD-001-BL", price: 149900, stock: 14 },
            { name: "Burgundy velvet", sku: "SC-BD-001-BU", price: 149900, stock: 9 }
        ]
    },
    {
        slug: "celebrate-hamper",
        sku: "SC-BD-002",
        name: "Celebration Treasures Hamper",
        category: "cat-birthday",
        price: 229900,
        mrp: 259900,
        costPrice: 132000,
        stock: 12,
        featured: true,
        short: "A considered hamper of candles, sweets and small festive keepsakes.",
        description: "A ready-to-give hamper with a scented candle, assorted chocolates and a small brass keepsake, arranged in a reusable ivory box. Contents are listed in the pack and may be adjusted by the store before dispatch.",
        tags: ["birthday", "hamper", "celebration", "under-3000", "gift-wrap"]
    },
    {
        slug: "amber-candle-duo",
        sku: "SC-AN-001",
        name: "Amber Glass Candle Duo",
        category: "cat-anniversary",
        price: 189900,
        costPrice: 102000,
        stock: 0,
        featured: true,
        short: "Two hand-poured soy candles in amber glass, made for a slow evening.",
        description: "A pair of soy wax candles in warm amber glass. Choose one scent pair for the set; the candles arrive in a paper-wrapped box with a gift card.",
        tags: ["anniversary", "candles", "home", "under-2000", "gift-wrap"],
        variants: [
            { name: "Rose & Oud", sku: "SC-AN-001-RO", price: 189900, stock: 16 },
            { name: "Amber & Sandal", sku: "SC-AN-001-AS", price: 189900, stock: 11 }
        ]
    },
    {
        slug: "anniversary-photo-frame",
        sku: "SC-AN-002",
        name: "Gilded Anniversary Frame",
        category: "cat-anniversary",
        price: 249900,
        stock: 8,
        personalizable: true,
        short: "A slim gold frame with space for a photograph and a date.",
        description: "A tabletop frame with a brushed gold finish and an ivory mount. Add the names and date you would like printed beneath the photograph; our team will confirm the layout before dispatch.",
        tags: ["anniversary", "frame", "personalised", "under-3000", "gift-wrap"]
    },
    {
        slug: "engraved-memory-locket",
        sku: "SC-PE-001",
        name: "Engraved Memory Locket",
        category: "cat-personalised",
        price: 169900,
        mrp: 199900,
        stock: 0,
        personalizable: true,
        featured: true,
        short: "A small locket engraved with a date, initials or a few quiet words.",
        description: "A compact locket on a fine chain, engraved to order. Keep personalisation short: up to 18 characters on the front and 24 on the back. A proof is not produced automatically, so please check spelling carefully.",
        tags: ["personalised", "jewellery", "her", "under-2000", "gift-wrap"],
        variants: [
            { name: "Gold tone", sku: "SC-PE-001-GD", price: 169900, stock: 18 },
            { name: "Silver tone", sku: "SC-PE-001-SV", price: 159900, stock: 13 }
        ]
    },
    {
        slug: "personalised-journal",
        sku: "SC-PE-002",
        name: "Personalised Name Journal",
        category: "cat-personalised",
        price: 89900,
        stock: 0,
        personalizable: true,
        short: "A linen-bound journal with a name embossed on the cover.",
        description: "A lay-flat journal with cream pages and a linen cover. Add a name of up to 20 characters; the store will use the spelling exactly as entered.",
        tags: ["personalised", "journal", "under-1000", "gift-wrap"],
        variants: [
            { name: "Burgundy linen", sku: "SC-PE-002-BU", price: 89900, stock: 22 },
            { name: "Ivory linen", sku: "SC-PE-002-IV", price: 89900, stock: 19 }
        ]
    },
    {
        slug: "cocoa-bear",
        sku: "SC-ST-001",
        name: "Cocoa the Teddy Bear",
        category: "cat-soft-toys",
        price: 129900,
        stock: 0,
        short: "A soft cocoa-brown bear with a stitched ribbon bow.",
        description: "A plush bear with a soft cocoa pile, stitched nose and a removable ribbon bow. Choose the small or large size; both are suitable for children over three.",
        tags: ["soft-toys", "kids", "bear", "under-2000", "gift-wrap"],
        variants: [
            { name: "Small · 20 cm", sku: "SC-ST-001-S", price: 99900, stock: 17 },
            { name: "Large · 35 cm", sku: "SC-ST-001-L", price: 149900, stock: 9 }
        ]
    },
    {
        slug: "bunny-plush",
        sku: "SC-ST-002",
        name: "Linen Bunny Plush",
        category: "cat-soft-toys",
        price: 99900,
        stock: 21,
        short: "A long-eared bunny in soft linen and cream cotton.",
        description: "A lightweight bunny with linen ears, a cotton body and embroidered features. Surface wash only.",
        tags: ["soft-toys", "kids", "bunny", "under-1000", "gift-wrap"]
    },
    {
        slug: "ivory-wedding-set",
        sku: "SC-WD-001",
        name: "Ivory Wedding Keepsake Set",
        category: "cat-wedding",
        price: 349900,
        mrp: 399900,
        stock: 7,
        featured: true,
        short: "A keepsake box, two candles and a card for the newly married couple.",
        description: "A coordinated set for a wedding gift: an ivory keepsake box, two small candles and a blank card. The set arrives tied with a gold ribbon and can include a handwritten message at checkout.",
        tags: ["wedding", "couple", "keepsake", "under-4000", "gift-wrap"]
    },
    {
        slug: "gold-ribbon-gift-set",
        sku: "SC-WD-002",
        name: "Gold Ribbon Gift Set",
        category: "cat-wedding",
        price: 289900,
        stock: 10,
        short: "A pair of brass candleholders with candles and a linen pouch.",
        description: "Two compact brass candleholders, a pair of ivory candles and a linen storage pouch, presented in a rigid gift box.",
        tags: ["wedding", "home", "brass", "under-3000", "gift-wrap"]
    },
    {
        slug: "heritage-tea-set",
        sku: "SC-AG-001",
        name: "Heritage Tea Set",
        category: "cat-all-gifts",
        price: 219900,
        stock: 6,
        short: "A stoneware teapot and two cups in a warm ivory glaze.",
        description: "A small stoneware tea set for two, glazed in warm ivory with a hand-finished rim. Suitable for everyday use; hand wash recommended.",
        tags: ["all-gifts", "home", "tea", "under-3000", "gift-wrap"]
    },
    {
        slug: "rose-gift-box",
        sku: "SC-AG-002",
        name: "Scented Rose Gift Box",
        category: "cat-all-gifts",
        price: 159900,
        stock: 15,
        giftWrappable: false,
        short: "A rose-scented candle, soap and bath salts in a reusable box.",
        description: "A small self-care set with a rose candle, a wrapped soap and a jar of bath salts. This set is already presented in a gift-ready box, so extra wrapping is not offered.",
        tags: ["all-gifts", "self-care", "rose", "under-2000"]
    }
];
export function seedDatabase(db, options = {}) {
    const categoryInsert = db.prepare("INSERT OR IGNORE INTO categories (id, slug, name, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)");
    const productInsert = db.prepare(`INSERT OR IGNORE INTO products
      (id, slug, sku, name, short_description, description, category_id, price, sale_price, mrp, cost_price,
       tax_rate_bps, hsn_code, stock_quantity, low_stock_threshold, weight_g, status, featured,
       gift_wrappable, personalizable, tags, image_alt, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?)`);
    const imageInsert = db.prepare("INSERT OR IGNORE INTO product_images (id, product_id, url, alt, sort_order) VALUES (?, ?, ?, ?, ?)");
    const variantInsert = db.prepare("INSERT OR IGNORE INTO product_variants (id, product_id, name, sku, price, stock_quantity, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)");
    transaction(db, () => {
        for (const category of categories) {
            categoryInsert.run(category.id, category.slug, category.name, category.description, category.sort);
        }
        for (const product of products) {
            const id = `prod-${product.slug}`;
            const timestamp = nowIso();
            productInsert.run(id, product.slug, product.sku, product.name, product.short, product.description, product.category, product.price, product.salePrice ?? null, product.mrp ?? null, product.costPrice ?? null, product.taxRateBps ?? 500, null, product.variants ? 0 : product.stock, product.lowStock ?? 5, product.weightG ?? 400, product.featured ? 1 : 0, product.giftWrappable === false ? 0 : 1, product.personalizable ? 1 : 0, product.tags.join(","), product.name, timestamp, timestamp, timestamp);
            imageInsert.run(newId(), id, `/images/products/${product.slug}.svg`, product.name, 0);
            imageInsert.run(newId(), id, `/images/products/${product.slug}-detail.svg`, `${product.name}, detail view`, 1);
            product.variants?.forEach((variant, index) => {
                variantInsert.run(newId(), id, variant.name, variant.sku, variant.price, variant.stock, index);
            });
        }
        if (options.includeDevCoupon) {
            db.prepare(`INSERT OR IGNORE INTO coupons
          (id, code, kind, value, min_subtotal, max_discount, per_email_limit, is_active, created_at)
         VALUES (?, ?, 'percent', ?, ?, ?, 1, 1, ?)`).run("coupon-dev-welcome", "DEVWELCOME", 1000, 99900, 20000, nowIso());
        }
        db.prepare(`INSERT OR IGNORE INTO shipping_zones
        (id, name, pincodes, fee, free_above, eta_days_min, eta_days_max, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`).run("zone-local-demo", "Local delivery (Kurnool)", "518001-518999", 4900, 250000, 1, 2);
        db.prepare(`INSERT OR IGNORE INTO shipping_zones
        (id, name, pincodes, fee, free_above, eta_days_min, eta_days_max, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 100)`).run("zone-all-india", "All India delivery", "100000-999999", 9900, 199900, 4, 7);
        const seedSetting = (key, value) => {
            db.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)").run(key, JSON.stringify(value), nowIso());
        };
        seedSetting("store", {
            name: "Sree Collections",
            tagline: "Since 1998",
            supportEmail: "",
            supportPhone: "",
            supportWhatsApp: "919494498937",
            address: "Gandhi Nagar, Kurnool",
            latitude: null,
            longitude: null
        });
        seedSetting("publicProfile", {
            rating: 4.4,
            ratingCount: 84,
            yearsInBusiness: 28,
            locality: "Gandhi Nagar, Kurnool",
            closesAt: "21:30",
            categories: ["Personalized gift shops", "Gift shops"]
        });
        seedSetting("notifications", {
            sendCustomerEmail: true,
            sendOwnerEmail: true,
            ownerEmail: "",
            whatsappAutoOpen: true
        });
        seedSetting("tax", {
            inclusive: true,
            defaultRateBps: 500,
            note: "Product prices are treated as GST-inclusive. Confirm tax classifications and GST registration with the business before launch."
        });
        seedSetting("giftWrap", { fee: 9900, label: "Signature gold-ribbon wrap" });
        seedSetting("cod", { enabled: true, maxTotal: 1000000, fee: 0 });
        seedSetting("returns", {
            enabled: true,
            windowDays: 7,
            note: "Template policy. Personalised items are excluded. Legal review required."
        });
        seedSetting("operational", { maintenance: false, message: "" });
        seedSetting("home", {
            announcement: "28 years of gifting in Kurnool · Cash on delivery available",
            hero: {
                eyebrow: "Gandhi Nagar, Kurnool · Since 1998",
                title: "Gifts that keep the moment.",
                subtitle: "Personalised keepsakes, soft toys and wedding gifts — wrapped by hand at our shop in Kurnool.",
                ctaLabel: "Shop gifts",
                ctaHref: "/shop",
                image: "/images/products/rose-keepsake-box.svg"
            },
            sections: [
                { id: "occasions", type: "occasions", title: "Shop by occasion", subtitle: "Find the right gesture for the moment.", enabled: true, order: 1 },
                { id: "featured", type: "featured", title: "Curated for gifting", subtitle: "Pieces our team keeps coming back to.", enabled: true, order: 2 },
                { id: "new", type: "new", title: "New in the collection", subtitle: "The latest additions to the shelf.", enabled: true, order: 3 },
                { id: "personalised", type: "personalised", title: "Made just for them", subtitle: "Names, dates and small words worth keeping.", enabled: true, order: 4 },
                { id: "story", type: "story", title: "A small shop, since 1998", subtitle: "", enabled: true, order: 5 },
                { id: "service", type: "service", title: "The details, handled", subtitle: "", enabled: true, order: 6 }
            ]
        });
    });
}
