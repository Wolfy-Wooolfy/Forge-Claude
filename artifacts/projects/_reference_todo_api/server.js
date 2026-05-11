"use strict";

const express = require("express");
const { createDb } = require("./db");
const { createTodosRouter } = require("./routes/todos");

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = express();
app.use(express.json());

const db = createDb();
app.use("/todos", createTodosRouter(db));

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

const server = app.listen(PORT, () => {
  console.log("Reference TODO API listening on port " + PORT);
});

// Graceful shutdown for L5b harness
process.on("SIGTERM", () => {
  server.close(() => { db.close(); process.exit(0); });
});
process.on("SIGINT", () => {
  server.close(() => { db.close(); process.exit(0); });
});

module.exports = { app, server };
