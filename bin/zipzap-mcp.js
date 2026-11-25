#!/usr/bin/env node
import("../dist/index.js").catch((err) => {
  console.error("Failed to run zipzap-mcp server:", err);
  process.exit(1);
});
