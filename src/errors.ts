/**
 * @module Erros
 * @description Errors for Runnify
 */
export class IteratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IterateError";
  }
}

export class RunnableAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnableAbortError";
  }
}
