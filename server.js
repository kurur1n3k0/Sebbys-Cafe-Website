'use strict';

// Sebby's Cafe backend using only Node.js built-in modules (Node 18+).
// JSON files are used for coursework-friendly persistence; replace with a database for production.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'assets', 'uploads');
loadLocalEnv();

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

if (NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || !process.env.BARISTA_PASSWORD || !process.env.SESSION_SECRET)) {
  throw new Error('Production requires ADMIN_PASSWORD, BARISTA_PASSWORD, and SESSION_SECRET in the environment.');
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const BARISTA_USERNAME = process.env.BARISTA_USERNAME || 'barista';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SebbysAdmin2026!';
const BARISTA_PASSWORD = process.env.BARISTA_PASSWORD || 'SebbysBarista2026!';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DATA_FILES = {
  products: 'products.json',
  customers: 'customers.json',
  orders: 'orders.json',
  contacts: 'contact-messages.json',
  newsletter: 'newsletter.json',
  promotions: 'promotions.json',
  categories: 'categories.json'
};

function loadData(name) {
  const filePath = path.join(DATA_DIR, DATA_FILES[name]);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error(`${DATA_FILES[name]} must contain a JSON array`);
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`Unable to read ${DATA_FILES[name]}:`, error.message);
    const empty = [];
    writeData(name, empty);
    return empty;
  }
}
function writeData(name, value) {
  const destination = path.join(DATA_DIR, DATA_FILES[name]);
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, destination);
}
function now() { return new Date().toISOString(); }
function todayManila() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function id() { return crypto.randomUUID(); }
function slug(value) { return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function cleanString(value, max = 200) { return typeof value === 'string' ? value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max) : ''; }
function validEmail(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()); }
function validColor(value) { return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value); }
function publicProduct(product) { return product; }
function sendJson(res, status, payload, headers = {}) {
  const data = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
function sendError(res, status, message) { return sendJson(res, status, { error: message }); }
function secureEqual(a, b) {
  const ah = crypto.createHash('sha256').update(String(a)).digest();
  const bh = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}
function parseCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const ix = part.indexOf('=');
    if (ix < 0) continue;
    const key = part.slice(0, ix).trim();
    try { result[key] = decodeURIComponent(part.slice(ix + 1).trim()); } catch (_) { /* ignore malformed cookie */ }
  }
  return result;
}
function getSession(req) {
  const token = parseCookies(req.headers.cookie).sebbys_session;
  if (!token) return null;
  const splitAt = token.indexOf('.');
  if (splitAt < 1) return null;
  const rawToken = token.slice(0, splitAt);
  const suppliedSignature = token.slice(splitAt + 1);
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('base64url');
  if (!secureEqual(suppliedSignature, expectedSignature)) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) { sessions.delete(token); return null; }
  return { ...session, token };
}
function requireRoles(req, res, roles) {
  const session = getSession(req);
  if (!session) { sendError(res, 401, 'Please sign in to continue.'); return null; }
  if (!roles.includes(session.role)) { sendError(res, 403, 'You do not have permission to access this resource.'); return null; }
  return session;
}
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  if (!host) return false;
  const expected = `${req.socket.encrypted ? 'https' : 'http'}://${host}`;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proxiedExpected = forwardedProto ? `${forwardedProto}://${host}` : expected;
  return origin === expected || origin === proxiedExpected;
}
function readRaw(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const raw = await readRaw(req, 1024 * 1024);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch (_) { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}
function cookieHeader(token, maxAge = Math.floor(SESSION_TTL_MS / 1000)) {
  return `sebbys_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function statusForException(error) { return Number.isInteger(error.status) ? error.status : 500; }
function normalizeProduct(body, existing = null) {
  const name = cleanString(body.name ?? existing?.name, 100);
  const category = cleanString(body.category ?? existing?.category, 40);
  const categoryKey = slug(body.categoryKey ?? ((body.category && body.category !== existing?.category) ? body.category : (existing?.categoryKey ?? category)));
  const description = cleanString(body.description ?? existing?.description, 1000);
  const image = cleanString(body.image ?? existing?.image, 300);
  const price = Number(body.price ?? existing?.price);
  const availableValue = body.available ?? existing?.available ?? true;
  const available = availableValue === true || availableValue === 'true' || availableValue === 1;
  let variants = body.variants ?? existing?.variants ?? [];
  if (typeof variants === 'string') {
    try { variants = JSON.parse(variants); }
    catch (_) { throw Object.assign(new Error('Variants must be valid JSON.'), { status: 400 }); }
  }
  if (!name || !category || !description) throw Object.assign(new Error('Name, category, and description are required.'), { status: 400 });
  if (!Number.isFinite(price) || price < 0 || price > 100000) throw Object.assign(new Error('Price must be a valid non-negative amount.'), { status: 400 });
  if (image && !image.startsWith('/assets/')) throw Object.assign(new Error('Images must use a local /assets/ path. Upload images using the admin image uploader.'), { status: 400 });
  if (!Array.isArray(variants) || variants.length > 30) throw Object.assign(new Error('Variants must be an array with no more than 30 entries.'), { status: 400 });
  const normalizedVariants = variants.map(v => {
    const vName = cleanString(v.name, 100);
    const vId = slug(v.id || vName);
    const vPrice = Number(v.price);
    if (!vName || !vId || !Number.isFinite(vPrice) || vPrice < 0 || vPrice > 100000) throw Object.assign(new Error('Each variant needs a name and valid price.'), { status: 400 });
    return { id: vId, name: vName, price: vPrice };
  });
  if (new Set(normalizedVariants.map(v => v.id)).size !== normalizedVariants.length) throw Object.assign(new Error('Variant IDs must be unique within a product.'), { status: 400 });
  return { id: slug(body.id || existing?.id || name), name, category, categoryKey, description, price, image, available, variants: normalizedVariants, createdAt: existing?.createdAt || now(), updatedAt: now() };
}
function normalizePromotion(body, existing = null) {
  const title = cleanString(body.title ?? existing?.title, 120);
  const label = cleanString(body.label ?? existing?.label ?? 'SPECIAL OFFER', 100);
  const description = cleanString(body.description ?? existing?.description, 1200);
  const image = cleanString(body.image ?? existing?.image, 300);
  const ctaText = cleanString(body.ctaText ?? existing?.ctaText ?? 'Explore the menu', 80);
  const backgroundColor = cleanString(body.backgroundColor ?? existing?.backgroundColor ?? '#edf7ef', 7);
  const textColor = cleanString(body.textColor ?? existing?.textColor ?? '#315b46', 7);
  const startDate = cleanString(body.startDate ?? existing?.startDate, 10);
  const endDate = cleanString(body.endDate ?? existing?.endDate, 10);
  const productIds = body.productIds ?? existing?.productIds ?? [];
  if (!title || !description) throw Object.assign(new Error('Promotion title and description are required.'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw Object.assign(new Error('Choose valid promotion start and end dates; the end date must not be before the start date.'), { status: 400 });
  if (!validColor(backgroundColor) || !validColor(textColor)) throw Object.assign(new Error('Promotion colors must be valid hex colors.'), { status: 400 });
  if (image && !image.startsWith('/assets/')) throw Object.assign(new Error('Promotion image must use a local /assets/ path.'), { status: 400 });
  if (!Array.isArray(productIds) || productIds.length > 100) throw Object.assign(new Error('Included menu items must be an array.'), { status: 400 });
  return { id: slug(body.id || existing?.id || title), title, label, description, image, ctaText, backgroundColor, textColor, productIds: productIds.map(x => cleanString(x, 100)).filter(Boolean), startDate, endDate, createdAt: existing?.createdAt || now(), updatedAt: now() };
}
function validUploadSignature(buffer, mime) {
  if (mime === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
async function readImageUpload(req) {
  const type = String(req.headers['content-type'] || '');
  const boundaryMatch = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!type.toLowerCase().startsWith('multipart/form-data') || !boundaryMatch) throw Object.assign(new Error('Send the image as multipart form data.'), { status: 400 });
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const raw = await readRaw(req, 8 * 1024 * 1024);
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  let cursor = 0;
  while ((cursor = raw.indexOf(delimiter, cursor)) !== -1) {
    cursor += delimiter.length;
    if (raw.subarray(cursor, cursor + 2).toString() === '--') break;
    if (raw.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
    const next = raw.indexOf(delimiter, cursor);
    if (next === -1) break;
    let part = raw.subarray(cursor, next);
    if (part.subarray(-2).toString() === '\r\n') part = part.subarray(0, -2);
    const separator = part.indexOf(Buffer.from('\r\n\r\n'));
    if (separator === -1) { cursor = next; continue; }
    const headerText = part.subarray(0, separator).toString('utf8');
    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    const fieldName = disposition?.[1]?.match(/name="([^"]+)"/i)?.[1] || '';
    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    const mimeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
    const payload = part.subarray(separator + 4);
    if (!filenameMatch || !filenameMatch[1]) {
      if (fieldName) fields[fieldName] = payload.toString('utf8').trim().slice(0, 160);
      cursor = next;
      continue;
    }
    const mime = (mimeMatch?.[1] || '').trim().toLowerCase();
    const buffer = payload;
    const extByMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    if (!extByMime[mime] || !validUploadSignature(buffer, mime)) throw Object.assign(new Error('Only valid JPEG, PNG, or WebP images are accepted.'), { status: 415 });
    if (buffer.length > 6 * 1024 * 1024) throw Object.assign(new Error('Image must be 6 MB or smaller.'), { status: 413 });
    const requestedName = slug(fields.name || path.basename(filenameMatch[1], path.extname(filenameMatch[1]))) || `image-${Date.now()}`;
    const baseName = `sebbys-${requestedName}`;
    let filename = `${baseName}${extByMime[mime]}`;
    let suffix = 2;
    while (fs.existsSync(path.join(UPLOAD_DIR, filename))) filename = `${baseName}-${suffix++}${extByMime[mime]}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer, { flag: 'wx', mode: 0o644 });
    return { image: `/assets/uploads/${filename}`, originalName: path.basename(filenameMatch[1]).slice(0, 150), storedName: filename, size: buffer.length, mime };
  }
  throw Object.assign(new Error('No image file was included in the upload.'), { status: 400 });
}

