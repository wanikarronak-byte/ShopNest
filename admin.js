/**
 * ShopNest Admin Panel — all actions call the server API with JWT.
 */
(() => {
  "use strict";

  const API = window.ShopNestAPI;
  const titles = {
    overview: "Dashboard",
    products: "Products",
    "pending-products": "Pending products",
    sellers: "Sellers",
    customers: "Customers",
    orders: "Orders",
    categories: "Categories",
  };

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function setText(el, t) {
    if (el) el.textContent = t == null ? "" : String(t);
  }

  function showErr(el, msg) {
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function inr(n) {
    return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  }

  function badge(status) {
    const s = String(status || "");
    const cls =
      s === "approved" || s === "active" || s === "confirmed" || s === "delivered"
        ? "badge-approved"
        : s === "pending" || s === "processing"
          ? "badge-pending"
          : "badge-rejected";
    return `<span class="badge ${cls}">${s}</span>`;
  }

  async function api(path, options) {
    return API.request(path, options);
  }

  function requireAdmin() {
    const user = API.getUser();
    return user && user.role === "admin" && API.getToken();
  }

  function showApp(loggedIn) {
    $("#gate-login").hidden = loggedIn;
    $("#dash-content").hidden = !loggedIn;
    if (loggedIn) {
      const u = API.getUser();
      setText($("#admin-user-label"), u ? `${u.name} (${u.email})` : "");
    }
  }

  async function verifySession() {
    if (!API.getToken()) {
      showApp(false);
      return false;
    }
    try {
      const { user } = await API.me();
      if (user.role !== "admin") {
        API.clearSession();
        showApp(false);
        showErr($("#admin-login-errors"), "This account is not an admin.");
        return false;
      }
      API.setSession(API.getToken(), user);
      showApp(true);
      return true;
    } catch {
      API.clearSession();
      showApp(false);
      return false;
    }
  }

  function switchView(view) {
    $$(".dash-nav-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    $$(".dash-panel").forEach((p) =>
      p.classList.toggle("is-visible", p.getAttribute("data-panel") === view)
    );
    setText($("#dash-title"), titles[view] || "Dashboard");
    $("#dash-sidebar")?.classList.remove("is-open");
    loadView(view);
  }

  function $$(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  async function loadView(view) {
    try {
      if (view === "overview") await loadStats();
      if (view === "products") await loadProducts();
      if (view === "pending-products") await loadPending();
      if (view === "sellers") await loadSellers();
      if (view === "customers") await loadCustomers();
      if (view === "orders") await loadOrders();
      if (view === "categories") await loadCategories();
    } catch (err) {
      alert(err.message || "Failed to load data");
    }
  }

  async function loadStats() {
    const { totals } = await api("/api/admin/stats");
    const grid = $("#stat-grid");
    grid.innerHTML = "";
    const cards = [
      ["Products", totals.products],
      ["Sellers", totals.sellers],
      ["Customers", totals.customers],
      ["Orders", totals.orders],
      ["Revenue", inr(totals.revenue)],
      ["Pending products", totals.pendingProducts],
      ["Pending sellers", totals.pendingSellers],
    ];
    cards.forEach(([label, value]) => {
      const div = document.createElement("div");
      div.className = "stat-card";
      div.innerHTML = `<strong></strong><span></span>`;
      div.querySelector("strong").textContent = value;
      div.querySelector("span").textContent = label;
      grid.appendChild(div);
    });
  }

  function renderProductRows(products, table, { pendingMode } = {}) {
    table.innerHTML = "";
    const thead = document.createElement("thead");
    thead.innerHTML =
      "<tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Seller</th><th>Actions</th></tr>";
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    products.forEach((p) => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = p.name;
      const tdCat = document.createElement("td");
      tdCat.textContent = p.category + (p.subcategory ? " / " + p.subcategory : "");
      const tdPrice = document.createElement("td");
      tdPrice.textContent = inr(p.price);
      const tdStock = document.createElement("td");
      tdStock.textContent = String(p.stock);
      const tdStatus = document.createElement("td");
      tdStatus.innerHTML = badge(p.approvalStatus) + " " + badge(p.availability);
      const tdSeller = document.createElement("td");
      tdSeller.textContent = p.sellerId ? p.sellerId.slice(0, 8) + "…" : "Admin";
      const tdAct = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";

      if (pendingMode) {
        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "btn btn-primary";
        approve.textContent = "Approve";
        approve.addEventListener("click", async () => {
          await api(`/api/admin/products/${p.id}/approve`, { method: "POST", body: "{}" });
          loadPending();
          loadStats();
        });
        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "btn btn-remove";
        reject.textContent = "Reject";
        reject.addEventListener("click", async () => {
          const reason = prompt("Rejection reason:", "Does not meet listing guidelines") || "";
          await api(`/api/admin/products/${p.id}/reject`, {
            method: "POST",
            body: JSON.stringify({ reason }),
          });
          loadPending();
        });
        actions.append(approve, reject);
      } else {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => openProductDialog(p));
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-remove";
        del.textContent = "Delete";
        del.addEventListener("click", async () => {
          if (!confirm(`Delete "${p.name}"?`)) return;
          await api(`/api/admin/products/${p.id}`, { method: "DELETE" });
          loadProducts();
        });
        actions.append(edit, del);
      }
      tdAct.appendChild(actions);
      tr.append(tdName, tdCat, tdPrice, tdStock, tdStatus, tdSeller, tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function loadProducts() {
    const { products } = await api("/api/admin/products");
    renderProductRows(products, $("#products-table"));
  }

  async function loadPending() {
    const { products } = await api("/api/admin/products?approvalStatus=pending");
    renderProductRows(products, $("#pending-table"), { pendingMode: true });
  }

  async function loadSellers() {
    const { sellers } = await api("/api/admin/sellers");
    const table = $("#sellers-table");
    table.innerHTML =
      "<thead><tr><th>Name</th><th>Email</th><th>Shop</th><th>Status</th><th>Actions</th></tr></thead>";
    const tbody = document.createElement("tbody");
    sellers.forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td>`;
      const tds = tr.children;
      tds[0].textContent = s.name;
      tds[1].textContent = s.email;
      tds[2].textContent = (s.sellerDetails && s.sellerDetails.shopName) || "—";
      tds[3].innerHTML = badge(s.sellerStatus);
      const actions = document.createElement("div");
      actions.className = "row-actions";
      if (s.sellerStatus === "pending") {
        const a = document.createElement("button");
        a.className = "btn btn-primary";
        a.type = "button";
        a.textContent = "Approve";
        a.addEventListener("click", async () => {
          await api(`/api/admin/sellers/${s.id}/approve`, { method: "POST", body: "{}" });
          loadSellers();
        });
        const r = document.createElement("button");
        r.className = "btn btn-remove";
        r.type = "button";
        r.textContent = "Reject";
        r.addEventListener("click", async () => {
          await api(`/api/admin/sellers/${s.id}/reject`, { method: "POST", body: "{}" });
          loadSellers();
        });
        actions.append(a, r);
      }
      tds[4].appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function loadCustomers() {
    const { customers } = await api("/api/admin/customers");
    const table = $("#customers-table");
    table.innerHTML =
      "<thead><tr><th>Name</th><th>Email</th><th>Active</th><th>Actions</th></tr></thead>";
    const tbody = document.createElement("tbody");
    customers.forEach((c) => {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td");
      td0.textContent = c.name;
      const td1 = document.createElement("td");
      td1.textContent = c.email;
      const td2 = document.createElement("td");
      td2.innerHTML = badge(c.active ? "active" : "inactive");
      const td3 = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = c.active ? "Deactivate" : "Activate";
      btn.addEventListener("click", async () => {
        await api(`/api/admin/users/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !c.active }),
        });
        loadCustomers();
      });
      td3.appendChild(btn);
      tr.append(td0, td1, td2, td3);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function loadOrders() {
    const { orders } = await api("/api/admin/orders");
    const table = $("#orders-table");
    table.innerHTML =
      "<thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Update</th></tr></thead>";
    const tbody = document.createElement("tbody");
    orders.forEach((o) => {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td");
      td0.textContent = o.id;
      const td1 = document.createElement("td");
      td1.textContent = o.customerName;
      const td2 = document.createElement("td");
      td2.textContent = inr(o.total);
      const td3 = document.createElement("td");
      td3.innerHTML = badge(o.status);
      const td4 = document.createElement("td");
      const sel = document.createElement("select");
      ["confirmed", "processing", "shipped", "delivered", "cancelled"].forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        if (s === o.status) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", async () => {
        await api(`/api/admin/orders/${o.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: sel.value }),
        });
        loadOrders();
      });
      td4.appendChild(sel);
      tr.append(td0, td1, td2, td3, td4);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function loadCategories() {
    const { categories } = await api("/api/categories");
    const table = $("#categories-table");
    table.innerHTML = "<thead><tr><th>Name</th><th>Slug</th><th>Subcategories</th><th></th></tr></thead>";
    const tbody = document.createElement("tbody");
    categories.forEach((c) => {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td");
      td0.textContent = c.name;
      const td1 = document.createElement("td");
      td1.textContent = c.slug;
      const td2 = document.createElement("td");
      td2.textContent = (c.subcategories || []).join(", ");
      const td3 = document.createElement("td");
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-remove";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("Delete category?")) return;
        await api(`/api/admin/categories/${c.id}`, { method: "DELETE" });
        loadCategories();
      });
      td3.appendChild(del);
      tr.append(td0, td1, td2, td3);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function openProductDialog(product) {
    const dlg = $("#product-dialog");
    showErr($("#pf-errors"), "");
    $("#pf-id").value = product ? product.id : "";
    $("#product-dialog-title").textContent = product ? "Edit product" : "Add product";
    $("#pf-name").value = product ? product.name : "";
    $("#pf-desc").value = product ? product.description : "";
    $("#pf-category").value = product ? product.category : "";
    $("#pf-sub").value = product ? product.subcategory || "" : "";
    $("#pf-price").value = product ? product.price : "";
    $("#pf-original").value = product && product.originalPrice != null ? product.originalPrice : "";
    $("#pf-discount").value = product ? product.discountLabel || "" : "";
    $("#pf-stock").value = product ? product.stock : "0";
    $("#pf-image").value = product && product.images ? product.images[0] || "" : "";
    $("#pf-file").value = "";
    $("#pf-availability").value = product ? product.availability : "active";
    dlg.showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    showErr($("#pf-errors"), "");
    try {
      let imageUrl = $("#pf-image").value.trim();
      const file = $("#pf-file").files[0];
      if (file) {
        const fd = new FormData();
        fd.append("image", file);
        const up = await api("/api/upload", { method: "POST", body: fd });
        imageUrl = up.url;
      }
      const payload = {
        name: $("#pf-name").value.trim(),
        description: $("#pf-desc").value.trim(),
        category: $("#pf-category").value.trim(),
        subcategory: $("#pf-sub").value.trim() || null,
        price: Number($("#pf-price").value),
        originalPrice: $("#pf-original").value === "" ? null : Number($("#pf-original").value),
        discountLabel: $("#pf-discount").value.trim() || null,
        stock: Number($("#pf-stock").value),
        availability: $("#pf-availability").value,
        images: imageUrl ? [imageUrl] : undefined,
      };
      const id = $("#pf-id").value;
      if (id) {
        await api(`/api/admin/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
      }
      $("#product-dialog").close();
      loadProducts();
      loadStats();
    } catch (err) {
      showErr($("#pf-errors"), err.message);
    }
  }

  function init() {
    $("#admin-login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      showErr($("#admin-login-errors"), "");
      try {
        const data = await API.login($("#admin-email").value.trim(), $("#admin-password").value);
        if (data.user.role !== "admin") {
          API.clearSession();
          showErr($("#admin-login-errors"), "Not an admin account.");
          return;
        }
        API.setSession(data.token, data.user);
        showApp(true);
        switchView("overview");
      } catch (err) {
        showErr($("#admin-login-errors"), err.message);
      }
    });

    $("#admin-logout").addEventListener("click", () => {
      API.clearSession();
      showApp(false);
    });

    $$(".dash-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    $("#btn-new-product").addEventListener("click", () => openProductDialog(null));
    $("#product-form").addEventListener("submit", saveProduct);
    $("#pf-cancel").addEventListener("click", () => $("#product-dialog").close());

    $("#category-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      await api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name: $("#cat-name").value.trim(),
          slug: $("#cat-slug").value.trim(),
        }),
      });
      e.target.reset();
      loadCategories();
    });

    $("#dash-menu").addEventListener("click", () => {
      $("#admin-app .dash-sidebar").classList.toggle("is-open");
    });

    verifySession().then((ok) => {
      if (ok) switchView("overview");
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
