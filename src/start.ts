import { createStart } from "@tanstack/react-start";

// No app-server logic: all backend work runs in the database (Netlify-compatible).
export const startInstance = createStart(() => ({}));
