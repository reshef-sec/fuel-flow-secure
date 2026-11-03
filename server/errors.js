export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const forbidden = (msg = "אין הרשאה לפעולה זו") => new HttpError(403, msg, "forbidden");
export const badRequest = (msg) => new HttpError(400, msg, "bad_request");
export const unauthorized = (msg = "יש להתחבר מחדש") => new HttpError(401, msg, "unauthorized");

/** Wraps an async Express handler so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
