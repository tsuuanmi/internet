export function workflowResponseProvenanceAllowed(policy, provenance) {
    switch (policy) {
        case "USER_AUTHORITY":
            return provenance === "user_explicit";
        case "LOCAL_AGENT_INPUT":
        case "USER_OR_LOCAL":
            return provenance === "user_explicit" || provenance === "local_agent";
    }
}
//# sourceMappingURL=response-policy.js.map