const EMAIL_LIMIT = 10;
function loginRateLimited(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) { loginAttempts.delete(ip); return false; }
  return entry.failures >= EMAIL_LIMIT;
}
function noteLoginFailure(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= Date.now()) loginAttempts.set(ip, { failures: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  else entry.failures++;
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (method !== 'GET' && method !== 'HEAD' && !originAllowed(req)) return sendError(res, 403, 'Request origin is not allowed.');

  if (method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true, service: 'Sebby’s Cafe API', timestamp: now() });
  if (method === 'GET' && pathname === '/api/auth/me') {
    const session = getSession(req);
    return sendJson(res, 200, { authenticated: !!session, user: session ? { username: session.username, role: session.role } : null });
  }
  if (method === 'POST' && pathname === '/api/auth/login') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (loginRateLimited(ip)) return sendError(res, 429, 'Too many unsuccessful login attempts. Please try again in 15 minutes.');
    const body = await readJson(req);
    const username = cleanString(body.username, 100);
    const password = typeof body.password === 'string' ? body.password : '';
    let role = null;
    let expected = '';
    if (secureEqual(username, ADMIN_USERNAME)) { role = 'admin'; expected = ADMIN_PASSWORD; }
    else if (secureEqual(username, BARISTA_USERNAME)) { role = 'barista'; expected = BARISTA_PASSWORD; }
    if (!role || !secureEqual(password, expected)) {
      noteLoginFailure(ip);
      return sendError(res, 401, 'The username or password is incorrect.');
    }
    loginAttempts.delete(ip);
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('base64url');
    const token = rawToken + '.' + signature;
    sessions.set(token, { username, role, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(res, 200, { success: true, user: { username, role } }, { 'Set-Cookie': cookieHeader(token) });
  }
  if (method === 'POST' && pathname === '/api/auth/logout') {
    const session = getSession(req);
    if (session) sessions.delete(session.token);
    return sendJson(res, 200, { success: true }, { 'Set-Cookie': cookieHeader('', 0) });
  }

  if (method === 'GET' && pathname === '/api/products') {
    const products = loadData('products');
    return sendJson(res, 200, products.map(publicProduct));
  }
  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (method === 'GET' && productMatch) {
    const product = loadData('products').find(item => item.id === decodeURIComponent(productMatch[1]));
    return product ? sendJson(res, 200, product) : sendError(res, 404, 'Menu item not found.');
  }
  if (method === 'GET' && pathname === '/api/customers') {
    const user = requireRoles(req, res, ['admin']);
    if (!user) return;
    return sendJson(res, 200, loadData('customers'));
  }
  if (method === 'POST' && pathname === '/api/contact') {
    const body = await readJson(req);
    const name = cleanString(body.name, 100);
    const email = cleanString(body.email, 254).toLowerCase();
    const subject = cleanString(body.subject, 160);
    const message = cleanString(body.message, 5000);
    if (!name || !email || !subject || !message) return sendError(res, 400, 'Name, email, subject, and message are all required.');
    if (!validEmail(email)) return sendError(res, 400, 'Enter a valid email address.');
    if (message.length < 5) return sendError(res, 400, 'Please provide a little more detail in your message.');
    const contacts = loadData('contacts');
    const record = { id: id(), name, email, subject, message, createdAt: now(), readAt: null, deletedAt: null };
    contacts.unshift(record);
    writeData('contacts', contacts);
    return sendJson(res, 201, { success: true, message: 'Your message has been sent to Sebby’s Cafe.', reference: record.id });
  }
  if (method === 'POST' && pathname === '/api/newsletter') {
    const body = await readJson(req);
    const email = cleanString(body.email, 254).toLowerCase();
    if (!email || !validEmail(email)) return sendError(res, 400, 'Enter a valid email address.');
    const subscribers = loadData('newsletter');
    const existing = subscribers.find(item => item.email.toLowerCase() === email);
    if (existing) return sendJson(res, 200, { success: true, alreadySubscribed: true, message: 'This email is already on Sebby’s subscription list.' });
    subscribers.unshift({ id: id(), email, subscribedAt: now() });
    writeData('newsletter', subscribers);
    return sendJson(res, 201, { success: true, message: 'You’re on the list! Thanks for subscribing.' });
  }
  if (method === 'POST' && pathname === '/api/orders') {
    const body = await readJson(req);
    const customerName = cleanString(body.customerName, 100);
    if (customerName.length < 2) return sendError(res, 400, 'Please enter the name for this order.');
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 80) return sendError(res, 400, 'Your cart must contain at least one menu item.');
    const products = loadData('products');
    const lines = [];
    for (const requested of body.items) {
      const productId = cleanString(requested.productId, 100);
      const quantity = Number(requested.quantity ?? requested.qty);
      const product = products.find(item => item.id === productId);
      if (!product || !product.available) return sendError(res, 400, `“${product?.name || 'A menu item'}” is currently unavailable. Please update your cart.`);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return sendError(res, 400, 'Item quantity must be between 1 and 99.');
      let variant = null;
      if (Array.isArray(product.variants) && product.variants.length) {
        variant = product.variants.find(v => v.id === requested.variantId);
        if (!variant) return sendError(res, 400, `Choose a valid flavor for ${product.name}.`);
      } else if (requested.variantId) {
        return sendError(res, 400, `The selected flavor is not valid for ${product.name}.`);
      }
      const name = variant ? `${product.name} (${variant.name})` : product.name;
      const unitPrice = variant ? variant.price : product.price;
      lines.push({ productId: product.id, variantId: variant?.id || null, name, unitPrice, quantity, subtotal: unitPrice * quantity });
    }
    const orders = loadData('orders');
    const businessDate = todayManila();
    const datePart = businessDate.replace(/-/g, '');
    const dailyOrders = orders.filter(order => {
      const existingDate = order.businessDate || (order.createdAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(order.createdAt)) : '');
      return existingDate === businessDate;
    });
    const nextSequence = dailyOrders.reduce((maximum, order) => {
      const stored = Number(order.dailySequence || 0);
      const parsed = String(order.number || '').match(/^(\d{8})-(\d{3,})$/);
      const sequence = stored || (parsed ? Number(parsed[2]) : 0);
      return Math.max(maximum, Number.isFinite(sequence) ? sequence : 0);
    }, 0) + 1;
    const number = `${datePart}-${String(nextSequence).padStart(3, '0')}`;
    const order = { id: id(), number, businessDate, dailySequence: nextSequence, customerName, items: lines, total: lines.reduce((sum, line) => sum + line.subtotal, 0), status: 'pending', paymentStatus: 'unpaid', archivedFromQueueAt: null, createdAt: now(), updatedAt: now() };
    orders.unshift(order);
    writeData('orders', orders);
    return sendJson(res, 201, { success: true, order: { id: order.id, number: order.number, customerName, items: order.items, total: order.total, status: order.status, paymentStatus: order.paymentStatus, createdAt: order.createdAt } });
  }
  if (method === 'GET' && pathname === '/api/promotions/active') {
    const today = todayManila();
    const promos = loadData('promotions').filter(p => p.startDate <= today && p.endDate >= today);
    return sendJson(res, 200, promos);
  }

  // Admin-managed categories are persisted separately so custom categories survive restarts.
  if (pathname === '/api/admin/categories' && method === 'GET') {
    if (!requireRoles(req, res, ['admin'])) return;
    const saved = loadData('categories');
    const productCategories = loadData('products').map(product => cleanString(product.category, 40)).filter(Boolean);
    const categories = Array.from(new Set([...saved.map(item => typeof item === 'string' ? item : item.name), ...productCategories].filter(Boolean)));
    return sendJson(res, 200, categories.sort((a, b) => a.localeCompare(b)));
  }
  if (pathname === '/api/admin/categories' && method === 'POST') {
    if (!requireRoles(req, res, ['admin'])) return;
    const body = await readJson(req);
    const name = cleanString(body.name, 40);
    if (!name) return sendError(res, 400, 'Enter a category name.');
    const categories = loadData('categories').map(item => typeof item === 'string' ? item : item.name).filter(Boolean);
    const products = loadData('products');
    const exists = [...categories, ...products.map(product => product.category)].some(item => String(item).toLowerCase() === name.toLowerCase());
    if (exists) return sendError(res, 409, 'That category already exists.');
    categories.push(name);
    writeData('categories', Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b)));
    return sendJson(res, 201, { success: true, category: name, categories: Array.from(new Set([...categories, ...products.map(product => product.category).filter(Boolean)])).sort((a, b) => a.localeCompare(b)) });
  }

  // Menu management is admin-only.
  if (pathname === '/api/admin/products' && method === 'GET') {
    if (!requireRoles(req, res, ['admin'])) return;
    return sendJson(res, 200, loadData('products'));
  }
  if (pathname === '/api/admin/products' && method === 'POST') {
    if (!requireRoles(req, res, ['admin'])) return;
    const body = await readJson(req);
    const products = loadData('products');
    const product = normalizeProduct(body);
    if (products.some(p => p.id === product.id)) return sendError(res, 409, 'A menu item with this ID already exists.');
    products.push(product);
    writeData('products', products);
    return sendJson(res, 201, { success: true, product });
  }
  const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (adminProductMatch && (method === 'PUT' || method === 'DELETE')) {
    if (!requireRoles(req, res, ['admin'])) return;
    const productId = decodeURIComponent(adminProductMatch[1]);
    const products = loadData('products');
    const index = products.findIndex(p => p.id === productId);
    if (index < 0) return sendError(res, 404, 'Menu item not found.');
    if (method === 'DELETE') {
      products.splice(index, 1);
      writeData('products', products);
      const promos = loadData('promotions').map(p => ({ ...p, productIds: (p.productIds || []).filter(pid => pid !== productId) }));
      writeData('promotions', promos);
      return sendJson(res, 200, { success: true });
    }
    const body = await readJson(req);
    const updated = normalizeProduct(body, products[index]);
    if (updated.id !== productId && products.some(p => p.id === updated.id)) return sendError(res, 409, 'Another menu item already uses this ID.');
    products[index] = updated;
    writeData('products', products);
    return sendJson(res, 200, { success: true, product: updated });
  }
  if (pathname === '/api/admin/upload' && method === 'POST') {
    if (!requireRoles(req, res, ['admin'])) return;
    const upload = await readImageUpload(req);
    return sendJson(res, 201, { success: true, ...upload });
  }

  // Promotion management; public visitors only get promotions within their configured date window.
  if (pathname === '/api/admin/promotions' && method === 'GET') {
    if (!requireRoles(req, res, ['admin'])) return;
    return sendJson(res, 200, loadData('promotions').sort((a, b) => a.startDate.localeCompare(b.startDate)));
  }
  if (pathname === '/api/admin/promotions' && method === 'POST') {
    if (!requireRoles(req, res, ['admin'])) return;
    const body = await readJson(req);
    const promos = loadData('promotions');
    const promo = normalizePromotion(body);
    if (promos.some(p => p.id === promo.id)) return sendError(res, 409, 'A promotion with this ID already exists.');
    promos.push(promo);
    writeData('promotions', promos);
    return sendJson(res, 201, { success: true, promotion: promo });
  }
  const promotionMatch = pathname.match(/^\/api\/admin\/promotions\/([^/]+)$/);
  if (promotionMatch && (method === 'PUT' || method === 'DELETE')) {
    if (!requireRoles(req, res, ['admin'])) return;
    const promoId = decodeURIComponent(promotionMatch[1]);
    const promos = loadData('promotions');
    const index = promos.findIndex(p => p.id === promoId);
    if (index < 0) return sendError(res, 404, 'Promotion not found.');
    if (method === 'DELETE') {
      promos.splice(index, 1);
      writeData('promotions', promos);
      return sendJson(res, 200, { success: true });
    }
    const body = await readJson(req);
    const promo = normalizePromotion(body, promos[index]);
    if (promo.id !== promoId && promos.some(p => p.id === promo.id)) return sendError(res, 409, 'Another promotion already uses this ID.');
    promos[index] = promo;
    writeData('promotions', promos);
    return sendJson(res, 200, { success: true, promotion: promo });
  }

  if (pathname === '/api/admin/newsletter' && method === 'GET') {
    if (!requireRoles(req, res, ['admin'])) return;
    return sendJson(res, 200, loadData('newsletter').sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt)));
  }
  if (pathname === '/api/admin/contacts' && method === 'GET') {
    if (!requireRoles(req, res, ['admin'])) return;
    const view = url.searchParams.get('view') === 'trash' ? 'trash' : 'inbox';
    const messages = loadData('contacts').filter(m => view === 'trash' ? !!m.deletedAt : !m.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sendJson(res, 200, messages);
  }
  const contactMatch = pathname.match(/^\/api\/admin\/contacts\/([^/]+)(\/forever)?$/);
  if (contactMatch) {
    if (!requireRoles(req, res, ['admin'])) return;
    const contactId = decodeURIComponent(contactMatch[1]);
    const forever = !!contactMatch[2];
    const contacts = loadData('contacts');
    const index = contacts.findIndex(m => m.id === contactId);
    if (index < 0) return sendError(res, 404, 'Contact message not found.');
    if (method === 'DELETE' && forever) {
      contacts.splice(index, 1);
      writeData('contacts', contacts);
      return sendJson(res, 200, { success: true, permanentlyDeleted: true });
    }
    if (method === 'DELETE' && !forever) {
      contacts[index].deletedAt = now();
      writeData('contacts', contacts);
      return sendJson(res, 200, { success: true, movedToTrash: true });
    }
    if (method === 'PATCH' && !forever) {
      const body = await readJson(req);
      if (body.action === 'markRead') contacts[index].readAt = contacts[index].readAt || now();
      else if (body.action === 'markUnread') contacts[index].readAt = null;
      else if (body.action === 'restore') contacts[index].deletedAt = null;
      else return sendError(res, 400, 'Unknown contact-message action.');
      writeData('contacts', contacts);
      return sendJson(res, 200, { success: true, contact: contacts[index] });
    }
    return sendError(res, 405, 'Method not allowed.');
  }
  if (pathname === '/api/admin/summary' && method === 'GET') {
    if (!requireRoles(req, res, ['admin'])) return;
    const products = loadData('products');
    const contacts = loadData('contacts');
    const subscribers = loadData('newsletter');
    const orders = loadData('orders');
    const promotions = loadData('promotions');
    return sendJson(res, 200, { products: products.length, availableProducts: products.filter(p => p.available).length, unreadContacts: contacts.filter(m => !m.readAt && !m.deletedAt).length, subscribers: subscribers.length, pendingOrders: orders.filter(o => o.status === 'pending').length, promotions: promotions.filter(p => p.startDate <= todayManila() && p.endDate >= todayManila()).length });
  }

  if (pathname === '/api/admin/orders' && method === 'GET') {
    if (!requireRoles(req, res, ['admin'])) return;
    const orders = loadData('orders').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const today = todayManila();
    const todaysOrders = orders.filter(order => order.businessDate === today);
    const todaysSales = todaysOrders.filter(order => order.paymentStatus === 'paid' || order.status === 'paid' || order.status === 'received').reduce((sum, order) => sum + Number(order.total || 0), 0);
    return sendJson(res, 200, { orders, summary: { totalOrders: orders.length, todayOrders: todaysOrders.length, todayPaidSales: todaysSales, archivedOrders: orders.filter(order => !!order.archivedFromQueueAt).length } });
  }
  if (pathname === '/api/barista/orders' && method === 'GET') {
    if (!requireRoles(req, res, ['barista', 'admin'])) return;
    const status = url.searchParams.get('status');
    let orders = loadData('orders').filter(order => !order.archivedFromQueueAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (status && ['pending', 'paid', 'received'].includes(status)) orders = orders.filter(o => o.status === status);
    return sendJson(res, 200, orders);
  }
  const baristaArchiveMatch = pathname.match(/^\/api\/barista\/orders\/([^/]+)\/archive$/);
  if (baristaArchiveMatch && method === 'PATCH') {
    if (!requireRoles(req, res, ['barista', 'admin'])) return;
    const orderId = decodeURIComponent(baristaArchiveMatch[1]);
    const orders = loadData('orders');
    const order = orders.find(item => item.id === orderId || item.number === orderId);
    if (!order) return sendError(res, 404, 'Order not found.');
    if (order.status !== 'received') return sendError(res, 409, 'Only received orders can be removed from the active queue.');
    if (!order.archivedFromQueueAt) order.archivedFromQueueAt = now();
    order.updatedAt = now();
    writeData('orders', orders);
    return sendJson(res, 200, { success: true, archived: true, order });
  }
  const baristaOrderMatch = pathname.match(/^\/api\/barista\/orders\/([^/]+)\/status$/);
  if (baristaOrderMatch && method === 'PATCH') {
    if (!requireRoles(req, res, ['barista', 'admin'])) return;
    const orderId = decodeURIComponent(baristaOrderMatch[1]);
    const body = await readJson(req);
    if (!['paid', 'received'].includes(body.status)) return sendError(res, 400, 'Order status must be paid or received.');
    const orders = loadData('orders');
    const order = orders.find(o => o.id === orderId || o.number === orderId);
    if (!order) return sendError(res, 404, 'Order not found.');
    if (body.status === 'paid' && order.status !== 'pending') return sendError(res, 409, 'Only pending orders can be marked as paid.');
    if (body.status === 'received' && order.status !== 'paid') return sendError(res, 409, 'An order must be marked paid before it can be marked received.');
    order.status = body.status;
    if (body.status === 'paid') { order.paymentStatus = 'paid'; order.paidAt = now(); }
    if (body.status === 'received') order.receivedAt = now();
    order.updatedAt = now();
    writeData('orders', orders);
    return sendJson(res, 200, { success: true, order });
  }
  return sendError(res, 404, 'API endpoint not found.');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (_) { return sendError(res, 400, 'Malformed URL path.'); }
  if (pathname === '/') pathname = '/index.html';
  const resolved = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) return sendError(res, 403, 'Forbidden.');
  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) return sendError(res, 404, 'Page or asset not found.');
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // Never keep executable UI bundles fresh for an hour: that can mix old JS/CSS
      // with newer HTML/backend routes and leave staff dashboards apparently stuck.
      'Cache-Control': ['.html', '.css', '.js', '.json'].includes(ext) ? 'no-cache, max-age=0, must-revalidate' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(resolved).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE, HEAD');
        return sendError(res, 405, 'Method not allowed.');
      }
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return sendError(res, 405, 'Method not allowed.'); }
    return serveStatic(req, res, url);
  } catch (error) {
    if (!res.headersSent) return sendError(res, statusForException(error), statusForException(error) === 500 ? 'Unexpected server error.' : error.message);
    res.destroy();
    console.error('Request failed after response began:', error);
  }
});

// Expired sessions and stale rate-limit entries are cleared during normal runtime.
setInterval(() => {
  const time = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= time) sessions.delete(token);
  for (const [ip, attempt] of loginAttempts) if (attempt.resetAt <= time) loginAttempts.delete(ip);
}, 10 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sebby's Cafe website and API running at http://localhost:${PORT}`);
    if (NODE_ENV !== 'production') console.log('Demo sign-in: admin / SebbysAdmin2026!  |  barista / SebbysBarista2026!');
  });
}
module.exports = { server };
