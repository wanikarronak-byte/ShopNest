/**
 * ShopNest API + static file server
 * Run from /server: npm start
 * Serves customer site from parent folder and /api/* endpoints.
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const {
  signToken,
  authRequired,
  requireRole,
  requireApprovedSeller,
  publicUser,
} = require("./middleware/auth");

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.join(__dirname, "..");
const UPLOAD_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error("Only image uploads are allowed."));
    }
    cb(null, true);
  },
});

function now() {
  return new Date().toISOString();
}

function mapProductForCustomer(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory || null,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice,
    discountLabel: p.discountLabel,
    image: (p.images && p.images[0]) || "https://placehold.co/280x280?text=Product",
    images: p.images || [],
    stock: p.stock,
    isNewArrival: !!p.isNewArrival,
    sellerId: p.sellerId || null,
    availability: p.availability,
  };
}

function isPublicProduct(p) {
  return (
    p &&
    p.approvalStatus === "approved" &&
    p.availability === "active" &&
    Number(p.stock) >= 0
  );
}

function validateProductInput(body, { partial = false } = {}) {
  const errors = [];
  const name = body.name != null ? String(body.name).trim() : null;
  const description = body.description != null ? String(body.description).trim() : null;
  const category = body.category != null ? String(body.category).trim() : null;
  const price = body.price != null ? Number(body.price) : null;
  const stock = body.stock != null ? Number(body.stock) : null;

  if (!partial || body.name != null) {
    if (!name || name.length < 2) errors.push("Product name is required (min 2 characters).");
  }
  if (!partial || body.description != null) {
    if (!description) errors.push("Description is required.");
  }
  if (!partial || body.category != null) {
    if (!category) errors.push("Category is required.");
  }
  if (!partial || body.price != null) {
    if (!Number.isFinite(price) || price < 0) errors.push("Valid selling price is required.");
  }
  if (!partial || body.stock != null) {
    if (!Number.isInteger(stock) || stock < 0) errors.push("Stock must be a non-negative integer.");
  }
  return { errors, name, description, category, price, stock };
}

function findUserByEmail(email) {
  return db.read().users.find((u) => u.email === String(email).toLowerCase());
}

function findUserById(id) {
  return db.read().users.find((u) => u.id === id);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (findUserByEmail(email)) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      email,
      passwordHash,
      name,
      role: "customer",
      sellerStatus: "none",
      sellerDetails: null,
      active: true,
      createdAt: now(),
    };

    db.update((data) => {
      data.users.push(user);
    });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = findUserByEmail(email);
    if (!user || user.active === false) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password." });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed." });
  }
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const user = findUserById(req.user.sub);
  if (!user || user.active === false) {
    return res.status(401).json({ error: "Account not found." });
  }
  res.json({ user: publicUser(user) });
});

// ---------------------------------------------------------------------------
// Seller registration (customer → pending seller)
// ---------------------------------------------------------------------------
app.post("/api/sellers/register", authRequired, (req, res) => {
  const user = findUserById(req.user.sub);
  if (!user) return res.status(401).json({ error: "Account not found." });
  if (user.role === "admin") {
    return res.status(400).json({ error: "Admin accounts cannot register as sellers." });
  }
  if (user.role === "seller" && user.sellerStatus === "approved") {
    return res.status(400).json({ error: "You are already an approved seller." });
  }
  if (user.sellerStatus === "pending") {
    return res.status(400).json({ error: "Seller application is already pending." });
  }

  const shopName = String(req.body.shopName || "").trim();
  const phone = String(req.body.phone || "").trim();
  const address = String(req.body.address || "").trim();
  if (!shopName || !phone || !address) {
    return res.status(400).json({ error: "Shop name, phone and address are required." });
  }

  let updated;
  db.update((data) => {
    const u = data.users.find((x) => x.id === user.id);
    u.role = "seller";
    u.sellerStatus = "pending";
    u.sellerDetails = { shopName, phone, address, submittedAt: now() };
    updated = publicUser(u);
  });

  const token = signToken({ ...user, role: "seller", sellerStatus: "pending" });
  res.json({
    message: "Seller application submitted. Await admin approval.",
    user: updated,
    token,
  });
});

// ---------------------------------------------------------------------------
// Categories (public read)
// ---------------------------------------------------------------------------
app.get("/api/categories", (_req, res) => {
  res.json({ categories: db.read().categories });
});

app.post("/api/admin/categories", authRequired, requireRole("admin"), (req, res) => {
  const name = String(req.body.name || "").trim();
  const slug = String(req.body.slug || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (!name || !slug) return res.status(400).json({ error: "Name and slug are required." });

  let category;
  db.update((data) => {
    if (data.categories.some((c) => c.slug === slug)) {
      throw Object.assign(new Error("Category slug already exists."), { status: 409 });
    }
    category = {
      id: uuidv4(),
      slug,
      name,
      subcategories: Array.isArray(req.body.subcategories) ? req.body.subcategories : [],
    };
    data.categories.push(category);
  });
  res.status(201).json({ category });
});

app.put("/api/admin/categories/:id", authRequired, requireRole("admin"), (req, res) => {
  let category;
  try {
    db.update((data) => {
      const c = data.categories.find((x) => x.id === req.params.id);
      if (!c) throw Object.assign(new Error("Category not found."), { status: 404 });
      if (req.body.name) c.name = String(req.body.name).trim();
      if (Array.isArray(req.body.subcategories)) c.subcategories = req.body.subcategories;
      category = c;
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  res.json({ category });
});

app.delete("/api/admin/categories/:id", authRequired, requireRole("admin"), (req, res) => {
  db.update((data) => {
    data.categories = data.categories.filter((c) => c.id !== req.params.id);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Products — public (approved + active only)
// ---------------------------------------------------------------------------
app.get("/api/products", (req, res) => {
  const { category, q, sort } = req.query;
  let list = db.read().products.filter(isPublicProduct);

  if (category && category !== "all") {
    list = list.filter((p) => p.category === category);
  }
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(needle));
  }
  if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (sort === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name));

  res.json({ products: list.map(mapProductForCustomer) });
});

app.get("/api/products/:id", (req, res) => {
  const p = db.read().products.find((x) => x.id === req.params.id);
  if (!p || !isPublicProduct(p)) {
    return res.status(404).json({ error: "Product not found or not available." });
  }
  res.json({ product: mapProductForCustomer(p) });
});

// ---------------------------------------------------------------------------
// Admin products
// ---------------------------------------------------------------------------
app.get("/api/admin/products", authRequired, requireRole("admin"), (req, res) => {
  const status = req.query.approvalStatus;
  let list = db.read().products.slice();
  if (status) list = list.filter((p) => p.approvalStatus === status);
  res.json({ products: list });
});

app.post("/api/admin/products", authRequired, requireRole("admin"), (req, res) => {
  const v = validateProductInput(req.body);
  if (v.errors.length) return res.status(400).json({ error: v.errors.join(" ") });

  const product = {
    id: uuidv4(),
    name: v.name,
    description: v.description,
    category: v.category,
    subcategory: req.body.subcategory ? String(req.body.subcategory).trim() : null,
    price: v.price,
    originalPrice:
      req.body.originalPrice != null && req.body.originalPrice !== ""
        ? Number(req.body.originalPrice)
        : null,
    discountLabel: req.body.discountLabel ? String(req.body.discountLabel).trim() : null,
    images: Array.isArray(req.body.images) && req.body.images.length
      ? req.body.images
      : ["https://placehold.co/280x280?text=Product"],
    stock: v.stock,
    availability: req.body.availability === "inactive" ? "inactive" : "active",
    sellerId: null,
    approvalStatus: "approved",
    rejectionReason: null,
    isNewArrival: !!req.body.isNewArrival,
    createdAt: now(),
    updatedAt: now(),
  };

  db.update((data) => data.products.push(product));
  res.status(201).json({ product });
});

app.put("/api/admin/products/:id", authRequired, requireRole("admin"), (req, res) => {
  let product;
  try {
    db.update((data) => {
      const p = data.products.find((x) => x.id === req.params.id);
      if (!p) throw Object.assign(new Error("Product not found."), { status: 404 });
      const v = validateProductInput(req.body, { partial: true });
      if (v.errors.length) throw Object.assign(new Error(v.errors.join(" ")), { status: 400 });
      if (req.body.name != null) p.name = v.name;
      if (req.body.description != null) p.description = v.description;
      if (req.body.category != null) p.category = v.category;
      if (req.body.subcategory != null) p.subcategory = String(req.body.subcategory).trim();
      if (req.body.price != null) p.price = v.price;
      if (req.body.originalPrice !== undefined) {
        p.originalPrice =
          req.body.originalPrice === null || req.body.originalPrice === ""
            ? null
            : Number(req.body.originalPrice);
      }
      if (req.body.discountLabel !== undefined) {
        p.discountLabel = req.body.discountLabel
          ? String(req.body.discountLabel).trim()
          : null;
      }
      if (req.body.stock != null) p.stock = v.stock;
      if (req.body.availability) p.availability = req.body.availability;
      if (Array.isArray(req.body.images)) p.images = req.body.images;
      if (req.body.isNewArrival != null) p.isNewArrival = !!req.body.isNewArrival;
      if (req.body.approvalStatus) p.approvalStatus = req.body.approvalStatus;
      if (req.body.rejectionReason !== undefined) {
        p.rejectionReason = req.body.rejectionReason
          ? String(req.body.rejectionReason)
          : null;
      }
      p.updatedAt = now();
      product = p;
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  res.json({ product });
});

app.delete("/api/admin/products/:id", authRequired, requireRole("admin"), (req, res) => {
  db.update((data) => {
    data.products = data.products.filter((p) => p.id !== req.params.id);
  });
  res.json({ ok: true });
});

app.post(
  "/api/admin/products/:id/approve",
  authRequired,
  requireRole("admin"),
  (req, res) => {
    let product;
    db.update((data) => {
      const p = data.products.find((x) => x.id === req.params.id);
      if (!p) return;
      p.approvalStatus = "approved";
      p.rejectionReason = null;
      p.availability = "active";
      p.updatedAt = now();
      product = p;
    });
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json({ product });
  }
);

app.post(
  "/api/admin/products/:id/reject",
  authRequired,
  requireRole("admin"),
  (req, res) => {
    const reason = String(req.body.reason || "Rejected by admin").trim();
    let product;
    db.update((data) => {
      const p = data.products.find((x) => x.id === req.params.id);
      if (!p) return;
      p.approvalStatus = "rejected";
      p.rejectionReason = reason;
      p.availability = "inactive";
      p.updatedAt = now();
      product = p;
    });
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json({ product });
  }
);

// ---------------------------------------------------------------------------
// Seller products
// ---------------------------------------------------------------------------
app.get("/api/seller/products", authRequired, requireRole("seller"), (req, res) => {
  const list = db.read().products.filter((p) => p.sellerId === req.user.sub);
  res.json({ products: list });
});

app.post(
  "/api/seller/products",
  authRequired,
  requireApprovedSeller,
  (req, res) => {
    const v = validateProductInput(req.body);
    if (v.errors.length) return res.status(400).json({ error: v.errors.join(" ") });

    const product = {
      id: uuidv4(),
      name: v.name,
      description: v.description,
      category: v.category,
      subcategory: req.body.subcategory ? String(req.body.subcategory).trim() : null,
      price: v.price,
      originalPrice:
        req.body.originalPrice != null && req.body.originalPrice !== ""
          ? Number(req.body.originalPrice)
          : null,
      discountLabel: req.body.discountLabel ? String(req.body.discountLabel).trim() : null,
      images: Array.isArray(req.body.images) && req.body.images.length
        ? req.body.images
        : ["https://placehold.co/280x280?text=Seller+Product"],
      stock: v.stock,
      availability: "inactive",
      sellerId: req.user.sub,
      approvalStatus: "pending",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    };

    db.update((data) => data.products.push(product));
    res.status(201).json({
      product,
      message: "Product submitted for admin approval.",
    });
  }
);

app.put(
  "/api/seller/products/:id",
  authRequired,
  requireApprovedSeller,
  (req, res) => {
    let product;
    try {
      db.update((data) => {
        const p = data.products.find((x) => x.id === req.params.id);
        if (!p) throw Object.assign(new Error("Product not found."), { status: 404 });
        if (p.sellerId !== req.user.sub) {
          throw Object.assign(new Error("You can only edit your own products."), {
            status: 403,
          });
        }
        const v = validateProductInput(req.body, { partial: true });
        if (v.errors.length) throw Object.assign(new Error(v.errors.join(" ")), { status: 400 });

        if (req.body.name != null) p.name = v.name;
        if (req.body.description != null) p.description = v.description;
        if (req.body.category != null) p.category = v.category;
        if (req.body.subcategory != null) p.subcategory = String(req.body.subcategory).trim();
        if (req.body.price != null) p.price = v.price;
        if (req.body.originalPrice !== undefined) {
          p.originalPrice =
            req.body.originalPrice === null || req.body.originalPrice === ""
              ? null
              : Number(req.body.originalPrice);
        }
        if (req.body.discountLabel !== undefined) {
          p.discountLabel = req.body.discountLabel
            ? String(req.body.discountLabel).trim()
            : null;
        }
        if (req.body.stock != null) p.stock = v.stock;
        if (Array.isArray(req.body.images)) p.images = req.body.images;

        // Material changes re-enter review
        if (p.approvalStatus === "approved") {
          p.approvalStatus = "pending";
          p.availability = "inactive";
          p.rejectionReason = null;
        } else if (p.approvalStatus === "rejected") {
          p.approvalStatus = "pending";
          p.rejectionReason = null;
        }
        p.updatedAt = now();
        product = p;
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
    res.json({
      product,
      message: "Product updated and set to pending approval.",
    });
  }
);

app.delete(
  "/api/seller/products/:id",
  authRequired,
  requireApprovedSeller,
  (req, res) => {
    try {
      db.update((data) => {
        const p = data.products.find((x) => x.id === req.params.id);
        if (!p) throw Object.assign(new Error("Product not found."), { status: 404 });
        if (p.sellerId !== req.user.sub) {
          throw Object.assign(new Error("You can only delete your own products."), {
            status: 403,
          });
        }
        data.products = data.products.filter((x) => x.id !== req.params.id);
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
    res.json({ ok: true });
  }
);

app.post(
  "/api/seller/products/:id/deactivate",
  authRequired,
  requireApprovedSeller,
  (req, res) => {
    let product;
    try {
      db.update((data) => {
        const p = data.products.find((x) => x.id === req.params.id);
        if (!p) throw Object.assign(new Error("Product not found."), { status: 404 });
        if (p.sellerId !== req.user.sub) {
          throw Object.assign(new Error("Forbidden."), { status: 403 });
        }
        p.availability = "inactive";
        p.updatedAt = now();
        product = p;
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
    res.json({ product });
  }
);

// ---------------------------------------------------------------------------
// Image upload (admin or approved seller)
// ---------------------------------------------------------------------------
app.post(
  "/api/upload",
  authRequired,
  (req, res, next) => {
    if (req.user.role === "admin") return next();
    if (req.user.role === "seller" && req.user.sellerStatus === "approved") return next();
    return res.status(403).json({ error: "Upload not allowed." });
  },
  (req, res) => {
    upload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "No image file uploaded." });
      const url = `/uploads/${req.file.filename}`;
      res.status(201).json({ url });
    });
  }
);

// ---------------------------------------------------------------------------
// Admin: sellers & customers
// ---------------------------------------------------------------------------
app.get("/api/admin/sellers", authRequired, requireRole("admin"), (_req, res) => {
  const sellers = db
    .read()
    .users.filter((u) => u.role === "seller")
    .map(publicUser);
  res.json({ sellers });
});

app.post(
  "/api/admin/sellers/:id/approve",
  authRequired,
  requireRole("admin"),
  (req, res) => {
    let user;
    db.update((data) => {
      const u = data.users.find((x) => x.id === req.params.id && x.role === "seller");
      if (!u) return;
      u.sellerStatus = "approved";
      user = publicUser(u);
    });
    if (!user) return res.status(404).json({ error: "Seller not found." });
    res.json({ user });
  }
);

app.post(
  "/api/admin/sellers/:id/reject",
  authRequired,
  requireRole("admin"),
  (req, res) => {
    let user;
    db.update((data) => {
      const u = data.users.find((x) => x.id === req.params.id && x.role === "seller");
      if (!u) return;
      u.sellerStatus = "rejected";
      user = publicUser(u);
    });
    if (!user) return res.status(404).json({ error: "Seller not found." });
    res.json({ user });
  }
);

app.get("/api/admin/customers", authRequired, requireRole("admin"), (_req, res) => {
  const customers = db
    .read()
    .users.filter((u) => u.role === "customer")
    .map(publicUser);
  res.json({ customers });
});

app.patch(
  "/api/admin/users/:id",
  authRequired,
  requireRole("admin"),
  (req, res) => {
    let user;
    db.update((data) => {
      const u = data.users.find((x) => x.id === req.params.id);
      if (!u) return;
      if (typeof req.body.active === "boolean") u.active = req.body.active;
      user = publicUser(u);
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user });
  }
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
app.post("/api/orders", authRequired, (req, res) => {
  const customerName = String(req.body.customerName || "").trim();
  const mobile = String(req.body.mobile || "").trim();
  const address = String(req.body.address || "").trim();
  const city = String(req.body.city || "").trim();
  const state = String(req.body.state || "").trim();
  const postalCode = String(req.body.postalCode || "").trim();
  const paymentMethod = req.body.paymentMethod || "Cash on Delivery";
  const itemsIn = Array.isArray(req.body.items) ? req.body.items : [];

  if (!customerName || !mobile || !address || !city || !state || !postalCode) {
    return res.status(400).json({ error: "All delivery fields are required." });
  }
  if (!itemsIn.length) {
    return res.status(400).json({ error: "Cart is empty." });
  }

  let order;
  try {
    db.update((data) => {
      const lineItems = [];
      let subtotal = 0;

      for (const row of itemsIn) {
        const product = data.products.find((p) => p.id === row.productId);
        const qty = Number(row.quantity);
        if (!product || !isPublicProduct(product)) {
          throw Object.assign(new Error(`Product unavailable: ${row.productId}`), {
            status: 400,
          });
        }
        if (!Number.isInteger(qty) || qty < 1) {
          throw Object.assign(new Error("Invalid quantity."), { status: 400 });
        }
        if (qty > product.stock) {
          throw Object.assign(
            new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`),
            { status: 400 }
          );
        }
        // Server-authoritative price
        const unitPrice = product.price;
        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;
        product.stock -= qty;
        if (product.stock === 0) product.availability = "inactive";
        product.updatedAt = now();

        lineItems.push({
          productId: product.id,
          sellerId: product.sellerId,
          name: product.name,
          image: (product.images && product.images[0]) || null,
          quantity: qty,
          unitPrice,
          lineTotal,
          fulfilmentStatus: "pending",
        });
      }

      const delivery = subtotal >= 999 ? 0 : subtotal > 0 ? 49 : 0;
      order = {
        id: `SN-${Date.now()}`,
        isDemo: false,
        customerId: req.user.sub,
        customerName,
        mobileLast4: mobile.replace(/\D/g, "").slice(-4),
        city,
        state,
        postalCode,
        // Full address kept server-side for fulfilment; not returned to other sellers
        address,
        paymentMethod,
        status: "confirmed",
        items: lineItems,
        subtotal,
        delivery,
        total: subtotal + delivery,
        createdAt: now(),
      };
      data.orders.unshift(order);
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const safe = { ...order };
  delete safe.address;
  res.status(201).json({ order: safe });
});

app.get("/api/orders/mine", authRequired, (req, res) => {
  const orders = db
    .read()
    .orders.filter((o) => o.customerId === req.user.sub)
    .map((o) => {
      const copy = { ...o };
      delete copy.address;
      return copy;
    });
  res.json({ orders });
});

app.get("/api/admin/orders", authRequired, requireRole("admin"), (_req, res) => {
  res.json({ orders: db.read().orders });
});

app.patch(
  "/api/admin/orders/:id/status",
  authRequired,
  requireRole("admin"),
  (req, res) => {
    const status = String(req.body.status || "").trim();
    const allowed = ["confirmed", "processing", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid order status." });
    }
    let order;
    db.update((data) => {
      const o = data.orders.find((x) => x.id === req.params.id);
      if (!o) return;
      o.status = status;
      order = o;
    });
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json({ order });
  }
);

app.get("/api/seller/orders", authRequired, requireApprovedSeller, (req, res) => {
  const sellerId = req.user.sub;
  const orders = db
    .read()
    .orders.map((o) => {
      const items = (o.items || []).filter((i) => i.sellerId === sellerId);
      if (!items.length) return null;
      return {
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        city: o.city,
        state: o.state,
        items,
        sellerSubtotal: items.reduce((s, i) => s + i.lineTotal, 0),
      };
    })
    .filter(Boolean);
  res.json({ orders });
});

app.patch(
  "/api/seller/orders/:orderId/items/:productId/fulfilment",
  authRequired,
  requireApprovedSeller,
  (req, res) => {
    const status = String(req.body.fulfilmentStatus || "").trim();
    const allowed = ["pending", "packed", "shipped", "delivered"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid fulfilment status." });
    }
    let updated;
    try {
      db.update((data) => {
        const o = data.orders.find((x) => x.id === req.params.orderId);
        if (!o) throw Object.assign(new Error("Order not found."), { status: 404 });
        const item = (o.items || []).find(
          (i) => i.productId === req.params.productId && i.sellerId === req.user.sub
        );
        if (!item) throw Object.assign(new Error("Line item not found."), { status: 404 });
        item.fulfilmentStatus = status;
        updated = item;
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
    res.json({ item: updated });
  }
);

// ---------------------------------------------------------------------------
// Admin dashboard stats / sales
// ---------------------------------------------------------------------------
app.get("/api/admin/stats", authRequired, requireRole("admin"), (_req, res) => {
  const data = db.read();
  const sellers = data.users.filter((u) => u.role === "seller");
  const customers = data.users.filter((u) => u.role === "customer");
  const revenue = data.orders.reduce((s, o) => s + (o.total || 0), 0);
  const pendingProducts = data.products.filter((p) => p.approvalStatus === "pending").length;
  const pendingSellers = sellers.filter((s) => s.sellerStatus === "pending").length;

  res.json({
    totals: {
      products: data.products.length,
      sellers: sellers.length,
      customers: customers.length,
      orders: data.orders.length,
      revenue,
      pendingProducts,
      pendingSellers,
    },
  });
});

app.get("/api/seller/stats", authRequired, requireApprovedSeller, (req, res) => {
  const data = db.read();
  const myProducts = data.products.filter((p) => p.sellerId === req.user.sub);
  let earnings = 0;
  let orderCount = 0;
  data.orders.forEach((o) => {
    const mine = (o.items || []).filter((i) => i.sellerId === req.user.sub);
    if (mine.length) {
      orderCount += 1;
      earnings += mine.reduce((s, i) => s + i.lineTotal, 0);
    }
  });
  res.json({
    totals: {
      products: myProducts.length,
      pending: myProducts.filter((p) => p.approvalStatus === "pending").length,
      approved: myProducts.filter((p) => p.approvalStatus === "approved").length,
      rejected: myProducts.filter((p) => p.approvalStatus === "rejected").length,
      orders: orderCount,
      earnings,
    },
  });
});

// ---------------------------------------------------------------------------
// Static site (preserve existing frontend)
// ---------------------------------------------------------------------------
app.use(express.static(ROOT));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error." });
});

async function ensureSeeded() {
  const store = db.read();
  if (store.users.length && store.products.length) return;
  console.log("Database empty — running seed…");
  require("child_process").execSync("node seed.js", {
    cwd: __dirname,
    stdio: "inherit",
  });
}

ensureSeeded()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ShopNest running at http://localhost:${PORT}`);
      console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
      console.log(`Seller panel: http://localhost:${PORT}/seller.html`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
