/**
 * ShopNest API client — shared by storefront, admin, and seller panels.
 * Auth token is stored in sessionStorage (not localStorage role spoofing for APIs).
 * Server JWT verifies role on every protected request.
 */
(function (global) {
  "use strict";

  const TOKEN_KEY = "shopnest_auth_token";
  const USER_KEY = "shopnest_auth_user";

  function apiBase() {
    // Same origin when served by Express; otherwise default local API
    if (typeof window !== "undefined" && window.location.port === "8080") {
      return "";
    }
    return "http://localhost:8080";
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;

    const res = await fetch(apiBase() + path, Object.assign({}, options, { headers }));
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || "Unexpected response" };
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  global.ShopNestAPI = {
    apiBase,
    getToken,
    getUser,
    setSession,
    clearSession,
    request,
    login: (email, password) =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    register: (name, email, password) =>
      request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      }),
    me: () => request("/api/auth/me"),
    getProducts: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request("/api/products" + (q ? "?" + q : ""));
    },
    getProduct: (id) => request("/api/products/" + encodeURIComponent(id)),
    getCategories: () => request("/api/categories"),
    placeOrder: (payload) =>
      request("/api/orders", { method: "POST", body: JSON.stringify(payload) }),
    myOrders: () => request("/api/orders/mine"),
  };
})(window);
