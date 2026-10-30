/**
 * ShopNest — Vanilla JavaScript (ES6+)
 * Customer storefront. Products/orders sync with the Express API when available.
 * Cart/wishlist remain in localStorage; checkout stock & prices are validated on the server.
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const STORAGE_CART = "shopnest_demo_cart";
  const STORAGE_WISHLIST = "shopnest_demo_wishlist";
  const STORAGE_ORDERS = "shopnest_demo_orders";
  const STORAGE_SESSION = "shopnest_demo_session"; // legacy demo only — prefer ShopNestAPI session
  const STORAGE_LAST_ORDER = "shopnest_demo_last_order_id";

  const DELIVERY_CHARGE = 49;
  const FREE_DELIVERY_MIN = 999; // demo rule: free delivery at/above this subtotal

  const CATEGORY_LABELS = {
    mobile: "Mobile Accessories",
    "home-kitchen": "Home and Kitchen",
    fashion: "Fashion Accessories",
    sarees: "Sarees and Clothing",
    car: "Car Accessories",
  };

  // Live catalog (filled from /api/products). Fallback used only if API is unreachable.
  let PRODUCTS = [];
  let catalogFromApi = false;

  // ---------------------------------------------------------------------------
  // Offline fallback catalog (used only when the server is down)
  // ---------------------------------------------------------------------------
  const FALLBACK_PRODUCTS = [
    {
      id: "demo-001",
      name: "Fast Charge USB-C Cable",
      category: "mobile",
      description: "Demo 1-metre USB-C cable for practice listings. Not a live product.",
      price: 299,
      originalPrice: null,
      discountLabel: null,
      image: "https://placehold.co/280x280?text=USB-C+Cable",
      stock: 25,
      isNewArrival: false,
    },
    {
      id: "demo-002",
      name: "Non-Stick Frying Pan (24 cm)",
      category: "home-kitchen",
      description: "Demo non-stick pan for Home and Kitchen layout. Demo stock only.",
      price: 899,
      originalPrice: 999,
      discountLabel: "10% off",
      image: "https://placehold.co/280x280?text=Non-stick+Pan",
      stock: 12,
      isNewArrival: false,
    },
    {
      id: "demo-003",
      name: "Classic Leather Belt",
      category: "fashion",
      description: "Demo fashion accessory listing for ShopNest UI practice.",
      price: 649,
      originalPrice: null,
      discountLabel: null,
      image: "https://placehold.co/280x280?text=Leather+Belt",
      stock: 18,
      isNewArrival: false,
    },
    {
      id: "demo-004",
      name: "Handloom Cotton Saree",
      category: "sarees",
      description: "Demo saree listing for traditional clothing category practice.",
      price: 1499,
      originalPrice: 1799,
      discountLabel: "Festive offer",
      image: "https://placehold.co/280x280?text=Cotton+Saree",
      stock: 8,
      isNewArrival: false,
    },
    {
      id: "demo-005",
      name: "Dashboard Phone Mount",
      category: "car",
      description: "Demo car accessory for dashboard phone mounting layouts.",
      price: 449,
      originalPrice: null,
      discountLabel: null,
      image: "https://placehold.co/280x280?text=Phone+Mount",
      stock: 30,
      isNewArrival: false,
    },
    {
      id: "demo-006",
      name: "Silicone Earbuds Case",
      category: "mobile",
      description: "Demo protective case for wireless earbuds. Sample stock quantity.",
      price: 199,
      originalPrice: null,
      discountLabel: null,
      image: "https://placehold.co/280x280?text=Earbuds+Case",
      stock: 40,
      isNewArrival: false,
    },
    {
      id: "demo-007",
      name: "Airtight Storage Jar Set (3 pc)",
      category: "home-kitchen",
      description: "Demo kitchen storage set shown in New Arrivals.",
      price: 549,
      originalPrice: null,
      discountLabel: null,
      image: "https://placehold.co/240x240?text=Storage+Jars",
      stock: 15,
      isNewArrival: true,
    },
    {
      id: "demo-008",
      name: "UV Protection Sunglasses",
      category: "fashion",
      description: "Demo sunglasses listing for fashion accessories practice.",
      price: 799,
      originalPrice: null,
      discountLabel: null,
      image: "https://placehold.co/240x240?text=Sunglasses",
      stock: 20,
      isNewArrival: true,
    },
    {
      id: "demo-009",
      name: "Backseat Car Organizer",
      category: "car",
      description: "Demo car seat organizer for New Arrivals and car accessories.",
      price: 699,
      originalPrice: null,
      discountLabel: "New",
      image: "https://placehold.co/240x240?text=Car+Organizer",
      stock: 10,
      isNewArrival: true,
    },
    {
      id: "demo-010",
      name: "Wireless Power Bank 10000mAh",
      category: "mobile",
      description: "Extra demo mobile accessory for search and filter testing.",
      price: 1299,
      originalPrice: 1499,
      discountLabel: "13% off",
      image: "https://placehold.co/280x280?text=Power+Bank",
      stock: 14,
      isNewArrival: false,
    },
  ];

  // UI filter state (home page)
  const catalogState = {
    category: "all",
    search: "",
    sort: "default",
  };

  function normalizeApiProduct(p) {
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory || null,
      description: p.description || "",
      price: Number(p.price),
      originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
      discountLabel: p.discountLabel || null,
      image: p.image || (p.images && p.images[0]) || "https://placehold.co/280x280?text=Product",
      stock: Number(p.stock) || 0,
      isNewArrival: !!p.isNewArrival,
      sellerId: p.sellerId || null,
    };
  }

  async function loadCatalogFromApi() {
    if (!window.ShopNestAPI) {
      PRODUCTS = FALLBACK_PRODUCTS.slice();
      catalogFromApi = false;
      return;
    }
    try {
      const data = await window.ShopNestAPI.getProducts();
      const list = Array.isArray(data.products) ? data.products.map(normalizeApiProduct) : [];
      PRODUCTS = list;
      catalogFromApi = true;
      if (!list.length) {
        showToast("No approved products in the catalog yet.", "info");
      }
    } catch (err) {
      console.warn("API catalog unavailable, using offline fallback:", err.message);
      PRODUCTS = FALLBACK_PRODUCTS.slice();
      catalogFromApi = false;
      showToast("Store API offline — showing local fallback products.", "error");
    }
  }

  // ---------------------------------------------------------------------------
  // Safe helpers
  // ---------------------------------------------------------------------------
  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function getProductById(id) {
    return PRODUCTS.find((p) => p.id === id) || null;
  }

  function formatINR(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "₹0";
    return "₹" + Math.round(n).toLocaleString("en-IN");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Prefer textContent / createElement — avoid unsafe innerHTML with user data. */
  function setText(el, text) {
    if (el) el.textContent = text == null ? "" : String(text);
  }

  function showToast(message, type = "info") {
    let host = $("#shopnest-toast");
    if (!host) {
      host = document.createElement("div");
      host.id = "shopnest-toast";
      host.className = "shopnest-toast";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    host.textContent = message;
    host.dataset.type = type;
    host.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      host.hidden = true;
    }, 3200);
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("ShopNest: invalid storage for", key, err);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error("ShopNest: could not save", key, err);
      showToast("Could not save demo data in this browser.", "error");
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Cart (localStorage) — validate before use
  // ---------------------------------------------------------------------------
  function validateCartItems(items) {
    if (!Array.isArray(items)) return [];
    const cleaned = [];

    items.forEach((item) => {
      if (!item || typeof item.productId !== "string") return;
      const product = getProductById(item.productId);
      if (!product) return;

      let qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) qty = 1;
      if (qty > product.stock) qty = product.stock;
      if (qty < 1) return;

      cleaned.push({ productId: product.id, quantity: qty });
    });

    return cleaned;
  }

  function getCart() {
    return validateCartItems(readStorage(STORAGE_CART, []));
  }

  function saveCart(items) {
    const valid = validateCartItems(items);
    writeStorage(STORAGE_CART, valid);
    updateCartCount();
    return valid;
  }

  function getCartItemCount() {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
  }

  function updateCartCount() {
    const count = getCartItemCount();
    $$("#cart-item-count, .cart-count").forEach((el) => {
      setText(el, String(count));
    });
  }

  function calcDelivery(subtotal) {
    if (subtotal <= 0) return 0;
    if (subtotal >= FREE_DELIVERY_MIN) return 0;
    return DELIVERY_CHARGE;
  }

  function getCartTotals() {
    const cart = getCart();
    let subtotal = 0;
    const lines = [];

    cart.forEach((item) => {
      const product = getProductById(item.productId);
      if (!product) return;
      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;
      lines.push({ product, quantity: item.quantity, lineTotal });
    });

    const delivery = calcDelivery(subtotal);
    return { lines, subtotal, delivery, total: subtotal + delivery };
  }

  function addToCart(productId, quantity = 1) {
    const product = getProductById(productId);
    if (!product) {
      showToast("Product not found.", "error");
      return false;
    }
    if (product.stock < 1) {
      showToast("This demo product is out of stock.", "error");
      return false;
    }

    let qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      showToast("Please enter a valid quantity.", "error");
      return false;
    }

    const cart = getCart();
    const existing = cart.find((i) => i.productId === productId);
    const currentQty = existing ? existing.quantity : 0;
    const nextQty = currentQty + qty;

    if (nextQty > product.stock) {
      showToast(
        `Only ${product.stock} demo units available for "${product.name}".`,
        "error"
      );
      return false;
    }

    if (existing) {
      existing.quantity = nextQty;
    } else {
      cart.push({ productId, quantity: qty });
    }

    saveCart(cart);
    showToast(`Added "${product.name}" to cart (demo).`, "success");
    return true;
  }

  function setCartQuantity(productId, quantity) {
    const product = getProductById(productId);
    if (!product) return;

    let qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      removeFromCart(productId);
      return;
    }
    if (qty > product.stock) {
      qty = product.stock;
      showToast(`Quantity limited to demo stock (${product.stock}).`, "error");
    }

    const cart = getCart();
    const item = cart.find((i) => i.productId === productId);
    if (!item) return;
    item.quantity = qty;
    saveCart(cart);
  }

  function changeCartQuantity(productId, delta) {
    const cart = getCart();
    const item = cart.find((i) => i.productId === productId);
    if (!item) return;
    setCartQuantity(productId, item.quantity + delta);
  }

  function removeFromCart(productId) {
    const cart = getCart().filter((i) => i.productId !== productId);
    saveCart(cart);
    showToast("Item removed from cart.", "info");
  }

  // ---------------------------------------------------------------------------
  // Wishlist
  // ---------------------------------------------------------------------------
  function getWishlist() {
    const raw = readStorage(STORAGE_WISHLIST, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter((id) => typeof id === "string" && getProductById(id));
  }

  function saveWishlist(ids) {
    writeStorage(STORAGE_WISHLIST, ids);
  }

  function toggleWishlist(productId) {
    const product = getProductById(productId);
    if (!product) {
      showToast("Product not found.", "error");
      return;
    }
    const list = getWishlist();
    const index = list.indexOf(productId);
    if (index >= 0) {
      list.splice(index, 1);
      saveWishlist(list);
      showToast(`Removed "${product.name}" from wishlist.`, "info");
    } else {
      list.push(productId);
      saveWishlist(list);
      showToast(`Saved "${product.name}" to wishlist (demo).`, "success");
    }
    renderWishlist();
  }

  function removeFromWishlist(productId) {
    saveWishlist(getWishlist().filter((id) => id !== productId));
    renderWishlist();
    showToast("Removed from wishlist.", "info");
  }

  // ---------------------------------------------------------------------------
  // FEATURE 2–5: Filter, search, sort, render products
  // ---------------------------------------------------------------------------
  function getFilteredProducts() {
    let list = PRODUCTS.slice();

    if (catalogState.category && catalogState.category !== "all") {
      list = list.filter((p) => p.category === catalogState.category);
    }

    const q = catalogState.search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    switch (catalogState.sort) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        break;
    }

    return list;
  }

  function createProductCard(product) {
    const article = document.createElement("article");
    article.className = "product-card";
    article.dataset.productId = product.id;
    article.dataset.category = product.category;

    if (product.discountLabel) {
      const badge = document.createElement("span");
      badge.className = "discount-label";
      badge.textContent = product.discountLabel;
      article.appendChild(badge);
    }

    const img = document.createElement("img");
    img.src = product.image;
    img.alt = product.name;
    img.width = 280;
    img.height = 280;
    img.loading = "lazy";
    article.appendChild(img);

    const title = document.createElement("h3");
    title.className = "product-name";
    title.textContent = product.name;
    article.appendChild(title);

    const priceP = document.createElement("p");
    priceP.className = "product-price";
    const priceSpan = document.createElement("span");
    priceSpan.className = "price";
    priceSpan.textContent = formatINR(product.price);
    priceP.appendChild(priceSpan);
    if (product.originalPrice && product.originalPrice > product.price) {
      const was = document.createElement("s");
      was.className = "was-price";
      was.textContent = formatINR(product.originalPrice);
      priceP.appendChild(document.createTextNode(" "));
      priceP.appendChild(was);
    }
    article.appendChild(priceP);

    const actions = document.createElement("div");
    actions.className = "product-actions";

    const details = document.createElement("a");
    details.className = "btn";
    details.href = `product.html?id=${encodeURIComponent(product.id)}`;
    details.textContent = "View Details";
    actions.appendChild(details);

    const cartBtn = document.createElement("button");
    cartBtn.type = "button";
    cartBtn.className = "btn add-to-cart";
    cartBtn.dataset.productId = product.id;
    cartBtn.textContent = "Add to Cart";
    actions.appendChild(cartBtn);

    const wishBtn = document.createElement("button");
    wishBtn.type = "button";
    wishBtn.className = "btn add-to-wishlist";
    wishBtn.dataset.productId = product.id;
    wishBtn.textContent = getWishlist().includes(product.id)
      ? "Remove from Wishlist"
      : "Add to Wishlist";
    actions.appendChild(wishBtn);

    article.appendChild(actions);
    return article;
  }

  function renderFeaturedProducts() {
    const grid = $("#featured-product-grid");
    const status = $("#product-status");
    if (!grid) return;

    const products = getFilteredProducts();
    grid.replaceChildren();

    if (products.length === 0) {
      if (status) {
        const hasSearch = catalogState.search.trim().length > 0;
        setText(
          status,
          hasSearch
            ? `No products match “${catalogState.search.trim()}”. Try another search or clear the search.`
            : "No products available in this category."
        );
      }
      return;
    }

    if (status) {
      const parts = [`Showing ${products.length} demo product(s)`];
      if (catalogState.category !== "all") {
        parts.push(`in ${CATEGORY_LABELS[catalogState.category] || catalogState.category}`);
      }
      if (catalogState.search.trim()) {
        parts.push(`matching “${catalogState.search.trim()}”`);
      }
      setText(status, parts.join(" "));
    }

    products.forEach((p) => grid.appendChild(createProductCard(p)));
  }

  function renderNewArrivals() {
    const grid = $("#new-arrivals-grid");
    if (!grid) return;
    grid.replaceChildren();
    PRODUCTS.filter((p) => p.isNewArrival).forEach((p) => {
      grid.appendChild(createProductCard(p));
    });
  }

  function syncToolbarFromState() {
    const filter = $("#category-filter");
    const sort = $("#sort-products");
    const clearBtn = $("#clear-search-btn");
    const searchInput = $("#site-search");

    if (filter) filter.value = catalogState.category || "all";
    if (sort) sort.value = catalogState.sort || "default";
    if (searchInput && catalogState.search) searchInput.value = catalogState.search;
    if (clearBtn) clearBtn.hidden = !catalogState.search.trim();
  }

  function applyCatalogAndRender() {
    syncToolbarFromState();
    renderFeaturedProducts();
  }

  // ---------------------------------------------------------------------------
  // Wishlist UI
  // ---------------------------------------------------------------------------
  function renderWishlist() {
    const empty = $("#wishlist-empty");
    const list = $("#wishlist-list");
    if (!list) return;

    const ids = getWishlist();
    list.replaceChildren();

    if (ids.length === 0) {
      if (empty) empty.hidden = false;
      list.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    list.hidden = false;

    ids.forEach((id) => {
      const product = getProductById(id);
      if (!product) return;

      const li = document.createElement("li");
      li.className = "wishlist-item";

      const card = createProductCard(product);
      // Replace wishlist button label already set in createProductCard
      li.appendChild(card);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-remove";
      removeBtn.dataset.removeWishlist = product.id;
      removeBtn.textContent = "Remove from Wishlist";
      li.appendChild(removeBtn);

      list.appendChild(li);
    });
  }

  // ---------------------------------------------------------------------------
  // Cart page
  // ---------------------------------------------------------------------------
  function renderCartPage() {
    const body = $("#cart-body");
    if (!body) return;

    const empty = $("#cart-empty");
    const wrapper = $("#cart-table-wrapper");
    const summary = $(".cart-summary");
    const { lines, subtotal, delivery, total } = getCartTotals();

    body.replaceChildren();

    if (lines.length === 0) {
      if (empty) empty.hidden = false;
      if (wrapper) wrapper.hidden = true;
      if (summary) summary.hidden = true;
      setText($("#cart-subtotal"), formatINR(0));
      setText($("#cart-delivery"), formatINR(0));
      setText($("#cart-final-total"), formatINR(0));
      return;
    }

    if (empty) empty.hidden = true;
    if (wrapper) wrapper.hidden = false;
    if (summary) summary.hidden = false;

    lines.forEach(({ product, quantity, lineTotal }) => {
      const tr = document.createElement("tr");
      tr.className = "cart-row";
      tr.dataset.productId = product.id;

      const tdProduct = document.createElement("td");
      tdProduct.className = "cart-product";
      const img = document.createElement("img");
      img.src = product.image;
      img.alt = "";
      img.width = 80;
      img.height = 80;
      const name = document.createElement("span");
      name.className = "cart-product-name";
      name.textContent = product.name;
      tdProduct.append(img, name);

      const tdPrice = document.createElement("td");
      tdPrice.className = "cart-unit-price";
      tdPrice.dataset.unitPrice = String(product.price);
      tdPrice.textContent = formatINR(product.price);

      const tdQty = document.createElement("td");
      tdQty.className = "cart-quantity";
      const label = document.createElement("label");
      label.className = "visually-hidden";
      label.htmlFor = `qty-${product.id}`;
      label.textContent = `Quantity for ${product.name}`;

      const dec = document.createElement("button");
      dec.type = "button";
      dec.className = "qty-decrease";
      dec.setAttribute("aria-label", "Decrease quantity");
      dec.dataset.productId = product.id;
      dec.textContent = "−";

      const input = document.createElement("input");
      input.type = "number";
      input.id = `qty-${product.id}`;
      input.className = "qty-input";
      input.min = "1";
      input.max = String(product.stock);
      input.value = String(quantity);
      input.dataset.productId = product.id;

      const inc = document.createElement("button");
      inc.type = "button";
      inc.className = "qty-increase";
      inc.setAttribute("aria-label", "Increase quantity");
      inc.dataset.productId = product.id;
      inc.textContent = "+";

      tdQty.append(label, dec, input, inc);

      const tdLine = document.createElement("td");
      tdLine.className = "cart-line-total";
      tdLine.textContent = formatINR(lineTotal);

      const tdRemove = document.createElement("td");
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-remove";
      removeBtn.dataset.removeCart = product.id;
      removeBtn.setAttribute("aria-label", `Remove ${product.name} from cart`);
      removeBtn.textContent = "Remove";
      tdRemove.appendChild(removeBtn);

      tr.append(tdProduct, tdPrice, tdQty, tdLine, tdRemove);
      body.appendChild(tr);
    });

    setText($("#cart-subtotal"), formatINR(subtotal));
    setText($("#cart-delivery"), formatINR(delivery));
    setText($("#cart-final-total"), formatINR(total));
  }

  // ---------------------------------------------------------------------------
  // Product details page
  // ---------------------------------------------------------------------------
  function initProductDetailsPage() {
    const details = $("#product-details");
    if (!details) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "demo-001";
    const product = getProductById(id);

    if (!product) {
      setText($("#product-title"), "Product not found");
      setText(
        $("#product-description"),
        "This demo product ID is missing from the catalog. Return home and pick another item."
      );
      showToast("Product not found.", "error");
      return;
    }

    const img = $("#product-image");
    if (img) {
      img.src = product.image;
      img.alt = product.name;
    }

    setText($("#breadcrumb-product-name"), product.name);
    setText($("#product-category"), `Category: ${CATEGORY_LABELS[product.category] || product.category}`);
    setText($("#product-title"), product.name);
    setText($("#product-id-display"), product.id);
    setText($("#product-price"), formatINR(product.price));
    setText($("#product-description"), product.description);
    setText(
      $("#product-availability"),
      product.stock > 0
        ? `In stock (demo): ${product.stock} units`
        : "Out of stock (demo)"
    );

    const discount = $("#product-discount");
    const was = $("#product-was-price");
    if (discount) {
      if (product.discountLabel) {
        discount.hidden = false;
        setText(discount, product.discountLabel);
      } else {
        discount.hidden = true;
      }
    }
    if (was) {
      if (product.originalPrice && product.originalPrice > product.price) {
        was.hidden = false;
        setText(was, formatINR(product.originalPrice));
      } else {
        was.hidden = true;
      }
    }

    const qtyInput = $("#product-quantity");
    if (qtyInput) {
      qtyInput.min = "1";
      qtyInput.max = String(Math.max(1, product.stock));
      qtyInput.value = "1";
    }

    const addCart = $("#product-add-to-cart");
    if (addCart) {
      addCart.dataset.productId = product.id;
      addCart.disabled = product.stock < 1;
    }
    const addWish = $("#product-add-to-wishlist");
    if (addWish) {
      addWish.dataset.productId = product.id;
      addWish.textContent = getWishlist().includes(product.id)
        ? "Remove from Wishlist"
        : "Add to Wishlist";
    }
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------
  function renderCheckoutSummary() {
    const list = $("#checkout-items");
    if (!list) return;

    const { lines, subtotal, delivery, total } = getCartTotals();
    list.replaceChildren();

    if (lines.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Your cart is empty.";
      list.appendChild(li);
    } else {
      lines.forEach(({ product, quantity, lineTotal }) => {
        const li = document.createElement("li");
        const left = document.createElement("span");
        left.textContent = `${product.name} × ${quantity}`;
        const right = document.createElement("span");
        right.textContent = formatINR(lineTotal);
        li.append(left, right);
        list.appendChild(li);
      });
    }

    setText($("#checkout-subtotal"), formatINR(subtotal));
    setText($("#checkout-delivery"), formatINR(delivery));
    setText($("#checkout-total"), formatINR(total));
  }

  function showFormErrors(container, messages) {
    if (!container) return;
    if (!messages.length) {
      container.hidden = true;
      setText(container, "");
      return;
    }
    container.hidden = false;
    // Safe: text only, joined with newlines
    setText(container, messages.join(" "));
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  function isValidMobile(mobile) {
    const digits = String(mobile).replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }

  function isValidPostal(code) {
    return /^[1-9][0-9]{5}$/.test(String(code).trim()) || /^[A-Za-z0-9\s-]{3,10}$/.test(String(code).trim());
  }

  function placeDemoOrder(formData) {
    const totals = getCartTotals();
    if (totals.lines.length === 0) {
      return { ok: false, errors: ["Your cart is empty. Add demo products before checkout."] };
    }

    const orderId = `SN-DEMO-${Date.now()}`;
    const order = {
      id: orderId,
      isDemo: true,
      createdAt: new Date().toISOString(),
      status: "Confirmed (demo)",
      paymentMethod: "Cash on Delivery (demo)",
      // Minimal delivery snapshot — no payment secrets; avoid storing full address long-term if preferred
      customerName: formData.customerName,
      city: formData.city,
      state: formData.state,
      // Mask mobile for local history display
      mobileLast4: String(formData.mobile).replace(/\D/g, "").slice(-4),
      items: totals.lines.map(({ product, quantity, lineTotal }) => ({
        productId: product.id,
        name: product.name,
        image: product.image,
        quantity,
        unitPrice: product.price,
        lineTotal,
      })),
      subtotal: totals.subtotal,
      delivery: totals.delivery,
      total: totals.total,
    };

    const orders = readStorage(STORAGE_ORDERS, []);
    const list = Array.isArray(orders) ? orders : [];
    list.unshift(order);
    writeStorage(STORAGE_ORDERS, list.slice(0, 20)); // keep recent demos only
    writeStorage(STORAGE_LAST_ORDER, orderId);
    saveCart([]); // clear cart after successful demo order

    return { ok: true, order };
  }

  function initCheckoutPage() {
    const form = $("#checkout-form");
    if (!form) return;

    if (getCart().length === 0) {
      showFormErrors($("#checkout-errors"), [
        "Your cart is empty. Add products before placing a demo order.",
      ]);
      const btn = $("#place-order-btn");
      if (btn) btn.disabled = true;
    }

    renderCheckoutSummary();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errors = [];

      const customerName = $("#customer-name")?.value.trim() || "";
      const mobile = $("#mobile-number")?.value.trim() || "";
      const address = $("#address")?.value.trim() || "";
      const city = $("#city")?.value.trim() || "";
      const state = $("#state")?.value.trim() || "";
      const postal = $("#postal-code")?.value.trim() || "";
      const payment = form.querySelector('input[name="payment_method"]:checked');

      if (!customerName) errors.push("Customer name is required.");
      if (!mobile || !isValidMobile(mobile)) errors.push("Enter a valid mobile number.");
      if (!address) errors.push("Delivery address is required.");
      if (!city) errors.push("City is required.");
      if (!state) errors.push("State is required.");
      if (!postal || !isValidPostal(postal)) errors.push("Enter a valid postal code.");
      if (!payment) errors.push("Select a payment method.");
      if (getCart().length === 0) errors.push("Cart is empty.");

      const errorBox = $("#checkout-errors");
      if (errors.length) {
        showFormErrors(errorBox, errors);
        showToast("Please fix the highlighted checkout fields.", "error");
        return;
      }

      showFormErrors(errorBox, []);

      // Prefer server order (authoritative prices + stock deduction)
      if (window.ShopNestAPI && window.ShopNestAPI.getToken() && catalogFromApi) {
        try {
          const payload = {
            customerName,
            mobile,
            address,
            city,
            state,
            postalCode: postal,
            paymentMethod: payment.value === "cod" ? "Cash on Delivery" : String(payment.value),
            items: getCart().map((i) => ({ productId: i.productId, quantity: i.quantity })),
          };
          const { order } = await window.ShopNestAPI.placeOrder(payload);
          saveCart([]);
          writeStorage(STORAGE_LAST_ORDER, order.id);
          // Keep a local copy for the confirmation page when offline history is needed
          const localOrders = readStorage(STORAGE_ORDERS, []);
          const list = Array.isArray(localOrders) ? localOrders : [];
          list.unshift({
            id: order.id,
            isDemo: false,
            status: order.status,
            paymentMethod: order.paymentMethod,
            total: order.total,
            items: order.items,
            createdAt: order.createdAt,
          });
          writeStorage(STORAGE_ORDERS, list.slice(0, 20));
          window.location.href = `orders.html?order=${encodeURIComponent(order.id)}`;
          return;
        } catch (err) {
          showFormErrors(errorBox, [err.message || "Checkout failed on server."]);
          showToast(err.message || "Checkout failed.", "error");
          return;
        }
      }

      if (!window.ShopNestAPI || !window.ShopNestAPI.getToken()) {
        showFormErrors(errorBox, [
          "Please log in before checkout so the server can validate stock and create your order.",
        ]);
        showToast("Login required for checkout.", "error");
        return;
      }

      // Fallback local demo order only if API catalog was unavailable
      const result = placeDemoOrder({
        customerName,
        mobile,
        address,
        city,
        state,
        postal,
      });

      if (!result.ok) {
        showFormErrors(errorBox, result.errors || ["Could not create demo order."]);
        return;
      }

      window.location.href = `orders.html?order=${encodeURIComponent(result.order.id)}`;
    });
  }

  // ---------------------------------------------------------------------------
  // Orders / confirmation
  // ---------------------------------------------------------------------------
  function findOrder(orderId) {
    const orders = readStorage(STORAGE_ORDERS, []);
    if (!Array.isArray(orders)) return null;
    return orders.find((o) => o && o.id === orderId) || null;
  }

  function renderOrderConfirmation(order) {
    const section = $("#order-confirmation");
    if (!section) return;

    if (!order) {
      setText($("#confirmation-heading"), "No demo order to show");
      setText(
        $("#confirmation-message"),
        "Place a demo order from checkout, or pick an order from the history below."
      );
      setText($("#order-id"), "—");
      setText($("#order-status"), "—");
      setText($("#order-payment"), "—");
      setText($("#order-total"), "—");
      const items = $("#order-items");
      if (items) items.replaceChildren();
      return;
    }

    setText($("#confirmation-heading"), "Thank you — demo order saved locally");
    setText(
      $("#confirmation-message"),
      "This is a DEMO order confirmation only. No real order was placed and no payment was collected."
    );
    setText($("#order-id"), order.id);
    setText($("#order-status"), order.status || "Confirmed (demo)");
    setText($("#order-payment"), order.paymentMethod || "Cash on Delivery (demo)");
    setText($("#order-total"), formatINR(order.total));

    const list = $("#order-items");
    if (!list) return;
    list.replaceChildren();

    (order.items || []).forEach((item) => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = item.image || "https://placehold.co/64x64?text=Item";
      img.alt = "";
      img.width = 64;
      img.height = 64;
      const name = document.createElement("span");
      name.className = "order-item-name";
      name.textContent = item.name || "Product";
      const qty = document.createElement("span");
      qty.className = "order-item-qty";
      qty.textContent = `Qty: ${item.quantity}`;
      const price = document.createElement("span");
      price.className = "order-item-price";
      price.textContent = formatINR(item.lineTotal);
      li.append(img, name, qty, price);
      list.appendChild(li);
    });
  }

  function renderOrderHistory() {
    const host = $("#order-history-list");
    if (!host) return;

    const orders = readStorage(STORAGE_ORDERS, []);
    host.replaceChildren();

    if (!Array.isArray(orders) || orders.length === 0) {
      const p = document.createElement("p");
      p.className = "section-note";
      p.textContent = "No demo orders yet.";
      host.appendChild(p);
      return;
    }

    const ul = document.createElement("ul");
    ul.className = "order-history-list";

    orders.forEach((order) => {
      if (!order || !order.id) return;
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `orders.html?order=${encodeURIComponent(order.id)}`;
      link.textContent = `${order.id} — ${formatINR(order.total)} — ${order.status || "demo"}`;
      li.appendChild(link);
      ul.appendChild(li);
    });

    host.appendChild(ul);
  }

  function initOrdersPage() {
    if (!$("#order-confirmation") && !$("#order-history")) return;

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order") || readStorage(STORAGE_LAST_ORDER, null);
    const order = typeof orderId === "string" ? findOrder(orderId) : null;

    renderOrderConfirmation(order);
    renderOrderHistory();
  }

  // ---------------------------------------------------------------------------
  // Demo auth (NOT secure — prepare for Firebase later)
  // ---------------------------------------------------------------------------
  /**
   * Future Firebase hook (not used in local demo):
   * import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
   */
  const AuthAdapter = {
    // Placeholder for Firebase Authentication integration
    async loginDemo({ email, name }) {
      writeStorage(STORAGE_SESSION, {
        email,
        name: name || "",
        demo: true,
        loggedInAt: new Date().toISOString(),
      });
      return { ok: true };
    },
    logoutDemo() {
      localStorage.removeItem(STORAGE_SESSION);
    },
    getSession() {
      const s = readStorage(STORAGE_SESSION, null);
      if (!s || typeof s !== "object" || !s.email) return null;
      return s;
    },
  };

  function initLoginForm() {
    const form = $("#login-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errors = [];
      const email = $("#login-email")?.value.trim() || "";
      const password = $("#login-password")?.value || "";

      if (!email) errors.push("Email is required.");
      else if (!isValidEmail(email)) errors.push("Enter a valid email address.");
      if (!password) errors.push("Password is required.");

      showFormErrors($("#login-errors"), errors);
      const success = $("#login-success");
      if (success) {
        success.hidden = true;
        setText(success, "");
      }
      if (errors.length) return;

      if (!window.ShopNestAPI) {
        showFormErrors($("#login-errors"), ["API client missing. Serve the site via the ShopNest server."]);
        return;
      }

      try {
        const data = await window.ShopNestAPI.login(email, password);
        // Passwords never stored — only JWT in sessionStorage
        window.ShopNestAPI.setSession(data.token, data.user);
        AuthAdapter.loginDemo({ email: data.user.email, name: data.user.name });
        if (success) {
          success.hidden = false;
          setText(success, `Signed in as ${data.user.role}. Redirecting…`);
        }
        showToast("Logged in successfully.", "success");
        let dest = "index.html";
        if (data.user.role === "admin") dest = "admin.html";
        else if (data.user.role === "seller") dest = "seller.html";
        setTimeout(() => {
          window.location.href = dest;
        }, 800);
      } catch (err) {
        showFormErrors($("#login-errors"), [err.message || "Login failed."]);
      }
    });
  }

  function initRegisterForm() {
    const form = $("#register-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errors = [];
      const name = $("#register-name")?.value.trim() || "";
      const email = $("#register-email")?.value.trim() || "";
      const password = $("#register-password")?.value || "";
      const confirm = $("#register-confirm-password")?.value || "";

      if (!name) errors.push("Name is required.");
      if (!email) errors.push("Email is required.");
      else if (!isValidEmail(email)) errors.push("Enter a valid email address.");
      if (!password || password.length < 8) errors.push("Password must be at least 8 characters.");
      if (password !== confirm) errors.push("Password and confirm password must match.");

      showFormErrors($("#register-errors"), errors);
      const success = $("#register-success");
      if (success) {
        success.hidden = true;
        setText(success, "");
      }
      if (errors.length) return;

      if (!window.ShopNestAPI) {
        showFormErrors($("#register-errors"), ["API client missing. Start the ShopNest server."]);
        return;
      }

      try {
        const data = await window.ShopNestAPI.register(name, email, password);
        window.ShopNestAPI.setSession(data.token, data.user);
        if (success) {
          success.hidden = false;
          setText(success, "Account created on the server. Password is hashed server-side — not stored in the browser.");
        }
        showToast("Registration successful.", "success");
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1000);
      } catch (err) {
        showFormErrors($("#register-errors"), [err.message || "Registration failed."]);
      }
    });
  }

  function updateHeaderAuthLink() {
    const link = $("#header-login-link");
    if (!link || !window.ShopNestAPI) return;
    const user = window.ShopNestAPI.getUser();
    if (user) {
      link.textContent = user.name || "Account";
      if (user.role === "admin") link.href = "admin.html";
      else if (user.role === "seller") link.href = "seller.html";
      else link.href = "orders.html";
    }
  }

  // ---------------------------------------------------------------------------
  // Mobile nav toggle (works with existing #nav-toggle / #main-nav)
  // ---------------------------------------------------------------------------
  function initNavToggle() {
    const toggle = $("#nav-toggle");
    const nav = $("#main-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.textContent = open ? "Open menu" : "Close menu";
      nav.classList.toggle("is-open", !open);
    });
  }

  // ---------------------------------------------------------------------------
  // Global click / form listeners (delegation — one listener each)
  // ---------------------------------------------------------------------------
  function initGlobalEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const cartBtn = target.closest(".add-to-cart");
      if (cartBtn) {
        const id = cartBtn.dataset.productId;
        let qty = 1;
        if (cartBtn.id === "product-add-to-cart") {
          const input = $("#product-quantity");
          qty = input ? Number(input.value) : 1;
        }
        addToCart(id, qty);
        return;
      }

      const wishBtn = target.closest(".add-to-wishlist");
      if (wishBtn) {
        toggleWishlist(wishBtn.dataset.productId);
        // Refresh product grids so button labels update
        if ($("#featured-product-grid")) renderFeaturedProducts();
        if ($("#new-arrivals-grid")) renderNewArrivals();
        if ($("#product-add-to-wishlist")) {
          const pid = $("#product-add-to-wishlist").dataset.productId;
          $("#product-add-to-wishlist").textContent = getWishlist().includes(pid)
            ? "Remove from Wishlist"
            : "Add to Wishlist";
        }
        return;
      }

      const removeWish = target.closest("[data-remove-wishlist]");
      if (removeWish) {
        removeFromWishlist(removeWish.dataset.removeWishlist);
        return;
      }

      const removeCart = target.closest("[data-remove-cart]");
      if (removeCart) {
        removeFromCart(removeCart.dataset.removeCart);
        renderCartPage();
        return;
      }

      const dec = target.closest(".qty-decrease");
      if (dec && dec.dataset.productId) {
        changeCartQuantity(dec.dataset.productId, -1);
        renderCartPage();
        return;
      }

      const inc = target.closest(".qty-increase");
      if (inc && inc.dataset.productId) {
        changeCartQuantity(inc.dataset.productId, 1);
        renderCartPage();
        return;
      }

      const catLink = target.closest("[data-category]");
      if (catLink && $("#featured-product-grid")) {
        const cat = catLink.getAttribute("data-category");
        if (cat) {
          catalogState.category = cat;
          applyCatalogAndRender();
        }
      }

      if (target.id === "clear-search-btn" || target.closest("#clear-search-btn")) {
        catalogState.search = "";
        const input = $("#site-search");
        if (input) input.value = "";
        applyCatalogAndRender();
      }
    });

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.id === "category-filter") {
        catalogState.category = target.value || "all";
        applyCatalogAndRender();
      }
      if (target.id === "sort-products") {
        catalogState.sort = target.value || "default";
        applyCatalogAndRender();
      }
      if (target.classList.contains("qty-input") && target.dataset.productId) {
        setCartQuantity(target.dataset.productId, Number(target.value));
        renderCartPage();
      }
    });

    // Search forms (header on any page)
    $$(".search-form").forEach((form) => {
      form.addEventListener("submit", (event) => {
        const input = form.querySelector("#site-search, input[type='search']");
        const query = input ? input.value.trim() : "";

        // On product/cart pages, go home with query
        if (!$("#featured-product-grid")) {
          event.preventDefault();
          window.location.href = `index.html?q=${encodeURIComponent(query)}#featured-products`;
          return;
        }

        event.preventDefault();
        catalogState.search = query;
        applyCatalogAndRender();
        const section = $("#featured-products");
        if (section) section.scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function initHomeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) catalogState.search = q;

    const hash = window.location.hash.replace("#", "");
    const hashToCategory = {
      "category-mobile": "mobile",
      "category-home-kitchen": "home-kitchen",
      "category-fashion": "fashion",
      "category-sarees": "sarees",
      "category-car": "car",
    };
    if (hashToCategory[hash]) {
      catalogState.category = hashToCategory[hash];
    }
  }

  async function init() {
    try {
      updateCartCount();
      updateHeaderAuthLink();
      initNavToggle();
      initGlobalEvents();

      await loadCatalogFromApi();

      if ($("#featured-product-grid")) {
        initHomeFromUrl();
        applyCatalogAndRender();
        renderNewArrivals();
        renderWishlist();
      }

      initProductDetailsPage();
      renderCartPage();
      initCheckoutPage();
      initOrdersPage();
      initLoginForm();
      initRegisterForm();

      const year = $("#footer-year");
      if (year) setText(year, String(new Date().getFullYear()));
    } catch (err) {
      console.error("ShopNest init error:", err);
      showToast("Something went wrong loading the store.", "error");
    }
  }

  // Expose helpers for debugging / future modules
  window.ShopNest = {
    get PRODUCTS() {
      return PRODUCTS;
    },
    getCart,
    getWishlist,
    getCartTotals,
    AuthAdapter,
    formatINR,
    reloadCatalog: loadCatalogFromApi,
  };

  document.addEventListener("DOMContentLoaded", init);
})();
