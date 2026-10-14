require("dotenv").config();

const path = require("path");
const cors = require("cors");
const express = require("express");
const { getState, syncState } = require("./stateService");

const app = express();
const port = Number(process.env.PORT || 8097);
const publicDir = path.resolve(__dirname, "..");

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(publicDir, {
  extensions: ["html"],
  setHeaders(response, filePath) {
    if (filePath.endsWith(".html")) {
      response.setHeader("Cache-Control", "no-store");
    }
  }
}));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "Sistema de Gestion de Ayudas" });
});

app.get("/api/state", async (_request, response, next) => {
  try {
    response.json(await getState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/state", async (request, response, next) => {
  try {
    response.json(await syncState(request.body));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status || 500).json({
    ok: false,
    error: error.message || "Error interno del servidor"
  });
});

app.listen(port, () => {
  console.log(`Sistema disponible en http://127.0.0.1:${port}`);
});
