import { createStart } from "@tanstack/react-start";
import { attachExternalAuth } from "@/lib/externalAuth";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachExternalAuth],
}));
