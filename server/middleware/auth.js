const jwt = require("jsonwebtoken");

function getSecret() {
  return process.env.JWT_SECRET || "shopnest-insecure-fallback";
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      sellerStatus: user.sellerStatus || "none",
    },
    getSecret(),
    { expiresIn: "12h" }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    req.user = jwt.verify(token, getSecret());
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }
    next();
  };
}

/** Approved sellers only */
function requireApprovedSeller(req, res, next) {
  if (!req.user || req.user.role !== "seller") {
    return res.status(403).json({ error: "Seller account required." });
  }
  if (req.user.sellerStatus !== "approved") {
    return res.status(403).json({ error: "Seller account is not approved yet." });
  }
  next();
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sellerStatus: user.sellerStatus || "none",
    sellerDetails: user.sellerDetails || null,
    active: user.active !== false,
    createdAt: user.createdAt,
  };
}

module.exports = {
  signToken,
  authRequired,
  requireRole,
  requireApprovedSeller,
  publicUser,
};
