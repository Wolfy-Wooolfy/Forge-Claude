"use strict";
const http = require("http");
let notes = [];
let counter = 1000;
const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/notes(?:\/([^/]+))?$/);
  if (req.method === "POST" && req.url === "/notes") {
    let b = ""; req.on("data", d => b += d); req.on("end", () => {
      let body = {}; try { body = JSON.parse(b || "{}"); } catch (_) {}
      const n = Object.assign({ id: String(++counter) }, body); notes.push(n);
      res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify(n));
    }); return;
  }
  if (req.method === "GET" && m && m[1]) {
    const n = notes.find(x => x.id === m[1]);
    if (!n) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not found" })); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(n)); return;
  }
  res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "route" }));
});
server.listen(3000, () => console.log("Server is running on port 3000"));
