/**
 * Seed ShopNest JSON database with admin + demo catalog.
 * Run: npm run seed (from server/)
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { write } = require("./db");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@shopnest.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";

const now = () => new Date().toISOString();

async function seed() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminId = "user-admin-001";

  const categories = [
    {
      id: "cat-mobile",
      slug: "mobile",
      name: "Mobile Accessories",
      subcategories: ["Cables", "Cases", "Power"],
    },
    {
      id: "cat-home",
      slug: "home-kitchen",
      name: "Home and Kitchen",
      subcategories: ["Cookware", "Storage"],
    },
    {
      id: "cat-fashion",
      slug: "fashion",
      name: "Fashion Accessories",
      subcategories: ["Belts", "Eyewear"],
    },
    {
      id: "cat-sarees",
      slug: "sarees",
      name: "Sarees and Clothing",
      subcategories: ["Sarees", "Kurtas"],
    },
    {
      id: "cat-car",
      slug: "car",
      name: "Car Accessories",
      subcategories: ["Mounts", "Organizers"],
    },
  ];

  const products = [
    {
      id: "demo-001",
      name: "Fast Charge USB-C Cable",
      description: "1-metre USB-C cable listing managed via ShopNest admin.",
      category: "mobile",
      subcategory: "Cables",
      price: 299,
      originalPrice: null,
      discountLabel: null,
      images: ["https://placehold.co/280x280?text=USB-C+Cable"],
      stock: 25,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-002",
      name: "Non-Stick Frying Pan (24 cm)",
      description: "Non-stick pan for Home and Kitchen.",
      category: "home-kitchen",
      subcategory: "Cookware",
      price: 899,
      originalPrice: 999,
      discountLabel: "10% off",
      images: ["https://placehold.co/280x280?text=Non-stick+Pan"],
      stock: 12,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-003",
      name: "Classic Leather Belt",
      description: "Fashion accessory belt.",
      category: "fashion",
      subcategory: "Belts",
      price: 649,
      originalPrice: null,
      discountLabel: null,
      images: ["https://placehold.co/280x280?text=Leather+Belt"],
      stock: 18,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-004",
      name: "Handloom Cotton Saree",
      description: "Traditional cotton saree listing.",
      category: "sarees",
      subcategory: "Sarees",
      price: 1499,
      originalPrice: 1799,
      discountLabel: "Festive offer",
      images: ["https://placehold.co/280x280?text=Cotton+Saree"],
      stock: 8,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-005",
      name: "Dashboard Phone Mount",
      description: "Car dashboard phone mount.",
      category: "car",
      subcategory: "Mounts",
      price: 449,
      originalPrice: null,
      discountLabel: null,
      images: ["https://placehold.co/280x280?text=Phone+Mount"],
      stock: 30,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-006",
      name: "Silicone Earbuds Case",
      description: "Protective earbuds case.",
      category: "mobile",
      subcategory: "Cases",
      price: 199,
      originalPrice: null,
      discountLabel: null,
      images: ["https://placehold.co/280x280?text=Earbuds+Case"],
      stock: 40,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-007",
      name: "Airtight Storage Jar Set (3 pc)",
      description: "Kitchen storage jar set.",
      category: "home-kitchen",
      subcategory: "Storage",
      price: 549,
      originalPrice: null,
      discountLabel: null,
      images: ["https://placehold.co/240x240?text=Storage+Jars"],
      stock: 15,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: true,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-008",
      name: "UV Protection Sunglasses",
      description: "Fashion sunglasses.",
      category: "fashion",
      subcategory: "Eyewear",
      price: 799,
      originalPrice: null,
      discountLabel: null,
      images: ["https://placehold.co/240x240?text=Sunglasses"],
      stock: 20,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: true,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-009",
      name: "Backseat Car Organizer",
      description: "Car seat organizer.",
      category: "car",
      subcategory: "Organizers",
      price: 699,
      originalPrice: null,
      discountLabel: "New",
      images: ["https://placehold.co/240x240?text=Car+Organizer"],
      stock: 10,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: true,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "demo-010",
      name: "Wireless Power Bank 10000mAh",
      description: "Portable power bank.",
      category: "mobile",
      subcategory: "Power",
      price: 1299,
      originalPrice: 1499,
      discountLabel: "13% off",
      images: ["https://placehold.co/280x280?text=Power+Bank"],
      stock: 14,
      availability: "active",
      sellerId: null,
      approvalStatus: "approved",
      rejectionReason: null,
      isNewArrival: false,
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  const store = {
    users: [
      {
        id: adminId,
        email: ADMIN_EMAIL.toLowerCase(),
        passwordHash,
        name: "ShopNest Admin",
        role: "admin",
        sellerStatus: "none",
        sellerDetails: null,
        active: true,
        createdAt: now(),
      },
    ],
    categories,
    products,
    orders: [],
  };

  write(store);
  console.log("Seed complete.");
  console.log("Admin login:", ADMIN_EMAIL, "/", ADMIN_PASSWORD);
  console.log("Products:", products.length);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
