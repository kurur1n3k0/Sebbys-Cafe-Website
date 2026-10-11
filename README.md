# Sebby's Cafe — full website + backend

This project reorganizes the supplied static café website and implements the backend function. It uses plain HTML/CSS/JavaScript on the frontend and built-in Node.js modules on the backend, so no npm dependencies are required.

## Latest improvements

- Homepage contact card now uses a warmer, lighter coffee-brown with improved paragraph-to-button spacing that complements the café's blue buttons.
- Orders receive a daily POS-style identifier such as `20261011-001`; numbering restarts at `001` using the Asia/Manila business date.
- Baristas can remove received orders from the active queue. The order itself remains in the JSON store, and admins can review it in **Sales & order history** with daily order counts and recorded paid sales.
- Admin and barista dashboards automatically poll the backend about every three seconds while the browser tab is visible, so staff do not need to manually refresh for routine updates.
- The admin contact panel displays unread-message alerts and live-session notifications for new newsletter sign-ups.
- Admins can create reusable menu categories with the `+` button. The public menu filter tabs are generated from categories used by the products.
- Newly uploaded product/promotion images are saved under `public/assets/uploads/` with a filename starting `sebbys-` followed by the product name or promotion title. If that filename already exists, a numbered suffix prevents accidental overwrite.

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Stop any older Sebby’s Cafe server first with `Ctrl+C` in its terminal, then run `npm start` (or `node server.js`) from this exact extracted folder. If port 3000 is already in use, the old server may still be running from another folder; stop it before restarting this version.
4. Open `http://localhost:3000` in your browser. Do **not** use a static preview or open HTML files with `file://`; the staff screens and sales history require the matching Node backend. Updated script/style links are cache-busted, and the server revalidates CSS/JS to avoid stale dashboard code.
5. To open staff features, choose Staff Sign In by visiting `http://localhost:3000/staff-login.html`.

### Local demo staff accounts

When `NODE_ENV` is not `production` and no `.env` overrides are provided, the server uses these convenient coursework-demo accounts:

- **Admin:** `admin` / `SebbysAdmin2026!`
- **Barista:** `barista` / `SebbysBarista2026!`

Before deployment, copy `.env.example` to `.env`, choose unique passwords and a long random `SESSION_SECRET`, then set `NODE_ENV=production`. Production startup refuses to run unless the admin password, barista password, and session secret are configured. Do not expose a public deployment with the demo credentials.

## What has been implemented

- **Public menu API:** read menu items from JSON data, including prices, descriptions, categories, images, availability, and flavor variants. The menu page renders from the API rather than hard-coding each card.
- **Cart and orders:** customers keep a cart in the browser and submit the order to the backend. The backend rechecks product availability, variant IDs, quantities, and prices before saving the order and returning a unique order number.
- **Contact Us:** a dedicated customer form validates name, email, subject, and message. A success confirmation appears only after the API has saved the message.
- **Newsletter:** the footer subscription form posts an email to the API; unique addresses are saved and duplicates are handled without duplicating the list.
- **Admin dashboard:** menu item create/edit/delete, prices, variants, availability, custom category creation, JPEG/PNG/WebP image uploads (up to 6 MB), promotion create/edit/delete, promotion image upload, promotion date windows, background/text color, and included menu items. Uploaded images are named `sebbys-{product-or-promotion-name}.{extension}` (with a numeric suffix if a file already exists).
- **Contact moderation:** inbox and trash views, mark read/unread, move to trash, restore, and permanently delete.
- **Subscribers:** protected subscriber list with a copy-all-emails action for use in an external email marketing application. Admin notifications surface unread contact messages and new newsletter sign-ups during the current dashboard session. Automated email sending is not configured.
- **Sales history:** admin-only order history with daily order count, recorded paid sales, and archived-from-queue status. Orders removed from the barista screen remain stored in `data/orders.json`.
- **Barista endpoint/dashboard:** protected order queue with pending, paid, and received statuses. Order numbers use `YYYYMMDD-001`, `YYYYMMDD-002`, etc. and restart at `001` each day in the Asia/Manila time zone. The barista can remove received orders from the active screen without deleting them from persistent order history. Staff record payment manually at the café; there is no payment gateway integration. Both staff dashboards auto-sync about every 3 seconds while visible.
- **Customer dataset:** `GET /api/customers` is admin-only and returns fictional `.test` records for safe coursework demonstration.
- **Persistent data:** menu, customer demo records, orders, messages, newsletters, and promotions are saved under `data/` as JSON files.

