/**
 * ShopNest Seller Panel — sellers only manage their own products/orders (enforced by API).
 */
(() => {
  "use strict";

  const API = window.ShopNestAPI;

  function $(s, r = document) {
    return r.querySelector(s);
  }
  function $$(s) {
    return Array.from(document.querySelectorAll(s));
  }
  function setText(el, t) {
    if (el) el.textContent = t == null ? "" : String(t);
  }
  function showErr(el, msg) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
  }
  function inr(n) {
    return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  }
  function badge(status) {
    const s = String(status || "");
    const cls =
      s === "approved" || s === "active" || s === "delivered"
        ? "badge-approved"
        : s === "pending" || s === "packed" || s === "shipped"
          ? "badge-pending"
          : "badge-rejected";
    return `<span class="badge ${cls}">${s}</span>`;
  }

  function showState(state) {
    $("#gate-login").hidden = state !== "login";
    $("#pending-gate").hidden = state !== "pending";
    $("#dash-content").hidden = state !== "app";
  }

  async function verify() {
    if (!API.getToken()) {
      showState("login");
      return null;
    }
    try {
      const { user } = await API.me();
      API.setSession(API.getToken(), user);
      setText($("#seller-user-label"), `${user.name} · ${user.sellerStatus}`);
      if (user.role !== "seller") {
        showState("login");
        showErr($("#seller-login-errors"), "Not a seller account. Apply via Seller registration.");
        return null;
      }
      if (user.sellerStatus === "pending" || user.sellerStatus === "rejected") {
        showState("pending");
        setText(
          $("#pending-message"),
          user.sellerStatus === "rejected"
            ? "Your seller application was rejected. Contact admin or re-apply after updates."
            : "Your seller application is pending admin approval."
        );
        return user;
      }
      if (user.sellerStatus !== "approved") {
        showState("login");
        return null;
      }
      showState("app");
      return user;
    } catch {
      API.clearSession();
      showState("login");
      return null;
    }
  }

  async function loadStats() {
    const { totals } = await API.request("/api/seller/stats");
    const grid = $("#seller-stats");
    grid.innerHTML = "";
    [
      ["Products", totals.products],
      ["Pending", totals.pending],
      ["Approved", totals.approved],
      ["Rejected", totals.rejected],
      ["Orders", totals.orders],
      ["Earnings", inr(totals.earnings)],
    ].forEach(([label, value]) => {
      const d = document.createElement("div");
      d.className = "stat-card";
      const strong = document.createElement("strong");
      strong.textContent = value;
      const span = document.createElement("span");
      span.textContent = label;
      d.append(strong, span);
      grid.appendChild(d);
    });
    const eg = $("#earnings-stats");
    if (eg) {
      eg.innerHTML = "";
      [
        ["Order lines revenue", inr(totals.earnings)],
        ["Orders with your items", totals.orders],
      ].forEach(([label, value]) => {
        const d = document.createElement("div");
        d.className = "stat-card";
        const strong = document.createElement("strong");
        strong.textContent = value;
        const span = document.createElement("span");
        span.textContent = label;
        d.append(strong, span);
        eg.appendChild(d);
      });
    }
  }

  async function loadProducts() {
    const { products } = await API.request("/api/seller/products");
    const table = $("#seller-products-table");
    table.innerHTML =
      "<thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Approval</th><th>Actions</th></tr></thead>";
    const tbody = document.createElement("tbody");
    products.forEach((p) => {
      const tr = document.createElement("tr");
      const cells = ["", "", "", "", ""].map(() => document.createElement("td"));
      cells[0].textContent = p.name;
      cells[1].textContent = inr(p.price);
      cells[2].textContent = String(p.stock);
      cells[3].innerHTML =
        badge(p.approvalStatus) +
        (p.rejectionReason ? `<div class="section-note">${p.rejectionReason}</div>` : "");
      const actions = document.createElement("div");
      actions.className = "row-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => openDialog(p));
      const deact = document.createElement("button");
      deact.type = "button";
      deact.className = "btn";
      deact.textContent = "Deactivate";
      deact.addEventListener("click", async () => {
        await API.request(`/api/seller/products/${p.id}/deactivate`, {
          method: "POST",
          body: "{}",
        });
        loadProducts();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-remove";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("Delete this product?")) return;
        await API.request(`/api/seller/products/${p.id}`, { method: "DELETE" });
        loadProducts();
      });
      actions.append(edit, deact, del);
      cells[4].appendChild(actions);
      tr.append(...cells);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function loadOrders() {
    const { orders } = await API.request("/api/seller/orders");
    const table = $("#seller-orders-table");
    table.innerHTML =
      "<thead><tr><th>Order</th><th>Items</th><th>Subtotal</th><th>Fulfilment</th></tr></thead>";
    const tbody = document.createElement("tbody");
    orders.forEach((o) => {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td");
      td0.textContent = o.id;
      const td1 = document.createElement("td");
      td1.textContent = (o.items || []).map((i) => `${i.name} × ${i.quantity}`).join("; ");
      const td2 = document.createElement("td");
      td2.textContent = inr(o.sellerSubtotal);
      const td3 = document.createElement("td");
      (o.items || []).forEach((item) => {
        const wrap = document.createElement("div");
        wrap.style.marginBottom = "0.35rem";
        const sel = document.createElement("select");
        ["pending", "packed", "shipped", "delivered"].forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = `${item.name}: ${s}`;
          if (s === item.fulfilmentStatus) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", async () => {
          await API.request(
            `/api/seller/orders/${o.id}/items/${item.productId}/fulfilment`,
            {
              method: "PATCH",
              body: JSON.stringify({ fulfilmentStatus: sel.value }),
            }
          );
          loadOrders();
        });
        wrap.appendChild(sel);
        td3.appendChild(wrap);
      });
      tr.append(td0, td1, td2, td3);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function openDialog(product) {
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
    $("#pf-stock").value = product ? product.stock : "1";
    $("#pf-image").value = product && product.images ? product.images[0] || "" : "";
    $("#pf-file").value = "";
    $("#product-dialog").showModal();
  }

  async function saveProduct(e) {
    e.preventDefault();
    showErr($("#pf-errors"), "");
    try {
      let imageUrl = $("#pf-image").value.trim();
      const file = $("#pf-file").files[0];
      if (file) {
        const fd = new FormData();
        fd.append("image", file);
        const up = await API.request("/api/upload", { method: "POST", body: fd });
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
        images: imageUrl ? [imageUrl] : undefined,
      };
      const id = $("#pf-id").value;
      if (id) {
        await API.request(`/api/seller/products/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await API.request("/api/seller/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      $("#product-dialog").close();
      loadProducts();
      loadStats();
    } catch (err) {
      showErr($("#pf-errors"), err.message);
    }
  }

  function switchView(view) {
    $$(".dash-nav-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    $$(".dash-panel").forEach((p) =>
      p.classList.toggle("is-visible", p.getAttribute("data-panel") === view)
    );
    const titles = {
      overview: "Dashboard",
      products: "My products",
      orders: "Orders",
      earnings: "Earnings",
    };
    setText($("#dash-title"), titles[view] || "Dashboard");
    if (view === "overview" || view === "earnings") loadStats();
    if (view === "products") loadProducts();
    if (view === "orders") loadOrders();
  }

  function init() {
    $("#seller-login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      showErr($("#seller-login-errors"), "");
      try {
        const data = await API.login(
          $("#seller-email").value.trim(),
          $("#seller-password").value
        );
        API.setSession(data.token, data.user);
        const user = await verify();
        if (user && user.sellerStatus === "approved") switchView("overview");
      } catch (err) {
        showErr($("#seller-login-errors"), err.message);
      }
    });

    $("#seller-logout").addEventListener("click", () => {
      API.clearSession();
      showState("login");
    });
    $("#pending-logout")?.addEventListener("click", () => {
      API.clearSession();
      showState("login");
    });

    $$(".dash-nav-btn").forEach((btn) =>
      btn.addEventListener("click", () => switchView(btn.dataset.view))
    );
    $("#btn-new-product").addEventListener("click", () => openDialog(null));
    $("#product-form").addEventListener("submit", saveProduct);
    $("#pf-cancel").addEventListener("click", () => $("#product-dialog").close());
    $("#dash-menu").addEventListener("click", () =>
      $("#seller-app .dash-sidebar").classList.toggle("is-open")
    );

    verify().then((user) => {
      if (user && user.sellerStatus === "approved") switchView("overview");
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
