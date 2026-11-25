import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { createBearerAuth } from "../src/auth.js";

function mockRes() {
  const state: {
    statusCode?: number;
    body?: unknown;
  } = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
  return { res: res as unknown as Response, state };
}

describe("bearer auth", () => {
  it("rejects missing header", () => {
    const auth = createBearerAuth("secret");
    const { res, state } = mockRes();
    let called = false;
    auth({ headers: {} } as Request, res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(state.statusCode, 401);
  });

  it("rejects wrong token", () => {
    const auth = createBearerAuth("secret");
    const { res, state } = mockRes();
    let called = false;
    auth(
      { headers: { authorization: "Bearer nope" } } as Request,
      res,
      () => {
        called = true;
      }
    );
    assert.equal(called, false);
    assert.equal(state.statusCode, 403);
  });

  it("accepts matching token", () => {
    const auth = createBearerAuth("secret");
    const { res } = mockRes();
    let called = false;
    auth(
      { headers: { authorization: "Bearer secret" } } as Request,
      res,
      () => {
        called = true;
      }
    );
    assert.equal(called, true);
  });
});
