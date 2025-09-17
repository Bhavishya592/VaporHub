const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = 3000;

// Serve static files (frontend + csv)
app.use(express.static(__dirname));

// Multer (for handling multipart/form-data like FormData from frontend)
const upload = multer();

// Coupons file
const couponsFile = path.join(__dirname, "coupons.csv");
let coupons = fs.existsSync(couponsFile)
  ? fs.readFileSync(couponsFile, "utf8").split(/\r?\n/).filter(Boolean)
  : [];

function saveCoupons() {
  fs.writeFileSync(couponsFile, coupons.join("\n"), "utf8");
}

// Redeemed log
const redeemedLog = path.join(__dirname, "redeemed_log.csv");
if (!fs.existsSync(redeemedLog)) {
  fs.writeFileSync(redeemedLog, "email,coupon,reviewLink,timestamp\n", "utf8");
}

// Track used emails
let redeemedKeys = new Set();
if (fs.existsSync(redeemedLog)) {
  const lines = fs.readFileSync(redeemedLog, "utf8").split(/\r?\n/).slice(1);
  lines.forEach(line => {
    if (!line.trim()) return;
    const [email] = line.split(",");
    if (email) {
      redeemedKeys.add(email.trim().toLowerCase());
    }
  });
}

// Trustpilot review link pattern
const trustpilotRegex = /^https:\/\/www\.trustpilot\.com\/submitted\/review\?correlationid=[0-9a-fA-F-]{36}$/;

// Redeem endpoint (uses multer to parse FormData)
app.post("/redeem", upload.none(), (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const reviewLink = (req.body.reviewLink || "").trim();

    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }
    if (!reviewLink) {
      return res.status(400).json({ error: "Trustpilot link required" });
    }
    if (!trustpilotRegex.test(reviewLink)) {
      return res.status(400).json({ error: "Invalid Trustpilot review link" });
    }

    // Already redeemed check
    if (redeemedKeys.has(email)) {
      return res.status(400).json({ error: "Already used by this email" });
    }

    if (coupons.length === 0) {
      return res.status(400).json({ error: "No coupons left" });
    }

    const coupon = coupons.shift();
    saveCoupons();

    redeemedKeys.add(email);
    const logLine = [
      email,
      coupon,
      reviewLink,
      new Date().toISOString()
    ].join(",") + "\n";
    fs.appendFileSync(redeemedLog, logLine, "utf8");

    return res.json({ coupon, reviewLink });
  } catch (err) {
    console.error("❌ Redeem error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📥 Export redeemed log (CSV download for Excel)
app.get("/export-redeemed", (req, res) => {
  res.download(redeemedLog, "redeemed_log.csv", err => {
    if (err) {
      console.error("❌ Failed to download redeemed_log.csv:", err);
      res.status(500).send("Failed to download log");
    }
  });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ VaporHub server running at http://localhost:${PORT}`);
  console.log(`📥 Download redeemed log at: http://localhost:${PORT}/export-redeemed`);
});
