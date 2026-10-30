/**
 * Simple JSON-file database for ShopNest local development.
 * Not for high-concurrency production — swap for SQLite/Firestore later.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "store.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultStore() {
  return {
    users: [],
    categories: [],
    products: [],
    orders: [],
  };
}

function read() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const empty = defaultStore();
    write(empty);
    return empty;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const data = JSON.parse(raw);
    return {
      users: Array.isArray(data.users) ? data.users : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      products: Array.isArray(data.products) ? data.products : [],
      orders: Array.isArray(data.orders) ? data.orders : [],
    };
  } catch (err) {
    console.error("DB read failed, resetting:", err.message);
    const empty = defaultStore();
    write(empty);
    return empty;
  }
}

function write(data) {
  ensureDir();
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, DB_PATH);
}

/** Atomic-ish update: read → mutate → write */
function update(mutator) {
  const data = read();
  const result = mutator(data);
  write(data);
  return result;
}

module.exports = { read, write, update, DB_PATH, DATA_DIR };
