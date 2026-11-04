import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request context: { learning: true } routes every model to its learning_* twin. */
export const learningContext = new AsyncLocalStorage();
export const inLearning = () => learningContext.getStore()?.learning === true;
export const runInLearning = (fn) => learningContext.run({ learning: true }, fn);
