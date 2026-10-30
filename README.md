# ShopNest

Customer storefront (HTML/CSS/Vanilla JS) plus a local **Express API** for Admin, Seller, products, and orders.

## Quick start

```bash
cd server
npm install
npm run seed
npm start
```

Open **http://localhost:8080**

| Role | URL | Default login |
|------|-----|----------------|
| Customer store | `/index.html` | Register a new account |
| Admin | `/admin.html` | `admin@shopnest.local` / `Admin@12345` |
| Seller | `/seller.html` | Register → apply at `/seller-register.html` → admin approves |

Change the admin password in `server/.env` and re-run `npm run seed` if needed.

## Important

- Do **not** open HTML files via `file://` for full features — use the server on port 8080.
- Roles are enforced with **JWT on the server**. Editing `localStorage` / `sessionStorage` cannot grant admin rights on API calls.
- Browser cart prices are revalidated on the server when placing an order; stock is deducted server-side.

## Workflow to test

1. Start the server.
2. Log in as admin → manage products / approve sellers.
3. Register a customer → Seller registration → admin approves seller.
4. Seller adds a product → stays **pending** until admin approves.
5. Approved product appears on the homepage.
6. Customer adds to cart → checkout (must be logged in) → stock decreases.
