const express = require("express");
const multer = require("multer");
const session = require("express-session");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const SESSION_SECRET = process.env.SESSION_SECRET || "mvj-dev-secret-change-in-prod";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 }, // 12 hours
}));

function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.redirect("/admin/login");
}

// ---------- Public site ----------
app.get("/", async (req, res) => {
    const { data: vehicles, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) return res.status(500).send("Error loading vehicles: " + error.message);
    res.send(renderPublicPage(vehicles || []));
});

// ---------- Admin: login ----------
app.get("/admin/login", (req, res) => res.send(renderLoginPage()));

app.post("/admin/login", (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        req.session.loggedIn = true;
        return res.redirect("/admin");
    }
    res.send(renderLoginPage("Wrong password."));
});

app.post("/admin/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
});

// ---------- Admin: dashboard ----------
app.get("/admin", requireAuth, async (req, res) => {
    const { data: vehicles, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) return res.status(500).send("Error: " + error.message);
    res.send(renderAdminPage(vehicles || []));
});

app.post("/admin/vehicles", requireAuth, upload.single("photo"), async (req, res) => {
    try {
        let photo_url = null;
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
            const { error: upErr } = await supabase.storage
                .from("vehicle-photos")
                .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from("vehicle-photos").getPublicUrl(fileName);
            photo_url = urlData.publicUrl;
        }
        const { year, make, model, price, mileage, description } = req.body;
        const { error: insErr } = await supabase.from("vehicles").insert({
            year: year ? parseInt(year) : null,
            make, model,
            price: price ? parseFloat(price) : null,
            mileage: mileage ? parseInt(mileage) : null,
            description, photo_url,
        });
        if (insErr) throw insErr;
        res.redirect("/admin");
    } catch (e) {
        res.status(500).send("Error adding vehicle: " + e.message);
    }
});

app.post("/admin/vehicles/:id/delete", requireAuth, async (req, res) => {
    const { error } = await supabase.from("vehicles").delete().eq("id", req.params.id);
    if (error) return res.status(500).send("Error: " + error.message);
    res.redirect("/admin");
});

app.post("/admin/vehicles/:id/edit", requireAuth, upload.single("photo"), async (req, res) => {
    try {
        const { year, make, model, price, mileage, description } = req.body;
        const update = {
            year: year ? parseInt(year) : null,
            make, model,
            price: price ? parseFloat(price) : null,
            mileage: mileage ? parseInt(mileage) : null,
            description,
        };
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
            const { error: upErr } = await supabase.storage
                .from("vehicle-photos")
                .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from("vehicle-photos").getPublicUrl(fileName);
            update.photo_url = urlData.publicUrl;
        }
        const { error } = await supabase.from("vehicles").update(update).eq("id", req.params.id);
        if (error) throw error;
        res.redirect("/admin");
    } catch (e) {
        res.status(500).send("Error editing vehicle: " + e.message);
    }
});

