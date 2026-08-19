import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { installStorage } from "./lib/storage.js";
import "./index.css";

async function bootstrap() {
  await installStorage();
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}

bootstrap();
