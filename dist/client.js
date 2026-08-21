window.__ModuleLoader__.load({
	id: "@tsuuanmi/internet",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react = require("react");
var responseStyle = { minWidth: 0, width: "100%" };
var statusStyle = { ...responseStyle, whiteSpace: "pre-wrap" };
function InternetCommandResponse({ node }) {
  if (node.outcome === null) {
    return (0, import_react.createElement)("div", { style: statusStyle }, "Asking ChatGPT\u2026");
  }
  const text = node.outcome.text ?? (node.outcome.kind === "error" ? "/internet failed." : "ChatGPT returned no text.");
  if (node.outcome.kind === "error") {
    return (0, import_react.createElement)("div", { style: statusStyle, role: "alert" }, text);
  }
  return (0, import_react.createElement)("div", { style: responseStyle }, (0, import_react.createElement)(import_dsh_client_ui_primitives.MarkdownText, { text, streaming: false }));
}
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject(
    "conversation.chat.commandview",
    () => ctx.slots.register({ name: "conversation.chat.commandview", key: "internet" }, InternetCommandResponse)
  );
}

		return module.exports;
	}
});