## Project layout

```text
sebbys-cafe-final/
├── server.js                    # Node HTTP server and API
├── package.json                 # Run/check commands (no dependencies)
├── .env.example                 # Configuration template
├── README.md
├── data/
│   ├── categories.json            # Default and custom menu categories
│   ├── products.json
│   ├── customers.json            # Fictional sample records only
│   ├── orders.json
│   ├── contact-messages.json
│   ├── newsletter.json
│   └── promotions.json
└── public/
    ├── index.html
    ├── menu.html
    ├── cart.html
    ├── contact.html
    ├── staff-login.html
    ├── admin.html
    ├── barista.html
    ├── css/                      # Shared styles and page-specific styles
    ├── js/                       # Frontend modules
    └── assets/                   # Café images and uploaded images
```

## API endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Health check |
| `GET` | `/api/products` | Public | List menu products |
| `GET` | `/api/products/:id` | Public | One menu item |
| `GET` | `/api/promotions/active` | Public | Promotions within their date range |
| `POST` | `/api/contact` | Public | Validate and store a contact message |
| `POST` | `/api/newsletter` | Public | Save a newsletter subscription |
| `POST` | `/api/orders` | Public | Validate and save a customer order |
| `POST` | `/api/auth/login` | Public | Staff sign-in; sets HttpOnly session cookie |
| `GET` | `/api/auth/me` | Session | Return the signed-in staff role |
| `POST` | `/api/auth/logout` | Session | End the staff session |
| `GET` | `/api/customers` | Admin | View fictional customer dataset |
| `GET/POST` | `/api/admin/products` | Admin | List/create menu products |
| `PUT/DELETE` | `/api/admin/products/:id` | Admin | Update/delete a product |
| `POST` | `/api/admin/upload` | Admin | Upload a product or promotion image |
| `GET/POST` | `/api/admin/promotions` | Admin | List/create promotions |
| `PUT/DELETE` | `/api/admin/promotions/:id` | Admin | Update/delete a promotion |
| `GET` | `/api/admin/newsletter` | Admin | View subscribers |
| `GET` | `/api/admin/contacts?view=inbox\|trash` | Admin | View contact inbox/trash |
| `PATCH` | `/api/admin/contacts/:id` | Admin | Mark read/unread or restore |
| `DELETE` | `/api/admin/contacts/:id` | Admin | Move a contact message to trash |
| `DELETE` | `/api/admin/contacts/:id/forever` | Admin | Permanently delete a trashed message |
| `GET` | `/api/admin/summary` | Admin | Dashboard counts |
| `GET` / `POST` | `/api/admin/categories` | Admin | List/create custom product categories |
| `GET` | `/api/admin/orders` | Admin | Full order and sales history, including archived queue orders |
| `GET` | `/api/barista/orders` | Barista/Admin | View orders, optionally filtered by status |
| `PATCH` | `/api/barista/orders/:id/status` | Barista/Admin | Change pending → paid → received |
| `PATCH` | `/api/barista/orders/:id/archive` | Barista/Admin | Remove a received order from the active queue without deleting history |

## Data and operational notes

- Menu products and promotions supplied with the site are seeded in `data/products.json` and `data/promotions.json`; menu prices are expressed in Philippine pesos.
- The original website contained a couple of food-card image mismatches and a case mismatch (`Assets` versus `assets`). The final directory uses lowercase `public/assets/`, and those two menu image assignments are corrected.
- JSON files are appropriate for a small class demo. A public production deployment should migrate data to a database, use HTTPS, add backups and stronger operational monitoring, and rotate credentials.
- There is no actual payment gateway or automatic email delivery configured, consistent with the instruction document's scope. The UI makes those limits clear.


## Latest staff interface refinements

- Admin confirmations and text-entry prompts (product and promotion deletion, contact message trash/permanent deletion, adding categories, and naming uploaded images) use Sebby's Cafe-styled dialogs instead of browser-native `localhost says...` prompts.
- Removing a completed order from the barista queue uses the same styled confirmation and keeps the order in manager sales history. The completed indicator stays left, with the **Remove** action on the right.
- The admin and barista dashboards update quietly in the background. Technical synchronization labels have been removed from the screen.
- Contact inbox unread counts and new newsletter subscribers are shown as compact red badges on their respective admin navigation tabs, in place of large notification banners.

Run `npm run check` to check the server and client-side JavaScript syntax.