// ---------- Templates ----------
function layout(title, body) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root{--navy:#0f2b46;--gold:#c9a24b;--bg:#f6f7f8;--ink:#1c2531;--card:#fff;--border:#e3e6e9}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink)}
  header{background:var(--navy);color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
  header h1{margin:0;font-size:22px;letter-spacing:.02em}
  header h1 span{color:var(--gold)}
  header a{color:#cfe0f0;text-decoration:none;font-size:14px}
  .wrap{max-width:1100px;margin:0 auto;padding:28px 20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .card img{width:100%;height:170px;object-fit:cover;background:#ddd}
  .card .noimg{width:100%;height:170px;background:#e4e7ea;display:flex;align-items:center;justify-content:center;color:#9aa3ac;font-size:13px}
  .card-body{padding:14px 16px}
  .card-body h3{margin:0 0 4px;font-size:17px}
  .price{color:var(--navy);font-weight:700;font-size:16px;margin:4px 0}
  .meta{color:#6b7680;font-size:13px;margin-bottom:8px}
  .desc{font-size:14px;color:#44505c;line-height:1.4}
  .empty{text-align:center;padding:60px 20px;color:#8a93a0}
  form.panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:28px}
  form.panel h2{margin-top:0;font-size:18px}
  label{display:block;font-size:13px;color:#555;margin:10px 0 4px}
  input[type=text],input[type=number],textarea{width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px}
  textarea{resize:vertical;min-height:60px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  button{background:var(--navy);color:#fff;border:none;padding:10px 18px;border-radius:6px;font-size:14px;cursor:pointer;margin-top:14px}
  button.danger{background:#a33}
  .admin-row{display:flex;gap:16px;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:10px}
  .admin-row img{width:70px;height:52px;object-fit:cover;border-radius:6px;background:#ddd}
  .admin-row .info{flex:1}
  .login-wrap{max-width:360px;margin:80px auto;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px}
  .error{color:#a33;font-size:13px;margin-top:8px}
</style>
</head><body>${body}</body></html>`;
}

function vehicleCard(v) {
    const img = v.photo_url
        ? `<img src="${v.photo_url}" alt="${v.year || ""} ${v.make || ""} ${v.model || ""}">`
        : `<div class="noimg">No photo yet</div>`;
    const title = [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
    const price = v.price ? `$${Number(v.price).toLocaleString()}` : "Call for price";
    const mileage = v.mileage ? `${Number(v.mileage).toLocaleString()} mi` : "";
    return `<div class="card">
      ${img}
      <div class="card-body">
        <h3>${title}</h3>
        <div class="price">${price}</div>
        <div class="meta">${mileage}</div>
        <div class="desc">${v.description || ""}</div>
      </div>
    </div>`;
}

function renderPublicPage(vehicles) {
    const cards = vehicles.length
        ? `<div class="grid">${vehicles.map(vehicleCard).join("")}</div>`
        : `<div class="empty">New inventory coming soon — check back shortly.</div>`;
    return layout("MVJ Auto Sales", `
      <header><h1>MVJ <span>Auto Sales</span></h1></header>
      <div class="wrap">${cards}</div>
    `);
}

function renderLoginPage(error) {
    return layout("Admin Login — MVJ Auto Sales", `
      <div class="login-wrap">
        <h2>Admin Login</h2>
        <form method="POST" action="/admin/login">
          <label>Password</label>
          <input type="password" name="password" autofocus>
          <button type="submit">Log In</button>
          ${error ? `<div class="error">${error}</div>` : ""}
        </form>
      </div>
    `);
}

function adminRow(v) {
    const img = v.photo_url ? `<img src="${v.photo_url}">` : `<div class="noimg" style="width:70px;height:52px;font-size:10px">No photo</div>`;
    const title = [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
    return `<div class="admin-row">
      ${img}
      <div class="info">
        <b>${title}</b> — $${v.price ? Number(v.price).toLocaleString() : "?"} — ${v.mileage ? Number(v.mileage).toLocaleString() + " mi" : ""}
        <div style="font-size:13px;color:#777">${v.description || ""}</div>
      </div>
      <form method="POST" action="/admin/vehicles/${v.id}/delete" onsubmit="return confirm('Delete this vehicle?')">
        <button type="submit" class="danger">Delete</button>
      </form>
    </div>`;
}

function renderAdminPage(vehicles) {
    return layout("Admin — MVJ Auto Sales", `
      <header>
        <h1>MVJ <span>Admin</span></h1>
        <div>
          <a href="/" target="_blank" style="margin-right:16px">View Live Site</a>
          <form method="POST" action="/admin/logout" style="display:inline"><button type="submit" style="margin:0">Log Out</button></form>
        </div>
      </header>
      <div class="wrap">
        <form class="panel" method="POST" action="/admin/vehicles" enctype="multipart/form-data">
          <h2>Add a Vehicle</h2>
          <div class="row">
            <div><label>Year</label><input type="number" name="year"></div>
            <div><label>Price ($)</label><input type="number" name="price" step="1"></div>
          </div>
          <div class="row">
            <div><label>Make</label><input type="text" name="make"></div>
            <div><label>Model</label><input type="text" name="model"></div>
          </div>
          <label>Mileage</label><input type="number" name="mileage">
          <label>Description</label><textarea name="description"></textarea>
          <label>Photo</label><input type="file" name="photo" accept="image/*">
          <button type="submit">Add Vehicle</button>
        </form>

        <h2>Current Inventory (${vehicles.length})</h2>
        ${vehicles.map(adminRow).join("") || "<p>No vehicles yet — add one above.</p>"}
      </div>
    `);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MVJ Auto Sales running on port ${PORT}`));
