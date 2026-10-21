const express = require("express");
const mongoose = require("mongoose");

const User = mongoose.model("User", new mongoose.Schema({ email: String, password: String }));
const Note = mongoose.model("Note", new mongoose.Schema({ userId: String, body: String }));
const router = express.Router();

// BAAS-03: {"password": {"$ne": null}} logs in as anyone
router.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  res.json({ ok: !!user });
});

// BAAS-03: the raw body is the filter
router.post("/notes/search", async (req, res) => {
  const filter = req.body;
  res.json(await Note.find(filter));
});

// OK: values coerced to scalars
router.post("/notes/by-email", async (req, res) => {
  res.json(await User.findOne({ email: String(req.body.email) }));
});

module.exports = router;
