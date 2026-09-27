export const SOFTWARE_USER_FEEDBACK_SCHEMA = {
    id: "workflow.software.user-feedback",
    version: "1",
};
export const SOFTWARE_USER_FEEDBACK_VERDICTS = ["ACCEPTED", "CHANGES_REQUESTED"];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseSoftwareUserFeedbackInput(value) {
    if (!isRecord(value))
        throw new Error("invalid software User feedback payload");
    if (typeof value.verdict !== "string" ||
        !SOFTWARE_USER_FEEDBACK_VERDICTS.includes(value.verdict)) {
        throw new Error("invalid software User feedback verdict");
    }
    if (typeof value.raw !== "string" || value.raw.trim() === "" || value.raw.includes("\0")) {
        throw new Error("invalid software User feedback raw source");
    }
    const targetDelivery = value.targetDelivery;
    const targetVersion = value.targetVersion;
    if ((targetDelivery === undefined) !== (targetVersion === undefined)) {
        throw new Error("software User feedback target Delivery and version must be provided together");
    }
    if (targetDelivery !== undefined) {
        if (!isRecord(targetDelivery) ||
            typeof targetDelivery.runId !== "string" ||
            !/^[0-9a-f]{32}$/u.test(targetDelivery.runId) ||
            typeof targetDelivery.artifactId !== "string" ||
            !/^[0-9a-f]{64}$/u.test(targetDelivery.artifactId) ||
            typeof targetVersion !== "string" ||
            targetVersion.trim() === "") {
            throw new Error("invalid software User feedback target Delivery");
        }
    }
    return value;
}
//# sourceMappingURL=feedback-contract.js.map