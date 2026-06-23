"use strict";
const http = require("http");
let notes = [];
let idc = 1;
const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/notes(?:\/(\d+))?$/);
  if (req.method === "POST" && req.url === "/notes") {
    let b = ""; req.on("data", d => b += d); req.on("end", () => {
      let body = {}; try { body = JSON.parse(b || "{}"); } catch (_) {}
      const n = Object.assign({ id: idc++ }, body); notes.push(n);
      res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify(n));
    }); return;
  }
  if (req.method === "PUT" && m && m[1]) {
    const id = parseInt(m[1], 10); const i = notes.findIndex(n => n.id === id);
    let b = ""; req.on("data", d => b += d); req.on("end", () => {
      if (i === -1) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not found" })); return; }
      let body = {}; try { body = JSON.parse(b || "{}"); } catch (_) {}
      notes[i] = Object.assign({ id }, body);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(notes[i]));
    }); return;
  }
  if (req.method === "GET" && m && m[1]) {
    const id = parseInt(m[1], 10); const n = notes.find(x => x.id === id);
    if (!n) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not found" })); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(n)); return;
  }
  res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "route" }));
});
server.listen(3000, () => console.log("Server is running on port 3000"));
